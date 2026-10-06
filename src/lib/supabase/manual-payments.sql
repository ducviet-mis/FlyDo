-- FlyDo manual bank transfers. Run BEFORE deploying the new checkout.
-- Transactional, rerunnable; never enables a bank or rewrites legacy orders.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.payment_orders') IS NULL
     OR to_regclass('public.subscriptions') IS NULL
     OR to_regclass('public.payment_settings') IS NULL
     OR to_regclass('public.subscription_plans') IS NULL
     OR to_regclass('public.app_notifications') IS NULL
     OR to_regclass('public.learning_streak_discounts') IS NULL THEN
    RAISE EXCEPTION 'Cần schema gói, thông báo và learning-streak-rewards trước manual-payments.sql.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email_confirmed_at IS NOT NULL
    AND lower(email) IN ('vietdang293.vn@gmail.com','vietdang293@gmail.com')) THEN
    RAISE EXCEPTION 'Cần ít nhất một tài khoản ADMIN có email đã xác nhận.';
  END IF;
END $$;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS flow_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS order_code text,
  ADD COLUMN IF NOT EXISTS buyer_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS plan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS bank_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS voucher_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS discount_source text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id),
  ADD COLUMN IF NOT EXISTS result_expires_at timestamptz;

-- Replace ONLY the existing status check, not unrelated constraints.
ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('draft','pending','approved','rejected','cancelled'));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.payment_orders'::regclass AND conname='payment_orders_v1_check') THEN
    ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_v1_check CHECK (
      flow_version IN (0,1) AND (flow_version=0 OR (
        request_id IS NOT NULL AND order_code ~ '^FD[A-F0-9]{10}$'
        AND buyer_snapshot IS NOT NULL AND plan_snapshot IS NOT NULL AND bank_snapshot IS NOT NULL
        AND list_price_vnd > 0 AND discount_percent BETWEEN 0 AND 50
        AND discount_amount_vnd >= 0 AND amount_vnd = list_price_vnd-discount_amount_vnd
        AND discount_source IN ('none','referral','streak')
        AND (status NOT IN ('pending','approved','rejected') OR confirmed_at IS NOT NULL)
        AND (status <> 'approved' OR (subscription_id IS NOT NULL AND reviewed_at IS NOT NULL))
      )));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_request_unique ON public.payment_orders(user_id,request_id) WHERE flow_version=1;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_code_unique ON public.payment_orders(order_code) WHERE flow_version=1;
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_open ON public.payment_orders(user_id) WHERE flow_version=1 AND status IN ('draft','pending');
CREATE INDEX IF NOT EXISTS payment_orders_cursor_idx ON public.payment_orders(user_id,created_at DESC,id DESC);

-- A resumed order may have several retry tokens, all bound permanently to it.
CREATE TABLE IF NOT EXISTS public.payment_order_requests (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,request_id)
);
INSERT INTO public.payment_order_requests(user_id,request_id,order_id)
  SELECT user_id,request_id,id FROM public.payment_orders WHERE flow_version=1
  ON CONFLICT(user_id,request_id) DO NOTHING;
