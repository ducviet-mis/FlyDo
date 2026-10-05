import Link from 'next/link';
import { ArrowLeft, ArrowUp, Mail } from 'lucide-react';
import { LEGAL_CONTACT, POLICY_DOCUMENTS, POLICY_LINKS, type PolicyKey } from './policies';

const linkStyle = 'rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none';

export function PolicyPage({ policyKey }: { policyKey: PolicyKey }) {
  const policy = POLICY_DOCUMENTS[policyKey];
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8" id="policy-top">
      <Link href="/home" className={`inline-flex min-h-11 items-center gap-2 px-1 text-sm font-medium text-muted-foreground ${linkStyle}`}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Về trang chủ
      </Link>

      <header className="mt-5 border-b border-border pb-8 sm:pb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Chính sách FlyDo</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-foreground [text-wrap:balance] sm:text-4xl">{policy.title}</h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">{policy.description}</p>
        <p className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{LEGAL_CONTACT.operator}</span>
          <span>Cập nhật <time dateTime={LEGAL_CONTACT.updatedAt}>{LEGAL_CONTACT.updatedLabel}</time></span>
        </p>
      </header>

      <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        <aside className="min-w-0 space-y-6 lg:self-start">
          <nav aria-label="Các chính sách FlyDo" className="space-y-1">
            {POLICY_LINKS.map((link) => (
              <Link key={link.key} href={link.href} aria-current={link.key === policyKey ? 'page' : undefined}
                className={`flex min-h-11 items-center border-l-2 px-3 py-2.5 text-sm ${linkStyle} ${link.key === policyKey ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/40'}`}>
                {link.label}
              </Link>
            ))}
          </nav>
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className={`min-h-11 cursor-pointer py-3 text-sm font-semibold text-foreground ${linkStyle}`}>Mục lục</summary>
            <nav aria-label={`Mục lục ${policy.title}`} className="mt-2 space-y-1">
              {policy.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className={`block min-h-11 px-1 py-2.5 text-sm leading-relaxed text-muted-foreground ${linkStyle}`}>
                  {section.title}
                </a>
              ))}
            </nav>
          </details>
          <a href={`mailto:${LEGAL_CONTACT.email}`} className={`inline-flex min-h-11 max-w-full items-center gap-2 px-1 text-sm font-medium text-primary ${linkStyle}`}>
            <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{LEGAL_CONTACT.email}</span>
          </a>
        </aside>

        <article aria-label={policy.title} className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-8 lg:p-10">
          <div className="max-w-prose">
            <div className="border-l-2 border-primary pl-4">
              <p className="text-sm font-semibold text-foreground">Điểm chính</p>
              <p className="mt-2 text-base leading-relaxed text-foreground">{policy.summary}</p>
            </div>
            <div className="mt-9 space-y-9 sm:space-y-10">
              {policy.sections.map((section) => (
                <section key={section.id} id={section.id} tabIndex={-1} aria-labelledby={`${section.id}-heading`}
                  className="scroll-mt-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <h2 id={`${section.id}-heading`} className="text-xl font-semibold leading-snug text-foreground [text-wrap:balance]">{section.title}</h2>
                  {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-3 text-base leading-7 text-foreground [overflow-wrap:anywhere]">{paragraph}</p>)}
                  {section.items && (
                    <ul className="mt-3 list-disc space-y-3 pl-5 text-base leading-7 text-foreground marker:text-primary">
                      {section.items.map((item) => <li key={item} className="pl-1 [overflow-wrap:anywhere]">{item}</li>)}
                    </ul>
                  )}
                  {section.links && (
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                      {section.links.map((link) => <Link key={link.href} href={link.href} className={`inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 ${linkStyle}`}>{link.label}</Link>)}
                    </div>
                  )}
                </section>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <p className="text-sm text-muted-foreground">Cần giải thích thêm? Gửi email cho FlyDo.</p>
              <a href="#policy-top" className={`inline-flex min-h-11 items-center gap-2 px-1 text-sm font-medium text-primary ${linkStyle}`}><ArrowUp aria-hidden="true" className="h-4 w-4" /> Về đầu trang</a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
