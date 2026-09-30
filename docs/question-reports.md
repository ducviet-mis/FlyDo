# Báo lỗi câu hỏi

## Cài đặt

Chạy toàn bộ `src/lib/supabase/question-reports.sql` trong Supabase SQL Editor.
Hệ thống Thông báo (`src/lib/supabase/notifications.sql`) phải được cài trước.
Script có thể chạy lại, không xóa dữ liệu bài học hay thay đổi điểm số hiện có.
Nếu chưa chạy SQL, các trang học vẫn hoạt động; khi gửi báo lỗi, người dùng nhận thông báo tính năng chưa được cài đặt.

## Sử dụng

- Nút **Báo lỗi** nằm cạnh số câu ở Tự luyện (bao gồm luyện câu sai và câu đã lưu), phòng Thi thử và lời giải sau thi.
- Học sinh chọn một trong sáu lý do, có thể bổ sung mô tả; lý do “Lỗi khác” cần mô tả.
- Nội dung câu hỏi, đáp án, lời giải, hình vẽ và bài/đề được chụp từ dữ liệu trên máy chủ khi tiếp nhận.
- Đồng hồ thi tiếp tục chạy khi hộp báo lỗi mở. Báo lỗi không chọn đáp án, chấm điểm hay sửa câu hỏi.
- ADMIN mở **Báo lỗi câu hỏi**, lọc theo nguồn, lý do và tình trạng, chọn báo lỗi để đọc và phản hồi.
- Bốn trạng thái: Mới, Đang kiểm tra, Đã xử lý, Không xác nhận lỗi. Hai trạng thái kết thúc cần phản hồi.
- Khi gửi phản hồi, hệ thống cập nhật tình trạng, lưu lịch sử và tạo thông báo riêng cho người báo lỗi trong cùng một giao dịch. Nội dung hiện trong dropdown/hộp chi tiết Thông báo có sẵn.
- Muốn sửa câu hỏi gốc, ADMIN dùng màn hình Quản lý Tự luyện/Thi thử hiện tại. Báo lỗi không tự sửa bộ đề.

## Bảo vệ dữ liệu

Học sinh không có quyền đọc danh sách báo lỗi/bản chụp đáp án hoặc cập nhật tình trạng.
Quyền ADMIN được kiểm tra trong SQL theo cùng danh sách email quản trị hiện có.
Bản chụp giữ nguyên khi câu gốc bị sửa/xóa. Các báo lỗi còn mở của cùng tài khoản/câu hỏi không tạo trùng.
Mỗi tài khoản gửi tối đa 20 báo lỗi mới/ngày, theo giờ Việt Nam. Gửi lại phản hồi sau mất kết nối không tạo thông báo trùng.
Nếu hai ADMIN cùng xử lý một báo lỗi, người lưu sau cần tải lại tình trạng mới nhất.

## Kiểm thử độc lập

Không cần kết nối Supabase thật. Chuẩn bị công cụ kiểm thử trong thư mục tạm:

```powershell
npm install --prefix tmp/question-report-db-test --no-save --package-lock=false @electric-sql/pglite@0.3.14 jsdom@26.1.0
node scripts/test-question-reports.mjs
node scripts/test-question-report-ui.mjs
node --test src/features/practice/hooks/use-question-nav.test.mjs
npx tsc --noEmit --incremental false
npm run build
```

Các bài kiểm thử SQL dùng PostgreSQL tạm trong bộ nhớ: kiểm tra RLS, quyền ADMIN, bản chụp hai nguồn, chống trùng, phản hồi riêng, gửi lại an toàn, xung đột cập nhật, giới hạn ngày và hoàn tác khi tạo thông báo thất bại.
Kiểm thử giao diện kiểm tra lý do/mô tả, khóa nút gửi, lỗi chưa chạy SQL, giữ bản nháp, gửi thành công, đổi câu và yêu cầu đăng nhập.
