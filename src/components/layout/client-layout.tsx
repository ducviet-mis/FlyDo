'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { FloatingBottomNav } from '@/components/layout/floating-bottom-nav';
import { LoginRequiredSection } from '@/components/layout/login-required-section';
import { AuthGuard } from '@/components/layout/auth-guard';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { SingleSessionMonitor } from '@/features/auth/components/single-session-monitor';
import { StreakCheckIn } from '@/features/streak/components/streak-check-in';
import { OnlineStudyTracker } from '@/features/daily-goal/components/online-study-tracker';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { ThemeRibbon } from '@/components/layout/theme-ribbon';

const LOGIN_REQUIRED_SECTIONS: Record<string, string> = {
  '/theory': 'Lý thuyết',
  '/practice': 'Tự luyện',
  '/mock-exams': 'Thi thử',
  '/handbook': 'Cẩm nang',
};

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((state) => state.initAuth);
  const user = useAuthStore((state) => state.user);
  const initialized = useAuthStore((state) => state.initialized);
  const pathname = usePathname();
  useEffect(() => { initAuth(); }, [initAuth]);

  const isMockExamRoom = Boolean(pathname?.match(/^\/mock-exams\/[a-zA-Z0-9-]+$/));
  const isPracticeRoom = Boolean(
    pathname?.match(/^\/practice\/[a-zA-Z0-9-]+$/) && !pathname.match(/\/saved|\/wrong/)
  );
  const isImmersiveMode = isMockExamRoom || isPracticeRoom;
  const showMobileNav = !isImmersiveMode && pathname !== '/login' && pathname !== '/register';
  const loginRequiredSection = pathname ? LOGIN_REQUIRED_SECTIONS[pathname] : undefined;
  const pageContext = pathname?.split('/')[1] || 'home';

  return (
    <AuthGuard>
      <SingleSessionMonitor />
      <StreakCheckIn />
      <OnlineStudyTracker />
      <div className="flex min-h-dvh flex-col bg-background">
        <a href="#main-content" className="vivux-skip-link">Đến nội dung chính</a>
        <div className={cn(
          isMockExamRoom ? "hidden" : isPracticeRoom ? "hidden md:block" : "block"
        )}>
          <Navbar />
          <div aria-hidden="true" className="h-[72px]" />
        </div>
        <main id="main-content" tabIndex={-1} className={cn(
          "min-w-0 flex-1 focus-visible:outline-none",
          isMockExamRoom ? "w-full" : isImmersiveMode ? "w-full md:vivux-page" : "vivux-page",
          showMobileNav && "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8"
        )} data-star-page={pageContext} data-star-immersive={isImmersiveMode ? 'true' : undefined}>
          {!isImmersiveMode && <ThemeRibbon pageContext={pageContext} />}
          {loginRequiredSection && !initialized ? (
            <div role="status" className="container flex min-h-[440px] items-center justify-center gap-3 text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              Đang kiểm tra đăng nhập...
            </div>
          ) : loginRequiredSection && !user ? (
            <LoginRequiredSection sectionName={loginRequiredSection} />
          ) : children}
        </main>
        {showMobileNav && <FloatingBottomNav />}
        <div className={cn(
          isMockExamRoom ? "hidden" : isPracticeRoom ? "hidden md:block" : "block",
          showMobileNav && "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0"
        )}><Footer /></div>
      </div>
    </AuthGuard>
  );
}
