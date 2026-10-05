# Mock Exam Short Answer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm câu trả lời ngắn vào Thi thử và nhập JSON ADMIN, có chấm điểm an toàn trên máy chủ, giao diện và mẫu nhập hoàn chỉnh.

**Architecture:** Mở rộng mô hình câu hỏi thành hai loại, dùng chung quy tắc kiểm tra/chuẩn hóa ở phần nhập và phiên thi. SQL nâng cấp riêng giữ bản chụp, quyền truy cập và hạn nộp hiện có; RPC kết quả quyết định đúng/sai. Không thay đổi câu hỏi Tự luyện hay cách tính điểm.

**Tech Stack:** TypeScript, Next.js/React hiện có, Supabase/PostgreSQL, thành phần UI/Tailwind Sol/Luna, Node assert, jsdom và PGlite hiện có; không thêm phụ thuộc sản phẩm.

**Spec:** `docs/superpowers/specs/2026-10-05-mock-exam-short-answer-design.md` — người dùng duyệt và yêu cầu triển khai ngày 05/10/2026.

## Global Constraints

- Chỉ mở rộng Thi thử; Tự luyện, đề cá nhân, lý thuyết và FlyTiee giữ loại câu hiện tại.
- `question_type`: `multiple_choice` hoặc `short_answer`; thiếu trường được hiểu là trắc nghiệm.
- `accepted_answers`: 1–20 chuỗi trước gộp, mỗi chuỗi tối đa 200 ký tự Unicode trước chuẩn hóa và 1–100 sau chuẩn hóa; đáp án học sinh tối đa 100 trước chuẩn hóa.
- Khoảng trắng chuẩn hóa: U+0020, tab, LF, CR, form feed, vertical tab và U+00A0; gộp liên tiếp và bỏ đầu/cuối. Giữ chữ hoa/thường, dấu tiếng Việt, dấu phẩy/chấm, đơn vị và ký hiệu.
- Không tự biến đổi phân số, thập phân hoặc biểu thức; không AI, `eval` hay diễn giải đáp án thành HTML.
- JSON nhập tối đa 100 câu, đúng bốn phương án cho câu trắc nghiệm; đọc phiên trắc nghiệm cũ vẫn hỗ trợ 2–4 phương án; nhập nguyên lượt hoặc không nhập câu nào.
- Điểm giữ `round(10 * số_câu_đúng / tổng_số_câu, 2)`; không đổi điểm/lịch sử đã có.
- Không trả đáp án/lời giải trước nộp, không giảm RLS/kiểm tra chủ sở hữu, hạn nộp hoặc phiên bản đồng bộ; giữ giới hạn tổng kích thước đáp án máy chủ hiện có.
- Giữ hình học và Sol/Luna, bàn phím mobile, điều hướng, báo lỗi câu hỏi. Không chạy kiểm thử ghi trên Supabase thật.
- Giữ mọi thay đổi có sẵn và dữ liệu tác giả; chỉ stage/commit file của nhiệm vụ. Không đẩy web phụ thuộc SQL trước khi người dùng chạy SQL thành công.

## Review Focus

1. Xóa đáp án lúc mất mạng rồi tải lại: bản nháp hợp lệ không được hợp nhất theo cách làm sống lại đáp án máy chủ cũ — Task 4.
2. Khoảng trắng NBSP, ký tự ngoài BMP và dấu tiếng Việt: trình duyệt/máy chủ phải đồng nhất chuẩn hóa và đếm giới hạn — Tasks 1, 3.
3. JSON lai, kiểu không biết, câu sai đích hoặc chuyển đích sau xem trước: từ chối rõ ràng và không nhập một phần — Tasks 2, 3, 5.
4. Đáp án có ký tự HTML, tên thuộc tính đặc biệt và ID ngoài đề: không thực thi, không ghi dữ liệu sai câu hay lộ đáp án — Tasks 1, 3, 4, 6.
5. Tab/bản nháp/phiên/kết quả trắc nghiệm cũ thiếu kiểu câu: tiếp tục dùng được, không mất bài hay thay đổi điểm — Tasks 3, 4, 6.

## Chuẩn bị khi bắt đầu thực hiện

