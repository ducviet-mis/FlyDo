# FlyDo — câu hỏi trả lời ngắn trong Thi thử

Ngày: 05/10/2026. Trạng thái: đã triển khai trực tiếp và xác minh, kèm SQL/mẫu JSON/hướng dẫn bàn giao. Chưa chạy SQL hoặc deploy thật; chạy SQL mới trước khi đẩy GitHub.

## 1. Mục tiêu và phạm vi

Học sinh nhập một đáp án ngắn khi làm Thi thử. ADMIN nhập được câu hỏi loại này bằng JSON, xem trước đúng dạng và có mẫu sao chép. Một đề có thể gồm cả trắc nghiệm và trả lời ngắn.

Giữ nguyên điều hướng, tài khoản, giới hạn thời gian, cách tính điểm, hình học, lưu/khôi phục bài, báo lỗi câu hỏi và kết quả cũ. Giao diện dùng thành phần và màu Sol/Luna sẵn có, không thêm một phong cách mới.

Chỉ mở rộng Thi thử. Tự luyện, đề cá nhân lấy từ Tự luyện, lý thuyết và FlyTiee không đổi loại câu hỏi. Không có tự luận dài, chấm bằng AI, điểm từng phần hay trọng số mới.

## 2. Cơ sở trong mã hiện tại

- `src/features/question-import/json-import.ts` và trang ADMIN nhập JSON hiện yêu cầu bốn phương án cùng đáp án đúng 0–3.
- `mock_exam_questions.correct_answer` hiện bắt buộc là số nguyên. Cần bổ sung kiểu câu hỏi và nơi lưu đáp án ngắn, không đổi ý nghĩa cột đáp án trắc nghiệm.
- `use-server-exam.ts` hiện chỉ nhận đáp án số chỉ vị trí lựa chọn. Cần hỗ trợ chuỗi nhưng giữ hàng đợi lưu, phiên bản đồng bộ và cách xử lý hết giờ.
- SQL chấm thi giữ bản chụp câu hỏi lúc bắt đầu. Máy chủ kiểm tra chủ sở hữu, lưu bài, chấm điểm và chỉ trả đáp án/lời giải sau khi nộp.
- Trang kết quả và ADMIN tiếp nhận báo lỗi hiện hiển thị phương án A–D. Cả hai cần nhánh hiển thị trả lời ngắn.
- SQL báo lỗi lấy `to_jsonb(q)` từ câu hỏi trong cơ sở dữ liệu; trường mới sẽ được đưa vào bản chụp ADMIN mà không cần nhận đáp án do học sinh gửi lên.

## 3. Quy tắc đáp án được chấp nhận

Chọn so khớp với danh sách `accepted_answers` do ADMIN khai báo. Cách này hỗ trợ số và văn bản ngắn, kiểm chứng được và không phụ thuộc AI. Chỉ cho nhập số sẽ hạn chế các đáp án như tên hình; chấm ngữ nghĩa/tự luận không thuộc phạm vi.

- Danh sách gồm 1–20 chuỗi. Mỗi chuỗi sau chuẩn hóa dài 1–100 ký tự Unicode, trước chuẩn hóa không quá 200 ký tự; không chấp nhận số JSON, chuỗi rỗng hoặc đối tượng/mảng lồng nhau.
- Chuẩn hóa bằng cách bỏ khoảng trắng đầu/cuối và gộp khoảng trắng liên tiếp thành một dấu cách. Tập khoảng trắng dùng chung ở trình duyệt/máy chủ: U+0020, tab, LF, CR, form feed, vertical tab và U+00A0.
- Phân biệt chữ hoa/thường và dấu tiếng Việt; không tự bỏ dấu, đơn vị hay ký hiệu toán học. ADMIN có thể khai báo thêm các cách viết hợp lệ.
- Không tự biến đổi phân số, thập phân hoặc biểu thức. Để chấp nhận `0,5`, `0.5`, `1/2`, khai báo cả ba. Không dùng `eval`, không thực thi công thức do học sinh nhập.
- Đáp án học sinh tối đa 100 ký tự Unicode trước chuẩn hóa. Bỏ trống hoặc chỉ có khoảng trắng là chưa làm; không được tính đúng. Nội dung nhập được lưu như văn bản, không diễn giải thành HTML.
- Các đáp án mẫu trùng nhau sau chuẩn hóa được gộp; giữ cách viết của mục đầu để hiển thị. Giới hạn 20 áp dụng trước khi gộp để không nhận danh sách quá lớn.

