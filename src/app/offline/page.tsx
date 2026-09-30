import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <section className="mx-auto my-12 max-w-lg rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
      <WifiOff className="mx-auto mb-5 h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-foreground">Kết nối đang gián đoạn</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        Kiểm tra mạng rồi mở lại trang học. Bản nháp đã lưu trên thiết bị vẫn được giữ lại;
        tiến độ và phần thưởng cần kết nối để đồng bộ với tài khoản.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Recovery needs a full request, not an offline RSC fetch. */}
      <a href="/home" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
        Mở lại FlyDo
      </a>
    </section>
  );
}
