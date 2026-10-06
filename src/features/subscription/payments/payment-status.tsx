import { cn } from '@/lib/utils';
import type { PaymentOrder } from './types';
const statuses={draft:['Chờ chuyển khoản','bg-muted text-muted-foreground'],pending:['Chờ kiểm tra','bg-warning-soft text-warning'],approved:['Đã kích hoạt','bg-success-soft text-success'],rejected:['Không được duyệt','bg-destructive-soft text-destructive'],cancelled:['Đã hủy','bg-muted text-muted-foreground']} as const;
export function PaymentStatusBadge({order}:{order:PaymentOrder}) {
  const [label,style]=statuses[order.status];
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',style)}>{order.flow_version===0&&order.status==='approved'?'Đã duyệt · dữ liệu cũ':label}</span>;
}
export function paymentDate(value:string|null) {return value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value)):'Chưa có thông tin lưu';}
