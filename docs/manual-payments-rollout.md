# Chuyển khoản và kích hoạt gói — triển khai an toàn

## Những phần đã thêm

- Khách tạo đơn với báo giá chính thức, họ tên/SĐT và mã đơn riêng. Đóng cửa sổ vẫn giữ đơn.
- “Tôi đã chuyển tiền” gửi yêu cầu riêng tới ADMIN; **chưa cấp gói**.
- ADMIN → Thanh toán: kiểm tra, phản hồi, không duyệt có lý do hoặc **Đã nhận tiền · Kích hoạt** một-click.
- Tài khoản → Lịch sử thanh toán: bộ lọc, số tiền đã đối chiếu, chi tiết và phản hồi ngay trên trang.
- Giá/ngày gói, ưu đãi, trạng thái và quyền kích hoạt được kiểm tra trên máy chủ. Không đặt khóa quản trị trong trình duyệt.

## 1. SQL phải chạy trước web mới

Sao lưu dữ liệu theo quy trình vận hành của bạn trước khi thay đổi schema. Trong SQL Editor, chạy nguyên tệp:

`src/lib/supabase/manual-payments.sql`

Tệp chạy trong một transaction và chạy lại được. Nếu có lỗi thì không triển khai web mới: đọc lỗi và kiểm tra schema gói, notifications, learning-streak-rewards, bảo vệ hồ sơ, và ít nhất một tài khoản ADMIN đã xác nhận email thuộc allowlist hiện tại.

Tệp không xóa đơn cũ, không bật ngân hàng, không sửa JSON học tập. Đơn cũ được giữ là phiên bản 0; không có kích hoạt tự động khi thiếu dữ liệu lưu. Không chạy lại `subscription-schema.sql` hoặc `learning-streak-rewards.sql` sau migration này: các tệp cũ có thể phục hồi hàm tạo đơn/trigger đã được thay thế.

## 2. Kiểm tra cấu hình ngân hàng

Trong bảng `payment_settings`, hàng `id = 1`, nhập/kiểm tra:

| Trường | Ý nghĩa |
| --- | --- |
| bank_name | Ngân hàng nhận tiền thực tế |
| account_number | Số tài khoản; giữ số 0 đầu |
| account_holder | Tên chủ tài khoản thực tế |
| qr_image_url | Ảnh QR tài khoản HTTPS, có thể để trống |
| is_enabled | Chỉ bật `true` khi đã kiểm tra thông tin và sẵn sàng tiếp nhận |

Không tự điền ngân hàng hoặc bật nhận đơn khi chưa có thông tin chính xác. QR tĩnh không mặc nhiên chứa số tiền/nội dung riêng của đơn. Web nhắc khách nhập và kiểm tra cả hai.

Giá và thời hạn lấy từ `subscription_plans`, không lấy số tiền do trình duyệt gửi. Gói 1/3 tháng không ưu đãi; 6 tháng/năm/Infinity lấy mức cao hơn giữa referral tối đa 20% và streak 50%, không cộng dồn. Nháp giữ báo giá đến khi xử lý/hủy. Voucher chỉ dùng sau duyệt thành công.

## 3. Đẩy bản web sau khi SQL thành công

Các thay đổi mới hiện được giữ tại máy, chưa push. CMD dưới đây chỉ đưa lên các tệp của tính năng này, không đưa JSON/tài liệu khác đang sửa vào commit:

```cmd
cd /d C:\Users\Admin\.gemini\antigravity\scratch\edu-tutor
"E:\Git\cmd\git.exe" add src/lib/supabase/manual-payments.sql src/features/subscription/payments src/features/subscription/components/payment-dialog.tsx src/app/profile/page.tsx src/app/admin/layout.tsx src/app/admin/payments/page.tsx scripts/test-manual-payments-db.mjs scripts/test-manual-payments-ui.mjs scripts/test-pricing-ui.mjs scripts/test-admin-layout-ui.mjs scripts/test-audit-regressions.mjs scripts/check-payment-layout.mjs docs/manual-payments-rollout.md docs/superpowers/specs/2026-10-06-manual-payments-design.md docs/superpowers/plans/2026-10-06-manual-payments.md
"E:\Git\cmd\git.exe" diff --cached --stat
"E:\Git\cmd\git.exe" commit -m "Add verified manual payments and purchase history"
"E:\Git\cmd\git.exe" push origin main
```

