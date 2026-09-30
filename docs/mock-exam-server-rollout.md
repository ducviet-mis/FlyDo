# Chấm thi thử trên máy chủ — triển khai an toàn

SQL bảo vệ hồ sơ (`account-security-hardening.sql`) **không thay thế** SQL chấm thi.
Không chạy lại SQL tạo bảng ban đầu, không xóa dữ liệu hay kết quả cũ.

## Thứ tự bắt buộc

1. Chạy toàn bộ `src/lib/supabase/mock-exam-server-grading.sql` trong Supabase SQL
   Editor. Tệp này thêm phiên thi và các hàm chấm thi, chưa khóa luồng web cũ.
   Nếu báo lỗi, giao dịch tự hủy; gửi nguyên thông báo lỗi, không chạy tiếp.
2. Báo đã chạy tệp **grading** thành công. Sau đó mới đẩy bản web dùng phiên thi
   mới, chờ Vercel triển khai thành công và kiểm tra một bài thi thử.
3. Khi bản web mới đã hoạt động, chạy toàn bộ
   `src/lib/supabase/mock-exam-server-lockdown.sql`.
   Bước này mới khóa việc đọc đáp án trực tiếp và tự ghi/sửa điểm từ trình duyệt.
   Chọn lúc ít học sinh thi; cho bài đang làm trên bản web cũ hoàn tất trước bước
   này. Tab web cũ cần tải lại sau khi triển khai.

Cả hai tệp chạy lại được. Bước 1 an toàn với web cũ. **Không chạy tệp lockdown
trước bước 2**, vì phòng thi cũ vẫn đọc đáp án và tự ghi điểm.

## Thay đổi đã chuẩn bị

- Phiên thi bắt đầu/tiếp tục trên máy chủ; tải lại không tạo thêm thời gian.
- Trình duyệt chỉ nhận nội dung, lựa chọn và hình vẽ; không nhận đáp án/lời giải
  từ phiên thi đang làm. Quyền đọc ngân hàng bị khóa ở bước 3.
- Lưu từng lựa chọn theo hàng đợi; có bản nháp trên thiết bị, báo lỗi và thử lại.
  Hai cửa sổ cùng sửa được phát hiện qua phiên bản, không ghi đè âm thầm.
- Máy chủ kiểm tra chủ sở hữu, câu hỏi, lựa chọn, hạn nộp và tự tính điểm.
  Không nhận `score`, `correct_count`, `user_id` hay thời lượng từ trình duyệt.
- Khi hết hạn, chỉ chấm đáp án máy chủ đã nhận trước hạn. Nếu mất mạng đến hết
  giờ, đáp án chưa gửi được không thể được xác nhận là đúng hạn bằng đồng hồ
  trên thiết bị. Giao diện báo rõ hạn chế này.
- Nộp lại sau mất mạng / bấm hai lần trả cùng một kết quả, không nhân đôi bài.
- Bộ đề được chụp tại lúc bắt đầu; ADMIN sửa/xóa câu hỏi sau đó không thay đổi
  bộ câu hỏi và đáp án của phiên đã chụp. Xóa toàn bộ đề vẫn theo hành vi cũ:
  các bản ghi phụ thuộc bị xóa theo khóa ngoại, không thay đổi trong bản này.
- Kết quả cũ vẫn xem được, không tự chấm lại hoặc coi là điểm đã được máy chủ
  xác minh. Không thể tái tạo bộ đề lịch sử trước khi có tính năng chụp phiên.
- Giữ điều hướng, full-screen desktop, báo lỗi câu hỏi, thống kê/FlyTiee và
  phong cách Sol/Luna. Đồng hồ dùng thời gian đơn điệu, không tăng giờ khi đổi
  đồng hồ hệ điều hành; máy chủ vẫn là nguồn quyết định cuối cùng.

Đây không phải hệ thống chống gian lận tuyệt đối: học sinh vẫn có thể nhớ đáp
án từ lần thi trước hoặc chia sẻ đáp án sau khi nộp. Phần này bảo vệ cách chấm
và dữ liệu điểm, không giám sát màn hình hay hành vi ngoài trình duyệt.

## Kiểm thử không chạm dữ liệu thật

- `node scripts/test-mock-exam-server.mjs`: PostgreSQL/PGlite; SQL chạy lại,
  khóa quyền, ADMIN đã xác thực email, chủ sở hữu, dữ liệu giả mạo, hạn nộp,
  đáp án đến muộn, phiên bản, nộp lặp, bản chụp, thi lại và kết quả cũ.
- `node scripts/test-server-exam-ui.mjs`: hook/phòng thi/kết quả React thật;
  hàng đợi lưu, mất mạng, bản nháp, đồng bộ hai cửa sổ, đổi tài khoản, khôi phục
  sau mất phản hồi, tự nộp/thử lại, hủy yêu cầu treo sau 20 giây, trình duyệt
  chặn bộ nhớ và đổi đồng hồ hệ điều hành. Không truy vấn trực tiếp đáp án/ghi điểm.
- Các kiểm thử hiệu năng, hồi quy, báo lỗi và bảo vệ hồ sơ hiện có.
- Build/typecheck production và lint; không thực hiện bài thi thật bằng tài
  khoản học sinh trên Supabase khi kiểm thử.

Sau bước 3, kiểm tra trên Supabase bằng tài khoản học sinh: đọc trực tiếp bảng
`mock_exam_questions` không trả đáp án; tự insert/update/delete điểm bị từ chối;
ADMIN vẫn thêm/sửa câu hỏi bình thường. Kiểm tra này cần tài khoản thật do người
quản trị thực hiện, không thể thay thế hoàn toàn bằng kiểm thử cục bộ.
