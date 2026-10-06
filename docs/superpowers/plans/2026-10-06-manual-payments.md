# FlyDo Manual Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách xác nhận chuyển khoản, ADMIN đối chiếu rồi kích hoạt gói một-click; khách xem lịch sử đơn và phản hồi trong Thông tin tài khoản.

**Architecture:** Mở rộng `payment_orders` hiện có với bản chụp mua hàng và nhật ký sự kiện. RPC kiểm tra danh tính/quyền, chốt giá, chống thao tác trùng và cấp gói nguyên tử. React chỉ hiển thị/gọi RPC, dùng chung module thanh toán cho checkout, lịch sử khách và ADMIN.

**Tech Stack:** Next.js App Router 16.3.7, React 19.3.0, TypeScript, Supabase/PostgreSQL, Zustand, Radix Dialog, Tailwind và Lucide hiện có; test Node, PGlite/jsdom đã cài trong `tmp/question-report-db-test`, Chrome/Playwright đã có. Không cài thêm dependency sản phẩm.

**Spec:** `docs/superpowers/specs/2026-10-06-manual-payments-design.md` — đã được người dùng duyệt; thêm lịch sử thanh toán đã được yêu cầu rõ ràng.

## Global Constraints

- Nội dung chuyển khoản: họ tên từ tài khoản + SĐT từ tài khoản + mã đơn `FD` + 10 ký tự hex viết hoa.
- Họ tên 2–80 ký tự; SĐT 8–15 chữ số, cho nhập dấu cách/dấu gạch và một dấu `+` ở đầu, không mất số 0 đầu.
- Năm gói được nhận: `flymax_monthly`, `flymax_quarterly`, `flymax_half_yearly`, `flymax_yearly`, `flyinfinity`. Giá và thời hạn lấy từ máy chủ.
- FlyMax 1/3 tháng không có ưu đãi; 6 tháng/1 năm/Infinity lấy mức cao hơn giữa referral tối đa 20% và streak 50%, không cộng dồn. Tiền giảm làm tròn xuống VND.
- Một đơn mới mở/tài khoản; nháp không tự hết hạn; đóng dialog không hủy; đã báo chuyển không cho khách hủy.
- Voucher chỉ tiêu thụ khi duyệt thành công; giữ số tiền đã chốt khi ADMIN duyệt muộn; không tiêu thụ nhầm kỳ voucher mới.
- `draft → pending → approved/rejected`, hoặc `draft → cancelled`. Đơn kết thúc không mở lại hoặc cấp quyền lần nữa.
- Chỉ ADMIN từ danh tính `auth.users`, email đã xác nhận và allowlist hiện tại được thao tác; khách không được sửa giá/ngày/trạng thái/gói trực tiếp.
- Lịch sử 20 đơn mỗi lượt, limit máy chủ tối đa 50, sort/cursor `(created_at, id)` giảm dần; phản hồi văn bản thuần tối đa 1.000 ký tự.
- Dùng Sol/Luna, vùng bấm tối thiểu 44px, dialog cùng trang, reduced-motion, keyboard và safe area; không thay đổi chức năng học.
- Không gọi live DB/ngân hàng hoặc tự bật thanh toán; SQL chạy trước web mới. Không push/deploy trước khi điều kiện rollout được xác nhận.
- Không chạm JSON/tài liệu người dùng; khi build, bảo toàn `public/sw.js` đang sửa và không ghi lại `tsconfig.tsbuildinfo`.

## Review Focus

1. Retry sau mất mạng hoặc hai lần duyệt chỉ tạo một subscription và một thông báo cho mỗi sự kiện; kiểm tra tại Task 1 và 4.
2. Tài khoản đổi khi request chưa xong không hiển thị kết quả/chi tiết của chủ cũ; kiểm tra tại Task 2–4.
3. Voucher hết hạn sau khi khách nhận chỉ dẫn vẫn giữ giá đã chốt, voucher cấp lại không bị tiêu thụ nhầm; kiểm tra tại Task 1.
4. Link thông báo tới đơn không thuộc chủ hiện tại, query hỏng và các bản ghi cũ thiếu snapshot không gây crash/tiết lộ dữ liệu; kiểm tra tại Task 1 và 3–4.
5. Tên/email/memo và phản hồi dài trên màn hình 375px không tràn, dialog có focus và nút vẫn bấm được; kiểm tra tại Task 5.

