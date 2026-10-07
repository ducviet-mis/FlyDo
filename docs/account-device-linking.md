# Liên kết nhiều profile trình duyệt vào một thiết bị FlyDo

## Phạm vi và giới hạn

FlyDo giữ tối đa **2 nhóm thiết bị cho mỗi loại**: điện thoại, máy tính, máy tính bảng. Một nhóm có thể chứa các profile trình duyệt mà chủ tài khoản xác nhận cùng dùng trên một máy. Không tự gộp theo IP, cấu hình, tên Chrome hay email của profile Chrome.

Đây là liên kết do chủ tài khoản cho phép, **không phải chứng thực máy vật lý**. Website không thể đảm bảo người dùng không chia sẻ mã sang máy khác. Không quảng bá tính năng như cơ chế chống chia sẻ tài khoản tuyệt đối. Mã nhận diện trình duyệt hiện có cũng không phải khóa phần cứng. Nếu cần kiểm soát thiết bị vật lý chặt hơn, cần một cơ chế xác thực thiết bị riêng.

## Đưa lên web

1. Sao lưu dữ liệu theo quy trình vận hành hiện tại.
2. Chạy toàn bộ `src/lib/supabase/account-device-linking.sql`. Tệp yêu cầu hệ thống `account-devices.sql` đã có, thêm dữ liệu profile và thay các RPC tương thích. Nếu gặp lỗi, gửi lỗi để kiểm tra; không xóa bảng hoặc chạy lại cả schema.
3. Sau SQL thành công, mới đẩy bản code web mới và tải lại những tab đang mở. Bản sửa được giữ tại máy chờ xác nhận SQL, không tự chạy trên Supabase thật.
4. **Không chạy lại `account-devices.sql` cũ sau nâng cấp**: nó có thể ghi đè các RPC quản lý profile. Tệp nâng cấp mới chạy lại được.

Migration không xóa thiết bị, không đổi mã đang lưu ở trình duyệt, không đặt lại ngày đăng nhập hoặc số lượt thay thế đã dùng. Các phiên cũ được đưa vào bảng profile; đăng nhập thông thường của bản web cũ vẫn được giữ trong khoảng chờ deploy.

## Thêm profile mới trên cùng máy

1. Ở profile đang đăng nhập, vào **Thông tin tài khoản → Bảo mật → Thiết bị đăng nhập**.
2. Tạo mã liên kết rồi sao chép. Mã chỉ có hiệu lực **5 phút**, dùng cho **đúng tài khoản FlyDo**, cùng loại thiết bị và chỉ dùng một lần.
3. Ở profile Chrome mới, chọn tùy chọn liên kết trên trang đăng nhập, dán mã và đăng nhập **cùng tài khoản FlyDo** bằng mật khẩu hoặc Google.
4. Khi thành công, profile mới thuộc nhóm thiết bị cũ; không chiếm thêm lượt thiết bị và không tốn lượt xóa/thay thế.

Email của profile Chrome không quyết định nhóm thiết bị; tài khoản FlyDo đăng nhập mới quyết định quyền dùng mã. Không gửi mã qua chat, đường dẫn hoặc cho người dùng máy khác. Tạo mã mới sẽ hủy mã chưa dùng trước đó của profile tạo mã. Đóng/hủy mã trên UI sẽ yêu cầu hủy mã ở máy chủ; nếu mạng lỗi, mã vẫn có thể còn hiệu lực đến lúc hết hạn.

## Nếu hai profile đã bị tính thành hai thiết bị

Tạo mã ở profile muốn giữ làm nhóm chính. Ở profile còn lại đang đăng nhập, mở phần Bảo mật, nhập mã để liên kết lại. Nếu nhóm cũ không còn profile nào, hệ thống đánh dấu nhóm đó đã gộp, trả lại một lượt thiết bị và **không tăng số lượt xóa**. Không xóa hồ sơ lịch sử để giấu việc gộp.

Chỉ profile thực hiện liên kết được chuyển; các profile khác trong nhóm nguồn không tự bị chuyển theo. Nếu còn profile ở nhóm nguồn, nhóm nguồn tiếp tục chiếm một lượt đến khi các profile đó được chủ tài khoản liên kết riêng.

