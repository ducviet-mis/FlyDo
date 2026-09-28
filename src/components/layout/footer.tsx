import { APP_NAME } from "@/lib/constants";
import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="site-footer border-t border-border bg-surface py-6 mt-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt={APP_NAME} className="h-5 w-5 rounded-md object-cover" />
          <span className="font-bold text-foreground">{APP_NAME}</span>
        </div>
        <p className="flex items-center gap-1">
          Được xây dựng với <Heart className="h-3 w-3 text-special fill-special/10" /> cho giáo dục
        </p>
        <p>© {new Date().getFullYear()} {APP_NAME}. Tất cả quyền được bảo lưu.</p>
      </div>
    </footer>
  );
}