---

## File structure and shared interfaces

- Create `src/lib/supabase/manual-payments.sql`: migration, ràng buộc, quyền và RPC; không sửa SQL cũ để rollout chỉ cần một tệp mới.
- Create `src/features/subscription/payments/types.ts`: `PaymentStatus`, `PaymentOrder`, `PaymentEvent`, `PaymentDetail`, `PaymentCursor`, `PaymentPage`.
- Create `src/features/subscription/payments/api.ts`: các hàm chuẩn bị/xác nhận/hủy/đọc/duyệt/phản hồi, kiểm tra hình dạng phản hồi và lỗi có mã.
- Create `src/features/subscription/payments/use-payment-orders.ts`: hook danh sách, detail và mutation có account scope/generation, làm mới và cleanup.
- Create `src/features/subscription/payments/payment-status.tsx`: nhãn/trạng thái dùng chung, nhánh dữ liệu cũ và định dạng ngày giờ Việt Nam.
- Create `src/features/subscription/payments/order-detail-dialog.tsx`: dialog chi tiết và nhật ký, truyền action từ checkout/ADMIN, không tự cấp gói.
- Modify `src/features/subscription/components/payment-dialog.tsx`: thay demo bằng checkout thật; tách subcomponent nếu file quá dài.
- Create `src/features/subscription/payments/payment-history.tsx`: lịch sử khách, tổng tiền đã duyệt, lọc, xem thêm và tiếp tục nháp.
- Modify `src/app/profile/page.tsx`: thêm tab `payments`, query/deep link và Suspense nếu dùng `useSearchParams`; các tab cũ giữ nguyên.
- Create `src/features/subscription/payments/admin-payments.tsx` and `src/app/admin/payments/page.tsx`: danh sách/chi tiết ADMIN; page là wrapper gọn có Suspense cho query.
- Modify `src/app/admin/layout.tsx`: thêm Thanh toán vào Vận hành; không nhân bản kiểm tra ADMIN ở các component con.
- Create `scripts/test-manual-payments-db.mjs`, `scripts/test-manual-payments-ui.mjs`, `scripts/check-payment-layout.mjs`; modify `scripts/test-pricing-ui.mjs` và các assert số mục ADMIN nếu cần.
- Create `docs/manual-payments-rollout.md`: SQL/config/nghiệm thu và CMD stage riêng file thuộc đợt này.

### Data contract

`PaymentOrder` dùng tên trường snake_case của máy chủ: `id`, `flow_version`, `order_code`, `plan_code`, `status`, `created_at`, `confirmed_at`, `reviewed_at`, `transfer_code`, `amount_vnd`, `list_price_vnd`, `discount_percent`, `discount_amount_vnd`, `discount_source`, `buyer_snapshot`, `plan_snapshot`, `bank_snapshot`, `subscription_id`, `result_expires_at`, `admin_note`. Snapshot được phép `null` chỉ với dữ liệu cũ.

`buyer_snapshot = {name, email, phone}`; `plan_snapshot = {name, account_tier, duration_days}`; `bank_snapshot = {bank_name, account_number, account_holder, qr_image_url}`. ADMIN còn nhận `user_id`, `reviewed_by`; DTO khách không nhận danh tính người xử lý. `PaymentEvent = {id, event_type, body, created_at}`; DTO ADMIN có thêm người xử lý.

`PaymentDetail = {order: PaymentOrder, events: PaymentEvent[]}`. `PaymentCursor = {created_at: string, id: string}`. `PaymentPage = {items: PaymentOrder[], next_cursor: PaymentCursor | null, summary: {approved_total_vnd: number, pending_count: number}}`.

