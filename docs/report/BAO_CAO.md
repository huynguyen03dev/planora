# BÁO CÁO ĐỒ ÁN TỐT NGHIỆP

---

<div align="center">

**TRƯỜNG ĐẠI HỌC PHENIKAA**  
**KHOA CÔNG NGHỆ THÔNG TIN**

---

# XÂY DỰNG ỨNG DỤNG WEB QUẢN LÝ DỰ ÁN  
# THEO MÔ HÌNH KANBAN — PLANORA

*(Building a Kanban Project-Management Web Application — Planora)*

---

**Giảng viên hướng dẫn:** Phạm Ngọc Hưng

**Sinh viên thực hiện:** Nguyễn Quang Huy  
**Mã số sinh viên:** 21010597  
**Năm học:** 2025–2026

---

Hà Nội, 2026

</div>

---

## LỜI CẢM ƠN

Trước hết, em xin gửi lời cảm ơn chân thành nhất tới thầy **Phạm Ngọc Hưng**, giảng viên hướng dẫn của đồ án, người đã tận tình định hướng, góp ý và đồng hành cùng em trong suốt quá trình thực hiện đề tài. Những lời khuyên về mặt kỹ thuật, phương pháp làm việc cũng như cách thức trình bày vấn đề của thầy đã giúp em hoàn thiện cả về sản phẩm lẫn bài báo cáo này.

Em cũng xin gửi lời cảm ơn tới toàn thể các thầy cô trong Khoa Công nghệ thông tin, Trường Đại học Phenikaa đã truyền đạt những kiến thức nền tảng về công nghệ phần mềm, cơ sở dữ liệu và kỹ thuật lập trình trong suốt thời gian học tập tại trường.

Cuối cùng, em xin cảm ơn gia đình và bạn bè đã luôn động viên, tạo điều kiện tốt nhất để em có thể tập trung hoàn thành đồ án tốt nghiệp này.

Em xin chân thành cảm ơn!

---

## TÓM TẮT

Quản lý dự án theo mô hình Kanban là một trong những phương pháp phổ biến nhất giúp các nhóm làm việc trực quan hóa tiến độ công việc, giới hạn công việc đang triển khai và cải thiện luồng công việc. Nhu cầu về một công cụ quản lý dự án trực tuyến hỗ trợ cộng tác theo thời gian thực, phân quyền truy cập theo không gian làm việc và phân tích tiến độ là rất lớn đối với các nhóm nhỏ và vừa.

Đồ án này trình bày việc phân tích, thiết kế và xây dựng **Planora** — một ứng dụng web quản lý dự án theo mô hình Kanban (tương tự Trello) với kiến trúc full-stack hiện đại: **Next.js 16** (App Router, React 19, Server Actions) kết hợp **TypeScript 5** (chế độ strict), **Prisma 7** với cơ sở dữ liệu **PostgreSQL 16**, xác thực và phân quyền bằng **Better Auth** (mô hình RBAC ba vai trò admin/editor/viewer theo không gian làm việc), đồng bộ thời gian thực bằng **Socket.io**, giao diện với **Tailwind CSS 4** và **shadcn/ui**. Toàn bộ các thao tác ghi dữ liệu đi qua Server Actions theo một hợp đồng chuẩn: xác minh phiên → kiểm tra quyền → cô lập không gian làm việc → kiểm tra dữ liệu bằng Zod → thao tác Prisma → phát sự kiện thời gian thực → cập nhật lại giao diện.

Hệ thống cung cấp các tính năng chính: bảng – danh sách – thẻ Kanban với kéo thả và thứ tự định vị theo khoảng cách float-gap; không gian làm việc và phân quyền truy cập theo vai trò; đồng bộ thời gian thực nhiều người dùng; dashboard phân tích tiến độ (burndown, lead time, tỉ lệ quá hạn, tỉ lệ mở lại) dựa trên luồng sự kiện lịch sử thẻ dạng append-only; hệ thống tự động hóa kiểu Butler với cơ chế chống vòng lặp bốn tầng; thông báo trong ứng dụng và qua email; quản lý an toàn vòng đời danh sách với xóa mềm và xóa vĩnh viễn có bảo vệ.

Chất lượng sản phẩm được đảm bảo bởi **1.404 bài kiểm thử đơn vị/tích hợp** (90 tệp), **155 bài kiểm thử thành phần giao diện** (RTL) và **36 bài kiểm thử E2E** với hai phiên trình duyệt thực tế, trong đó có ma trận phân quyền RBAC 142 trường hợp và các bằng chứng kiểu "sabotage-verified" xác minh tính đúng đắn của các rào cản bảo mật. Đồ án được triển khai trên nền tảng Railway với email qua Resend và lưu trữ file qua Cloudinary, kèm quy trình demo bảo vệ có thể lặp lại.

**Từ khóa:** Kanban, quản lý dự án, Next.js, Server Actions, React 19, Prisma, PostgreSQL, Socket.io, thời gian thực, RBAC, kiểm thử.

---

### ABSTRACT

Project management based on the Kanban model is one of the most popular approaches for teams to visualize work progress, limit work in progress, and improve workflow. There is a significant demand for an online project-management tool that supports real-time collaboration, workspace-scoped access control, and progress analytics for small and medium teams.

This thesis presents the analysis, design, and implementation of **Planora** — a Trello-like Kanban project-management web application built on a modern full-stack architecture: **Next.js 16** (App Router, React 19, Server Actions) with **TypeScript 5** (strict mode), **Prisma 7** on **PostgreSQL 16**, authentication and authorization via **Better Auth** (three-role RBAC — admin/editor/viewer — scoped per workspace), real-time sync via **Socket.io**, and UI built with **Tailwind CSS 4** and **shadcn/ui**. Every data mutation flows through Server Actions following a strict contract: session verification → permission check → workspace isolation → Zod validation → Prisma transaction → real-time emit → path revalidation.

The system delivers: Kanban boards, lists, and cards with drag-and-drop and float-gap ordering; workspace management and role-based access control; real-time multi-user collaboration; an analytics dashboard (burndown, lead time, overdue rate, reopen rate) reconstructed from an append-only card-history event stream; a Butler-style automation engine with four-layer loop prevention; in-app and email notifications; and a safe list lifecycle with soft-delete and guarded permanent deletion.

Product quality is backed by **1,404 unit/integration tests** (90 files), **155 React component tests** (RTL), and **36 end-to-end tests** across two real browser clients, including a 142-case RBAC permission matrix and sabotage-verified proofs of the security boundaries. The application is deployed on Railway with email via Resend and file storage via Cloudinary, together with a repeatable defense-demo workflow.

**Keywords:** Kanban, project management, Next.js, Server Actions, React 19, Prisma, PostgreSQL, Socket.io, real-time, RBAC, testing.

---

## MỤC LỤC

| | | |
| --- | --- | --- |
| **LỜI CẢM ƠN** | | 2 |
| **TÓM TẮT** | | 3 |
| **CHƯƠNG 1 — GIỚI THIỆU ĐỀ TÀI** | | 5 |
| | 1.1 Bối cảnh và bài toán | 5 |
| | 1.2 Mục tiêu của đồ án | 6 |
| | 1.3 Phạm vi thực hiện | 7 |
| | 1.4 Phương pháp thực hiện | 8 |
| | 1.5 Cấu trúc báo cáo | 9 |
| **CHƯƠNG 2 — CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ** | | 10 |
| | 2.1 Kiến trúc web hiện đại với Next.js App Router | 10 |
| | 2.2 Next.js 16, React 19 và TypeScript | 12 |
| | 2.3 Prisma 7 và PostgreSQL 16 | 13 |
| | 2.4 Better Auth và mô hình RBAC | 14 |
| | 2.5 Socket.io và đồng bộ thời gian thực | 15 |
| | 2.6 Tailwind CSS 4 và shadcn/ui | 16 |
| | 2.7 Các khái niệm thiết kế liên quan | 17 |
| **CHƯƠNG 3 — PHÂN TÍCH VÀ THIẾT KẾ** | | 19 |
| | 3.1 Yêu cầu chức năng | 19 |
| | 3.2 Yêu cầu phi chức năng | 22 |
| | 3.3 Use case chính | 23 |
| | 3.4 Thiết kế cơ sở dữ liệu | 24 |
| | 3.5 Kiến trúc tổng thể | 28 |
| | 3.6 Luồng mutation chuẩn qua Server Action | 30 |
| | 3.7 Thiết kế bảo mật | 31 |
| **CHƯƠNG 4 — HIỆN THỰC** | | 33 |
| | 4.1 Tổ chức mã nguồn | 33 |
| | 4.2 Xác thực và phân quyền | 35 |
| | 4.3 Quản lý bảng – danh sách – thẻ | 37 |
| | 4.4 Đồng bộ thời gian thực | 39 |
| | 4.5 Hệ thống analytics | 41 |
| | 4.6 Động cơ tự động hóa (automation) | 43 |
| | 4.7 Hệ thống thông báo | 45 |
| | 4.8 Giao diện người dùng và design system | 46 |
| | 4.9 Khó khăn và các quyết định thiết kế quan trọng | 47 |
| **CHƯƠNG 5 — KIỂM THỬ** | | 51 |
| | 5.1 Chiến lược kiểm thử | 51 |
| | 5.2 Kiểm thử đơn vị và tích hợp | 52 |
| | 5.3 Kiểm thử thành phần giao diện (React Testing Library) | 54 |
| | 5.4 Kiểm thử E2E hai phiên trình duyệt | 54 |
| | 5.5 Kỹ thuật sabotage-verified | 56 |
| | 5.6 Ma trận phân quyền RBAC | 57 |
| | 5.7 CI/CD với GitHub Actions | 58 |
| | 5.8 TEST_MATRIX — bản đồ contract đến bằng chứng | 59 |
| **CHƯƠNG 6 — TRIỂN KHAI VÀ DEMO** | | 60 |
| | 6.1 Môi trường triển khai | 60 |
| | 6.2 Cấu hình môi trường và cơ sở dữ liệu | 61 |
| | 6.3 Email và lưu trữ file | 62 |
| | 6.4 Quy trình demo bảo vệ | 63 |
| | 6.5 Môi trường cục bộ với Mailpit | 64 |
| **CHƯƠNG 7 — KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN** | | 66 |
| | 7.1 Kết quả đạt được | 66 |
| | 7.2 Đánh giá tổng quan | 67 |
| | 7.3 Hạn chế | 68 |
| | 7.4 Hướng phát triển | 69 |
| **TÀI LIỆU THAM KHẢO** | | 71 |

---

## CHƯƠNG 1 — GIỚI THIỆU ĐỀ TÀI

### 1.1 Bối cảnh và bài toán

Trong bối cảnh các nhóm phát triển phần mềm và các nhóm làm việc nhỏ ngày càng phân tán, việc quản lý công việc hiệu quả trở thành một yếu tố quyết định năng suất. Phương pháp Kanban — xuất phát từ hệ thống sản xuất tinh gọn của Toyota — giúp trực quan hóa luồng công việc trên một bảng gồm nhiều cột (danh sách), trong đó mỗi thẻ (card) đại diện cho một đầu việc và được di chuyển qua các trạng thái như "Cần làm", "Đang thực hiện", "Hoàn thành". Nhờ tính trực quan và linh hoạt, mô hình Kanban được hàng triệu đội ngũ trên thế giới sử dụng thông qua các công cụ như Trello, Jira, Linear hay Notion.

Tuy nhiên, các công cụ thương mại hiện có thường đi kèm những hạn chế nhất định: chi phí thuê bao cho các tính năng nâng cao (analytics, tự động hóa, phân quyền chi tiết), phụ thuộc vào nhà cung cấp dịch vụ, và khó tùy biến sâu theo nghiệp vụ của từng tổ chức. Bên cạnh đó, với mục tiêu học tập và nghiên cứu, việc tự xây dựng một hệ thống hoàn chỉnh từ đầu là cơ hội tốt để áp dụng tổng hợp các công nghệ web hiện đại: kiến trúc full-stack, cơ sở dữ liệu quan hệ, xác thực và phân quyền, đồng bộ thời gian thực, phân tích dữ liệu và kiểm thử chất lượng.

Bài toán của đồ án được xác định như sau: **xây dựng một ứng dụng web quản lý dự án theo mô hình Kanban** cho phép một nhóm người dùng:

- Tạo nhiều **không gian làm việc (workspace)**, mỗi không gian chứa nhiều **bảng (board)**, mỗi bảng gồm nhiều **danh sách (list)** và **thẻ công việc (card)** với đầy đủ siêu dữ liệu: mô tả, nhãn, checklist, bình luận, tệp đính kèm, hạn chót, ước lượng thời gian, mức ưu tiên và phân công thành viên;
- **Cộng tác theo thời gian thực**: khi một người tạo, di chuyển hay chỉnh sửa thẻ, những người khác đang xem cùng bảng phải thấy thay đổi ngay lập tức mà không cần tải lại trang;
- **Phân quyền truy cập** theo vai trò trong từng không gian làm việc (admin/editor/viewer) để đảm bảo an toàn dữ liệu đa người thuê (multi-tenant);
- **Phân tích tiến độ** theo không gian làm việc: biểu đồ burndown, thời gian dẫn (lead time), tỉ lệ quá hạn, tỉ lệ mở lại thẻ, mức độ bao phủ ước lượng;
- **Tự động hóa** quy trình làm việc bằng các luật kiểu Butler (ví dụ: khi thẻ được chuyển vào cột "Xong" thì gắn nhãn và thông báo cho người phụ trách);
- **Thông báo** trong ứng dụng và qua email khi được nhắc đến, được phân công, hay khi thẻ đến hạn.

Một yêu cầu xuyên suốt đặt ra cho đồ án là không chỉ xây dựng tính năng mà còn phải **chứng minh chất lượng** bằng một hệ thống kiểm thử nghiêm túc, đặc biệt tại các ranh giới bảo mật (xác thực, phân quyền, cô lập không gian làm việc) và các thuật toán khó (toán vị trí khi kéo thả, xử lý sự kiện thời gian thực, tái lập chỉ số từ luồng sự kiện).

### 1.2 Mục tiêu của đồ án

Mục tiêu tổng quát của đồ án là thiết kế và hiện thực một hệ thống quản lý dự án Kanban hoàn chỉnh, sẵn sàng phục vụ nhu cầu thực tế của các nhóm nhỏ, với các mục tiêu cụ thể sau:

1. **Mục tiêu chức năng**: hiện thực đầy đủ vòng đời bảng – danh sách – thẻ với kéo thả, siêu dữ liệu thẻ (nhãn, checklist, bình luận, tệp đính kèm, hạn chót, ước lượng, ưu tiên, thành viên), quản lý không gian làm việc và mời thành viên qua email, dashboard phân tích tiến độ, động cơ tự động hóa và hệ thống thông báo.

2. **Mục tiêu phi chức năng**: đảm bảo an toàn dữ liệu (phân quyền RBAC, cô lập không gian làm việc, xác minh email), tính nhất quán dữ liệu dưới tác động đồng thời (transaction, khóa lạc quan, unique index một phần), trải nghiệm thời gian thực với độ trễ thấp và không làm hỏng trạng thái kéo thả, giao diện responsive cho cả máy tính và thiết bị di động.

3. **Mục tiêu chất lượng**: xây dựng một bộ kiểm thử toàn diện — kiểm thử đơn vị, tích hợp, kiểm thử thành phần giao diện và kiểm thử E2E với hai phiên trình duyệt — nhằm chứng minh từng hợp đồng chức năng bằng bằng chứng kiểm thử cụ thể.

4. **Mục tiêu trình diễn**: thiết lập môi trường triển khai thực tế (production) và một quy trình demo bảo vệ có thể lặp lại, dữ liệu demo có thể gieo (seed) và đặt lại (reset) một cách xác định.

### 1.3 Phạm vi thực hiện

Phạm vi của đồ án được giới hạn như sau:

- **Phạm vi chức năng**: toàn bộ các tính năng cốt lõi nêu tại mục 1.2 — bảng/danh sách/thẻ, không gian làm việc, phân quyền, thời gian thực, analytics, tự động hóa, thông báo. Một số tính năng được xác định ngoài phạm vi hoặc hoãn lại: mẫu thẻ tái sử dụng (card templates), thẻ định kỳ (recurring cards), mở rộng trigger tự động hóa cho thay đổi thuộc tính, đo lường sử dụng sản phẩm nội bộ (telemetry), và giao diện lập trình ứng dụng (API) công khai cho dữ liệu — toàn bộ thao tác ghi chỉ qua Server Actions.
- **Phạm vi người dùng**: nhóm làm việc nhỏ và vừa (khoảng 3–20 thành viên), phù hợp với mô hình một ứng dụng web đơn (single web application) không cần hạ tầng phân tán.
- **Phạm vi nền tảng**: ứng dụng chạy trên trình duyệt hiện đại (Chrome, Edge, Firefox, Safari); kiểm thử E2E tự động trên Chromium.
- **Phạm vi kỹ thuật**: kiến trúc full-stack trên nền Next.js với PostgreSQL là nguồn dữ liệu duy nhất; Socket.io chỉ đóng vai trò phát quảng bá sự kiện thời gian thực, không phải là nguồn dữ liệu.