- Đọc spec/kế hoạch, dùng `using-git-worktrees` để kiểm tra môi trường và chọn nơi thực hiện an toàn; chưa tạo checkout trong bước lập kế hoạch này.
- Kiểm tra AGENTS, Git status, dependency và dung lượng; không thao tác vào bản D còn thiếu dữ liệu hoặc sao chép/xóa ngân hàng câu hỏi đang được tác giả khác làm.
- Các lệnh bên dưới chạy tại checkout FlyDo đã chọn bằng Node hiện có. PGlite/jsdom trong `tmp/question-report-db-test/node_modules` là môi trường kiểm thử sẵn có, không phải Supabase thật. Nếu thiếu phải xác định runtime sẵn có trước khi cài thêm.

### Task 1: Mô hình câu hỏi và quy tắc đầu vào dùng chung

**Files:** Create `src/features/mock-exams/question-model.ts`, `scripts/test-short-answer-model.mjs`.

**Interfaces:** Export `QuestionType`, `ExamAnswer = number | string`, `ExamAnswers = Record<string, ExamAnswer>`, `ExamQuestion` (union theo `question_type`, không chứa đáp án đúng), `normalizeShortAnswer(value: string): string`, `normalizeQuestionType(value: unknown): QuestionType | null`, `parseExamQuestions(value: unknown): ExamQuestion[] | null`, `validExamAnswers(questions: ExamQuestion[], value: unknown): ExamAnswers`, `isExamAnswerPresent(question: ExamQuestion, answer: unknown): boolean`. MCQ có `options: string[]`; short có `options: []`; cả hai có `id`, `content`, `diagram: unknown`. Không đưa accepted answers vào kiểu câu công khai.

- [ ] **Step 1 — Viết kiểm thử thất bại:** khẳng định `normalizeShortAnswer('  hình\u00a0\tchữ  nhật ') === 'hình chữ nhật'`, `normalizeShortAnswer('0,5') !== normalizeShortAnswer('0.5')`, `normalizeShortAnswer('A') !== normalizeShortAnswer('a')`; câu cũ thiếu kiểu thành MCQ; kiểu lạ/câu trùng ID bị từ chối; MCQ đáp án `0` có mặt; blank short không có mặt; 100 ký tự ngoài BMP hợp lệ, 101 bị loại; ID ngoài đề/thuộc tính `__proto__` không trở thành đáp án câu khác.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-short-answer-model.mjs`; phải lỗi vì mô-đun/export chưa tồn tại, không phải thiếu runtime.
- [ ] **Step 3 — Viết các export:** đếm bằng Unicode code point, chuẩn hóa đúng tập ký tự Global Constraints; xác thực dữ liệu công khai theo từng loại, chỉ giữ các trường công khai; không phụ thuộc DOM, auth hoặc Supabase.
- [ ] **Step 4 — Chạy GREEN:** cùng lệnh, toàn bộ assertion qua; kiểm tra lại kết quả phiên MCQ cũ và chuỗi HTML chỉ là giá trị văn bản.
- [ ] **Step 5 — Commit riêng:** chỉ mô hình và kiểm thử, message `feat: model short-answer mock exam questions`.

### Task 2: Parser, mẫu và prompt JSON có ngữ cảnh

**Files:** Modify `src/features/question-import/json-import.ts`; Create `scripts/test-short-answer-json.mjs`.

**Interfaces:** `ImportedQuestion` là union MCQ/short; short chuẩn đầu ra có `question_type: 'short_answer'`, `options: []`, `correct_answer: null`, `accepted_answers: string[]`. Giữ đầu ra MCQ cũ tương thích. `parseQuestionJson(raw: string, target: ImportTarget = 'practice'): ImportParseResult`; `buildAiPrompt(target: ImportTarget, destination: string, level?: string, questionType: QuestionType = 'multiple_choice'): string`; `buildQuestionJsonSample(target: ImportTarget, questionType: QuestionType = 'multiple_choice'): string`. Dùng quy tắc Task 1; không đổi schema geometry.

- [ ] **Step 1 — Viết kiểm thử thất bại:** JSON từ spec với target mock nhận 3 câu/không lỗi; target practice báo đúng câu short; mẫu short parse được; giữ aliases/wrappers cũ; lỗi có số câu khi accepted answers là số, rỗng, dài, quá 20, kiểu lạ hoặc có phương án/đáp án số trái loại; duplicates sau chuẩn hóa gộp nhưng giữ cách viết đầu; giữ kiểm tra diagram.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-short-answer-json.mjs`; phải thất bại vì hành vi MCQ-only hiện tại.
- [ ] **Step 3 — Mở rộng parser/prompt/sample:** kiểm tra theo từng loại, đúng đích, giới hạn thô và chuẩn hóa; MCQ không nhận accepted answers khác rỗng. Prompt short yêu cầu danh sách chuỗi và mọi biến thể cần thiết; prompt practice vẫn chỉ MCQ. Duy trì giới hạn 100 và geometry prompt hiện tại.
- [ ] **Step 4 — Chạy GREEN:** `node scripts/test-short-answer-json.mjs` và `node scripts/test-audit-regressions.mjs`; test mới qua, hồi quy cũ không bị ảnh hưởng bởi chữ ký mới có tham số mặc định.
- [ ] **Step 5 — Commit riêng:** parser và test, message `feat: import short-answer exam JSON`.