Các RPC mutation/read detail trả `{success: true, order, events}`; list trả `{success: true, items, next_cursor, summary}`. Lỗi nghiệp vụ trả `{success: false, code, message}` không mang dữ liệu đơn khác. Lỗi transaction ngoài dự kiến được rollback và API chuyển thành lỗi thử lại, không giả thành công.

Danh sách dùng `p_status TEXT` với giá trị `all`, `open`, `pending`, `approved`, `closed`, `draft`; `open = draft/pending`, `closed = rejected/cancelled`. Các RPC list có `p_limit INTEGER DEFAULT 20`, `p_cursor_created_at TIMESTAMPTZ DEFAULT NULL`, `p_cursor_id UUID DEFAULT NULL`; ADMIN thêm `p_search TEXT DEFAULT ''`. Tìm kiếm tối đa 100 ký tự, so khớp văn bản bằng SQL parameter, không ghép SQL động từ input.

## Task 1: Đơn, quyền và kích hoạt nguyên tử trên máy chủ

**Files:** Create `src/lib/supabase/manual-payments.sql`, `scripts/test-manual-payments-db.mjs`.

**Interfaces:** Produces `prepare_payment_order(p_plan_code TEXT, p_request_id UUID)`, `confirm_payment_order(p_order_id UUID)`, `cancel_payment_order(p_order_id UUID)`, `get_my_payment_orders`/`admin_get_payment_orders` theo contract trên, `get_my_payment_order(p_order_id UUID)`/`admin_get_payment_order(p_order_id UUID)`, `admin_approve_payment_order(p_order_id UUID)`, `admin_reply_payment_order(p_order_id UUID,p_message TEXT)`, `admin_reject_payment_order(p_order_id UUID,p_message TEXT)` — tất cả trả JSONB.

- [ ] Write failing PGlite integration tests with isolated auth roles, profiles, bank/plans, notifications and streak schema. Use real SQL; assert prepare returns memo `DANG DUC VIET 0901234567 FD...`, amount `69500` for a `139000` plan at 50%, and `used_at = NULL` before approve.
- [ ] Run `node --test scripts/test-manual-payments-db.mjs`; expect failure because migration/RPCs do not exist.
- [ ] Implement migration preflight, new snapshot/event columns/tables, conditional unique request/code/open-order/subscription-order indexes. Keep all old records `flow_version = 0`; new orders use version 1. Revoke direct and column-level table writes; pin definer paths and restrict execute. Revoke old `create_payment_order` execute; replace old streak trigger with one coordinated consumption path.
- [ ] Implement prepare/confirm/cancel/read RPCs: profile lock first, request UUID retries, one active order, exact plan allowlist/settings checks, authoritative snapshots/discount, normalized memo, immutable terms, stable pagination and safe customer DTOs. No bank instruction for an invalid quote. Notifications are private and confirmation idempotent.
- [ ] Implement ADMIN replies/reject/approve: resolve order owner without leaking to unauthorized callers, lock profile → order → voucher consistently; verify authenticated ADMIN. Approve writes subscription/profile/order/event/inbox in one transaction and returns stored result on retries. Reject requires 1–1.000 characters; reply keeps pending. Failed voucher or notification write leaves the order pending and does not grant a subscription.
- [ ] Add/run tests for role spoofing/profile email, direct column writes, cross-account reads/cancel/confirm, bank disabled/missing phone, malformed filters/cursors, same timestamps, all five plans, referral vs streak, late approval, voucher fingerprint mismatch, cancellation, account Infinity before/after creation, carry-over/expired FlyMax, retry/race winner, rollback, exact notifications and unchanged legacy rows. Run migration twice. PGlite queues requests: disclose this limitation; independently review SQL lock order, unique constraints and atomicity rather than claiming multi-connection stress was tested.
- [ ] Verify targeted database tests pass and no credentials/live calls exist; commit only these tested files if isolated integration workflow permits it.

