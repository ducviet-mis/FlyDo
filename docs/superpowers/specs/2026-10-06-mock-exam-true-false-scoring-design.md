# FlyDo — câu đúng/sai và phân điểm theo phần trong Thi thử

Ngày: 06/10/2026. Người dùng đã duyệt phương án, chọn giữ tổng điểm phần khi chỉnh điểm từng câu và yêu cầu triển khai trực tiếp, không lập thêm kế hoạch. Code và SQL đang được triển khai; giữ bản web tại máy chờ SQL trước khi phát hành.

## 1. Mục tiêu và phạm vi đã thống nhất

ADMIN nhập tổng điểm cho ba phần ABCD, đúng/sai, trả lời ngắn khi tạo hoặc sửa đề. Hệ thống nhận diện loại câu trong JSON, đếm toàn bộ câu của từng phần và tự phân điểm. ADMIN được chỉnh điểm từng câu; điểm đó được cố định, phần điểm còn lại tự chia cho các câu chưa chỉnh. Tổng điểm phần không tự đổi.

Một câu đúng/sai gồm đề dẫn và đúng bốn ý a–d. Đúng 0/1/2/3/4 ý nhận 0%/10%/25%/50%/100% điểm tối đa của cả câu. Không chấm bốn ý như bốn câu có trọng số bằng nhau.

Phạm vi: tạo/sửa đề Thi thử, nhập JSON, quản lý điểm từng câu, phòng thi, lưu/khôi phục bài, chấm máy chủ, kết quả/lịch sử và hiển thị báo lỗi cho ADMIN. Không mở rộng Tự luyện, câu ôn Lý thuyết, đề cá nhân, thanh toán, FlyTiee hoặc luật giới hạn thiết bị. Không thay routing/auth/theme hiện có, không cài dependency sản phẩm mới.

Giữ thang điểm 10 hiện có. Không sửa lại điểm của lượt thi cũ hoặc phân điểm lại một phiên đang thi.

## 2. Cơ sở code và lựa chọn thiết kế

- `src/features/mock-exams/question-model.ts`: hiện chỉ nhận `multiple_choice`, `short_answer`; đáp án là số hoặc chuỗi.
- `src/features/question-import/json-import.ts` và `src/app/admin/import/page.tsx`: kiểm tra/xem trước JSON; nhập qua RPC `import_questions_json`, thêm sau câu đã có, tối đa 100 câu/lượt.
- `src/app/admin/mock-exams/page.tsx`: tạo đề và sửa tên/thời gian, chưa quản lý phân điểm.
- `src/lib/supabase/mock-exam-short-answer.sql`: chấm `round(10 × số câu đúng / tổng câu, 2)`, bản chụp riêng cho mỗi phiên, khóa đáp án trước nộp, bảo vệ nộp lại.
- `src/features/mock-exams/use-server-exam.ts`: lưu máy chủ, số phiên bản chống ghi đè, bản nháp và thời hạn máy chủ.
- `src/lib/supabase/question-reports.sql`: bản chụp câu báo lỗi được lấy từ `to_jsonb(q)` trên máy chủ; model và màn hình ADMIN hiện chỉ hiển thị hai loại câu cũ.

Hai cách cấu hình đã cân nhắc: chỉ khai báo điểm trong JSON, hoặc cấu hình tổng điểm trong ADMIN và để JSON tập trung vào câu hỏi. Chọn cách thứ hai vì cho phép xem/chỉnh điểm toàn bộ đề, kể cả nhập nhiều lần. JSON vẫn được phép khai báo điểm riêng nếu ADMIN chủ động muốn cố định câu đó.

## 3. Quy tắc phân điểm chính xác

### 3.1. Tổng điểm và nguồn dữ liệu

Ba khóa cấu hình cố định: `multiple_choice`, `true_false`, `short_answer`. Mỗi tổng điểm phải là số hữu hạn từ 0 đến 10, tối đa bốn chữ số thập phân. Giao diện nhận dấu phẩy hoặc dấu chấm thập phân và chuyển thành giá trị chuẩn trước khi gửi.

