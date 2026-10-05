# Thi thử: câu trả lời ngắn

## Thứ tự đưa lên web

1. Trong Supabase SQL Editor, mở và chạy **toàn bộ** `src/lib/supabase/mock-exam-short-answer.sql`. Tệp yêu cầu hệ thống chấm thi máy chủ, lockdown và nhập JSON đã cài trước đó. Nếu báo lỗi thì dừng, chưa đẩy web.
2. Khi SQL thành công, đẩy các commit web lên GitHub; chờ Vercel triển khai thành công.
3. Tải lại tab FlyDo. Chỉ nhập câu trả lời ngắn sau khi phiên bản web mới đã lên.

Không chạy lại SQL schema / nhập JSON / grading cũ sau bước 1: chúng có thể ghi đè RPC hoặc chính sách đã nâng cấp. Tệp mới có thể chạy lại, không xóa câu hỏi, điểm, lịch sử hay bản chụp phiên thi cũ. Bản web cũ vẫn làm được đề chỉ trắc nghiệm sau nâng cấp SQL; không dùng bản cũ để làm đề trộn.

## Nhập câu hỏi

ADMIN → Nhập đề JSON → Thi thử → Lớp → Danh mục → Đề thi. Chọn mẫu “Trả lời ngắn” rồi sao chép mẫu / prompt nếu cần. Dán JSON → Kiểm tra và xem trước → kiểm tra từng câu → Duyệt và nhập. Một đề được trộn hai loại câu, mỗi lượt tối đa 100 câu; một câu lỗi thì không câu nào được nhập.

Mẫu nhập hoàn chỉnh: `question-sets/examples/mock-exam-short-answer.json` (1 trắc nghiệm + 2 trả lời ngắn). Bộ chọn mẫu không chuyển đổi câu đã dán. Tự luyện vẫn chỉ trắc nghiệm.

```json
{
  "questions": [
    {
      "question_type": "short_answer",
      "content": "Tính $1 : 2$.",
      "accepted_answers": ["0,5", "0.5", "1/2"],
      "solution": "Kết quả là một phần hai.",
      "diagram": null
    }
  ]
}
```

## Quy tắc đáp án

- `accepted_answers`: 1–20 **chuỗi**, không dùng số JSON. Mỗi chuỗi tối đa 200 ký tự Unicode thô, từ 1–100 sau chuẩn hóa. Các đáp án trùng sau chuẩn hóa được gộp, giữ cách viết đầu tiên.
- Chỉ gộp khoảng trắng thường, tab, xuống dòng, CR, form feed, vertical tab và NBSP; bỏ các khoảng trắng đó ở đầu/cuối. Không bỏ dấu, không đổi hoa/thường, không đổi dấu phẩy/chấm hoặc tự biến đổi biểu thức.
- Muốn nhận cả `0,5`, `0.5`, `1/2` thì liệt kê đủ. Muốn nhận đơn vị thì khai báo cách viết kèm đơn vị. Không tự chấp nhận `2/4`, `50%`, `0.50` khi chưa liệt kê.
- Đáp án học sinh tối đa 100 ký tự Unicode thô. Để trống không tính đã làm. Câu trả lời ngắn không có `options` và `correct_answer`; nếu cung cấp thì phải là `[]` và `null`.
- Câu trắc nghiệm giữ 4 phương án và `correct_answer` 0–3. Thiếu `question_type` vẫn hiểu là trắc nghiệm.
- Hình học dùng `diagram` như cũ. Công thức trong JSON phải escape dấu gạch chéo ngược, ví dụ `"\\frac{1}{2}"`.

Điểm vẫn bằng `10 × số câu đúng / tổng số câu`, làm tròn 2 chữ số; mọi câu cùng trọng số. Máy chủ chấm theo bản chụp lúc mở đề, chỉ nhận đáp án trong hạn. Đáp án đúng/lời giải chỉ trả về sau nộp cho chủ bài làm. Kết quả và báo lỗi hỗ trợ cả hai loại.

Lịch sử rất cũ chưa có bản chụp vẫn giữ nguyên điểm. Phần chi tiết của các lượt này chỉ lấy câu trắc nghiệm đã tồn tại khi nộp, không trả câu thêm sau đó hoặc đáp án trả lời ngắn mới.

## Lệnh CMD sau khi SQL thành công

Các commit của tính năng đã được tạo riêng. Không dùng `git add .`, tránh đưa dữ liệu tác giả đang làm hoặc file phát sinh vào commit.

```bat
cd /d C:\Users\Admin\.gemini\antigravity\scratch\edu-tutor
git status
git push origin main
```

Nếu push thất bại, giữ nguyên dữ liệu và gửi nguyên thông báo lỗi. Không reset, force push hay xóa project. Chưa chạy SQL / chưa deploy thật trong bước kiểm thử của agent.

## Xác minh trong môi trường thử nghiệm

Đã qua: 27 kiểm thử source, 11 kiểm thử UI ADMIN, các kiểm thử model/parser/PGlite chấm thi và nhập JSON, phòng thi/lưu bài/kết quả, báo lỗi và hồi quy; TypeScript; lint các file sửa (0 lỗi, 2 cảnh báo effect có sẵn); build production Next.js. Review độc lập đã đóng lỗi lộ đáp án mới từ lịch sử không có bản chụp. UI được kiểm bằng tương tác React/DOM thật với dịch vụ từ xa giả lập, chưa kiểm trên iPhone vật lý hoặc Supabase production.
