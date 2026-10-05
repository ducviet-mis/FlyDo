# Chính sách và điều khoản FlyDo

Đã bổ sung các trang công khai `/terms`, `/privacy`, `/payment-policy`, `/support`
và liên kết ở chân trang. Nội dung dùng đầu mối **FlyDo Việt Nam**,
**supports@flydovn.com**, theo thông tin chủ website xác nhận.

Chính sách thanh toán mô tả chuyển khoản/QR và đối soát, kích hoạt **thủ công**.
Không thay đổi luồng mua gói, dữ liệu, quyền lợi, đăng ký hoặc cách chấm bài.
Không cần SQL cho thay đổi này.

## Các điểm cần hoàn tất trước khi nhận thanh toán thực

- Bảo đảm `supports@flydovn.com` thực sự nhận và trả lời thư. Nội dung cam kết
  xác nhận tiếp nhận phản ánh/khiếu nại trong tối đa 3 ngày làm việc; cần bố trí
  người phụ trách, không chỉ cấu hình một địa chỉ email hiển thị.
- Chốt chủ thể cá nhân/pháp nhân cung cấp dịch vụ và công khai các thông tin
  cần thiết cho giao dịch từ xa, gồm địa chỉ và thông tin liên hệ theo quy định
  áp dụng. “FlyDo Việt Nam” hiện là tên do chủ website cung cấp, không phải bằng
  chứng đăng ký doanh nghiệp. Không tự bịa địa chỉ, mã số thuế hoặc số điện thoại.
- Kiểm tra ngân hàng, QR, nội dung chuyển khoản, xác nhận số tiền và thời hạn
  khi kích hoạt/gia hạn. Kiểm tra cả trường hợp mua trùng, nhận thiếu/thừa tiền,
  gia hạn khi còn hạn và nhập nhầm tài khoản.
- Hộp thanh toán hiện vẫn có nội dung/thao tác demo. Chủ website yêu cầu không
  ghi demo **trong chính sách**, không yêu cầu sửa hộp thanh toán ở lần này.
  Cần hoàn thiện giao diện thanh toán trước khi công bố mở bán. Thêm QR không
  tạo giao dịch, hồ sơ đơn hàng hay cơ chế kích hoạt tự động.
- Đáp ứng yêu cầu thông tin, xác nhận và chứng từ/hợp đồng cho giao dịch,
  nghĩa vụ thương mại điện tử, thuế và hóa đơn tùy mô hình hoạt động thực tế.
- Hoàn thiện căn cứ xử lý dữ liệu, thông báo và cơ chế ghi nhận sự đồng ý khi
  cần, nhất là người học chưa thành niên. Biểu mẫu đăng ký hiện chưa có bước
  xác minh người đại diện hoặc ghi nhận sự đồng ý riêng. Trang chính sách
  không tự thực hiện hoặc chứng minh các nghĩa vụ này.
- Thiết lập cách xử lý yêu cầu dữ liệu qua email, lưu giữ/chấm dứt lưu giữ,
  bảo vệ dữ liệu trẻ em và yêu cầu liên quan hạ tầng xử lý ngoài Việt Nam.
  Chưa thêm nút xóa/xuất tài khoản, hệ thống ticket hay cơ chế xóa tự động.
- Nhờ người có chuyên môn pháp lý rà lại nội dung và hoạt động thực tế trước
  khi mở bán. Đây là bản soạn theo sản phẩm và nguồn tham khảo, không phải
  chứng nhận FlyDo đã đáp ứng toàn bộ nghĩa vụ pháp luật.

## Nguồn đối chiếu

- Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15, hiệu lực 01/01/2026:
  https://vanban.chinhphu.vn/?docid=214590&pageid=27160
- Nghị định 356/2025/NĐ-CP quy định chi tiết luật:
  https://vbpl.vn/bocongan/Pages/vbpq-thuoctinh.aspx?ItemID=187276
- Luật Bảo vệ quyền lợi người tiêu dùng 19/2023/QH15, đặc biệt các nội dung
  về điều khoản hợp đồng, tiếp nhận phản ánh và giao dịch từ xa:
  https://vanban.chinhphu.vn/?docid=208363&pageid=27160
- Giải thích chính thức về bảo vệ dữ liệu trong một số hoạt động:
  https://mps.gov.vn/chinh-sach-phap-luat/bai-viet/bao-ve-du-lieu-ca-nhan-trong-mot-so-hoat-dong-1754989261
- Đối chiếu nội bộ về thống kê truy cập (không đưa tên nền tảng vào bản công khai):
  https://vercel.com/docs/analytics/privacy-policy

## Kiểm tra thay đổi

```powershell
node --test scripts/test-policy-ui.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
```

Bài kiểm thử giao diện dùng cùng môi trường jsdom độc lập tại
`tmp/question-report-db-test/node_modules` như các bài kiểm thử UI sẵn có.
Không kết nối tài khoản thật, không ghi cơ sở dữ liệu hoặc thực hiện chuyển tiền.

## Kết quả kiểm tra bản triển khai

- Các bài kiểm thử công khai/riêng tư, liên kết chân trang, nội dung và mục lục
  đã đạt; TypeScript và bản build production chạy thành công.
- Kiểm tra HTTP trên bản production cục bộ đã đạt với cả 4 trang chính sách,
  các trang học hiện có, giới hạn ADMIN và các header bảo mật.
- Giữ nguyên các thay đổi dữ liệu câu hỏi có sẵn và khôi phục đúng nội dung
  service worker có sẵn sau bước build; không chạy SQL hoặc tác động dữ liệu thật.
- Đã kiểm tra bằng Chrome headless với profile riêng, không đăng nhập và không
  gửi yêu cầu tới dịch vụ bên ngoài. Cả Sol/Luna ở desktop 1440px, mobile 375px
  và màn hình ngang 844px đều đạt 6 kiểm tra bố cục, vùng chạm và liên kết.
  Đã xem ảnh thực tế để rà phần chân trang và khoảng tránh thanh điều hướng.
- Footer đã thu gọn: 2 hàng trên desktop, tự xuống dòng trên mobile; giữ nguyên
  4 chính sách, tên vận hành, email và theme. Đo được khoảng 125px trên desktop,
  185px trên mobile (không tính vùng đệm tránh menu cố định).
- Chưa đẩy các thay đổi chính sách lên GitHub hay triển khai lên website thật.

Kiểm tra bố cục sau khi khởi chạy bản production cục bộ trên cổng 3503:

```powershell
$env:FLYDO_BROWSER_MODULES = 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node --test scripts/check-footer-layout.mjs
node scripts/test-production-smoke.mjs http://localhost:3503
```

Kiểm tra dùng Playwright có sẵn và Chrome đã cài, không thêm dependency của app.
Ảnh kết quả nằm trong `tmp/footer-layout` (không đưa vào mã phát hành).