## Đăng xuất, xóa thiết bị và an toàn

- Mỗi profile giữ mã và phiên riêng. Đăng nhập hoặc đăng xuất profile này không đẩy profile khác đã liên kết ra ngoài.
- Đăng xuất không giải phóng lượt thiết bị. Phiên đã đăng xuất không được tự ghi danh lại bằng token cũ.
- Đăng nhập lại cùng profile thu hồi phiên cũ đã bị thay thế (trừ khi còn profile hoạt động khác dùng chính phiên đó). Phiên cũ không được quay lại sau khi đăng xuất toàn bộ.
- Xóa một nhóm thiết bị thu hồi **tất cả** profile trong nhóm. Không xóa nhóm đang sử dụng, kể cả đang dùng profile được liên kết.
- Giới hạn xóa/thay thế vẫn là **2 lần cho toàn bộ vòng đời tài khoản**, không bị đặt lại bởi nâng cấp hoặc liên kết.
- Cấp mã cần một phiên đã đăng ký và đang hoạt động. Phiên chưa đăng ký không được xóa thiết bị hoặc đăng xuất toàn bộ thiết bị bằng các RPC này.
- Mã hết hạn, bị hủy, đã dùng bởi profile khác, khác tài khoản hoặc khác loại thiết bị bị từ chối. Một retry của chính profile/phiên đã liên kết được xử lý idempotent để không chiếm lượt khi mất phản hồi mạng.
- Khi profile tạo mã chuyển sang nhóm khác, mã chưa dùng của chính profile đó bị hủy vĩnh viễn; chuyển về nhóm cũ cũng không làm mã sống lại. Mã của các profile khác còn ở nhóm nguồn không bị hủy chỉ vì một profile rời nhóm.
- Bảng mã liên kết và profile không được đọc/ghi trực tiếp từ client. Quyền sở hữu và giới hạn được kiểm tra trong máy chủ dưới khóa theo tài khoản, không chỉ dựa vào UI.
- Tối đa 20 profile mỗi nhóm nhằm tránh tăng dữ liệu không giới hạn; không phải định nghĩa một máy vật lý. Chế độ ẩn danh/xóa dữ liệu trang web tạo mã profile mới, cần liên kết lại.

## Kiểm tra sau triển khai

Dùng một tài khoản thử: hai profile cùng máy liên kết thành một nhóm; cả hai vẫn truy cập được; đăng xuất một profile không ảnh hưởng profile kia; nhập sai/hết hạn không ghi danh mới; gộp hai nhóm trùng không mất lượt xóa; thử máy thứ ba không liên kết vẫn bị chặn khi đủ hai nhóm; xóa nhóm từ thiết bị khác thu hồi toàn bộ profile của nhóm.

Kiểm thử tại máy dùng PostgreSQL cô lập và các component thật với lớp mạng giả lập, không sửa dữ liệu khách hàng. Chúng không thay thế việc kiểm tra bằng tài khoản thử trên bản web đã deploy, không chứng minh nhận diện phần cứng hoặc tải nhiều kết nối thực tế.

## Kiểm chứng bản sửa tại máy (07/10/2026)

- Bộ kiểm thử toàn project: 167/167 đạt; gồm 15 nhóm hành vi cơ sở dữ liệu liên kết profile.
- Bản dựng production và kiểm tra TypeScript thành công. Lint phần sửa không có lỗi, còn 2 cảnh báo effect hiện có của màn hình đăng nhập.
- 32 bố cục snapshot component thật được kiểm tra bằng Chrome tại 375px/1280px, Sol/Luna: không tràn ngang, ô nhập mã và dialog vừa màn hình.
- Các phiên bản thử dùng dữ liệu giả; không đăng nhập hay chỉnh sửa tài khoản khách hàng. Các tệp service worker/cache có thay đổi sẵn của người dùng được giữ nguyên sau kiểm tra.
- Chưa chạy SQL trên hệ thống thật, chưa commit/push/deploy. Cần thực hiện quy trình SQL trước rồi web sau ở trên.