### 1.4 Phương pháp thực hiện

Đồ án được thực hiện theo phương pháp phát triển lặp và tăng trưởng (iterative and incremental development) kết hợp với kỷ luật phát triển hướng bằng chứng (evidence-driven development):

1. **Khảo sát và phân tích**: nghiên cứu các công cụ quản lý dự án phổ biến (Trello, Linear, Notion), xác định các hợp đồng chức năng (product contracts) cho từng miền nghiệp vụ: bảng và thẻ, không gian làm việc và truy cập, đồng bộ thời gian thực, thông báo, analytics, tự động hóa. Mỗi miền có một tài liệu hợp đồng riêng trong `docs/product/`.

2. **Thiết kế**: thiết kế lược đồ cơ sở dữ liệu trên Prisma, thiết kế kiến trúc tổng thể (Server Actions làm ranh giới ghi dữ liệu, Socket.io cho phát sóng), thiết kế hệ thống phân quyền RBAC, và thiết kế hệ thống tokens cho giao diện (design system theo chuẩn Linear + Notion). Các quyết định thiết kế quan trọng được ghi lại thành 31 quyết định đánh số (decision records) trong `docs/decisions/` — từ quyết định kiến trúc (0015 — tính toàn vẹn vị trí thẻ, 0022 — động cơ tự động hóa) đến quyết định bảo mật (0023 — bắt buộc xác minh email) và vận hành (0025 — Mailpit làm bể chứa thư phát triển/kiểm thử).

3. **Hiện thực theo story**: công việc được chia thành các câu chuyện người dùng (user stories) gắn với từng epic (E01–E09), mỗi story có tiêu chí chấp nhận và bằng chứng kiểm thử rõ ràng. Toàn bộ quá trình được quản lý trên kho mã nguồn Git với nhánh phát triển `dev` và nhánh phát hành `main` (chỉ qua pull request), tạo thành 285 commit trong khoảng thời gian từ tháng 03/2026 đến tháng 08/2026.

4. **Kiểm thử liên tục**: song song với hiện thực, mỗi hợp đồng chức năng được ánh xạ tới bằng chứng kiểm thử trong tài liệu `docs/TEST_MATRIX.md`; các ranh giới bảo mật được kiểm chứng bằng kỹ thuật "sabotage-verified" (xóa rào cản kiểm tra để chứng minh rằng rào cản đó có tác dụng). CI/CD trên GitHub Actions tự động chạy lint, kiểm tra kiểu và toàn bộ bộ kiểm thử cho mỗi thay đổi.

5. **Triển khai và diễn tập demo**: triển khai ứng dụng lên môi trường production, xây dựng kịch bản demo bảo vệ với dữ liệu gieo trước xác định và quy trình đặt lại an toàn, diễn tập liên tục trên cả môi trường cục bộ (Mailpit) và CI.

### 1.5 Cấu trúc báo cáo

Báo cáo được tổ chức thành bảy chương và phần tài liệu tham khảo:

- **Chương 1 — Giới thiệu đề tài**: trình bày bối cảnh, bài toán, mục tiêu, phạm vi và phương pháp thực hiện.
- **Chương 2 — Cơ sở lý thuyết và công nghệ**: giới thiệu các khái niệm và công nghệ nền tảng được sử dụng trong đồ án.
- **Chương 3 — Phân tích và thiết kế**: phân tích yêu cầu chức năng/phi chức năng, use case, thiết kế cơ sở dữ liệu, kiến trúc tổng thể, hợp đồng Server Action và thiết kế bảo mật.
- **Chương 4 — Hiện thực**: mô tả cách hiện thực từng module chính kèm trích đoạn mã minh họa, các khó khăn gặp phải và những quyết định thiết kế quan trọng.
- **Chương 5 — Kiểm thử**: chiến lược kiểm thử, số liệu kiểm thử thực tế, kỹ thuật sabotage-verified, ma trận RBAC và hạ tầng CI/CD.
- **Chương 6 — Triển khai và demo**: môi trường triển khai, cấu hình production, email và lưu trữ file, quy trình demo bảo vệ.
- **Chương 7 — Kết luận và hướng phát triển**: tổng kết kết quả đạt được, đánh giá, hạn chế còn tồn tại và định hướng phát triển trong tương lai.

---

## CHƯƠNG 2 — CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ

### 2.1 Kiến trúc web hiện đại với Next.js App Router

#### 2.1.1 Từ mô hình CSR/SSR truyền thống đến kiến trúc React Server Components

Trong nhiều năm, các ứng dụng web phổ biến theo một trong hai mô hình: (1) **Client-Side Rendering (CSR)** — trình duyệt tải một trang trống, sau đó JavaScript tải dữ liệu và dựng toàn bộ giao diện, dẫn đến thời gian tải ban đầu chậm và khó tối ưu SEO; hoặc (2) **Server-Side Rendering (SSR)** — máy chủ dựng HTML trước mỗi yêu cầu, đảm bảo tốc độ hiển thị ban đầu nhưng phải chuyển toàn bộ dữ liệu và trạng thái xuống phía client, gây lãng phí băng thông và khó tận dụng cache.

Next.js giới thiệu mô hình **React Server Components (RSC)** trong App Router: máy chủ dựng sẵn các thành phần server (không gửi mã JavaScript của chúng xuống client), trong khi các thành phần client ("use client") vẫn được hydrate để xử lý tương tác. Điều này cho phép mỗi trang tối ưu hóa: các phần đọc dữ liệu trực tiếp từ cơ sở dữ liệu chạy hoàn toàn trên máy chủ, chỉ các phần cần tương tác (kéo thả, biểu mẫu, popover) mới trở thành JavaScript phía client. Một lợi ích quan trọng khác là khả năng **tái sử dụng dữ liệu giữa các lần điều hướng** thông qua bộ đệm Router Cache và hàm `revalidatePath()` để làm mới dữ liệu server sau một thao tác ghi.

#### 2.1.2 Server Actions — ranh giới ghi dữ liệu

**Server Actions** là cơ chế của Next.js cho phép một hàm phía server được gọi trực tiếp từ component client, thông qua cú pháp `"use server"` ở đầu tệp hoặc `"use server"` bên trong thân hàm. Server Action có các đặc điểm quan trọng:

- **Chạy trên máy chủ**: mã nguồn (bao gồm truy vấn cơ sở dữ liệu, kiểm tra quyền, đọc biến môi trường) không bao giờ được gửi xuống trình duyệt, tránh lộ logic và khóa bí mật.
- **Có thể trả về dữ liệu tuần tự hóa**: kết quả trả về dạng object thuần (plain object) để client sử dụng trực tiếp.
- **Kết hợp với cơ chế revalidation**: sau khi ghi dữ liệu, gọi `revalidatePath()` để làm mới các thành phần server phụ thuộc dữ liệu vừa thay đổi.

Trong đồ án này, Server Actions được sử dụng làm **ranh giới bắt buộc duy nhất cho mọi thao tác ghi dữ liệu** (mutation boundary), theo một hợp đồng cố định gồm tám bước (trình bày chi tiết tại mục 3.6). Không có API REST phục vụ dữ liệu — đây là một lựa chọn kiến trúc có chủ đích nhằm giảm diện tích tấn công và đảm bảo mọi đường ghi đều đi qua cùng một chuỗi kiểm tra bảo mật.

### 2.2 Next.js 16, React 19 và TypeScript

#### 2.2.1 Next.js 16

Next.js là framework React phổ biến nhất cho các ứng dụng web production. Phiên bản 16 (sử dụng trong đồ án, phiên bản 16.2.9) tiếp tục hoàn thiện App Router với các cải tiến về tốc độ build, **Turbopack** làm bundler mặc định cho chế độ phát triển, và hệ sinh thái tương thích với React 19. Các khái niệm chính được đồ án sử dụng:

- **Route groups** `(public)` và `(authenticated)/(dashboard)`: tổ chức route theo vùng quyền truy cập, mỗi vùng có `layout.tsx` riêng (ví dụ: layout xác thực kiểm tra phiên và dựng thanh điều hướng chung).
- **Route handlers** cho các điểm cuối đặc biệt: `app/api/auth/[...all]` (catch-all của Better Auth) và `app/api/notifications` (chỉ đọc), cùng route cron nội bộ cho bộ lập lịch nhắc hạn chót.
- **Server Components bất đồng bộ** (async RSC): các trang như `/boards`, `/today`, `/workspace/[slug]/dashboard` truy vấn dữ liệu trực tiếp trong quá trình render server.

#### 2.2.2 React 19

React 19 (phiên bản 19.2.3) mang lại nhiều cải tiến được đồ án tận dụng: Actions (hàm bất đồng bộ dùng trực tiếp trong form), `useOptimistic` để tối ưu trạng thái giao diện, `useFormStatus` và `useActionState` cho biểu mẫu, cũng như cơ chế preloading tài nguyên. Trong đồ án, các thành phần tương tác (kéo thả, bảng Kanban, dialog chi tiết thẻ, bảng điều khiển analytics) được xây dựng bằng client components với state quản lý qua Zustand, trong khi các trang đọc dữ liệu là server components.

#### 2.2.3 TypeScript 5 (strict)

Toàn bộ mã nguồn viết bằng TypeScript ở chế độ `strict: true`, target ES2017, module ESNext với resolution theo bundler. Lợi ích chính:

- **An toàn kiểu tại biên giới dữ liệu**: kiểu `Session`, `WorkspaceRole`, `Priority`… được định nghĩa tường minh, giúp phát hiện lỗi tại thời điểm biên dịch thay vì lúc chạy.
- **Hợp đồng kiểu giữa client và server**: các payload sự kiện Socket.io được khai báo kiểu tường minh (`ServerToClientEvents`, `ClientToServerEvents`) nên việc đổi tên trường sẽ làm lộ lỗi ngay khi type-check.
- **Công cụ**: `tsc --noEmit` được chạy trong cổng CI cùng ESLint (eslint-config-next core-web-vitals + typescript).

### 2.3 Prisma 7 và PostgreSQL 16

#### 2.3.1 Prisma ORM

Prisma là ORM (Object-Relational Mapping) cho Node.js/TypeScript với cách tiếp cận schema-first: lược đồ cơ sở dữ liệu được khai báo bằng ngôn ngữ riêng (Prisma Schema Language) trong `prisma/schema.prisma`, từ đó Prisma sinh ra **Prisma Client** an toàn kiểu (được sinh vào `app/generated/prisma/` — tệp tự động, không chỉnh sửa thủ công). Phiên bản 7 sử dụng kiến trúc adapter — trong đồ án, adapter `@prisma/adapter-pg` kết nối trực tiếp tới PostgreSQL qua driver `pg`, cho phép kiểm soát rõ ràng connection pool (giới hạn mặc định 10 kết nối, idle timeout 30 giây) ngay trong `lib/prisma.ts`.

Các tính năng Prisma được tận dụng sâu trong đồ án:

- **Migrations có kiểm soát**: 14 migration được tạo tuần tự từ tháng 03/2026 đến tháng 07/2026, triển khai bằng `prisma migrate deploy` trong production.
- **Interactive transaction** `db.$transaction(async (tx) => ...)`: cho phép bó nhiều thao tác ghi thành một transaction duy nhất — nền tảng của các mutation thay đổi vị trí nhiều dòng và của động cơ tự động hóa chạy trong cùng transaction với mutation kích hoạt.
- **Unique index một phần (partial unique index)**: một số ràng buộc quan trọng không thể biểu diễn bằng cú pháp `@@unique` của Prisma (vì cần mệnh đề `WHERE`), nên được tạo bằng SQL thuần trong migration — ví dụ ràng buộc `card_listId_position_live_key` trên `(listId, position)` với điều kiện `WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL` (quyết định 0015).

#### 2.3.2 PostgreSQL 16

PostgreSQL là hệ quản trị cơ sở dữ liệu quan hệ mã nguồn mở mạnh mẽ, được chọn vì độ tin cậy, hỗ trợ tốt các giao dịch ACID, kiểu JSON, chỉ mục một phần và các khóa cấp dòng. Trong đồ án, PostgreSQL 16 (chạy qua Docker Compose cục bộ — image `postgres:16-alpine` trên cổng 5432 — và qua dịch vụ container trong CI) là **nguồn dữ liệu duy nhất (source of truth)** của toàn hệ thống. Một số kỹ thuật PostgreSQL được sử dụng ở mức chuyên sâu: khóa hàng `SELECT ... FOR UPDATE` để đóng các cuộc đua đồng thời (race condition) giữa thao tác xóa vĩnh viễn danh sách và thao tác tải lên tệp đính kèm (quyết định 0029), và khóa tư vấn `pg_advisory_xact_lock` để bảo vệ bất biến "luôn còn ít nhất một admin" khi quản lý thành viên.

### 2.4 Better Auth và mô hình RBAC

**Better Auth** (phiên bản 1.5) là thư viện xác thực mã nguồn mở dành cho TypeScript, hoạt động theo mô hình "thư viện, không phải nền tảng": nó sử dụng cơ sở dữ liệu của ứng dụng thông qua Prisma Adapter, không yêu cầu dịch vụ bên ngoài. Đồ án sử dụng:

- **emailAndPassword**: đăng ký/đăng nhập bằng email và mật khẩu, với phiên (session) được lưu trữ trong bảng `Session`. Phiên có thời gian sống tuyệt đối 7 ngày, được gia hạn tối đa một lần mỗi ngày (quyết định trong 0018) để giảm ghi dữ liệu không cần thiết.
- **Xác minh email bắt buộc** (`requireEmailVerification: true`): người dùng mới phải nhấp vào đường dẫn xác minh gửi qua email trước khi sử dụng hệ thống (quyết định 0023) — đóng lỗ hổng "tài khoản chưa xác minh vẫn chấp nhận lời mời".
- **Organization plugin**: ánh xạ khái niệm tổ chức (organization) thành **workspace** và thành viên (member) thành **workspaceMember**; plugin quản lý vòng đời lời mời qua email (`Invitation`), đồng bộ vai trò và cung cấp hàm `auth.api.hasPermission()` để kiểm tra quyền theo câu lệnh truy cập (access control statements).
- **CSRF allowlist** qua `trustedOrigins` và cookie bảo mật.

**RBAC (Role-Based Access Control)** được xây dựng trên nền access control của Better Auth với ba vai trò:

- **admin** — toàn quyền trong workspace: quản lý thành viên, lời mời, xóa vĩnh viễn danh sách, tạo/quản lý luật tự động hóa;
- **editor** — tạo và chỉnh sửa nội dung (board/list/card/comment) nhưng không quản lý tổ chức, không xóa vĩnh viễn;
- **viewer** — chỉ đọc và bình luận.

Ma trận vai trò × thao tác được kiểm chứng bằng 142 trường hợp kiểm thử tự động (mục 5.6).

### 2.5 Socket.io và đồng bộ thời gian thực

**Socket.io** (phiên bản 4.8) là thư viện thời gian thực hai chiều dựa trên WebSocket, có cơ chế fallback (long-polling) và phòng (rooms) để nhóm kết nối. Trong đồ án, kiến trúc thời gian thực tuân theo một nguyên tắc bất biến: **Prisma/PostgreSQL là nguồn dữ liệu duy nhất; Socket.io chỉ phát quảng bá sự kiện để các client khác cập nhật trạng thái giao diện**.

Máy chủ HTTP tùy chỉnh (`server.ts`) bọc Next.js handler và khởi tạo Socket.io trên cùng một cổng (3000), chạy qua `tsx`. Quá trình xác thực socket diễn ra ngay ở tầng middleware: đọc cookie phiên, lấy `userId`, sau đó mỗi sự kiện tham gia phòng (`board:join`, `workspace:join`) lại được kiểm tra quyền theo phòng (`canUserJoinBoard`, `canUserJoinWorkspace` — 19 trường hợp kiểm thử chuyên biệt). Các sự kiện được định nghĩa kiểu tường minh (`card:moved`, `list:created`, `notification:new`, `analytics:refresh`…).

Điểm kỹ thuật quan trọng nhất của tầng thời gian thực là **bất biến hoãn có nhận biết kéo thả (drag-aware deferral)**: khi người dùng đang kéo một thẻ/danh sách, các sự kiện thay đổi cấu trúc (tạo, xóa, di chuyển, lưu trữ) đến từ client khác bị **hoãn lại**, cờ `pendingResync` được bật; khi thả xong, client gọi `router.refresh()` để đồng bộ lại với dữ liệu server. Điều này ngăn `@hello-pangea/dnd` bị hỏng mảng danh sách giữa lúc kéo. Ngược lại, các sự kiện thay đổi tại chỗ (đổi tên, đánh dấu hoàn thành, thay đổi nhãn/thành viên, bình luận) được áp dụng trực tiếp vì chúng không làm thay đổi thứ tự mảng.

### 2.6 Tailwind CSS 4 và shadcn/ui

**Tailwind CSS 4** là framework CSS utility-first thế hệ mới, cấu hình hoàn toàn bằng CSS (`app/globals.css`) thông qua chỉ thị `@theme`, không cần tệp `tailwind.config`. Đồ án sử dụng:

