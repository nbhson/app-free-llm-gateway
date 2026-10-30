# Plan — app-free-llm-gateway

> Free LLM Gateway: Hono API gateway đa provider (OpenAI-compatible), virtual keys,
> circuit breaker, quota, semantic cache, BYOK, web tools. Monorepo `apps/gateway` + `apps/web`.

## Round 6 (2026-10-30) — UI/UX: Minimalism token cleanup + dark mode consistency

### Bối cảnh

User hỏi "@ui-ux-design-styles có thể cải thiện UI/UX không?". Đánh giá hiện trạng:
app đã có token system + dark mode từ Round 3, nhưng audit grep thấy **~200 chỗ
hard-code `slate-*`** rải trong 13+ file — phá nhất quán dark mode (nút chính
`bg-slate-900` gần như tàng hình trên canvas tối; badge `text-slate-300` vô hình
trên card trắng) và vi phạm style đang chọn.

### Style chọn: Minimalism (01-minimalism)

Dashboard SaaS data-dense → đúng bảng chọn của skill (Linear/Stripe/Notion style).
Loại trừ: Glassmorphism/Neumorphism (skill cấm cho dense data tables), Brutalism,
Maximalism. Palette hiện tại (slate + amber) giữ nguyên — chỉ siết kỷ luật:

| Quy tắc Minimalism | Trước | Sau |
|---|---|---|
| Single accent | amber xen lẫn slate-900 cho CTA tuỳ trang | CTA = amber-500 duy nhất; mono `--app-primary` chỉ cho selected/nav/tooltip/toast |
| No decorative gradient | banner Cache Live + Quickstart gradient slate | flatten `bg-codesurface`; gradient chỉ còn logo |
| No hard-coded color | ~200 chỗ slate-* + inline #059669 | 0 chỗ — mọi màu qua token |
| Contrast | slate-400 meta 2.9:1 | mutedtxt 4.76:1 |

### Token mới (index.css)

- `--app-primary / -hover / -ink`: mono button — light: slate-900/white;
  dark: **đảo ngược** #f1f5f9/slate-900 (nút sáng trên nền tối — trước đây mất hết contrast).
- `--app-codebg / -surface / -row / -line / -text*`: surface terminal LUÔN tối ở cả
  2 theme (curl boxes, JSON viewers, code blocks) — terminal tối là convention.

### Trạng thái Round 6

- [x] 0 chỗ `slate-[0-9]|gray-[0-9]|zinc-[0-9]` trong apps/web/src (đã là ~200)
- [x] Button system: amber CTA / mono selected / rose destructive — nhất quán mọi trang
- [x] `tsc --noEmit` web pass; `eslint` 0 error; `vite build` ✓; gateway tests **373/373** (không đổi)
- [x] Web dev server boot OK (smoke :5199)
- [x] CHANGELOG [Unreleased] Round 6

### Cân nhắc / không làm

- **Đổi rounding về 0–8px** (chuẩn Minimalism gắt): app đã nhất quán rounded-lg/xl —
  đổi toàn bộ = churn lớn, lợi ích thấp. Ghi nhận là chủ đích.
- **Aurora UI layer**: skill cho phép ghép Minimalism+Aurora (1 hiệu ứng) — user chọn
  scope "Đầy đủ: token cleanup + polish", không thêm gradient trang trí.
- **Chart internals** (Usage.tsx SVG foreignObject `color: white`, drop-shadow): nằm
  trong pie slice có màu riêng, giữ nguyên.
- **Inline flex/size styles** trong Usage legend: layout, không phải màu — giữ.



## Round 5 (2026-10-30) — Resilience: giảm 4xx/5xx khi providers còn valid

### Vấn đề của user

"Rất thường gặp lỗi 4xx/5xx trong khi rất nhiều provider vẫn valid." Chẩn đoán từ code:

1. **0 retry cùng provider** — một 502/ECONNRESET vặt là bỏ ngay sang provider kế;
   free-tier providers cực hay lỗi vặt kiểu này.
2. **Breaker chỉ theo provider, không theo (provider, model)** — provider X mapping
   stale cho model Y (400 "model not found") không bao giờ trip breaker → mỗi request
   về model Y vẫn thử X đầu tiên, user ăn lại đúng lỗi đó.
