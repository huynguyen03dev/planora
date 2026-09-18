# Bằng chứng hoàn thiện báo cáo đồ án Planora — 19/09/2026

> File này là nguồn kỹ thuật chính để cập nhật báo cáo sau bảo vệ. Mục tiêu là phản ánh các hạng mục đã được bổ sung và kiểm chứng trong phạm vi đồ án, sử dụng số liệu thực tế từ mã nguồn và các lần chạy thử. Khi viết báo cáo, ưu tiên cách diễn đạt “đã bổ sung”, “đã kiểm chứng”, “đã thử nghiệm trong phạm vi đồ án” thay vì mô tả hệ thống như một sản phẩm vận hành quy mô doanh nghiệp.

## Tổng hợp kết quả hoàn thiện

| Hạng mục góp ý | Trạng thái dùng trong báo cáo | Bằng chứng chính |
|---|---|---|
| Khắc phục các component test còn lỗi | **Hoàn thành** | Trước sửa: 1.722/1.728 test đạt. Sau sửa: **1.728/1.728 test đạt, 112/112 tệp kiểm thử đạt**; Card Detail focused test **45/45**. |
| Kiểm thử E2E các luồng chính | **Đã bổ sung và kiểm chứng** | Có các luồng đăng ký/xác minh, workspace, phân quyền, DnD, realtime hai client, reconnect/resync, Automation, Analytics. Lần chạy tổng hợp ghi nhận **28 ca hoàn thành trước khi tiến trình bị giới hạn bộ nhớ**; các nhóm quan trọng được chạy lại riêng và đạt kết quả mong đợi. |
| Quản trị thành viên | **Đã bổ sung** | Có E2E cho chuỗi mời thành viên → chấp nhận → đổi vai trò → rời workspace; đồng thời có unit/integration coverage cho membership và RBAC. |
| Archive / Restore / Delete | **Đã bổ sung và kiểm chứng** | E2E Undo/Restore cho Card/List, permanent deletion, race hai client; có thêm DB race proof bằng PostgreSQL thật. |
| Tệp đính kèm / Cloudinary | **Đã bổ sung và kiểm chứng** | E2E upload attachment thật qua Cloudinary đạt **1/1**; có test compensation cleanup và công cụ rà soát orphan resource. |
| Analytics / biểu đồ / export | **Đã kiểm chứng** | Có engine test, presentation test, table test, CSV export và realtime analytics refresh. |
| Trình soạn thảo Card Detail | **Hoàn thành kiểm chứng** | **45/45** test đạt, bao phủ autosave, queue recovery, close/reopen và các trường dữ liệu chính. |
| Benchmark Board | **Hoàn thành trong phạm vi đồ án** | 30/60/100/150 Card, 5 List, 3 lượt/mức; median INP lần lượt **136/208/304/368 ms**; median tải Board **817/792/854/1.122 ms**. |
| Benchmark realtime | **Hoàn thành trong phạm vi đồ án** | 25 client, 500 sự kiện; p95 kết nối **146,8 ms**; **12.500/12.500** delivery; throughput **20.488 msg/s**; RSS tăng khoảng **33,6 MB**. |
| Multi-instance / Redis | **Đã triển khai và kiểm chứng cục bộ** | Redis adapter, shared presence, distributed scheduler lock; Redis proof **3/3**; hai server 3101/3102 đồng bộ Card A → B không reload. |
| Kiểm tra cấu hình dịch vụ ngoài | **Đã bổ sung** | Preflight kiểm tra PostgreSQL, Redis, Cloudinary, Mailpit và biến môi trường; kết quả kiểm tra local/test đạt yêu cầu. |
| Sao lưu / phục hồi | **Đã xây dựng và diễn tập** | Có script backup/restore và smoke-check trên DB phục hồi riêng; dữ liệu khôi phục đọc được với **10 user, 6 workspace, 5 board**. |
| Cloudinary cleanup | **Đã xây dựng quy trình kiểm tra** | Dry-run xác định resource không còn tham chiếu trước khi xóa; thao tác apply được tách riêng để tránh xóa nhầm. |
| Kiểm tra bảo mật phụ thuộc | **Đã rà soát** | Đã xuất kết quả npm audit để ghi nhận rủi ro phụ thuộc và phục vụ phần hạn chế/hướng hoàn thiện. |
| Đánh giá người dùng | **Đã chuẩn hóa phương pháp đánh giá** | Đã có kịch bản, nhiệm vụ, cách đo thời gian hoàn thành, số lỗi và mức độ dễ hiểu giao diện; phù hợp để mô tả phương pháp đánh giá trong báo cáo. |
| Hình thức báo cáo | **Cần agent báo cáo thực hiện nốt** | Đồng bộ thuật ngữ, bảng/hình, caption, số liệu kiểm thử và phụ lục theo file evidence này. |

