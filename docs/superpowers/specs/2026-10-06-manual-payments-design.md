# FlyDo — chuyển khoản, ADMIN kích hoạt gói và lịch sử thanh toán

Ngày: 06/10/2026. Trạng thái: bản thiết kế để người dùng duyệt; chưa triển khai, chưa chạy SQL, chưa đẩy web.

## 1. Mục tiêu đã thống nhất

Khách mua gói trả phí bằng chuyển khoản. Khách bấm xác nhận đã chuyển để ADMIN nhận yêu cầu gắn đúng tài khoản. ADMIN đối chiếu tiền thực nhận rồi kích hoạt gói bằng một nút, không phải sửa dữ liệu thủ công. Khách xem được lịch sử mua hàng/thanh toán trong Thông tin tài khoản.

Nội dung chuyển khoản đã được người dùng duyệt: họ tên từ tài khoản + SĐT từ tài khoản + mã đơn ngắn. Tên và SĐT còn thiếu được bổ sung trước khi tạo đơn. Không coi tên tài khoản là danh tính đã xác minh, không yêu cầu người chuyển khoản và chủ tài khoản học sinh phải trùng tên.

Giữ nguyên tài khoản, điều hướng học tập, quyền FlyGo/FlyMax/FlyInfinity, giới thiệu bạn bè, streak, mã quà tặng và dữ liệu học. Giao diện dùng thành phần, màu và hiệu ứng nhẹ Sol/Luna hiện có.

## 2. Phương án và cơ sở mã hiện tại

Chọn tạo đơn nháp trước khi khách chuyển tiền, chỉ gửi yêu cầu tới ADMIN sau khi khách xác nhận. Đơn giữ cố định gói, giá, ưu đãi và nội dung chuyển khoản, giúp đối chiếu đúng giao dịch. Phương án chỉ tạo đơn lúc khách báo đã chuyển không được chọn vì không chốt được thông tin thanh toán trước giao dịch.

Các điểm hiện có được sử dụng lại:

- `src/features/subscription/components/payment-dialog.tsx` đang hiển thị ngân hàng/QR nhưng nút xác nhận chỉ là thao tác demo, chưa tạo đơn hoặc kích hoạt gói.
- `src/app/pricing/page.tsx` mở hộp thanh toán theo gói chọn từ `src/features/subscription/config.ts`.
- `subscription-schema.sql` đã có `subscription_plans`, `payment_settings`, `payment_orders`, `subscriptions` và hồ sơ gói trong `profiles`.
- `create_payment_order` có trong SQL; phiên bản streak bổ sung ưu đãi 50% nhưng chưa có luồng ADMIN duyệt, chống tạo trùng và bản chụp họ tên/SĐT.
- `learning-streak-rewards.sql` có voucher streak và trigger sử dụng voucher lúc đơn được duyệt. Phải phối hợp với quy tắc mới, không tiêu thụ voucher hai lần.
- `account-security-hardening.sql` chỉ cho tài khoản tự sửa tên, ảnh, SĐT và ngày sinh; quyền gói tiếp tục chỉ được thay đổi bởi hàm máy chủ có kiểm tra quyền.
- `src/app/admin/layout.tsx` có nhóm Vận hành; bổ sung Thanh toán vào nhóm này.
- `src/app/profile/page.tsx` có ba mục cài đặt; bổ sung Lịch sử thanh toán và đường dẫn mở đúng mục này.
- `app_notifications` và hook thông báo hiện tại hỗ trợ hộp thư riêng từng tài khoản; dùng lại thay vì tạo hệ thống thông báo khác.

## 3. Phạm vi và những việc không làm

Bao gồm mua mới/gia hạn năm gói trả phí đang có, xác nhận chuyển khoản, tiếp nhận ADMIN, phản hồi, duyệt/từ chối, lịch sử khách hàng và SQL triển khai an toàn.

Không kết nối tự động với ngân hàng, không xác nhận tiền bằng lời khai hoặc ảnh chuyển khoản, không tích hợp cổng thanh toán, không gửi SMS/email tự động, không tự hoàn tiền, không tạo hóa đơn thuế và không bán vật phẩm FlyTiee trong đợt này. Lịch sử gọi là đơn mua gói/thanh toán, không giả làm biên lai ngân hàng hoặc hóa đơn hợp pháp.

