'use client';

import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { BellRing, BookOpen, FileText, Flag, Gift, LibraryBig, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, initialized } = useAuthStore();

  useEffect(() => {
    if (initialized && !isLoading) {
      if (!user || (user.email !== 'vietdang293.vn@gmail.com' && user.email !== 'vietdang293@gmail.com')) {
        router.replace('/home');
      }
    }
  }, [user, isLoading, initialized, router]);

  if (!initialized || isLoading) return <div className="container py-20 text-center animate-pulse">Đang tải...</div>;
  if (!user || (user.email !== 'vietdang293.vn@gmail.com' && user.email !== 'vietdang293@gmail.com')) return null;

  return (
    <div className="container max-w-6xl py-8">
      <PageHeader
        title="Quản trị viên (ADMIN)"
        description="Quản lý nội dung học tập, đề thi, mã quà tặng và thông báo cho học sinh."
      />

      <div className="flex flex-col md:flex-row gap-8 mt-8">
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0">
            <Link href="/admin/question-reports" aria-current={pathname === '/admin/question-reports' ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors', pathname === '/admin/question-reports' ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <Flag className="h-5 w-5" aria-hidden="true" /> Báo lỗi câu hỏi
            </Link>
            <Link href="/admin/practice">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname?.includes('/admin/practice')
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <BookOpen className="w-5 h-5" />
                Quản lý Tự luyện
              </div>
            </Link>

            <Link href="/admin/mock-exams">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname?.includes('/admin/mock-exams')
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <FileText className="w-5 h-5" />
                Quản lý Thi thử
              </div>
            </Link>

            <Link href="/admin/theory">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname?.includes('/admin/theory')
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <LibraryBig className="w-5 h-5" />
                Quản lý Lý thuyết
              </div>
            </Link>

            <Link href="/admin/import">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname?.includes('/admin/import')
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <UploadCloud className="w-5 h-5" />
                Nhập đề JSON
              </div>
            </Link>

            <Link href="/admin/gift-codes" aria-current={pathname === '/admin/gift-codes' ? 'page' : undefined}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname === '/admin/gift-codes'
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <Gift className="w-5 h-5" aria-hidden="true" />
                Mã quà tặng
              </div>
            </Link>
            <Link href="/admin/notifications" aria-current={pathname === '/admin/notifications' ? 'page' : undefined}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors whitespace-nowrap",
                pathname === '/admin/notifications'
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}>
                <BellRing className="w-5 h-5" aria-hidden="true" />
                Thông báo
              </div>
            </Link>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