Đề sẵn sàng thi phải có tổng ba phần bằng đúng 10, ít nhất một câu, không quá 1.000 câu, và phân điểm hợp lệ. Phần không có câu phải có tổng điểm 0 khi đưa vào sử dụng. Phần có câu phải có tổng điểm dương và mọi câu có điểm tối đa dương.

ADMIN được lưu cấu hình nháp khi chưa nhập đủ câu hoặc tổng ba phần chưa bằng 10; hiển thị lỗi/chênh lệch và chưa cho bắt đầu phiên mới. Không tự biến phần thiếu câu thành phần 0 điểm hoặc lấy điểm từ phần khác. Giá trị không phải số, âm hoặc quá chính xác bị từ chối, không lưu.

### 3.2. Câu tự chia và câu cố định

Mỗi câu có `points_override`: `null` nghĩa là tự chia; số dương nghĩa là ADMIN đã cố định. `max_points` là điểm tối đa do máy chủ phân ra, không phải điểm học sinh gửi.

Trong một phần:

1. Cộng điểm của tất cả câu cố định, không phân lại các câu này.
2. Lấy tổng điểm phần trừ tổng điểm cố định.
3. Chia phần còn lại cho tất cả câu tự chia của phần, bao gồm câu cũ và câu sắp nhập.
4. Nếu không còn câu tự chia thì tổng điểm cố định phải bằng tổng điểm phần.
5. Nếu tổng cố định vượt tổng phần, hoặc điểm còn lại không đủ để mỗi câu tự chia có điểm dương, báo lỗi và không áp dụng thao tác gây lỗi. Giữ dữ liệu trước thao tác.

Ví dụ: tổng ABCD 2 điểm, 8 câu → 0,25/câu. Cố định câu 1 ở 0,6 → 7 câu còn lại 0,2/câu. Cố định tiếp một câu khác thì chỉ chia lại các câu còn tự động.

“Về tự chia” đặt override của một câu về `null`. “Chia đều lại cả phần” xóa các override của phần sau xác nhận vì tác động đến nhiều câu. Đổi tổng điểm phần không âm thầm xóa override. Thêm hoặc xóa câu cũng không làm mất override của các câu còn lại.

### 3.3. Số lẻ và làm tròn

Dùng đơn vị điểm 1/10.000 và số nguyên khi phân phối, không dùng phép cộng floating-point để kiểm tra tổng. Giữ tối đa bốn số lẻ cho điểm tối đa/override; hiển thị đủ số có nghĩa, không chỉ hiển thị 0,33 cho giá trị 0,3333.

Với R đơn vị điểm còn lại và n câu tự chia: mỗi câu nhận `floor(R/n)` đơn vị; R mod n câu đầu nhận thêm một đơn vị. Thứ tự cố định theo `order_index`, sau đó `id`; câu mới theo thứ tự JSON nhập. Không bốc ngẫu nhiên phần dư.

Ví dụ: 2 điểm/3 câu → 0,6667; 0,6667; 0,6666. Tổng đúng 2 điểm, chênh lệch tự chia tối đa 0,0001. Giao diện giải thích điều này khi có phần dư.

Điểm nhận của đúng/sai dùng tỷ lệ chính xác trên điểm tối đa. Cộng tất cả điểm nhận bằng số chính xác trên máy chủ rồi mới làm tròn tổng cuối về hai chữ số theo cách làm tròn PostgreSQL hiện có. Không cộng những điểm từng câu đã làm tròn để ra tổng. Chi tiết được hiển thị tối đa sáu chữ số nếu cần; tổng bài vẫn có hai chữ số và /10.

## 4. JSON và dữ liệu câu đúng/sai

Giữ ba cấu trúc đầu vào hiện có: mảng câu, `{questions:[...]}`, `{data:{questions:[...]}}`. Giới hạn 100 câu mỗi lượt vẫn áp dụng cho tổng số câu của mọi loại, không đếm mỗi ý như một câu riêng.

`question_type` nhận `multiple_choice`, `true_false`, `short_answer`; thiếu trường này vẫn là ABCD như trước. Không suy đoán loại câu dựa vào lời văn. Bộ chọn mẫu/prompt không chuyển đổi JSON đã dán.

Mẫu đúng/sai:

```json
{
  "questions": [
    {
      "question_type": "true_false",
      "content": "Cho hình vuông ABCD. Xét các khẳng định sau.",
      "statements": [
        { "content": "Bốn cạnh của ABCD bằng nhau.", "correct_answer": true, "solution": "Đây là tính chất của hình vuông." },
        { "content": "Hai đường chéo của ABCD không bằng nhau.", "correct_answer": false, "solution": "Hai đường chéo hình vuông bằng nhau." },
        { "content": "Hai đường chéo của ABCD vuông góc.", "correct_answer": true, "solution": "Hình vuông có hai đường chéo vuông góc." },
        { "content": "Mỗi góc trong của ABCD bằng 60 độ.", "correct_answer": false, "solution": "Mỗi góc trong bằng 90 độ." }
      ],
      "solution": "Đối chiếu từng khẳng định với các tính chất của hình vuông.",
      "diagram": null
    }
  ]
}
```

- `statements` phải có đúng bốn đối tượng theo thứ tự a–d, nội dung chuỗi không rỗng, `correct_answer` là boolean JSON `true`/`false`, không nhận chuỗi "Đúng", "Sai", "true", "false" hoặc số 0/1.
- Lời giải riêng từng ý là chuỗi tùy chọn; lời giải chung và hình học có cấu trúc ở cấp câu giữ quy tắc hiện tại. Không thêm HTML/SVG/URL vào schema hình học.
- Đúng/sai không có đáp án chung kiểu số, phương án ABCD hoặc `accepted_answers`. Khi được cung cấp, các trường này phải là `correct_answer:null`, `options:[]`, `accepted_answers:[]`; lưu chuẩn hóa về những giá trị đó.
- ABCD và trả lời ngắn giữ validation cũ; thêm `statements:[]` chuẩn hóa, không cho chứa ý đúng/sai lẫn vào hai loại này.
- `points` tùy chọn ở cấp câu, số JSON dương tối đa bốn chữ số thập phân, được hiểu là override. Thiếu `points` là tự chia. Không nhận `NaN`, vô cực, chuỗi số, số âm hoặc 0. `max_points` từ JSON không phải nguồn chấm điểm và không được nhập thay `points`.
- Đúng/sai hoặc `points` riêng trong một đề chế độ cũ yêu cầu ADMIN chuyển sang cấu hình theo phần trước khi nhập, không tự đổi luật chấm một đề đang dùng. Các JSON ABCD/trả lời ngắn cũ không khai báo điểm vẫn nhập vào chế độ cũ như trước.
- Tự luyện vẫn chỉ ABCD; báo lỗi rõ khi nhập đúng/sai vào Tự luyện. Không mở rộng điểm Tự luyện.
- Một câu lỗi thì không nhập bất kỳ câu nào. Xem trước nêu loại câu, điểm tự chia/đã cố định và ảnh hưởng trên tất cả câu hiện có của phần; không chỉ tính trên lô mới.

## 5. Dữ liệu, tính nguyên tử và quyền

Migration mới dự kiến `src/lib/supabase/mock-exam-true-false-scoring.sql`; mở rộng bảng hiện có, không xóa hoặc viết lại lịch sử.

`mock_exams`: `scoring_mode` (`legacy_equal` / `sectioned`), `section_points` JSONB với đúng ba khóa ở mục 3, `scoring_ready` boolean dùng cho danh sách, `scoring_revision` số nguyên tăng sau thay đổi câu hoặc cấu hình điểm. Dữ liệu cũ mặc định `legacy_equal`; giao diện mới tạo đề theo phần ở trạng thái nháp. Cấu hình khởi tạo ABCD=10, đúng/sai=0, trả lời ngắn=0, ADMIN chỉnh theo đề của mình; không tự gán tỷ trọng 2/4/4 cho mọi đề.

Với đề `sectioned`, `scoring_ready` còn ghi nhận ADMIN đã đưa đề vào sử dụng: đề mới là false; lưu nháp hoặc nhập câu không tự chuyển false thành true dù điểm đã hợp lệ. Thao tác "Đưa vào sử dụng" mới đặt true sau kiểm tra máy chủ. Đề đã true có thể giữ true sau chỉnh sửa hợp lệ; chỉnh sửa khiến đề thiếu câu hoặc tổng sai đưa về false. Mở phiên mới phải kiểm tra cả cờ này lẫn tính hợp lệ thực tế. Resume/nộp phiên đã có snapshot không phụ thuộc cờ hiện tại.