## 4. Quy trình khách hàng

1. Khách cần đăng nhập mới mua. Gói FlyGo miễn phí không đi qua luồng thanh toán.
2. Hộp thanh toán lấy họ tên/SĐT từ hồ sơ. Cho bổ sung và lưu các trường còn thiếu, chờ lưu thành công mới tạo đơn. Không yêu cầu sửa phần hồ sơ khác.
3. Nút tạo/tiếp tục đơn gọi máy chủ lấy báo giá chính thức. Chỉ sau khi thành công mới hiển thị chỉ dẫn chuyển khoản dùng được; giá từ trình duyệt trước đó chỉ là thông tin chọn gói.
4. Đơn nháp hiển thị tên gói, thời hạn, giá gốc, loại ưu đãi, tiền giảm, tiền cần chuyển, ngân hàng, số tài khoản, chủ tài khoản, mã đơn và nội dung chuyển khoản. Có sao chép số tài khoản/nội dung.
5. Khách bấm “Tôi đã chuyển tiền”. Máy chủ ghi nhận thời gian và chuyển sang Chờ kiểm tra; gửi thông báo riêng tới các tài khoản ADMIN hiện có. Không tăng quyền sử dụng.
6. Hộp xác nhận có nút “Xem lịch sử thanh toán”. Tải lại hoặc mở lại vẫn xem đúng đơn, không tạo đơn mới.
7. Chờ kiểm tra có giải thích ngắn: ADMIN sẽ đối chiếu giao dịch và phản hồi; không hứa thời gian xử lý chưa được vận hành xác nhận.
8. Khi được duyệt/từ chối hoặc nhận phản hồi, khách có thông báo riêng trỏ tới lịch sử, mở chi tiết đúng đơn trên cùng trang.

### Họ tên, SĐT và nội dung chuyển khoản

- Họ tên lấy từ `profiles.name`, bỏ khoảng trắng thừa; cần 2–80 ký tự, không có ký tự điều khiển. Giới hạn này áp dụng khi tạo đơn, không sửa hàng loạt tên hồ sơ cũ.
- SĐT bắt buộc; nhận 8–15 chữ số, cho nhập dấu cách/dấu gạch và một dấu `+` ở đầu. Lưu dạng bỏ dấu phân cách, không làm mất số 0 đầu. Đây là số liên hệ, không tuyên bố đã xác minh bằng OTP.
- Máy chủ tạo mã `FD` + 10 ký tự hex viết hoa, có ràng buộc duy nhất. Nếu trùng mã, sinh lại trong số lần giới hạn rồi trả lỗi rõ ràng.
- Memo gồm tên được chuyển sang chữ Latin không dấu viết hoa (xử lý cả đ/Đ), SĐT và mã đơn, phân tách bằng một khoảng trắng. Bản chụp giữ nguyên tên tiếng Việt để hiển thị.
- Không tự cắt họ tên hoặc bỏ SĐT/mã đơn. Nếu tên không thể chuyển thành memo rõ ràng, yêu cầu bổ sung tên chuyển khoản phù hợp và lưu vào hồ sơ trước khi tạo đơn.
- Thay đổi hồ sơ về sau không thay đổi memo, số tiền hoặc tên/SĐT đã lưu trong đơn cũ.

### Ngân hàng và QR

Sử dụng `payment_settings` hiện có. Máy chủ chỉ cho tạo đơn khi `is_enabled = true` và có ngân hàng, số tài khoản, chủ tài khoản hợp lệ. Chưa cấu hình thì giải thích rõ và không giả báo tạo đơn thành công. Không tự bật thanh toán hoặc tự điền thông tin ngân hàng chưa được chủ web xác nhận.

Chụp thông tin ngân hàng vào đơn để thay đổi cấu hình sau này không làm sai chỉ dẫn của đơn đang tồn tại. QR ảnh hiện có chỉ là QR nhận tiền đã cấu hình, không mặc nhiên có số tiền/nội dung của đơn. Hiển thị rõ phải kiểm tra và nhập số tiền/nội dung chính xác. Không tạo QR động từ một ảnh không biết cấu trúc, không ngầm phụ thuộc dịch vụ QR ngoài.

## 5. Trạng thái và chống tạo trùng

Các trạng thái mới giữ tương thích tên trạng thái đã có:

