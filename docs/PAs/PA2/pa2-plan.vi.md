# Kế hoạch PA#2 — harness và quality gate

Hạn nộp: **Thứ Năm 26/11/2026, 22:00**. Endpoint đã chọn: `PUT /groups/{groupId}/members/{userId}/spending-cap`. Xác thực: **Supabase Auth**.

## Trạng thái

| Phase              | Trạng thái                                                     |
| ------------------ | -------------------------------------------------------------- |
| P0 · Scaffold + CI | ✅ Xong (20/11). CI xanh cả 5 job                              |
| P1 · Bảo vệ `main` | ✅ Đã bật, 5 check bắt buộc. Còn: ảnh chụp màn hình cho PA2.md |
| A1 · Contract      | ✅ Xong (21/11), PR #2                                         |
| B1 · Harness       | ✅ Xong (22/11), PR #3                                         |
| A2–A4, B2–B4       | Chưa bắt đầu                                                   |
| D · Nộp bài        | Chưa bắt đầu                                                   |

## Sơ đồ phụ thuộc

```
P0 scaffold + CI ──► P1 bảo vệ main ──┬─► A1 contract ──► A2 contract test (PR đỏ) ──► A3 implementation (xanh) ──► A4 PR cố tình phá contract
                                      │                     ▲                          ▲
                                      └─► B1 Prisma schema + Supabase auth guard + test harness
                                      └─► B2 CLAUDE.md + .claude/settings.json + job gitleaks     (độc lập)
                                                                                tất cả ──► D tài liệu + tag pa2 + zip
```

## Các phase

### P0 · Scaffold — ✅ xong

- pnpm workspace gồm `apps/api` (NestJS 12, Prisma 7.10) và `apps/web` (Next.js 16). Thêm ESLint (`--max-warnings 0`), Prettier và Vitest.
- Mỗi check là một lệnh ở root: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:contract`. Thêm `pnpm db:migrate` và `pnpm dev`.
- CI có một job cho mỗi check, chạy đúng lệnh trong README. Job contract có một Postgres dùng một lần. CI chạy khi có PR vào `main`, khi push lên `main` và khi push tag `pa*`.
- Đã cố tình làm hỏng từng check một lần, và lần nào cũng đỏ.

### P1 · Bảo vệ `main` — ✅ đã bật

- Bắt buộc phải qua PR. Bắt buộc 5 check: Lint, Format check, Type check, Tests, Contract tests. Nhánh phải cập nhật với `main` trước khi merge. Không ai được bypass, kể cả admin. Cấm force push.
- Settings → General: chỉ cho phép **merge commit**, tắt squash và rebase. Nhờ vậy commit làm PR chuyển xanh còn nằm trong lịch sử của `main`.
- **Còn thiếu:** ảnh chụp toàn trang chỉnh sửa rule của `main`. Ảnh cần thấy pattern `main`, 5 check bắt buộc, ô "Do not allow bypassing", và force push đang tắt. Lưu vào `docs/pa2/branch-protection.png` trong repo, commit qua PR.
- Từ giờ **mọi thay đổi đều đi qua PR**. Không bao giờ force push hay rebase lại lịch sử `main`, vì lịch sử làm lại không được tính làm bằng chứng cho tiêu chí 4 và 6.

### Sau P1: hai người làm song song

| Track A (người 1): contract                                                                                                                                                   | Track B (người 2): harness                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** Viết `docs/contract/spending-cap.md` theo mẫu `contract-example.md` (xem nội dung bên dưới). Merge bằng một PR chỉ có tài liệu.                                        | **B1** Prisma models `User` (`id` = `sub` của Supabase), `Group` (`totalVnd`), `GroupMember` (`capVnd`), `Plan` tối giản, kèm migration. Thêm **guard xác thực Supabase** (xem mục riêng). Thêm global filter để mọi lỗi trả về `application/problem+json`. Thêm test helper khởi động app và reset DB. **A2 cần B1 xong trước.** |
| **A2** Contract test, commit riêng, PR riêng. PR sẽ **đỏ** vì endpoint chưa có: đây là PR bị chặn. Chụp màn hình nút merge đang bị khoá.                                      | **B2** `CLAUDE.md` gồm 4 phần: stack, commands, conventions, never. Ghi quyền của assistant theo 3 mức: allowed, ask first, never. Áp các quyền đó trong `.claude/settings.json` (allow, ask, deny).                                                                                                                              |
| **A3** Implementation, commit riêng **trên cùng PR đó**. CI chuyển xanh: đây là commit làm PR xanh. Merge. **Không** sửa test và code trong cùng một commit.                  | **B3** Thêm job `gitleaks` vào CI, quét toàn bộ lịch sử, làm bằng chứng không có secret. Đặt nó làm check bắt buộc.                                                                                                                                                                                                               |
| **A4** PR cố tình phá contract, ví dụ cho phép sửa cap của thành viên khác, hoặc trả lỗi JSON thường thay vì problem details. CI đỏ. Đóng PR **không merge** và giữ lại link. | **B4** Gom các sự cố thật cho `CLAUDE.md`: phải có ít nhất 2 dòng truy được về một entry trong AI-LOG hoặc một commit. Ví dụ: corepack không còn đi kèm Node, TypeScript 7 bị typescript-eslint từ chối, `.swcrc` làm Vitest không load được, lint đã pass khi còn warning.                                                       |

### Xác thực bằng Supabase (thay cho JWT tự ký)

- Frontend đăng nhập qua Supabase Auth. Mỗi request gửi `Authorization: Bearer <access token của Supabase>`.
- Backend **chỉ xác minh token**: chữ ký (JWKS của project, hoặc JWT secret nếu project dùng HS256 kiểu cũ), `exp`, `aud = authenticated`, `iss`. Sau đó lấy `sub` làm user id. Backend không bao giờ nhận user id từ body hay query.
- Contract test **không gọi Supabase thật**. Test tự tạo một cặp khoá cục bộ, tự ký token, và trỏ guard vào khoá đó qua biến môi trường. Có test cho cả token hết hạn, sai chữ ký và thiếu header.
- Cập nhật `.env.example`: `SUPABASE_URL` và key/JWKS dùng để xác minh (phía api), `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (phía web, công khai được). **Service role key không bao giờ được ở web.** Test `no-server-secrets` đọc danh sách biến từ `.env.example`, nên nó tự bảo vệ mọi biến không có tiền tố `NEXT_PUBLIC_`.