### Task 3: SQL nâng cấp, nhập nguyên lượt và chấm điểm an toàn

**Files:** Create `src/lib/supabase/mock-exam-short-answer.sql`, `scripts/test-mock-exam-short-answer.mjs`. Không ghi đè SQL tạo bảng hoặc bỏ lockdown hiện có.

**Interfaces:** Giữ chữ ký các RPC `import_questions_json`, `start_mock_exam_session`, `save_mock_exam_answers`, `submit_mock_exam_session`, `get_my_mock_exam_result`. Tạo helper nội bộ `flydo_exam_normalize_short_answer(text) RETURNS text`, `flydo_exam_question_valid(jsonb) RETURNS boolean`, `flydo_exam_answer_correct(jsonb, jsonb) RETURNS boolean`. Mở rộng `flydo_exam_validate_answers(jsonb,jsonb)` theo loại; blank short được bỏ khỏi ánh xạ, chuỗi không blank giữ nguyên để hiển thị. RPC public session trả `question_type` nhưng không key; RPC kết quả thêm boolean `is_correct` vào mỗi câu, chỉ sau nộp.

- [ ] **Step 1 — Viết kiểm thử thất bại PGlite:** bootstrap auth/roles theo `test-mock-exam-server.mjs`, tạo fixture `practice_lessons` có ID TEXT, cài `mock-exams-schema.sql`, `question-json-import.sql`, grading và lockdown hiện có với fixtures legacy; thử cài migration hai lần và nhập đề 1 MCQ + 2 short; kiểm tra đề 3 câu đúng 2 có điểm 6.67, whitespace/variants, Unicode 100/101, blank/sai kiểu/ID lạ/size quá giới hạn; lượt nhập có câu lỗi không tăng số bản ghi; practice không nhận short; user và ADMIN chưa xác thực không nhập được.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-mock-exam-short-answer.mjs`; lỗi vì migration chưa tồn tại/short chưa được hỗ trợ, không kết nối mạng.
- [ ] **Step 3 — Tạo migration transaction rerunnable:** kiểm tra grading/lockdown prerequisite; thêm cột/default và ràng buộc theo loại, chỉ nới NOT NULL của correct answer cho short. Cập nhật helpers/RPC để dùng cùng checker/normalizer, giữ khóa phiên/đề, owner/revision/deadline, nộp lặp, bản chụp và RLS. Import kiểm tra ADMIN có email confirmed, cả hai loại độc lập với parser. Revoke gọi trực tiếp helper khỏi PUBLIC/anon/authenticated; API dành người dùng giữ auth hiện có; kết thúc reload schema.
- [ ] **Step 4 — Chạy GREEN và bảo mật:** `node scripts/test-mock-exam-short-answer.mjs`, `node scripts/test-mock-exam-server.mjs`. Thêm assertion helper không gọi trực tiếp, học sinh không đọc bảng/key, không sửa điểm, không đọc bài khác; lỗi cạnh tranh/late answer/nộp lặp/ADMIN sửa câu giữa phiên; phiên cũ thiếu type vẫn chấm đúng; điểm lịch sử không thay đổi. Kiểm chứng helper dùng trong ràng buộc không làm hỏng cập nhật câu của ADMIN.
- [ ] **Step 5 — Commit riêng:** SQL/test, message `feat: securely grade short-answer mock exams`; không chạy SQL thật hay đẩy web.

### Task 4: Hook lưu bài và ô trả lời trong phòng thi

**Files:** Modify `src/features/mock-exams/use-server-exam.ts`, `src/app/mock-exams/[examId]/page.tsx`, `scripts/test-server-exam-ui.mjs`; Create `src/features/mock-exams/components/short-answer-input.tsx`.

**Interfaces:** Hook dùng `ExamAnswers`/`ExamQuestion` Task 1, re-export type nếu người gọi đang import từ hook; mở rộng `chooseAnswer(id: string, answer: ExamAnswer): void`. Component `ShortAnswerInput({ questionId, value, disabled, onChange }: { questionId: string; value: string; disabled: boolean; onChange: (value: string) => void })` không giữ nguồn lưu thứ hai. Draft vẫn version 2/key hiện tại, thêm `complete?: true`; bản mới ghi `complete: true`. Khi được phép restore cùng session/revision/chưa hết hạn, complete draft là toàn bộ ánh xạ (không merge với server); draft legacy thiếu cờ giữ cách khôi phục cũ.

- [ ] **Step 1 — Viết kiểm thử thất bại:** fixture mixed public session làm hook ready; nhập/sửa/xóa short gửi chuỗi hoặc bỏ key đúng; rapid edits chỉ một save đang chạy; offline clear tạo complete draft, reload khi server còn đáp án cũ vẫn giữ cleared map và gửi xóa; legacy draft version 2 không có cờ vẫn restore; thao tác sai kiểu/quá dài bị chặn.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-server-exam-ui.mjs`; khẳng định test mới lỗi ở phòng thi MCQ-only/merge restore, các test hiện có còn qua.
- [ ] **Step 3 — Thay mô hình và thêm ô nhập:** tái dùng save queue, deadline/account/revision guards và bản nháp; dùng parser Task 1 trước format phương án MCQ. Short blank loại khỏi map, không ảnh hưởng lựa chọn MCQ 0. Ô một dòng type text, nhãn “Nhập đáp án”, chỉ dẫn “Chỉ nhập đáp án, không cần viết lời giải.”; giới hạn code point không dùng maxLength UTF-16 để cắt nhầm ký tự. Render theo loại, giữ nav/report/theme, tính trạng thái bằng `isExamAnswerPresent`.
- [ ] **Step 4 — Chạy GREEN:** cùng script; test thực nhập vào ô có label, đổi câu, nộp khi save đang chờ dùng bản cuối, hết giờ khóa input; mất mạng/timeout/retry/đổi user/revision conflict/storage blocked/đổi đồng hồ/late draft vẫn qua; đáp án HTML không sinh DOM HTML.
- [ ] **Step 5 — Commit riêng:** hook/input/phòng thi/test, message `feat: answer and autosave short-answer exams`.