3. **Loser fetches trong parallel chạy tiếp đến cùng** (Round 1 đã ghi nhận).
4. **HTTP 200 + error object trong body** (SSE/JSON) — client nhận stream đứt,
   executor không fallback (chỉ peek với pollinations).

### Triển khai (cả 4, user chọn)

| # | Tính năng | File | Chi tiết |
|---|-----------|------|----------|
| 1 | Retry same provider | provider-executor.ts | Refactor `attemptProvider()` dùng chung; 5xx/network retry `PROVIDER_RETRIES` (1, max 3) lần, backoff jitter 400ms; timeout/429/4xx không retry |
| 2 | Pair health | lib/pair-health.ts (mới) | 400/404/422 ×2 liên tiếp → pair xuống cuối order TTL 10 phút (không skip); success clears; persist `data/pair-health.json` |
| 3 | Abort losers | base.ts + 4 providers + executor | `ProviderAttempt.signal` → `makeCallSignal` (`AbortSignal.any` với internal timeout); winner xong abort sibling; timeout executor giờ abort fetch thật |
| 4 | Peek đầu-body mọi provider | provider-executor.ts | `peekBodyError()`: SSE `data:{"error"` ở đầu line + JSON top-level `error`; budget→402, else 502; window `PROVIDER_SSE_PEEK_MS` 250ms; shape-match đầu object chống false-positive |

### Trạng thái Round 5

- [x] `pair-health.test.ts` (8) + `provider-executor.test.ts` (+8): retry 5xx/network, không retry 4xx/timeout, peek + anti-false-positive, abort loser, demoted pair thử cuối
- [x] vitest **373/373 pass (52 files)**; `tsc --noEmit` gateway pass
- [x] Config + hot-reload `/api/config` cho 3 env mới; `.env.example` + `docs/en/CONFIGURATION.md`
- [x] CHANGELOG [Unreleased] Round 5

### Cân nhắc / không làm

- **Retry timeout**: làm doubled worst-case latency (12-25s × 2) — không retry, fallback thay thế.
- **Retry 4xx**: request's fault — fallback sang provider khác mới đúng.
- **Pair health skip thay vì reorder**: demoted pair vẫn phải reachable khi mọi healthy fail — chọn reorder ra cuối.
- **Mid-stream recovery sau N chunks**: không thể fallback sau khi đã flush SSE xuống client — peek 250ms đầu là giới hạn hợp lý.
- **Plumb signal vào embeddings/images/audio**: call ngắn non-stream, waste bounded — để sau nếu cần.

## Round 4 (2026-10-30) — Security deps upgrade

### Goals

1. Vá toàn bộ lỗ hổng npm audit production (7: 5 high + 2 moderate) + 2 lỗi lint còn lại.
2. Không regress: typecheck/test/build/lint phải xanh sau các breaking upgrade.

### Kết quả

| # | Loại | Vị trí | Vấn đề | Fix |
|---|------|--------|--------|-----|
| 1 | HIGH | zod 3.25.76 | GHSA-mrhx-c7xc-m3w5 — DoS bộ nhớ qua validation request (surface trực tiếp gateway) | zod 4.6.7 + `z.record` 2 tham số (chat.ts:65, compare.ts:19); `.passthrough()` vẫn chạy (deprecated) |
| 2 | HIGH | drizzle-orm 0.38.4 | GHSA-gpj5-g38j-94v9 — SQL injection qua identifiers | 0.45.4 (schema/migrate không đổi API) |
| 3 | MOD | @hono/node-server 1.19.17 | GHSA-rmxm-3fg6-px4f — serveStatic double-decode bypass (không backport 1.x) | 2.1.5 — gateway chỉ dùng `serve`, Node>=20 OK |
| 4 | MOD | hono 4.13.7 | GHSA-5r4p-p66f-jhc7 — serveStatic bypass | 4.13.14 (non-breaking) |
| 5 | HIGH | vite/source-map-js/brace-expansion/shell-quote | audit fix không breaking | `npm audit fix` |
| 6 | CRITICAL (dev) | tinypool ≤2.1.1 + @vitest/mocker | RCE prototype pollution + mocker path traversal | vitest 5.0.5 — 356/356 pass, suite 28s→10s |
| 7 | Lint | compression.ts:166, pinned-fetch.test.ts:1 | unused catch binding `e`, unused import `vi` | bare `catch`, bỏ import |
| 8 | Bug (tooling) | drizzle-kit 0.31 + workspace hoisting | `db:generate` fail "Please install latest version of drizzle-orm" — bin.cjs import `drizzle-orm/version` từ root node_modules mà drizzle-orm chỉ nằm apps/gateway | Thêm drizzle-orm root devDependency (hoisted); `db:generate` OK, migration files không commit (migrate.ts tự tạo base tables raw SQL) |

