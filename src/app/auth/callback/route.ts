import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeInternalPath } from '@/lib/security/safe-navigation';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeInternalPath(requestUrl.searchParams.get('next'));

  if (code) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Device registration runs in the browser after the OAuth redirect,
      // where the stable device key is available.
      const destination = new URL(next, requestUrl.origin);
      destination.searchParams.set('device_oauth', '1');
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.redirect(new URL('/login?oauth_error=1', requestUrl.origin));
}