### Task 5: UI nhập JSON và xem trước trong ADMIN

**Files:** Modify `src/app/admin/import/page.tsx`, `scripts/test-admin-layout-ui.mjs`.

**Interfaces:** Dùng parser/prompt/sample Task 2; state `sampleQuestionType: QuestionType` chỉ điều khiển mẫu/prompt. Khi target practice thì loại mẫu có hiệu lực luôn MCQ; nhập và xem trước luôn parse lại với target hiện tại. Payload RPC vẫn `p_target`, `p_lesson_id`, `p_exam_id`, `p_level`, `p_questions`.

- [ ] **Step 1 — Viết kiểm thử thất bại:** chọn Thi thử/short và sao chép mẫu có `accepted_answers`; xem trước mixed hiển thị nhãn loại, đáp án ngắn, diagram/solution; đổi sang practice từ chối short; cancel confirmation không ghi; payload mock đúng union; một câu sai không gọi RPC; lỗi RPC giữ textarea/preview.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-admin-layout-ui.mjs`; lỗi vì chưa có control/mẫu/preview mới.
- [ ] **Step 3 — Thêm UI nhỏ theo design system:** selector chỉ ở phần mẫu Thi thử, nút mẫu short, hướng dẫn các biến thể, preview branch thay options với danh sách đáp án short; textarea/prompt phản ánh loại mẫu. Giữ lesson/exam picker, xác nhận, geometry sample và auth. Khi import chưa hỗ trợ, thông báo cần SQL mới mà không che lỗi khác hoặc bỏ nội dung đang nhập; không fallback ghi trực tiếp bảng.
- [ ] **Step 4 — Chạy GREEN:** cùng script và `node scripts/test-short-answer-json.mjs`; test tương tác thực, chuyển đích, cancel/error/retry và nhập hình cũ qua.
- [ ] **Step 5 — Commit riêng:** ADMIN/test, message `feat: preview and template short answers in ADMIN`.

### Task 6: Kết quả, báo lỗi, mẫu bàn giao và xác minh toàn bộ

**Files:** Modify `src/app/mock-exams/[examId]/result/page.tsx`, `src/features/question-reports/report-model.ts`, `src/app/admin/question-reports/page.tsx`, `scripts/test-server-exam-ui.mjs`, `scripts/test-admin-layout-ui.mjs`; Create `docs/mock-exam-short-answer-rollout.md`, `question-sets/examples/mock-exam-short-answer.json`.

**Interfaces:** Snapshot report giữ MCQ legacy, thêm union short có accepted answers. Result ưu tiên `is_correct` do server trả; chỉ fallback so sánh MCQ legacy khi thiếu boolean, không tự chấm short ở browser. Sample file gồm câu trắc nghiệm + hai short như spec, có thể nhập qua parser target mock.

- [ ] **Step 1 — Viết kiểm thử thất bại:** kết quả short hiển thị “Đáp án của bạn”, “Đáp án được chấp nhận”, đúng/sai/chưa làm và solution; đánh giá dùng server boolean kể cả raw text khác cách viết; HTML raw không thực thi; ADMIN report short hiển thị key và phản hồi cũ còn hoạt động; report/result MCQ thiếu type vẫn đọc được; mẫu bàn giao parse không lỗi.
- [ ] **Step 2 — Chạy RED:** `node scripts/test-server-exam-ui.mjs`, `node scripts/test-admin-layout-ui.mjs`; thất bại vì chưa có kết quả/report short.
- [ ] **Step 3 — Render kết quả/report và viết bàn giao:** short hiển thị văn bản an toàn, không ép qua formatOptionMath/HTML; giữ MathRenderer cho đề/solution, diagram và report button. Hướng dẫn ADMIN chọn Thi thử → chọn đề → dán mẫu → xem trước → nhập; ghi rõ variants và JSON escaping. Rollout: SQL mới thành công → web mới lên → reload tab → mới nhập short; không chạy lại SQL cũ. Không tự push lúc còn chờ SQL.
- [ ] **Step 4 — Chạy GREEN/toàn bộ:** các test mới Tasks 1–3 và script server/UI/admin cũ; `node scripts/test-question-reports.mjs`, `node scripts/test-question-report-ui.mjs`, `node scripts/test-audit-regressions.mjs`; các test `.test.mjs` trong src chạy `node --test` với danh sách tệp tìm bằng rg. Chạy typecheck `node --max-old-space-size=512 node_modules/typescript/bin/tsc --noEmit --incremental false`, lint các file đổi, build `node --max-old-space-size=768 --max-semi-space-size=8 node_modules/next/dist/bin/next build --webpack` nếu tài nguyên đủ; không build song song. Bảo vệ `public/sw.js` và tsbuildinfo do người dùng đã sửa; không stage output phát sinh. Kiểm tra mobile/Sol/Luna, fresh whole-change security review và xử lý phát hiện có bằng chứng; báo rõ phép kiểm tra bị giới hạn thay vì tuyên bố đã qua.
- [ ] **Step 5 — Commit/bàn giao:** chỉ file thuộc nhiệm vụ đã xác minh. Gửi link SQL, JSON và hướng dẫn cùng mẫu copyable cho người dùng, trạng thái kiểm thử, nhắc SQL trước deploy. Chờ người dùng xác nhận đã chạy SQL trước bước đẩy web tương ứng; giữ mọi dữ liệu/changes ngoài phạm vi.

## Tình trạng kế hoạch

Người dùng đã duyệt và yêu cầu thực hiện trực tiếp. Sáu nhiệm vụ đã có mã/SQL, mẫu và kiểm thử RED → GREEN; bằng chứng tại `.superpowers/sdd/2026-10-05-mock-exam-short-answer/ledger.md`. Build production, typecheck, kiểm thử UI/database/hồi quy đã qua. Review độc lập phát hiện và đã đóng lỗi P1 trong lịch sử không có snapshot; không còn Critical/Important/Minor hoặc mục bị loại khỏi review. Việc chạy SQL thật và đẩy GitHub vẫn do người dùng thực hiện theo thứ tự trong `docs/mock-exam-short-answer-rollout.md`.