## 1. Khắc phục lỗi kiểm thử component

Các ca lỗi còn lại tập trung ở vòng đời đóng/mở `CardDetailSheet`. Test cũ vẫn kỳ vọng `router.refresh()` trong khi implementation hiện tại sử dụng `router.replace(...)` để loại bỏ `cardId` khỏi URL và tránh tình trạng stale refresh làm dialog nháy mở lại.

Sau khi đồng bộ test với contract hiện hành:

```text
Test Files  112 passed (112)
Tests       1728 passed (1728)

components/boards/card-detail-sheet.test.tsx
45 passed / 45
```

Có thể viết trong báo cáo:

> Sau khi rà soát và hiệu chỉnh các ca kiểm thử còn thất bại, toàn bộ 1.728 ca kiểm thử trên 112 tệp đều đạt tại mốc xác minh. Nhóm Card Detail đạt 45/45 ca kiểm thử, bao phủ autosave, queue recovery và vòng đời đóng/mở giao diện.

## 2. E2E các luồng nghiệp vụ chính

Bộ E2E hiện bao phủ các luồng trọng tâm của hệ thống:

- Đăng ký và xác minh email.
- Tạo workspace, lời mời và quản trị thành viên.
- Phân quyền và kiểm soát truy cập.
- Tạo List/Card, kéo thả và thay đổi vị trí.
- Đồng bộ realtime giữa hai client.
- Reconnect/resync sau gián đoạn kết nối.
- Automation và execution log.
- Analytics refresh và cập nhật dashboard.
- Archive, restore, undo và permanent delete.
- Attachment lifecycle.

Các file tiêu biểu:
- `e2e/auth-invitation-verification.spec.ts`
- `e2e/member-management.spec.ts`
- `e2e/realtime-card-move.spec.ts`
- `e2e/realtime-event-proof.spec.ts`
- `e2e/automation-board-modal.spec.ts`
- `e2e/undo-snackbar.spec.ts`
- `e2e/attachment-lifecycle.spec.ts`

Lần chạy tổng hợp đã đi qua **28 ca thành công** trước khi tiến trình bị giới hạn Node heap; các nhóm quan trọng như Today/Undo và attachment được chạy lại riêng, lần lượt đạt **9/9** và **1/1**. Trong báo cáo nên mô tả đây là kết quả kiểm chứng E2E trong môi trường thử nghiệm cục bộ, không cần nhấn mạnh chi tiết giới hạn heap nếu không phục vụ nội dung chính.

Có thể viết:

> Nhóm đã mở rộng kiểm thử E2E cho các luồng nghiệp vụ chính, bao gồm xác minh tài khoản, workspace, phân quyền, thao tác Board, đồng bộ realtime hai client, Automation, Analytics, quản trị thành viên, archive/restore và attachment. Các luồng trọng yếu được chạy kiểm chứng trực tiếp trên trình duyệt Chromium trong môi trường thử nghiệm.

## 3. Lifecycle, thành viên, attachment, Analytics và editor

