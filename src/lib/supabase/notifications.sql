-- FlyDo notifications. Run once in Supabase SQL Editor before using the feature.
-- Admin may publish to everyone or one account; students can only read their own inbox.

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  action_url TEXT CHECK (action_url IS NULL OR (length(action_url) <= 300 AND action_url ~ '^/[^/]')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT target_email_pair CHECK (
    (target_user_id IS NULL AND target_email IS NULL)
    OR (target_user_id IS NOT NULL AND target_email IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.app_notifications(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS app_notifications_active_date_idx
  ON public.app_notifications (created_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS app_notifications_target_idx
  ON public.app_notifications (target_user_id, created_at DESC) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.flydo_is_notification_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND lower(coalesce(auth.jwt()->>'email', '')) IN
    ('vietdang293.vn@gmail.com', 'vietdang293@gmail.com');
$$;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read visible notifications" ON public.app_notifications;
CREATE POLICY "Read visible notifications" ON public.app_notifications
  FOR SELECT TO authenticated
  USING (public.flydo_is_notification_admin() OR
    (is_active AND (target_user_id IS NULL OR target_user_id = auth.uid())));

DROP POLICY IF EXISTS "Admin create notifications" ON public.app_notifications;
CREATE POLICY "Admin create notifications" ON public.app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.flydo_is_notification_admin() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Admin update notifications" ON public.app_notifications;
CREATE POLICY "Admin update notifications" ON public.app_notifications
  FOR UPDATE TO authenticated
  USING (public.flydo_is_notification_admin())
  WITH CHECK (public.flydo_is_notification_admin());

DROP POLICY IF EXISTS "Read own notification status" ON public.notification_reads;
CREATE POLICY "Read own notification status" ON public.notification_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.app_notifications, public.notification_reads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_notifications TO authenticated;
GRANT SELECT ON public.notification_reads TO authenticated;

-- SECURITY DEFINER functions below enforce audience manually. A user cannot
-- mark or fetch a private notification addressed to someone else.
CREATE OR REPLACE FUNCTION public.get_my_notification_inbox(p_limit INTEGER DEFAULT 40)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_unread INTEGER := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('items', v_items, 'unread_count', 0);
  END IF;

  SELECT count(*) INTO v_unread
  FROM public.app_notifications n
  WHERE n.is_active AND (n.target_user_id IS NULL OR n.target_user_id = v_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.notification_reads r
      WHERE r.user_id = v_user_id AND r.notification_id = n.id);

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT n.id, n.title, n.body, n.action_url, n.created_at, r.read_at
    FROM public.app_notifications n
    LEFT JOIN public.notification_reads r
      ON r.user_id = v_user_id AND r.notification_id = n.id
    WHERE n.is_active AND (n.target_user_id IS NULL OR n.target_user_id = v_user_id)
    ORDER BY n.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 40), 1), 100)
  ) i;

  RETURN jsonb_build_object('items', v_items, 'unread_count', v_unread);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(p_notification_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_notification_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_notifications n WHERE n.id = p_notification_id
      AND n.is_active AND (n.target_user_id IS NULL OR n.target_user_id = v_user_id)
  ) THEN RETURN false; END IF;
  INSERT INTO public.notification_reads (user_id, notification_id)
    VALUES (v_user_id, p_notification_id) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_my_notifications_read()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notification_reads (user_id, notification_id)
    SELECT auth.uid(), n.id FROM public.app_notifications n
    WHERE n.is_active AND (n.target_user_id IS NULL OR n.target_user_id = auth.uid())
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.flydo_is_notification_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_notification_inbox(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_my_notification_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_my_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.flydo_is_notification_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_notification_inbox(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_my_notifications_read() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
         AND tablename = 'app_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
  END IF;
END;
$$;