## Task 2: Typed API và checkout khách hàng

**Files:** Create types/api/hooks/status module and shared detail dialog listed above; modify `payment-dialog.tsx`; create UI tests; update affected pricing tests.

**Interfaces:** Consumes Task 1 RPCs. Produces `preparePaymentOrder(planCode: PaidPlanCode, requestId: string): Promise<PaymentDetail>`, `confirmPaymentOrder(id: string)`, `cancelPaymentOrder(id: string)`, `getPaymentOrders(options: {admin?: boolean; status: string; search?: string; cursor?: PaymentCursor; limit?: number}): Promise<PaymentPage>`, `getPaymentOrder(id: string, admin?: boolean): Promise<PaymentDetail>`, `approvePaymentOrder(id: string)`, `replyPaymentOrder(id: string,message: string)`, `rejectPaymentOrder(id: string,message: string)`; mutation/detail functions return `Promise<PaymentDetail>`.

- [ ] Write failing actual-component jsdom tests: missing phone requires input before prepare; profile save failure creates no order; server quote overrides client price; confirm never calls profile membership update; lost-response retry sends the same `request_id`; no success after RPC error; user swap while waiting discards response. Update old pricing demo assertion to the real submit flow, without mocking the actual payment component.
- [ ] Run `node --test scripts/test-manual-payments-ui.mjs scripts/test-pricing-ui.mjs`; expect failure for absent API/real checkout.
- [ ] Implement typed API response validation, readable business errors and missing migration `PGRST202` handling. Add `usePaymentOrders(options)` returning `{items,summary,nextCursor,loading,loadingMore,error,refresh,loadMore}` and `usePaymentOrder(id,admin)` returning `{detail,loading,error,refresh}`; hide state immediately if the auth UID no longer matches. Requests have generations; refresh/load-more cannot append stale pages. Poll every 60s only when visible and pending/open work exists; focus refresh and cleanup.
- [ ] Replace demo checkout with keyed account/plan state, explicit create/continue action, profile save/refresh, stable in-memory request token, server quote, snapshot bank/QR/copy fields, “Tôi đã chuyển tiền” and pending/history CTA. An existing different-plan order is shown clearly, not relabelled as the requested plan. Only draft cancellation with unchecked “Tôi chưa chuyển tiền” acknowledgment; closing never cancels. QR has explicit amount/memo instruction and a fallback for failed image. No sensitive persistent browser storage.
- [ ] Implement `PaymentStatusBadge({order})` and `OrderDetailDialog({open,onOpenChange,detail,loading,error,actions?})`; use existing Radix, semantic theme colors, readable text and safe plain-text responses. No raw HTML, service key or client activation.
- [ ] Run UI tests including delayed/canceled requests, account swap, clipboard failure, old snapshots and phone leading zero; expected all targeted checks pass.

## Task 3: Lịch sử mua gói trong Thông tin tài khoản

**Files:** Create `payment-history.tsx`; modify `src/app/profile/page.tsx`; extend UI tests.

**Interfaces:** Consumes Task 2 API/hooks/detail. Produces `PaymentHistory({initialOrderId?: string})`, profile tab `payments` and `/profile?tab=payments&order=<UUID>`.

- [ ] Write failing component tests: 20-row first page and stable load-more, all-history approved total independent of filter, empty vs failure, old approved label without invented expiry, private/malformed deep link, pending reply, draft resume, auth switch while detail loads, and refreshUser after approval.
- [ ] Run UI history cases; expect failure because history tab does not exist.
- [ ] Implement filter/list/summary/loading/error/refresh/load-more, detail dialog and draft resume using real checkout/detail APIs. Never convert gift/referral rewards into money history or trust current profile expiry as a past transaction result.
- [ ] Add fourth profile nav item, responsive four-item layout and strict query parsing; use Suspense around `useSearchParams`. Keep personal/membership/security components, routes/auth and all their operations unchanged. Order query opens only an owned order; switching/closing updates only known query values through fixed route `/profile`.
- [ ] Run targeted UI + existing profile/pricing regressions; expected no incorrect totals, data leakage or broken old tabs.