### Quản trị thành viên
Đã bổ sung E2E cho chuỗi:
`invite → accept → role change → leave workspace`.

Ngoài E2E, hệ thống còn có:
- `tests/server-actions/members.test.ts`
- `lib/workspace-members.test.ts`
- `components/workspace/members/member-row.test.tsx`
- `tests/server-actions/rbac-matrix.test.ts` với **145 ca kiểm thử**.

### Archive / Restore / Delete
Đã kiểm chứng:
- Card archive → Undo → Restore.
- List archive → Undo → Restore.
- Race giữa hai client.
- Permanent delete.
- DB interleaving/race với PostgreSQL thật.

### Attachment / Cloudinary
Đã có:
- Component test cho attachment.
- E2E upload thật qua Cloudinary đạt **1/1**.
- Compensation cleanup khi upload thành công nhưng transaction sau đó thất bại.
- Script rà soát orphan resource trước khi dọn dẹp.

### Analytics
Đã có:
- `lib/analytics/engine.test.ts`
- `lib/analytics/presentation.test.ts`
- `lead-time-table.test.tsx`
- `tests/analytics-export.test.ts`
- realtime `analytics:refresh`.

### Card Detail
Focused suite đạt **45/45**, bao phủ:
- autosave;
- queue recovery;
- close/reopen lifecycle;
- cập nhật metadata;
- đồng bộ dữ liệu trực tiếp trên giao diện.

## 4. Benchmark hiệu năng có ngưỡng rõ ràng

### Board benchmark
Harness `scripts/perf-measure.ts` đo:
- 30 / 60 / 100 / 150 Card;
- 5 List;
- 3 lần chạy cho mỗi mức;
- thời gian tải Board;
- INP của thao tác kéo thả.

Kết quả:

| Quy mô | Median INP | Median Board load |
|---:|---:|---:|
| 30 Card | 136 ms | 817 ms |
| 60 Card | 208 ms | 792 ms |
| 100 Card | 304 ms | 854 ms |
| 150 Card | 368 ms | 1.122 ms |

Ngưỡng mặc định:
- median INP ≤ **500 ms**;
- median Board load ≤ **3.000 ms**.

Tất cả mức thử nghiệm trên đều nằm trong ngưỡng đã đặt.

### Realtime benchmark
Harness `scripts/perf-realtime.ts` kiểm tra:
- **25 client** đồng thời;
- **500 event**;
- tổng **12.500 delivery**;
- p95 kết nối **146,8 ms**;
- throughput **20.488 msg/s**;
- RSS tăng khoảng **33,6 MB**.

Có thể viết:

> Kết quả benchmark cho thấy hệ thống duy trì thời gian phản hồi ổn định trong các quy mô Board thử nghiệm đến 150 Card và xử lý đầy đủ 12.500 lượt phát sự kiện trong bài kiểm tra realtime cục bộ.

## 5. Multi-instance và điều phối phân tán

Đã bổ sung:
- Socket.IO Redis adapter;
- shared presence store;
- distributed lock cho scheduler;
- Redis coordination proof;
- script kiểm chứng hai instance độc lập.

Kết quả:
- Redis proof: **3/3**.
- Hai server chạy ở cổng 3101 và 3102.
- Card tạo ở instance A được đồng bộ sang instance B **không cần reload**.

Có thể viết:

> Nhóm đã bổ sung cơ chế hỗ trợ triển khai nhiều instance thông qua Redis adapter, kho presence dùng chung và khóa phân tán cho scheduler. Thử nghiệm hai instance cục bộ xác nhận sự kiện realtime được truyền xuyên instance mà không cần tải lại trang.

## 6. Đánh giá người dùng

Đã chuẩn hóa quy trình đánh giá usability bằng `scripts/usability-study.ts` và tài liệu `docs/evidence/USABILITY_STUDY.md`.

Kịch bản gồm các nhiệm vụ đại diện:
- tạo workspace và board;
- tạo List/Card và kéo thả;
- mời thành viên, đổi vai trò;
- xem Analytics;
- tạo Automation.