| Giá trị dữ liệu | Nhãn cho khách | Chuyển trạng thái được phép |
| --- | --- | --- |
| `draft` | Chờ chuyển khoản | chủ đơn xác nhận thành `pending`, hoặc hủy thành `cancelled` |
| `pending` | Chờ kiểm tra | ADMIN duyệt thành `approved` hoặc từ chối thành `rejected` |
| `approved` | Đã kích hoạt | kết thúc, không duyệt lại hoặc hủy |
| `rejected` | Không được duyệt | kết thúc, giữ lý do và lịch sử |
| `cancelled` | Đã hủy | kết thúc, chỉ dành cho nháp chưa báo đã chuyển |

Đóng hộp thanh toán không hủy đơn. Khách chỉ được hủy nháp khi xác nhận chưa chuyển tiền; cảnh báo hủy đơn không phải hoàn tiền. Không cho khách hủy/xóa đơn đã báo chuyển.

Mỗi tài khoản chỉ có một đơn mới chưa kết thúc (`draft` hoặc `pending`). Mở lại cùng gói tiếp tục đơn đó. Chọn gói khác khi còn nháp dẫn tới đơn hiện có và cho hủy nháp trước khi đổi; khi đã chờ kiểm tra thì không tạo đơn khác. Quy tắc được bảo đảm bằng khóa hồ sơ và chỉ mục duy nhất có điều kiện, không chỉ vô hiệu hóa nút UI.

Đơn nháp không tự hết hạn trong phiên bản này. Báo giá đã chốt được giữ đến khi đơn được xử lý/hủy, kể cả khi ADMIN kiểm tra sau ngày hết hạn ưu đãi. Không đổi số tiền sau khi khách đã có chỉ dẫn chuyển khoản. Không tự xóa đơn để giải phóng hàng chờ.

Mỗi lần bắt đầu một ý định mua có `request_id` UUID. Ràng buộc duy nhất theo tài khoản + request giúp retry sau mất mạng trả lại cùng đơn, kể cả đơn đã kết thúc. Tiếp tục đơn không thay đổi bản chụp. Khách chỉ có ý định mua mới khi chủ động chọn mua lại sau khi đơn trước kết thúc.

## 6. Giá, ưu đãi và thời hạn gói

Máy chủ dùng `subscription_plans` làm nguồn giá/thời hạn và chỉ nhận năm mã gói công khai trả phí hợp lệ. Khách không được gửi giá, phần trăm giảm, số ngày hay mã tài khoản nhận gói để máy chủ tin theo.

- FlyMax 1 tháng/3 tháng không áp dụng ưu đãi giới thiệu/streak, giữ chính sách hiện tại.
- FlyMax 6 tháng/1 năm/FlyInfinity dùng mức cao hơn giữa ưu đãi giới thiệu (tối đa 20%) và streak (50%, còn hạn và chưa dùng lúc tạo đơn). Không cộng dồn thành 70%.
- Số tiền giảm làm tròn xuống theo số nguyên VND; số tiền cần chuyển = giá gốc − số tiền giảm. Lưu đủ các trường, loại ưu đãi và định danh kỳ voucher streak.
- Voucher streak chỉ tiêu thụ khi duyệt thành công. Nháp, chờ kiểm tra, hủy, từ chối hoặc giao dịch bị rollback không tiêu thụ voucher.
- Cơ chế một đơn mở/tài khoản ngăn một voucher tạo nhiều đơn chờ. Máy chủ khóa hồ sơ và voucher khi tạo/duyệt; đối chiếu đúng kỳ voucher đã chụp, không vô tình tiêu thụ một voucher khác được cấp sau đó.
- Nếu trạng thái voucher có xung đột ngoài luồng này, giữ đơn chờ kiểm tra và báo ADMIN cần đối chiếu, không tăng giá hoặc kích hoạt sai. Điều chỉnh trigger cũ trong cùng migration để có một cơ chế tiêu thụ duy nhất.

Khi duyệt FlyMax: khóa hồ sơ, tính ngày kết thúc từ `max(thời điểm duyệt, ngày hết hạn FlyMax còn lại)` + số ngày chụp tại lúc tạo đơn. Không làm mất ngày còn lại. Mốc bắt đầu hồ sơ giữ nguyên nếu đang còn hạn; nếu đã hết hạn thì dùng thời điểm duyệt.

