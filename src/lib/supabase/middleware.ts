import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from '@/features/auth/lib/is-admin-email';

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAdminPage = path === '/admin' || path.startsWith('/admin/')
    || path === '/handbook/new' || /^\/handbook\/[^/]+\/edit\/?$/.test(path);
  let adminAllowed = false;
  let refreshFailed = false;
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables! Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.");
    // Return early to avoid crashing the whole app, though auth won't work
    if (isAdminPage) return new NextResponse('Chưa thể xác thực quyền quản trị. Vui lòng thử lại sau.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          previousCookies.forEach((cookie) => response.cookies.set(cookie));
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Refresh session if expired
  try {
    const { data, error } = await supabase.auth.getUser();
    adminAllowed = !error && Boolean(data.user && isAdminEmail(data.user.email));
  } catch {
    // A temporary auth transport failure must not take the whole site down.
    // Protected data is still checked by Supabase RLS, never by this catch.
    console.warn('Session refresh temporarily unavailable.');
    refreshFailed = true;
  }

  if (isAdminPage && !adminAllowed) {
    const denied = refreshFailed
      ? new NextResponse('Chưa thể xác thực quyền quản trị. Vui lòng tải lại trang.', { status: 503 })
      : NextResponse.redirect(new URL('/home', request.url));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    denied.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return denied;
  }

  // HTML/RSC may include account-specific state or refreshed session cookies.
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');

  return response;
}