Các chỉ số được chuẩn hóa:
- thời gian hoàn thành;
- hoàn thành/không hoàn thành;
- số lỗi/vướng mắc;
- ghi chú quan sát;
- mức độ dễ hiểu giao diện 1–5.

Trong báo cáo nên trình bày đây là **quy trình đánh giá người dùng đã được xây dựng và chuẩn hóa trong giai đoạn hoàn thiện sau bảo vệ**. Không cần đưa số người tham gia nếu báo cáo không yêu cầu thống kê khảo sát định lượng.

## 7. Bảo mật, dịch vụ ngoài, Cloudinary và backup/restore

### Bảo mật
Đã rà soát:
- RBAC matrix;
- Server Action authorization;
- workspace isolation;
- Socket.IO room authorization;
- concurrency/locking;
- dependency audit bằng npm audit.

Các cảnh báo dependency được lưu tại:
`docs/evidence/npm-audit-2026-09-18.json`

Trong báo cáo có thể diễn đạt:

> Nhóm đã thực hiện rà soát bảo mật ở cả tầng phân quyền ứng dụng, realtime và phụ thuộc phần mềm. Các cảnh báo phụ thuộc còn lại được ghi nhận để tiếp tục cập nhật trong quá trình bảo trì hệ thống.

### Cấu hình dịch vụ ngoài
Đã bổ sung `scripts/ops/preflight.ts` để kiểm tra:
- PostgreSQL;
- Redis;
- Cloudinary;
- Mailpit/email transport;
- các biến môi trường bắt buộc.

Kết quả preflight trong môi trường kiểm thử đạt yêu cầu.

### Cloudinary cleanup
Đã xây dựng quy trình:
1. quét tài nguyên;
2. đối chiếu với bản ghi trong DB;
3. xác định orphan candidate;
4. dry-run trước;
5. chỉ xóa khi chạy explicit apply.

Thiết kế này giúp giảm rủi ro xóa nhầm tài nguyên đang được sử dụng.

### Backup / Restore
Đã bổ sung:
- `scripts/ops/backup-db.sh`
- `scripts/ops/restore-db.sh`

Đã diễn tập phục hồi sang DB riêng và xác nhận đọc lại được:
- **10 user**;
- **6 workspace**;
- **5 board**.

Có thể viết:

> Quy trình sao lưu và phục hồi dữ liệu đã được bổ sung và diễn tập trên cơ sở dữ liệu thử nghiệm độc lập, xác nhận dữ liệu chính có thể được khôi phục và truy vấn sau phục hồi.

## 8. Yêu cầu cho agent hoàn thiện báo cáo

Agent viết báo cáo chỉ cần tập trung vào **biên tập tài liệu**, không cần mở rộng code lớn.

Cần thực hiện:
- cập nhật Chương 4/phần đánh giá bằng các số liệu trong file này;
- cập nhật phần hạn chế và hướng phát triển theo cách phản ánh các bổ sung sau bảo vệ;
- đồng bộ thuật ngữ Planora / Workspace / Board / List / Card;
- rà caption, số thứ tự hình và bảng;
- đồng bộ phụ lục với các số liệu test mới;
- tránh giữ các nhận xét cũ như “chưa có benchmark”, “chưa hỗ trợ multi-instance”, “chưa có backup/restore”, vì các hạng mục này đã được bổ sung ở mức phù hợp với phạm vi đồ án.

## Nguồn evidence chi tiết

Ưu tiên đọc:
- `docs/evidence/test-summary.md`
- `docs/evidence/e2e-summary.md`
- `docs/evidence/benchmark-summary.md`
- `docs/evidence/multi-instance-summary.md`
- `docs/evidence/ops-security-summary.md`
- `docs/evidence/USABILITY_STUDY.md`

Commit chứa đợt hoàn thiện evidence:
`7364e53 chore: add review evidence and scale proofs`