`mock_exam_questions`: thêm `statements` JSONB mặc định `[]`, `points_override` NUMERIC có thể null, `max_points` NUMERIC có thể null. Câu và đề cũ để điểm riêng null; chỉ đề đã chủ động chuyển sang `sectioned` mới phân điểm.

Thêm API ADMIN lấy danh sách câu và bản phân điểm, xem trước phân điểm khi nhập, lưu cấu hình/override, đưa đề nháp vào sử dụng và xóa một câu nếu cần. Mọi API nhạy cảm dùng quyền ADMIN máy chủ `flydo_is_exam_admin()` từ auth.users đã xác nhận email, không tin email trong profile hoặc quyền do client gửi.

Lưu cấu hình/điểm và nhập/xóa câu khóa hàng đề bằng `FOR UPDATE`, kiểm tra phiên bản kỳ vọng, phân lại điểm và tăng revision trong một transaction. Xem trước trả revision cùng các giá trị dự kiến. ADMIN khác sửa giữa xem trước và lưu thì báo xung đột, tải lại để đối chiếu; không tự ghi đè hoặc âm thầm đổi điểm rồi nhập.

RPC nhập cũ giữ nguyên contract cho Tự luyện và đề cũ; luồng ADMIN mới dùng RPC nhập có revision kỳ vọng cho đề theo phần, trả phân điểm mới. Mọi đường ghi câu/điểm được khóa và kiểm tra trên máy chủ; không để insert/update/delete trực tiếp vượt qua quy tắc phân điểm, kể cả qua endpoint cũ. Quyền ghi trực tiếp câu Thi thử được thu hẹp nếu cần, nhưng phải cập nhật các caller hiện có và kiểm thử trước khi rollout.

`scoring_ready` không được coi là bằng chứng duy nhất. Khi mở phiên mới, máy chủ kiểm tra lại tổng, loại câu, điểm, cấu hình và tính đầy đủ dưới khóa đề, rồi chụp câu/điểm/luật chấm nhất quán. Không cho học sinh tự đặt cờ ready hoặc sửa điểm. Các helper definer ghim search_path và không cấp execute cho người dùng nếu không cần.

Không đưa đáp án đúng, lời giải từng ý hoặc lời giải chung vào payload phòng thi. Payload công khai chỉ có nội dung, hình, bốn nội dung ý, loại câu, điểm tối đa và trạng thái đáp án của chính học sinh.

## 6. Phòng thi, đáp án và chấm điểm

Mở rộng union đáp án: ABCD là số; trả lời ngắn là chuỗi; đúng/sai là mảng đúng bốn phần tử `boolean|null`. Thứ tự trùng a–d. `null` nghĩa là chưa chọn; `false` là học sinh đã chọn Sai. Không đánh đồng hai giá trị này.

Chọn/xóa lựa chọn của một ý chỉ thay đúng phần tử đó. Mảng bốn null được chuẩn hóa như chưa làm câu; vẫn xử lý thao tác xóa lựa chọn như một bản nháp đầy đủ để đáp án cũ không quay lại. Cả client lẫn máy chủ từ chối mảng dài khác bốn, kiểu phần tử sai hoặc ID câu không thuộc phiên. Giữ lưu tự động, retry, thời hạn máy chủ và revision chống ghi đè như hiện tại.

Trong phòng thi hiển thị đề dẫn/hình một lần và bốn hàng a–d, mỗi hàng có hai lựa chọn Đúng/Sai. Dùng radio/semantics tương đương, hỗ trợ bàn phím và có cách bỏ chọn một ý. Bảng số câu phân biệt chưa làm / làm một phần / đủ bốn ý; ghi `2/4 ý` khi chưa đủ. Không hiện đúng/sai thực tế hoặc điểm đạt trước khi nộp. Xác nhận nộp báo cả câu chưa làm và câu đúng/sai còn ý trống.

Chấm theo bản chụp lúc bắt đầu phiên:

- ABCD/trả lời ngắn đúng nhận toàn bộ `max_points`; sai/trống nhận 0.
- Đúng/sai đếm những ý có lựa chọn boolean và khớp đáp án. Trống không khớp cả khi đáp án là false. Nhân điểm tối đa với tỷ lệ `[0,0.10,0.25,0.50,1]`.
- `correct_count` giữ ý nghĩa số câu đúng hoàn toàn: câu đúng/sai phải đúng 4/4 mới tính là một câu đúng. Bổ sung số câu có điểm một phần và số ý đã trả lời/đúng ở DTO kết quả, không làm thống kê "câu đúng" trở nên mơ hồ.
- Giữ nộp một lần, owner scope và deadline. Retry không tạo thêm attempt; học sinh không gửi trọng số, điểm nhận hoặc đáp án chuẩn để máy chủ tin theo.

Phân điểm chính xác được lưu trong snapshot. Đổi điểm/câu lúc học sinh đang thi chỉ ảnh hưởng phiên mới. Việc chuyển đề đang ready sang nháp không ngắt hoặc từ chối nộp của các phiên đã có snapshot hợp lệ.

## 7. Giao diện ADMIN, kết quả và báo lỗi

Tạo/sửa đề thêm khu vực "Phân điểm" với ba tổng điểm và tổng đề /10. Quản lý điểm trong panel riêng ở cùng trang; không nhồi toàn bộ câu vào dialog sửa tên/thời gian. Nhóm câu theo loại để đọc/chỉnh, nhưng giữ `order_index` của JSON/đề hiện có; không âm thầm đảo số câu trong phòng thi.

Mỗi dòng hiển thị số câu gốc, nội dung rút gọn có thể mở đầy đủ, điểm tối đa có nhãn, trạng thái Tự chia/Đã chỉnh, thao tác về tự chia. Có số câu từng phần, số điểm đang cố định, số điểm còn tự chia và thông báo chênh lệch. Bảng xem trước JSON thể hiện cả thay đổi điểm câu cũ. Xóa câu có xác nhận và lời nhắc phân lại điểm, không xóa lịch sử/snapshot câu khỏi những bài đã thi.

Lưu nháp không có nghĩa là đưa đề vào sử dụng. Có thao tác rõ "Đưa vào sử dụng" khi tổng đúng 10 và mọi câu hợp lệ. Thay cấu hình/câu làm đề không hợp lệ thì đánh dấu chưa sẵn sàng; danh sách học sinh chỉ hiển thị đề legacy hoặc đề sectioned sẵn sàng. Máy chủ vẫn chặn link trực tiếp đến đề nháp. Mọi đề nháp vẫn xuất hiện trong ADMIN.

Kết quả hiển thị điểm từng phần và từng câu, ví dụ `0,25 / 1 điểm · 2/4 ý đúng`; đúng/sai có trạng thái riêng Đúng hoàn toàn / Đúng một phần / Sai / Chưa làm. Hiển thị lựa chọn và đáp án chuẩn từng ý sau nộp, kèm lời giải riêng/chung. Tổng điểm lấy máy chủ, không tính lại từ dữ liệu đề hiện tại. Các phần điểm phân số có mô tả tránh hiểu nhầm do tổng cuối làm tròn.

ADMIN báo lỗi đọc đủ đề dẫn, bốn ý, đáp án từng ý, hình và lời giải từ snapshot của báo lỗi. Giữ lý do, phản hồi và thông báo hiện có; không thay quyền học sinh để lộ snapshot đáp án trong khi thi.

Dùng component/token Sol/Luna và Lucide hiện có. Nhãn/điểm dạng tabular; input và vùng chọn có kích thước bấm tối thiểu 44px. Trên điện thoại các trường xếp dọc, không buộc cuộn ngang. Lỗi tại trường, tổng lỗi focus được sau lưu thất bại, giữ giá trị đang nhập. Không dùng hiệu ứng trang trí ảnh hưởng đọc đề; tôn trọng reduced-motion.

## 8. Tương thích và rollout

Migration chạy lại được, preflight yêu cầu hệ thống chấm máy chủ, lockdown, nhập JSON và trả lời ngắn đã cài. Không sửa câu/điểm/attempt/session cũ trong migration. Snapshot thiếu `scoring_mode` được hiểu là `legacy_equal`, vẫn chấm `10 × số câu đúng / tổng câu` và giữ điểm đã ghi. Lịch sử không có snapshot không bịa điểm từng câu hoặc áp cấu hình mới; chỉ giữ chi tiết tương thích theo giới hạn cũ.

