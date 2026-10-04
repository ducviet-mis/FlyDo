'use client';

import { Analytics } from '@vercel/analytics/react';
import { useParams, usePathname } from 'next/navigation';
import { prepareAnalyticsEvent } from '@/lib/analytics/privacy';

function getRoute(pathname: string | null, params: Record<string, string | string[] | undefined> | null) {
  if (!pathname || !params) return pathname;
  let route = pathname;
  for (const [key, value] of Object.entries(params)) {
    const segment = Array.isArray(value) ? value.join('/') : value;
    if (!segment) continue;
    const escaped = segment.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
    route = route.replace(new RegExp('/' + escaped + '(?=[/?#]|$)'), '/[' + (Array.isArray(value) ? '...' : '') + key + ']');
  }
  return route;
}

export function SiteAnalytics() {
  const pathname = usePathname();
  const params = useParams();
  // The SDK's Next adapter derives route labels from query keys on static pages.
  // Supply only Next's filesystem-defined params so queries never become metadata.
  return (
    <Analytics
      path={pathname}
      route={getRoute(pathname, params)}
      framework="next"
      basePath={process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH}
      configString={process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG}
      beforeSend={prepareAnalyticsEvent}
      debug={false}
    />
  );
}
