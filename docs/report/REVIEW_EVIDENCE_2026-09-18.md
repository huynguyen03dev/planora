# Bằng chứng xử lý nhận xét đồ án — 18/09/2026

> **Execution update 19/09/2026 — supersedes the historical snapshot below.** Use this table and `docs/evidence/*` for the report. Do not convert `PARTIAL` or `NOT CLEAR` into completed claims.

> Test note: the recorded 1,728/1,728 checkpoint predates the inherited dirty `lib/authorization.ts` change. A current test attempt exposes a mock-contract mismatch (`auth.api.hasPermission` tests versus `auth.api.getSession` implementation); this was not changed because it is outside the evidence task.

| Area | Status | Proof and actual result | Limitation |
|---|---|---|---|
| Component regression | PASS | Before 1,722/1,728; after 1,728/1,728 across 112/112 files; focused 45/45. | Full result predates final hardening patch. |
| Main Playwright suite | PARTIAL | Full run: 28 PASS, 11 interrupted by Node heap OOM. | Do not claim uninterrupted 39/39. |
| E2E reruns | PASS | `today` + `undo`: 9/9; live Cloudinary attachment: 1/1. | Full uninterrupted run remains incomplete. |
| Board benchmark | PASS | 30/60/100/150 cards, 3 runs: median INP 136/208/304/368 ms; load 817/792/854/1,122 ms. | Local CPU 1x. |
| Realtime benchmark | PASS | 25 clients, 500 events: p95 146.8 ms; 12,500/12,500 deliveries; 20,488 msg/s; RSS +33.6 MB. | Local benchmark. |
| Redis/multi-instance | PASS | Redis proof 3/3; two servers 3101/3102 relayed card A → B without reload. | Local deployment proof, not capacity testing. |
| Preflight | PASS | PostgreSQL, Redis, Cloudinary config, Mailpit, required env all PASS. | Local/test configuration. |
| Backup/restore | PASS | Separate restore DB smoke counts: 10 users, 6 workspaces, 5 boards. | Local rehearsal only. |
| Cloudinary cleanup | PARTIAL | Dry run: 10 resources, 0 referenced, 10 orphan candidates; no deletion. | Manual review before apply. |
| npm audit | NOT CLEAR | Exit 1: 13 vulnerabilities (3 moderate, 7 high, 3 critical). | Frameworks remain pinned at better-auth 1.5.5 / next 16.2.9. |
| User evaluation | PARTIAL | Harness/protocol ready; no participant rows generated. | Real 3–5 participant run required. |

Detailed evidence: `docs/evidence/test-summary.md`, `e2e-summary.md`, `benchmark-summary.md`, `multi-instance-summary.md`, `ops-security-summary.md`, and `USABILITY_STUDY.md`.

Mục đích của file này là đối chiếu các nhận xét cần bổ sung với **mã nguồn và bằng chứng kiểm thử đang có thật trong repository Planora**. Agent viết báo cáo sau có thể dùng nội dung này làm nguồn kỹ thuật; không nên biến các mục `PARTIAL` / `NOT VERIFIED` thành kết luận đã hoàn thành.

## 1. Khắc phục component test còn thất bại — DONE

### Trước sửa
Chạy toàn bộ Vitest trong môi trường kiểm thử sạch, dùng PostgreSQL 16 riêng và `NODE_ENV=test`:

```bash
NODE_ENV=test \
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/planora?schema=public' \
npm test
```

Kết quả trước sửa:
- 112 test files: **111 passed, 1 failed**.
- 1.728 tests: **1.722 passed, 6 failed**.
- Cả 6 lỗi đều thuộc `components/boards/card-detail-sheet.test.tsx`, nhóm close/reopen lifecycle.

Nguyên nhân: test cũ vẫn đòi `router.refresh()` khi đóng Card Detail, trong khi implementation hiện tại cố ý dùng `router.replace(...)` để bỏ `cardId` khỏi URL và tránh stale refresh làm dialog nháy mở lại.

Implementation liên quan:
- `components/boards/card-detail-sheet.tsx` — `handleClose()` dùng `router.replace`.
- `components/boards/card-detail-sheet.test.tsx` — đã sửa expectation để kiểm chứng đúng contract hiện tại: close phải `replace` URL, không `refresh`; refresh chỉ xảy ra khi một autosave thực sự hoàn tất.

### Sau sửa
Focused test:

```text
components/boards/card-detail-sheet.test.tsx
45 passed / 45
```

Full suite:

```text
Test Files  112 passed (112)
Tests       1728 passed (1728)
Duration    61.69s
```

TypeScript check `npx tsc --noEmit --pretty false` cũng PASS.