- Các token thiết kế dạng biến CSS trong không gian màu **oklch**, định nghĩa riêng cho chế độ sáng (`:root`) và tối (`.dark`), qua cơ chế `@custom-variant dark (&:is(.dark *))`.
- Utility tokens được dùng nhất quán (`bg-card`, `text-muted-foreground`, `border-border`, `rounded-lg`...) thay vì mã màu hex tùy tiện — theo đúng chuẩn design system ghi trong `DESIGN.md` (ngôn ngữ thị giác phỏng theo Linear + Notion: bề mặt trung tính phân tầng, đường viền hairline, một màu nhấn thương hiệu được dùng tiết chế).

**shadcn/ui** là bộ thành phần giao diện mã nguồn mở "copy-paste" dựa trên Radix UI (trong đồ án dùng gói `radix-ui` phiên bản 1.4, kiểu radix-vega) và class-variance-authority, cung cấp các nguyên thủy không kiểu (unstyled, accessible) như Dialog, Popover, DropdownMenu, Tooltip, Checkbox... được đồ án tùy biến bằng token. Các tệp trong `components/ui/` được quản lý bởi CLI shadcn; những chỗ tùy biến đều được chú thích `// customized:` kèm lý do để tránh bị ghi đè khi đồng bộ lại. Biểu tượng sử dụng bộ **Hugeicons** (`@hugeicons/react` + `@hugeicons/core-free-icons`).

### 2.7 Các khái niệm thiết kế liên quan

#### 2.7.1 Sắp xếp theo khoảng cách float-gap

Các thực thể có thứ tự (danh sách, thẻ, checklist, mục checklist) lưu trường `position Float` và được sắp xếp theo **khoảng cách (gap) cố định 16.384** giữa các vị trí liên tiếp — mô hình kinh điển của Planka. Khi chèn một thẻ vào giữa hai thẻ lân cận, vị trí mới là trung điểm của hai vị trí cũ:

```ts
// lib/ordering.ts (tóm tắt)
const CARD_POSITION_GAP = 16384;
const MIN_POSITION_GAP = 0.0001;

// vị trí của thẻ mới ở cuối danh sách
const position = lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
// vị trí giữa hai thẻ lân cận prev < x < next
const midpoint = (prev.position + next.position) / 2;
```

Ưu điểm: một thao tác kéo thả chỉ cần cập nhật **một dòng** (thẻ bị di chuyển), không phải ghi lại vị trí của toàn bộ danh sách. Khi khoảng cách giữa hai lân cận nhỏ hơn `MIN_POSITION_GAP` (không thể chèn trung điểm nữa), hệ thống chạy bước **chuẩn hóa (normalize)**: đánh số lại toàn bộ theo dãy cách đều. Do vị trí float dễ phát sinh va chạm dưới tác động đồng thời, quyết định 0015 bổ sung unique index một phần làm rào chặn cuối cùng, và các bước chuẩn hóa được thiết kế "collision-safe" (đánh số lại qua dải trung gian không chồng lấn).

#### 2.7.2 Xóa mềm (soft delete)

Thay vì xóa hẳn dòng dữ liệu, các thực thể quan trọng (bảng, thẻ, danh sách) được đánh dấu **archivedAt** (và `deletedAt` cho thẻ) khi lưu trữ. Lợi ích:

- Người dùng có thể khôi phục (restore) thẻ/danh sách đã lưu trữ — nền tảng của tính năng Undo (mục 4.9).
- Nhật ký hoạt động (Activity) và luồng sự kiện analytics (CardHistoryEvent) không bị mất khi thực thể bị lưu trữ: quan hệ Activity dùng `onDelete: SetNull`, còn CardHistoryEvent **không có khóa ngoại** tới bảng/card (denormalize `boardId`/`cardId`), nên lịch sử sống sót qua cả xóa vĩnh viễn.
- Truy vấn bảng Kanban luôn lọc `WHERE archivedAt IS NULL`; chỉ các chế độ xem lưu trữ mới bỏ lọc này.

Cascade xóa được cấu hình: workspace → boards → lists → cards → (members, labels, checklists, comments, attachments). Xóa vĩnh viễn danh sách được bảo vệ nghiêm ngặt (quyết định 0026, mục 4.9).

#### 2.7.3 Event sourcing cho analytics

Dashboard analytics không tính toán trực tiếp từ trạng thái hiện tại của thẻ mà **tái lập từ một luồng sự kiện append-only**: mỗi thay đổi nghiệp vụ đáng kể (tạo thẻ, di chuyển, hoàn thành, mở lại, đặt/đổi ước lượng, đặt/đổi/xóa hạn chót, phân công thành viên, lưu trữ, khôi phục, xóa) ghi một dòng `CardHistoryEvent` với `eventType`, `occurredAt` và `metadata`. Các chỉ số như burndown, lead time, tỉ lệ quá hạn, tỉ lệ mở lại được tính bằng cách "phát lại" (replay) luồng sự kiện theo thời gian. Cách tiếp cận này:

- Bảo toàn lịch sử: sửa một thẻ không làm mất đi trạng thái cũ của nó;
- Không bị xáo trộn bởi việc thực thể bị xóa;
- Tách biệt "sự kiện đã xảy ra" khỏi "trạng thái hiện tại", giúp định nghĩa chỉ số rõ ràng và kiểm chứng được (quyết định 0021 — neo chỉ số hoàn thành theo chuỗi streak).

#### 2.7.4 Các công cụ bổ trợ

- **Zustand 5**: quản lý state client cho bảng Kanban (board store) — nơi tiếp nhận sự kiện thời gian thực, áp dụng/dedupe và thực thi bất biến hoãn kéo thả.
- **@hello-pangea/dnd 18**: thư viện kéo thả (drag-and-drop), fork bảo trì của react-beautiful-dnd; kiểm thử E2E điều khiển kéo bằng bàn phím vì thư viện bỏ qua sự kiện chuột tổng hợp.
- **Resend + React Email**: gửi email giao dịch (xác minh, đặt lại mật khẩu, lời mời, nhắc hạn chót) với template viết bằng React.
- **Cloudinary**: lưu trữ tệp đính kèm và ảnh bìa thẻ qua upload signed trực tiếp, giữ metadata `cloudinaryPublicId` để dọn dẹp an toàn (quyết định 0029).
- **Vitest 2** (node + happy-dom) và **Playwright**: hai bộ chạy kiểm thử chính (Chương 5).

---

## CHƯƠNG 3 — PHÂN TÍCH VÀ THIẾT KẾ

### 3.1 Yêu cầu chức năng

Yêu cầu chức năng được phân nhóm theo các miền nghiệp vụ (domain), mỗi miền có một tài liệu hợp đồng riêng trong `docs/product/`: bảng và thẻ (`boards-and-cards.md`), không gian làm việc và truy cập (`workspaces-and-access.md`), đồng bộ thời gian thực (`realtime-sync.md`), thông báo (`notifications.md`), analytics (`analytics.md`) và tự động hóa (`automation.md`).

#### 3.1.1 Miền bảng – danh sách – thẻ (Boards, Lists, Cards)

Hệ thống Kanban với phân cấp **Workspace → Board → List → Card**, trong đó thẻ là đơn vị công việc sở hữu trạng thái hoàn thành của chính nó (thông qua trường `completedAt` — quyết định 0020), không phụ thuộc vào danh sách chứa nó:

- **Bảng (Board)**: tạo, đổi tên, đổi màu nền, đánh dấu yêu thích (star), lưu trữ (soft delete) và xóa. Bảng thuộc về một workspace, do một người dùng tạo ra.
- **Danh sách (List)**: tạo, đổi tên, sắp xếp lại theo thứ tự kéo thả, lưu trữ và khôi phục, xóa vĩnh viễn có bảo vệ (chỉ admin, xác nhận bằng cách gõ đúng tên danh sách, chặn khi còn tệp Cloudinary chưa dọn — quyết định 0026/0029).
- **Thẻ (Card)**: tạo, sửa tiêu đề, mô tả, mức ưu tiên (URGENT/HIGH/MEDIUM/LOW), hạn chót, ước lượng thời gian, chuyển giữa các danh sách và sắp xếp trong danh sách bằng kéo thả; đánh dấu hoàn thành/mở lại; lưu trữ và khôi phục; xóa vĩnh viễn (quản lý trong chế độ xem thẻ đã lưu trữ).
- **Siêu dữ liệu thẻ**: nhãn (label, với 8 màu chuẩn), checklist (nhiều mục có đánh dấu hoàn thành), bình luận, tệp đính kèm (tải lên Cloudinary), thành viên được phân công, ảnh bìa.
- **Tìm kiếm và lọc trong bảng**: lọc theo nhãn, tìm theo tiêu đề thẻ (không phân biệt hoa thường, kết hợp AND giữa hai bộ lọc) — đều là bộ lọc phía client, không gọi Server Action.
- **Lưu trữ và khôi phục**: xem các thẻ đã lưu trữ của bảng, khôi phục từng thẻ (kể cả khi danh sách cha đã bị lưu trữ — phải khôi phục danh sách trước), và khôi phục danh sách đã lưu trữ.

#### 3.1.2 Miền không gian làm việc và truy cập (Workspaces & Access)

- **Quản lý workspace**: tạo workspace (mặc định vai trò admin cho người tạo), sửa thông tin, xem danh sách thành viên.
- **Mời thành viên qua email**: lời mời gửi email tới người được mời, kể cả người chưa đăng ký tài khoản; lời mời có trạng thái (pending/accepted), thời hạn và vai trò được chọn trước. Người nhận truy cập qua trang `/invitations` hoặc đường dẫn trong email.
- **Quản lý thành viên**: thay đổi vai trò, xóa thành viên, rời workspace, hủy lời mời — với bất biến **luôn còn ít nhất một admin** (chặn thao tác làm mất admin cuối cùng, khóa tư vấn PostgreSQL bảo vệ dưới tác động đồng thời).
- **Phân quyền RBAC**: ba vai trò admin/editor/viewer áp dụng nhất quán cho mọi thao tác (mục 3.7).

#### 3.1.3 Miền đồng bộ thời gian thực (Realtime)

- Khi một người dùng thực hiện mutation thành công, các client khác đang xem cùng bảng nhận sự kiện và cập nhật giao diện tức thời: tạo/di chuyển/đổi tên/lưu trữ danh sách, tạo/di chuyển/đổi tên/lưu trữ/khôi phục thẻ, thay đổi nhãn, thay đổi thành viên, bình luận mới, đánh dấu hoàn thành.
- Dashboard analytics của workspace nhận tín hiệu `analytics:refresh` sau các thay đổi ảnh hưởng tới chỉ số và làm mới dữ liệu.
- Thông báo mới (`notification:new`) và lời mời mới (`invitation:new`) được đẩy tới phòng riêng của từng người dùng.
- Hiển thị trạng thái hiện diện (presence): danh sách avatar của những người đang xem cùng bảng, cập nhật khi vào/ra.
- Bất biến hoãn kéo thả: các sự kiện thay đổi cấu trúc bị hoãn trong lúc kéo cục bộ và được đồng bộ lại khi thả (mục 2.5).

#### 3.1.4 Miền analytics

Dashboard theo workspace (`/workspace/[slug]/dashboard`) cung cấp:

- **Burndown**: số thẻ hoàn thành tích lũy theo ngày so với đường kỳ vọng.
- **Luồng tạo – hoàn thành (created vs completed)**: đường cong số thẻ tạo mới và hoàn thành theo thời gian.
- **Lead time**: thời gian trung bình từ khi thẻ được tạo đến khi hoàn thành, hiển thị theo bảng với 100 dòng gần nhất (giới hạn có chủ đích, nhất quán với `totalCompleted`).
- **KPI**: tổng số thẻ hoàn thành, tỉ lệ quá hạn (late/overdue), tỉ lệ mở lại (reopen rate) và mức độ bao phủ ước lượng (estimation coverage).
- **Xuất CSV** an toàn: ký tự phân tách được escape, chặn các ô bắt đầu bằng ký tự công thức (`=`, `+`, `-`, `@`, tab, CR) để phòng tấn công formula injection.
- Chính sách workspace: `requireEstimateBeforeDone` (bắt buộc ước lượng trước khi hoàn thành) và thời điểm bắt đầu phân tích (`analyticsLaunchAt`).

#### 3.1.5 Miền tự động hóa (Automation)

- **Luật (Rule)** gồm: trigger (`card-created`, `card-moved-to-list`, `card-completed`, `card-reopened`, `due-date-approaching`...), điều kiện cấu trúc JSON (boardId, listId, labelId, priority) và **danh sách hành động có thứ tự** (di chuyển thẻ tới danh sách, đặt ưu tiên, gắn/gỡ nhãn, phân công/gỡ thành viên, đặt hoàn thành, thông báo thành viên).
- **Đích động (dynamic targets)**: token `card-assignees`, `card-creator`, `all` được phân giải tại thời điểm thực thi, vẫn chịu kiểm tra cô lập workspace.
- **Quản lý luật**: chỉ admin được tạo/sửa/xóa/bật-tắt; mọi thành viên xem được danh sách luật và nhật ký thực thi.
- **Cơ chế chống vòng lặp bốn tầng**: id chuỗi (chainId), trần độ sâu 5, tập dedup trong chuỗi và cảnh báo tĩnh khi lưu luật (mục 4.6).

#### 3.1.6 Miền thông báo (Notifications)

- Thông báo trong ứng dụng cho các sự kiện: được phân công, được nhắc đến (mention), thẻ đến hạn, bình luận mới, lời mời workspace — hiển thị trên chuông thông báo và trang `/notifications`, có trạng thái đã đọc/chưa đọc.
- Thông báo qua email song song cho các loại quan trọng (nhắc hạn chót, mention).
- **Bộ lập lịch nhắc hạn chót** chạy mỗi 15 phút, chọn thẻ đến hạn trong 24 giờ hoặc quá hạn, chống gửi trùng bằng ràng buộc `@@unique([cardId, userId, milestone])`.
- Nhận dạng phi trực quan cho trạng thái chưa đọc (đậm tiêu đề + nhãn sr-only) để đáp ứng WCAG 1.4.1.

#### 3.1.7 Tính năng năng suất cá nhân (Personal Productivity)

- **Today / My Work** (`/today`): chế độ xem đọc-only, đa workspace, tập hợp các thẻ được phân công cho người dùng hiện tại, phân nhóm theo hạn chót: Quá hạn / Hôm nay / Tuần này / Sau — với đường dẫn sâu về từng bảng.
- **Global quick capture**: ô nhập nhanh toàn cục mở bằng phím `C` (hoặc `Cmd/Ctrl+K`), tạo thẻ mới vào danh sách mặc định của bảng được chọn, hỗ trợ lưu tùy chọn mô tả/hạn chót/ưu tiên ngay trong cùng transaction tạo thẻ.
- **Undo có giới hạn**: sau khi lưu trữ thẻ/danh sách, snackbar Undo xuất hiện trong 8 giây, gọi đúng Server Action khôi phục thật (không phải tạo bản sao), với kiểm tra an toàn khi danh sách cha bị lưu trữ đồng thời (quyết định 0031).

### 3.2 Yêu cầu phi chức năng

1. **Bảo mật**: xác thực mọi yêu cầu ghi dữ liệu; phân quyền theo vai trò tại ranh giới server; cô lập không gian làm việc tuyệt đối (mọi truy vấn phải được giới hạn theo workspace của người gọi — thiếu phạm vi là lỗi rò rỉ dữ liệu); xác minh email bắt buộc; kiểm tra đầu vào bằng Zod trước khi chạm cơ sở dữ liệu; bảo vệ CSRF cho xác thực.
2. **Tính nhất quán dữ liệu**: mọi thao tác ghi nhiều dòng nằm trong transaction; vị trí thẻ/danh sách không bao giờ trùng nhau dưới tác động đồng thời (unique index một phần + transaction + cơ chế retry); các cuộc đua nguy hiểm được đóng bằng `SELECT ... FOR UPDATE`; không bao giờ mất admin cuối cùng của workspace.
3. **Hiệu năng**: tránh N+1 (dùng `include`/`select` một truy vấn), chỉ mục hóa mọi khóa ngoại dùng trong truy vấn, giới hạn kết nối cơ sở dữ liệu (pool tối đa 10), tránh re-render thừa trong giao diện kéo thả (memoization + dedupe self-echo, quyết định 0008 — đo drop 1561ms trên bảng 90 thẻ trước tối ưu).
4. **Độ trễ thời gian thực**: sự kiện phát tới client khác trong thời gian thực qua WebSocket; không phụ thuộc vào việc tải lại trang (E2E dùng "masking tripwire" để đảm bảo bằng chứng đến qua đường emit chứ không phải reload).
5. **Khả năng truy cập và responsive**: giao diện hoạt động tốt trên desktop và mobile (kiểm chứng 375px không tràn ngang), tương phản màu đạt AA, tín hiệu trạng thái không chỉ dựa vào màu sắc.
6. **Vận hành**: khởi động/đóng máy chủ sạch (graceful shutdown), lập lịch cron nội bộ có thể tắt khi không có `CRON_SECRET`, triển khai production bằng `migrate deploy`.

