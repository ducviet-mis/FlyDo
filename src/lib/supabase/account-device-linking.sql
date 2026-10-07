-- FlyDo: explicit, owner-authorized Chrome/browser profile linking.
-- SQL FIRST, deploy matching web AFTER success. Run WHOLE file.
-- A logical device group is not hardware attestation. Never auto-merge by IP/UA.
-- Additive, rerunnable; preserves old keys, dates and lifetime removal quota.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.account_devices') IS NULL OR to_regclass('public.account_device_quota') IS NULL
     OR to_regclass('public.account_device_ended_sessions') IS NULL THEN
    RAISE EXCEPTION 'FLYDO: Cần chạy account-devices.sql trước bản nâng cấp liên kết profile.';
  END IF;
END $$;
ALTER TABLE public.account_devices ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.account_devices(id);
ALTER TABLE public.account_devices ADD COLUMN IF NOT EXISTS merged_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS account_devices_id_user_idx ON public.account_devices(id,user_id);
CREATE TABLE IF NOT EXISTS public.account_device_profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key uuid NOT NULL,
  device_id uuid NOT NULL,
  device_name text NOT NULL,
  session_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(user_id,device_key),
  FOREIGN KEY(device_id,user_id) REFERENCES public.account_devices(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS account_device_profiles_group_idx ON public.account_device_profiles(device_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS public.account_device_link_codes (
  code uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  issuer_key uuid NOT NULL,
  issuer_session text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  cancelled_at timestamptz,
  used_at timestamptz,
  consumed_key uuid,
  consumed_session text,
  FOREIGN KEY(device_id,user_id) REFERENCES public.account_devices(id,user_id) ON DELETE CASCADE,
  CHECK ((used_at IS NULL AND consumed_key IS NULL AND consumed_session IS NULL)
     OR (used_at IS NOT NULL AND consumed_key IS NOT NULL AND consumed_session IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS account_device_link_codes_issuer_idx ON public.account_device_link_codes(user_id,issuer_key);
ALTER TABLE public.account_device_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_device_link_codes ENABLE ROW LEVEL SECURITY;
-- No client table reads/writes: only scoped RPCs expose summary or issued code.
REVOKE ALL ON public.account_device_profiles,public.account_device_link_codes FROM PUBLIC,anon,authenticated;
INSERT INTO public.account_device_profiles(user_id,device_key,device_id,device_name,session_id,first_seen_at,last_login_at,revoked_at)
  SELECT user_id,device_key,id,device_name,session_id,first_seen_at,last_login_at,revoked_at FROM public.account_devices
  ON CONFLICT(user_id,device_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.register_login_device(p_device_key uuid,p_device_type text,p_device_name text,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid:=auth.uid(); v_profile public.account_device_profiles%ROWTYPE;
  v_group public.account_devices%ROWTYPE; v_count integer; v_time timestamptz;
BEGIN
  IF v_user IS NULL OR p_device_key IS NULL OR nullif(p_session_id,'') IS NULL
    OR p_session_id IS DISTINCT FROM (auth.jwt()->>'session_id')
    OR p_device_type IS NULL OR p_device_type NOT IN ('phone','computer','tablet')
    OR nullif(btrim(p_device_name),'') IS NULL THEN RETURN jsonb_build_object('active',false,'reason','invalid'); END IF;
  INSERT INTO public.account_device_quota(user_id) VALUES(v_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.account_device_ended_sessions WHERE user_id=v_user AND session_id=p_session_id)
    THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
  SELECT * INTO v_profile FROM public.account_device_profiles WHERE user_id=v_user AND device_key=p_device_key FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_group FROM public.account_devices WHERE id=v_profile.device_id AND user_id=v_user FOR UPDATE;
    IF v_profile.revoked_at IS NOT NULL OR v_group.id IS NULL OR v_group.revoked_at IS NOT NULL
      THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
    -- Established categories never move merely because the caller spoofs its UA.
    IF v_profile.session_id IS DISTINCT FROM p_session_id THEN
      UPDATE public.account_device_link_codes SET cancelled_at=now()
        WHERE user_id=v_user AND issuer_key=p_device_key AND used_at IS NULL AND cancelled_at IS NULL;
    END IF;
    IF v_profile.session_id IS NOT NULL AND v_profile.session_id<>p_session_id AND NOT EXISTS(
      SELECT 1 FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
      WHERE p.user_id=v_user AND p.device_key<>p_device_key AND p.session_id=v_profile.session_id
        AND p.revoked_at IS NULL AND d.revoked_at IS NULL
    ) THEN
      INSERT INTO public.account_device_ended_sessions(user_id,session_id)
        VALUES(v_user,v_profile.session_id) ON CONFLICT DO NOTHING;
    END IF;
    v_time:=CASE WHEN v_profile.session_id IS DISTINCT FROM p_session_id THEN now() ELSE v_profile.last_login_at END;
    UPDATE public.account_device_profiles SET session_id=p_session_id,device_name=left(btrim(p_device_name),80),last_login_at=v_time
      WHERE user_id=v_user AND device_key=p_device_key;
    UPDATE public.account_devices SET last_login_at=greatest(last_login_at,v_time),
      session_id=CASE WHEN device_key=p_device_key THEN p_session_id ELSE session_id END
      WHERE id=v_group.id;
    RETURN jsonb_build_object('active',true);
  END IF;
  SELECT count(*) INTO v_count FROM public.account_devices WHERE user_id=v_user AND device_type=p_device_type AND revoked_at IS NULL;
  IF v_count>=2 THEN RETURN jsonb_build_object('active',false,'reason','limit'); END IF;
  INSERT INTO public.account_devices(user_id,device_key,device_type,device_name,session_id)
    VALUES(v_user,p_device_key,p_device_type,left(btrim(p_device_name),80),p_session_id) RETURNING * INTO v_group;
  INSERT INTO public.account_device_profiles(user_id,device_key,device_id,device_name,session_id)
    VALUES(v_user,p_device_key,v_group.id,left(btrim(p_device_name),80),p_session_id);
  RETURN jsonb_build_object('active',true);
END $$;

CREATE OR REPLACE FUNCTION public.check_registered_device(p_device_key uuid,p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('active',EXISTS(
    SELECT 1 FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=auth.uid() AND p.device_key=p_device_key AND p.session_id=p_session_id
      AND p.session_id=(auth.jwt()->>'session_id') AND p.revoked_at IS NULL AND d.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=p.user_id AND e.session_id=p.session_id)
  ));
$$;

CREATE OR REPLACE FUNCTION public.get_my_account_devices(p_device_key uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_current uuid; v_rows jsonb; v_remaining integer;
BEGIN
  SELECT p.device_id INTO v_current FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=v_user AND p.device_key=p_device_key AND p.session_id=(auth.jwt()->>'session_id')
      AND p.revoked_at IS NULL AND d.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=p.user_id AND e.session_id=p.session_id);
  IF v_user IS NULL OR v_current IS NULL THEN RAISE EXCEPTION 'FLYDO: Phiên thiết bị chưa được đăng nhập hợp lệ.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'device_key',d.device_key,'device_type',d.device_type,
    'device_name',d.device_name,'session_id',d.session_id,'first_seen_at',d.first_seen_at,'last_login_at',d.last_login_at,
    'is_current',d.id=v_current,'profile_count',(SELECT count(*) FROM public.account_device_profiles p WHERE p.device_id=d.id AND p.user_id=v_user AND p.revoked_at IS NULL))
    ORDER BY d.last_login_at DESC,d.id),'[]') INTO v_rows FROM public.account_devices d WHERE d.user_id=v_user AND d.revoked_at IS NULL;
  SELECT greatest(0,2-removal_count) INTO v_remaining FROM public.account_device_quota WHERE user_id=v_user;
  RETURN jsonb_build_object('devices',v_rows,'remaining',coalesce(v_remaining,2),'server_now',now());
END $$;

CREATE OR REPLACE FUNCTION public.create_account_device_link(p_device_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_profile public.account_device_profiles%ROWTYPE; v_group public.account_devices%ROWTYPE;
  v_ticket public.account_device_link_codes%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FLYDO: Cần đăng nhập trên thiết bị đã đăng ký.'; END IF;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  SELECT p.* INTO v_profile FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=v_user AND p.device_key=p_device_key AND p.session_id=(auth.jwt()->>'session_id')
      AND p.revoked_at IS NULL AND d.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=p.user_id AND e.session_id=p.session_id);
  IF v_profile.device_id IS NULL THEN RAISE EXCEPTION 'FLYDO: Chỉ phiên thiết bị đang đăng nhập mới được cấp mã liên kết.'; END IF;
  SELECT * INTO v_group FROM public.account_devices WHERE id=v_profile.device_id AND user_id=v_user;
  UPDATE public.account_device_link_codes SET cancelled_at=now() WHERE user_id=v_user AND issuer_key=p_device_key AND used_at IS NULL AND cancelled_at IS NULL;
  INSERT INTO public.account_device_link_codes(user_id,device_id,issuer_key,issuer_session)
    VALUES(v_user,v_group.id,p_device_key,v_profile.session_id) RETURNING * INTO v_ticket;
  RETURN jsonb_build_object('code',v_ticket.code,'expires_at',v_ticket.expires_at,'server_now',now(),
    'device_name',v_group.device_name,'device_type',v_group.device_type);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_account_device_link(p_link_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_count integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('cancelled',false); END IF;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  UPDATE public.account_device_link_codes SET cancelled_at=now()
    WHERE user_id=v_user AND code::text=lower(btrim(p_link_code)) AND issuer_session=(auth.jwt()->>'session_id')
      AND used_at IS NULL AND cancelled_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('cancelled',v_count>0);
END $$;

CREATE OR REPLACE FUNCTION public.redeem_account_device_link(p_link_code text,p_device_key uuid,p_device_type text,p_device_name text,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_ticket public.account_device_link_codes%ROWTYPE;
  v_group public.account_devices%ROWTYPE; v_profile public.account_device_profiles%ROWTYPE;
  v_source uuid; v_source_type text; v_count integer; v_merged boolean:=false;
BEGIN
  IF v_user IS NULL OR p_device_key IS NULL OR nullif(p_session_id,'') IS NULL
    OR p_session_id IS DISTINCT FROM (auth.jwt()->>'session_id') OR p_device_type IS NULL
    OR p_device_type NOT IN ('phone','computer','tablet') OR nullif(btrim(p_device_name),'') IS NULL
    OR p_link_code IS NULL OR length(btrim(p_link_code))<>36
    THEN RETURN jsonb_build_object('active',false,'reason','invalid'); END IF;
  INSERT INTO public.account_device_quota(user_id) VALUES(v_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.account_device_ended_sessions WHERE user_id=v_user AND session_id=p_session_id)
    THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
  SELECT * INTO v_ticket FROM public.account_device_link_codes WHERE user_id=v_user AND code::text=lower(btrim(p_link_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('active',false,'reason','invalid'); END IF;
  SELECT * INTO v_group FROM public.account_devices WHERE id=v_ticket.device_id AND user_id=v_user FOR UPDATE;
  IF v_group.id IS NULL OR v_group.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
  IF v_ticket.used_at IS NOT NULL THEN
    IF v_ticket.consumed_key=p_device_key AND v_ticket.consumed_session=p_session_id AND EXISTS(
      SELECT 1 FROM public.account_device_profiles WHERE user_id=v_user AND device_key=p_device_key
        AND device_id=v_group.id AND session_id=p_session_id AND revoked_at IS NULL
    ) THEN RETURN jsonb_build_object('active',true,'linked',true,'device_id',v_group.id,'merged_device',false); END IF;
    RETURN jsonb_build_object('active',false,'reason','used');
  END IF;
  IF v_ticket.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('active',false,'reason','invalid'); END IF;
  IF v_ticket.expires_at<=now() THEN RETURN jsonb_build_object('active',false,'reason','expired'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.account_device_profiles p WHERE p.user_id=v_user AND p.device_key=v_ticket.issuer_key
    AND p.device_id=v_group.id AND p.session_id=v_ticket.issuer_session AND p.revoked_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=v_user AND e.session_id=p.session_id))
    THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
  SELECT * INTO v_profile FROM public.account_device_profiles WHERE user_id=v_user AND device_key=p_device_key FOR UPDATE;
  IF FOUND THEN
    SELECT device_type INTO v_source_type FROM public.account_devices WHERE id=v_profile.device_id AND user_id=v_user AND revoked_at IS NULL;
    IF v_profile.revoked_at IS NOT NULL OR v_source_type IS NULL THEN RETURN jsonb_build_object('active',false,'reason','removed'); END IF;
    IF v_source_type<>v_group.device_type THEN RETURN jsonb_build_object('active',false,'reason','type'); END IF;
    v_source:=v_profile.device_id;
  END IF;
  IF p_device_type<>v_group.device_type THEN RETURN jsonb_build_object('active',false,'reason','type'); END IF;
  SELECT count(*) INTO v_count FROM public.account_device_profiles WHERE user_id=v_user AND device_id=v_group.id AND revoked_at IS NULL AND device_key<>p_device_key;
  -- Operational bound, not a physical-device claim; avoids unbounded group growth.
  IF v_count>=20 THEN RETURN jsonb_build_object('active',false,'reason','capacity'); END IF;
  IF v_profile.session_id IS DISTINCT FROM p_session_id THEN
    UPDATE public.account_device_link_codes SET cancelled_at=now()
      WHERE user_id=v_user AND issuer_key=p_device_key AND used_at IS NULL AND cancelled_at IS NULL;
  END IF;
  IF v_profile.session_id IS NOT NULL AND v_profile.session_id<>p_session_id AND NOT EXISTS(
    SELECT 1 FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=v_user AND p.device_key<>p_device_key AND p.session_id=v_profile.session_id
      AND p.revoked_at IS NULL AND d.revoked_at IS NULL
  ) THEN
    INSERT INTO public.account_device_ended_sessions(user_id,session_id)
      VALUES(v_user,v_profile.session_id) ON CONFLICT DO NOTHING;
  END IF;
  IF v_source IS NOT NULL AND v_source<>v_group.id THEN
    -- Moving an issuer permanently invalidates its outstanding authorization,
    -- even if that profile later returns to its original group.
    UPDATE public.account_device_link_codes SET cancelled_at=now()
      WHERE user_id=v_user AND issuer_key=p_device_key AND used_at IS NULL AND cancelled_at IS NULL;
  END IF;
  INSERT INTO public.account_device_profiles(user_id,device_key,device_id,device_name,session_id)
    VALUES(v_user,p_device_key,v_group.id,left(btrim(p_device_name),80),p_session_id)
    ON CONFLICT(user_id,device_key) DO UPDATE SET device_id=excluded.device_id,device_name=excluded.device_name,
      session_id=excluded.session_id,last_login_at=CASE WHEN public.account_device_profiles.session_id IS DISTINCT FROM excluded.session_id
        THEN now() ELSE public.account_device_profiles.last_login_at END;
  UPDATE public.account_devices SET first_seen_at=least(first_seen_at,coalesce(v_profile.first_seen_at,now())),
    last_login_at=greatest(last_login_at,coalesce(v_profile.last_login_at,now()),now()) WHERE id=v_group.id;
  IF v_source IS NOT NULL AND v_source<>v_group.id AND NOT EXISTS(
    SELECT 1 FROM public.account_device_profiles WHERE user_id=v_user AND device_id=v_source AND revoked_at IS NULL
  ) THEN
    UPDATE public.account_devices SET revoked_at=now(),session_id=NULL,merged_into=v_group.id,merged_at=now() WHERE id=v_source AND user_id=v_user AND revoked_at IS NULL;
    UPDATE public.account_device_link_codes SET cancelled_at=now() WHERE user_id=v_user AND device_id=v_source AND used_at IS NULL AND cancelled_at IS NULL;
    v_merged:=true;
  END IF;
  UPDATE public.account_device_link_codes SET used_at=now(),consumed_key=p_device_key,consumed_session=p_session_id WHERE code=v_ticket.code;
  RETURN jsonb_build_object('active',true,'linked',true,'device_id',v_group.id,'merged_device',v_merged);
END $$;

CREATE OR REPLACE FUNCTION public.release_device_session(p_device_key uuid,p_session_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL OR p_session_id IS DISTINCT FROM (auth.jwt()->>'session_id') THEN RETURN; END IF;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.account_device_profiles WHERE user_id=v_user AND device_key=p_device_key AND session_id=p_session_id) THEN
    INSERT INTO public.account_device_ended_sessions(user_id,session_id) VALUES(v_user,p_session_id) ON CONFLICT DO NOTHING;
    UPDATE public.account_device_profiles SET session_id=NULL WHERE user_id=v_user AND session_id=p_session_id;
    UPDATE public.account_devices SET session_id=NULL WHERE user_id=v_user AND session_id=p_session_id;
    UPDATE public.account_device_link_codes SET cancelled_at=now() WHERE user_id=v_user AND issuer_session=p_session_id AND used_at IS NULL AND cancelled_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.clear_my_device_sessions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=v_user AND p.session_id=(auth.jwt()->>'session_id') AND p.revoked_at IS NULL AND d.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=v_user AND e.session_id=p.session_id))
    THEN RAISE EXCEPTION 'FLYDO: Cần thực hiện từ một phiên thiết bị đang đăng nhập.'; END IF;
  INSERT INTO public.account_device_ended_sessions(user_id,session_id)
    SELECT user_id,session_id FROM public.account_device_profiles WHERE user_id=v_user AND session_id IS NOT NULL ON CONFLICT DO NOTHING;
  UPDATE public.account_device_profiles SET session_id=NULL WHERE user_id=v_user;
  UPDATE public.account_devices SET session_id=NULL WHERE user_id=v_user;
  UPDATE public.account_device_link_codes SET cancelled_at=now() WHERE user_id=v_user AND used_at IS NULL AND cancelled_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.remove_account_device(p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=auth.uid(); v_used smallint; v_group public.account_devices%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_device_id IS NULL THEN RETURN jsonb_build_object('removed',false,'reason','invalid'); END IF;
  INSERT INTO public.account_device_quota(user_id) VALUES(v_user) ON CONFLICT DO NOTHING;
  SELECT removal_count INTO v_used FROM public.account_device_quota WHERE user_id=v_user FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.account_device_profiles p JOIN public.account_devices d ON d.id=p.device_id AND d.user_id=p.user_id
    WHERE p.user_id=v_user AND p.session_id=(auth.jwt()->>'session_id') AND p.revoked_at IS NULL AND d.revoked_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.account_device_ended_sessions e WHERE e.user_id=v_user AND e.session_id=p.session_id))
    THEN RETURN jsonb_build_object('removed',false,'reason','invalid'); END IF;
  IF v_used>=2 THEN RETURN jsonb_build_object('removed',false,'reason','quota'); END IF;
  SELECT * INTO v_group FROM public.account_devices WHERE id=p_device_id AND user_id=v_user AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('removed',false,'reason','not_found'); END IF;
  IF EXISTS(SELECT 1 FROM public.account_device_profiles WHERE user_id=v_user AND device_id=p_device_id
    AND session_id=(auth.jwt()->>'session_id') AND revoked_at IS NULL)
    THEN RETURN jsonb_build_object('removed',false,'reason','current'); END IF;
  INSERT INTO public.account_device_ended_sessions(user_id,session_id)
    SELECT user_id,session_id FROM public.account_device_profiles WHERE user_id=v_user AND device_id=p_device_id AND session_id IS NOT NULL ON CONFLICT DO NOTHING;
  UPDATE public.account_devices SET revoked_at=now(),session_id=NULL WHERE id=p_device_id AND user_id=v_user;
  UPDATE public.account_device_profiles SET revoked_at=now(),session_id=NULL WHERE user_id=v_user AND device_id=p_device_id;
  UPDATE public.account_device_link_codes SET cancelled_at=now() WHERE user_id=v_user AND device_id=p_device_id AND used_at IS NULL AND cancelled_at IS NULL;
  UPDATE public.account_device_quota SET removal_count=removal_count+1 WHERE user_id=v_user;
  RETURN jsonb_build_object('removed',true,'remaining',1-v_used);
END $$;

REVOKE ALL ON FUNCTION public.register_login_device(uuid,text,text,text),public.check_registered_device(uuid,text),
  public.release_device_session(uuid,text),public.clear_my_device_sessions(),public.remove_account_device(uuid),
  public.get_my_account_devices(uuid),public.create_account_device_link(uuid),public.cancel_account_device_link(text),
  public.redeem_account_device_link(text,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_login_device(uuid,text,text,text),public.check_registered_device(uuid,text),
  public.release_device_session(uuid,text),public.clear_my_device_sessions(),public.remove_account_device(uuid),
  public.get_my_account_devices(uuid),public.create_account_device_link(uuid),public.cancel_account_device_link(text),
  public.redeem_account_device_link(text,uuid,text,text,text) TO authenticated;
COMMIT;
