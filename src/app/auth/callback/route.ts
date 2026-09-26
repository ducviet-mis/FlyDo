import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  let next = requestUrl.searchParams.get('next') ?? '/home';

  // Chỉ cho phép đường dẫn nội bộ để tránh chuyển hướng ra website lạ.
  if (!next.startsWith('/') || next.startsWith('//')) next = '/home';

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