### 3.3 Use case chính

Các use case chính của hệ thống (kèm tác nhân chính):

1. **Đăng ký và xác minh email** — tác nhân: người dùng chưa đăng ký. Hệ thống gửi email xác minh; tài khoản chỉ kích hoạt sau khi xác minh.
2. **Đăng nhập / đăng xuất** — tác nhân: người dùng đã xác minh.
3. **Tạo workspace và mời thành viên** — tác nhân: admin. Lời mời qua email, kể cả tới người chưa đăng ký.
4. **Quản lý thành viên** (đổi vai trò, xóa, rời, hủy lời mời) — tác nhân: admin.
5. **Quản lý bảng** (tạo, đổi tên, lưu trữ, xóa) — tác nhân: admin/editor (xóa bảng: admin).
6. **Quản lý danh sách và thẻ** — tác nhân: admin/editor (xem: viewer).
7. **Kéo thả thẻ/danh sách** — tác nhân: admin/editor. Use case kết hợp với bất biến thời gian thực và toán vị trí float-gap.
8. **Cộng tác thời gian thực** — tác nhân: hai hay nhiều người dùng cùng xem một bảng.
9. **Xem analytics dashboard** — tác nhân: mọi thành viên của workspace.
10. **Tạo/quản lý luật tự động hóa** — tác nhân: admin (xem: mọi thành viên).
11. **Nhận thông báo và xử lý lời mời** — tác nhân: người dùng đã xác minh.
12. **Xem Today / My Work, quick capture, undo** — tác nhân: người dùng đã xác minh.

### 3.4 Thiết kế cơ sở dữ liệu

Lược đồ cơ sở dữ liệu được khai báo trong `prisma/schema.prisma` (PostgreSQL, 24 model, 5 enum, 14 migration). Các bảng Better Auth (User, Session, Account, Verification, Workspace, WorkspaceMember, Invitation) dùng ID chuỗi do thư viện sinh; các bảng ứng dụng dùng UUID `@default(uuid())`. Toàn bộ tên bảng ánh xạ kiểu camelCase qua `@@map`. Dưới đây là các model chính và quan hệ của chúng.

```text
Workspace ──< Board ──< List ──< Card ──< CardMember / CardLabel / Checklist ──< ChecklistItem
    │            │         │              └──< Comment
    │            │         │              └──< Attachment
    │            │         └──< (position, archivedAt)
    │            └──< Label ──< CardLabel
    │            └──< BoardStar
    ├──< WorkspaceMember (role: admin/editor/viewer)
    ├──< Invitation
    ├──< Rule ──< RuleExecutionLog
    ├──< Activity (SetNull cho board/card)
    └──< CardHistoryEvent (append-only, không FK tới board/card)
```

#### 3.4.1 Workspace và phân quyền

- **Workspace**: `name`, `slug` (unique), `timezone`, `requireEstimateBeforeDone` (chính sách ước lượng), `analyticsLaunchAt` (mốc phân tích), liên hệ tới `WorkspaceMember[]`, `Invitation[]`, `Board[]`, `Activity[]`, `CardHistoryEvent[]`, `Rule[]`, `RuleExecutionLog[]`.
- **WorkspaceMember**: khóa tổ hợp `@@unique([organizationId, userId])`, trường `role` (admin/editor/viewer). Đây chính là bảng `member` của plugin organization (ánh xạ modelName).
- **Invitation**: `email`, `role`, `status` (pending...), `expiresAt`, `inviterId`; chỉ mục theo `organizationId` và `email`.

#### 3.4.2 Bảng – danh sách – thẻ

- **Board**: `workspaceId` (FK, Cascade), `title`, `backgroundColor`, `createdById`, `archivedAt` (soft delete); quan hệ `lists`, `stars`, `labels`, `activities`, `rules`.
- **List**: `boardId` (FK, Cascade), `title`, `position Float` (thứ tự), `archivedAt` (thêm ở quyết định 0026); chỉ mục `@@index([boardId, archivedAt])`; **partial unique index** `list_boardId_position_live_key` trên `(boardId, position) WHERE archivedAt IS NULL` — đảm bảo hai danh sách đang hoạt động không bao giờ trùng vị trí.
- **Card**: `listId` (FK, Cascade), `title`, `description Text`, `position Float`, `priority Priority?`, `dueDate`, `estimateHours`, `completedAt`, `deletedAt`, `coverImage`, `archivedAt`, `createdById`; chỉ mục `[listId, position]`, `[listId, archivedAt]`, `[dueDate, completedAt]`; **partial unique index** `card_listId_position_live_key` trên `(listId, position) WHERE archivedAt IS NULL AND deletedAt IS NULL` (quyết định 0015).
- **CardMember**: khóa tổ hợp `@@id([cardId, userId])`, `assignedAt`.
- **Label / CardLabel**: nhãn thuộc bảng (`Label.boardId`), gắn vào thẻ qua bảng nối `CardLabel` (khóa tổ hợp `[cardId, labelId]`); dedupe khi gắn trùng.
- **Checklist / ChecklistItem**: cấp dưới của thẻ, cả hai có `position Float`.
- **Comment**: `cardId`, `userId`, `content Text`.
- **Attachment**: `cardId`, `userId`, `fileName`, `fileUrl`, `fileType`, `fileSize`, `cloudinaryPublicId` + `cloudinaryResourceType` (metadata phục vụ dọn dẹp an toàn).
- **BoardStar**: đánh dấu yêu thích, `@@unique([boardId, userId])` + chỉ mục `userId`.

#### 3.4.3 Nhật ký, thông báo và analytics

- **Activity**: nhật ký hoạt động theo workspace; `boardId`/`cardId` nullable với `onDelete: SetNull` để nhật ký sống sót khi thực thể bị xóa; `action` (CREATED/UPDATED/MOVED/ARCHIVED/RESTORED/DELETED/COMMENTED), `entityType`, `metadata Json`.
- **Notification**: theo người dùng (`userId`, Cascade), `type` (ASSIGNED/MENTIONED/DUE_DATE/COMMENT/INVITE), `isRead`, `readAt`; chỉ mục `[userId, isRead, createdAt]`.
- **CardReminder**: sổ cái của bộ lập lịch nhắc hạn chót, `@@unique([cardId, userId, milestone])` chống gửi trùng.
- **Rule / RuleExecutionLog**: luật tự động hóa thuộc workspace (có thể phạm vi board); `triggerConfig Json`, `actions Json` (mảng có thứ tự); nhật ký thực thi có `status` (success/partially_failed/failed/skipped/halted/error), `dedupKey` với `@@unique([ruleId, dedupKey])` cho cơ chế claim-first của trigger định kỳ. Kể từ quyết định 0031/W4, `ruleId` nullable và `ruleName`/`workspaceId` được denormalize để nhật ký sống sót khi luật bị xóa (FK `onDelete: SetNull`).
- **CardHistoryEvent**: luồng sự kiện append-only cho analytics; `sequence BigInt autoincrement`, `workspaceId`, `boardId`, `cardId` (**không phải FK** — sống sót qua xóa thực thể), `actorId`, `eventType` (15 loại), `metadata Json`; chỉ mục `[cardId, sequence]`, `[workspaceId, occurredAt]`, `[workspaceId, boardId, occurredAt]`, `[workspaceId, eventType, occurredAt]`.

#### 3.4.4 Thiết kế chỉ mục

Mọi khóa ngoại xuất hiện trong truy vấn đều có `@@index`; các vị trí sắp xếp có unique index một phần (SQL thuần trong migration — lệch schema có chủ đích với Prisma, được chú thích trong mã); các truy vấn dashboard được phục vụ bằng chỉ mục tổ hợp theo `(workspaceId, occurredAt)` và `(workspaceId, eventType, occurredAt)`.

### 3.5 Kiến trúc tổng thể

Planora là ứng dụng **server-first** trên Next.js, không tách riêng backend. Sơ đồ kiến trúc tổng thể:

```text
                        ┌──────────────────────────────────────────────┐
                        │               Trình duyệt (React)             │
                        │  Client Components: Zustand board store, DnD, │
                        │  socket listeners, dialog/sheet UI            │
                        └──────────────┬───────────────────────────────┘
                                       │ HTTPS (RSC + Server Actions)
                                       ▼
        ┌────────────────────────────────────────────────────────────────┐
        │            Máy chủ tùy chỉnh server.ts (Node/tsx)              │
        │  ┌────────────────────────────┐   ┌──────────────────────────┐ │
        │  │   Next.js App Router       │   │   Socket.io (cùng cổng)  │ │
        │  │  RSC + Server Actions      │   │  auth middleware → rooms │ │
        │  │  app/**/actions.ts         │   │  board/workspace/user    │ │
        │  └────────────┬───────────────┘   └───────────┬──────────────┘ │
        └───────────────┼────────────────────────────────┼───────────────┘
                        │                                │ phát quảng bá
                        ▼                                ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  lib/*  — nghiệp vụ: card.ts, list.ts, board.ts, ordering.ts, │
        │  card-history.ts, analytics/engine.ts, automation/*, realtime/ │
        ├───────────────────────────────────────────────────────────────┤
        │  Prisma db singleton (lib/prisma.ts, @prisma/adapter-pg)       │
        ├───────────────────────────────────────────────────────────────┤
        │  PostgreSQL 16 (nguồn dữ liệu duy nhất)                        │
        └───────────────────────────────────────────────────────────────┘
```

Các lớp chính:

1. **Tầng trình bày (client)**: client components nhận sự kiện socket, cập nhật Zustand store; thành phần kéo thả `@hello-pangea/dnd`; dialog/bảng điều khiển xây trên shadcn/ui. Dữ liệu khởi tạo đến từ RSC (server components) qua props.
2. **Tầng mutation (Server Actions)**: `app/**/actions.ts` — ranh giới bắt buộc của mọi thao tác ghi, thực thi đúng hợp đồng 8 bước (mục 3.6).
3. **Tầng nghiệp vụ (lib)**: các hàm thuần/queries chuyên biệt — `lib/card.ts`, `lib/list.ts`, `lib/board.ts`, `lib/ordering.ts` (toán vị trí), `lib/card-history.ts` (dựng sự kiện), `lib/analytics/engine.ts`, `lib/automation/*`, `lib/realtime/*`.
4. **Tầng dữ liệu**: `db` singleton với PrismaPg adapter → PostgreSQL. Socket.io chỉ phát quảng bá, không ghi dữ liệu.

Về mặt tổ chức route: nhóm `(public)` gồm trang đích `/`, `/sign-in`, `/sign-up`; nhóm `(authenticated)/(dashboard)` gồm `/boards`, `/boards/[boardId]`, `/today`, `/workspace`, `/workspace/[slug]/dashboard`, `/notifications`, `/invitations`, `/profile`. Route handler API chỉ tồn tại cho Better Auth catch-all, endpoint đọc thông báo và route cron nội bộ.

### 3.6 Luồng mutation chuẩn qua Server Action

Mọi thao tác ghi dữ liệu phải đi qua một Server Action theo **đúng thứ tự tám bước** (hợp đồng quan trọng nhất của kiến trúc — `docs/ARCHITECTURE.md`):

```text
1. verifySession()                    → lấy userId, không bao giờ tin nhận dạng từ client
2. hasWorkspacePermission(workspaceId, { entity: [verb] })
                                       → kiểm tra quyền theo vai trò RBAC
3. Cô lập workspace                    → mọi truy vấn giới hạn theo workspace của người gọi
4. Zod parse (lib/schemas/)            → kiểm tra dữ liệu đầu vào trước khi chạm DB
5. db.$transaction(...)                → ghi dữ liệu (bó nhiều dòng khi đổi vị trí)
6. Emit sự kiện thời gian thực          → emitCardCreated / emitListMoved / ...
7. revalidatePath()                    → làm mới dữ liệu server-rendered (trừ reorder/move thuần)
8. Trả về dữ liệu tuần tự hóa           → object thuần, không model instance
```

Ví dụ minh họa luồng thực tế của `createCardAction` (rút gọn):

```ts
// app/(authenticated)/(dashboard)/boards/[boardId]/actions.ts
"use server";

export async function createCardAction(formData: FormData) {
  const parsed = createCardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, error: "Dữ liệu không hợp lệ" };

  const { userId } = await verifySession();                        // bước 1
  const { listId, title, description, dueDate, priority } = parsed.data;
  const result = await getListWithBoard(listId);                    // bước 3 (scope)
  if (!result || result.board.archivedAt) return { success: false, error: "List not found" };

  const canCreateCard = await hasWorkspacePermission(
    result.board.workspaceId, { card: ["create"] });               // bước 2
  if (!canCreateCard) return { success: false, error: "List not found" };

  const card = await db.$transaction(async (tx) => {                // bước 5
    // vị trí float-gap ở cuối danh sách
    const lastCard = await tx.card.findFirst({ where: { listId, ...LIVE_CARD_SCOPE },
      orderBy: [{ position: "desc" }, { createdAt: "desc" }], select: { position: true } });
    const position = lastCard ? lastCard.position + CARD_POSITION_GAP : CARD_POSITION_GAP;
    const createdCard = await tx.card.create({ data: { listId, title, createdById: userId, position,
      description: description ?? null, dueDate: dueDate ?? null, priority: priority ?? null } });
    await recordCardHistoryEvents(tx, [buildCardCreatedEvent(/* ... */)]);
    // tự động hóa chạy trong cùng transaction (quyết định 0022)
    const { effects } = await evaluateRules({ client: tx, workspaceId: result.board.workspaceId,
      triggerType: "card-created", event: { cardId: createdCard.id, boardId: result.board.id, listId } });
    return { card: createdCard, ruleEffects: effects };
  });

  revalidatePath(`/boards/${result.list.boardId}`);                 // bước 7
  emitCardCreated(result.list.boardId, { card: { /* snapshot */ } }); // bước 6
  emitAnalyticsRefresh(result.board.workspaceId);
  await fireDeferredEffects(card.ruleEffects);
  return { success: true, cardId: card.card.id };                   // bước 8
}
```

Hai ngoại lệ có chủ đích: (1) `revalidatePath` **không** được gọi trong ba action reorder/move thuần (`reorderCardAction`, `reorderListAction`, `moveCardAction`) vì store lạc quan đã là thẩm quyền phía client và các client khác hội tụ qua socket (quyết định 0008 — giảm hai trong ba lần render toàn bảng sau mỗi cú thả); (2) các sự kiện `notify-member` của automation chạy **sau commit** qua deferred effects.

### 3.7 Thiết kế bảo mật

#### 3.7.1 Mô hình ba lớp bảo vệ mutation

Mỗi mutation được bảo vệ bởi ba lớp kiểm tra độc lập, đều chạy phía server:

1. **Xác thực (A1)**: `verifySession()` — không có phiên hợp lệ thì từ chối ngay (redirect `/sign-in` hoặc trả lỗi).
2. **Phân quyền (A2)**: `hasWorkspacePermission(workspaceId, { ... })` — Better Auth kiểm tra vai trò hiện tại của người dùng trong organization đó theo access-control statements; trường hợp không phải thành viên được chuẩn hóa thành từ chối mềm (quyết định xử lý `UNAUTHORIZED` thành `false`).
3. **Cô lập workspace (A3)**: mọi truy vấn đều được giới hạn theo `workspaceId` suy ra từ dữ liệu server (không lấy từ client); thẻ/danh sách ngoài workspace không bao giờ tìm thấy (trả lỗi chung chung "not found" để tránh rò rỉ sự tồn tại).

Bộ ba lớp này được kiểm chứng bằng **118 trường hợp kiểm thử tích hợp** trên 26 action ghi dữ liệu và 2 action đọc (mục 5.2), kèm bằng chứng sabotage: gỡ một lớp kiểm tra thì các trường hợp A2/A3 tương ứng chuyển đỏ.

#### 3.7.2 RBAC ba vai trò

Định nghĩa vai trò trong `lib/permissions.ts` (rút gọn):

```ts
// admin — toàn quyền trong workspace
admin = ac.newRole({ ...ownerAc.statements,
  board: ["create", "update", "delete"], list: ["create", "update", "delete"],
  card: ["create", "update", "delete"], comment: ["create", "update", "delete"] });
// editor — chỉnh sửa nội dung, không quản lý tổ chức
editor = ac.newRole({ board: ["update"], list: ["create", "update", "delete"],
  card: ["create", "update", "delete"], comment: ["create", "update", "delete"] });
// viewer — chỉ đọc + bình luận
viewer = ac.newRole({ comment: ["create", "update", "delete"] });
```

Vai trò được áp dụng nhất quán ở ba nơi và phải khớp nhau (kiểm chứng L2/L3 của ma trận RBAC): định nghĩa role trong Better Auth, bản đồ quyền trang bảng (`getBoardPagePermissionsForRole`) và các lời gọi `hasWorkspacePermission` trong action.

#### 3.7.3 Cô lập không gian làm việc (multi-tenant)