## Task 4: ADMIN quản lý, phản hồi và duyệt một-click

**Files:** Create admin component/page; modify admin layout; extend payment/admin layout UI tests.

**Interfaces:** Consumes Tasks 1–2. Produces `/admin/payments`, deep link `?order=<UUID>` and Thanh toán nav item under Vận hành.

- [ ] Write failing tests: pending default/filter/search/reset cursor, one-click approve once while busy, server rejection leaves row unresolved, required reject reason, reply keeps pending, retry refreshes correct order, legacy has no approve action and long buyer data stays in detail. Check nav/mobile selection route and no main-user navigation changes.
- [ ] Run `node --test scripts/test-manual-payments-ui.mjs scripts/test-admin-layout-ui.mjs`; expect absence of ADMIN payments UI.
- [ ] Implement list/table responsive cards, pending count/search debounce, filters/page reset, shared detail dialog and guarded operations. Approve label exactly “Đã nhận tiền · Kích hoạt”, adjacent reminder to verify bank receipt; no second confirm dialog. Replies clearly say customer can read them. Rejected/approved races refetch actual status, never overwrite stale status locally.
- [ ] Add nav item and Suspense wrapper; keep global ADMIN guard and trust the server for sensitive operations. Missing migration message shows `manual-payments.sql` only to ADMIN. No direct subscriptions/profiles updates or global notification broadcasts.
- [ ] Run ADMIN + checkout/history + real database tests. Expected one subscription/order and correct notifications/status after retry, no duplicate grant.

## Task 5: Kiểm thử toàn bộ và bàn giao SQL trước web

**Files:** Create `scripts/check-payment-layout.mjs`, `docs/manual-payments-rollout.md`; update spec/plan completion evidence after verification only.

- [ ] Add local-only Chrome/Playwright layout/interaction tests at 1440×900, 375×812 and 844×390, Sol/Luna and reduced-motion. Use isolated fake auth/network fixtures at the boundary, render production components, block live services, never use the real Chrome profile. Assert no page errors/horizontal overflow, 44px actionable targets, reachable confirm/history/approve buttons, scrollable long detail, focus escape/return and safe bottom content. Use allowed short/long buyer and response fixtures.
- [ ] Run browser tests against a local production server; if no safe auth fixture harness is feasible, document precisely which authenticated visual cases remain manual rather than claim them tested.
- [ ] Run `node --test --test-concurrency=2` over all `src/**/*.test.mjs` and `scripts/test-*.mjs` except `test-production-smoke.mjs`; run targeted ESLint and `node node_modules/typescript/bin/tsc --noEmit --incremental false`. Preserve user changes; do not use `git add .`.
- [ ] Build with `node node_modules/next/dist/bin/next build --webpack`, backup/restore exact `public/sw.js` in try/finally and verify hash. Run local production HTTP smoke; stop only servers started for this task. Record real warnings/limits separately from failures.
- [ ] Write rollout instructions for the single SQL, prerequisites/preflight, bank settings `is_enabled`, initial ADMIN/customer checks, one controlled owner-run transfer, history and notification verification. Show SQL-before-web order and that customer confirmation is not proof of payment. Do not rerun old subscription/streak SQL afterwards.
- [ ] Supply CMD with exact task files to stage/commit/push; do not claim deployed without deployment evidence. If SQL is not confirmed, hold the web release and deliver SQL/handoff first. Update plan checkboxes with actual results, not intended results.

## Execution handoff

Execution method preserved from the user: implement directly in this conversation. Written spec has been approved; this plan now awaits review. Do not implement product code before the plan review gate has been satisfied or the user explicitly waives that remaining gate.