> Câu có thể dùng trong báo cáo: “Sau khi rà soát các ca component còn thất bại, 6 ca kiểm thử của vòng đời đóng/mở Card Detail được đồng bộ lại với cơ chế điều hướng hiện hành. Kết quả chạy lại toàn bộ bộ kiểm thử đạt 1.728/1.728 ca thành công trên 112/112 tệp kiểm thử.”

## 2. E2E các luồng chính — CODE COVERAGE CÓ, LẦN CHẠY NÀY BỊ BLOCK BỞI MÔI TRƯỜNG

Các spec hiện có đối chiếu trực tiếp với nhận xét:

| Luồng | Bằng chứng trong repo |
| --- | --- |
| Đăng ký + xác minh email | `e2e/auth-invitation-verification.spec.ts`; helper `signUp()` lấy link xác minh thật từ Mailpit |
| Tạo workspace / lời mời | `e2e/auth-invitation-verification.spec.ts`, `e2e/invitation-live-badge.spec.ts` |
| Phân quyền | `tests/server-actions/rbac-matrix.test.ts` (**145 cases**), `lib/realtime/auth.test.ts` (**19 cases**) |
| Kéo thả | `e2e/realtime-card-move.spec.ts`, `e2e/realtime-comment-list-reorder.spec.ts` |
| Đồng bộ hai client | `e2e/realtime-card-create.spec.ts`, `realtime-card-members.spec.ts`, `realtime-label-sync.spec.ts`, `realtime-presence.spec.ts` |
| Reconnect / resync | `e2e/realtime-event-proof.spec.ts` có tripwire cho disconnect/reconnect và resync |
| Automation | `e2e/automation-board-modal.spec.ts`, `e2e/automation-log-retention.spec.ts`; unit/integration ở `lib/automation/*.test.ts` |
| Analytics | `e2e/realtime-event-proof.spec.ts` kiểm chứng `analytics:refresh`; `lib/analytics/engine.test.ts` (**19 cases**) và `tests/analytics-export.test.ts` |

Đã thử chạy toàn bộ Playwright bằng DB sạch:

```bash
PORT=3000 NODE_ENV=test \
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/planora?schema=public' \
npm run test:e2e
```

Playwright discovery thấy **37 E2E tests**, nhưng toàn bộ bị chặn trước khi mở browser vì máy hiện thiếu executable `chromium_headless_shell-1228`. Đây là lỗi dependency môi trường Playwright, không phải 37 lỗi nghiệp vụ; **không ghi “37 test sản phẩm thất bại” vào báo cáo**. Muốn chốt runtime E2E cần cài browser tương ứng rồi chạy lại.

## 3. Mở rộng lifecycle / member / attachment / chart / editor — PARTIAL, bằng chứng hiện có khá rộng

- **Archive / restore / delete:** `e2e/undo-snackbar.spec.ts` có Card archive → Undo/restore, List archive → Undo/restore, race hai client và permanent list deletion; `e2e/demo-rehearsal.spec.ts` cũng đi qua archive/restore. DB race proof: `tests/db-undo-race-proof.test.ts` (**3 cases**) và `tests/db-index-proof.test.ts` (**6 cases**) chạy PASS với PostgreSQL thật.
- **Quản trị thành viên:** `tests/server-actions/members.test.ts` (**22 cases**), `lib/workspace-members.test.ts` (**7 cases**), `components/workspace/members/member-row.test.tsx` (**15 cases**). Chưa có một browser E2E đầy đủ cho chuỗi invite → đổi role → remove/leave, nên chỉ nên ghi là integration/component đã có.
- **Tệp đính kèm / Cloudinary:** `components/boards/card-attachments.test.tsx` (**12 cases**); `tests/server-actions/list-card.test.ts` có đường upload và kiểm tra compensation khi tài nguyên cha bị archive trong lúc upload; log test xác nhận orphan Cloudinary asset được cleanup. Chưa có live-Cloudinary browser E2E.
- **Biểu đồ / Analytics:** `lib/analytics/engine.test.ts` (**19 cases**), `lib/analytics/presentation.test.ts` (**12 cases**), `lead-time-table.test.tsx` (**15 cases**) và CSV export tests.
- **Trình soạn thảo Card Detail:** sau sửa, `card-detail-sheet.test.tsx` có **45/45 cases PASS**, gồm autosave, close/reopen, queue recovery và các trường dữ liệu.

## 4. Benchmark có ngưỡng — PARTIAL, harness đã được làm rõ hơn

Repo vốn đã có:
- `scripts/seed-perf-board.ts`: tạo board có số Card kiểm soát được, mặc định 5 List; chế độ `--rich` thêm label + priority.
- `scripts/perf-measure.ts`: chạy browser thật, đo DnD INP theo các board **30 / 60 / 100 / 150 Card**, mỗi mức 3 lần.