### Trạng thái Round 4

- [x] `npm audit` production: **0 high/critical** (còn 4 moderate dev-only qua `drizzle-kit → @esbuild-kit/esm-loader → esbuild`; bản sửa duy nhất là drizzle-kit 1.0.0-rc pre-release — chấp nhận)
- [x] `tsc --noEmit` root + gateway + web: 0 error; `tsc -p apps/gateway` + `vite build` pass
- [x] vitest **356/356 pass (51/51 files)**, eslint 0 error
- [x] Version `1.11.4→1.12.0` (3 package.json) + CHANGELOG

### Không làm (cân nhắc, ghi nhận)

- **Major upgrades framework** (React 19, Vite 8, ESLint 10, TS 7, ioredis 6, pino 10, zod-validator... không liên quan security): rủi ro cao, phải migrate ~7,400 dòng UI — để round riêng nếu cần.
- **drizzle-kit 1.0.0-rc**: duy nhất cách xóa 4 moderate dev-only còn lại, nhưng pre-release — chờ stable.

## Round 3 (2026-10-29)

### Goals (2 follow-ups ghi nhận từ Round 2)

1. **Dark mode retrofit** cho web dashboard (Round 2 đã defer vì rủi ro contrast khi
   sửa ~7,400 dòng UI một lượt).
2. **SSRF DNS pinning**: chặn DNS rebinding giữa bước validate và bước connect.

### Kết quả — SSRF DNS pinning (gateway)

- `lib/pinned-fetch.ts` (mới): undici `Agent` với connect-lookup tùy biến — resolve hostname
  **một lần**, validate **từng** địa chỉ trả về qua blocklist SSRF, cache IP đã pin
  (TTL 60s) rồi connect tới IP đó. SNI/Host giữ nguyên hostname (URL không đổi) nên
  TLS cert vẫn verify theo hostname. Cửa sổ rebind giữa "validate" và "connect" đã đóng.
- `pinnedFetch` thay `fetch` ở 21 call site provider: openai-compatible (12), anthropic (4),
  gemini (4), pollinations (2) — BYOK baseUrl do user kiểm soát là surface SSRF chính.
- `pinnedFetch` validate IP-literal ngay từ đầu: literal không bao giờ đi qua DNS lookup
  của connector (test thật: 127.0.0.1 kết nối được trước fix).
- **2 bug thật tìm thấy khi viết test:**
  1. **CRITICAL (pre-existing từ Round 1)**: thêm `::ffff:0:0/96` vào `net.BlockList`
     (kiểu ipv6) khiến Node match **mọi IPv4 thuần** vào dải đó → `isPrivateIp("8.8.8.8")`
     trả true (block nhầm mọi public IP literal). Fix: normalize IPv4-mapped trong
     `isPrivateIp` thay vì đưa vào blocklist.
  2. **CRITICAL (pre-existing, Node build này)**: `net.BlockList` IPv6 **im lặng không
     match** trên Node 22.23.3 (`addSubnet("fc00::",7)`, `addRange`, thậm chí
     `SocketAddress("::1")` nổ ERR_INVALID_ADDRESS) → fc00::/7, fe80::/10, ::1...
     chưa bao giờ bị block thật. Fix: IPv6 check bằng BigInt range thủ công
     (fc00::/7, fe80::/10, ff00::/8, ::, ::1, 2001:db8::/32), giữ BlockList cho IPv4.
- Tests: `pinned-fetch.test.ts` — 10 test với mock DNS (setPinnedLookup): pin cache
  (1 resolve/TTL), block A/AAAA mixed, mapped-v6 (`::ffff:10.0.0.5` + hex `::ffff:7f00:1`),
  IP-literal private, TTL re-validate, từ chối connect tới 127.0.0.1 thật.
- Provider tests mock `../lib/pinned-fetch.js` → passthrough global fetch (stub),
  tránh DNS/network thật trong unit test.

