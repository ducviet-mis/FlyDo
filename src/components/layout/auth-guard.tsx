'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Loader2 } from 'lucide-react';

const EXACT_PUBLIC_PATHS = ['/', '/home', '/login', '/register', '/practice', '/theory', '/mock-exams', '/pricing', '/offline'];

function checkIsPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;

  // Exact public root routes
  if (EXACT_PUBLIC_PATHS.includes(pathname)) {
    return true;
  }

  // Handbook Hub: /handbook is public
  if (pathname === '/handbook') {
    return true;
  }

  // Handbook reading page: /handbook/[id] is public
  // EXCEPT admin routes: /handbook/new and /handbook/[id]/edit which require authentication
  if (pathname.startsWith('/handbook/')) {
    if (pathname === '/handbook/new' || pathname.endsWith('/edit')) {
      return false; // Require login for authoring/editing
    }
    return true; // Reading is 100% public!
  }

  return false;
}

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPath = checkIsPublicPath(pathname);

  useEffect(() => {
    // Only redirect AFTER auth has been initialized
    if (initialized && !user && !isPublicPath) {
      router.replace('/login');
    }
  }, [user, initialized, isPublicPath, router]);

  // Public pages: always render immediately without waiting for auth
  if (isPublicPath) {
    return <>{children}</>;
  }

  // Still initializing auth → show loading spinner (don't redirect yet!)
  if (!initialized) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Đang kiểm tra đăng nhập...</p>
      </div>
    );
  }

  // Initialized but no user → will redirect via useEffect, show loading in meantime
  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Đang chuyển hướng...</p>
      </div>
    );
  }

  return <>{children}</>;
}