Workspace là đơn vị cô lập dữ liệu. Mọi truy vấn trong action phải gắn `where: { workspaceId }` (hoặc suy ra qua board/list). Ví dụ điển hình: `moveCardAction` truy vấn thẻ và danh sách đích trong cùng workspace; thử di chuyển thẻ sang danh sách của workspace khác bị từ chối (có trường hợp kiểm thử riêng). Trên kênh socket, quyền tham gia phòng được kiểm tra riêng (`getBoardMembershipRole`, `canUserJoinWorkspace` — fail-closed: lỗi dữ liệu cũng bị từ chối, vai trò không nhận dạng chuẩn hóa về viewer).

#### 3.7.4 Xác minh email bắt buộc

Kể từ quyết định 0023 (thay thế quyết định 0018), `requireEmailVerification = true` ở **mọi môi trường**: tài khoản mới phải mở đường dẫn xác minh trong email trước khi vào `/boards`; luồng đăng ký hiển thị trạng thái "verify your email" kèm nút gửi lại và route `/verify-email` tiêu thụ token (hết hạn sau 1 giờ). Điều này đóng lỗ hổng "tài khoản chưa xác minh chấp nhận lời mời". Không có cờ môi trường để tắt xác minh — lựa chọn có chủ đích để tránh "foot-gun" bảo mật.

#### 3.7.5 Các biện pháp bổ sung

- **Zod validate tại biên**: schema Zod cho từng action trong `lib/schemas/` (thẻ UUID, độ dài chuỗi, enum priority...); dữ liệu lạ bị chặn trước khi vào lớp nghiệp vụ.
- **Email an toàn trong production**: transport Resend; `SMTP_HOST` chỉ có hiệu lực ngoài production (quyết định 0025) — một cấu hình lạc chỗ không thể nuốt thư production.
- **CSRF**: `trustedOrigins` tường minh cho Better Auth; cookie phiên qua middleware.
- **Tải lên tệp**: xác thực loại/kích thước file trước upload Cloudinary; người bị từ chối quyền không bao giờ chạm tới đường upload (kiểm chứng A2).
- **Xuất CSV an toàn**: chống formula injection (mục 3.1.4).
- **Chống lạm dụng phân quyền động**: đích động của automation phải nằm trong workspace của luật (kiểm tra cô lập tại thời điểm thực thi).

---

## CHƯƠNG 4 — HIỆN THỰC

### 4.1 Tổ chức mã nguồn

Mã nguồn được tổ chức rõ ràng theo trách nhiệm:

```text
app/                      # App Router: trang, route, Server Actions
  (public)/               # landing, /sign-in, /sign-up
  (authenticated)/(dashboard)/
    boards/[boardId]/     # trang bảng + actions.ts + board-store*.ts(x)
    today/                # Today / My Work
    workspace/[slug]/     # dashboard, automation, members
  api/auth/[...all]/      # Better Auth catch-all
components/               # client components + components/ui (shadcn)
lib/                      # auth, authorization, prisma, dal, schemas,
                          # card/list/board/ordering, card-history,
                          # analytics/, automation/, realtime/, dnd/
prisma/schema.prisma      # lược đồ + migrations/
server.ts                 # máy chủ tùy chỉnh: Next handler + Socket.io + cron
scripts/                  # demo-fixture (seed/reset), backfill analytics...
e2e/                      # Playwright specs (15 tệp)
tests/                    # Vitest integration (server-actions, board-store...)
docs/                     # kiến trúc, hợp đồng sản phẩm, quyết định, TEST_MATRIX
```

Nguyên tắc xuyên suốt: **đọc nằm trong hàm query của `lib/*` và server components; ghi nằm trong Server Actions** kèm hiệu ứng phụ (emit, thông báo, sự kiện lịch sử); các luật dùng chung đặt trong `lib/*`, không đặt trong component.

### 4.2 Xác thực và phân quyền

#### 4.2.1 Cấu hình Better Auth

`lib/auth.ts` cấu hình Better Auth: adapter Prisma, email/password với xác minh email bắt buộc, phiên 7 ngày (refresh tối đa 1 lần/ngày), plugin organization (ánh xạ organization → `workspace`, member → `workspaceMember`, vai trò admin/editor/viewer, creatorRole admin), gửi email xác minh/đặt lại mật khẩu/lời mời qua `sendEmail` và template React Email, và `nextCookies()`. Đường dẫn base và trusted origins lấy từ biến môi trường.

```ts
// lib/auth.ts (rút gọn)
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? APP_URL,
  trustedOrigins,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // quyết định 0023
    sendResetPassword: async ({ user, token }) => { /* sendEmail(...) */ },
  },
  emailVerification: { sendVerificationEmail: ..., autoSignInAfterVerification: true,
    expiresIn: 3600 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  plugins: [organization({ ac, roles: { admin, editor, viewer }, creatorRole: "admin",
    schema: { organization: { modelName: "workspace" }, member: { modelName: "workspaceMember" } },
    sendInvitationEmail: ... }), nextCookies()],
});
```

#### 4.2.2 Xác minh phiên và kiểm tra quyền

`lib/dal.ts` cung cấp `verifySession()` (đọc phiên qua headers, redirect `/sign-in` nếu chưa đăng nhập, trả về `{ userId, user, session }`, được React `cache()` để tránh lặp truy vấn trong một request). `lib/authorization.ts` cung cấp `hasWorkspacePermission()` — bọc `auth.api.hasPermission()` và chuẩn hóa trường hợp ngoại lệ `UNAUTHORIZED` (không phải thành viên) thành từ chối mềm, đồng thời giữ nguyên các lỗi hệ thống khác để không che giấu lỗi cấu hình. Bản đồ quyền trang bảng `getBoardPagePermissionsForRole` gắn các cờ UI (canCreateCard, canPermanentDelete...) theo vai trò và được kiểm chứng khớp với ma trận server.

### 4.3 Quản lý bảng – danh sách – thẻ

#### 4.3.1 Thao tác cơ bản

Các Server Action trong `boards/[boardId]/actions.ts` triển khai toàn bộ vòng đời bảng/danh sách/thẻ theo hợp đồng 8 bước. Phần logic đọc/queries tách trong `lib/board.ts`, `lib/list.ts`, `lib/card.ts`, `lib/comment.ts`, `lib/attachment.ts`, `lib/checklist.ts`, `lib/label.ts`, `lib/card-member.ts`. Các bước vị trí dùng chung được gom vào `lib/ordering.ts` (hằng số gap, `resolveCardPosition`, `normalizeCardPositions`, `StaleNeighborError`).

#### 4.3.2 Toán vị trí float-gap

Phần thuần túy nhất của hệ thống là `lib/dnd/apply-drop.ts` — dịch một cú kéo thả của `@hello-pangea/dnd` (chỉ số nguồn/đích) thành mảng `nextLists` lạc quan cộng các id lân cận mà server cần. Vì có chỉ số đích chính xác, không có sự mơ hồ trước/sau; các lân cận được đọc **sau khi chèn** từ thứ tự cuối của danh sách đích, đúng hợp đồng float-gap:

```ts
// lib/dnd/apply-drop.ts (tóm tắt translateCardDrop)
function translateCardDrop(lists, cardId, source, destination) {
  const sameList = source.droppableId === destination.droppableId;
  if (sameList && destination.index === source.index) return { action: "none" };
  // ... xác định danh sách nguồn/đích, tách thẻ ra khỏi mảng nguồn ...
  // chỉ clone các danh sách bị đụng tới để memoized ListColumn bỏ qua re-render
  const next = [...lists];
  // ... dstCards.splice(destination.index, 0, { ...moved, listId: dst.id }) ...
  const i = destination.index;
  return { action: "moveCard", nextLists: next, fields: {
    cardId,
    targetListId: lists[dstIndex].id,
    prevCardId: i > 0 ? dstCards[i - 1].id : null,
    nextCardId: i < dstCards.length - 1 ? dstCards[i + 1].id : null,
  } };
}
```

Phía server, `resolveCardPosition` đọc hai lân cận, tính trung điểm; nếu khoảng cách < `MIN_POSITION_GAP` thì ném `StaleNeighborError` (có thể retry) hoặc chạy chuẩn hóa. Các ràng buộc toàn vẹn: transaction cho mọi thao tác nhiều dòng, partial unique index làm rào chặn cuối, và nhánh bắt `P2002` → normalize → retry nay trở thành đường chạy thật (quyết định 0015).

#### 4.3.3 Lưu trữ – khôi phục – xóa vĩnh viễn

- **Lưu trữ thẻ** (`archiveCardAction`): set `archivedAt`, ghi sự kiện `CARD_ARCHIVED`, emit `card:archived`, revalidate.
- **Khôi phục thẻ** (`restoreCardAction`): resolver phân biệt trường hợp danh sách cha đã lưu trữ (`parentListArchived`) — trả mã kết quả "Restore the list first." chỉ khi thẻ tồn tại, vẫn lưu trữ, cha đã lưu trữ, bảng còn hoạt động và người gọi có quyền (không rò rỉ sự tồn tại); **bên trong transaction** khóa `SELECT ... FOR UPDATE` dòng danh sách cha và kiểm tra lại `archivedAt IS NULL`, hủy khôi phục nếu danh sách cha bị lưu trữ đồng thời (quyết định 0031). Ghi `CARD_RESTORED`, re-emit `card:created` để thẻ hiện lại trực tiếp.
- **Vòng đời danh sách an toàn** (`archiveListAction`, `restoreListAction`, `permanentlyDeleteListAction` — quyết định 0026): lưu trữ danh sách ẩn toàn bộ thẻ con khỏi bảng (không phát CARD_ARCHIVED/CARD_DELETED để giữ toàn vẹn event-sourced); khôi phục về vị trí cũ nếu còn trống, ngược lại thêm cuối; xóa vĩnh viễn chỉ dành cho admin, yêu cầu gõ chính xác tên danh sách, chặn khi còn thẻ chưa lưu trữ (trừ khi force), **khóa FOR UPDATE** chống race với upload tệp và kiểm tra còn tệp Cloudinary mới cho phép (quyết định 0029), xóa trong transaction với `deleteMany` có điều kiện (count = 0 thì rollback), ghi sự kiện `CARD_DELETED`, emit `list:deleted` + `analytics:refresh`.
- **Cuộc đua upload đính kèm**: `uploadAttachmentAction`/`setCardCoverAction` khóa FOR UPDATE dòng danh sách cha **sau** khi upload Cloudinary (không giữ khóa khi gọi mạng ngoài) và kiểm tra lại `archivedAt`; nếu danh sách đã bị lưu trữ/xóa đồng thời, tệp vừa upload được **bồi hoàn** qua `cloudinary.uploader.destroy` với đúng publicId/resourceType.

#### 4.3.4 Tính năng phụ trợ

Lọc theo nhãn và tìm kiếm tiêu đề là bộ lọc client thuần (ẩn thẻ bằng CSS, giữ Draggable gắn kết để chỉ số thả không lệch); checklist gồm 5 action (tạo/xóa checklist, thêm/toggle/xóa mục) đều qua `card:["update"]` với workspaceId suy từ bảng của checklist; nhãn có dedupe khi gắn, fan-out `card:labels-updated` cho từng thẻ bị ảnh hưởng khi đổi tên/xóa nhãn.

### 4.4 Đồng bộ thời gian thực

#### 4.4.1 Máy chủ tùy chỉnh và xác thực socket

`server.ts` tạo HTTP server, bọc Next.js handler, khởi tạo Socket.io trên cùng cổng, đăng ký middleware xác thực (đọc cookie → `userId`) và các handler: `board:join`/`board:leave` (kiểm tra vai trò thành viên bảng, quản lý registry hiện diện), `workspace:join`/`workspace:leave` (kiểm tra thành viên workspace), `disconnect` (dọn presence). Máy chủ cũng khởi động driver cron nội bộ cho bộ lập lịch nhắc hạn chót (mỗi 15 phút, khi có `CRON_SECRET`) và xử lý shutdown sạch (SIGTERM/SIGINT).

```ts
// server.ts (tóm tắt)
io.use(async (socket, next) => {
  const userId = await authenticateSocket({ headers: socket.handshake.headers });
  if (!userId) return next(new Error("Unauthorized"));
  socket.data.userId = userId; next();
});

io.on("connection", (socket) => {
  socket.join(ROOMS.user(userId));
  socket.on("board:join", async ({ boardId }) => {
    const role = await getBoardMembershipRole(userId, boardId);
    if (!role) return socket.emit("board:error", { message: "Not authorized" });
    socket.join(ROOMS.board(boardId));
    // ... presenceRegistry.add + emitBoardPresence
  });
});
```

#### 4.4.2 Kênh sự kiện và emitters

`lib/realtime/events.ts` định nghĩa tên sự kiện và quy ước phòng: `board:<boardId>`, `user:<userId>`, `workspace:<workspaceId>`. `lib/realtime/server.ts` cung cấp các hàm emitter (`emitCardMoved`, `emitListCreated`, `emitNotificationNew`, `emitAnalyticsRefresh`, `emitInvitationNew`...) — mỗi hàm best-effort (bắt lỗi, log, không làm hỏng mutation). `lib/realtime/types.ts` khai báo kiểu payload cho từng sự kiện; `lib/realtime/client.ts` + `socket-lifecycle-provider.tsx` quản lý kết nối phía client.

#### 4.4.3 Board store và bất biến hoãn kéo thả

Board store (Zustand) là nơi hội tụ các sự kiện thời gian thực. Trọng tâm của nó là hàm `applyOrDefer`: nếu đang kéo (`isDragging`) thì sự kiện thay đổi cấu trúc bị hoãn và bật cờ `pendingResync`; khi thả xong `consumeResync()` kiểm tra cờ và gọi `router.refresh()`:

```ts
// board-store-provider.tsx (tóm tắt)
function applyOrDefer<T>(apply: (payload: T) => void, payload: T) {
  const store = useBoardStore.getState();
  if (store.isDragging) { store.markResyncPending(); return; } // hoãn
  apply(payload);                                              // áp dụng trực tiếp
}
// Các sự kiện cấu trúc (card:moved, list:created, ...) dùng applyOrDefer;
// các sự kiện tại chỗ (card:updated, card:completion-updated,
// card:labels-updated, comment:created) áp dụng trực tiếp.
```

Cùng với đó, board store thực hiện **dedupe self-echo**: sự kiện do chính client phát ra (echo từ socket) không được áp dụng hai lần — kiểm tra trạng thái canonical đã phản ánh thì bỏ qua, tương tự cho create events (quyết định 0008). Bất biến này là bản sửa đằng sau commit `7706b6d` và được kiểm chứng bởi 37 trường hợp trong `tests/board-store.test.ts`.

#### 4.4.4 Presence

Registry hiện diện trong bộ nhớ (`lib/realtime/presence.ts`) theo dõi socket nào đang xem bảng nào, dedupe theo người dùng đa tab, phát `board:presence` cho phòng khi danh sách watcher thay đổi; 9 trường hợp kiểm thử đơn vị + E2E hai trình duyệt thật (cả hai thấy hai avatar, một người rời thì còn một).

### 4.5 Hệ thống analytics

#### 4.5.1 Ghi sự kiện lịch sử

`lib/card-history.ts` cung cấp các hàm dựng sự kiện (`buildCardCreatedEvent`, `buildCardCompletedEvent`, `buildCardMoveLifecycleEvents`...) và `recordCardHistoryEvents(tx, events)` — được gọi **bên trong transaction** của mọi mutation liên quan (tạo, di chuyển, hoàn thành/mở lại, đặt/đổi ước lượng, hạn chót, phân công thành viên, lưu trữ/khôi phục/xóa). Mỗi sự kiện mang `eventType`, `actorId`, `metadata` (danh sách nguồn/đích, giá trị ước lượng...). Script `npm run backfill:analytics` dựng lại luồng sự kiện cho dữ liệu có trước.

#### 4.5.2 Tính toán chỉ số bằng replay

`lib/analytics/engine.ts` nhận khoảng thời gian, đọc luồng `CardHistoryEvent` của workspace (chỉ mục theo `(workspaceId, occurredAt)`), dựng trạng thái từng thẻ theo thời gian (`CardStateAtTime`) và tính:

- **Burndown**: tích lũy số thẻ hoàn thành theo ngày.
- **Lead time**: chênh lệch thời gian giữa sự kiện tạo và sự kiện hoàn thành, giới hạn 100 dòng mới nhất, nhất quán với `totalCompleted`.
- **Tỉ lệ quá hạn**: số thẻ hoàn thành muộn so với hạn chót.
- **Tỉ lệ mở lại**: dựa trên sự kiện (denominator = thẻ có ≥1 lần hoàn thành trong kỳ; numerator = thẻ bị mở lại sau khi hoàn thành), tách rời khỏi bộ lọc "hiện đang hoàn thành" (quyết định 0021) để không hạ thấp tỉ lệ một cách nghịch lý.
- **Bao phủ ước lượng**: phần trăm thẻ có ước lượng trong tập được xét; hạn chót không phân tích được (chuỗi ngày lạ) được coi là không có hạn chót thay vì bị loại im lặng.

#### 4.5.3 Xuất CSV

