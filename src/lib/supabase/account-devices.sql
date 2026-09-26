-- FlyDo account devices. Run this migration in Supabase SQL Editor before deploying
-- the matching web release. The old single-active-session table is no longer used.
-- A "device" is one browser installation: clearing browser storage creates a new key.

CREATE TABLE IF NOT EXISTS public.account_device_quota (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  removal_count SMALLINT NOT NULL DEFAULT 0 CHECK (removal_count BETWEEN 0 AND 2)
);

CREATE TABLE IF NOT EXISTS public.account_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key UUID NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('phone', 'computer', 'tablet')),
  device_name TEXT NOT NULL,
  session_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, device_key)
);

CREATE INDEX IF NOT EXISTS account_devices_user_active_idx
  ON public.account_devices (user_id, device_type) WHERE revoked_at IS NULL;

-- Keep session IDs explicitly ended by the user, so an unexpired access token
-- cannot silently enroll itself again after logout or "log out everywhere".
CREATE TABLE IF NOT EXISTS public.account_device_ended_sessions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

ALTER TABLE public.account_device_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_device_ended_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own device quota" ON public.account_device_quota;
CREATE POLICY "Read own device quota" ON public.account_device_quota
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Read own account devices" ON public.account_devices;
CREATE POLICY "Read own account devices" ON public.account_devices
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.account_device_quota, public.account_devices FROM anon, authenticated;
GRANT SELECT ON public.account_device_quota, public.account_devices TO authenticated;
REVOKE ALL ON public.account_device_ended_sessions FROM anon, authenticated;

-- Lock the user's quota row so two concurrent logins cannot claim the last slot.
CREATE OR REPLACE FUNCTION public.register_login_device(
  p_device_key UUID,
  p_device_type TEXT,
  p_device_name TEXT,
  p_session_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.account_devices%ROWTYPE;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL OR p_device_key IS NULL OR p_session_id IS NULL
     OR p_session_id <> (auth.jwt()->>'session_id')
     OR p_device_type NOT IN ('phone', 'computer', 'tablet')
     OR NULLIF(btrim(p_device_name), '') IS NULL THEN
    RETURN jsonb_build_object('active', false, 'reason', 'invalid');
  END IF;

  INSERT INTO public.account_device_quota (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.account_device_quota WHERE user_id = v_user_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.account_device_ended_sessions
             WHERE user_id = v_user_id AND session_id = p_session_id) THEN
    RETURN jsonb_build_object('active', false, 'reason', 'removed');
  END IF;

  SELECT * INTO v_existing FROM public.account_devices
    WHERE user_id = v_user_id AND device_key = p_device_key FOR UPDATE;

  IF FOUND THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('active', false, 'reason', 'removed');
    END IF;
    -- An established device keeps its original category; a forged UA cannot move slots.
    UPDATE public.account_devices
      SET session_id = p_session_id,
          device_name = left(btrim(p_device_name), 80),
          last_login_at = CASE WHEN session_id IS DISTINCT FROM p_session_id
            THEN now() ELSE last_login_at END
      WHERE id = v_existing.id;
    RETURN jsonb_build_object('active', true);
  END IF;

  SELECT count(*) INTO v_count FROM public.account_devices
    WHERE user_id = v_user_id AND device_type = p_device_type AND revoked_at IS NULL;
  IF v_count >= 2 THEN
    RETURN jsonb_build_object('active', false, 'reason', 'limit');
  END IF;

  INSERT INTO public.account_devices
    (user_id, device_key, device_type, device_name, session_id)
    VALUES (v_user_id, p_device_key, p_device_type, left(btrim(p_device_name), 80), p_session_id);
  RETURN jsonb_build_object('active', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_registered_device(
  p_device_key UUID, p_session_id TEXT
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active', EXISTS (
      SELECT 1 FROM public.account_devices
      WHERE user_id = auth.uid() AND device_key = p_device_key
        AND session_id = p_session_id AND revoked_at IS NULL
        AND p_session_id = (auth.jwt()->>'session_id')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.release_device_session(
  p_device_key UUID, p_session_id TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_session_id = (auth.jwt()->>'session_id') AND EXISTS (
    SELECT 1 FROM public.account_devices WHERE user_id = auth.uid()
      AND device_key = p_device_key AND session_id = p_session_id
  ) THEN
    INSERT INTO public.account_device_ended_sessions (user_id, session_id)
      VALUES (auth.uid(), p_session_id) ON CONFLICT DO NOTHING;
    UPDATE public.account_devices SET session_id = NULL
      WHERE user_id = auth.uid() AND device_key = p_device_key AND session_id = p_session_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_my_device_sessions() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.account_device_ended_sessions (user_id, session_id)
    SELECT user_id, session_id FROM public.account_devices
    WHERE user_id = auth.uid() AND session_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  UPDATE public.account_devices SET session_id = NULL
    WHERE user_id = auth.uid() AND revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_account_device(p_device_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_used SMALLINT;
  v_device public.account_devices%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR p_device_id IS NULL THEN
    RETURN jsonb_build_object('removed', false, 'reason', 'invalid');
  END IF;

  INSERT INTO public.account_device_quota (user_id) VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT removal_count INTO v_used FROM public.account_device_quota
    WHERE user_id = v_user_id FOR UPDATE;
  IF v_used >= 2 THEN
    RETURN jsonb_build_object('removed', false, 'reason', 'quota');
  END IF;

  SELECT * INTO v_device FROM public.account_devices
    WHERE id = p_device_id AND user_id = v_user_id AND revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('removed', false, 'reason', 'not_found');
  END IF;
  IF v_device.session_id = (auth.jwt()->>'session_id') THEN
    RETURN jsonb_build_object('removed', false, 'reason', 'current');
  END IF;

  UPDATE public.account_devices SET revoked_at = now(), session_id = NULL
    WHERE id = p_device_id;
  UPDATE public.account_device_quota SET removal_count = removal_count + 1
    WHERE user_id = v_user_id;
  RETURN jsonb_build_object('removed', true, 'remaining', 1 - v_used);
END;
$$;

REVOKE ALL ON FUNCTION public.register_login_device(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_registered_device(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_device_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_my_device_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_account_device(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_login_device(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_registered_device(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_device_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_device_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_account_device(UUID) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
         AND tablename = 'account_devices'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_devices;
  END IF;
END;
$$;