Khi duyệt FlyInfinity: chuyển sang trọn đời, ngày hết hạn là `NULL`. Tài khoản đã có FlyInfinity không tạo đơn mua thêm. Nếu lên FlyInfinity qua luồng khác trong lúc đơn đang chờ, ADMIN nhận cảnh báo và không được duyệt một đơn làm hạ gói/cấp thêm quyền không cần thiết; liên hệ khách và đối chiếu khoản chuyển thực tế, không tự hoàn tiền hoặc xóa đơn.

## 7. ADMIN — Thanh toán

Route `/admin/payments`, nằm trong nhóm Vận hành. Chỉ tài khoản ADMIN được truy cập dữ liệu và thao tác trên máy chủ; bảo vệ UI không thay thế kiểm tra quyền SQL.

- Mặc định xem Chờ kiểm tra, có số đơn cần xử lý. Bộ lọc Tất cả / Chờ kiểm tra / Đã kích hoạt / Không được duyệt / Nháp, đã hủy.
- Tìm theo mã đơn, họ tên, email, SĐT; tìm kiếm có giới hạn độ dài, phân trang phía máy chủ, không tải toàn bộ khách hàng.
- Danh sách thể hiện người mua, email, gói/thời hạn, tiền cần nhận, mã/nội dung chuyển khoản, thời gian khách xác nhận và trạng thái.
- Chi tiết mở trong dialog trên cùng trang, hiển thị giá gốc/ưu đãi, thông tin mua lúc tạo đơn, thời điểm tạo/xác nhận/xử lý và các phản hồi. Nội dung dài cuộn bên trong; dùng được trên điện thoại.
- Nút trực tiếp “Đã nhận tiền · Kích hoạt” chỉ bật cho đơn chờ kiểm tra đủ dữ liệu. Ngay cạnh có nhắc chỉ bấm sau khi đối chiếu giao dịch ngân hàng. Không có hộp xác nhận thứ hai làm mất yêu cầu một-click.
- Vô hiệu hóa thao tác đang gửi; chỉ báo thành công sau kết quả máy chủ. Hai lần bấm/hai ADMIN thao tác đồng thời vẫn chỉ cấp một gói.
- Có “Gửi phản hồi” giữ nguyên trạng thái chờ và “Không duyệt” yêu cầu lý do. Ghi chú đều là nội dung khách sẽ đọc được, nhãn ghi rõ điều đó; không tạo ghi chú riêng tư trong đợt này.
- Lưu người xử lý và thời điểm để ADMIN đối chiếu. Không có xóa lịch sử hoặc chỉnh số tiền/ngày gói trực tiếp.

## 8. Lịch sử thanh toán của khách

Thêm mục độc lập “Lịch sử thanh toán” trong Thông tin tài khoản. Trên mobile bố trí bốn mục gọn, không ép các nhãn dài vào ba cột cũ. Không thay đổi chức năng của ba mục còn lại.

Đường dẫn `/profile?tab=payments` mở lịch sử; thêm `order=<UUID>` mở chi tiết đơn nếu thuộc tài khoản hiện tại. Chỉ đọc các giá trị query được phép, không redirect theo URL do khách nhập.

- Danh sách mới nhất trước, phân trang 20 đơn mỗi lượt, bộ lọc Tất cả / Chờ xử lý / Đã kích hoạt / Không duyệt, đã hủy.
- Mỗi đơn có tên gói/thời hạn, số tiền cần chuyển, ngày giờ, mã đơn và trạng thái bằng cả nhãn lẫn màu. Nháp cũng có trong lịch sử nhưng không được gọi là đã thanh toán.
- Nhấn xem chi tiết tại dialog cùng trang: thông tin gói/giá, ưu đãi, nội dung chuyển khoản, các mốc thời gian, phản hồi ADMIN, kết quả kích hoạt/ngày hết hạn ghi nhận lúc duyệt.
- Nháp có “Tiếp tục thanh toán”; chờ kiểm tra giải thích rõ vẫn chưa kích hoạt. Đã duyệt thể hiện thời hạn kết quả riêng của đơn, không dùng ngày hết hạn hiện tại thay cho lịch sử.
- Tổng tiền đã xác nhận chỉ tính đơn phiên bản mới `approved` có kết quả duyệt/cấp gói hợp lệ, không tính tiền khách tự báo chuyển, nháp, đơn cũ thiếu kết quả đối chiếu hoặc đơn bị từ chối. Tổng áp dụng toàn bộ lịch sử của khách, không phụ thuộc trang đang xem hay bộ lọc. Không khẳng định đã nhận tiền chỉ từ nút khách bấm.
- Trạng thái tải, rỗng, lỗi mạng và thử lại rõ ràng. Không biến lỗi tải thành “Bạn chưa có giao dịch”.
- Không có lịch sử mua thật thì hiển thị rỗng, không tạo dữ liệu mẫu. Không quy đổi giftcode, referral hoặc streak tặng ngày thành giao dịch tiền. Việc xem lịch sử quyền gói từ các nguồn đó không nằm trong đợt này.

