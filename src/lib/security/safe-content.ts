import DOMPurify from 'dompurify';

/** Rich content is rendered only after the browser sanitizer is available. */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcdoc'],
    SANITIZE_NAMED_PROPS: true,
  });
}
