"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut, User, ChevronDown, Shield, Crown, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/stores/auth-store";
import { useState } from "react";
import { AccountTierBadge } from "@/features/subscription/components/account-tier-badge";
import { getEffectiveAccountTier } from "@/features/subscription/utils";
import { desktopNavigationItems } from "@/components/layout/navigation-items";
import { isAdminEmail } from "@/features/auth/lib/is-admin-email";
import { NotificationBell } from "@/features/notifications/notification-bell";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navItems = desktopNavigationItems;
  const isAdmin = isAdminEmail(user?.email);
  const accountTier = getEffectiveAccountTier(user);
  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    router.push('/login');
  };
  return (
    <nav aria-label="Điều hướng chính" className="flydo-header fixed inset-x-0 top-0 z-50 border-b border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] w-full max-w-[1320px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link href="/home" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface" aria-label="FlyDo — Trang chủ">
          <img src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-md object-cover" />
          <span className="text-[22px] font-bold tracking-tight text-foreground">Fly<span className="text-primary">Do</span></span>
        </Link>
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex xl:gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            const hasGrades = item.href === "/practice" || item.href === "/theory" || item.href === "/mock-exams";
            if (hasGrades) {
              return (
                <DropdownMenu key={item.href}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flydo-nav-link group" aria-current={isActive ? "page" : undefined} aria-label={`Chọn lớp — ${item.label}`}>
                      {item.label}
                      <ChevronDown aria-hidden="true" className="h-3 w-3 text-muted-foreground transition-transform duration-160 motion-reduce:transition-none group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={10} className="flydo-header-menu w-60 p-2">
                    <DropdownMenuLabel className="px-3 py-2 text-xs font-medium text-muted-foreground">{item.label} · Chọn lớp</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {[6, 7, 8, 9].map((grade) => (
                      <DropdownMenuItem asChild key={grade} className="min-h-11 cursor-pointer rounded-lg px-3 font-medium">
                        <Link href={`${item.href}?grade=${grade}`}>Lớp {grade}</Link>
                      </DropdownMenuItem>
                    ))}
                    {(item.href === '/practice' || item.href === '/mock-exams') && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/personal-exams?source=${item.href === '/practice' ? 'practice' : 'mock-exams'}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5">
                          <FilePlus2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1 font-medium">Tạo đề cá nhân</span>
                          <span className="text-xs font-medium text-primary">{accountTier === 'flygo' ? 'FlyMax' : 'Pro'}</span>
                        </Link>
                      </DropdownMenuItem>
                    </>}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            return (
              <Link key={item.href} href={item.href} className="flydo-nav-link" aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <NotificationBell />
          {user ? (
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flydo-account-trigger group" aria-label={`Tài khoản ${user.name}`} title={user.name}>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary-soft text-primary">{user.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-28 truncate text-sm font-medium xl:inline">{user.name}</span>
                  <ChevronDown aria-hidden="true" className="hidden h-3 w-3 text-muted-foreground transition-transform duration-160 motion-reduce:transition-none group-data-[state=open]:rotate-180 xl:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="flydo-header-menu w-64 p-2 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:cursor-pointer [&_[role=menuitem]]:rounded-lg [&_[role=menuitem]]:px-3">
                <DropdownMenuLabel className="p-3">
                  <p className="font-semibold text-foreground [overflow-wrap:anywhere]">{user.name}</p>
                  <p className="mt-1 truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AccountTierBadge tier={accountTier} />
                    {isAdmin && <span className="text-xs font-semibold text-primary">ADMIN</span>}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/profile"><User aria-hidden="true" />Thông tin tài khoản</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/pricing"><Crown aria-hidden="true" />Gói đăng ký</Link></DropdownMenuItem>
                {isAdmin && <DropdownMenuItem asChild className="hidden md:flex"><Link href="/admin"><Shield aria-hidden="true" />ADMIN</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:bg-destructive-soft focus:text-destructive"><LogOut aria-hidden="true" />Đăng xuất</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login" aria-label="Đăng nhập" className="flydo-header-action sm:hidden">
                <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary-soft text-primary"><User aria-hidden="true" className="h-4 w-4" /></AvatarFallback></Avatar>
              </Link>
              <Button asChild variant="outline" className="hidden rounded-full border-border bg-transparent px-5 shadow-none sm:inline-flex"><Link href="/login">Đăng nhập</Link></Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="flydo-header-action hidden rounded-full active:translate-y-0 md:inline-flex lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? "Đóng menu" : "Mở menu"} aria-expanded={mobileOpen} aria-controls="mobile-navigation">
            {mobileOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {mobileOpen && (
        <div id="mobile-navigation" className="hidden max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-border bg-surface px-4 py-4 md:block lg:hidden">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              const hasGrades = item.href === "/practice" || item.href === "/theory" || item.href === "/mock-exams";
              if (hasGrades) {
                return (
                  <DropdownMenu key={item.href}>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-current={isActive ? "page" : undefined} className={cn("group flex min-h-12 min-w-0 w-full items-center gap-2 rounded-md px-2 text-sm font-medium", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")} aria-label={`Chọn lớp — ${item.label}`}>
                        <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                        {item.label}
                        <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="flydo-header-menu w-60 p-2 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:px-3">
                      <DropdownMenuLabel>Chọn lớp</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {[6, 7, 8, 9].map((grade) => (
                        <DropdownMenuItem asChild key={grade}>
                          <Link href={`${item.href}?grade=${grade}`} onClick={() => setMobileOpen(false)}>Lớp {grade}</Link>
                        </DropdownMenuItem>
                      ))}
                      {(item.href === '/practice' || item.href === '/mock-exams') && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/personal-exams?source=${item.href === '/practice' ? 'practice' : 'mock-exams'}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 py-2.5">
                            <FilePlus2 aria-hidden="true" className="h-4 w-4 text-primary" />
                            <span className="min-w-0 flex-1 font-semibold">Tạo đề cá nhân</span>
                            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">{accountTier === 'flygo' ? 'FlyMax' : 'Pro'}</span>
                          </Link>
                        </DropdownMenuItem>
                      </>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} aria-current={isActive ? "page" : undefined} className={cn("flex min-h-12 min-w-0 w-full items-center gap-2 rounded-md px-2 text-sm font-medium", isActive ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}><Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />{item.label}</Link>
              );
            })}
          </div>
          <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center gap-2 border-t border-border pt-3">
            {user ? <>
              <Button asChild variant="ghost"><Link href="/profile" onClick={() => setMobileOpen(false)}><User aria-hidden="true" className="h-4 w-4" />Thông tin tài khoản</Link></Button>
              {isAdmin && <Button asChild variant="ghost"><Link href="/admin" onClick={() => setMobileOpen(false)}><Shield aria-hidden="true" className="h-4 w-4" />ADMIN</Link></Button>}
              <Button variant="ghost" onClick={handleLogout} className="text-destructive hover:bg-destructive-soft hover:text-destructive"><LogOut aria-hidden="true" className="h-4 w-4" />Đăng xuất</Button>
            </> : <Button asChild className="w-full"><Link href="/login" onClick={() => setMobileOpen(false)}>Đăng nhập</Link></Button>}
          </div>
        </div>
      )}
    </nav>
  );
}
