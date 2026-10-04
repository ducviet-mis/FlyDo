'use client';

import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BellRing, BookOpen, FileText, Flag, Gift, LibraryBig, ShieldCheck, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import './admin.css';

const navigationGroups = [
  { label: 'Nội dung học tập', items: [
    { href: '/admin/practice', title: 'Tự luyện', icon: BookOpen, description: 'Sắp xếp chương, bài học và quản lý câu hỏi theo Level.' },
    { href: '/admin/theory', title: 'Lý thuyết', icon: LibraryBig, description: 'Soạn bài học, sắp xếp nội dung và quản lý câu hỏi ôn tập.' },
    { href: '/admin/mock-exams', title: 'Thi thử', icon: FileText, description: 'Quản lý đề thi theo lớp, danh mục và chuyên đề.' },
    { href: '/admin/import', title: 'Nhập JSON', icon: UploadCloud, description: 'Chọn nơi lưu, kiểm tra nội dung rồi duyệt nhập câu hỏi.' },
  ] },
  { label: 'Vận hành', items: [
    { href: '/admin/question-reports', title: 'Báo lỗi câu hỏi', icon: Flag, description: 'Kiểm tra câu hỏi và gửi phản hồi đến học sinh báo lỗi.' },
    { href: '/admin/notifications', title: 'Thông báo', icon: BellRing, description: 'Gửi thông báo cho học sinh và quản lý lịch sử gửi.' },
    { href: '/admin/gift-codes', title: 'Mã quà tặng', icon: Gift, description: 'Phát hành và quản lý mã FlyTiee, mã kích hoạt FlyMax.' },
  ] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, initialized } = useAuthStore();
  const activeGroup = navigationGroups.find((group) => group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))) ?? navigationGroups[0];
  const activeItem = activeGroup.items.find((item) => pathname === item.href || pathname.startsWith(item.href + '/')) ?? navigationGroups[0].items[0];

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
    <div className="admin-workspace container max-w-[1320px] py-4 sm:py-6">
      <div className="admin-grid">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-heading"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" /><span>FlyDo <span className="font-normal text-muted-foreground">/ ADMIN</span></span></div>
          <nav aria-label="Điều hướng quản trị" className="admin-navigation">
            {navigationGroups.map((group) => <div key={group.label} className="admin-navigation-group">
              <p className="admin-navigation-label">{group.label}</p>
              {group.items.map(({ href, title, icon: Icon }) => <Link key={href} href={href}
                aria-current={activeItem.href === href ? 'page' : undefined}
                className={cn('admin-navigation-link', activeItem.href === href && 'admin-navigation-link-active')}>
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{title}</span>
              </Link>)}
            </div>)}
          </nav>
          <Link href="/home" className="admin-back-link">Về trang học <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </aside>

        <div className="admin-content min-w-0">
          <div className="admin-mobile-navigation">
            <label htmlFor="admin-section" className="text-xs font-semibold text-muted-foreground">ADMIN · Chuyển mục</label>
            <select id="admin-section" aria-label="Chọn mục quản trị" value={activeItem.href} onChange={(event) => router.push(event.target.value)}>
              {navigationGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item.href} value={item.href}>{item.title}</option>)}</optgroup>)}
            </select>
          </div>
          <header className="admin-page-heading">
            <p className="text-xs font-medium text-muted-foreground">Quản trị <span aria-hidden="true" className="mx-2">/</span>{activeGroup.label}</p>
            <h1>{activeItem.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{activeItem.description}</p>
          </header>
          <div id="admin-content" className="admin-page-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