## 4. Hợp đồng JSON và dữ liệu

Thêm `question_type` với hai giá trị `multiple_choice` và `short_answer`. Thiếu trường này được hiểu là trắc nghiệm, bảo đảm JSON cũ vẫn nhập được.

Trắc nghiệm giữ nguyên `options`, `correct_answer`, các bí danh đang hỗ trợ và quy ước A=0 đến D=3. Nhập JSON vẫn yêu cầu bốn phương án. Không làm hỏng các câu 2–4 phương án đang được phiên thi hỗ trợ khi đọc dữ liệu cũ.

Trả lời ngắn cần `content` và `accepted_answers`; `solution` và `diagram` giữ quy tắc hiện tại. Bản nhập có thể bỏ `options`/`correct_answer`; nếu có thì chỉ nhận `options: []`, `correct_answer: null`. Không nhận câu trả lời ngắn kèm phương án hoặc đáp án số để tránh dữ liệu mâu thuẫn. Câu trắc nghiệm không nhận danh sách đáp án ngắn khác rỗng.

```json
{
  "questions": [
    {
      "content": "Giá trị của $2 + 3$ là bao nhiêu?",
      "options": ["3", "4", "5", "6"],
      "correct_answer": 2,
      "solution": "Ta có $2 + 3 = 5$.",
      "diagram": null
    },
    {
      "question_type": "short_answer",
      "content": "Giải phương trình $x + 7 = 12$. Nhập giá trị của x.",
      "accepted_answers": ["5"],
      "solution": "Ta có $x = 12 - 7 = 5$.",
      "diagram": null
    },
    {
      "question_type": "short_answer",
      "content": "Tính kết quả của $1 : 2$.",
      "accepted_answers": ["0,5", "0.5", "1/2"],
      "solution": "Ta có $1 : 2 = 0,5$.",
      "diagram": null
    }
  ]
}
```

Đây là hợp đồng cần triển khai, chưa phải định dạng dùng được trên web hiện tại.

Cơ sở dữ liệu bổ sung `question_type` mặc định `multiple_choice` và `accepted_answers` JSONB mặc định `[]`. Cho phép `correct_answer` là NULL chỉ khi loại câu là trả lời ngắn. Ràng buộc dữ liệu kiểm tra rõ từng loại: không cho phép kiểu lạ, mảng đáp án rỗng, đáp án quá dài hay cấu trúc lai. Không sửa/xóa nội dung, thứ tự, bài làm hoặc điểm cũ.

Parser nhập JSON nhận thêm ngữ cảnh đích nhập. Không cho nhập `short_answer` vào Tự luyện. Duy trì các dạng bao ngoài `questions`, mảng trực tiếp và `data.questions`, giới hạn 100 câu, kiểm tra hình học và số thứ tự câu trong lỗi.

RPC nhập JSON kiểm tra lại độc lập với trình duyệt: ADMIN đã xác thực email, đích nhập hợp lệ, kiểu và giới hạn của từng câu. Một câu lỗi thì toàn bộ lượt nhập không được lưu. Giữ khóa đề và thứ tự thêm nối tiếp để tránh trùng khi nhập đồng thời.

## 5. Trải nghiệm ADMIN

Trong phần tạo mẫu/prompt của đích Thi thử, thêm lựa chọn dạng câu hỏi: “Trắc nghiệm” hoặc “Trả lời ngắn”. Có mẫu sao chép riêng cho trả lời ngắn và hướng dẫn khai báo các cách viết hợp lệ. Lựa chọn này chỉ điều khiển mẫu/prompt, không ép toàn bộ JSON cùng một loại; JSON trộn hai loại vẫn được nhận.

Xem trước cho biết loại từng câu. Trắc nghiệm giữ A–D; trả lời ngắn hiển thị các đáp án được chấp nhận cùng lời giải và hình. Thông báo lỗi nêu đúng số câu và trường cần sửa. Chuyển đích nhập phải kiểm tra lại, không dùng kết quả xem trước cũ để nhập sai nơi.

ADMIN tiếp nhận báo lỗi hiển thị câu trả lời ngắn và danh sách đáp án hệ thống thay cho khối bốn phương án. Giữ cơ chế phản hồi và gửi Thông báo hiện tại. Báo lỗi cũ thiếu `question_type` vẫn hiển thị như trắc nghiệm.

## 6. Trải nghiệm học sinh và lưu bài