Đọc danh sách tệp trước khi commit. Nếu có tệp đã được stage từ công việc khác, dừng để tách chúng; không commit chung. Nếu Git báo safe.directory, chỉ thêm đúng đường dẫn repository sau khi xác minh đó là project của bạn.

## 4. Nghiệm thu do chủ web thực hiện

1. Mở gói bằng một tài khoản kiểm thử do bạn kiểm soát. Tên/SĐT phải đúng; memo có họ tên không dấu, SĐT và mã `FD…`.
2. Chưa chuyển tiền thì không bấm xác nhận; có thể hủy nháp sau khi tích “Tôi chưa chuyển tiền”. Hủy không phải hoàn tiền.
3. Khi thử khoản chuyển thật do bạn chủ động thực hiện, kiểm tra số tiền, tài khoản nhận và nội dung trên ngân hàng.
4. Sau nút khách xác nhận, ADMIN nhận thông báo riêng và thấy đúng tài khoản, gói, tiền, thời gian trong hàng chờ. Khách vẫn chưa có quyền gói mới.
5. **Chỉ sau khi nhìn thấy tiền thực nhận đúng giao dịch**, bấm “Đã nhận tiền · Kích hoạt”. Không dùng lời khai/ảnh chuyển khoản làm bằng chứng duy nhất.
6. Khách nhận thông báo và mở đúng chi tiết lịch sử. FlyMax giữ ngày còn lại khi gia hạn; FlyInfinity trọn đời. Thử lại thao tác không tạo subscription/cộng ngày lần hai.
7. Phản hồi/không duyệt có lý do gửi riêng tới khách. Xác nhận nháp, từ chối hoặc lỗi xử lý không dùng voucher.
8. Nếu tài khoản đã lên Infinity từ một nguồn khác hoặc kỳ voucher thay đổi, giữ đơn chờ để đối chiếu và liên hệ khách; không tự tăng giá, hoàn tiền hay xóa lịch sử.

Không có nhận tiền tự động từ ngân hàng, email/SMS, hoàn tiền tự động hoặc hóa đơn thuế trong phiên bản này. Lịch sử không thay thế biên lai ngân hàng.

## Kiểm thử tại máy

Test DB dùng PostgreSQL thử nghiệm cô lập (PGlite), test React dùng component thật với mạng/auth giả lập. Không có giao dịch hoặc dữ liệu demo chèn vào production. PGlite nối hàng các request, vì vậy kiểm tra retry/khóa/ràng buộc không thay cho stress test nhiều kết nối thật.

Browser kiểm tra component thật qua bundle thử nghiệm offline, dùng CSS của production build, không dùng tài khoản Chrome thật và chặn mọi dịch vụ ngoài. Luồng Next/middleware với đăng nhập thật vẫn cần nghiệm thu ở bước 4 sau khi bạn chạy SQL và triển khai web.

Các lệnh kiểm tra chính:

```cmd
node --test scripts/test-manual-payments-db.mjs scripts/test-manual-payments-ui.mjs scripts/test-pricing-ui.mjs scripts/test-admin-layout-ui.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/features/subscription/payments src/features/subscription/components/payment-dialog.tsx src/app/profile/page.tsx src/app/admin/layout.tsx src/app/admin/payments/page.tsx
node --test scripts/check-payment-layout.mjs
```

Test layout cần Chrome và Playwright. Nếu không cài trong project, đặt `FLYDO_BROWSER_MODULES` trỏ tới node_modules của runtime đã có. Không cần thêm dependency sản phẩm.