`lib/analytics/csv-export.ts` (module thuần, client-safe) sinh CSV với escaping dấu phẩy/nháy kép/xuống dòng và **chặn formula injection** (ô bắt đầu bằng `=`, `+`, `-`, `@`, tab, CR được thêm dấu nháy đơn hoặc escape); tiêu đề `Board ID`/`Member ID` được bảo vệ.

### 4.6 Động cơ tự động hóa (automation)

Động cơ tự động hóa (`lib/automation/`) gồm các module chuyên biệt, mỗi module có kiểm thử đơn vị riêng:

- **`matcher.ts`**: khớp trigger ↔ cấu hình (`card-moved-to-list` có list nguồn/đích) và đánh giá điều kiện JSON.
- **`resolver.ts`**: phân giải đích động (`card-assignees`, `card-creator`, `all`, UUID) kèm kiểm tra cô lập workspace.
- **`loop-guard.ts`**: `ChainTracker` — id chuỗi, trần độ sâu 5, tập dedup `(ruleId, cardId)`.
- **`cycle-check.ts`**: ánh xạ action → sự kiện sản sinh, cảnh báo tĩnh khi lưu luật có nguy cơ vòng lặp.
- **`executor.ts`**: thực thi từng bước hành động trong transaction, trả về deferred-effect descriptors.
- **`effects.ts`**: ánh xạ descriptor → `emit*` sau commit.
- **`evaluator.ts`**: vòng lặp chính — đọc luật khớp, đánh giá điều kiện, cổng window (due-date-approaching), kiểm tra loop-guard, gọi executor, ghi log, đệ quy theo sự kiện sản sinh.
- **`scheduled.ts`**: chế độ claim-first cho trigger định kỳ với `dedupKey`.

Điểm kiến trúc cốt lõi (quyết định 0022): **`evaluateRules()` chạy bên trong transaction của mutation kích hoạt**, sau khi ghi lịch sử, trước khi commit; các hành động làm thay đổi dữ liệu (di chuyển thẻ, đặt ưu tiên, gắn nhãn...) chia sẻ transaction đó nên **nguyên tử** với mutation gốc; các hiệu ứng sau commit (emit socket, notify-member) được tích lũy thành descriptor và bắn sau khi transaction thành công. Vai trò thực thi được gán cho một **system actor** (người dùng hệ thống "Planora Automation", `AUTOMATION_ACTOR_USER_ID`, metadata `ruleId`) để analytics phân biệt hành động tự động với hành động con người.

Từ quyết định 0030, **cô lập lỗi theo từng bước (per-step isolation)**: lỗi cấu trúc `RuleExecutionError` (mã `TARGET_LIST_NOT_FOUND`, `TARGET_LIST_ARCHIVED`, `TARGET_LIST_FOREIGN_WORKSPACE`, `MEMBER_NOT_IN_WORKSPACE`, `LABEL_NOT_FOUND`) ở một bước không rollback mutation chính của người dùng — bước đó được ghi audit vào `RuleExecutionLog.metadata` và các bước độc lập còn lại vẫn chạy; trạng thái tổng thể là `success`/`partially_failed`/`failed`. Chỉ lỗi bất ngờ (không phải `RuleExecutionError`) mới abort toàn bộ transaction (kèm log post-rollback) — đây là lựa chọn bảo thủ vì lỗi giữa chừng có thể làm hỏng transaction tương tác.

### 4.7 Hệ thống thông báo

- **Tạo thông báo**: `lib/notification.ts` cung cấp `notifyMentioned` (quét mention trong bình luận), `notifyCardAssigned`, `notifyCommentOnCard`, `notifyDueDate` — mỗi hàm ghi `Notification` (DB) và gửi email best-effort (lỗi email không làm hỏng thao tác gốc).
- **Phân phối thời gian thực**: `emitNotificationNew(userId, payload)` đẩy vào phòng `user:<userId>`; chuông thông báo tăng ngay lập tức, đồng bộ lại từ DB khi kết nối lại.
- **Lời mời sống**: `inviteMemberAction` phát `invitation:new` tới phòng người được mời (đã đăng ký) với email chuẩn hóa không phân biệt hoa thường; badge chuông lời mời tăng trực tiếp; người ngoài (không được mời) không thấy tín hiệu (kiểm chứng phòng).
- **Bộ lập lịch hạn chót**: route cron `POST /api/cron/due-date-reminders` (Bearer CRON_SECRET) được driver trong `server.ts` gọi mỗi 15 phút; chọn thẻ đến hạn/24h hoặc quá hạn còn hoạt động, dedup theo `@@unique([cardId, userId, milestone])`; 20 trường hợp kiểm thử đơn vị cho milestone selection và các bộ lọc.

### 4.8 Giao diện người dùng và design system

Giao diện tuân theo `DESIGN.md` — hệ thống thiết kế phỏng theo Linear (shell sản phẩm: bề mặt dày đặc, chuyên nghiệp, một màu nhấn tiết chế, phân tầng bằng bề mặt trung tính + đường viền hairline) và Notion (bề mặt chi tiết thẻ dạng tài liệu, thang elevation, nhãn pha màu). Các điểm chính:

- **Token**: biến CSS oklch trong `:root`/`.dark` (`--background`, `--card`, `--border`, `--primary`, `--primary-hover`, `--success*`, `--warning*`, `--label-<hue>*`...), truy cập qua utility Tailwind; không hard-code hex trong component.
- **Chi tiết thẻ**: cột đọc ~720px (Notion document), chia phần bằng `border-t` hairline, dải thuộc tính compact dưới tiêu đề (thành viên/nhãn qua popover, ưu tiên/hạn/ước lượng inline), autosave khi rời khỏi ô.
- **Bảng Kanban**: cột danh sách, thẻ có avatar người phụ trách, chip nhãn pha màu (tint + chữ cùng tông, AA ≥ 4.5:1), chỉ báo hạn chót, kéo thả mượt với bóng `shadow-md` + `scale` khi nâng thẻ.
- **Trạng thái**: token ngữ nghĩa success/warning thay cho xanh/đỏ/amber ad-hoc; tín hiệu phi màu sắc (mũi tên, ký hiệu, nhãn) luôn đi kèm màu (WCAG 1.4.1).
- **Tương phản**: các token đo AA (ví dụ success-fg 5.54:1 light, warning-fg 5.65:1); nút hover dùng token `--primary-hover` sáng hơn cùng tông.
- **Responsive**: chế độ xem mobile 375px không tràn ngang; các dialog tôn trọng kích thước màn hình (`max-w-[min(96vw,768px)]`).

### 4.9 Khó khăn và các quyết định thiết kế quan trọng

Trong quá trình hiện thực, có nhiều vấn đề kỹ thuật sâu được xử lý; tám quyết định tiêu biểu nhất được trình bày dưới đây (bản đầy đủ tại `docs/decisions/`, tổng cộng 31 quyết định):

#### 4.9.1 Quyết định 0008 — Hoãn kéo thả + dedupe self-echo cho reorder/move

**Vấn đề**: sau mỗi cú kéo thả, client thực hiện tới ba lần render toàn bảng (optimistic set, revalidatePath, echo socket), làm drop trên bảng 90 thẻ chậm 1561ms (1396ms JS main thread).
**Giải pháp**: (1) dedupe self-echo cho `applyRemoteCardMoved`/`applyRemoteListMoved` (sự kiện mô tả trạng thái store đã phản ánh thì bỏ qua); (2) bỏ `revalidatePath` ở đúng ba action reorder/move thuần — store lạc quan là thẩm quyền, client khác hội tụ qua socket; (3) bất biến hoãn kéo thả giữ nguyên như rào an toàn (sự kiện cấu trúc hoãn khi đang kéo, đồng bộ lại bằng `router.refresh()` khi thả).
**Kết quả**: loại hai trong ba lần render thừa; kiểm chứng bởi `tests/board-store.test.ts` (37 ca) và E2E two-client (slice 2).

#### 4.9.2 Quyết định 0015 — Toàn vẹn vị trí thẻ (partial unique index + normalize collision-safe)

**Vấn đề**: ba khiếm khuyết liên thông — Card không có rào chặn uniqueness (`@@index` thường, không UNIQUE); nhánh bắt P2002 → normalize → retry là mã chết (UPDATE position không bao giờ ném P2002); reorder cùng danh sách không transaction → hai reorder đồng thời trùng midpoint → **vị trí trùng lặp**, thứ tự chỉ còn do `createdAt`.
**Giải pháp**: (1) partial unique index SQL thuần `(listId, position) WHERE archivedAt IS NULL AND deletedAt IS NULL` (không ràng buộc dòng đã xóa mềm); (2) mọi normalize trong chỗ thành collision-safe (đánh số lại qua dải trung gian hai lượt, không ghi đè trong lúc di chuyển) cho cả card (hai bản) và list; (3) bọc reorder cùng danh sách trong `db.$transaction` đọc lân cận trong tx; (4) đường P2002 trở thành fallback thật; (5) xóa hàm chết `moveCardToListByNeighbors` (nguy cơ làm hỏng analytics); (6) bổ sung chỉ mục FK thiếu trong cùng migration.
**Kết quả**: không còn vị trí trùng dưới tác động đồng thời; mã retry trở nên sống và được kiểm thử.

#### 4.9.3 Quyết định 0022 — Động cơ luật chạy trong transaction kích hoạt

**Vấn đề**: đặt luật ở đâu trong pipeline mutation — inline cùng transaction hay hàng đợi riêng?
**Giải pháp**: đánh giá luật **bên trong transaction** của mutation kích hoạt (sau ghi lịch sử, trước commit); hành động đổi dữ liệu chia sẻ tx (nguyên tử, rollback cùng nhau); hiệu ứng sau commit (emit, notify) qua deferred descriptors; chống vòng lặp bốn tầng (chainId + trần độ sâu 5 + dedup trong chuỗi + cảnh báo tĩnh); admin-only quản lý luật; attribution bằng system actor ("Planora Automation") để analytics sạch.
**Lý do từ chối hàng đợi**: thêm hạ tầng phức tạp, trạng thái có thể lỗi thời nếu hàng đợi ùn; inline đơn giản và nguyên tử.

#### 4.9.4 Quyết định 0023 — Bắt buộc xác minh email

**Vấn đề**: quyết định 0018 hoãn `requireEmailVerification` vì (1) chưa chắc transport email và (2) chưa có E2E để chứng minh. Hậu quả tiềm ẩn: tài khoản chưa xác minh có thể chấp nhận lời mời.
**Giải pháp**: bật `requireEmailVerification = true` ở mọi môi trường sau khi cả hai điều kiện tiên quyết được đáp ứng (Resend được cấu hình; E2E đã có). Bổ sung trạng thái "verify your email" + nút gửi lại + route `/verify-email` (token hết hạn 1 giờ). Từ chối phương án cờ môi trường mặc định tắt vì là "foot-gun" bảo mật.

#### 4.9.5 Quyết định 0025 — Mailpit làm bể chứa thư dev/test

**Vấn đề**: khi bắt buộc xác minh email, CI E2E (không có RESEND_API_KEY) bị khóa: tài khoản mới không bao giờ vào được `/boards`; dev cục bộ không lấy được link xác minh.
**Giải pháp**: thêm dịch vụ Mailpit (SMTP :1025, UI/API :8025) vào docker-compose; `lib/email.ts` chọn transport theo môi trường — production luôn Resend, ngoài production có `SMTP_HOST` thì gửi qua nodemailer tới Mailpit, ngược lại log; E2E lấy **link xác minh thật** từ REST API Mailpit và hoàn tất luồng xác minh thực tế — không bypass.

#### 4.9.6 Quyết định 0026 — Vòng đời danh sách an toàn và ngữ nghĩa xóa

**Vấn đề**: `deleteListAction` xóa hẳn danh sách (cascade hủy mọi thẻ/con, không có bộ đệm khôi phục) — rủi ro mất dữ liệu thảm khốc khi xóa nhầm.
**Giải pháp**: thêm `List.archivedAt` (soft delete) với khôi phục an toàn; xóa vĩnh viễn chỉ admin, xác nhận gõ tên chính xác, chặn khi còn thẻ đang hoạt động (trừ force) và khi còn tệp Cloudinary (quyết định 0029 bổ sung khóa FOR UPDATE + bồi hoàn upload). Lưu trữ danh sách không phát CARD_ARCHIVED/CARD_DELETED để giữ toàn vẹn event-sourced. Thay unique index `[boardId, position]` toàn cục bằng partial unique index `WHERE archivedAt IS NULL` (tiền lệ từ 0015).

#### 4.9.7 Quyết định 0030 — Cô lập lỗi luật tự động hóa

**Vấn đề**: một đích luật lỗi thời (danh sách đã xóa/lưu trữ, thành viên đã rời, nhãn đã xóa) rollback cả thao tác chỉnh sửa của người dùng và hiện thông báo "no changes were applied" — lỗi niềm tin dữ liệu (bug F4).
**Giải pháp**: Option B — best-effort continuation với phân loại lỗi hai lớp: `RuleExecutionError` (lỗi kỳ vọng/đích lỗi thời) bị **cô lập từng bước** (audit metadata, các bước độc lập vẫn chạy, trạng thái `partially_failed`/`failed`); lỗi bất ngờ vẫn abort + log post-rollback. Claim-first dedup giữ nguyên (luật thành công một phần vẫn giữ claim; chỉ lần abort do lỗi bất ngờ mới retry được). Kiểm chứng bằng mutation-checked tests (gỡ try/catch từng bước → mutation chính lại fail).

#### 4.9.8 Quyết định 0031 — Undo có giới hạn và ngữ nghĩa khôi phục

**Vấn đề**: undo sau lưu trữ nên phạm vi đến đâu, dùng cơ chế nào?
**Giải pháp**: undo snackbar bao phủ **đúng hai thao tác** — lưu trữ thẻ và lưu trữ danh sách — và luôn gọi **Server Action khôi phục thật** (`restoreCardAction`/`restoreListAction`, cùng dòng dữ liệu, giữ nguyên id/lịch sử/thành viên/tệp đính kèm, vẫn chịu đầy đủ cổng phân quyền). Loại trừ tái tạo-bản sao (mất danh tính), undo xóa vĩnh viễn (đã có cổng bảo vệ có chủ đích) và undo cho các hành động khác. Cuộc đua "danh sách cha bị lưu trữ giữa chừng" được chặn hai tầng: resolver gắn cờ `parentListArchived` (không rò rỉ sự tồn tại) + kiểm tra lại trong transaction dưới `SELECT ... FOR UPDATE`; bằng chứng trên PostgreSQL thật bằng `tests/db-undo-race-proof.test.ts` (interleaving lock_timeout-deterministic, gỡ rào chắn → test đỏ).

---

## CHƯƠNG 5 — KIỂM THỬ

### 5.1 Chiến lược kiểm thử

Kiểm thử được tổ chức theo hình chóp bốn tầng, mỗi tầng trả lời một câu hỏi khác nhau:

1. **Kiểm thử đơn vị (unit)** — Vitest 2, môi trường node: chứng minh các luật thuần túy — toán vị trí kéo thả, dựng sự kiện lịch sử, engine analytics, các hàm automation, bộ lọc bảng, store Zustand. Không cần cơ sở dữ liệu thật.
2. **Kiểm thử tích hợp (integration)** — Vitest 2: chứng minh các ranh giới — Server Actions (auth/permission/isolation + body transaction), phân quyền socket, bộ lập lịch hạn chót, và một số bằng chứng **PostgreSQL thật** (interleaving lock_timeout-deterministic cho các cuộc đua đồng thời).
3. **Kiểm thử thành phần giao diện (RTL)** — Vitest 2 dự án `components` (happy-dom): kiểm thử hành vi của các client component (dialog, bảng điều khiển, hàng thành viên...) với Server Actions và `next/navigation` được mock, truy vấn theo vai trò (accessible queries) và `user-event`, không dùng snapshot.
4. **Kiểm thử E2E** — Playwright, hai phiên trình duyệt (two-client) trên máy chủ và PostgreSQL thật: chứng minh các luồng người dùng hoàn chỉnh, đặc biệt là **đồng bộ thời gian thực giữa hai người dùng thật** và các thành phần server không thể render bằng RTL.

Chỉ đạo xuyên suốt: **mỗi hợp đồng chức năng phải có bằng chứng kiểm thử** — được ghi trong `docs/TEST_MATRIX.md`, tài liệu ánh xạ từng hàng hợp đồng tới tệp kiểm thử và số trường hợp tương ứng. Các con số dưới đây là số liệu **đọc từ kho và TEST_MATRIX tại thời điểm viết báo cáo** (cổng cuối cùng 02/08/2026): **1.404 bài kiểm thử đơn vị/tích hợp xanh trên 90 tệp**, **155 bài RTL trên 14 bộ kiểm thử**, **36 bài E2E xanh** trên 15 tệp spec.

### 5.2 Kiểm thử đơn vị và tích hợp

Các nhóm kiểm thử chính và số trường hợp (đọc từ `docs/TEST_MATRIX.md`):

