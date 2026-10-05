import { APP_NAME } from "@/lib/constants";
import Link from 'next/link';
import { LEGAL_CONTACT, POLICY_LINKS, type PolicyKey } from '@/features/legal/policies';

const compactLabels: Record<PolicyKey, string> = {
  terms: 'Điều khoản',
  privacy: 'Bảo mật',
  payment: 'Thanh toán',
  support: 'Hỗ trợ',
};

const footerLinkStyle = 'inline-flex min-h-11 min-w-11 max-w-full items-center rounded-md px-1.5 py-2 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none';

export function Footer() {
  return (
    <footer className="site-footer mt-4 border-t border-border bg-surface py-3 sm:py-4">
      <div className="mx-auto w-full max-w-7xl px-4 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <Link href="/home" aria-label={`${APP_NAME} — Trang chủ`} className={`${footerLinkStyle} shrink-0 gap-2`}>
            <img src="/logo.png" alt="" width={24} height={24} loading="lazy" decoding="async" className="h-6 w-6 rounded-md object-cover" />
            <span className="text-base font-semibold text-foreground">{APP_NAME}</span>
          </Link>
          <nav aria-label="Chính sách FlyDo" className="min-w-0 max-w-full">
            <ul className="flex flex-wrap items-center gap-x-2 sm:justify-end sm:gap-x-3">
              {POLICY_LINKS.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} aria-label={link.label} className={footerLinkStyle}>
                    {compactLabels[link.key]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-1 flex min-w-0 flex-col items-start sm:flex-row sm:items-center sm:justify-between sm:gap-x-6">
          <p className="px-1.5 text-xs leading-relaxed">© {new Date().getFullYear()} {LEGAL_CONTACT.operator}.</p>
          <a href={`mailto:${LEGAL_CONTACT.email}`} className={`${footerLinkStyle} text-xs [overflow-wrap:anywhere]`}>{LEGAL_CONTACT.email}</a>
        </div>
      </div>
    </footer>
  );
}
