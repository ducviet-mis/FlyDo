import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { safeInternalPath } from '@/lib/security/safe-navigation';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeInternalPath(requestUrl.searchParams.get('next'));

  try {
    if (code) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        // Device registration runs in the browser after the OAuth redirect,
        // where the stable device key is available.
        const destination = new URL(next, requestUrl.origin);
        destination.searchParams.set('device_oauth', '1');
        const response = NextResponse.redirect(destination);
        response.headers.set('Cache-Control', 'private, no-store, max-age=0');
        return response;
      }
    }
  } catch {
    console.warn('OAuth exchange temporarily unavailable.');
  }

  const response = NextResponse.redirect(new URL('/login?oauth_error=1', requestUrl.origin));
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