Câu trả lời ngắn có nhãn “Nhập đáp án”, một ô văn bản một dòng và chỉ dẫn ngắn rằng không cần viết lời giải. Dùng ô văn bản thay vì ô số để nhập được số âm, dấu phẩy, phân số và tên hình. Không lộ gợi ý từ đáp án hệ thống.

Ô nhập có nhãn truy cập được, focus rõ, tương thích bàn phím mobile và không chuyển sang câu khác khi đang gõ. Giữ vị trí ô trả lời bên dưới đề/hình, nút trước/sau, đồng hồ, nút nộp và báo lỗi hiện tại.

Đáp án phiên thi là ánh xạ ID câu hỏi → chỉ số số nguyên đối với trắc nghiệm, hoặc chuỗi đối với trả lời ngắn. Kiểm tra bản nháp theo loại câu; không nhận đáp án ID ngoài bộ đề, dữ liệu quá dài hoặc sai kiểu. Xóa nội dung đã nhập cũng phải xóa đáp án tương ứng trên máy chủ, không khôi phục lại đáp án cũ khi tải lại.

Tái sử dụng hàng đợi lưu hiện tại; không gửi yêu cầu đồng thời hoặc tạo hệ thống lưu thứ hai. Có thể gộp các thay đổi đang gõ trong cùng hàng đợi. Nút thử lưu/nộp gửi bản mới nhất, có trạng thái đang lưu/lỗi rõ. Câu chỉ chứa khoảng trắng không làm tăng số câu đã trả lời; A có chỉ số 0 vẫn được tính là đã làm.

Giữ phiên bản đồng bộ hai cửa sổ, tách dữ liệu theo tài khoản/phiên, bản nháp thiết bị và đồng hồ máy chủ. Không thêm thời gian khi tải lại. Sau hạn nộp chỉ chấm nội dung máy chủ đã nhận đúng hạn; không dùng thời gian thiết bị để hợp thức hóa bản nháp đến muộn.

## 7. Chấm điểm và bảo mật

Hàm bắt đầu phiên chụp đủ kiểu câu và đáp án riêng trên máy chủ. Bản công khai trả nội dung, hình, thứ tự, kiểu câu và phương án khi là trắc nghiệm; tuyệt đối không trả `accepted_answers`, `correct_answer` hoặc lời giải khi đang thi. Phiên cũ thiếu trường kiểu câu được xử lý như trắc nghiệm.

Máy chủ kiểm tra và chuẩn hóa đáp án học sinh theo quy tắc mục 3, so với một trong các đáp án chấp nhận. Đề hỗn hợp vẫn chấm mỗi câu cùng trọng số: `round(10 * số_câu_đúng / tổng_số_câu, 2)`.

Giữ kiểm tra chủ sở hữu, hạn nộp, số phiên bản, khóa ghi, giới hạn tổng kích thước đáp án hiện có và tính lặp an toàn của nộp bài. Đáp án/lời giải được giữ theo bản chụp, ADMIN sửa câu sau khi bắt đầu không đổi cách chấm phiên đó.

RPC kết quả sau nộp trả thêm trạng thái đúng/sai của từng câu theo cùng hàm chấm trên máy chủ. Giao diện không tính lại độ đúng của trả lời ngắn bằng một thuật toán riêng. Kết quả trắc nghiệm lịch sử chưa có trạng thái mới vẫn đọc được; không tự chấm lại hoặc đổi điểm cũ.

Kết quả trả lời ngắn hiển thị “Đáp án của bạn”, “Đáp án được chấp nhận”, đúng/sai/chưa làm, hình và lời giải. Giữ báo lỗi câu hỏi và nút thi lại. Quyền đọc ngân hàng câu hỏi vẫn chỉ ADMIN; không mở RLS để học sinh lấy đáp án mới. Hàm nội bộ phục vụ chấm/kiểm tra không được gọi trực tiếp bởi người dùng.

## 8. Thành phần và ranh giới thay đổi

- Mô hình câu hỏi Thi thử dùng kiểu phân biệt rõ trắc nghiệm/trả lời ngắn; mô hình Tự luyện không bị đổi thành chuỗi đáp án.
- Parser và tạo mẫu quản lý hợp đồng JSON; trang ADMIN chỉ dùng kết quả kiểm tra này để xem trước/nhập.
- Hook phiên thi quản lý trạng thái, bản nháp và gửi/lưu đáp án. Thành phần nhập trả lời ngắn chỉ hiển thị và phát thay đổi.
- SQL là nguồn chấm điểm chính và kiểm tra quyền. Trang kết quả hiển thị đánh giá được máy chủ trả về.
- ADMIN báo lỗi đọc loại câu từ bản chụp của báo lỗi, không đọc đáp án học sinh cung cấp để thay cho đáp án hệ thống.