## 9. Dữ liệu lưu và hợp đồng máy chủ

Mở rộng bảng `payment_orders`, không tạo bảng đơn mua trùng chức năng:

- `request_id`, `order_code`, phiên bản luồng để phân biệt đơn mới với đơn cũ.
- Bản chụp tên, email từ `auth.users`, SĐT, tên gói, account tier và thời hạn ngày.
- Giá gốc, phần trăm/tiền giảm, số tiền phải chuyển, loại ưu đãi và kỳ voucher streak.
- Memo; bản chụp ngân hàng/số tài khoản/chủ tài khoản/QR đã cấu hình.
- `confirmed_at`, `reviewed_at`, `reviewed_by`, `subscription_id`, thời hạn kết quả kích hoạt.
- Giữ `status`, các ID chủ đơn/gói và trường ghi chú đã có.

Thêm `payment_order_events` lưu các mốc xác nhận, phản hồi, duyệt, từ chối, hủy theo đơn. Sự kiện do máy chủ ghi; khách không được tự ghi/chỉnh/xóa. Phản hồi tối đa 1.000 ký tự, văn bản thuần; ADMIN riêng được xem người xử lý, khách chỉ nhận phần được phép hiển thị.

Các RPC chuyên biệt:

- `prepare_payment_order(p_plan_code, p_request_id)`: xác thực, kiểm tra hồ sơ/ngân hàng/gói, khóa và chụp báo giá hoặc trả lại đơn hiện có.
- `confirm_payment_order(p_order_id)`: chủ đơn xác nhận nháp; gọi lại trả cùng kết quả, không lặp sự kiện/thông báo.
- `cancel_payment_order(p_order_id)`: chỉ chủ nháp chưa báo chuyển.
- `get_my_payment_orders`: bộ lọc, cursor theo cặp `(created_at, id)` và limit được kiểm tra; limit tối đa 50, thứ tự giảm dần ổn định, trả tổng tiền đã duyệt và danh sách trường khách được phép đọc.
- `get_my_payment_order(p_order_id)`: trả chi tiết/sự kiện của chính khách; không tiết lộ đơn người khác qua ID hoặc thông báo lỗi khác biệt.
- `admin_get_payment_orders` / `admin_get_payment_order`: kiểm tra ADMIN, tìm kiếm/phân trang và chi tiết.
- `admin_approve_payment_order(p_order_id)`: duyệt và cấp gói nguyên tử, idempotent.
- `admin_reply_payment_order(p_order_id, p_message)` / `admin_reject_payment_order(p_order_id, p_message)`: phản hồi hoặc kết thúc đơn với lý do và thông báo riêng.

Thu hồi quyền execute PUBLIC/anon/authenticated của RPC `create_payment_order` cũ: mã web hiện tại không gọi hàm đó và web mới chỉ dùng `prepare_payment_order`. Giữ định nghĩa cũ để không xóa dữ liệu/phụ thuộc ngoài phạm vi, nhưng không để khách dùng nó tạo đơn bypass ngân hàng, giá, voucher hay giới hạn đơn mở. Tệp hướng dẫn nêu không chạy lại SQL gói/streak cũ sau migration mới vì có thể phục hồi RPC/trigger lỗi thời.

## 10. Bảo mật, tính nguyên tử và lỗi

