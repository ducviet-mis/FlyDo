import { getSupabaseClient } from '@/lib/supabase/client';

export async function loadAuthorProfiles(names: string[]) {
  if (!names.length) return [];
  const supabase = getSupabaseClient();
  const result = await supabase.from('handbook_author_profiles')
    .select('name, avatar_url').in('name', names);
  if (!result.error) return result.data || [];
  // Safe rollout before account-security-hardening.sql is applied. Always
  // select only display fields; never fetch email/phone/birth date here.
  if (['PGRST205', '42P01'].includes(result.error.code)) {
    const legacy = await supabase.from('profiles').select('name, avatar_url').in('name', names);
    return legacy.data || [];
  }
  return [];
}
