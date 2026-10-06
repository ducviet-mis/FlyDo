# Thi thử: đúng/sai 4 ý và phân điểm theo phần

## Đưa lên web an toàn

1. Chạy **duy nhất** `src/lib/supabase/mock-exam-true-false-scoring.sql` trong SQL Editor của dự án đang dùng. Tệp có kiểm tra các nâng cấp chấm thi, bảo vệ đáp án, nhập JSON và trả lời ngắn cần thiết. Nếu báo thiếu nâng cấp, dừng và gửi lại lỗi; không tự chạy lại toàn bộ schema.
2. Khi SQL hoàn tất thành công, mới đẩy bản web mới. Bản code này được giữ tại máy chờ xác nhận, chưa triển khai lên web.
3. Tải lại các tab ADMIN và Thi thử đang mở trước khi tạo hoặc nhập đúng/sai. Không chạy lại các SQL chấm thi/short-answer/import cũ sau nâng cấp, vì chúng có thể ghi đè các hàm mới.

Migration không chuyển hàng loạt đề cũ, không sửa điểm lịch sử hoặc snapshot phiên đang thi. SQL chạy lại được. Bản web cũ vẫn có thể tạo, nhập và mở đề theo chế độ cũ trong khoảng chờ deploy; bản web mới chủ động tạo đề phân điểm. Việc sao lưu dữ liệu Supabase trước nâng cấp vẫn được khuyến nghị.

## Tạo và nhập đề mới

- ADMIN → Quản lý Thi thử → đặt tổng điểm ba phần ngay trong form tạo đề. Ví dụ ABCD **2**, đúng/sai **4**, trả lời ngắn **4**; mặc định là 10/0/0. Đề mới là **bản nháp**.
- Mở **Điểm & cấu trúc** nếu muốn sửa tổng phần hoặc điểm riêng từng câu.
- ADMIN → Nhập đề JSON → Thi thử → chọn đúng đề. Sao chép mẫu theo dạng câu hoặc dùng `question-sets/examples/mock-exam-three-sections.json`.
- Bấm **Kiểm tra và xem trước**: đọc đáp án, công thức và bảng điểm sau nhập (bao gồm cả các câu đã có). Duyệt nhập mới lưu câu; xem trước không sửa dữ liệu.
- Mở lại **Điểm & cấu trúc**, kiểm tra tất cả điểm, rồi **Đưa vào sử dụng**. Đề nháp không hiện trong danh sách học sinh. Tổng điểm phải đúng 10; phần không có câu phải 0 điểm; mọi câu phải có điểm dương.

Mẫu 12 câu có 8 ABCD, 2 bài đúng/sai, 2 trả lời ngắn. Với tổng 2/4/4: mỗi ABCD 0,25 điểm; mỗi bài đúng/sai 2 điểm; mỗi trả lời ngắn 2 điểm.

## Điểm tự động và điểm chỉnh riêng

Không cần ghi điểm trong JSON. Hệ thống tự chia tổng phần cho **toàn bộ** câu của phần, không chỉ lô vừa nhập. Khi thêm hoặc xóa câu, điểm các câu tự động được chia lại; điểm đã chỉnh riêng giữ nguyên.

Thêm `"points": 0.6` ở cấp câu nếu muốn cố định câu đó ở 0,6 điểm. Không nhập `max_points` hoặc `points_override`. Các điểm JSON phải là **số**, không phải chuỗi; lớn hơn 0, tối đa bốn chữ số thập phân. Trong giao diện có thể nhập `0,6` hoặc `0.6`.

Ví dụ: phần ABCD 2 điểm, 8 câu. Khóa câu 1 ở 0,6 → 7 câu còn lại tự chia 0,2 điểm/câu. “Về tự chia” bỏ khóa. Nếu tổng điểm riêng vượt tổng phần hoặc không đủ điểm dương cho các câu còn lại, thao tác bị từ chối và dữ liệu trước đó được giữ lại.

Điểm chia có thể có bốn số lẻ: 2 điểm/3 câu → 0,6667 / 0,6667 / 0,6666, tổng vẫn chính xác 2. Máy chủ cộng điểm đạt chính xác, rồi mới làm tròn tổng bài đến hai số lẻ. Không cộng các con số đã làm tròn trên màn hình để tính tổng.

## JSON đúng/sai

```json
{
  "questions": [
    {
      "question_type": "true_false",
      "content": "Cho hình vuông ABCD. Xét các khẳng định sau.",
      "statements": [
        { "content": "Bốn cạnh bằng nhau.", "correct_answer": true },
        { "content": "Hai đường chéo không bằng nhau.", "correct_answer": false },
        { "content": "Hai đường chéo vuông góc.", "correct_answer": true },
        { "content": "Mỗi góc trong bằng 60 độ.", "correct_answer": false }
      ],
      "solution": "Dùng tính chất hình vuông.",
      "diagram": null
    }
  ]
}
```