- Chủ đơn luôn là `auth.uid()`, không lấy ID/email quyền ADMIN hoặc người mua từ trình duyệt. ADMIN được xác minh bằng danh tính `auth.users` gắn auth UID, email đã xác nhận và allowlist hiện tại; tên/email hồ sơ có thể sửa không được dùng để quyết định quyền.
- RLS bật cho đơn/sự kiện. Thu hồi quyền ghi trực tiếp của `anon`, `authenticated`, kể cả quyền theo cột cũ; chỉ RPC hợp lệ được ghi. Dữ liệu khách trả qua RPC được giới hạn trường, không cấp quyền xem đơn/sự kiện người khác hoặc ghi chú nội bộ.
- Hàm definer ghim `search_path`, dùng tên schema rõ ràng, thu hồi execute PUBLIC/anon; authenticated chỉ gọi các RPC đã kiểm tra danh tính/quyền. Không đặt service-role key trong trình duyệt.
- Duyệt trong một transaction: khóa hồ sơ theo thứ tự thống nhất, khóa đơn/voucher; kiểm tra trạng thái; cấp đúng một `subscriptions(source = payment)`; cập nhật hồ sơ, ghi kết quả đơn/sự kiện và thông báo. Một lỗi khiến toàn bộ rollback.
- Có ràng buộc duy nhất liên kết subscription với payment order, ngoài kiểm tra trạng thái. Retry sau khi đã duyệt trả lại kết quả đã lưu, không cộng ngày lần nữa.
- Hai thao tác duyệt/từ chối cạnh tranh có một kết quả cuối; thao tác đến sau nhận trạng thái hiện tại, không gửi thông báo mâu thuẫn.
- Không cần Realtime cho tính đúng. Dùng hook thông báo sẵn có với topic riêng; danh sách thanh toán có làm mới, cập nhật khi focus và polling thưa khi còn đơn chờ, có cleanup. Không poll khi tab ẩn hoặc tài khoản đã đổi.
- Nếu tài khoản đổi/đăng xuất lúc request đang chạy, bỏ kết quả cũ, xóa dữ liệu khỏi UI. Dữ liệu nhạy cảm không được lưu lâu dài vào localStorage hoặc service-worker cache.
- Lỗi RPC/SQL chưa cài, ngân hàng chưa bật, phiên hết hạn và mất mạng có thông điệp riêng. Khách không thấy hướng dẫn SQL nội bộ; ADMIN nhận tên tệp cần chạy. Không fallback sang xác nhận demo hoặc cấp gói ở máy khách.

## 11. Thông báo

Xác nhận chuyển tạo tối đa một thông báo riêng cho mỗi ADMIN được cấu hình và có tài khoản. Thông báo liên kết `/admin/payments?order=<UUID>`. Không phát tên/SĐT khách cho tất cả người dùng.

Duyệt/từ chối/phản hồi tạo thông báo riêng cho chủ đơn, liên kết `/profile?tab=payments&order=<UUID>`. Nội dung duyệt ghi đúng gói/thời hạn. Khi người mua quay lại lịch sử hoặc nhận kết quả mới, làm mới hồ sơ để quyền học cập nhật mà không cần đăng nhập lại.

Thông báo là dữ liệu bền trong hộp thư, không phải push ngoài trình duyệt. Migration yêu cầu có ít nhất một tài khoản ADMIN thuộc allowlist với email đã xác nhận và schema thông báo đầy đủ. Mỗi lần khách xác nhận, máy chủ kiểm tra lại có người nhận ADMIN hợp lệ; nếu không có thì báo lỗi và rollback, không âm thầm mất yêu cầu thanh toán.

## 12. Migration và dữ liệu cũ

Tệp triển khai mới: `src/lib/supabase/manual-payments.sql`, transactional và chạy lại được. Phụ thuộc schema gói/hồ sơ, bảo vệ hồ sơ, notifications và learning-streak-rewards hiện có. Kiểm tra điều kiện đầu vào trước thay đổi, lỗi thì rollback, không drop bảng hoặc xóa hồ sơ/đơn.

Đơn cũ vẫn giữ nguyên trạng thái, số tiền và dữ liệu gốc. Đánh dấu phiên bản cũ; không bịa tên/gói/thời hạn/nhận tiền/đã kích hoạt từ dữ liệu hiện tại. Đơn cũ hiện trong lịch sử với các trường thiếu ghi “Chưa có thông tin lưu”; trạng thái `approved` cũ hiển thị “Đã duyệt · dữ liệu cũ”, không suy ra đã cấp gói nếu không có kết quả lưu. Đơn cũ thiếu bản chụp không có nút kích hoạt tự động; ADMIN thấy rõ cần đối chiếu thủ công, không yêu cầu khách chuyển tiền lần nữa. Chỉ mục một đơn mở áp dụng đơn phiên bản mới, tránh lỗi cài đặt vì nhiều đơn cũ.