### Contract cần ghi gì (A1)

- **Ai được gọi:** người đã đăng nhập (token Supabase hợp lệ), là thành viên của nhóm, và chỉ được sửa `userId` của **chính mình**.
  - Sửa cap của thành viên khác: `403 forbidden`.
  - Người ngoài nhóm: `404 not-found`, để không lộ nhóm có tồn tại hay không.
  - Không có token, hoặc token sai hay hết hạn: `401 unauthenticated`.
- **Request** `{ "capVnd": integer }`, với các quy tắc:
  - Từ 0 đến `totalVnd` của nhóm.
  - Số nguyên, đơn vị đồng.
  - Ghi rõ `null` có nghĩa là bỏ cap hay không.
- **Response** `200`: cap của thành viên, `affectedPlans[]` và `updatedAt`.
- **Plan đã lưu không còn vừa cap mới:** plan không bị sửa. Plan được đánh dấu `needsReview` và được liệt kê trong `affectedPlans`, và không được chia sẻ lại cho tới khi qua validator.
- **Các problem type**, mỗi type kèm status:
  - `invalid-json` (400)
  - `validation` (400, `errors[]` có JSON pointer)
  - `unauthenticated` (401)
  - `forbidden` (403)
  - `not-found` (404)
  - `cap-above-group-total` (422)
  - `internal` (500)
- **Idempotent:** PUT gửi lặp với cùng body trả về cùng một kết quả.
- **Phiên bản:** trong `/v1` chỉ được thay đổi kiểu thêm vào, như mục 5 của file mẫu.
- **Ghi đè đồng thời (tuỳ chọn):** `If-Match`, trả `412` khi phiên bản không khớp.

### Contract test cần có (A2)

- Mỗi problem type có một test.
- Quy tắc sở hữu, cả hai chiều: cap của thành viên khác, và người ngoài nhóm.
- 401 cho thiếu token, token hết hạn và token sai chữ ký.
- PUT gửi lặp lại.
- Kiểm tra `Content-Type` và hình dạng của body problem, **không chỉ** status code.

### D · Nộp bài (Thứ Tư đến Thứ Năm, sau A4)

- **PA2.md** gồm link tới:
  - repo
  - ảnh chụp bảo vệ nhánh
  - PR bị chặn (A2)
  - commit làm PR xanh (A3)
  - CI run của tag
  - PR phá contract (A4)
- **README:** điền link tới file contract (hiện vẫn là TODO). Thêm Supabase vào bảng stack.
- **AI-LOG:** mỗi phần có một entry với Changed / Rejected thật, viết bằng lời của nhóm.
- **SELF_ASSESSMENT_REPORT.md:** dùng template trong `docs/templates/`. Mỗi tiêu chí một dòng, kèm link bằng chứng. Chấm điểm trung thực: lệch quá ±10 điểm sẽ bị trừ.
- Tag commit merge cuối cùng trên `main`: `git tag pa2 && git push origin pa2`. Đợi CI của tag xanh.
- Clone mới và làm theo README từ đầu, đảm bảo mọi check đều xanh.
- Zip repo kèm `.git`, đặt tên `23127228-23127395_<tổng điểm>.zip`.

## Lịch đề xuất

| Ngày          | Việc                                                           |
| ------------- | -------------------------------------------------------------- |
| T6 20 – T7 21 | ✅ P0, ✅ P1. Bắt đầu nháp A1, vì nó chỉ là tài liệu           |
| CN 22 – T2 23 | B1 (có Supabase guard) và B2 song song. Hoàn thành và merge A1 |
| T3 24         | A2 (đỏ), rồi A3 (xanh), merge. B3                              |
| T4 25         | A4, B4, nháp tài liệu                                          |
| T5 26         | Clone mới để kiểm tra, tag, zip. Chừa nửa ngày dự phòng        |

**Rủi ro lớn nhất:** nếu A2 trễ, cả chuỗi A2 → A3 → A4 dồn sang Thứ Năm. B1 giờ nặng hơn vì có Supabase guard. Nếu B1 trễ, viết A2 trên một module stub để PR đỏ có sớm.
