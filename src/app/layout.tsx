import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import "@/styles/sol-system.css";
import "@/styles/luna-system.css";
import { Providers } from "./providers";
import { ClientLayout } from "@/components/layout/client-layout";
import { SiteAnalytics } from "@/components/analytics/site-analytics";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4EC" },
    { media: "(prefers-color-scheme: dark)", color: "#070D1D" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "FlyDo — Nền tảng Học & Tự luyện Toán thông minh",
  description:
    "Nền tảng học Toán với lý thuyết, tự luyện, thi thử trực tuyến và cẩm nang kiến thức.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlyDo",
  },
  formatDetection: {
    telephone: false,
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}
