# Nhập JSON Thi thử trực tiếp

## Triển khai

1. Dự án cần đã có `src/lib/supabase/mock-exam-true-false-scoring.sql`.
2. Chạy toàn bộ `src/lib/supabase/mock-exam-auto-publish-import.sql` trong SQL Editor trước khi triển khai code web mới. SQL mới bổ sung một hàm, không sửa dữ liệu các đề, lịch sử hoặc phiên thi đang diễn ra. Có thể chạy lại.
3. Đẩy code web sau khi SQL thành công. Không cần chạy lại các SQL nền tảng nếu đã cài.

## Thao tác

- ADMIN → Nhập JSON → Thi thử → chọn đề → dán JSON → **Nhập và đưa đề vào sử dụng**.
- **Kiểm tra và xem trước** chỉ là tùy chọn để kiểm tra công thức, hình vẽ và điểm; không bắt buộc.
- Câu mới được thêm sau các câu đã có, không thay thế câu cũ. Nhập lại cùng JSON sau một lần thành công vẫn là thêm câu mới.
- Phần **Điểm & cấu trúc** có một nút **Lưu cấu trúc điểm**. Cấu trúc hợp lệ được áp dụng ngay; không còn bước duyệt riêng.
- Có thể lưu tổng điểm dự kiến khi đề chưa có câu. Đề chưa đủ cấu trúc chưa được sử dụng; không tự đặt lại tổng điểm để bỏ qua lỗi.

## Kiểm tra và an toàn

- Đề chia điểm theo phần phải có tổng đúng 10 điểm, có câu trong các phần có điểm và mỗi câu có điểm dương. Điểm cố định được giữ; câu tự chia nhận phần điểm còn lại theo quy tắc hiện hành.
- Việc thêm câu, phân điểm và kích hoạt đề thực hiện trong cùng một giao dịch trên máy chủ. Lỗi ở bất kỳ bước nào hủy cả lần nhập. JSON vẫn giữ trên màn hình để sửa hoặc thử lại.
- Hàm mới kiểm tra ADMIN bằng tài khoản đã xác minh trong cơ sở dữ liệu và khóa phiên bản đề. Người dùng thường hoặc hai lần sửa trùng phiên bản không thể ghi đè.
- Nếu chưa chạy SQL mới, web báo tên tệp cần chạy, không tự dùng luồng cũ để nhập một đề chưa sử dụng được.
- Đề chế độ cũ giữ cách chia đều cũ. Muốn nhập Đúng/Sai hoặc điểm cố định phải chuyển sang chia điểm theo phần, có xác nhận riêng cho thay đổi cách chấm.
- Lịch sử và ảnh chụp cấu trúc điểm của phiên đang thi không thay đổi. Các đề nháp cũ không tự kích hoạt khi chạy SQL; nhập thêm JSON hợp lệ hoặc lưu cấu trúc hợp lệ để áp dụng.

## Kiểm tra sau triển khai

1. Tạo đề có các phần ABCD 2, Đúng/Sai 4, Trả lời ngắn 4; nhập cùng lượt 8 câu ABCD, 1 câu Đúng/Sai, 1 câu trả lời ngắn. Đề phải dùng được ngay; mỗi câu ABCD là 0,25 điểm.
2. JSON sai hoặc thiếu câu cho một phần có điểm: không thêm câu nào, giữ JSON và hiện lỗi.
3. Thay điểm cố định một câu rồi lưu cấu trúc: phần điểm còn lại tự chia, không cần kích hoạt lần nữa.
4. Mở Thi thử bằng tài khoản học sinh, bắt đầu đề vừa nhập; kiểm tra lịch sử cũ vẫn giữ điểm cũ.
5. Kiểm tra các nút nhập, xem trước và lưu điểm trên điện thoại lẫn máy tính.

Các kiểm tra tự động dùng cơ sở dữ liệu PostgreSQL cô lập và giao diện thật với ranh giới dịch vụ giả lập, không sửa Supabase đang vận hành. Kiểm tra nhiều kết nối đồng thời và triển khai thực tế vẫn cần thực hiện trong môi trường staging.