Các điểm sửa chính: `src/features/question-import/json-import.ts`, `src/app/admin/import/page.tsx`, mô hình/hook trong `src/features/mock-exams`, phòng thi và kết quả tại `src/app/mock-exams/[examId]`, mô hình/trang ADMIN báo lỗi, cùng SQL nâng cấp riêng. Không tái cấu trúc ngoài phạm vi này.

## 9. Nâng cấp và bàn giao an toàn

Tạo SQL riêng dự kiến `src/lib/supabase/mock-exam-short-answer.sql` cùng tài liệu triển khai và tệp JSON mẫu sau khi thiết kế/kế hoạch được duyệt. SQL chạy trong một giao dịch, chạy lại được, kiểm tra các thành phần chấm thi cần thiết đã tồn tại, không xóa dữ liệu và không giảm quyền bảo vệ đang có.

Thứ tự: kiểm thử cục bộ → người quản trị chạy toàn bộ SQL nâng cấp mới → báo chạy thành công → đưa bản web mới lên và kiểm tra → mới nhập câu trả lời ngắn vào đề thật. Trong giai đoạn SQL đã nâng cấp nhưng web cũ chưa thay, chỉ sử dụng đề trắc nghiệm. Tab thi cũ cần tải lại trước khi vào đề hỗn hợp.

Không yêu cầu chạy lại SQL tạo bảng ban đầu hoặc SQL importer/chấm thi cũ, vì có thể ghi đè cách chấm và chính sách bảo mật mới. Khi SQL thiếu hoặc lỗi, báo rõ chưa cài hỗ trợ trả lời ngắn, giữ JSON/bản nháp và không lưu từng phần. Không tự thực hiện ghi trên Supabase thật trong kiểm thử.

## 10. Tiêu chí nghiệm thu

1. JSON trắc nghiệm cũ nhập/hiển thị/chấm như trước; JSON trộn hai loại xem trước đúng và nhập đúng thứ tự.
2. Từ chối kiểu câu không hợp lệ, đáp án rỗng/sai kiểu/quá dài/quá nhiều, cấu trúc lai, hình sai và nhập trả lời ngắn vào Tự luyện; lỗi chỉ rõ câu, không nhập một phần.
3. Ô nhập hoạt động với số âm, thập phân, phân số và văn bản tiếng Việt; gõ/xóa/chuyển câu/tải lại không mất hoặc sống lại đáp án đã xóa.
4. So khớp đúng quy tắc khoảng trắng, phân biệt hoa/thường, các đáp án thay thế và giới hạn Unicode. Đáp án chưa làm không được chấm đúng.
5. Chấm đề hỗn hợp, hiển thị kết quả, báo lỗi và ADMIN xem bản chụp đều hoạt động. Điểm và đúng/sai từng câu không mâu thuẫn.
6. Kiểm thử mất mạng, lưu liên tiếp, hai cửa sổ, đổi tài khoản, hết giờ, đáp án đến muộn, nộp lặp và ADMIN sửa câu giữa phiên. Xóa nội dung trong bản nháp phải được gửi đúng khi kết nối lại.
7. Học sinh không lấy được đáp án ngắn trước nộp qua phiên thi, bảng câu hỏi, hàm nội bộ hoặc báo lỗi; không ghi/sửa điểm hay đọc bài người khác.
8. SQL nâng cấp chạy hai lần an toàn, giữ các phiên và kết quả cũ, không thay đổi RLS đã khóa. Kiểm thử PostgreSQL/PGlite không chạm dữ liệu thật.
9. Typecheck/build theo giới hạn tài nguyên máy; chạy bộ kiểm thử nhập JSON, phiên thi, UI ADMIN và báo lỗi hiện có, bổ sung hồi quy trả lời ngắn. Kiểm tra Sol/Luna và mobile.

## 11. Tình trạng và bước tiếp theo

Người dùng đã duyệt tệp này và yêu cầu triển khai. Kế hoạch nằm ở `docs/superpowers/plans/2026-10-05-mock-exam-short-answer.md`; chưa tạo SQL, mẫu nhập có hiệu lực hoặc sửa mã ứng dụng. Sau khi người dùng duyệt kế hoạch và chọn cách thực hiện mới bắt đầu viết kiểm thử và mã.