Không tự bật `payment_settings.is_enabled`. Kèm hướng dẫn thiết lập ngân hàng và bật nhận đơn nếu chưa có. Bản web cũ với nút demo vẫn chạy trong lúc SQL mới được cài; bản web mới khi thiếu migration hiển thị trạng thái chưa sẵn sàng thay vì crash.

Thứ tự đưa lên thật: kiểm tra/backup dữ liệu theo quy trình vận hành → chạy SQL mới và kiểm tra ngân hàng → triển khai web → thử giao dịch do chủ web chủ động kiểm soát và đối chiếu quyền. Agent không tạo giao dịch, duyệt đơn, sửa ngân hàng, chạy SQL hoặc push bản mới vào production khi chưa có chỉ đạo phù hợp.

## 13. Ranh giới mã và kiểm thử

Gom kiểu dữ liệu, gọi RPC và xử lý request/account scope vào module thanh toán trong `src/features/subscription`; tách checkout, lịch sử khách, chi tiết đơn và danh sách ADMIN. Không đưa logic cấp gói vào React và không làm `profile/page.tsx` thành một component dài mới.

Kiểm thử máy chủ với database thử nghiệm cô lập: tạo đơn và chụp giá, quyền sở hữu/ADMIN, ngân hàng chưa bật, dữ liệu thiếu, giả giá/ưu đãi, nhiều request/trùng xác nhận, nhiều ADMIN duyệt, duyệt/từ chối cạnh tranh, một đơn mở, gia hạn còn hạn/hết hạn, Infinity, không hạ gói, voucher hết hạn sau khi tạo, hủy không tiêu voucher, rollback không tạo nửa giao dịch, thông báo đúng người và dữ liệu cũ được giữ.

Kiểm thử UI dùng component thật: bổ sung SĐT, lỗi lưu, hiển thị báo giá server, sao chép, xác nhận đang gửi/chờ/đã duyệt, mất mạng retry cùng đơn, lịch sử rỗng/lỗi/phân trang/bộ lọc/chi tiết, ADMIN một-click, lý do bắt buộc, đổi tài khoản không lộ dữ liệu, deep link hợp lệ/không hợp lệ, cập nhật quyền sau duyệt.

Kiểm tra trình duyệt riêng trên desktop/mobile, Sol/Luna: không tràn ngang, vùng bấm tối thiểu 44px, focus/keyboard/dialog trả focus, nhãn trạng thái không chỉ dựa vào màu, reduced-motion, safe-area/bottom dock, tên/email dài và nội dung phản hồi dài.

Chạy TypeScript, lint phần sửa, bộ test hồi quy và production build. Giữ nguyên các JSON/tài liệu người dùng đang sửa và khôi phục đúng `public/sw.js` trước đó nếu build sinh lại file. Không gọi ngân hàng hay thử duyệt trên tài khoản thật trong kiểm thử tự động.

## 14. Tiêu chí nghiệm thu và điểm dừng hiện tại

- Khách có một đơn đúng tài khoản, đúng gói, đúng số tiền và memo họ tên/SĐT/mã đơn; xác nhận không tự cấp quyền.
- ADMIN nhận đúng yêu cầu, kiểm tra rồi cấp đúng gói bằng một-click, không cấp trùng.
- Khách xem lịch sử/chi tiết/phản hồi và trạng thái qua thông báo, không rời sang tab mới.
- Không có đường API cho khách tự sửa đơn/quyền gói hoặc đọc dữ liệu người khác.
- Lỗi mạng, thay đổi tài khoản, SQL chưa cài và dữ liệu cũ không làm hỏng chức năng học đang chạy.

Người dùng đã duyệt luồng trong hội thoại và yêu cầu thêm lịch sử thanh toán. Bản thiết kế này cần được duyệt trước khi viết kế hoạch triển khai; kế hoạch cần được duyệt và chọn cách thực hiện trước khi sửa code sản phẩm.