Đề cũ có thao tác riêng chuyển sang phân điểm theo phần: ADMIN xem tổng điểm và toàn bộ câu, xác nhận; chỉ ảnh hưởng phiên mới. Không tự chuyển mọi đề khi thêm cột. Đề cá nhân và Tự luyện giữ cách tính cũ.

SQL phải chạy trước bản web mới; giữ bản sửa tại máy cho tới khi người dùng xác nhận SQL thành công. Không gọi production DB để thử, không chạy SQL thật hoặc tự push/deploy trong giai đoạn thiết kế. Sau web mới lên mới nhập đúng/sai hoặc chuyển đề sang chế độ mới; tải lại tab cũ. Không chạy lại các SQL schema/grading/short-answer/import cũ sau migration vì có thể ghi đè RPC đã nâng cấp.

Bàn giao một tệp SQL, mẫu JSON trộn ba loại có hình hợp lệ khi cần, hướng dẫn cấu hình/điểm/rollout và CMD chỉ stage file thuộc tính năng. Không đưa JSON/tài liệu tác giả, service worker hoặc cache đang sửa vào commit.

## 9. Điều kiện nghiệm thu và kiểm thử

1. 8 ABCD/tổng 2 → mỗi câu 0,25; cố định một câu 0,6 → 7 câu 0,2. Nhiều override, về tự chia, chia đều, thay tổng, thêm/xóa câu đều bảo toàn tổng và override còn lại.
2. Chia 2/3 đúng 0,6667/0,6667/0,6666; tổng 10 không trôi do floating-point; cộng điểm nhận rồi mới làm tròn cuối. Kiểm tra số âm/0/NaN/chuỗi/quá bốn số lẻ, quá tổng, không còn câu auto và phần có điểm nhưng thiếu câu.
3. Đúng/sai chấm đủ 0–4 ý đúng, ví dụ max=1 được 0/0,1/0,25/0,5/1; thử điểm tối đa khác 1. Trống không bị tính như false. Lựa chọn sai kiểu/ID/lố bốn ý bị chặn cả client/server.
4. JSON trộn ba loại, mẫu/prompt/xem trước, override điểm, hình học, nhập nhiều lô vào đề đã có. Một câu lỗi rollback toàn bộ. Hai ADMIN cùng sửa/nhập không ghi đè âm thầm; endpoint cũ không vượt qua phân điểm.
5. PGlite chạy migration hai lần, kiểm tra auth/RLS/helper grants, câu/điểm cũ giữ nguyên, nộp lại idempotent, deadline/conflict/owner, không lộ đáp án trước nộp, snapshot ổn định khi ADMIN đổi đề. Không tuyên bố đã stress test nhiều kết nối nếu chỉ dùng PGlite nối hàng request.
6. Test component thật với mạng/auth giả lập: ADMIN phân điểm và lỗi, đổi account khi chờ dữ liệu, phòng thi chọn/xóa từng ý, bản nháp/khôi phục, submit đang busy, kết quả từng phần/từng ý và báo lỗi ADMIN. Chạy lại các kiểm thử trắc nghiệm/trả lời ngắn và tất cả hồi quy hiện có.
7. Kiểm tra Sol/Luna, 375px và desktop, bàn phím, dialog focus, reduced-motion, nội dung công thức/hình dài, không tràn ngang. TypeScript/lint/build production và smoke HTTP; bảo toàn chính xác các file người dùng đang sửa khi build.
8. Nghiệm thu cuối sau SQL/deploy do chủ web thực hiện bằng tài khoản kiểm thử: tạo đề nháp, nhập JSON, chỉnh điểm, đưa vào dùng, thi các mức đúng/sai, xem lịch sử và báo lỗi. Nêu rõ phần nào chưa được thử trên production/iPhone vật lý.

## 10. Bước tiếp theo

Thực hiện trực tiếp theo yêu cầu mới nhất của người dùng, kiểm thử trước và kiểm tra hồi quy. Hướng dẫn sử dụng, mẫu JSON và bước SQL trước/web sau nằm trong `docs/mock-exam-true-false-scoring.md`.
