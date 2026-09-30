'use client';

import Link from 'next/link';
import { ArrowUpRight, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { AppNotification } from './use-notifications';
import { safeInternalPath } from '@/lib/security/safe-navigation';

type Props = {
  notification: AppNotification | null;
  onClose: () => void;
  error?: string;
};

export function NotificationDetailDialog({ notification, onClose, error }: Props) {
  return (
    <Dialog open={notification !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="gap-0 p-0">
        {notification && <>
          <div className="border-b border-border px-5 pb-5 pt-6 sm:px-6">
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Bell aria-hidden="true" className="h-5 w-5" />
            </span>
            <DialogHeader className="space-y-2">
              <DialogTitle className="break-words pr-2 text-xl leading-snug">{notification.title}</DialogTitle>
              <DialogDescription>
                FlyDo · <time dateTime={notification.created_at}>
                  {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.created_at))}
                </time>
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[45dvh] overflow-y-auto px-5 py-6 sm:px-6">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground [overflow-wrap:anywhere]">{notification.body}</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2 border-t border-border px-5 py-4 sm:px-6">
            <DialogClose asChild><Button type="button" variant="outline">Đóng</Button></DialogClose>
            {notification.action_url && <Button asChild>
              <Link href={safeInternalPath(notification.action_url)} onClick={onClose}>
                Đi tới nội dung <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>}
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}