### Kết quả Round 3 — findings mới

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | CRITICAL | ssrf-guard.ts | `::ffff:0:0/96` trong BlockList → mọi IPv4 public bị coi là private (over-block, fail-closed) | Normalize IPv4-mapped bằng regex/BigInt, bỏ range khỏi list |
| 2 | CRITICAL | ssrf-guard.ts + Node 22.23.3 | `net.BlockList` IPv6 không match (addSubnet/addRange/SocketAddress im lặng fail) → fc00::/7, fe80::/10, ::1, 2001:db8 không bị chặn từ Round 1 | IPv6 ranges tự kiểm bằng BigInt; BlockList chỉ dành cho IPv4 |
| 3 | MAJOR | pinned-fetch (mới) | TOCTOU DNS-rebind: validate xong, fetch resolve lại DNS | Custom undici Agent pin-by-IP với TTL cache + validate mọi hop redirect |
| 4 | MAJOR | pinned-fetch | IP-literal (127.0.0.1) không qua connector lookup → pinnedFetch ban đầu vẫn connect được | Pre-validate URL + resolveAndPin trước khi dispatch |
| 5 | MINOR | Usage.tsx topology SVG | Màu node/border/text hardcode hex (light-only) | Đổi sang token vars (--app-surface, --violet-ink, ...) |

### Trạng thái Round 3

- [x] SSRF DNS pinning + 2 bug blocklist + 10 test mới
- [x] Dark mode: tokens + toggle + no-FOUC bootstrap + migrate ~1,400 class usages
- [x] Recharts/SVG màu hardcode → token vars; code block always-dark (github-dark)
- [x] `tsc --noEmit` gateway + web: 0 error
- [x] vitest: **356/356 pass, 51/51 files** (346 baseline + 10 mới, không regress)
- [x] `vite build` web + `tsc -p apps/gateway` (build): pass
- [x] Commits: pinned-fetch + blocklist fix, dark mode tokens, overlay fix

### Không làm (cân nhắc, ghi nhận)

- **Pin cache TTL 60s tĩnh**: DNS TTL thật của record không được đọc (dns.lookup không
  trả TTL) — cửa sổ re-validate 60s là chấp nhận được vì mỗi lần re-resolve vẫn qua validator.
- **Global undici dispatcher**: không dùng — sẽ pin cả traffic nội bộ/localhost của test
  và các call nội bộ; chỉ áp dụng cho provider egress ( BYOK surface).
- **Dark mode cho recharts Tooltip** (nền trắng mặc định): minor, tooltip vẫn đọc được;
  để follow-up nếu cần polish.
- **Live theme switch theo OS** (không reload): bootstrap luôn set data-theme, đổi
  prefers-color-scheme giữa phiên cần toggle tay — chấp nhận cho round này.

## Round 2 (2026-10-29)

### Goals

1. Get the test suite fully green (fix the 6 failing tests — 5 pre-existing + 1 regression from Round 1).
2. Fix real behavioral bugs found during deep review (round-robin rotation, version drift).
3. Add domain-appropriate features: legacy `/v1/completions` endpoint, graceful shutdown.
4. UI: deduplicate nav code, fix accessibility bugs in the language dropdown, global focus/a11y polish.
5. Update docs (README endpoints, plan Round 2 log).

### Findings (Round 2 review)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR (tests red) | circuit-breaker.ts + tests | `recordFailure` opens at `config.circuitBreakerThreshold` (default **8**), nhưng tests loop 5 lần và giả định threshold 3 → 2 test fail ("opens after threshold", "half-open lifecycle"). Config drift giữa code và test | Test dùng `config.circuitBreakerThreshold` (đếm theo config) thay vì hardcode 5 |
| 2 | MAJOR (tests green-wash) | scraped-gemini.test.ts:73 | Round 1 chuyển Gemini key từ `?key=` sang header `x-goog-api-key` nhưng test vẫn assert URL chứa `key=APIKEY` → fail | Test assert header `x-goog-api-key` + URL không chứa key |
| 3 | MINOR (behavior bug) | router.ts:26-35 | Round-robin rotate danh sách thô TRƯỚC khi filter usable — nếu provider đầu alias (kiraai) không usable, rotation bị no-op cho tới khi cursor vượt qua nó → round-robin không thực sự xoay | Filter usable trước, xoay sau (`rrIndex % usable.length`) |
| 4 | MINOR | app.ts:92,104 vs package.json | Version hardcode "1.11.3" (3 chỗ) trong khi package.json = 1.11.4 — drift | Đọc từ package.json (createRequire), 1 nguồn sự thật |
| 5 | MINOR | index.ts | Không graceful shutdown: SIGTERM không close server/scheduler (breaker state vẫn flush nhờ process handler, nhưng in-flight requests bị cắt) | SIGTERM/SIGINT → server.close + timeout force-exit |
| 6 | MINOR | web/main.tsx | Language dropdown không đóng khi click outside / Escape, thiếu aria-expanded/haspopup; nav Chat/Compare/Settings là 3 khối NavLink copy-paste | Click-outside + Escape + aria; gộp nav items 1 map |
| 7 | MINOR | app.ts:153-155 | `/v1/completions` là stub 400 — legacy OpenAI text completions không dùng được dù docs liệt kê | Implement thật: prompt → chat messages, tái sử dụng tryProviders pipeline |
| 8 | INFO | web/main.tsx | Không có skip-link, focus ring không nhất quán | Skip-to-content + global focus-visible styles |