ALTER TABLE public.payment_order_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_order_id uuid REFERENCES public.payment_orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_payment_order_unique ON public.subscriptions(payment_order_id) WHERE payment_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('created','confirmed','cancelled','approved','rejected','reply')),
  body text NOT NULL DEFAULT '' CHECK(length(body)<=1000),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_order_events_order_idx ON public.payment_order_events(order_id,created_at,id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_order_events_once ON public.payment_order_events(order_id,event_type) WHERE event_type<>'reply';
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Table REVOKE alone does not remove historic column-level grants.
REVOKE ALL ON public.payment_orders,public.payment_order_events,public.payment_order_requests FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.subscriptions FROM PUBLIC,anon,authenticated;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name IN ('payment_orders','payment_order_events','payment_order_requests','subscriptions')
    AND grantee IN ('PUBLIC','anon','authenticated')
    AND (table_name <> 'subscriptions' OR privilege_type <> 'SELECT')
  LOOP
    EXECUTE format('REVOKE %s (%I) ON public.%I FROM %s',r.privilege_type,r.column_name,r.table_name,
      CASE WHEN r.grantee='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS consume_learning_streak_discount_trigger ON public.payment_orders;
DO $$ BEGIN
  IF to_regprocedure('public.create_payment_order(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.create_payment_order(text) FROM PUBLIC,anon,authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.payment_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL
    AND lower(email) IN ('vietdang293.vn@gmail.com','vietdang293@gmail.com'));
$$;
CREATE OR REPLACE FUNCTION public.payment_error(p_code text,p_message text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('success',false,'code',p_code,'message',p_message);
$$;
CREATE OR REPLACE FUNCTION public.payment_order_dto(p_order public.payment_orders,p_admin boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object(
    'id',p_order.id,'flow_version',p_order.flow_version,'order_code',p_order.order_code,'plan_code',p_order.plan_code,
    'status',p_order.status,'created_at',p_order.created_at,'confirmed_at',p_order.confirmed_at,'reviewed_at',p_order.reviewed_at,
    'transfer_code',p_order.transfer_code,'amount_vnd',p_order.amount_vnd,'list_price_vnd',p_order.list_price_vnd,
    'discount_percent',p_order.discount_percent,'discount_amount_vnd',p_order.discount_amount_vnd,'discount_source',p_order.discount_source,
    'buyer_snapshot',p_order.buyer_snapshot,'plan_snapshot',p_order.plan_snapshot,'bank_snapshot',p_order.bank_snapshot,
    'subscription_id',p_order.subscription_id,'result_expires_at',p_order.result_expires_at,'admin_note',p_order.admin_note
  ) || CASE WHEN p_admin THEN jsonb_build_object('user_id',p_order.user_id,'reviewed_by',p_order.reviewed_by) ELSE '{}'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION public.payment_detail(p_id uuid,p_admin boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('success',true,'order',public.payment_order_dto(o,p_admin),
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'body',e.body,'created_at',e.created_at)
      || CASE WHEN p_admin THEN jsonb_build_object('actor_id',e.actor_id) ELSE '{}'::jsonb END ORDER BY e.created_at,e.id)
      FROM public.payment_order_events e WHERE e.order_id=o.id),'[]'::jsonb)) FROM public.payment_orders o WHERE o.id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_my_payment_order(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF auth.uid() IS NULL THEN RETURN public.payment_error('AUTH','Vui lòng đăng nhập lại.'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_orders WHERE id=p_order_id AND user_id=auth.uid()) THEN
    RETURN public.payment_error('NOT_FOUND','Không tìm thấy đơn trong tài khoản của bạn.'); END IF;
  RETURN public.payment_detail(p_order_id,false);
END $$;
CREATE OR REPLACE FUNCTION public.admin_get_payment_order(p_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF NOT public.payment_is_admin() THEN RETURN public.payment_error('FORBIDDEN','Chỉ ADMIN được xem yêu cầu thanh toán.'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_orders WHERE id=p_order_id) THEN RETURN public.payment_error('NOT_FOUND','Không tìm thấy đơn.'); END IF;
  RETURN public.payment_detail(p_order_id,true);
END $$;

CREATE OR REPLACE FUNCTION public.prepare_payment_order(p_plan_code text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_profile public.profiles; v_plan public.subscription_plans; v_bank public.payment_settings;
  v_order public.payment_orders; v_voucher public.learning_streak_discounts;
  v_name text; v_phone text; v_ascii text; v_email text; v_code text; v_id uuid;
  v_percent integer:=0; v_discount integer; v_source text:='none'; v_try integer; v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN public.payment_error('AUTH','Vui lòng đăng nhập lại.'); END IF;
  IF p_request_id IS NULL OR p_plan_code IS NULL OR p_plan_code NOT IN
    ('flymax_monthly','flymax_quarterly','flymax_half_yearly','flymax_yearly','flyinfinity') THEN
    RETURN public.payment_error('PLAN','Gói thanh toán không hợp lệ.'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN public.payment_error('PROFILE','Chưa tìm thấy hồ sơ tài khoản.'); END IF;
  SELECT o.* INTO v_order FROM public.payment_orders o JOIN public.payment_order_requests r ON r.order_id=o.id
    WHERE r.user_id=v_uid AND r.request_id=p_request_id AND o.user_id=v_uid AND o.flow_version=1;
  IF FOUND THEN RETURN public.payment_detail(v_order.id); END IF;
  SELECT * INTO v_order FROM public.payment_orders WHERE user_id=v_uid AND flow_version=1 AND status IN ('draft','pending');
  IF FOUND THEN
    INSERT INTO public.payment_order_requests(user_id,request_id,order_id) VALUES(v_uid,p_request_id,v_order.id)
      ON CONFLICT(user_id,request_id) DO NOTHING;
    RETURN public.payment_detail(v_order.id);
  END IF;
  IF v_profile.account_tier='flyinfinity' THEN RETURN public.payment_error('LIFETIME','Tài khoản đã có FlyInfinity trọn đời, không cần mua thêm.'); END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE code=p_plan_code AND is_active AND is_public AND price_vnd>0;
  IF NOT FOUND OR (p_plan_code='flyinfinity' AND (v_plan.account_tier<>'flyinfinity' OR v_plan.duration_days IS NOT NULL))
    OR (p_plan_code<>'flyinfinity' AND (v_plan.account_tier<>'flymax' OR v_plan.duration_days IS NULL OR v_plan.duration_days<=0)) THEN
    RETURN public.payment_error('PLAN','Gói này chưa sẵn sàng để thanh toán.'); END IF;
  SELECT * INTO v_bank FROM public.payment_settings WHERE id=1;
  IF NOT FOUND OR NOT coalesce(v_bank.is_enabled,false) OR nullif(btrim(v_bank.bank_name),'') IS NULL
    OR nullif(btrim(v_bank.account_number),'') IS NULL OR nullif(btrim(v_bank.account_holder),'') IS NULL THEN
    RETURN public.payment_error('BANK_DISABLED','Chuyển khoản chưa được mở. Vui lòng liên hệ hỗ trợ hoặc quay lại sau.'); END IF;
  v_name:=btrim(regexp_replace(coalesce(v_profile.name,''),'[[:space:]]+',' ','g'));
  v_phone:=regexp_replace(coalesce(v_profile.phone,''),'[ -]','','g');
  IF coalesce(v_profile.name,'') ~ '[[:cntrl:]]' OR length(v_name) NOT BETWEEN 2 AND 80 OR v_phone !~ '^\+?[0-9]{8,15}$' THEN
    RETURN public.payment_error('PROFILE','Cần họ tên 2–80 ký tự và số điện thoại gồm 8–15 chữ số.'); END IF;
  v_ascii:=upper(translate(normalize(v_name,NFC),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'));
  IF v_ascii !~ '^[A-Z0-9 .''-]+$' OR v_ascii !~ '[A-Z]' THEN
    RETURN public.payment_error('PROFILE','Vui lòng lưu họ tên dùng được trong nội dung chuyển khoản (chữ Latin).'); END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=v_uid;
  IF nullif(v_email,'') IS NULL THEN RETURN public.payment_error('AUTH','Không đọc được email tài khoản. Vui lòng đăng nhập lại.'); END IF;
  IF p_plan_code IN ('flymax_half_yearly','flymax_yearly','flyinfinity') THEN
    v_percent:=least(20,greatest(0,coalesce(v_profile.referral_discount_percent,0)));
    IF v_percent>0 THEN v_source:='referral'; END IF;
    SELECT * INTO v_voucher FROM public.learning_streak_discounts WHERE user_id=v_uid FOR UPDATE;
    IF FOUND AND v_voucher.discount_percent=50 AND v_voucher.used_at IS NULL AND v_voucher.starts_at<=now() AND v_voucher.expires_at>now() THEN
      v_percent:=50; v_source:='streak';
      v_snapshot:=jsonb_build_object('starts_at',v_voucher.starts_at,'expires_at',v_voucher.expires_at);
    END IF;
  END IF;
  v_discount:=floor(v_plan.price_vnd::numeric*v_percent/100)::integer;
  FOR v_try IN 1..5 LOOP
    v_code:='FD'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    BEGIN
      INSERT INTO public.payment_orders(user_id,plan_code,status,flow_version,request_id,order_code,
        buyer_snapshot,plan_snapshot,bank_snapshot,voucher_snapshot,list_price_vnd,discount_percent,discount_amount_vnd,
        amount_vnd,discount_source,streak_discount_applied,transfer_code)
      VALUES(v_uid,p_plan_code,'draft',1,p_request_id,v_code,
        jsonb_build_object('name',v_name,'email',v_email,'phone',v_phone),
        jsonb_build_object('name',v_plan.name,'account_tier',v_plan.account_tier,'duration_days',v_plan.duration_days),
        jsonb_build_object('bank_name',v_bank.bank_name,'account_number',v_bank.account_number,'account_holder',v_bank.account_holder,'qr_image_url',v_bank.qr_image_url),
        v_snapshot,v_plan.price_vnd,v_percent,v_discount,v_plan.price_vnd-v_discount,v_source,v_source='streak',v_ascii||' '||v_phone||' '||v_code)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try=5 THEN RETURN public.payment_error('RETRY','Chưa tạo được mã đơn. Vui lòng thử lại.'); END IF;
    END;
  END LOOP;
  INSERT INTO public.payment_order_requests(user_id,request_id,order_id) VALUES(v_uid,p_request_id,v_id);
  INSERT INTO public.payment_order_events(order_id,event_type,body,actor_id) VALUES(v_id,'created','Đã tạo đơn và chốt số tiền chuyển khoản.',v_uid);
  RETURN public.payment_detail(v_id);
END $$;

-- Common mutation kernel: all entry points lock profile -> order -> voucher.
-- It is PRIVATE (no authenticated EXECUTE); public wrappers determine the action.
CREATE OR REPLACE FUNCTION public.payment_change_order(p_id uuid,p_action text,p_message text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_owner uuid; v_profile public.profiles; v_order public.payment_orders;
  v_voucher public.learning_streak_discounts; v_admin boolean:=p_action IN ('approve','reply','reject');
  v_message text:=btrim(coalesce(p_message,'')); v_recipient record; v_count integer; v_email text;
  v_sub uuid; v_expiry timestamptz; v_start timestamptz; v_days integer;
BEGIN
  IF v_uid IS NULL THEN RETURN public.payment_error('AUTH','Vui lòng đăng nhập lại.'); END IF;
  IF v_admin AND NOT public.payment_is_admin() THEN RETURN public.payment_error('FORBIDDEN','Chỉ ADMIN được xử lý thanh toán.'); END IF;
  IF p_action NOT IN ('approve','reply','reject','confirm','cancel') THEN RETURN public.payment_error('ACTION','Thao tác không hợp lệ.'); END IF;
  SELECT user_id INTO v_owner FROM public.payment_orders WHERE id=p_id;
  IF NOT FOUND OR (NOT v_admin AND v_owner<>v_uid) THEN RETURN public.payment_error('NOT_FOUND','Không tìm thấy đơn trong tài khoản của bạn.'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_owner FOR UPDATE;
  SELECT * INTO v_order FROM public.payment_orders WHERE id=p_id FOR UPDATE;
  IF v_order.flow_version<>1 THEN RETURN public.payment_error('LEGACY','Đơn cũ thiếu bản chụp. Cần đối chiếu thủ công, không kích hoạt tự động.'); END IF;
  IF (p_action='approve' AND v_order.status='approved') OR (p_action='confirm' AND v_order.status IN ('pending','approved','rejected'))
    OR (p_action='cancel' AND v_order.status='cancelled') OR (p_action='reject' AND v_order.status='rejected') THEN
    RETURN public.payment_detail(p_id,v_admin); END IF;
  IF (p_action IN ('confirm','cancel') AND v_order.status<>'draft') OR (v_admin AND v_order.status<>'pending') THEN
    RETURN public.payment_error('STATE','Trạng thái đơn đã thay đổi. Vui lòng làm mới để xem kết quả.'); END IF;
  IF p_action IN ('reply','reject') AND length(v_message) NOT BETWEEN 1 AND 1000 THEN
    RETURN public.payment_error('MESSAGE','Vui lòng nhập nội dung từ 1 đến 1.000 ký tự.'); END IF;

  IF p_action='confirm' THEN
    SELECT count(*) INTO v_count FROM auth.users WHERE email_confirmed_at IS NOT NULL
      AND lower(email) IN ('vietdang293.vn@gmail.com','vietdang293@gmail.com');
    IF v_count=0 THEN RETURN public.payment_error('ADMIN_UNAVAILABLE','Chưa có người tiếp nhận thanh toán. Vui lòng liên hệ hỗ trợ.'); END IF;
    UPDATE public.payment_orders SET status='pending',confirmed_at=now() WHERE id=p_id;
    FOR v_recipient IN SELECT id,email FROM auth.users WHERE email_confirmed_at IS NOT NULL
      AND lower(email) IN ('vietdang293.vn@gmail.com','vietdang293@gmail.com') LOOP
      INSERT INTO public.app_notifications(title,body,action_url,target_user_id,target_email,created_by)
      VALUES('Có yêu cầu xác nhận chuyển khoản',v_order.order_code||' · '||(v_order.buyer_snapshot->>'name')||' · '||v_order.amount_vnd||' VND. Hãy đối chiếu ngân hàng trước khi kích hoạt.',
        '/admin/payments?order='||p_id,v_recipient.id,v_recipient.email,v_uid);
    END LOOP;
    v_message:='Khách đã xác nhận chuyển tiền. Chờ ADMIN kiểm tra giao dịch ngân hàng.';
  ELSIF p_action='cancel' THEN
    UPDATE public.payment_orders SET status='cancelled' WHERE id=p_id;
    v_message:='Khách hủy đơn nháp chưa báo chuyển tiền. Đây không phải thao tác hoàn tiền.';
  ELSIF p_action='approve' THEN
    IF v_profile.account_tier='flyinfinity' THEN RETURN public.payment_error('LIFETIME','Tài khoản đã có FlyInfinity. Cần liên hệ khách và đối chiếu, không cấp thêm/hạ gói.'); END IF;
    IF v_order.discount_source='streak' THEN
      SELECT * INTO v_voucher FROM public.learning_streak_discounts WHERE user_id=v_owner FOR UPDATE;
      IF NOT FOUND OR v_voucher.used_at IS NOT NULL OR v_voucher.discount_percent<>50
        OR v_voucher.starts_at IS DISTINCT FROM (v_order.voucher_snapshot->>'starts_at')::timestamptz
        OR v_voucher.expires_at IS DISTINCT FROM (v_order.voucher_snapshot->>'expires_at')::timestamptz THEN
        RETURN public.payment_error('VOUCHER_CONFLICT','Ưu đãi của đơn không khớp kỳ voucher hiện tại. Giữ đơn chờ để đối chiếu, không yêu cầu chuyển thêm tiền.'); END IF;
    END IF;
    v_start:=CASE WHEN v_profile.account_tier='flymax' AND v_profile.subscription_expires_at>now()
      THEN coalesce(v_profile.subscription_started_at,now()) ELSE now() END;
    IF v_order.plan_snapshot->>'account_tier'='flyinfinity' THEN v_expiry:=NULL;
    ELSE
      v_days:=(v_order.plan_snapshot->>'duration_days')::integer;
      IF v_days IS NULL OR v_days<=0 THEN RETURN public.payment_error('SNAPSHOT','Đơn thiếu thời hạn hợp lệ, cần đối chiếu.'); END IF;
      v_expiry:=CASE WHEN v_profile.account_tier='flymax' AND v_profile.subscription_expires_at>now()
        THEN v_profile.subscription_expires_at ELSE now() END + make_interval(days=>v_days);
    END IF;
    INSERT INTO public.subscriptions(user_id,plan_code,source,status,starts_at,expires_at,metadata,payment_order_id)
      VALUES(v_owner,v_order.plan_code,'payment','active',now(),v_expiry,jsonb_build_object('order_code',v_order.order_code,'amount_vnd',v_order.amount_vnd),p_id)
      RETURNING id INTO v_sub;
    UPDATE public.profiles SET account_tier=v_order.plan_snapshot->>'account_tier',subscription_started_at=v_start,subscription_expires_at=v_expiry WHERE id=v_owner;
    IF v_order.discount_source='streak' THEN UPDATE public.learning_streak_discounts SET used_at=now() WHERE user_id=v_owner; END IF;
    UPDATE public.payment_orders SET status='approved',subscription_id=v_sub,result_expires_at=v_expiry,reviewed_at=now(),reviewed_by=v_uid WHERE id=p_id;
    v_message:='Đã đối chiếu khoản chuyển và kích hoạt '||(v_order.plan_snapshot->>'name')||
      CASE WHEN v_expiry IS NULL THEN ' · trọn đời.' ELSE ' · thời hạn sau kích hoạt: '||to_char(v_expiry AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')||'.' END;
  ELSIF p_action='reject' THEN
    UPDATE public.payment_orders SET status='rejected',admin_note=v_message,reviewed_at=now(),reviewed_by=v_uid WHERE id=p_id;
  ELSE
    UPDATE public.payment_orders SET admin_note=v_message WHERE id=p_id;
  END IF;
  INSERT INTO public.payment_order_events(order_id,event_type,body,actor_id)
    VALUES(p_id,CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'confirm' THEN 'confirmed' WHEN 'cancel' THEN 'cancelled' ELSE 'reply' END,v_message,v_uid);
  IF v_admin THEN
    SELECT email INTO v_email FROM auth.users WHERE id=v_owner;
    INSERT INTO public.app_notifications(title,body,action_url,target_user_id,target_email,created_by)
    VALUES(CASE p_action WHEN 'approve' THEN 'Gói tài khoản đã được kích hoạt' WHEN 'reject' THEN 'Kết quả kiểm tra thanh toán' ELSE 'Phản hồi về đơn thanh toán' END,
      v_order.order_code||' · '||v_message,'/profile?tab=payments&order='||p_id,v_owner,v_email,v_uid);
  END IF;
  RETURN public.payment_detail(p_id,v_admin);
END $$;

CREATE OR REPLACE FUNCTION public.confirm_payment_order(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_change_order(p_order_id,'confirm'); $$;
CREATE OR REPLACE FUNCTION public.cancel_payment_order(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_change_order(p_order_id,'cancel'); $$;
CREATE OR REPLACE FUNCTION public.admin_approve_payment_order(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_change_order(p_order_id,'approve'); $$;
CREATE OR REPLACE FUNCTION public.admin_reply_payment_order(p_order_id uuid,p_message text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_change_order(p_order_id,'reply',p_message); $$;
CREATE OR REPLACE FUNCTION public.admin_reject_payment_order(p_order_id uuid,p_message text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_change_order(p_order_id,'reject',p_message); $$;

CREATE OR REPLACE FUNCTION public.payment_list(p_admin boolean,p_status text,p_limit integer,p_cursor_created_at timestamptz,p_cursor_id uuid,p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_items jsonb; v_cursor jsonb; v_total bigint; v_pending integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN public.payment_error('AUTH','Vui lòng đăng nhập lại.'); END IF;
  IF p_admin AND NOT public.payment_is_admin() THEN RETURN public.payment_error('FORBIDDEN','Chỉ ADMIN được xem yêu cầu thanh toán.'); END IF;
  IF p_status IS NULL OR p_status NOT IN ('all','open','pending','approved','closed','draft')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR length(coalesce(p_search,''))>100
    OR (p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RETURN public.payment_error('FILTER','Bộ lọc hoặc trang dữ liệu không hợp lệ.'); END IF;
  SELECT coalesce(sum(amount_vnd) FILTER(WHERE flow_version=1 AND status='approved' AND subscription_id IS NOT NULL),0),
    count(*) FILTER(WHERE status='pending') INTO v_total,v_pending FROM public.payment_orders WHERE p_admin OR user_id=auth.uid();
  WITH found AS (
    SELECT o.* FROM public.payment_orders o WHERE (p_admin OR o.user_id=auth.uid())
      AND (p_status='all' OR o.status=p_status OR (p_status='open' AND o.status IN ('draft','pending')) OR (p_status='closed' AND o.status IN ('rejected','cancelled')))
      AND (NOT p_admin OR coalesce(p_search,'')='' OR strpos(lower(coalesce(o.order_code,'')||' '||coalesce(o.buyer_snapshot->>'name','')||' '||coalesce(o.buyer_snapshot->>'email','')||' '||coalesce(o.buyer_snapshot->>'phone','')),lower(p_search))>0)
      AND (p_cursor_created_at IS NULL OR (o.created_at,o.id)<(p_cursor_created_at,p_cursor_id))
      ORDER BY o.created_at DESC,o.id DESC LIMIT p_limit+1
  ), page AS (SELECT * FROM found ORDER BY created_at DESC,id DESC LIMIT p_limit)
  SELECT coalesce((SELECT jsonb_agg(public.payment_order_dto(p,p_admin) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM found)>p_limit THEN (SELECT jsonb_build_object('created_at',created_at,'id',id) FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END
  INTO v_items,v_cursor;
  RETURN jsonb_build_object('success',true,'items',v_items,'next_cursor',v_cursor,'summary',jsonb_build_object('approved_total_vnd',v_total,'pending_count',v_pending));
END $$;
CREATE OR REPLACE FUNCTION public.get_my_payment_orders(p_status text DEFAULT 'all',p_limit integer DEFAULT 20,p_cursor_created_at timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_list(false,p_status,p_limit,p_cursor_created_at,p_cursor_id); $$;
CREATE OR REPLACE FUNCTION public.admin_get_payment_orders(p_status text DEFAULT 'pending',p_limit integer DEFAULT 20,p_cursor_created_at timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL,p_search text DEFAULT '') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT public.payment_list(true,p_status,p_limit,p_cursor_created_at,p_cursor_id,p_search); $$;

-- Deny all helpers; allow only checked entry points. Reapply on every run.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('payment_is_admin','payment_error','payment_order_dto','payment_detail','payment_change_order','payment_list',
      'prepare_payment_order','confirm_payment_order','cancel_payment_order','get_my_payment_order','get_my_payment_orders',
      'admin_get_payment_order','admin_get_payment_orders','admin_approve_payment_order','admin_reply_payment_order','admin_reject_payment_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
    IF r.proname NOT LIKE 'payment_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature); END IF;
  END LOOP;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