| Nhóm | Tệp | Số trường hợp | Điểm chứng minh |
| --- | --- | --- | --- |
| Ranh giới bảo mật Server Action (A1/A2/A3 + positive control) | `tests/server-actions/{board,list-card,workspace,analytics-read}.test.ts` | 118 (26 action ghi + 2 action đọc) | Mọi mutation có verifySession + cổng quyền + cô lập workspace; `moveCardAction` từ chối workspace khác |
| Ma trận RBAC | `tests/server-actions/rbac-matrix.test.ts` | 142 | Vai trò × thao tác theo roles thật + UI map + copy hợp đồng khớp nhau |
| Board store (remote apply + drag-defer + dedupe self-echo) | `tests/board-store.test.ts` | 37 | Bất biến hoãn kéo thả, echo dedupe |
| Sự kiện lịch sử thẻ | `lib/card-history.test.ts` | 16 | Dựng sự kiện created/moved/completed/reopened/estimate |
| Toán vị trí kéo thả | `lib/dnd/apply-drop.test.ts` | 15 | translateCardDrop/translateListDrop, giữ tham chiếu |
| Bộ lọc/tìm kiếm bảng | `lib/board-filter.test.ts` | 14 | Lọc nhãn + tìm tiêu đề (AND) |
| Phân quyền socket | `lib/realtime/auth.test.ts` | 19 | `getBoardMembershipRole`, `canUserJoinWorkspace`, fail-closed |
| Presence | `lib/realtime/presence.test.ts` | 9 | Dedupe đa tab, last-tab-leaves, reconnect interleave |
| Động cơ tự động hóa | `lib/automation/*.test.ts` | 101 (matcher 19, resolver 13, loop-guard 18, cycle-check 12, executor 31, effects 7, evaluator 16) [XÁC MINH: tổng 101 là con số trong TEST_MATRIX; đếm trực tiếp các khối `it()`/`test()` trong tệp cho 121 (executor 32, cộng thêm `view.test.ts` 4 ca)] | Trigger/điều kiện, đích động, chống vòng lặp, thực thi, cô lập lỗi |
| Automation scheduled | `tests/automation-scheduled.test.ts` | 8 | Due-date-approaching, dedup hai tầng |
| Quản lý luật (Server Action) | `tests/server-actions/automation-rules.test.ts` | 34 | Admin-only + đọc cho mọi thành viên + Zod |
| Cô lập lỗi automation | `tests/server-actions/automation-failure-isolation.test.ts` | 4 | Mutation chính không bị rollback bởi đích lỗi thời |
| Checklist | `tests/server-actions/checklist.test.ts` | 22 | A1/A2/A3 cho 5 action + positive control |
| Vòng đời danh sách | `tests/server-actions/list-lifecycle.test.ts` | 43 | A1/A2/A3, cổng Cloudinary, live-cards, FOR UPDATE |
| Quản lý thành viên | `tests/server-actions/members.test.ts` + `lib/workspace-members.test.ts` | 21 + 7 | Chặn mất admin cuối, khóa tư vấn |
| Nhắc hạn chót | `lib/due-date-reminders.test.ts` | 20 | Milestone selection, dedup, SELECT predicate |
| Thông báo | `lib/notification.test.ts` | 10 | notifyMentioned/notifyDueDate, email failure graceful |
| Analytics engine | `lib/analytics/engine.test.ts` | 5 | Burndown, lead time, overdue, reopen, coverage |
| Xuất CSV | `tests/analytics-export.test.ts` | 7 | Escaping + formula-injection guard |
| Nhãn | `lib/schemas/label.test.ts` + `lib/label.test.ts` | 8 + 6 | Schema, CRUD, dedupe gắn, tách nhãn |
| Khôi phục/undo | `tests/server-actions/undo-restore.test.ts`, `lib/undo.test.ts`, `tests/db-undo-race-proof.test.ts` | 13 + 16 + 3 | Race "list cha bị lưu trữ" trên PostgreSQL thật (interleaving) |
| Today / My Work | `lib/today.test.ts` + `tests/server-actions/today.test.ts` | 16 + 7 | Phân nhóm hạn chót (DST), lọc workspace từ memberships, không N+1 |
| Quick capture | `lib/quick-capture.test.ts` + `tests/server-actions/quick-capture.test.ts` | 33 + 18 | Defaults, shortcut guards, optional fields trong cùng tx |
| Bảo vệ chỉ mục/khóa DB | `tests/db-index-proof.test.ts` | 3 | Interleaving lock_timeout thật: producer lock, archiver lock, purge lock |

#### 5.2.1 Bằng chứng PostgreSQL thật (không chỉ mock)

Một điểm khác biệt quan trọng so với kiểm thử thông thường: ngoài các tệp mock `vi.mock("@/lib/prisma")` cho tầng Server Action, đồ án có các bộ kiểm thử chạy **trên PostgreSQL thật** (tạo schema sandbox tạm thời) để chứng minh hành vi khóa và interleaving: `tests/db-index-proof.test.ts` và `tests/db-undo-race-proof.test.ts` dùng `lock_timeout` để dàn dựng thứ tự khóa xác định — ví dụ chứng minh producer lock chặn archiver, archiver hết hạn khóa khi producer giữ khóa, purge lock đóng băng producer, và phiên bản không có rào chắn sẽ commit thẻ "vô hình". Những bằng chứng này nằm ngoài khả năng của mock thuần.

### 5.3 Kiểm thử thành phần giao diện (React Testing Library)

RTL được dựng lên trên Vitest như dự án `components` (môi trường happy-dom, `vitest.workspace.ts`) với **155 bài kiểm thử trên 14 bộ kiểm thử client-component**, mỗi bộ mock Server Actions + `next/navigation`, truy vấn theo hành vi (accessible queries + `user-event`), không dùng snapshot. Phạm vi tiêu biểu:

- **Boards**: `board-filter` (5), `card-detail-sheet` (6 — autosave on-blur + guards + read-only), `card-completion-toggle` (10), `card-checklists-section` (24), `card-labels-section` (13), `card-attachments` (12).
- **Automation**: `rule-builder-dialog` (5), `rule-row` (16 — enable-toggle + delete + canManage + last-run), `automation-content` (11), `execution-log-panel` (16), `board-automation-dialog` (7).
- **Members**: `member-row` (15 — đổi vai trò + xóa + gating last-admin/self), `invite-member-dialog` (4).
- **Notifications**: `notification-dropdown` (11).
- **Khác**: `today-view` (11), `quick-capture` (23), `quick-capture-shortcuts` (13), `undo-snackbar` (14), `archived-cards-dialog` (22), `board-header-wiring` (2), `authenticated-header-actions` (4).

Lưu ý: các thành phần server (RSC) không thể render bằng RTL, nên được phủ bởi tầng E2E.

### 5.4 Kiểm thử E2E hai phiên trình duyệt

E2E dùng **Playwright** (`e2e/`, `npm run test:e2e`) với **36 bài kiểm thử xanh trên 15 tệp spec**, chạy trên máy chủ thật (`server.ts` — bao gồm cả Socket.io) và PostgreSQL thật, chromium. Điểm đặc biệt: đây là **harness hai client** — hai phiên trình duyệt thật (hai người dùng) tương tác trên cùng một bảng để chứng minh đồng bộ thời gian thực end-to-end. Các spec chính:

- `realtime-card-create.spec.ts`: A tạo thẻ → B thấy ngay.
- `realtime-card-move.spec.ts`: A kéo thẻ qua danh sách (keyboard sensor — `@hello-pangea/dnd` bỏ qua sự kiện chuột tổng hợp) → B thấy thẻ di chuyển; và **bất biến hoãn kéo thả**: sự kiện cấu trúc từ xa bị hoãn khi B đang kéo rồi được hòa giải khi thả.
- `realtime-label-sync.spec.ts`, `realtime-card-members.spec.ts`, `realtime-comment-list-reorder.spec.ts`: nhãn/thành viên/bình luận cập nhật trực tiếp trên client khác.
- `realtime-presence.spec.ts`: hai avatar hiện diện khi cả hai xem, giảm còn một khi một người rời.
- `realtime-event-proof.spec.ts` (US-083 W1): sáu bài kiểm thử độc lập cho `card:updated`, `list:created`, `list:updated`, `list:deleted`, `notification:new`, `analytics:refresh` — mỗi bài **sabotage-verified** và có **masking tripwire** (một "quả mìn" vũ trang trong mỗi cửa sổ bằng chứng: bất kỳ reload/đứt socket/re-render POST nào cũng làm bài kiểm thử fail, ngăn việc bằng chứng đến qua đường reload thay vì qua emit).
- `invitation-live-badge.spec.ts` (W2): ba người dùng thật — Alice mời Bob đã đăng ký → badge của Bob tăng trực tiếp; Carol (ngoài cuộc) không thấy gì; Accept xóa badge và Bob trở thành thành viên thật (xác nhận bằng Postgres); Bob đăng ký email lẫn hoa thường để chứng minh chuẩn hóa email.
- `quick-capture.spec.ts`, `today.spec.ts`, `undo-snackbar.spec.ts`, `automation-log-retention.spec.ts`, `automation-board-modal.spec.ts`, `platform-375.spec.ts` (375px không tràn ngang), `demo-rehearsal.spec.ts` (diễn tập demo liên tục từ fixture).

**Kỷ luật về bằng chứng**: mọi bài E2E thời gian thực đều có "presence barrier" (chờ cả hai client vào phòng) và "connect-resync settle barrier" (chờ đồng bộ khi kết nối) trước khi người A hành động; các assertion chỉ nằm trong đường emit; tripwire vũ trang như mô tả ở trên. Nhờ đó một lần "sabotage" (tắt emit) luôn làm bài kiểm thử đỏ ở đúng assertion của observer.

### 5.5 Kỹ thuật sabotage-verified

Đây là kỹ thuật kiểm chứng đặc trưng của đồ án dành cho các rào cản bảo mật và bất biến quan trọng. Ý tưởng: **bằng chứng kiểm thử chỉ có giá trị nếu việc gỡ bỏ cơ chế đang được kiểm chứng làm bài kiểm thử chuyển đỏ**. Nói cách khác, ngoài việc khẳng định "rào cản hoạt động", ta phải chứng minh rào cản đó **thực sự chịu trách nhiệm** cho kết quả xanh — loại bỏ nguy cơ "kiểm thử xanh vì lý do khác" (test theater).

Quy trình thực hiện:

1. Viết bài kiểm thử khẳng định hành vi mong muốn (xanh khi rào cản tồn tại).
2. **Sabotage**: tạm thời gỡ rào cản — ví dụ xóa dòng `hasWorkspacePermission(...)`, xóa try/catch cô lập bước luật, xóa `emitCardCreated`, xóa nhánh `isDragging` của bất biến hoãn, gỡ khóa FOR UPDATE, hoặc gỡ cổng `archivedAt IS NULL` trong transaction.
3. Chạy lại: nếu bài kiểm thử chuyển **đỏ** đúng ở khẳng định liên quan, rào cản được chứng minh là tải trọng (load-bearing); nếu vẫn xanh, bằng chứng là rỗng và phải sửa.
4. Khôi phục rào cản, ghi nhận kết quả đỏ-xanh vào hồ sơ bằng chứng của story.

Ví dụ tiêu biểu (đều được ghi nhận trong TEST_MATRIX):

- **Ranh giới bảo mật**: gỡ một lớp kiểm tra trong bất kỳ action nào → các trường hợp A2/A3 tương ứng chuyển đỏ (US-006).
- **Ma trận RBAC**: gỡ một quyền trong `lib/permissions.ts` → cả ba lớp L1/L2/L3 phát hiện lệch (US-007).
- **Bất biến hoãn kéo thả**: gỡ nhánh `isDragging` → sự kiện cấu trúc đến giữa cú kéo làm hỏng mảng → E2E đỏ (US-009 slice 2).
- **Emit thời gian thực**: tắt `emitCardCreated`/`emitCardMoved`/`emitNotificationNew`... → observer không bao giờ thấy thay đổi → E2E đỏ ở assertion của observer (US-009/010/011/012, US-083 W1/W2).
- **Cô lập lỗi automation**: gỡ try/catch từng bước → mutation chính của người dùng lại fail (US-075, mutation-checked).
- **Khóa FOR UPDATE / race**: gỡ nhánh revalidation trong transaction → interleaving trên PostgreSQL thật commit thẻ "vô hình" → invariant test đỏ (US-074, US-083 W8, `db-undo-race-proof.test.ts`).
- **Masking tripwire**: chính tripwire cũng được chứng minh — với emit bị tắt, một lần reload giữa cửa sổ trước đây có thể "ngụy trang" cho bài test xanh; khi có tripwire, cùng kịch bản đó chuyển đỏ tại tripwire (US-083 W1).

### 5.6 Ma trận phân quyền RBAC

`tests/server-actions/rbac-matrix.test.ts` — **142 trường hợp** — kiểm chứng toàn bộ ma trận vai trò × thao tác trên ba vai trò thật (`lib/permissions.ts`), theo ba lớp:

- **L1 — ma trận server**: mọi ô (vai trò, thực thể + động từ) của `admin`/`editor`/`viewer` với ngữ nghĩa AND (yêu cầu nhiều quyền cùng lúc);
- **L2 — bản đồ UI**: `getBoardPagePermissionsForRole` (quyền hiển thị trang bảng) khớp với ma trận server;
- **L3 — hợp đồng**: bản sao `roleGrants` trong bộ kiểm thử US-006 khớp với ma trận thật (chống "copy lệch").

Mỗi lớp đều sabotage-verified. Đây là tầng an toàn quan trọng nhất vì một lỗi ở đây có nghĩa là người dùng bị sai quyền — ví dụ viewer có thể xóa thẻ — trên mọi action của hệ thống. Tương đương của nó cho kênh thời gian thực là `lib/realtime/auth.test.ts` (19 trường hợp): một lỗi ở đây sẽ làm rò rỉ luồng dữ liệu trực tiếp của bảng tới người không phải thành viên.

### 5.7 CI/CD với GitHub Actions

Hai workflow trên GitHub Actions, đều chạy cho PR và push vào `dev`/`main`:

- **`ci.yml` (cổng chất lượng, bắt buộc đủ điều kiện)**: job `verify` — `lint` → `tsc --noEmit` → `npm test`, với dịch vụ `postgres:16-alpine` để phục vụ các bằng chứng tích hợp fail-closed (ví dụ `tests/db-index-proof.test.ts` tạo schema sandbox tạm). Cổng này đảm bảo mọi thay đổi không phá vỡ lint, kiểu và 1.404 bài kiểm thử.
- **`e2e.yml` (tách riêng, không chặn — non-blocking)**: job `e2e` — khởi động PostgreSQL + **Mailpit** (SMTP :1025, API :8025) làm bể chứa thư, `prisma migrate deploy`, cài Chromium, chạy `npm run test:e2e`; tải lên báo cáo Playwright khi fail. Tách riêng vì E2E khởi động cả ứng dụng thật và trình duyệt thật nên chậm và nhạy hơn; được thăng cấp thành required status check khi ổn định.

Chính sách nhánh: `dev` là nhánh tích hợp, `main` chỉ qua PR (ruleset `protect-main` chặn push trực tiếp/force-push/xóa). Mọi thay đổi đều qua pull request nên hai workflow này tự động xác minh từng thay đổi trước khi nhập vào nhánh chính.

### 5.8 TEST_MATRIX — bản đồ contract đến bằng chứng

`docs/TEST_MATRIX.md` là tài liệu trung tâm phản ánh **trạng thái thật** của bộ kiểm thử (không phải trạng thái mong muốn): mỗi hàng là một hợp đồng chức năng với các cột Unit / Integration / E2E / Status / Evidence (tệp kiểm thử + số trường hợp + cách chứng minh). Tài liệu này:

- **Ngăn "test theater"**: một hàng chỉ được đánh dấu `implemented` khi có bằng chứng kiểm thử hoặc xác thực thực tế.
- **Công khai khoảng trống**: các hàng như Activity audit log (`planned`), Attachments upload/cleanup (`planned` — chỉ ranh giới bảo mật được chứng minh), hay Card CRUD business logic (chỉ reorder được unit-test) ghi rõ điều chưa được kiểm chứng — dùng làm cơ sở cho mục hạn chế ở Chương 7.
- **Phân loại bằng chứng rõ ràng**: phân biệt bằng chứng "từ chối" (denial tests — A1/A2/A3) với bằng chứng "sabotage" (gỡ rào chắn → đỏ), và với bằng chứng cơ chế PostgreSQL thật (interleaving lock_timeout).
- **Bản đồ bảo trì**: khi thay đổi hành vi, phải cập nhật hàng tương ứng, story packet và quyết định — vòng đời đảm bảo tài liệu không lỗi thời.

---

## CHƯƠNG 6 — TRIỂN KHAI VÀ DEMO

### 6.1 Môi trường triển khai

