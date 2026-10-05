export const LEGAL_CONTACT = {
  operator: 'FlyDo Việt Nam',
  email: 'supports@flydovn.com',
  updatedAt: '2026-10-06',
  updatedLabel: '06/10/2026',
} as const;

export const POLICY_LINKS = [
  { key: 'terms', href: '/terms', label: 'Điều khoản sử dụng' },
  { key: 'privacy', href: '/privacy', label: 'Chính sách bảo mật' },
  { key: 'payment', href: '/payment-policy', label: 'Thanh toán & hoàn tiền' },
  { key: 'support', href: '/support', label: 'Hỗ trợ & khiếu nại' },
] as const;

export type PolicyKey = (typeof POLICY_LINKS)[number]['key'];
export type PolicySection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  links?: readonly { href: string; label: string }[];
};
export type PolicyDocument = {
  title: string;
  description: string;
  summary: string;
  sections: readonly PolicySection[];
};

export const POLICY_DOCUMENTS: Record<PolicyKey, PolicyDocument> = {
  terms: {
    title: 'Điều khoản sử dụng',
    description: 'Quy định sử dụng tài khoản, học liệu và các dịch vụ học tập trên FlyDo.',
    summary: 'Một tài khoản cho việc học của bạn. Sử dụng học liệu có trách nhiệm, bảo vệ thông tin đăng nhập và báo cho FlyDo khi cần hỗ trợ.',
    sections: [
      {
        id: 'pham-vi', title: '1. Phạm vi và mục đích dịch vụ',
        paragraphs: [
          'FlyDo là nền tảng hỗ trợ học Toán với lý thuyết, tự luyện, thi thử, đề cá nhân, cẩm nang và các công cụ theo dõi học tập. Đầu mối vận hành và hỗ trợ sử dụng tên FlyDo Việt Nam.',
          'Điều khoản này áp dụng khi bạn sử dụng website và các tính năng FlyDo cung cấp. Chính sách bảo mật, thanh toán và hỗ trợ giải thích thêm các nội dung liên quan. Hãy đọc trước khi đăng ký hoặc mua gói; bạn có thể hỏi lại bất kỳ nội dung nào chưa rõ.',
          'Bài luyện, lời giải và điểm thi thử phục vụ tự học, không thay thế việc giảng dạy ở trường, không phải điểm thi chính thức hay chứng nhận. FlyDo không bảo đảm một mức điểm hoặc kết quả tuyển sinh cụ thể.',
        ],
      },
      {
        id: 'tai-khoan', title: '2. Tài khoản và người học chưa thành niên',
        items: [
          'Cung cấp email có thể nhận thư và thông tin phù hợp; chỉ sử dụng tài khoản của mình hoặc tài khoản được người đại diện hợp pháp quản lý cho mình.',
          'Giữ bí mật mật khẩu, mã xác thực và liên kết khôi phục. Không bán, cho thuê hoặc chia sẻ tài khoản để nhiều người cùng sử dụng quyền lợi của một người học.',
          'Nếu bạn chưa thành niên, hãy để cha mẹ hoặc người giám hộ đọc các chính sách, hỗ trợ việc đăng ký và quyết định thanh toán. Việc xử lý dữ liệu hoặc giao dịch cần sự đồng ý của người đại diện được thực hiện theo quy định áp dụng.',
          'Báo ngay cho hỗ trợ khi nghi ngờ tài khoản bị truy cập trái phép. Việc quy trách nhiệm được xem xét dựa trên sự việc và quy định pháp luật, không mặc định mọi hoạt động bất thường đều do người dùng gây ra.',
        ],
      },
      {
        id: 'thiet-bi', title: '3. Giới hạn thiết bị đăng nhập',
        paragraphs: [
          'Mỗi tài khoản được đăng ký tối đa 2 điện thoại, 2 máy tính và 2 máy tính bảng. Hệ thống nhận diện theo trình duyệt; hai trình duyệt trên cùng một máy có thể được tính là hai thiết bị. Xóa dữ liệu trình duyệt hoặc dùng chế độ riêng tư có thể làm thay đổi mã nhận diện.',
          'Bạn có tổng cộng 2 lượt xóa/thay thế thiết bị cũ trong toàn bộ vòng đời tài khoản. Đăng xuất không xóa thiết bị và không sử dụng lượt. Thiết bị đang dùng không thể tự xóa trong danh sách.',
          'Kiểm tra danh sách và ngày đăng nhập gần nhất tại Thông tin tài khoản → Bảo mật. Nếu bị nhận diện nhầm, mất thiết bị hoặc gặp sự cố bảo mật khi hết lượt, hãy liên hệ hỗ trợ để được xác minh; không tự tạo nhiều tài khoản để lách giới hạn.',
          'Giới hạn thay thế thiết bị là quy tắc truy cập tài khoản, không giới hạn quyền yêu cầu bảo vệ, chỉnh sửa hoặc xóa dữ liệu cá nhân theo pháp luật.',
        ],
      },
      {
        id: 'hoc-lieu', title: '4. Học liệu, kết quả và báo lỗi',
        paragraphs: [
          'Bạn được sử dụng nội dung trong phạm vi quyền truy cập của tài khoản để học tập cá nhân. Không sao chép hàng loạt, thu thập tự động, bán lại ngân hàng câu hỏi hoặc đăng lại học liệu có bản quyền khi chưa được phép. Quyền của tác giả và các trường hợp sử dụng hợp pháp theo pháp luật vẫn được tôn trọng.',
          'Nội dung và cách chấm có thể cần hiệu chỉnh khi phát hiện lỗi. FlyDo tiếp nhận phản ánh, kiểm tra câu hỏi và giải thích kết quả xử lý; không bảo đảm mọi đề, hình vẽ hay lời giải đều không có sai sót.',
          'Trong Tự luyện hoặc Thi thử, dùng nút Báo lỗi câu hỏi để gửi lý do và mô tả. Phản hồi của quản trị viên được gửi đến Thông báo của người báo lỗi. Không đưa thông tin riêng tư không cần thiết vào nội dung báo lỗi.',
          'Một số dữ liệu như bản nháp đề cá nhân hoặc tùy chọn giao diện được lưu trên trình duyệt và không mặc nhiên đồng bộ giữa thiết bị. Không xóa dữ liệu trình duyệt khi đang làm bài; kết quả chỉ được lưu khi thao tác và kết nối cần thiết đã hoàn tất.',
        ],
      },
      {
        id: 'goi-dich-vu', title: '5. Gói tài khoản, ưu đãi và quà tặng',
        paragraphs: [
          'FlyGo là gói miễn phí. FlyMax có thời hạn. FlyInfinity là gói trọn đời, thanh toán một lần, không cần gia hạn và không có ngày hết hạn cố định trong hệ thống. Quyền lợi và giá được hiển thị tại Gói FlyDo trước khi bạn quyết định mua.',
          'Gói được gắn với tài khoản đã xác nhận mua. Ưu đãi giới thiệu, streak và giftcode có điều kiện riêng; chỉ áp dụng khi còn hiệu lực và đủ điều kiện. Không mặc định mọi ưu đãi đều cộng dồn hoặc có thể quy đổi thành tiền.',
          'Nếu các tính năng quà tặng hoặc trò chơi được mở, vật phẩm và xu là quyền lợi sử dụng trong FlyDo, không phải tiền gửi, tiền tệ hoặc phần thưởng có thể tự rút thành tiền. Việc mua gói không đồng nghĩa bảo đảm nhận một vật phẩm ngẫu nhiên cụ thể.',
        ],
        links: [{ href: '/pricing', label: 'Xem gói FlyDo' }, { href: '/payment-policy', label: 'Đọc chính sách thanh toán & hoàn tiền' }],
      },
      {
        id: 'su-dung-an-toan', title: '6. Sử dụng an toàn và xử lý vi phạm',
        items: [
          'Không truy cập trái phép dữ liệu người khác, phá hoại hệ thống, dò mật khẩu, phát tán mã độc hoặc lợi dụng lỗi để nhận quyền lợi không hợp lệ.',
          'Không giả mạo thanh toán, báo lỗi, danh tính hoặc thao túng kết quả và ưu đãi. Không gửi nội dung quấy rối, xúc phạm hay vi phạm quyền của người khác.',
          'FlyDo có thể tạm hạn chế thao tác hoặc tài khoản để kiểm tra rủi ro có căn cứ. Khi có thể và không ảnh hưởng việc bảo vệ hệ thống, người dùng được thông báo lý do và cách yêu cầu xem xét lại.',
          'Mức xử lý phải phù hợp tính chất sự việc. Việc hạn chế tài khoản không mặc nhiên tước bỏ quyền khiếu nại, yêu cầu dữ liệu hoặc quyền liên quan đến khoản thanh toán hợp pháp.',
        ],
      },
      {
        id: 'thay-doi', title: '7. Bảo trì và cập nhật điều khoản',
        paragraphs: [
          'FlyDo có thể cập nhật nội dung và giao diện để cải thiện việc học. Với bảo trì hoặc thay đổi quan trọng ảnh hưởng dịch vụ đã mua, FlyDo thông báo theo thời hạn pháp luật áp dụng và nêu phương án xử lý phù hợp. Sự cố bất ngờ được thông tin khi có thể.',
          'Bản cập nhật được công bố cùng ngày cập nhật trên trang này. Thay đổi quan trọng về quyền lợi, thanh toán hoặc sử dụng dữ liệu được thông báo phù hợp; không mặc định áp dụng hồi tố để giảm quyền lợi đã mua hoặc coi việc tiếp tục truy cập là sự đồng ý cho mọi mục đích xử lý dữ liệu mới.',
        ],
      },
      {
        id: 'giai-quyet', title: '8. Liên hệ và giải quyết bất đồng',
        paragraphs: [
          'Gửi yêu cầu đến supports@flydovn.com để FlyDo kiểm tra và trao đổi phương án giải quyết. Bạn vẫn có quyền yêu cầu cơ quan có thẩm quyền, tổ chức bảo vệ người tiêu dùng hoặc tòa án giải quyết theo pháp luật Việt Nam.',
          'Các điều khoản được áp dụng trong phạm vi pháp luật cho phép. Nếu một nội dung không có hiệu lực, các phần còn lại tiếp tục áp dụng nếu có thể tách biệt; quyền bắt buộc của người dùng theo pháp luật không bị loại trừ.',
        ],
        links: [{ href: '/support', label: 'Cách gửi yêu cầu hỗ trợ' }],
      },
    ],
  },
  privacy: {
    title: 'Chính sách bảo mật',
    description: 'FlyDo thu thập và sử dụng thông tin như thế nào, cùng các lựa chọn bảo vệ dữ liệu của bạn.',
    summary: 'Dữ liệu được dùng để vận hành tài khoản, lưu việc học, bảo vệ truy cập và hỗ trợ bạn. Bạn có thể hỏi, yêu cầu chỉnh sửa hoặc gửi yêu cầu về dữ liệu qua email hỗ trợ.',
    sections: [
      {
        id: 'dau-moi', title: '1. Phạm vi và đầu mối liên hệ',
        paragraphs: [
          'Chính sách này áp dụng với dữ liệu phát sinh khi sử dụng FlyDo. Đầu mối phụ trách tiếp nhận yêu cầu bảo mật là FlyDo Việt Nam, qua supports@flydovn.com. Dịch vụ đăng nhập hoặc website bên ngoài mà bạn tự truy cập có chính sách riêng.',
        ],
      },
      {
        id: 'du-lieu', title: '2. Thông tin được thu thập',
        items: [
          'Tài khoản: mã tài khoản, tên, email, trạng thái đăng nhập và thông tin xác thực cần thiết. Khi chọn đăng nhập qua tài khoản bên ngoài, FlyDo nhận thông tin hồ sơ được nhà cung cấp chuyển theo lựa chọn của bạn.',
          'Hồ sơ bổ sung: ảnh đại diện, số điện thoại và ngày sinh nếu bạn nhập. Các trường này không bắt buộc trong biểu mẫu đăng ký hiện tại; bạn có thể chỉnh sửa trong Thông tin tài khoản.',
          'Học tập: câu trả lời đã gửi, tiến trình tự luyện, câu sai, câu đã lưu, bài thi và kết quả, mục tiêu ngày, thời gian học được ghi nhận và chuỗi ngày học. Dữ liệu cụ thể phụ thuộc tính năng bạn sử dụng.',
          'Bảo mật thiết bị: mã nhận diện trình duyệt, loại thiết bị, tên trình duyệt/hệ điều hành, phiên truy cập, lần đăng nhập đầu và gần nhất, lịch sử thu hồi thiết bị và số lượt thay thế.',
          'Gói và hỗ trợ: loại gói, thời hạn, mã giới thiệu, ưu đãi, lịch sử đổi mã; thông tin giao dịch và chứng từ bạn gửi để đối soát; báo lỗi câu hỏi, mô tả lỗi và các trao đổi hỗ trợ.',
          'Truy cập kỹ thuật: đường dẫn trang, thời điểm, nguồn truy cập, loại trình duyệt/thiết bị và khu vực truy cập do công cụ thống kê hoặc hạ tầng ghi nhận. Đây không phải thông tin vị trí GPS chính xác.',
        ],
      },
      {
        id: 'muc-dich', title: '3. Mục đích sử dụng',
        items: [
          'Tạo và duy trì tài khoản; xác thực đăng nhập, khôi phục truy cập và quản lý giới hạn thiết bị.',
          'Lưu kết quả và tiến trình, hiển thị thống kê, giúp bạn tiếp tục học và luyện lại các câu cần ôn.',
          'Đối soát khoản chuyển tiền, kích hoạt hoặc gia hạn gói, xử lý ưu đãi và yêu cầu thanh toán.',
          'Tiếp nhận báo lỗi, phản hồi qua Thông báo, giải quyết hỗ trợ và phát hiện hành vi lạm dụng.',
          'Theo dõi chất lượng vận hành và số liệu truy cập tổng hợp để cải thiện tốc độ, độ ổn định và nội dung.',
        ],
        paragraphs: [
          'FlyDo không dùng mật khẩu, đáp án đã nhập hay nội dung trao đổi hỗ trợ làm dữ liệu sự kiện thống kê truy cập. Bộ lọc thống kê hiện loại bỏ tham số và phần sau dấu # của URL, đồng thời bỏ qua đường dẫn xử lý xác thực. Chính sách này không cho phép bán dữ liệu cá nhân hoặc dùng dữ liệu học tập để nhắm quảng cáo.',
          'Việc xử lý được thực hiện trên căn cứ phù hợp theo pháp luật, chẳng hạn cung cấp dịch vụ bạn yêu cầu, thực hiện nghĩa vụ pháp lý hoặc sự đồng ý khi cần. Đọc trang này không thay thế sự đồng ý riêng cho mục đích cần xin phép.',
        ],
      },
      {
        id: 'luu-trinh-duyet', title: '4. Cookie, bộ nhớ trình duyệt và thống kê',
        paragraphs: [
          'FlyDo dùng cookie hoặc bộ nhớ trình duyệt để giữ phiên đăng nhập, nhận diện thiết bị, ghi nhớ theme và lưu một số trạng thái/bản nháp. Một phần tài nguyên giao diện cũng có thể được lưu đệm để tải nhanh hoặc hiển thị trang hỗ trợ khi mất mạng.',
          'Bạn có thể quản lý các dữ liệu này trong cài đặt trình duyệt. Chặn hoặc xóa chúng có thể khiến bạn phải đăng nhập lại, mất bản nháp chỉ lưu tại máy hoặc được nhận diện như thiết bị mới. Không xóa khi đang làm bài; đăng xuất trên máy dùng chung.',
          'Thống kê truy cập phục vụ đánh giá lưu lượng và vận hành, không phải tính năng phát lại màn hình hay ghi lại nội dung bạn gõ. Chính sách không đồng nghĩa mọi nhật ký kỹ thuật của hạ tầng đều là dữ liệu ẩn danh.',
        ],
      },
      {
        id: 'tiep-can', title: '5. Ai có thể tiếp cận dữ liệu',
        items: [
          'Bạn truy cập hồ sơ và kết quả của mình trong phạm vi tính năng được cung cấp. Khi nhờ hỗ trợ, nhân sự phụ trách có thể kiểm tra dữ liệu liên quan để xử lý yêu cầu.',
          'Đơn vị cung cấp hạ tầng kỹ thuật, xác thực đăng nhập, gửi thư, lưu trữ hoặc thống kê có thể xử lý phần thông tin cần thiết cho vai trò của họ, theo các điều kiện bảo vệ dữ liệu áp dụng.',
          'Ngân hàng và bên thực hiện giao dịch xử lý thông tin chuyển khoản theo nghiệp vụ và chính sách riêng. FlyDo chỉ cần thông tin liên quan để đối soát, không yêu cầu mật khẩu ngân hàng hay mã OTP.',
          'Dữ liệu có thể được cung cấp cho cơ quan có thẩm quyền khi có căn cứ pháp luật, hoặc cho bên khác khi có sự đồng ý cần thiết của bạn.',
        ],
        paragraphs: [
          'Dữ liệu có thể được lưu trữ hoặc xử lý ngoài Việt Nam tùy vị trí hạ tầng của bên cung cấp. FlyDo có trách nhiệm thực hiện các yêu cầu bảo vệ và chuyển dữ liệu áp dụng; bạn có thể liên hệ để hỏi thêm về phạm vi xử lý liên quan đến tài khoản.',
          'Kết quả học tập không được coi là thông tin công khai chỉ vì bạn có tài khoản. Nếu sử dụng một tính năng công khai, cần xem phạm vi hiển thị của tính năng đó trước khi cung cấp thông tin.',
        ],
      },
      {
        id: 'luu-giu', title: '6. Lưu giữ và bảo vệ thông tin',
        paragraphs: [
          'Dữ liệu được lưu theo mục đích sử dụng và nghĩa vụ áp dụng. Tiến trình học gắn với tài khoản không tự bị xóa chỉ vì FlyMax hết hạn hoặc bạn đăng xuất. Dữ liệu chỉ lưu ở trình duyệt có thể bị mất khi bạn xóa bộ nhớ hoặc đổi thiết bị.',
          'Khi nhận yêu cầu xóa hoặc khi dữ liệu không còn cần cho mục đích hợp pháp, FlyDo rà soát để xóa, ẩn danh hoặc hạn chế lưu giữ phù hợp. Chứng từ giao dịch, thông tin tranh chấp hoặc dữ liệu phải lưu theo luật có thể cần được giữ trong thời hạn tương ứng và không được sử dụng tùy tiện cho mục đích khác.',
          'FlyDo áp dụng kiểm soát truy cập và các biện pháp kỹ thuật phù hợp để giảm rủi ro. Không có hệ thống Internet nào được bảo đảm an toàn tuyệt đối. Nếu có sự cố ảnh hưởng thông tin của bạn, FlyDo xử lý và thông báo theo yêu cầu pháp luật áp dụng.',
        ],
      },
      {
        id: 'quyen-du-lieu', title: '7. Quyền và lựa chọn của bạn',
        items: [
          'Được biết việc xử lý dữ liệu; yêu cầu xem, cung cấp hoặc chỉnh sửa thông tin của mình.',
          'Yêu cầu xóa, hạn chế xử lý, phản đối xử lý hoặc rút lại sự đồng ý khi áp dụng; khiếu nại và thực hiện các quyền khác theo pháp luật.',
          'Chỉnh sửa các trường hồ sơ được hỗ trợ tại Thông tin tài khoản. Với yêu cầu chưa có nút tự thao tác, gửi email đến supports@flydovn.com.',
        ],
        paragraphs: [
          'Hãy gửi từ email gắn với tài khoản và mô tả rõ yêu cầu. FlyDo có thể xác minh danh tính bằng thông tin tối thiểu cần thiết, không yêu cầu mật khẩu hoặc OTP. Người đại diện hợp pháp có thể gửi yêu cầu theo thẩm quyền của mình.',
          'FlyDo phản hồi về phạm vi, kết quả hoặc lý do chưa thể thực hiện trong thời hạn pháp luật áp dụng. Việc xóa dữ liệu cần cho tài khoản có thể làm mất khả năng tiếp tục học hoặc truy cập gói; hậu quả liên quan được giải thích trước khi xử lý. Rút lại sự đồng ý không làm mất tính hợp pháp của việc xử lý trước đó.',
        ],
      },
      {
        id: 'tre-em', title: '8. Dữ liệu của trẻ em',
        paragraphs: [
          'FlyDo phục vụ học sinh nên việc bảo vệ dữ liệu trẻ em cần được ưu tiên. Cha mẹ hoặc người đại diện hợp pháp nên cùng người học đọc chính sách, hướng dẫn chọn ảnh/tên phù hợp và không cung cấp thông tin riêng tư không cần thiết.',
          'Đối với việc xử lý cần sự đồng ý của người đại diện hoặc của cả trẻ em theo độ tuổi và mục đích, FlyDo phải đáp ứng yêu cầu đó. Không mặc định một lần đăng nhập đã chứng minh đủ mọi sự đồng ý cần thiết. Nếu nghi ngờ dữ liệu trẻ em được cung cấp hoặc công khai không phù hợp, hãy liên hệ để được xác minh và xử lý.',
        ],
      },
      {
        id: 'cap-nhat-bao-mat', title: '9. Cập nhật và liên hệ',
        paragraphs: [
          'Ngày cập nhật được hiển thị trên trang. Khi thay đổi đáng kể mục đích, phạm vi xử lý hoặc quyền của người dùng, FlyDo thông báo phù hợp và xin sự đồng ý mới nếu pháp luật yêu cầu.',
          'Gửi câu hỏi, yêu cầu dữ liệu hoặc phản ánh sự cố bảo mật đến supports@flydovn.com. Không gửi công khai thông tin tài khoản hoặc dữ liệu của người khác.',
        ],
        links: [{ href: '/support', label: 'Hướng dẫn gửi yêu cầu bảo mật' }],
      },
    ],
  },
  payment: {
    title: 'Thanh toán & hoàn tiền',
    description: 'Cách thanh toán, đối soát, kích hoạt gói và xử lý các vấn đề giao dịch trên FlyDo.',
    summary: 'Thanh toán bằng chuyển khoản hoặc QR theo thông tin FlyDo công bố. FlyDo kiểm tra giao dịch và kích hoạt thủ công; thao tác xác nhận hoặc ảnh chuyển khoản không tự thay thế việc đối soát.',
    sections: [
      {
        id: 'truoc-thanh-toan', title: '1. Kiểm tra trước khi thanh toán',
        paragraphs: [
          'Đăng nhập đúng tài khoản nhận gói, chọn thời hạn và kiểm tra quyền lợi, số tiền sau ưu đãi tại Gói FlyDo. Giá hiển thị bằng đồng Việt Nam; phí ngân hàng, nếu có, được ngân hàng thông báo riêng.',
          'Chỉ dùng thông tin ngân hàng hoặc QR được công bố trong kênh chính thức của FlyDo. Kiểm tra ngân hàng, số tài khoản, tên người nhận, số tiền và nội dung chuyển khoản trong ứng dụng ngân hàng trước khi xác nhận. Không chuyển tiền nếu thông tin chưa đầy đủ hoặc khác với hướng dẫn.',
          'Người học chưa thành niên cần để cha mẹ hoặc người đại diện hợp pháp xem xét và thực hiện hoặc đồng ý với giao dịch theo quy định áp dụng.',
        ],
        links: [{ href: '/pricing', label: 'Kiểm tra quyền lợi và giá gói' }],
      },
      {
        id: 'chuyen-khoan', title: '2. Chuyển khoản và gửi thông tin đối soát',
        items: [
          'Chuyển đúng số tiền và dùng nội dung chuyển khoản được FlyDo hướng dẫn để nhận diện tài khoản.',
          'Giữ biên nhận hoặc mã giao dịch. Gửi đến supports@flydovn.com email tài khoản nhận gói, gói/thời hạn đã chọn, số tiền, thời điểm và mã giao dịch hoặc biên nhận để yêu cầu kích hoạt.',
          'Che số dư và giao dịch không liên quan trên ảnh; không gửi mật khẩu, OTP hoặc toàn bộ lịch sử ngân hàng.',
          'Nếu ghi sai nội dung, thiếu/thừa tiền hoặc chọn nhầm tài khoản, liên hệ hỗ trợ trước khi chuyển thêm. Không chuyển lặp chỉ vì gói chưa xuất hiện ngay.',
        ],
      },
      {
        id: 'kich-hoat', title: '3. Xác nhận và kích hoạt thủ công',
        paragraphs: [
          'Quản trị viên kiểm tra khoản tiền thực nhận, đối chiếu gói và tài khoản, sau đó kích hoạt hoặc gia hạn thủ công. Gói không tự kích hoạt chỉ vì bạn quét QR, bấm xác nhận hay gửi ảnh biên nhận.',
          'Thời gian xử lý phụ thuộc việc nhận đủ thông tin và đối soát ngân hàng; không mặc định kích hoạt tức thì hoặc hỗ trợ liên tục 24/7. Nếu cần bổ sung hoặc có chậm trễ, FlyDo trao đổi qua kênh hỗ trợ và thông báo tiến độ dự kiến.',
          'Thời hạn FlyMax được tính từ thời điểm kích hoạt được xác nhận; nếu gia hạn khi còn hạn, phần thời gian mua thêm được cộng nối tiếp thời hạn hiện có. Hãy kiểm tra gói và ngày hết hạn trong Thông tin tài khoản; báo ngay nếu không đúng xác nhận.',
        ],
      },
      {
        id: 'gia-han', title: '4. Gia hạn và phạm vi quyền lợi',
        paragraphs: [
          'Thời hạn FlyMax được tính theo số ngày: gói 1 tháng là 30 ngày, 3 tháng là 90 ngày, 6 tháng là 180 ngày và 1 năm là 365 ngày. FlyInfinity là gói trọn đời, thanh toán một lần, không cần gia hạn và không có ngày hết hạn cố định trong hệ thống. Các gói gắn với tài khoản đã mua và không tự chuyển sang tài khoản khác.',
          'FlyDo không tự động ghi nợ hoặc trừ tiền gia hạn. Khi FlyMax hết hạn, tài khoản trở về quyền truy cập FlyGo; tiến trình và kết quả học tập gắn với tài khoản không bị xóa chỉ vì gói hết hạn.',
          'Nếu giao dịch hoặc kích hoạt nhầm tài khoản, FlyDo kiểm tra chứng từ và quyền sở hữu trước khi xem xét điều chỉnh. Không mặc định có thể chuyển một gói đã sử dụng cho người khác.',
          'Thay đổi về giá hoặc quyền lợi áp dụng được thông báo rõ cho giao dịch mới. Quyền lợi của giao dịch đã xác nhận và các quyền bắt buộc theo pháp luật được bảo lưu; FlyDo không tự ý yêu cầu trả thêm cho phần dịch vụ đã mua.',
        ],
      },
      {
        id: 'uu-dai', title: '5. Ưu đãi và giftcode',
        paragraphs: [
          'Ưu đãi chỉ áp dụng khi còn hiệu lực, đủ điều kiện và được tính trong số tiền xác nhận trước khi mua. Mã giới thiệu và ưu đãi streak không mặc định cộng dồn; kiểm tra số tiền cuối cùng thay vì tự cộng tỷ lệ giảm.',
          'Giftcode có giới hạn thời gian, số lượt dùng hoặc điều kiện theo từng đợt. Mã FlyMax hợp lệ cộng số ngày theo điều kiện mã; quà tặng khác áp dụng cho tính năng tương ứng khi được cung cấp. Mã hoặc ngày thưởng không mặc nhiên đổi thành tiền; quyền xử lý đối với mã có trả tiền vẫn tuân theo giao dịch và pháp luật.',
          'Không tạo giao dịch hoặc tài khoản giả để nhận ưu đãi. Nếu có nghi vấn, FlyDo kiểm tra và giải thích việc điều chỉnh quyền lợi liên quan.',
        ],
      },
      {
        id: 'hoan-tien', title: '6. Trường hợp xử lý hoàn tiền',
        items: [
          'Chuyển khoản trùng hoặc thừa: khoản chênh lệch đã đối soát được hoàn lại, trừ khi bạn đồng ý dùng cho một giao dịch khác.',
          'Đã nhận tiền nhưng gói chưa được kích hoạt: bạn có thể yêu cầu đối soát để kích hoạt hoặc hoàn khoản chưa dùng sau khi xác minh. Không bắt buộc chuyển thêm tiền để xử lý yêu cầu.',
          'Kích hoạt sai gói, sai thời hạn hoặc thiếu quyền lợi do FlyDo: FlyDo điều chỉnh đúng giao dịch; nếu không thể cung cấp dịch vụ đã mua, xử lý hoàn tiền phù hợp với phần dịch vụ không cung cấp.',
          'Dịch vụ trả phí bị gián đoạn đáng kể hoặc không đáp ứng quyền lợi đã xác nhận: FlyDo kiểm tra ảnh hưởng và trao đổi phương án khắc phục, bổ sung thời gian hoặc hoàn tiền phù hợp; không áp đặt thay hoàn tiền bằng quà tặng khi cần sự đồng ý của bạn.',
          'Đổi ý sau khi gói đã kích hoạt hoặc sử dụng: không mặc định được hoàn toàn bộ, nhưng yêu cầu vẫn được xem xét theo thực tế giao dịch, phần đã sử dụng và các quyền theo pháp luật.',
        ],
        paragraphs: [
          'Chính sách này không loại trừ quyền hủy/chấm dứt, hoàn tiền hoặc bồi thường khi có căn cứ pháp luật. Không có quy định “không hoàn tiền trong mọi trường hợp”. Khoản hoàn được tính trên số tiền thực trả liên quan, không phải giá trước ưu đãi.',
        ],
      },
      {
        id: 'quy-trinh-hoan', title: '7. Cách yêu cầu hoàn tiền',
        paragraphs: [
          'Gửi email đến supports@flydovn.com, nêu email tài khoản, gói đã mua, giao dịch, vấn đề gặp phải và phương án mong muốn. FlyDo xác nhận tiếp nhận trong tối đa 3 ngày làm việc; đây là thời gian tiếp nhận, không phải cam kết mọi khoản hoàn đều hoàn tất trong 3 ngày.',
          'Sau khi xác minh, FlyDo trả lời căn cứ, số tiền và thời điểm dự kiến xử lý. Thời hạn hoàn thực hiện theo thỏa thuận phù hợp và pháp luật áp dụng; nếu ngân hàng hoặc việc đối soát gây chậm trễ, FlyDo thông báo thay vì coi yêu cầu đã đóng.',
          'Khoản hoàn được trả theo phương thức thanh toán ban đầu, trừ khi bạn đồng ý phương thức khác. FlyDo chỉ yêu cầu thông tin nhận tiền cần thiết và xác minh phù hợp để tránh hoàn nhầm. Không tự áp dụng phí xử lý không được công bố hoặc không có căn cứ.',
        ],
        links: [{ href: '/support', label: 'Hỗ trợ giao dịch và khiếu nại' }],
      },
      {
        id: 'an-toan-giao-dich', title: '8. An toàn giao dịch',
        paragraphs: [
          'FlyDo không yêu cầu mật khẩu ngân hàng, OTP, cài ứng dụng điều khiển máy hoặc chuyển một khoản phí để nhận hoàn tiền. Khi nhận yêu cầu đáng ngờ, dừng thao tác và kiểm tra lại qua supports@flydovn.com.',
          'Nếu chuyển sai người nhận ngoài thông tin FlyDo công bố, liên hệ ngân hàng ngay để được hỗ trợ tra soát. FlyDo hỗ trợ xác minh thông tin của mình nhưng không thể tự thu hồi tiền từ tài khoản ngân hàng của bên khác.',
        ],
      },
    ],
  },
  support: {
    title: 'Hỗ trợ & khiếu nại',
    description: 'Cách liên hệ FlyDo về tài khoản, câu hỏi, thanh toán và quyền riêng tư.',
    summary: 'Email hỗ trợ: supports@flydovn.com. Với lỗi trong một câu hỏi, báo ngay tại câu đó để quản trị viên nhận đúng nội dung và phản hồi qua Thông báo.',
    sections: [
      {
        id: 'lien-he', title: '1. Đầu mối hỗ trợ chính thức',
        paragraphs: [
          'FlyDo Việt Nam tiếp nhận yêu cầu tại supports@flydovn.com. Bạn không cần đăng nhập để gửi email hoặc đọc các chính sách này. Dùng email gắn với tài khoản khi cần kiểm tra dữ liệu cá nhân hoặc giao dịch.',
          'Chọn tiêu đề dễ nhận diện, ví dụ: [Tài khoản], [Báo lỗi], [Thanh toán], [Hoàn tiền] hoặc [Bảo mật]. Không đăng công khai thông tin riêng tư để nhờ hỗ trợ.',
        ],
      },
      {
        id: 'bao-loi-cau-hoi', title: '2. Báo lỗi câu hỏi ngay trong bài',
        paragraphs: [
          'Trong Tự luyện hoặc Thi thử, bấm Báo lỗi câu hỏi và chọn lý do: đáp án có vẻ sai; lời giải sai hoặc thiếu; đề chưa rõ hoặc thiếu dữ kiện; lỗi công thức/hình vẽ; lỗi chính tả/ký hiệu; hoặc lỗi khác.',
          'Mô tả ngắn chỗ bạn thấy chưa đúng. Hệ thống gửi nội dung câu hỏi liên quan cùng phản ánh đến quản trị viên, giúp kiểm tra đúng câu. Trạng thái có thể là Mới, Đang kiểm tra, Đã xử lý hoặc Không xác nhận lỗi.',
          'Khi quản trị viên phản hồi, bạn nhận nội dung tại Thông báo của tài khoản báo lỗi. Nếu chưa thể dùng nút báo lỗi, gửi email kèm đường dẫn bài, level hoặc tên đề và ảnh lỗi phù hợp.',
        ],
      },
      {
        id: 'thong-tin-can-gui', title: '3. Thông tin nên gửi theo từng vấn đề',
        items: [
          'Tài khoản/thiết bị: email tài khoản, tên trình duyệt, loại thiết bị, thời điểm và thông báo lỗi. Không gửi mật khẩu, mã OTP hoặc liên kết đăng nhập.',
          'Lỗi giao diện/bài học: đường dẫn trang, bước gây lỗi, điều bạn mong đợi, ảnh chụp đã che thông tin riêng tư. Cho biết lỗi xảy ra trên điện thoại hay máy tính.',
          'Thanh toán/hoàn tiền: tài khoản nhận gói, gói/thời hạn, số tiền, thời điểm, mã giao dịch hoặc biên nhận và phương án mong muốn. Che số dư và thông tin ngân hàng không liên quan.',
          'Dữ liệu cá nhân: nêu rõ muốn xem, sửa, xóa hoặc hạn chế dữ liệu nào. Với yêu cầu thay mặt người học, cho biết vai trò đại diện để FlyDo hướng dẫn xác minh phù hợp.',
        ],
      },
      {
        id: 'xu-ly-yeu-cau', title: '4. Tiếp nhận và xử lý',
        paragraphs: [
          'FlyDo xác nhận tiếp nhận phản ánh, yêu cầu hoặc khiếu nại trong tối đa 3 ngày làm việc kể từ khi nhận. Xác nhận tiếp nhận không có nghĩa vấn đề đã được giải quyết hoặc giao dịch đã được kích hoạt.',
          'Sau đó FlyDo kiểm tra, yêu cầu bổ sung khi cần và trao đổi kết quả hoặc thời gian xử lý dự kiến. Ưu tiên các sự cố ảnh hưởng bảo mật và quyền truy cập. Thời hạn riêng theo pháp luật về dữ liệu, giao dịch hoặc khiếu nại được áp dụng nếu có.',
          'Với báo lỗi câu hỏi, kết quả gửi qua Thông báo khi quản trị viên phản hồi. Với email, FlyDo trả lời trong chuỗi thư liên quan. Nếu chưa thấy phản hồi, kiểm tra thư rác và gửi tiếp trong cùng chuỗi thư để giữ đầy đủ thông tin.',
        ],
      },
      {
        id: 'khieu-nai', title: '5. Khi chưa đồng ý với kết quả',
        paragraphs: [
          'Bạn có thể trả lời lại, chỉ rõ nội dung chưa đồng ý và cung cấp thông tin bổ sung để FlyDo xem xét. Khi từ chối một yêu cầu, FlyDo cần giải thích căn cứ phù hợp với sự việc.',
          'Trao đổi với FlyDo không hạn chế quyền yêu cầu cơ quan có thẩm quyền, tổ chức bảo vệ người tiêu dùng hoặc tòa án giải quyết theo pháp luật. Không bắt buộc bạn từ bỏ quyền khiếu nại để nhận hỗ trợ.',
        ],
        links: [{ href: '/privacy', label: 'Chính sách bảo mật' }, { href: '/payment-policy', label: 'Thanh toán & hoàn tiền' }],
      },
    ],
  },
};
