# Kế hoạch PA#2 — harness và quality gate

Hạn nộp: **Thứ Năm 26/11/2026, 22:00**. Endpoint đã chọn: `PUT /groups/{groupId}/members/{userId}/spending-cap`. Xác thực: **Supabase Auth**.

## Trạng thái

| Phase                     | Trạng thái                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P0 · Scaffold + CI        | ✅ Xong (20/11). CI xanh tất cả các job                                                                                          |
| P1 · Bảo vệ `main`        | ✅ Đã bật, 6 check bắt buộc (thêm Gitleaks sau PR #8). Ảnh chụp `docs/pa2/branch-protection.png`                                 |
| A1 · Contract             | ✅ Xong (21/11), PR #2. Quy tắc body tối đa 16 KB thêm ở PR #4 (22/11)                                                           |
| A2 · Contract test        | ✅ Xong (22/11), PR #6, commit `6910681`. Contract tests đỏ (run 45323832020), merge bị chặn, ảnh chụp `docs/pa2/blocked-pr.png` |
| A3 · Implementation       | ✅ Xong (24/11), PR #6: sửa test `a3ebcb6` (đỏ, run 45408728368), rồi implementation `29305d8` (xanh, run 45413730945). Đã merge |
| B1 · Harness              | ✅ Xong (22/11), PR #3. Các bản sửa sau review ở PR #5 (22/11)                                                                   |
| B2 · Quy tắc + quyền      | ✅ Xong (24/11), PR #7                                                                                                           |
| B3 · Gitleaks             | ✅ Xong (24/11), PR #8. Check bắt buộc trên `main`                                                                               |
| B4 · Sự cố thật           | ✅ Xong (24/11), PR #9                                                                                                           |
| A4 · Cố tình phá contract | ✅ Xong (24/11), PR #11 (`0ad6241`). Contract tests đỏ (run 45420401170), đóng không merge                                       |
| D · Nộp bài               | Đang làm: PR `docs/pa2-handin` thêm PA2.md, SELF_ASSESSMENT_REPORT.md và ảnh chụp. Sau đó fresh clone, tag, zip                  |

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

- Bắt buộc phải qua PR. Bắt buộc 6 check: Lint, Format check, Type check, Tests, Contract tests, và Gitleaks (từ PR #8). Nhánh phải cập nhật với `main` trước khi merge. Không ai được bypass, kể cả admin. Cấm force push.
- Settings → General: chỉ cho phép **merge commit**, tắt squash và rebase. Nhờ vậy commit làm PR chuyển xanh còn nằm trong lịch sử của `main`.
- **Còn thiếu:** ảnh chụp toàn trang chỉnh sửa rule của `main`. Ảnh cần thấy pattern `main`, 6 check bắt buộc, ô "Do not allow bypassing", và force push đang tắt. Lưu vào `docs/pa2/branch-protection.png` trong repo, commit qua PR.
- Từ giờ **mọi thay đổi đều đi qua PR**. Không bao giờ force push hay rebase lại lịch sử `main`, vì lịch sử làm lại không được tính làm bằng chứng cho tiêu chí 4 và 6.

### Sau P1: hai người làm song song

A và B là track, không phải vai trò. Ai cũng có thể nhận track nào, vì cả hai đều có quyền ghi. Chia theo người sẽ giải thích phần code nào ở buổi vấn đáp PA#6, và commit bằng tài khoản của chính mình để lịch sử khớp với `OWNERS.md`. File đó không thuộc PA#2: nó nộp cho PA#6 (Chủ Nhật 27/12, 22:00), ghi ai làm phần nào và nhóm làm thêm gì ngoài brief (tiêu chí B5 của PA#6).

| Track A: contract                                                                                                                                                             | Track B: harness                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** Viết `docs/contract/spending-cap.md` theo mẫu `contract-example.md` (xem nội dung bên dưới). Merge bằng một PR chỉ có tài liệu.                                        | **B1** Prisma models `User` (`id` = `sub` của Supabase), `Group` (`totalVnd`), `GroupMember` (`capVnd`), `Plan` tối giản, kèm migration. Thêm **guard xác thực Supabase** (xem mục riêng). Thêm global filter để mọi lỗi trả về `application/problem+json`. Thêm test helper khởi động app và reset DB. **A2 cần B1 xong trước.** |
| **A2** Contract test, commit riêng, PR riêng. PR sẽ **đỏ** vì endpoint chưa có: đây là PR bị chặn. Chụp màn hình nút merge đang bị khoá.                                      | **B2** `CLAUDE.md` gồm 4 phần: stack, commands, conventions, never. Ghi quyền của assistant theo 3 mức: allowed, ask first, never. Áp các quyền đó trong `.claude/settings.json` (allow, ask, deny).                                                                                                                              |
| **A3** Implementation, commit riêng **trên cùng PR đó**. CI chuyển xanh: đây là commit làm PR xanh. Merge. **Không** sửa test và code trong cùng một commit.                  | **B3** Thêm job `gitleaks` vào CI, quét toàn bộ lịch sử, làm bằng chứng không có secret. Đặt nó làm check bắt buộc.                                                                                                                                                                                                               |
| **A4** PR cố tình phá contract, ví dụ cho phép sửa cap của thành viên khác, hoặc trả lỗi JSON thường thay vì problem details. CI đỏ. Đóng PR **không merge** và giữ lại link. | **B4** Gom các sự cố thật cho `CLAUDE.md`: phải có ít nhất 2 dòng truy được về một entry trong AI-LOG hoặc một commit. Ví dụ: corepack không còn đi kèm Node, TypeScript 7 bị typescript-eslint từ chối, `.swcrc` làm Vitest không load được, lint đã pass khi còn warning.                                                       |

### Các bản sửa sau A1 và B1 (review ngày 22/11)

Đã xong:

- **Fix 1** ✅ PR #5: `.env.example` liệt kê `SUPABASE_JWKS_JSON`. Chỉ test đặt biến này; để trống thì API lấy khoá ký từ `SUPABASE_URL`.
- **Fix 2** ✅ PR #4: mục 5 của contract ghi body lớn hơn 16 KB là `400 validation` với pointer `""`. Đây là bước 4 mới, sau 401/404/403 và trước khi parse JSON.
- **Fix 3, phần hạ tầng** ✅ PR #5: tắt body parser có sẵn của Nest. Nó chạy ở middleware, trước guard, nên body JSON hỏng trả `400` trước cả `401`/`404`/`403`.
  - `apps/api/src/app.options.ts` (`{ bodyParser: false }`) được dùng ở cả `main.ts` và `test/helpers/test-app.ts`, để test chạy API y hệt production.
  - `readJsonBody(req)` trong `apps/api/src/http/read-json-body.ts` đọc body theo đúng thứ tự của contract: quá 16 KB là `validation`; body `application/json` không rỗng nhưng không phải JSON hợp lệ là `invalid-json`; body rỗng, sai content type, hoặc JSON không phải object là `validation` với pointer `""`.
  - Đã bỏ nhánh `entity.parse.failed` trong filter, và có một contract test của harness kiểm tra JSON hỏng gửi tới một path `/v1` không tồn tại trả `404`.
- **Bỏ:** ánh xạ lỗi của body-parser (`entity.too.large` và các lỗi tương tự) sang `validation` trong filter. Khi đã tắt parser, các lỗi đó không còn xảy ra.

Đã xong trong **A3** (PR #6, commit `29305d8`):

- **Fix 3, phần handler** ✅. Kiểm tra đúng thứ tự của contract: guard (`401`) → `groupId` là UUID, nhóm tồn tại và người gọi là thành viên (`404`) → `userId` (viết thường) là id của chính người gọi (`403`) → `readJsonBody(req)` → quy tắc của `capVnd` (`validation`, pointer `/capVnd`) → vượt tổng của nhóm (`422`) → lưu và đánh dấu plan trong một transaction. Không bao giờ đọc body trước khi kiểm tra 404 và 403.
- **Fix 4: đổi `BigInt` thành số thường trong response** ✅. `capVnd`, `totalVnd` và `highestMemberSpendVnd` là `BigInt` của Prisma, mà `res.json` ném lỗi khi gặp `BigInt`, nên endpoint sẽ trả `500`. Đổi bằng `Number(...)`, an toàn vì contract giới hạn giá trị ở 2^53−1. Áp dụng cả cho `groupTotalVnd` trong body problem `422`. Gửi `updatedAt` bằng `.toISOString()` và id ở dạng chữ thường.

### Xác thực bằng Supabase (thay cho JWT tự ký)

- Frontend đăng nhập qua Supabase Auth. Mỗi request gửi `Authorization: Bearer <access token của Supabase>`.
- Backend **chỉ xác minh token**: chữ ký theo JWKS của project (không dùng JWT secret HS256 kiểu cũ, nên API không giữ secret nào của Supabase), `exp`, `aud = authenticated`, `iss`. Sau đó lấy `sub` làm user id. Backend không bao giờ nhận user id từ body hay query.
- Contract test **không gọi Supabase thật**. Test tự tạo một cặp khoá cục bộ, tự ký token, và trỏ guard vào khoá đó qua biến môi trường. Có test cho cả token hết hạn, sai chữ ký và thiếu header.
- Cập nhật `.env.example`: `SUPABASE_URL` để lấy JWKS và kiểm tra `iss`, cùng `SUPABASE_JWKS_JSON` chỉ dùng cho test ✅ (phía api), `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (phía web, công khai được). **Service role key không bao giờ được ở web.** Test `no-server-secrets` đọc danh sách biến từ `.env.example`, nên nó tự bảo vệ mọi biến không có tiền tố `NEXT_PUBLIC_`.

### Contract cần ghi gì (A1) — ✅ xong, `docs/contract/spending-cap.md`

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
- **Kích thước body:** tối đa 16 KB; lớn hơn là `validation` với pointer `""` (thêm ở PR #4).
- **Idempotent:** PUT gửi lặp với cùng body trả về cùng một kết quả.
- **Phiên bản:** trong `/v1` chỉ được thay đổi kiểu thêm vào, như mục 5 của file mẫu.
- **Ghi đè đồng thời (tuỳ chọn):** `If-Match`, trả `412` khi phiên bản không khớp. Không có trong v1: chỉ chính thành viên đổi được cap của mình, nên PUT đến sau cùng thắng.

### Contract test cần có (A2)

- Mỗi problem type có một test.
- Quy tắc sở hữu, cả hai chiều: cap của thành viên khác, và người ngoài nhóm.
- 401 cho thiếu token, token hết hạn và token sai chữ ký.
- PUT gửi lặp lại.
- Kiểm tra `Content-Type` và hình dạng của body problem, **không chỉ** status code.
- Thứ tự kiểm tra, khi body đã được đọc sau guard:
  - body hỏng và không có token: `401`, không phải `400`;
  - body hỏng từ người ngoài nhóm: `404`, không phải `400`.
- Quy tắc về body, mỗi trường hợp là `validation` với pointer `""`: body rỗng, body gửi dạng `text/plain`, một mảng JSON, body lớn hơn 16 KB.
- `"capVnd": "600000"` (chuỗi): `validation` với pointer `/capVnd`.
- Một `capVnd` lớn (ví dụ 9007199254740991, với tổng của nhóm ít nhất bằng chừng đó) trả về dưới dạng số JSON thường. Test này giữ Fix 4.

### D · Nộp bài (Thứ Tư đến Thứ Năm, sau A4)

- **PA2.md** gồm link tới:
  - repo
  - ảnh chụp bảo vệ nhánh
  - PR bị chặn (A2)
  - commit làm PR xanh (A3)
  - CI run của tag
  - PR phá contract (A4)
- **README:** link tới file contract và Supabase trong bảng stack đã có. Kiểm tra lại xem còn đúng không.
- **AI-LOG:** mỗi phần có một entry với Changed / Rejected thật, viết bằng lời của nhóm.
- **SELF_ASSESSMENT_REPORT.md:** dùng template trong `docs/templates/`. Mỗi tiêu chí một dòng, kèm link bằng chứng. Chấm điểm trung thực: lệch quá ±10 điểm sẽ bị trừ.
- Tag commit merge cuối cùng trên `main`: `git tag pa2 && git push origin pa2`. Đợi CI của tag xanh.
- Clone mới và làm theo README từ đầu, đảm bảo mọi check đều xanh.
- Zip repo kèm `.git`, đặt tên `23127228-23127395_<tổng điểm>.zip`.

## Lịch đề xuất

| Ngày          | Việc                                                    |
| ------------- | ------------------------------------------------------- |
| T6 20 – T7 21 | ✅ P0, ✅ P1. Bắt đầu nháp A1, vì nó chỉ là tài liệu    |
| CN 22 – T2 23 | ✅ A1, ✅ B1, ✅ các bản sửa sau review (PR #4, #5). B2 |
| T3 24         | A2 (đỏ), rồi A3 (xanh), merge. B3                       |
| T4 25         | A4, B4, nháp tài liệu                                   |
| T5 26         | Clone mới để kiểm tra, tag, zip. Chừa nửa ngày dự phòng |

**Rủi ro lớn nhất:** nếu A2 trễ, cả chuỗi A2 → A3 → A4 dồn sang Thứ Năm. B1 đã xong, nên có thể bắt đầu A2 ngay.