- Đúng **4** ý theo thứ tự a–d. `correct_answer` từng ý là boolean `true`/`false`, không nhận `"true"`, `"Sai"`, 0 hoặc 1.
- Có thể thêm `solution` riêng vào từng ý. Công thức `$…$` và `diagram` hình học cấu trúc hiện có vẫn được hỗ trợ ở cấp câu.
- Không có đáp án chung ABCD cho bài đúng/sai. Các trường dùng chung nếu có phải là `options: []`, `accepted_answers: []`, `correct_answer: null`.
- Có thể trộn cả ba loại trong cùng một mảng. ABCD thiếu `question_type` vẫn được nhận theo định dạng cũ. Trả lời ngắn dùng `accepted_answers` như trước; không tự quy đổi phân số/số thập phân.
- Một câu JSON lỗi thì **không nhập bất kỳ câu nào**. Tối đa 100 câu mỗi lượt; bốn ý đúng/sai tính là một bài, không phải bốn câu.
- Đúng/sai chỉ áp dụng Thi thử. Tự luyện và đề cá nhân không đổi.

## Luật chấm đúng/sai

| Số ý đúng | Tỷ lệ điểm câu | Nếu câu tối đa 2 điểm |
| --- | --- | --- |
| 0 | 0% | 0 |
| 1 | 10% | 0,2 |
| 2 | 25% | 0,5 |
| 3 | 50% | 1 |
| 4 | 100% | 2 |

Ý chưa chọn không được tính đúng, kể cả khi đáp án của ý là Sai. Học sinh có thể bỏ chọn từng ý; các lựa chọn đang làm dở được lưu. Trước nộp, giao diện nhắc số ý còn trống. Kết quả có điểm từng phần, điểm đạt/tối đa mỗi câu và đối chiếu bốn ý. “Số câu đúng” vẫn chỉ đếm những câu đúng hoàn toàn; bài đúng 1–3 ý được ghi nhận là đúng một phần.

## Đề cũ và xung đột chỉnh sửa

Đề cũ tiếp tục chấm đều như trước. Muốn phân điểm, ADMIN mở **Điểm & cấu trúc**, chủ động chuyển chế độ và xác nhận. Không tự chuyển khi dán JSON. Chuyển chế độ hoặc sửa điểm chỉ ảnh hưởng các **phiên mới**, không thay điểm lịch sử hoặc phiên đã mở.

Khi hai ADMIN cùng sửa, phiên bản cũ bị từ chối thay vì ghi đè. Bản JSON và giá trị đang nhập vẫn được giữ; hãy tải lại/xem trước để đối chiếu rồi áp dụng lại.

## Kiểm tra trước khi vận hành

Sau SQL và deploy, dùng tài khoản thử nghiệm: tạo nháp → nhập mẫu → chỉnh điểm riêng → đưa vào sử dụng → làm thử đúng/sai ở các mức → xem kết quả/lịch sử → gửi báo lỗi câu hỏi. Kiểm tra thêm bản nháp không mở được qua đường dẫn trực tiếp và học sinh không thấy đáp án khi đang thi. Kiểm thử local không thay thế bước kiểm tra tài khoản thật này.

### Kiểm chứng tại máy (07/10/2026)

- 100/100 kiểm thử hồi quy qua; suite dữ liệu cô lập gồm 18 nhóm hành vi, không kết nối dữ liệu thật.
- TypeScript và build production qua; lint không có lỗi, còn 57 cảnh báo trong codebase hiện tại.
- Chrome: 4 ca tương tác Sol/Luna × mobile/desktop qua (bàn phím, chọn/bỏ chọn, cảnh báo nộp, kết quả và báo lỗi).
- 16 ảnh bố cục ADMIN/tạo đề/phòng thi/kết quả ở 375 và 1280 px không tràn ngang; ô điểm riêng trên mobile giữ đủ chiều rộng đọc và nhập.
- Kiểm tra bản production chạy tại localhost qua: route, ranh giới ADMIN khi chưa đăng nhập, OAuth, header bảo mật và service worker. Chưa kiểm tra SQL trên Supabase thật, tải đồng thời nhiều kết nối hay iPhone vật lý.

Các script bổ sung: `test-mock-exam-true-false-scoring.mjs`, `test-true-false-json-scoring.mjs`, `test-admin-exam-scoring-ui.mjs`, `test-true-false-exam-ui.mjs` trong `scripts/`.

Để lặp lại kiểm tra bố cục ADMIN, xuất DOM bằng hai script UI với `--snapshots tmp/scoring-visuals`, build và chạy web tại localhost:3514, rồi chạy `node scripts/verify-true-false-layout.mjs`. Script dùng Chrome và Playwright runtime có sẵn trên máy này, không dùng tài khoản hoặc dữ liệu thật. Kiểm tra tương tác phòng thi dùng `check-true-false-exam-layout.mjs`, cần `FLYDO_BROWSER_MODULES` trỏ tới runtime Playwright và CSS tại `tmp/true-false-exam-layout/styles.css`.