Ứng dụng được triển khai production trên nền tảng **Railway** — tên miền dạng `*.up.railway.app` [XÁC MINH: tên miền cụ thể cần xác nhận lại tại thời điểm bảo vệ] — chạy server tùy chỉnh `server.ts` (khởi động qua `tsx` hoặc bản build Next.js production) bên trong container Node. Các dịch vụ liên quan: PostgreSQL 16 (dịch vụ quản lý bởi nền tảng), Resend cho email giao dịch và Cloudinary cho lưu trữ tệp đính kèm/ảnh bìa.

Khác biệt quan trọng với triển khai mặc định của Next.js: ứng dụng **không thể chạy `next start` đơn thuần** vì cần Socket.io trên cùng cổng — do đó script `npm run start` khởi động `NODE_ENV=production tsx server.ts`. Trước khi khởi động, cần chạy `npx prisma migrate deploy` để áp dụng 14 migration lên cơ sở dữ liệu production.

### 6.2 Cấu hình môi trường và cơ sở dữ liệu

Các biến môi trường bắt buộc (danh sách đầy đủ trong `.env.example`):

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"
BETTER_AUTH_SECRET="<openssl rand -base64 32>"
BETTER_AUTH_URL="https://<domain>"
NEXT_PUBLIC_APP_URL="https://<domain>"
RESEND_API_KEY="re_..."           # bắt buộc ở production (xác minh email bắt buộc)
EMAIL_FROM="Planora <noreply@domain>"
CRON_SECRET="<openssl rand -base64 32>"   # kích hoạt driver cron nội bộ
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="..."
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

Điểm lưu ý vận hành: vì xác minh email được bắt buộc ở mọi môi trường (quyết định 0023), `RESEND_API_KEY` phải được cấu hình hợp lệ — nếu thiếu, mọi tài khoản mới sẽ bị khóa ngoài hệ thống (rủi ro đã được ghi nhận trong chính quyết định). `SMTP_HOST` không có hiệu lực trong production (quyết định 0025), nên không thể vô tình chuyển thư production vào bể chứa dev.

### 6.3 Email và lưu trữ file

- **Email (Resend + React Email)**: tất cả email giao dịch — xác minh email, đặt lại mật khẩu, lời mời workspace, nhắc hạn chót — được render bằng template React (`emails/`) và gửi qua Resend. Trong phát triển/kiểm thử, transport chuyển sang nodemailer → Mailpit khi có `SMTP_HOST`.
- **Lưu trữ file (Cloudinary)**: tệp đính kèm và ảnh bìa upload qua preset có cấu hình (`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`), lưu `cloudinaryPublicId`/`cloudinaryResourceType` để phục vụ bồi hoàn an toàn khi xóa vĩnh viễn danh sách (quyết định 0029).

### 6.4 Quy trình demo bảo vệ

Quy trình demo bảo vệ dựa trên `docs/DEMO_RUNBOOK.md` với nguyên tắc: **không bao giờ tạo tài khoản mới, không đổi `emailVerified`, không truncate database, không xóa workspace tùy ý**. Dữ liệu demo dùng một workspace dành riêng (`planora-us083-demo`) có thể tái tạo xác định:

1. **Chuẩn bị**: khởi động PostgreSQL + Mailpit (cục bộ); tạo **chủ sở hữu** (owner, vai trò admin) và **cộng tác viên** (collaborator, vai trò editor) qua luồng đăng ký thật; mở cả hai link xác minh từ Mailpit — hai người dùng phải được xác minh trước khi gieo dữ liệu.
2. **Gieo dữ liệu**: `npm run demo:seed -- --owner-email ... --collaborator-email ...` tạo workspace demo với hình dạng logic lặp lại được — **2 bảng / 5 danh sách / 7 thẻ** với tiêu đề, phân công, vai trò và hạn chót tương đối cố định — và ghi `.demo/fixture-manifest.json` chứa id của lần chạy hiện tại.
3. **Trình diễn liên tục** (một phiên): `/today` (các nhóm Quá hạn/Hôm nay/Tuần này), quick capture bằng phím `C`, đồng bộ thời gian thực hai client (tạo thẻ/di chuyển thẻ giữa hai trình duyệt), lưu trữ thẻ/danh sách → **Undo**, badge lời mời tăng trực tiếp khi mời thành viên đã đăng ký. Kịch bản này được tự động hóa thành `e2e/demo-rehearsal.spec.ts` (1 bài E2E xanh) để diễn tập trước khi bảo vệ.
4. **Đặt lại**: `npm run demo:reset -- ...` chỉ xóa workspace demo có marker sở hữu khớp đúng hai người dùng và gỡ manifest; người dùng và các workspace khác không bao giờ bị đụng tới.
5. **Hợp đồng lặp lại**: seed → xem manifest → reset → seed lại → so sánh `logicalShape` và các tiêu đề (không so id — id thay đổi giữa các lần chạy); vòng lặp này đã được thực thi thật với hai người dùng được tạo qua luồng đăng ký + Mailpit, xác nhận 2 bảng/5 danh sách/7 thẻ với tiêu đề, vai trò và độ lệch hạn chót giống hệt nhau (tất cả id khác nhau mỗi lần).

Lưu ý vận hành cho diễn tập: `npm run test:e2e` tự khởi động `server.ts` thật và **từ chối** tái sử dụng process đang chiếm cổng 3000 (va chạm cổng là lỗi có chủ đích, to tiếng); trước buổi diễn tập phải dừng dev server cũ. `npm run test:e2e:reuse` chỉ là escape hatch cục bộ sau khi chủ động khởi động lại `npm run dev` từ đúng checkout hiện tại.

### 6.5 Môi trường cục bộ với Mailpit

Cục bộ, `docker compose up -d` khởi động đồng thời `postgres:16-alpine` (cổng 5432) và **Mailpit** (SMTP :1025, giao diện web/REST API :8025). `lib/email.ts` chọn transport: production → Resend; non-production có `SMTP_HOST` → nodemailer → Mailpit (template React Email render thành HTML/text); ngược lại → log. Nhờ đó:

- Nhà phát triển/agent có thể lấy **link xác minh thật** từ `localhost:8025` và hoàn tất luồng xác minh thực tế — không cần cấu hình Resend, không bypass bảo mật;
- E2E (`e2e/helpers/mail.ts`) đọc link từ REST API Mailpit và tự động hoàn tất xác minh trong mọi spec cần đăng ký;
- Bất kỳ thư nào (xác minh, đặt lại mật khẩu, lời mời, nhắc hạn chót) đều có thể kiểm tra trực quan trong giao diện Mailpit trong buổi demo fallback.

---

## CHƯƠNG 7 — KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

### 7.1 Kết quả đạt được

Sau quá trình phát triển khoảng 5 tháng (285 commit từ 16/03/2026 đến 02/08/2026), đồ án đã đạt được các kết quả chính sau:

**Về sản phẩm**

- Một ứng dụng web quản lý dự án Kanban hoàn chỉnh với đầy đủ các miền chức năng: bảng – danh sách – thẻ kèm siêu dữ liệu (nhãn, checklist, bình luận, tệp đính kèm Cloudinary, hạn chót, ước lượng, ưu tiên, thành viên), không gian làm việc và phân quyền RBAC ba vai trò, đồng bộ thời gian thực, dashboard analytics theo luồng sự kiện, động cơ tự động hóa kiểu Butler, thông báo trong ứng dụng + email, và bộ tính năng năng suất cá nhân (Today / My Work, quick capture, undo).
- Kiến trúc full-stack hiện đại: Next.js 16 App Router + Server Actions làm ranh giới ghi duy nhất, PostgreSQL là nguồn dữ liệu, Socket.io chỉ phát quảng bá, 24 model dữ liệu, 14 migration.

**Về chất lượng**

- **1.404 bài kiểm thử đơn vị/tích hợp** (90 tệp) xanh, **155 bài kiểm thử RTL**, **36 bài E2E** hai phiên trình duyệt xanh; cổng CI `lint → tsc → test` chạy tự động trên mọi thay đổi.
- Ma trận RBAC 142 trường hợp; ranh giới bảo mật 118 trường hợp A1/A2/A3; phân quyền socket 19 trường hợp — tất cả đều **sabotage-verified**.
- Bằng chứng PostgreSQL thật cho các cuộc đua đồng thời (lock FOR UPDATE, interleaving lock_timeout) — mức độ kiểm chứng vượt xa kiểm thử mock thông thường.
- 31 quyết định thiết kế được ghi lại; tài liệu TEST_MATRIX ánh xạ từng hợp đồng chức năng tới bằng chứng kiểm thử cụ thể.

**Về triển khai**

- Sẵn sàng triển khai production trên Railway với migrate deploy, Resend, Cloudinary; quy trình demo bảo vệ lặp lại được với fixture 2 bảng/5 danh sách/7 thẻ và diễn tập tự động.

### 7.2 Đánh giá tổng quan

So với mục tiêu ban đầu, đồ án đã đạt được toàn bộ các mục tiêu chức năng cốt lõi và vượt mong đợi ở chiều sâu kỹ thuật:

- **Về kiến trúc**: mô hình "Server Actions làm ranh giới ghi duy nhất + socket chỉ quảng bá" giúp kiểm soát bảo mật tập trung và dễ suy luận; hợp đồng 8 bước được thực thi nhất quán trên 26 action ghi dữ liệu (và 2 action đọc, theo ma trận US-006).
- **Về độ tin cậy**: việc kết hợp transaction + unique index một phần + khóa FOR UPDATE cho các bất biến dữ liệu (vị trí, admin cuối, upload-đối-archived) là điểm mạnh nhất của đồ án, được chứng minh không chỉ bằng mock mà bằng interleaving trên PostgreSQL thật.
- **Về thời gian thực**: bất biến hoãn kéo thả giải quyết đúng bài toán tinh tế nhất của ứng dụng kanban đa người dùng — không làm hỏng cú kéo thả của người đang thao tác khi người khác thay đổi cấu trúc.
- **Về quy trình**: kỷ luật "hợp đồng → story → quyết định → bằng chứng" (docs/product, docs/stories, docs/decisions, TEST_MATRIX) giúp sản phẩm có hồ sơ kỹ thuật đầy đủ, đúng tinh thần một đồ án tốt nghiệp chất lượng.

### 7.3 Hạn chế

Các hạn chế được ghi nhận trung thực (chủ yếu từ TEST_MATRIX — các hàng ở trạng thái `planned`):

1. **Phủ kiểm thử thành phần chưa hoàn toàn**: RTL đã phủ tốt nhóm dialog/editor/row, nhưng còn trống ở nội dung bảng (`list-card-item`, `list-column` — cần wrapper DragDropContext), biểu đồ dashboard, và phần soạn bình luận.
2. **Business logic của một số CRUD chưa unit-test đầy đủ**: nhiều thao tác (board CRUD, card members, comments, attachments) mới chỉ được chứng minh ở ranh giới bảo mật (A1/A2/A3); phần logic nghiệp vụ bên trong còn chưa được phủ.
3. **Một số module chưa có E2E**: E2E tập trung vào thời gian thực; các luồng như vòng đời danh sách (E2E chưa implement), quản lý thành viên hai tài khoản (planned), activity log (chưa test), vẫn là khoảng trống.
4. **Virtualization bị hoãn**: bảng lớn (hàng trăm thẻ) chưa có virtual scrolling — quyết định 0010 hoãn virtualization vì chưa có bằng chứng nhu cầu desktop; hiện phụ thuộc vào memoization và dedupe render.
5. **Telemetry sử dụng sản phẩm chưa làm**: đo lường sử dụng nội bộ (US-076) vẫn ở trạng thái planned, chờ quyết định 0027 về quyền riêng tư.
6. **Rủi ro vận hành còn lại**: rủi ro residual của bồi hoàn Cloudinary (nếu `destroy` thất bại, tệp mồ côi — cần job dọn dẹp sau này); sự phụ thuộc vào Resend đúng cấu hình ở mọi môi trường (đã ghi trong quyết định 0023); lệch schema có chủ đích giữa partial unique index và Prisma (phải chú ý khi migrate).
7. **Một số tính năng ngoài phạm vi**: mẫu thẻ, thẻ định kỳ, mở rộng trigger theo thuộc tính, API công khai cho dữ liệu — đều nằm trong roadmap, chưa hiện thực.

### 7.4 Hướng phát triển

Dựa trên roadmap đã ghi nhận (initiative IN-04) và các quyết định tương lai:

1. **Hoàn thiện phủ kiểm thử**: RTL cho list-column/list-card-item, biểu đồ dashboard, comment composer; integration test cho business logic các CRUD còn lại; E2E cho vòng đời danh sách và luồng thành viên hai tài khoản.
2. **Virtualization cho bảng lớn**: triển khai virtual scrolling khi có bằng chứng hiệu năng thực tế (đã có `scripts/perf-measure.ts` và bộ seed bảng lớn làm nền).
3. **Mở rộng tự động hóa (US-080)**: trigger theo thay đổi thuộc tính (hạn chót, ước lượng, ưu tiên, stale-in-capture); cân nhắc webhooks và DSL tự do ở v2.
4. **Mẫu thẻ và thẻ định kỳ (US-081/082)**: tái sử dụng template, lịch tạo thẻ định kỳ với cơ chế dedup rõ ràng.
5. **Per-board capture/triage (US-079)**: danh sách đích mặc định cho quick capture theo từng bảng.
6. **Telemetry nội bộ (US-076)**: đo lường sử dụng ẩn danh tuân thủ quyết định 0027.
7. **Vận hành**: job dọn dẹp tệp Cloudinary mồ côi (orphan reconciliation), theo dõi p99 latency của Server Action có đánh giá luật (mục theo dõi trong quyết định 0022), nâng E2E thành required status check khi ổn định.

Nhìn chung, đồ án đã hoàn thành trọn vẹn mục tiêu đề ra: một hệ thống quản lý dự án Kanban có đầy đủ tính năng thực tế, kiến trúc hiện đại, bảo mật chặt chẽ và chất lượng được chứng minh bằng hệ thống kiểm thử bài bản — sẵn sàng phục vụ nhu cầu quản lý công việc của các nhóm nhỏ trong thực tế và là nền tảng vững chắc cho các hướng phát triển tiếp theo.

---

## TÀI LIỆU THAM KHẢO

### Tài liệu chính thức của các công nghệ

1. Next.js Documentation — App Router, Server Actions, Route Handlers. https://nextjs.org/docs
2. React Documentation — Server Components, Actions, useOptimistic. https://react.dev
3. TypeScript Documentation. https://www.typescriptlang.org/docs
4. Prisma Documentation — Schema, Client, Migrations, Transactions, Adapters. https://www.prisma.io/docs
5. PostgreSQL Documentation. https://www.postgresql.org/docs
6. Better Auth Documentation — Email/Password, Organization plugin, Access Control. https://www.better-auth.com/docs
7. Socket.io Documentation — Rooms, Middleware. https://socket.io/docs
8. Tailwind CSS Documentation — CSS-first configuration, @theme. https://tailwindcss.com/docs
9. shadcn/ui Documentation. https://ui.shadcn.com/docs
10. Zod Documentation — Schema validation. https://zod.dev
11. Zustand Documentation. https://zustand.docs.pmnd.rs
12. Vitest Documentation. https://vitest.dev
13. Playwright Documentation. https://playwright.dev
14. Resend Documentation — Email API. https://resend.com/docs
15. React Email Documentation. https://react.email/docs
16. Cloudinary Documentation. https://cloudinary.com/documentation
17. @hello-pangea/dnd Documentation. https://github.com/hello-pangea/dnd
18. React Testing Library — Testing Library for React. https://testing-library.com/docs/react-testing-library/intro
19. GitHub Actions Documentation. https://docs.github.com/actions
20. Railway Documentation — Deployments. https://docs.railway.com
21. Mailpit Documentation — Email testing tool. https://mailpit.axllent.org

### Tài liệu nội bộ của đồ án (trong kho mã nguồn)

1. `README.md` — tổng quan sản phẩm, tính năng, tech stack, hướng dẫn cài đặt.
2. `docs/ARCHITECTURE.md` — kiến trúc thực tế, hợp đồng Server Action, float-gap ordering, soft-delete/cascade, bất biến thời gian thực.
3. `docs/TEST_MATRIX.md` — bản đồ hợp đồng → bằng chứng kiểm thử, số liệu kiểm thử.
4. `docs/DEMO_RUNBOOK.md` — quy trình demo bảo vệ (seed/reset, chính sách server).
5. `docs/GLOSSARY.md` — từ vựng miền thống nhất.
6. `docs/decisions/` — 31 quyết định thiết kế (đặc biệt 0008, 0015, 0022, 0023, 0025, 0026, 0029, 0030, 0031).
7. `docs/product/` — hợp đồng sản phẩm từng miền (boards-and-cards, workspaces-and-access, realtime-sync, notifications, analytics, automation, overview).
8. `docs/stories/backlog.md` — lịch sử các epic và story (E01–E09, US-004…US-083).
9. `DESIGN.md` — hệ thống thiết kế (token, typography, spacing, interaction patterns).
10. `prisma/schema.prisma` — lược đồ cơ sở dữ liệu.
11. `AGENTS.md` / `CLAUDE.md` — hướng dẫn đóng góp và vận hành kho mã.

---

*Hết — Báo cáo đồ án tốt nghiệp Planora.*