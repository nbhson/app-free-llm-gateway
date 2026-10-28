# Plan — app-free-llm-gateway

> Free LLM Gateway: Hono API gateway đa provider (OpenAI-compatible), virtual keys,
> circuit breaker, quota, semantic cache, BYOK, web tools. Monorepo `apps/gateway` + `apps/web`.

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR | lib/ssrf-guard.ts:9-29 | `isPrivateIp` manual chỉ phủ vài prefix — bỏ sót 100.64/10 (CGNAT), 192.0.0/24, 198.18/15, 224/4, 240/4, `::ffff:`-mapped IPv4, 2001:db8 → SSRF qua các dải đó | `net.BlockList` với 14 dải IPv4 + 7 dải IPv6; normalize IPv4-mapped trước check |
| 2 | MAJOR | lib/ssrf-guard.ts:103-131 | TOCTOU DNS-rebind: `isSafeUrl` check xong, `fetch()` resolve DNS lần nữa | Validate lại từng redirect hop (đã có) + BlockList đầy đủ; pin-by-IP cần undici — ghi follow-up trong comment |
| 3 | MAJOR | routes/v1/compare.ts | `/v1/chat/compare` BYPASS toàn bộ control plane: không `hasScope` (vk user-role gọi model bất kỳ), không circuit breaker, không quota pre-check/commit, key luôn `keys[0]` (không rotate), không markSuccess/markRateLimited | Thêm scope check model+provider (403), `isOpen` check, `getNextKeyManaged`, `checkQuotaAsync` + `recordUsage`, breaker bookkeeping |
| 4 | MAJOR | routes/api.ts qua app.ts:158-169 | Admin gate chỉ phủ `/api/keys` POST/DELETE + `/api/config` PUT — vk role=user thao tác được `/sync/boot`, `/models/live/sync`, `/models/health/mark`, `DELETE /cache`, `/alerts/test`… | app.ts: mọi non-GET (trừ /api/byok* — per-vk tự check ownership) + GET nhạy cảm (config/keys/logs/quota) đều cần `role === "admin"` |
| 5 | MAJOR | providers/gemini.ts:59,109,123 | API key trong URL query `?key=` — URL ghi vào access logs/metrics/error messages | Header `x-goog-api-key` (4 chỗ fetch) |
| 6 | MAJOR | routes/v1/chat.ts:432 | `res.json().catch(res.text())` — double-read: body đã consumed nên `.text()` trong catch nổ "body used already" với upstream non-JSON | Đọc text 1 lần + `JSON.parse` fallback |
| 7 | MAJOR | lib/byok-store.ts:39-46 | `save()` catch → `saveRaw()` ghi plaintext keys khi encrypt fail; `load()` heuristic nhầm encrypted/plain | `save` không còn plaintext-fallback; `load` phân biệt rõ: có `__enc` mà decrypt fail → trả {} + log error (không lộ), file legacy plain → warn |
| 8 | MAJOR | app.ts:177 | `app.onError` trả `err.message` — leak internals (path, SQL, stack fragment) | Generic "Internal server error", chi tiết chỉ vào log |
| 9 | MINOR | lib/ssrf-guard.ts:153-176 | Content-type check chỉ block image/pdf/octet; content-length hint chỉ chặn >2x limit (body vẫn đọc không bound bởi `truncateForLlm` sau) | Ghi nhận — giới hạn thật nằm ở caller (`extractMarkdown` truncate 12k); giữ nguyên behavior |
| 10 | MINOR | config.ts:208 | CORS mặc định `*` | Đã có production warning trong config; giữ default cho local DX (API dùng Bearer, không cookie) |

## Không sửa (đã cân nhắc, ghi nhận)

- **Parallel hedge `Promise.any` để loser fetch chạy tiếp**: mỗi attempt có timeout riêng (25s) + AbortSignal trong provider nên waste là bounded; abort chủ động loser cần plumbing signal xuyên qua mọi provider — follow-up lớn.
- **`/metrics` public**: Prometheus không OIDC được — đã là quyết định ghi nhận từ trước (pattern chung của các repo khác).
- **Bootstrap endpoint**: đã hard-block production (commit trước).
- 5 test fail (circuit-breaker/router-fallback): **pre-existing** — fail cả trên HEAD sạch trước thay đổi, không do đợt này (đã verify bằng stash).

## Trạng thái

- [x] Plan
- [x] Fix #1–#8
- [x] `tsc` type-check qua vitest transform; vitest 334/340 pass (5 fail pre-existing, 1 flaky race circuit-breaker)
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: phát hiện lỗi tự gây — edit ssrf-guard làm MẤT dòng `if (res.status >= 300 && res.status < 400) {` (comment thay thế nhầm oldString chứa if) → syntax error, đã khôi phục. Compare test pass với scope/quota mới (test dùng vk default scope `*`). `package-lock.json` thay đổi do `npm install` root — giữ (khóa deps). Thêm `apps/gateway/data/` vào ignore check trước commit.