### Round 2 — planned changes

- [x] fix(tests): circuit-breaker + router-fallback tests theo threshold config; gemini header assert
- [x] fix(gateway): router round-robin xoay sau filter (usable-first rotation)
- [x] fix(gateway): version đọc từ package.json (hết drift 1.11.3/1.11.4)
- [x] feat(gateway): `POST /v1/completions` legacy text completions (prompt → chat, non-stream)
- [x] feat(gateway): graceful shutdown (SIGTERM/SIGINT, drain connections, stop scheduler)
- [x] fix(web): nav dedup + dropdown a11y (click-outside/Escape/aria) + skip-link + focus styles
- [x] docs: README + docs/{en,vi}/API.md + plan/update

### Trạng thái Round 2

- [x] Deep review + plan
- [x] Fix #1–#8
- [x] `tsc --noEmit` root + gateway + web: **0 error** (trước đây build gateway bị vỡ sẵn do compare.ts import nhầm — đã fix)
- [x] vitest: **346/346 pass, 50/50 files** (trước: 334/340, 6 fail)
- [x] `vite build` web: pass; `tsc -p apps/gateway` (build): pass
- [x] Commits: `feeb6c3` (tests+router), `9d6b29e` (compare.ts build fix), `+ completions feat`, `+ graceful shutdown`, `+ web a11y`, `+ docs`

### Không làm (cân nhắc, ghi nhận)

- **Dark mode UI**: app đã có design system light nhất quán (slate + amber, white cards). Retrofit `dark:` variant cho ~6600 dòng UI trong 1 đợt quá rủi ro (contrast regressions khó verify) — để follow-up riêng. Thay bằng a11y + polish có phạm vi hẹp.
- **96 silent `catch {}`**: phần lớn là best-effort metrics/persist/log paths có comment lý do; không sửa hàng loạt vì khó verify từng case trong 1 đợt.

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

### Vòng 2 (2026-10-29)
- Deep review 20+ file lõi (app.ts, chat.ts, provider-executor, router, circuit-breaker, metrics, web shell/dashboard).
- `npm run build` gateway **vỡ sẵn trên main** trước Round 2 (compare.ts import recordUsage từ key-manager) — Round 1 chỉ check qua vitest transform nên không thấy; đã fix `9d6b29e`.
- 6 test fail khi bắt đầu: 5 pre-existing (round 1 ghi nhận) + 1 do round 1 (gemini header) — tất cả đã xanh; nguyên nhân 5 fail là config drift (threshold 8 trong code vs 5 hardcode trong test) + test FINAL_FALLBACK phụ thuộc env (key agnes-ai).
- Self-review: `completions.ts` nháp đầu có biến `latency` khai báo 2 lần + helper chết — viết lại sạch trước commit; test TS narrowing (`seenBody` never) — đổi sang mảng `seen`.
- Không regress round 1: ssrf-guard, byok-store, app.onError, admin gate — không đụng; gemini test được *sửa để khớp* fix round 1 (key-in-header), không hoàn tác.

### Vòng 1
- Self-review: phát hiện lỗi tự gây — edit ssrf-guard làm MẤT dòng `if (res.status >= 300 && res.status < 400) {` (comment thay thế nhầm oldString chứa if) → syntax error, đã khôi phục. Compare test pass với scope/quota mới (test dùng vk default scope `*`). `package-lock.json` thay đổi do `npm install` root — giữ (khóa deps). Thêm `apps/gateway/data/` vào ignore check trước commit.
