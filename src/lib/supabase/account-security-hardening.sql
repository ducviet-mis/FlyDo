-- FlyDo security hardening — 30/09/2026.
-- Run AFTER schema.sql and subscription-schema.sql in Supabase SQL Editor.
-- No tables/user records are deleted. Re-runnable, transactional.
-- Web release is compatible before/after this migration; until it runs,
-- production retains the old profile permissions.
BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Read own profile or admin" ON public.profiles;
CREATE POLICY "Read own profile or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR lower(coalesce(auth.jwt()->>'email', '')) IN
    ('vietdang293.vn@gmail.com', 'vietdang293@gmail.com'));

-- Restrictive policy also blocks broad SELECT policies left by old installs.
DROP POLICY IF EXISTS "Profile privacy boundary" ON public.profiles;
CREATE POLICY "Profile privacy boundary" ON public.profiles AS RESTRICTIVE
  FOR SELECT TO anon, authenticated
  USING (auth.uid() IS NOT NULL AND (id = auth.uid()
    OR lower(coalesce(auth.jwt()->>'email', '')) IN
      ('vietdang293.vn@gmail.com', 'vietdang293@gmail.com')));
DROP POLICY IF EXISTS "Profile update ownership boundary" ON public.profiles;
CREATE POLICY "Profile update ownership boundary" ON public.profiles AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
-- Remove possible legacy column-level UPDATE grants too.
DO $$ DECLARE v_columns TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_columns FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles';
  EXECUTE 'REVOKE UPDATE (' || v_columns || ') ON public.profiles FROM anon, authenticated';
END $$;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (name, avatar_url, phone, birth_date) ON public.profiles TO authenticated;

-- Defense in depth: auth.users owns identity; membership RPCs (definer) and
-- service_role retain their permissions. Ordinary profile edits still work.
CREATE OR REPLACE FUNCTION public.protect_profile_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.id := OLD.id;
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_identity_trigger ON public.profiles;
CREATE TRIGGER protect_profile_identity_trigger BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_identity();
REVOKE ALL ON FUNCTION public.protect_profile_identity() FROM PUBLIC, anon, authenticated;

-- Handbook may show administrator author avatars, not private account data.
-- This definer view deliberately exposes ONLY these two public display fields.
CREATE OR REPLACE VIEW public.handbook_author_profiles AS
  SELECT p.name, p.avatar_url FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE auth.uid() IS NOT NULL AND lower(coalesce(u.email, '')) IN
    ('vietdang293.vn@gmail.com', 'vietdang293@gmail.com');
REVOKE ALL ON public.handbook_author_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.handbook_author_profiles TO authenticated;

-- Pin the signup definer's search path; keep its existing trigger behavior.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;

COMMIT;
NOTIFY pgrst, 'reload schema';