Trong lần xử lý này `scripts/perf-measure.ts` được bổ sung:
- Đo thêm **Board navigation/load time** bằng `PerformanceNavigationTiming.duration`.
- Ngưỡng mặc định rõ ràng:
  - median INP **<= 500 ms**;
  - median Board load **<= 3000 ms**.
- Cho phép override bằng `PERF_INP_MAX_MS` và `PERF_LOAD_MAX_MS`.
- In PASS/FAIL theo từng quy mô Card.
- Trả exit code 1 nếu vượt ngưỡng, để có thể dùng làm quality gate.

Phạm vi benchmark hiện **chưa** bao phủ đủ: số client đồng thời, event rate, CPU/RAM server. Không nên viết rằng toàn bộ benchmark tải đã hoàn thành.

> Câu có thể dùng trong báo cáo: “Bộ benchmark cục bộ được chuẩn hóa theo các board 30, 60, 100 và 150 Card trên 5 List, đo trung vị thời gian tải Board và INP của thao tác kéo thả qua ba lượt chạy; harness đặt ngưỡng mặc định 3.000 ms cho thời gian tải và 500 ms cho INP.”

## 5. Nhiều instance — NOT IMPLEMENTED / ngoài phạm vi hiện tại

Kiến trúc hiện tại là một custom server Next.js + Socket.IO, PostgreSQL là source of truth. Presence hiện nằm trong process. Chưa có bằng chứng cho Redis/Socket.IO adapter, shared presence store hoặc distributed scheduler lock.

Điểm này phù hợp để ghi thành **hướng phát triển** nếu cần scale-out; không nên giả là đã triển khai. Phạm vi đồ án hiện hướng tới nhóm nhỏ và không đặt mục tiêu triển khai đa vùng/quy mô doanh nghiệp.

## 6. Đánh giá người dùng thực tế — NO DIRECT EVIDENCE

Automated test không thay thế usability study. Repo hiện không cung cấp bằng chứng đủ để khẳng định đã đo:
- thời gian hoàn thành tác vụ của người dùng thật;
- lỗi thường gặp theo phiên sử dụng;
- điểm/mức độ dễ hiểu của giao diện.

Nếu báo cáo cần mục này, phải dùng dữ liệu khảo sát/thực nghiệm thật; không suy diễn từ test automation.

## 7. Bảo mật, dịch vụ ngoài, Cloudinary, backup/restore — PARTIAL

Bằng chứng mạnh đang có:
- RBAC matrix: `tests/server-actions/rbac-matrix.test.ts` — **145 cases**.
- Server Action auth/permission/workspace isolation: nhiều suite dưới `tests/server-actions/`.
- Socket room authorization: `lib/realtime/auth.test.ts` — **19 cases**.
- Concurrency / locking / restore race: các DB proof tests chạy trên PostgreSQL thật.
- Email: `lib/email.test.ts` — **15 cases**; có Mailpit cho dev/test và fail-closed production transport.
- Cloudinary: có compensation cleanup trong upload/cover failure paths và component coverage.

Chưa có bằng chứng để tuyên bố:
- kiểm toán bảo mật độc lập bởi bên thứ ba;
- disaster-recovery rehearsal backup → restore hoàn chỉnh;
- live external-service audit trên production.

## 8. Hình thức báo cáo — giao cho agent viết báo cáo rà lại

Đây là việc tài liệu, không phải code. Agent xử lý DOCX nên rà:
- bìa và thông tin đầu trang;
- thuật ngữ Planora / Board / List / Card / workspace có nhất quán;
- cỡ chữ và caption hình/bảng;
- số thứ tự hình/bảng và cross-reference;
- phần chính có khớp Phụ lục D / ma trận kiểm thử hay không;
- số liệu test trong Chương 4 phải cập nhật theo evidence mới, tránh giữ số cũ.

## Lưu ý khi agent khác dùng file này

1. Ưu tiên số liệu **full suite sau sửa: 112/112 files, 1.728/1.728 tests**.
2. Không coi lần E2E hiện tại là lỗi chức năng: nó bị chặn bởi Playwright browser binary chưa được cài.
3. Không tuyên bố multi-instance, user study, independent security audit hoặc backup/restore đã hoàn thành.
4. `docs/TEST_MATRIX.md` là nguồn nền tốt nhưng có vài dòng chưa phản ánh các E2E mới hơn; khi có xung đột, đối chiếu trực tiếp file test hiện tại.
5. Working tree đã có các thay đổi khác từ trước; các thay đổi của đợt xử lý nhận xét này chỉ tập trung vào:
   - `components/boards/card-detail-sheet.test.tsx`
   - `scripts/perf-measure.ts`
   - file evidence này.
