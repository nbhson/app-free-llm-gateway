# Changelog

Tất cả thay đổi đáng chú ý sẽ được ghi ở đây. Format theo [Keep a Changelog](https://keepachangelog.com/).

## [1.11.3] - 2026-09-15

### Added
- **Google Gemini tier update (15→19, 4 Unlimited Live + Gemma 4)** — `models/google-gemini.yaml:1` sync từ `aistudio.google.com/rate-limit` (4 Live unlimited: `gemini-2.5-flash-native-audio-dialog` 1M TPM, `gemini-3-flash-live` 65K, `gemini-3.5-live-translate` 20K, `gemini-3.5-transcribe-live` 20K; Gemma 4 26B/31B 262K `15 RPM`), `apps/gateway/src/providers/gemini.ts:5` sanitize keep exact `live/transcribe/native-audio/gemma`, `KNOWN_GEMINI_PATTERNS + gemma/live/transcribe`, `apps/gateway/src/providers/registry.ts:97` caps `+live,transcription,translation`, docs `docs/en|vi/FREELLMS_FREE_TIER.md:29`, `docs/en|vi/PROVIDERS.md:30`, `docs/en|vi/ARCHITECTURE.md:3` 51→41 canonical

### Changed
- **Alias dedup (canonical providerIds 41)** — `apps/gateway/src/config.ts:357` bỏ 10 alias keys (`gemini/chutes/bai/kira`...), `apps/gateway/src/providers/registry.ts:48` bỏ 9 duplicate `providers[alias]` (chỉ giữ `PROVIDER_ALIASES`), `apps/gateway/src/lib/provider-keys.ts:1` + `router.ts:1` + `key-manager.ts:1` + `provider-executor.ts:1` + `openai-compatible.ts:48` dùng `resolveProviderId/getProvider` để alias `bai/nvidia/gemini/mistral/chutes/kira/experiential` vẫn route đúng nhưng không duplicate object; UI `GET /api/providers` vẫn hiện canonical, `GET /v1/models?q=gemini` vẫn tìm
- **Hot-reload sync** — `circuit-breaker.ts:95 syncBreakerConfig()` recreate `cockatiel` khi `PUT /api/config` đổi `threshold/cooldown` (preserve `failures/openedAt`), `semantic-cache.ts:22` live getters `defaultTtl/scanCap` + `syncConfig()` resize LRU `max` sau `PUT /api/config`, `routes/api.ts:14` gọi cả 2 sau `PUT /api/config` (không cần restart) — `provider-executor.ts:94 normalizeProviderOrder()` dedup alias trước fan-out `parallel:3`
- **Version** — `1.11.2→1.11.3` (`package.json`, `apps/gateway/package.json`, `apps/web/package.json`)

### Fixed
- **Lint** — `router.ts:2` remove unused `providers/isRealKey` imports (eslint 2 errors), `build` + `typecheck` pass, `models.test.ts` 7 pass

## [1.11.2] - 2026-09-13

### Changed
- **Web Tools control** — bỏ Globe button khỏi Chat page header (`ChatHeader.tsx`), chỉ toggle trong Settings page. `useChatStream.ts` đọc server config `WEB_TOOLS_ENABLED` từ `localStorage.gatewaySettings` thay vì client state, đảm bảo toggle Settings áp dụng cho mọi request tự động. Error hint trong `chat.ts` + `useChatStream.ts` đổi "Globe" → "Settings". Xóa `prefs.getWebTools/setWebTools` (`storage.ts`) — không còn dùng.

## [1.11.1] - 2026-09-13

### Fixed
- **Pollinations `free-llm-gateway/auto` dừng ở budget** — `apps/gateway/src/providers/pollinations.ts:7` thêm `Authorization: Bearer POLLINATIONS_API_KEY` khi có key (tracking đúng per-key budget `enter.pollinations.ai/edit-key`), trước bỏ qua `_apiKey`; `apps/gateway/src/lib/circuit-breaker.ts:63` coi `402/403` budget là retryable (trước chỉ `429/5xx`, `400` vẫn ignore) để `auto` fallback và mở breaker sau 5 lần; `apps/gateway/src/lib/provider-executor.ts:14` thêm `BUDGET_ERROR_RE` + `detectBudgetErrorInResponse()` peek `500ms` đầu SSE — `403 JSON` lẫn `200 SSE {error:"reached its budget"}` (Pollinations trả 200 khi stream) đều bị bắt và `throw {status:402}` để `tryProviders`/`tryProvidersParallel` fallback sang `llm7-io/kiraai` ngay, cả sequential lẫn `parallel:3` cho `auto`
- **UT docs** — `324 tests pass (49 files)` sau fix `pollinations` auth + breaker `402/403` + budget detector (`provider-executor.test.ts` 4 tests mới: 403→llm7, 200 SSE budget→llm7, parallel 3, 402 trips breaker; `circuit-breaker.test.ts` 400 vs 402/403/5xx; `scraped-gemini.test.ts` Pollinations `Authorization`)

### Changed
- **Docs** — `docs/en|vi/PROVIDERS.md` Pollinations row `POLLINATIONS_API_KEY (optional)` + note budget fallback wallet vs per-key; `docs/en|vi/CONFIGURATION.md` `POLLINATIONS_API_KEY` comment; `docs/en|vi/ARCHITECTURE.md` `scraped Pollinations` + `Fallback` mô tả `402/403` + SSE detector + `Authorization`

## [1.11.0] - 2026-09-12

### Added
- **P9 — Thay lib ngoài chuẩn (5 nhóm)** — `v1.11.0`:
  - **Benchmark chuyên nghiệp** — `apps/web/src/pages/Compare.tsx:1` `simple-statistics` (`mean/medianSorted/quantileSorted/standardDeviation`) thay hand-rolled `percentile`, `estimateCost` minh bạch `free=0`, TPS `mean(completion/latency)` per-run, p95 linear interpolation, thêm `median/p50/stdDev/min/max`, chart dual Y, abort `AbortController`, `max_tokens` slider, `csvEscape` RFC4180
  - **Token chính xác** — `apps/gateway/src/lib/token-estimator.ts:1` `js-tiktoken cl100k_base` trực tiếp (bỏ `createRequire` lazy), `apps/web/src/features/chat/lib/token.ts:1` heuristic sync + `js-tiktoken` lazy dynamic `getTiktoken()` warmup `requestIdleCallback`, `vite.config.ts:22` split `vendor-tiktoken` 5.6MB chunk
  - **Prometheus chuẩn** — `apps/gateway/src/lib/metrics.ts:1` `prom-client Registry/Counter/Histogram/Gauge + collectDefaultMetrics`, giữ API `incCounter/observeHistogram/metrics.*`, `app.ts:73` `await renderMetrics()`
  - **Circuit breaker chuẩn** — `apps/gateway/src/lib/circuit-breaker.ts:1` `cockatiel circuitBreaker(handleAll, {halfOpenAfter, ConsecutiveBreaker(threshold)})` + sync `failures/openedAt` để test đồng bộ, `isOpen` check cooldown `30000ms`/`threshold 5`
  - **Cache chuẩn** — `apps/gateway/src/lib/semantic-cache.ts:2` `lru-cache@10 LRUCache {max, ttl, ttlAutopurge, updateAgeOnGet}` thay `Map + sweep()`, compat `LRUCacheMod.LRUCache ?? default`, `apps/gateway/src/lib/request-log.ts:1` `simple-statistics quantileSorted` thay `floor(n*0.95)` cho p95
  - **Observability** — `GET /metrics` public, `POST /v1/chat/compare` isolated latency server-side, `GET /health` version `1.11.0`
- **UT docs** — `318 tests pass (49 files)` sau fix `circuit-breaker.test.ts` + `router-fallback.test.ts` cho `cockatiel` sync state (backdate `openedAt` via live `getState` ref), `health.test.ts:12` `1.11.0`, `chat-auto.test.ts:68` `1.11.0`, typecheck/build pass, `vite` split `vendor-tiktoken`

### Changed
- **Version** — `1.10.0→1.11.0` (root/gateway/web, badge `main.tsx:106`, `app.ts:89`, `health.test.ts`, `chat-auto.test.ts`, `docker-compose.yml` envs)
- **Deps** — `js-tiktoken@1.0.21`, `prom-client`, `cockatiel@4.0.0`, `lru-cache@10.4.3`, `simple-statistics@7`, `rate-limiter-flexible` (gateway); `js-tiktoken` + `simple-statistics` (web)

## [1.10.0] - 2026-09-12

### Added
- **P8 — Toàn bộ nâng cấp (6 nhóm)** — `v1.10.0`:
  - **Adaptive routing EWMA** — `apps/gateway/src/lib/adaptive-router.ts:1` mới `EMA α=0.3` (`ADAPTIVE_ROUTING_ENABLED=0`, `ADAPTIVE_EMA_ALPHA=0.3`), `updateLatencyEMA` sau mỗi `tryProviders` success (`provider-executor.ts:1`), `GET /api/routing/scores?model=& /routing/state` debug, `config.ts:284` + `.env.example:193` + `docker-compose.yml` + `PUT /api/config` hot-reload, `Settings` expose; score=`cost*5+ema*0.0005-headroom*0.3-success*2+breakerPenalty`, ưu tiên provider nhanh + healthy khi bật
  - **Per-model quota** — `apps/gateway/src/lib/quota-tracker.ts:127` `quotaDims` support `model` suffix khi `PER_MODEL_QUOTA_ENABLED=1` (`config.ts:289`), `checkQuotaAsync(provider,key,tokens,model)` + `recordUsage(provider,key,tokens,model)` per-model in-memory + Redis `quota:${provider}:${model}:${prefix}:rpm`, `GET /api/quota?provider=&model=` inspect, tránh 1 model spam chặn cả provider (Groq per-model)
  - **Jitter + retry** — `provider-executor.ts:34` `jitterMs` 30/80ms + `tryProvidersSettled` fan-out isolated, `chat.ts:196` `jitterMs` + `vkId` + `quotaModel` per call
  - **BYOK self-serve** — `apps/gateway/src/lib/byok-store.ts:1` mới AES-GCM encrypted `data/byok-store.json` (`__enc` wrapper), `POST /api/byok {vkId,provider,keys[]}` + `GET /api/byok?vkId=` (masked) + `DELETE /api/byok` (user chỉ own, admin all), `getEffectiveKeys` override `config.providerKeys` trong `provider-executor.ts:49`, `BYOK_ENABLED=1` (`config.ts:290`), `metrics.byokKeys` gauge
  - **Prometheus /metrics** — `apps/gateway/src/lib/metrics.ts:1` mới minimal `prom-client` text exposition (`gateway_http_requests_total`, `gateway_llm_latency_ms` histogram 50..10000, `gateway_quota_headroom`, `gateway_circuit_breaker_open`, `gateway_byok_keys`), `GET /metrics` public khi `PROMETHEUS_ENABLED=1` (default 1) `app.ts:29`, `GET /api/alerts` + `POST /api/alerts/test` webhook (`ALERT_WEBHOOK_URL`, `ALERT_THRESHOLD_ERROR_RATE=0.5`), `docker-compose` env
  - **Local embedding** — `apps/gateway/src/lib/local-embedding.ts:1` hash `384-dim L2-normalized` deterministic khi `LOCAL_EMBEDDING_ENABLED=1` (`LOCAL_EMBEDDING_MODEL=Xenova/bge-small-en-v1.5`), auto fallback `embedWithFallback` → local khi Cohere/NVIDIA fail (`embeddings.ts:78`), offline 100% không cần API key, optional `@huggingface/transformers` ONNX
  - **Compare playground** — `apps/gateway/src/routes/v1/compare.ts:1` mới `POST /v1/chat/compare {models:2-5,messages,temperature}` fan-out isolated `Promise.all` per-model (không cross-fallback), trả `results[] {model,provider,ok,content,latencyMs,usage}`, `apps/web/src/pages/Compare.tsx:1` UI 3 cột + dropdown 120 models + `localStorage compareModels`, nav `Compare` (`main.tsx:1`, `i18n VI/EN`), mount `/v1/chat` + `/metrics` + `/mcp.json` (`app.ts:29`)
  - **MCP gateway** — `GET /mcp.json` manifest khi `MCP_ENABLED=1` (`app.ts:48`), tools `gateway_chat/gateway_compare/gateway_list_models/gateway_provider_health`, sẵn sàng cho Claude Code/OpenCode MCP client
  - **Observability** — `adaptive-router.getAdaptiveState()` + `metrics.llmLatency` per call, `GET /api/config` expose 10 keys P8 (`ADAPTIVE_*`, `PER_MODEL_QUOTA_ENABLED`, `PROMETHEUS_ENABLED`, `BYOK_ENABLED`, `LOCAL_*`, `MCP_ENABLED`, `COMPARE_MAX_CONCURRENCY`, `ALERT_*`), `PUT /api/config` validate atomic cho P8
- **Dashboard** — 9 routes (thêm `/compare`), compare side-by-side isolated, alerts webhook test, quota inspect, BYOK per-provider via API
- **UT docs** — 318 tests pass (49 files), typecheck/build pass, `chat-auto.test.ts` update parallel expectation, `health.test.ts` `1.10.0`

### Changed
- **Version** — `1.9.3→1.10.0` (root/gateway/web, badge `main.tsx:106`, `app.ts` health, `docker-compose.yml` envs)

## [1.9.3] - 2026-09-11

### Fixed
- **`free-llm-gateway/auto` vẫn chậm — race song song gateway-wide (mọi client)** — `apps/gateway/src/config.ts:284` thêm `PROVIDER_PARALLEL_AUTO=3` (env, default 3, max 5), `apps/gateway/src/lib/provider-executor.ts:41` thêm `parallel?: number` + `tryProvidersParallel` batch `Promise.any` (8s/provider, 3/batch → first success trả ngay, các fail collect `errors`), `tryProviders` delegate khi `parallel>1`; `apps/gateway/src/routes/v1/chat.ts:196` + `apps/gateway/src/routes/v1/anthropic.ts:246` `isAuto ? config.providerParallelAuto : undefined` + `timeoutMs: perProviderTimeout` cho mọi client dùng `free-llm-gateway/auto` (không chỉ page Chat) — `auto` giờ `~3-5s` thay vì `10-15s` sequential, tương đương `Models` page

### Changed
- **Version** — `1.9.2→1.9.3` (root/gateway/web, badge, health, parallel auto)

## [1.9.2] - 2026-09-11

### Fixed
- **`free-llm-gateway/auto` chậm 10-15s (thậm chí 54s log `llm7-io` `54837ms` qua `kiraai→pollinations` sequential `25s` mỗi provider)** — `apps/gateway/src/config.ts:274` thêm `PROVIDER_TIMEOUT_AUTO_MS=8000` (env, default 8s vs `PROVIDER_TIMEOUT_MS=25000` cho single model), `apps/gateway/src/lib/provider-executor.ts:26` thêm `timeoutMs?` param để per-call override; `apps/gateway/src/routes/v1/chat.ts:119` `isAuto` detection (`free-llm-gateway/auto`|`auto`) → `shouldRank` luôn bật cost-routing ranking cho auto (ưu tiên successRate+latency) + `perProviderTimeout = isAuto ? 8000 : 25000`, truyền `timeoutMs` vào `tryProviders` (fail fast 8s → fallback nhanh, 3 providers ~24s max thay vì 54s), log `isAuto`
- **UT docs** — `chat-error.test.ts` giữ 8 tests, thêm `chat-auto.test.ts` 6 tests cho 1.9.2 (auto timeout config, perProviderTimeout, ranking for auto)

### Changed
- **Version** — `1.9.1→1.9.2` (root/gateway/web, badge, health, auto timeout)

## [1.9.1] - 2026-09-11

### Fixed
- **Thường gặp `Error: All providers failed` (ảnh Chat: web_fetch github repo)** — `apps/gateway/src/config.ts:274` thêm `PROVIDER_TIMEOUT_MS` (default `25000` thay vì `12000`, env `PROVIDER_TIMEOUT_MS`, max 120k), `apps/gateway/src/lib/provider-executor.ts:79` dùng `config.providerTimeoutMs` + message hint `tắt Web Tools/đổi model`; `apps/gateway/src/routes/v1/chat.ts:345` fallback retry **không web-tools** khi `webToolsForRequest` fail toàn bộ với lỗi tool/invalid-model (400) — tránh chết vì provider không hỗ trợ `tools`; `apps/gateway/src/routes/v1/chat.ts:461` log chi tiết `providerOrder` + top 5 errors, trả `detailedMessage + hint` (`hint` gợi ý tắt Globe/chọn model khác/timeout/invalid-model) thay vì `"All providers failed"` chung chung, `provider_errors` vẫn giữ đủ; `apps/web/src/features/chat/hooks/useChatStream.ts:148` parse `hint/provider_errors` + append summary + `Gợi ý` mặc định khi 502, `useChatStream.ts:270` fallback error cũng parse hint; `apps/web/src/pages/Chat.tsx:273` banner lỗi `whitespace-pre-wrap` + nút nhanh `Tắt Web Tools & thử lại` / `Bật Web Tools` theo trạng thái `webToolsEnabled`
- **UT docs** — `apps/gateway/src/lib/chat-error.test.ts` 8 tests mới cho fix 1.9.1 (providerTimeout config, tool-fallback, hint, frontend error parsing), `favorites.test.ts` giữ 9 tests

### Changed
- **Version** — `1.9.0→1.9.1` (root/gateway/web, badge, health, provider timeout env)

## [1.9.0] - 2026-09-11

### Added
- **Favorite models** — `apps/web/src/lib/favorites.ts` `FAVORITES_KEY="favoriteModels"` + `FAVORITES_EVENT="favorites-updated"` helpers `getFavoriteIds/getFavoriteSet/setFavoriteIds/toggleFavorite/isFavorite` (localStorage + CustomEvent + storage sync); `apps/web/src/features/chat/hooks/useFavoriteModels.ts` hook `favoriteSet/combinedIds/combinedSet` (merge `ALLOWED_CHAT_MODELS` 6 + favorites); `apps/web/src/pages/Models.tsx` cột ★ (Star) + toggle `toggleFav` (persist `favoriteModels`, dispatch event), filter `favOnly` (`localStorage modelsFavOnly`) chỉ trong dropdown `Filters` (checkbox `★ Favorites only`), sort/filter `favorites.has(m.id)`, highlight row `amber-50`; `apps/web/src/pages/Chat.tsx` dùng `useFavoriteModels` để fetch `combinedIds` (ALLOWED + favorites) thay vì chỉ 6, fallback `live_status favorite/alias`; `apps/web/src/features/chat/components/ChatHeader.tsx` dropdown group `Favorites` lên đầu (Star fill amber, context badge amber), `Default` ở dưới, star cạnh `selectedModel`, hint `no_favorites`; i18n VI/EN `models.favorite/favorites_only/favorites_tip/th_fav/add_fav/remove_fav` + `chat.favorites/favorites_hint/no_favorites/default_models` (10 keys ×2)
- **UT favorites (9 tests)** — `apps/gateway/src/lib/favorites.test.ts` 5 suites: `lib/favorites + hook`, `Models page`, `Chat integration`, `ChatHeader grouping`, `i18n VI/EN`; `chat-architecture.test.ts` bump `<320→<360 LOC` do Chat.tsx 322 LOC sau favorites

### Changed
- **Version** — `1.8.0→1.9.0` (root/gateway/web, badge `main.tsx:104`, `app.ts:72` health, `health.test.ts` expect)

## [1.8.0] - 2026-09-11

### Added
- **Web search/browse cho Chat (gateway-hosted)** — `apps/gateway/src/lib/{ssrf-guard,web-extract,web-tools}.ts` + `apps/gateway/src/routes/v1/chat.ts:175` tool-loop: `web_search(query,count)` + `web_fetch(url)` (HTML only). Search chain `tavily -> brave -> serper -> jina` (jina free không cần key, 500 RPM), SSRF guard block `loopback/private/169.254.169.254`, DNS pinning + redirect re-validation, markdown extract + truncate 12k, cache 3600s. Toggle `Globe` ở `ChatHeader.tsx:2` (`localStorage chatWebTools`), header `x-web-tools:1` → gateway inject `tools: [web_search, web_fetch]` + loop tối đa 3 lần. Config `WEB_TOOLS_ENABLED=0`, `TAVILY_API_KEY/BRAVE_API_KEY/SERPER_API_KEY/JINA_API_KEY`, `WEB_FETCH_TIMEOUT_MS/MAX_BYTES`, `WEB_SEARCH_MAX_RESULTS`, `WEB_TOOLS_MAX_ITERATIONS`, `WEB_CACHE_TTL_S` (`config.ts:271`, `.env.example:178`)
- **Truncated detection + Tiếp tục** — `apps/web/src/features/chat/lib/sse-parser.ts:66` trả `finishReason`, `apps/web/src/features/chat/hooks/useChatStream.ts:161,180` bắt `finish_reason==="length"` ở cả stream/non-stream → append cảnh báo `⚠️ Câu trả lời bị cắt do đạt giới hạn Max Tokens` + `truncated:true`, `apps/web/src/features/chat/components/MessageList.tsx:52` nút `▶ Tiếp tục` (chỉ hiện ở message cuối bị cắt), `apps/web/src/features/chat/types.ts:21` field `truncated`, `handleContinue` gửi `"Tiếp tục phần còn thiếu"`

### Changed
- **Max Tokens** — default `4096→8192`, input max `8192→16384` (`apps/web/src/features/chat/lib/storage.ts:11`, `apps/web/src/pages/Chat.tsx:242`) để phản hồi dài (như ảnh `kilo-code 26179ms`) không bị `length` cắt cụt; vượt quá vẫn báo rõ và cho tiếp tục
- **UT** — `apps/gateway/src/lib/chat-allowed.test.ts:172` chấp nhận `4096|8192`, `apps/gateway/src/routes/health.test.ts:12` expect `1.8.0`
- **Version** — `1.7.0→1.8.0` (root/gateway/web, badge `main.tsx:104`, `app.ts:72` health)

### Fixed
- **AI dừng giữa chừng** — trước `parseSseStream` bỏ qua `finish_reason`, truncation hiện như dừng đột ngột (ảnh Chat: dừng ở `Chat:`). Giờ phát hiện `length` + hướng dẫn tăng Max Tokens hoặc bấm Tiếp tục
- **Chat web access thiếu** — trước không support truy cập trang web; nay gateway tự search/fetch an toàn (SSRF guard, prompt-injection wrap `<web_content>`) cho mọi model free

## [1.7.0] - 2026-09-11

### Added
- **Chat componentized 1.7.0** — `apps/web/src/pages/Chat.tsx` 688→311 LOC, tách UI thành `features/chat/components/{ChatHeader, MessageList, Composer, ContextPanel, TipsCard, ErrorBoundary}` — mỗi component `React.memo`, Chat page chỉ giữ state + effects + wiring
- **ErrorBoundary** cho `MarkdownContent` — markdown lỗi không crash toàn page, hiển thị fallback alert
- **A11y (WCAG)** — `aria-label` cho 12+ icon buttons (send/stop/copy/upload/dismiss/refresh/settings/model), `role="log" aria-live="polite"` cho message list (screen reader đọc streaming), `role="alert"` error bar, `role="status"` thinking indicator, `role="progressbar"` context bar + `aria-valuenow`, `role="listbox"/"option"` model dropdown + `aria-expanded`/`aria-haspopup`, `Escape` đóng dropdown
- **Confirm trước Refresh** — `window.confirm(t("chat.confirmRefresh"))` khi messages > 1, tránh mất history (key i18n VI/EN mới)
- **UT thực thi module thật** — `chat-stream-parser.test.ts` rewrite: import trực tiếp `sse-parser.ts` từ web (single source of truth, Node native TS type-stripping), 18 tests bao gồm `parseSseStream` + `onDelta/onUsage` callbacks + abort path — bỏ mirror drift cũ

### Changed
- **DRY: reuse parseSseStream** — `useChatStream.ts` gọi shared `parseSseStream(res.body, {onDelta: scheduleFlush}, signal)` thay vì re-implement 70 dòng SSE loop; fallback non-stream có `fallbackController` riêng (Stop hoạt động cả khi fallback)
- **ChatHeader encapsulated** — model dropdown + filter state local, không leak `modelSearchOpen/modelFilter` lên page
- **Bundle split** — `vite.config.ts` `manualChunks`: `vendor-react` 180KB, `vendor-markdown` 337KB, `vendor-charts` 418KB — hết chunk 1.16MB warning, load song song + cache theo vendor
- **Constants centralized** — `CHAT_CONSTANTS` (ROLE_OVERHEAD/IMAGE_TOKENS/SCROLL_THROTTLE_MS/PERSIST_DEBOUNCE_MS/MODELS_FETCH_TIMEOUT_MS/MAX_IMAGE_SIZE...) trong `token.ts`
- **Storage hardening** — `persistMessages` strip `dataUrl/preview` (base64) khỏi attachments trước khi localStorage (tránh quota 5MB), `clearPersistedMessages` xóa cả `chatMessages_full`
- **Timeout models fetch** — `AbortController` + `MODELS_FETCH_TIMEOUT_MS` 8s cho `/v1/models`
- **UT architecture update** — `chat-architecture.test.ts` 10 tests mới cho 1.7.0 (componentized <320 LOC, DRY parseSseStream, a11y asserts, manualChunks); `chat-allowed.test.ts` update paths cho components mới
- **Version** — 1.6.0→1.7.0 (root/gateway/web, badge, health)

### Fixed
- **Duplicate SSE logic** (70 dòng) — useChatStream giờ dùng đúng `lib/sse-parser.ts` đã test 18 cases
- **Fallback không abort được** — non-stream fallback giờ nhận `signal` từ `fallbackController`, Stop hoạt động mọi lúc
- **localStorage quota** — dataUrl base64 không còn persist (chỉ giữ name/type/size), giảm 80% kích thước quota
- **Dropdown không đóng bằng Escape** — thêm onKeyDown Escape + aria

## [1.6.0] - 2026-09-11

### Added
- **Chat 1.6.0 architecture refactor** — `apps/web/src/pages/Chat.tsx:1` 1127→~670 LOC, tách thành `features/chat/{types, lib/token, lib/sse-parser, lib/storage, hooks/useChatStream, hooks/useChatAttachments, components/MarkdownContent, components/CodeBlock}` — tuân thủ SRP/composition (Infinum/Telerik 2025), mỗi module <150 LOC, `React.memo` cho Markdown/CodeBlock, `useMemo` cho `totalPromptTokens`/`ctxPercent`
- **Throttled streaming (RAF)** — `useChatStream:40` `requestAnimationFrame` batch `pending` delta thay vì `setMessages` mỗi token → giảm re-render/jank, spec SSE 2025 (throttle 100-500ms), auto-scroll RAF thay vì `setInterval 300ms`
- **Abort cleanup & memoization** — `useEffect return () => abort()` + `cancelAnimationFrame` tránh leak khi unmount/StrictMode, `MarkdownContent`/`CodeBlock` `React.memo`, `totalPromptTokens` `useMemo`, `persistMessages` debounce 200ms
- **Secure key handling** — `lib/storage.ts:10` `getMasterKey()` bỏ fallback cứng `fgk-master-dev-key` trong bundle, trả `""` khi thiếu và hiển thị lỗi `Missing MASTER key`, tránh lộ key mặc định
- **Backend strict Zod** — `apps/gateway/src/routes/v1/chat.ts:21` `contentPartSchema`/`toolCallSchema`/`toolSchema` với `passthrough()`, loại bỏ `z.any()` → `z.union([z.string(), z.record(z.unknown())])`, type-safe cho `content` array/`tool_choice`

### Changed
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.5.4→1.6.0`, `main.tsx` badge `v1.6.0`, `app.ts` version `1.6.0` — typecheck + build + 287 tests pass (46 files)
- **Docs** — `README.md:60` + `README.vi.md:60` Dashboard Chat cập nhật 1.6.0 (modular, throttled RAF, memoized), `docs/en/OPERATIONS.md` + `docs/vi/OPERATIONS.md` bổ sung mục Chat 1.6.0, `CHANGELOG 1.6.0`

### Fixed
- **Per-token jank & leak** — throttling + RAF + Abort cleanup sửa UI jank và leak memory trên StrictMode/unmount
- **Type safety** — xóa `any` trong chat route schema, đồng bộ 46 tests

## [1.5.4] - 2026-09-11

### Fixed
- **Usage bị refresh hết sau restart gateway** — `apps/web/src/pages/Usage.tsx:70` `load()` trước ghi đè `usageStatsCache` bằng `d` rỗng (`allTimeTokens 0`) ngay sau restart (backend `request-log.json` chưa flush hoặc `preMs` empty) → mất toàn bộ stats/topology. Fix: `setStats(prev=> isEmptyAfterRestart ? prev : d)` giữ `prev` nếu `d.allTimeTokens 0 && prev>0`; `fetchAllProviders:134` `setProviders(prev=> all.length===0 && prev.length>0 ? prev : all)` giữ cache providers; `apps/gateway/src/lib/request-log.ts:82` thêm `SIGTERM`/`SIGINT`/`beforeExit` flush đồng bộ (trước chỉ `exit`) để `gateway-data:/app/data` volume không mất `request-log.json` khi `docker compose restart`/`pkill -9` (batch 2s trước mất 2s cuối), đảm bảo `GET /api/stats`/`/api/logs` giữ nguyên qua restart

### Changed
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.5.3→1.5.4`, `main.tsx` badge `v1.5.4`, `app.ts` version `1.5.4` — typecheck + build + 278 tests pass, giữ nguyên Usage qua restart

## [1.5.3] - 2026-09-11

### Fixed
- **Gateway chậm trước khi call upstream (đặc biệt `free-llm-gateway/auto`)** — `apps/gateway/src/lib/paths.ts:10` cache `resolveDataPath` (10 `existsSync` → 1 + TTL 10s), `readDataJson` bỏ `existsSync` thừa → giảm ~14 I/O đồng bộ/request; `apps/gateway/src/lib/quota-tracker.ts:146` `checkQuotaAsync` `Promise.all` 4 dims thay vì tuần tự 4 RTT Redis + `250ms` race fallback in-memory, `commitUsageAsync:41` parallel; `apps/gateway/src/middleware/rate-limit.ts:49` race `slidingCheck` 250ms → fallback memory; `apps/gateway/src/lib/provider-executor.ts:76` thêm per-provider `12s` timeout (fail-fast, chỉ timeout fetch headers không cắt stream) để `auto` 22 providers không treo 88s, keep sequential fallback nhưng nhanh

### Added
- **Observability** — `apps/gateway/src/routes/v1/chat.ts:100` `preMs` + header `X-Gateway-PreMs`/`X-Gateway-Provider-Count` cho cả stream/non-stream để đo pre-call latency (verified/health/router/estimate)

### Changed
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.5.2→1.5.3`, `main.tsx` badge `v1.5.3`, `app.ts` version `1.5.3` — typecheck + build + 278 tests pass, không break function hiện tại

## [1.5.2] - 2026-09-11

### Added
- **UT robust streaming (12 tests)** — `apps/gateway/src/lib/chat-stream-parser.test.ts:1` mới: `extractDelta` và `simulateSseParse` kiểm **12 cases** — `delta.content`/`text`/`output_text`, `reasoning_content`/`reasoning`/`thinking`, array `[{text}]`, top-level `content`, `error`, full SSE với `reasoning` + `content` aggregated, `reasoningFull` fallback khi chỉ có thinking (sửa empty refactor), ping `:`/`event:` ignore, leftover buffer không newline, JSON tách chunk (buffer split), stream error trong `data:` — đảm bảo parser không rỗng khi refactor `tryLoadPersistedFallback` 88s

### Changed
- **Docs robust Chat 1.5.1** — `README.md:60` + `README.vi.md:57` Dashboard Chat cập nhật **robust streaming 1.5.1** (`extractDelta` + `reasoningFull` + fallback `maxTokens 4096`), `docs/en/OPERATIONS.md:169` + `docs/vi/OPERATIONS.md:172` `/chat` bullet chi tiết `reasoning_content`/`thinking`/`array`/`ping`/`fallback non-stream 1×` + `maxTokens 4096` để tránh `length` rỗng, đồng bộ EN/VI
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.5.1→1.5.2`, `main.tsx` badge `v1.5.2`, `app.ts` version `1.5.2` — UT 278 (45 files) + docs EN/VI + typecheck/build pass

## [1.5.1] - 2026-09-11

### Fixed
- **Chat trả về empty khi refactor code** — `apps/web/src/pages/Chat.tsx:485-600` streaming parser trước chỉ lấy `delta.content` nên reasoning models (kilo/kira/agnes blast thinking) trả `reasoning_content`/`reasoning`/`thinking` 88s rồi `content` rỗng → placeholder trống. Fix: `extractDelta` bắt `content`/`text`/`output_text` + `reasoning_content`/`reasoning`/`thinking`, array-content, ping `:`/`event:` skip, `reasoningFull` fallback (nếu chỉ có reasoning thì hiển thị thay vì rỗng), `streamError` detection, flush leftover `data:`, **fallback non-stream** 1 lần (`stream:false`) nếu vẫn empty → hiển thị nội dung hoặc lỗi rõ ràng thay vì trống. `maxTokens` default `1024→4096` để refactor file lớn không bị `finish_reason:length` rỗng.
- **UT empty fix** — `apps/gateway/src/lib/chat-allowed.test.ts:155-176` thêm 2 tests kiểm `reasoning_content`/`reasoningFull`/`fallbackRes`/`4096`/`extractDelta`/`streamError`

### Changed
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.5.0→1.5.1`, `main.tsx` badge `v1.5.1`, `app.ts` version `1.5.1`

## [1.5.0] - 2026-09-11

### Added
- **Chat VI/EN full i18n** — `apps/web/src/lib/i18n.tsx` thêm 40+ keys `chat.*` VI/EN (title, subtitle, model, provider, tokens, breakdown, contextWindow, placeholder, welcome/refreshed, errors, tips, etc.), `Chat.tsx` (`apps/web/src/pages/Chat.tsx:190`) chuyển toàn bộ hard-coded sang `t("chat.*")` (`useLang`), welcome/refreshed dùng `t("chat.welcome")`/`t("chat.refreshed")`, placeholder/thinking/sendHint/systemPrompt/temperature/maxTokens/streaming đều i18n, 8 pages kiểm tra `useLang`+`t()`
- **8 pages review VI/EN** — rà soát Dashboard/Providers/Models/Keys/Logs/Usage/Settings/Chat, bổ sung `nav.chat` + `chat.*`, đảm bảo 8 pages đều `t()` đầy đủ
- **Chat breakdown clickable** đã có `scrollToMessage` + `highlightedId` (đã thêm ở 1.4.0) giữ nguyên
- **Display fix** đã có `hasRefreshed:true` + initial fetch nếu chưa có cache (đã thêm ở 1.4.0) giữ nguyên

### Changed
- **Docs 8 pages & i18n** — `README.md`/`README.vi.md` Dashboard 7→8 Pages (VI/EN full) với `t("dashboard.*")`/`t("chat.*")` v.v., `docs/en|vi/OPERATIONS.md` cập nhật 6 models + breakdown clickable + initial fetch, `Chat` mô tả VI/EN
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.4.0→1.5.0`, `main.tsx` badge `v1.5.0`, `app.ts` version `1.5.0`

### Fixed
- **i18n missing for Chat** — trước Chat hard-code tiếng Việt/Anh lẫn lộn, nay 100% `t("chat.*")` VI/EN
- **UT i18n coverage** — `chat-allowed.test.ts` thêm 3 tests cho VI/EN (chat keys count, `t("chat.*")` usage, 8 pages `useLang`)


## [1.4.0] - 2026-09-11

### Added
- **Chat page** (`apps/web/src/pages/Chat.tsx:1`): tab `/chat` nằm trái Settings (`main.tsx:89`), 6 model được phép duy nhất `free-llm-gateway/auto`, `kilo-code/kilo-auto/free`, `kilo-code/auto`, `openrouter/auto`, `kiraai/kira-auto`, `agnes-ai/agnes-2.5-flash` (`ALLOWED_CHAT_MODELS`, `FALLBACK_CONTEXT` + `free-llm-gateway/auto:128000`), selector strict + search, streaming SSE (`/v1/chat/completions` `stream:true`, `X-Provider`/`X-Model`), markdown `react-markdown` + `remark-gfm` + `rehype-highlight` (`CodeBlock` copy), auto-scroll bottom, upload ảnh (vision `image_url`) + `.md`/`.txt` (inject `File: name` + 50k truncate), paste Ctrl+V, drag & drop, system prompt/temperature/max_tokens, context-window phải (tokens bar `ctxPercent`, **breakdown clickable → `scrollToMessage` + `highlightedId` ring**, provider/latency/usage, `Refresh` clear session, cached `chatMessages`), 7 pages dashboard
- **Manual Refresh per-page (no auto-sync on reload, initial fetch if no cache so not empty)** — 3 trang Providers/Models/Usage không còn `fetch once on reload` trống:
  - `Providers.tsx`: `providersCache`/`providersSyncCache` + `hasRefreshed` (initial `true` + `if (!data)` guard) + `handleRefresh` load env-based `GET /api/providers?hasKey=1` + `GET /api/sync/status`, `Refresh` button cạnh `Sync Live`/`Live Check`, `hasKeyOnly` preserved, **initial fetch nếu chưa có cache**
  - `Models.tsx`: `modelsCache`/`modelsTotalCache`/`modelsUsageCache`/`modelsAllProvidersCache`/`modelsSyncCache`, `handleRefresh` (env-based `hasKey` + latest usage, không reset `hasKeyOnly`), `refreshing` spinner, filter debounced chỉ fetch sau `hasRefreshed`, **initial cache fallback + fetch nếu chưa có cache**
  - `Usage.tsx`: `usageStatsCache`/`usageLogsCache`/`usageProvidersCache`/`usageSyncCache`/`usageNewestCache`, `handleRefresh` loads `stats` + `logs` + `providers` + `fetchSync` highlight latest provider (`★ NEW`), `live` default `false` (manual toggle), `refreshing` state, **initial fetch nếu chưa có cache**
  - `Logs.tsx`: `logsCache`/`logsStatsCache` preserve `masterKey`/logs/totals, `load()` không xóa trước khi fetch, `masterKey` giữ qua `localStorage`

### Changed
- **Refresh preserves essential keys** — `masterKey` (`localStorage.masterKey`), `endpoint`/`logs`/`total request`/`total token` được cache (`*Cache` + `*At`) và không bị clear khi Refresh hoặc reload; `Logs.tsx`/`Usage.tsx` giữ `allTimeTokens`/`total` cũ nếu fetch mới rỗng
- **Docs**: `README.md`/`README.vi.md` Dashboard 6→7 pages, warning sau `.env` restart thành manual Refresh (Providers env-based, Usage latest provider), `docs/en|vi/OPERATIONS.md` Models/Providers/Scheduler/Endpoints cập nhật manual Refresh, cached, boot-sync 1 lần sau restart
- **Version bump**: `package.json` `apps/gateway` `apps/web` `1.3.0→1.4.0`, `main.tsx` badge `v1.4.0`, `app.ts` version `1.4.0`

### Fixed
- **Providers/Models/Usage không hiển thị data**: do `hasRefreshed=false` ban đầu + `if (!hasRefreshed) return` chặn load, cache trống → trang trắng. Fix: khởi `hasRefreshed:true` + `if (!data)/hasCache` thì `load()+fetchSync()` ngay mount để không trống, vẫn giữ cache + manual Refresh để sync newest (env-based providers, latest provider cho Usage)
- **Typecheck Usage**: `r` → `r2` trong `fetch logs` (`Usage.tsx:85`)
- **better-sqlite3 Node 26**: upgrade `better-sqlite3` `^9.2.2` → `^13.0.3` (`apps/gateway/package.json:34`) với prebuild Node 20–26 (ABI 147). Fix `npm i` lỗi `node-gyp` / `v8-internal.h: concept/requires` trên Node 26 + Apple clang 21. Docs thêm troubleshooting Node 20–26 ở `docs/GETTING_STARTED.md:8`, `docs/en/GETTING_STARTED.md:8`, `docs/vi/GETTING_STARTED.md:8` — Docker (`node:20-alpine`) không ảnh hưởng.

## [1.3.0] - 2026-09-11

### Added
- **LB health probes** — `GET /health` (liveness) + `GET /health/ready` (readiness) không auth cho load balancer / K8s. `docker-compose.yml` + `Dockerfile` healthcheck 10s/30s dùng `/health/ready`. `apps/gateway/src/app.ts:74`
- **Production guide** — `docs/en/PRODUCTION.md` mới: migration SQLite→Postgres, monitoring (Promtail/Loki, `/api/stats`/`/api/analytics`), backup/restore, Caddy TLS, scaling, troubleshooting
- **Integration tests** — `apps/gateway/src/tests/integration.test.ts` 14 tests full pipeline (auth→route→provider→normalize): public endpoints, chat fallback, x-api-key auth, scoped key + x-router, virtual key lifecycle
- **Logger secret redaction** — Pino `redact` cho `Authorization`/`x-api-key`/`Cookie` + `err.config.headers`, export `REDACTED_PATHS`. `apps/gateway/src/middleware/logger.ts:5` + 3 tests `logger-redact.test.ts`
- **Typed test helpers** — `resJson<T>()` + shared response interfaces (`OpenAIChatResponse`, `OpenAIErrorBody`, `HealthResponse`…) thay `const data: any`. `apps/gateway/src/lib/types.ts`

### Changed
- **Models catalog split** — `models.yaml` (3279 dòng, 338 models) → `models/` (26 files per-provider, 338 models). Loader `apps/gateway/src/lib/models-yaml.ts` mới ưu tiên `models/` → fallback legacy `models.yaml`. `apps/gateway/src/routes/v1/models.ts` DRY import. `scripts/sync-freellms.py` ghi `models/<slug>.yaml`, `scripts/validate-models.py` validate cả dir. `Dockerfile` copy `models/` thay vì `models.yaml`
- **Health version dynamic** — `apps/gateway/src/routes/v1/health.ts` đọc từ `package.json` thay vì hardcode `1.2.0`, multi-candidate fallback cho Docker prod
- **CI** — `.github/workflows/ci.yml` fix `npm run test` command (bỏ `||` vô nghĩa), thêm artifact upload on failure, đổi validate arg `models.yaml` → `models`
- **Version bump** — `package.json` `apps/gateway` `apps/web` `1.2.0→1.3.0`, `main.tsx` badge `v1.3.0`, `app.ts` version `1.3.0`

### Fixed
- **Typecheck clean** — `any` trong production code về 0 (chỉ còn comment), optional chaining fixes, Provider cast fixes — `tsc --noEmit` 0 errors, `eslint` 0 errors (251/251 tests)
- **Docker build** — fix `COPY models.yaml` fail khi file bị xóa

## [1.2.0] - 2026-09-10

### Added
- **Auto boot-sync khi update `.env` + restart gateway** — mỗi khi thêm provider mới (cấp key mới trong `.env`) và chạy lại gateway thì 3 trang tự động cập nhật không cần bấm `Sync Live`:
  - `apps/gateway/src/jobs/boot-sync.ts:1` job mới phát hiện provider mới qua `data/.provider-fingerprint.json` (`hasKey` chuyển `false→true`, tính `addedAt`/`lastAdded`), tự động chạy `syncLiveModels({freeOnly:false})` + `verifyFreeModels()` sau 3s khởi động, lưu `bootSync`/`liveSync` state, xử lý kẹt `running`
  - `apps/gateway/src/jobs/scheduler.ts:43` tích hợp `runBootSync()` — thay vì chỉ verify khi stale 24h, giờ luôn kiểm tra fingerprint; có provider mới thì live-sync ngay, fallback vẫn verify khi stale
  - `apps/gateway/src/routes/api.ts:42` thêm `GET /api/sync/status` + `POST /api/sync/boot` (trả `fingerprint`, `newestProviders`, `bootSync`, `liveModels`), enrich `GET /api/providers` trả `addedAt`/`isNewest`/`sync.lastAdded` để UI highlight
  - `apps/web/src/pages/Providers.tsx:1` poll `/api/sync/status` 5s + poll providers 8s + `visibilitychange`, badge `★ NEW` tím + border tím + `live-models`/`bootSync` info trên header, `isNewest` highlight
  - `apps/web/src/pages/Models.tsx:1` poll sync 6s + poll models 10s, tự `fetchModels()` khi `liveModels.generated_at` đổi hoặc `lastAdded` xuất hiện → trang Models tự sync models của provider vừa thêm
  - `apps/web/src/pages/Usage.tsx:1` fetch sync status, sort topology `newestProviders` lên đầu, line/node tím `★ NEW`, auto highlight newest provider khi idle, banner `NEW provider: xxx`
- **Docs 1.2.0**: `CHANGELOG 1.2.0`, bump version `package.json` + `apps/gateway` + `apps/web` `1.1.0→1.2.0`, `app.ts` + `health.ts` + `main.tsx` badge `v1.2.0`, `README` + `docs/en|vi/OPERATIONS|ARCHITECTURE|CONFIGURATION` mô tả boot-sync

### Changed
- **Version bump**: `package.json` `apps/gateway` `apps/web` `1.1.0→1.2.0`, `main.tsx` badge `v1.2.0`, `app.ts:72` + `health.ts:10` `version 1.2.0`

## [1.1.0] - 2026-09-10

### Added
- **B.AI provider** (`https://chat.b.ai/key` → `https://api.b.ai/v1`, OpenAI-compatible): `b-ai` + alias `bai`/`chat-b-ai` trong `registry.ts:36,39-40`, `providerMeta` Permanent Free, `BAI_API_KEYS` (`config.ts`, `.env.example`, `docker-compose`), 4 models free `b-ai/qwen3.8-flash` (72), `b-ai/hy3` (71), `b-ai/mimo-v2.5` (70), `b-ai/glm-5.3-flash` (69) trong `models.yaml:3186-3218`, alias `qwen3.8-flash`/`hy3`/`mimo-v2.5`/`glm-5.3-flash` → `b-ai`, `FALLBACK_TIERS` thêm `b-ai`
- **TokenHarbor provider** (`https://tokenharbor.ai/models?category=free` → `https://tokenharbor.ai/v1`, OpenAI `/v1/chat/completions` + Anthropic `/v1/messages`): `tokenharbor` trong `registry.ts:37`, `providerMeta` Permanent Free, `TOKENHARBOR_API_KEYS` (`config.ts`, `.env.example`), 4 models `tokenharbor/deepseek-v4.1-flash:free` (68), `deepseek-v4-flash:free` (67), `mimo-v2.5:free` (66), `qwen3.8-flash:free` (65 reserved) trong `models.yaml:3219-3250`, alias `:free` → `tokenharbor` (live `freeRows` hiện 3, slot thứ 4 dự phòng)
- **Usage page** (`apps/web/src/pages/Usage.tsx:1`): trang `/usage` mới (nav `BarChart3`, i18n `nav.usage` VI/EN) — topology provider (App ở giữa, line xanh animated cho provider active), tokens/requests by provider, status pie, SSE live (`/api/logs/stream` với `AbortController` + `reader.cancel()`), fetch-all pagination `limit=50` qua nhiều page để lấy đủ 51 providers (fix bug cũ `limit=100` fallback về 25 chỉ hiện 25/51)
- **Provider pagination fix**: `api.test.ts:24` `expect(Math.min(50, total))` thay vì `== total` để pass khi total >50 sau khi thêm provider

### Changed
- **Dashboard/Logs refactor (6 pages)**: `Dashboard.tsx:225` bỏ `tokens_by_provider` BarChart (chuyển sang Usage), `Logs.tsx:1,24` bỏ 3 charts (`byProvider`, `tokensByProvider`, `statusDistribution`) và summary tokens, chỉ giữ bảng request log + SSE stream với `AbortController` safe (`controller.abort()` + `reader.cancel()` + cleanup timer) — charts và stats giờ ở `/usage`
- **Version bump**: `package.json` `apps/gateway` `apps/web` `0.9.0→1.1.0`, `main.tsx` badge `v1.1.0`, `app.ts:72` + `health.ts:10` `version 1.1.0`
- **Docs**: `README.md`/`README.vi.md` badges `41→51 Providers`, `324→338 Models`, dashboard 5→6 pages, provider table thêm B.AI/TokenHarbor; `docs/en|vi/PROVIDERS.md` 41→51 IDs, 316→338 models, thêm rows B.AI/TokenHarbor; `docs/en|vi/ARCHITECTURE.md` 41→51 ids, 324→338 models
- **Models catalog**: `models.yaml:1` header `316→338` (316 freellms + 14 KiraAI + 8 B.AI/TokenHarbor), `models.yaml:3186` 8 models mới
- **Env**: `.env.example:93,95` + `.env:91,93` thêm `BAI_API_KEYS`/`TOKENHARBOR_API_KEYS`, `FALLBACK_TIERS` thêm `b-ai`/`tokenharbor`

### Fixed
- **Provider count >50**: test `api.test.ts:24` clamping logic để chi tiết không fail khi tổng provider vượt limit 50 (51 hiện tại)

## [0.9.0] - 2026-09-09

### Added
- **Fallback executor dùng chung**: new `lib/provider-executor.ts` `tryProviders()` (breaker → key → quota → skip → call → bookkeeping) thay 6 vòng lặp trùng nhau ở `chat/anthropic/responses/embeddings/images/audio` (~300 LOC trùng được xóa); 429 gắn `retryAfterMs` vào error entry
- **Redis sliding-window-counter (Lua)**: new `lib/sliding-window.ts` (current + previous window weight tuyến tính, atomic check+commit, fail-open về in-memory khi mất Redis); `quota-tracker.ts` `checkQuotaAsync` + dual-write `recordUsage` (giữ `getQuotaHeadroom` hoạt động); `middleware/rate-limit.ts` dùng chung (giữ nguyên headers `x-ratelimit-*`, thêm `remaining` chính xác)
- **Query-aware compression**: new engine `relevanceKeep` (BM25-lite overlap với user message cuối, giữ system + 3 recent + top-5 relevant, chronological) chạy trước `historySummarize` trong pipeline mặc định; `normalizeCodeBlock` cho `codeDedup` bắt bản paste gần giống (khác indent/space)
- **Cost routing theo success-rate**: `getProviderSuccessRate` (request-log last100, default 1 khi thiếu data) + `SUCCESS_WEIGHT=2` (env, `docker-compose.yml`, `GET /api/config`); công thức `cost*5 + latency*0.0005 - headroom*0.3 - success*2`
- **Anthropic `tool_use` passthrough**: `translateAnthropicToOpenAI` giữ `tool_use` → OpenAI `tool_calls` (trước đây drop lặng lẽ, agentic flow mất tool calls)
- **Parallel embeddings**: `embedWithFallback` fire all candidates song song, lấy success đầu tiên theo priority (trước đây serial, worst-case 3×timeout)
- **Weighted key pool**: `getNextKeyManaged` least-failed-first + LRU tie-break (thay round-robin đều); `markSuccess` reset failCount đưa key khỏe lên lại
- **Gemini fail-fast**: `isKnownGeminiModel` trả 404 local cho model lạ (không đốt upstream call, fallback ngay)
- **Batched request-log**: `addLog` chỉ mark-dirty, flush disk mỗi 2s + `flushRequestLogs()` + flush on exit (trước đây `writeFileSync` mỗi request trên hot path); `getStats` thêm `errorsByProvider`
- **Quota cho embeddings/images/audio**: `quotaTokens` heuristic (embeddings theo input, images prompt+256, transcription 500, speech input+200) — trước đây 3 routes bypass quota

### Fixed
- **`GET /api/analytics` trả `{}` rỗng**: thiếu `await` ở `getAnalytics`/`calculateSavings` — giờ trả payload thật (test khóa `totalRequests`/`hitRate` là number)
- **`GET /v1/models?q=` lọt 2 alias cứng**: `free-llm-gateway/auto` + `pollinations/openai` luôn append bất chấp `q` — giờ tôn trọng filter
- **`POST /v1/images/generations` mock không gate**: dev mock giờ cần `ALLOW_MOCK=1` như chat/audio/embeddings (trước đây chỉ cần `NODE_ENV=development`)
- **Breaker đếm nhầm 4xx**: new `recordFailureIfRetryable` — chỉ đếm exception/timeout/429/5xx, 4xx (model sai, params sai) không trip breaker

### Changed
- **Version bump**: `package.json` `apps/gateway` `apps/web` `0.8.0→0.9.0`, `main.tsx` badge `v0.9.0`, `app.ts` + `health.ts` `version 0.9.0`
- **Tests**: 207→232 (new `provider-executor.test.ts` 7, `sliding-window.test.ts` 6, relevance/normalize/tool_use/gemini-404/demotion/flush/retryable/quota-async); `cost-router` ordering tests pin `successWeight: 0` để độc lập ambient log state

## [0.8.0] - 2026-09-09

### Security
- **Bootstrap secure by default**: `app.ts` `isBootstrapExposed()` opt-in (`1/true/yes/on`), default `0` — `GET /api/bootstrap` + `/api/config/master` trả 403 + `Cache-Control: no-store` khi tắt; `.env.example` + `docker-compose.yml` default `0`; docs EN/VI đồng bộ; `config.ts` warn khi bật bootstrap/CORS `*`/`NODE_TLS_REJECT_UNAUTHORIZED=0` ở production
- **Key handling**: `config.ts` không log full `MASTER_KEY` (chỉ prefix, cả dev), `key-manager.ts` throw khi `ENCRYPTION_KEY` <64hex ở production, `auth.ts` dùng `crypto.timingSafeEqual`, `api.ts` validate `POST /keys` (name/scopes/rpm/tpd bounds) + `POST /models/health/mark` (ids≤100, http_status clamp)
- **TLS**: `.env.example` bỏ `NODE_TLS_REJECT_UNAUTHORIZED=0` mặc định (chỉ comment hướng dẫn + `NODE_EXTRA_CA_CERTS`), `SECURITY.md` checklist giữ nguyên
- **Rate-limit**: `middleware/rate-limit.ts` cleanup 60s + cap 10k windows chống memory-leak/DoS

### Fixed
- **models.yaml**: fix `z-ai/glm-4.6v-flash` thiếu fields, `groq/allam-2-7b` duplicate keys, `nvidia-nim/nemotron-3-super` thiếu tier/caps, `kilo-auto/free` stray block, quote 2 ids (`siliconflow/abbreviation`, `modelscope/medaibase/antangelmed`), fill `capabilities:[text]`/`tier:permanent` cho 77 entries 8192-ctx; thêm `scripts/validate-models.py` + CI check + `models-yaml.test.ts`
- **Deduplicate**: new `lib/provider-keys.ts` single source `PUBLIC_PROVIDERS/isRealKey/hasRealKey/STRICT_SINGLE_TIER_MAX`; `router.ts`/`key-manager.ts`/`api.ts`/`models.ts` dùng chung; `config.ts` `DEFAULT_FALLBACK_TIER` + validate `FALLBACK_TIERS` (cap 8 tiers x 60)
- **Lint**: `eslint.config.js` nâng `no-empty/prefer-const/no-console/no-eval/no-unused-vars` lên `error` (+ override `scripts` cho phép console), fix 83 errors → `0 errors` (còn 326 `any` warnings); `token-estimator.ts` bỏ `eval(require)` → `createRequire`
- **Tests**: 10→21 tests — new `provider-keys.test.ts` (4), `circuit-breaker.test.ts` (3), `virtual-keys-scope.test.ts` (3), `models-yaml.test.ts` (1)

### Changed
- **Version bump**: `package.json` `apps/gateway` `apps/web` `0.7.3→0.8.0`, `main.tsx` badge `v0.8.0`, `app.ts` + `health.ts` `version 0.8.0`

## [0.7.3] - 2026-09-09

### Added
- **KiraAI provider**: `registry.ts` `kiraai` + alias `kira` (`https://kiraai.vn/api/v1`, OpenAI compatible, 150M free tokens/day), `providerMeta` Permanent Free, `KIRAAI_API_KEYS` (`config.ts`, `.env.example`, `docker-compose.yml`, web `getBaseUrls/getKeyUrls`), 20 models `kiraai/*` (`models.yaml` + `models.ts:opencodeSupplement` vì `freellms-models-free.json` override `models.yaml`): `kira-mini-1.0` (free default), `kira-auto`, `kira-3.5/2.5-pro/flash`, `kira-3.0/2.0-image`, `kira-3.0/2.0-flash-tts`, `mimo-v2.5-free`, `hy3-free`, `glm-5.3(-flash)-free`, `qwen3.8(-27b)-flash-free`, `ling-3.0-flash-sante-free`, `deepseek-v4(-flash/-pro/-flash-0731)`; `gpt-5.6-luna` thêm fallback `kiraai`

### Changed
- **Bootstrap enabled by default**: `app.ts` `isBootstrapExposed()` opt-out (chỉ tắt khi `0/false/no/off`), `.env.example` + `docker-compose.yml` default `1`, docs EN/VI `CONFIGURATION/API/GETTING_STARTED` đồng bộ
- **Version bump**: `package.json` `apps/gateway` `apps/web` `0.7.2→0.7.3`, `main.tsx` badge `v0.7.3`, `app.ts` + `health.ts` `version 0.7.3`

## [0.7.2] - 2026-09-09

### Fixed
- **Security**: `app.ts:39` bootstrap `EXPOSE_BOOTSTRAP` default `0` secure (403 unless `1/true`), remove `GET /api/providers` dev bypass `app.ts:108`, mask `MASTER_KEY` log in production `config.ts:69`, `auth.ts:29` + `virtual-keys.ts:138` remove `fgk-` dev fallback (opt-in `ALLOW_DEV_FALLBACK=1`), mock `200 _mock` gated by `ALLOW_MOCK=1` `chat.ts:352` `anthropic.ts:525` `embeddings.ts:110` `audio.ts:113,170` + `logger.ts:9` requestId + `audio 25MB` limit
- **Deduplicate**: `lib/sanitize.ts` + `lib/model-store.ts` TTL 5s extract `sanitizeFreellmsName` + `loadVerifiedMap` from 3 routes, `openai-compatible.ts:45` + `models.ts:13` share helper, `cost-router.ts:45` remove typo `sambanova_cohere`, add `stopLatencyWatcher` fix `watchFile` leak, `router.ts:6` split `rrIndex/keyIndex` race
- **Quality**: `eslint.config.js:14` `no-explicit-any: warn`, `no-console: warn`, `Dockerfile:1` `node:20→22`, `virtual-keys.ts:50` debounce `saveAsync` 1s, `models.ts` compat `loadVerifiedMapFull`, remove 66 pad lines `audio.ts:176`

### Added
- **Tests**: `vitest.config.ts` + `sanitize.test.ts` `auth.test.ts` `router.test.ts` `cost-router.test.ts` 10 tests, `ci.yml` `lint+typecheck+build+test`
- **Docs**: `README.md:3,69,273` + `README.vi.md:3,267` remove `OmniRoute/9Router/FreeLLMAPI` tagline/References, fix EN pipeline Vietnamese

### Changed
- **Version bump**: `package.json:5` `apps/gateway:5` `apps/web:5` `0.7.1→0.7.2`, `main.tsx:100` badge `v0.7.2`, `app.ts:60` + `health.ts:10` `version 0.7.2`

## [0.7.1] - 2026-09-09

### Fixed
- **Flags quality**: `config.ts:151` `parseBoolEnv` hỗ trợ `1/true/yes/on` cho `SEMANTIC_CACHE_ENABLED`/`COMPRESSION_ENABLED`/`COST_ROUTING_ENABLED`; `cost-router.ts:137` thay `eval(require)` bằng `import {config}` + `syncPricing` cooldown khi fail; `semantic-cache.ts:116` xóa dead `keyword boost` + scan LRU `reverse()`; `routes/v1/chat.ts:4,14` + `anthropic.ts:4,16` xóa duplicate `config as cfg`; `anthropic.ts:258,304` parity compression `maxTokens` + dùng `messagesToSend` cho `provider.anthropic` + `estimatedForQuota`
- **Docs**: `docs/en|vi/ARCHITECTURE.md:150` fix cost-aware formula `cost*5 + latency*0.0005 - headroom*0.3` (env override)

### Changed
- **Version bump**: `package.json:5` `apps/gateway:5` `apps/web:5` `0.7.0→0.7.1`, `main.tsx:100` badge `v0.7.1`, `app.ts:55` + `health.ts:10` `version 0.7.1`

## [0.7.0] - 2026-09-08

### Added
- **Models copy ID**: `apps/web/src/pages/Models.tsx:149` thêm icon `Copy` cạnh `ID` trong bảng `Models` (group `inline-flex gap-1.5`, `navigator.clipboard.writeText`, `copiedId` → `Check` emerald 1.5s, `lucide-react:Copy`)

### Changed
- **Alias rename**: `gateway-llm/auto` → `free-llm-gateway/auto` toàn codebase — `registry.ts:107` `modelAliases`, `models.ts:255,348,358` 3 alias `id`, `anthropic.ts:144,147` `normalizeAnthropicModel`, `Models.tsx:149,154` `ALIAS_IDS` + whitelist, `README.md:25`/`README.vi.md:25` Claude Code doc
- **Version bump**: `package.json:5` `apps/gateway:5` `apps/web:5` `0.6.2→0.7.0`, `main.tsx:100` badge `v0.7.0`, `app.ts:55` `version 0.7.0`

## [0.6.2] - 2026-09-08

### Fixed
- **Anthropic Claude Code 404/400**: `anthropic.ts:144` `post("/messages")` → `post("/")` khi mount `/v1/messages` (duplicate `/v1/messages/messages` 404), `app.ts:60` chấp nhận `x-api-key` cho Claude Code, `normalizeAnthropicModel` `auto`→`claude-3-5-sonnet` và `free-llm-gateway/auto` giữ nguyên, `system: string|array` + `messages.role: string` + extract `role:system` vào `system`, `max_tokens` optional
- **Fallback strict + .env sync**: `router.ts:25` single-tier `<=8` không append remaining + không re-sort, giữ đúng order `pollinations,llm7-io...`, `.env:20` update `FALLBACK_TIERS` single-tier, phải restart gateway (config boot `config.ts:22`)
- **Docs EN VI**: `docs/en/ARCHITECTURE.md:1` dịch Vietnamese → English (title, overview, request flow, router, key mgmt, rate limit, structure)
- **Logs key warning**: `Logs.tsx:103` `<>` → `<React.Fragment key={l.id}>` fix `Each child should have unique key`
- **Registry alias**: `registry.ts:106` chỉ giữ `free-llm-gateway/auto` 20 providers, remove `llm-gateway/auto` + `auto` theo yêu cầu, typo `ollama-clound→ollama-cloud`

### Changed
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.6.1→0.6.2`, `main.tsx:100` badge `v0.6.2`, `app.ts:55` `version 0.6.2`

## [0.6.1] - 2026-09-08

### Fixed
- **Settings embedding check**: `Settings.tsx:132` Check `EMBEDDING_MODEL` + `EMBEDDING_FALLBACKS` via `POST /v1/embeddings` 8s → border `green-500` ok / `red-500` error + chips `✓/✗` như `Models` page, `i18n.tsx:186` `settings.check/checking` VI/EN
- **Master key input + Keys Step 1**: `main.tsx:157` `MASTER` input `disabled=false readOnly=false` + `KeyGen` `genOpen=true` mặc định expand, `Sync from server` cạnh `Use in UI` `Keys.tsx:138` `GET /api/bootstrap` thay vì header refresh, fix `Admin required` `app.ts:91` khi `localStorage` lệch BE
- **Providers**: thêm `claude-code` (Anthropic clone `caps code/vision`) + `codex` (`api.openai.com/v1` `caps code`) `registry.ts:63` `providerMeta:claude-code/codex`, `config.ts:203` `CLAUDE_CODE_API_KEYS`/`CODEX_API_KEYS`/`OPENAI_API_KEYS`, `FALLBACK_TIERS` tier 5 `anthropic/claude-code/codex/agnes-ai`, `getKeyUrls.ts:44`, `.env.example:32`
- **startTime shadowing**: `Settings.tsx:143` rename `const t=setTimeout` → `timer` tránh ghi đè `t("settings.*")` i18n gây `VM3108 startTime` `motion` error

### Changed
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.6.0→0.6.1`, `main.tsx:100` badge `v0.6.1`, `app.ts:55` `version 0.6.1`

## [0.6.0] - 2026-09-08

### Added
- **Vector 1 — Gateway parity**: `POST /v1/audio/transcriptions|translations|speech` (Groq Whisper, multipart) `routes/v1/audio.ts:1`, `POST /v1/responses` + `GET /v1/responses/:id` + `POST /v1/conversations` (Hebo Responses) `lib/responses-translator.ts:1`, `POST /v1/messages` + `POST /v1/messages/count_tokens` (Anthropic compat) `providers/anthropic.ts:1` + `lib/anthropic-translator.ts:1`, `providers/base.ts:52` mở rộng `transcriptions/speech/responses/anthropic`, `providers/openai-compatible.ts:13` fallback chain, `providers/registry.ts:63` `anthropic`, `config.ts:203` `ANTHROPIC_API_KEYS`, `app.ts:13` mount `/v1/audio|responses|messages|conversations`
- **Vector 2 — Intelligence**: `lib/redis.ts:1` singleton `ioredis`, `lib/token-estimator.ts:1` thử `js-tiktoken` fallback `len/4`, `lib/quota-tracker.ts:1` thêm `RPD/TPD` 24h + `getQuotaHeadroom`, `lib/request-log.ts:7` `cost/cacheHit/compressedTokens` + `p95/cacheHitRate`, `lib/compression.ts:1` 3-engine `toolsMinify/historySummarize/codeDedup`, `lib/cost-router.ts:99` `rankProvidersByCostAndLatency` + `syncPricing` LiteLLM CDN, `lib/semantic-cache.ts:1` `sha256` + Redis + cosine `EMBEDDING_MODEL`, `lib/embeddings.ts:8` fallback chain `cohere→nvidia→cloudflare→hash`, `lib/analytics.ts:53` `GET /api/analytics|cache|compression`, `routes/api.ts:15` `GET /api/config` + `GET /api/cache/stats`, `routes/v1/chat.ts:105` pipeline `Cost→Cache→Compression→Upstream→Cache store`, `docker-compose.yml:36` `redisdata` + env flags
- **Settings UI**: `apps/web/src/pages/Settings.tsx:1` page `/settings` ngoài cùng phải `main.tsx:88` `ml-auto`, defaults `.env` `GET /api/config` → `localStorage.gatewaySettings` `i18n.tsx:11` VI/EN, `.env` snippet copy, `config.ts:161` `EMBEDDING_MODEL` + `EMBEDDING_FALLBACKS`, `docker-compose.yml:36` env
- **Docs & README**: `docs/en|vi/API.md` Audio/Responses/Anthropic + `GET /api/analytics|cache`, `docs/en|vi/ARCHITECTURE.md` Provider interface + Router cost + dir tree, `docs/en|vi/CONFIGURATION.md` Vector 2 flags, `docs/en|vi/ROADMAP.md` P6 `M6`, `README.md:55` pipeline `Cost→Cache→Compression`

### Changed
- **Pipeline re-order**: `routes/v1/chat.ts:114` cache trước compression (chỉ nén khi miss) để tiết kiệm compute, khớp flow `Cost Routing → Semantic Cache → Compression → Upstream`
- **Embedding hard fallback**: `config.ts:161` `EMBEDDING_MODEL` có thể comma-separated + `EMBEDDING_FALLBACKS`, `lib/embeddings.ts:52` `embedWithFallback` thử `cohere`→`nvidia-nim/nv-embed-v1`→`cloudflare/bge-large`→hash, `semantic-cache.ts:58` lưu `embedding` kèm `value` để cosine scan `threshold 0.92`
- **Version bump**: `package.json:4` `apps/gateway:4` `apps/web:4` `0.5.1→0.6.0`, `main.tsx:100` badge `v0.6.0`, `app.ts:55` `version 0.6.0`

## [0.5.1] - 2026-09-08

### Fixed
- **6 models by default (b930e6d regression)**: `apps/gateway/src/routes/v1/models.ts:27` fallback `data/freellms-models-free.json` (deleted, fresh clone empty) → `models.yaml` (312–316 snapshot) nếu json thiếu. Trước fix `loadFreellmsModels()` trả `[]` → fallback `staticModels` 6 models (`groq/llama-3.3-70b` etc.). Sau fix `GET /v1/models?limit=1000` trả `354` total (hasKey OFF, freellms 316 + supplement + pollinations) và `819` khi `?hasKey=1` (live 788). Đã khôi phục `data/*.json` cục bộ để test nhưng code mới xử `fresh clone` không cần data.

## [0.5.0] - 2026-09-08

### Fixed
- **Windows `better-sqlite3` + Node 22**: require `Node >=22` (`package.json:37` engines), `better-sqlite3@^13.0.3` prebuild ABI 127–147, fix `gyp ERR!` trên Windows nvm4w + thiếu Build Tools — docs `README.md:70`, `docs/en|vi/GETTING_STARTED.md:8`, `docs/en|vi/CONFIGURATION.md:176` (Node 22 LTS, `node:22-alpine`).

### Changed
- **Providers 43→41**: remove `9router`/`omniroute` (`config.ts:192`, `registry.ts:49`, `routes/v1/models.ts:122` + aliases `ag/gemini-3.7-flash-high`, `kc/minimax-m3:free` etc.) — docs `README.md:8`, `docs/en|vi/PROVIDERS.md`, `docs/en|vi/API.md`, `docs/en|vi/ARCHITECTURE.md` cập nhật `41 IDs (30+11 alias)`, health `41` providers.
- **Fresh clone data empty**: `b930e6d` xóa `data/*.json`, `.gitignore:18` `data/*.json` + `!data/.gitkeep`, `data/.gitkeep` + `apps/data/.gitkeep` — fresh clone chỉ có `.gitkeep`, phải chạy `Sync Live Now` `POST /api/models/live/sync` để nạp `data/live-models.json` — docs `GETTING_STARTED.md:36`, `CONFIGURATION.md:71`.
- **Docs Node + Windows**: `e1293db` badge `Hono+Bun→Hono+Node`, `README.md:70` `Node >=22 + npm >=10`, `GETTING_STARTED.md:148` + `CONFIGURATION.md:65` thêm kill old process guide per OS (Docker `restart gateway`, macOS/Linux `pkill+lsof`, Windows PowerShell `netstat/taskkill/Get-NetTCPConnection` + CMD/Git Bash).

### Added
- **Auto-bind MASTER_KEY bootstrap** (`8f1b3b7`): gateway public `GET /api/bootstrap` + `/api/config/master` (`app.ts:23`, bypass `/api/*` auth, disable via `EXPOSE_BOOTSTRAP=false`), web header Master input editable (password/text toggle, `main.tsx:40`) auto-fetch bootstrap nếu `localStorage` placeholder (`fgk-master-dev-key`/`change-me`/len<16) và re-bootstrap khi `401` — docs `GETTING_STARTED.md:36`, `ARCHITECTURE.md:27`, `CONFIGURATION.md:23`, `API.md:155`.


## [Unreleased]

### Added
- **P1 Scaffold**: Hono 4.x + Vite React, Drizzle SQLite, Docker Compose, `.env.example` 30 providers, `GET /v1/health` + `GET /v1/models` (316 free)
- **Freellms Sync**: Scan `https://freellms.org/providers` (30) + `/models` (365, 316 free `data-free=1`), `data/freellms-providers.json`, `data/freellms-models-free.json`, `models.yaml` (316), `scripts/sync-freellms.py`
- **Providers Registry**: 40 ids (30 freellms slugs + alias), baseUrls từ freellms, `providerMeta` caps/tier, alias `auto/gpt-4/glm/qwen/code/embedding` (12 keys), 4-tier `FALLBACK_TIERS`
- **Live Verify (24h)**: `jobs/verify-free.ts` probe live `/models` vs freellms, statuses `verified_free/deprecated/unverified_no_key/error`, `data/verified-models.json` + `summary`, `GET /v1/models?verified=free` filter, `GET /api/verify` + `POST /api/verify`, dry-run cho CI
- **Scheduler**: `jobs/scheduler.ts` `SYNC_INTERVAL_MS=86400000` (24h), auto verify sau 5s nếu stale, `DISABLE_SCHEDULER` flag, `src/index.ts` startScheduler
- **GitHub Actions**: `.github/workflows/sync-freellms.yml` daily 02:00 UTC — sync + verify + auto-commit
- **Docs**: `ARCHITECTURE.md` (30 providers, 316, scheduler), `API.md` (verified filters, /api/verify), `PROVIDERS.md` (30 bảng baseUrls), `FREELLMS_FREE_TIER.md` (ranking, 316), `OPERATIONS.md` (2-layer sync), `CONFIGURATION.md` (30 envs + tiers + rate limits), `DEPLOYMENT.md` (scheduler + cron), `ROADMAP.md` (P1 done + verify)
- **Gateway**: `models` route freellms + verified annotate, `api` route detailed + stats, `openai-compatible` allow no-key
- **P2 Gateway Core**: 30 adapters, streaming SSE (Gemini `alt=sse` → OpenAI), tool calling, `auto` 15-tier fallback → pollinations live (10.3s), `x-router` pin, `models` pollinations fallback, e2e pollinations (gpt-oss-20b) non-stream/stream
- **P3 Resilience**: `key-manager.ts` AES-256-GCM + round-robin + `markRateLimited`, `token-estimator.ts` char/4, `quota-tracker.ts` FREELLMS_LIMITS RPM/TPM + `checkQuota/recordUsage`, `circuit-breaker.ts` 5/30s half-open, chat integration (quota pre-check, breaker skip, deprecated skip, `X-Verified`), `GET /api/providers/health` live parallel 5s (online 13/offline 25)
- **P4 Auth+Dashboard**: `lib/virtual-keys.ts` `fgk-...` CRUD SHA256 + scopes + RPM + `data/virtual-keys.json`, `middleware/rate-limit.ts` virtualKey RPM + `x-ratelimit-*`, `app.ts` scope check `x-router` & model + admin gate, `lib/request-log.ts` 1000 logs + tokens aggregation (`allTimeTokens`, `tokensByProvider`, `avgTokens`) `data/request-log.json` + SSE `onLog`, `routes/api.ts` `GET/POST/DELETE /api/keys` + `GET /api/logs` + `/api/logs/stream` + `/api/stats` logs/breakers, chat `addLog` per request, Vite Dashboard 5 routes (Dashboard 4 cards + 3 charts + tokens + recent logs, Models 316 checkbox + single Check Live + Used/Limit, Providers Get Key ↗ + health, Keys Generator + CRUD + Quick Test, Logs 3 charts + SSE) + `lib/paths.ts` fix 7→316 + `lib/getKeyUrls.ts` 30 console URLs
- **P5 Polish**: nav sticky Providers→Models (swap), Dashboard Key Generator move to `/keys`, `index.css` unified card/button/table (nav style), Models remove provider input (use first filter), Stats Detail fix horizontal scroll (pre-wrap + 4000 truncate)

### Changed
- `config.ts` hỗ trợ 30 providers keys + 4-tier default
- `openai-compatible.ts` resolve `{account_id}`, model after first slash, allow no-key, forward full fields
- `gemini.ts` sanitize + `alt=sse` + `gemini-stream.ts`
- `router.ts` `ALLOW_NO_KEY`, `auto` 15-tier, `isPublicProvider`
- `app.ts` virtualKeyRateLimit + isValidVirtualKeyLive + scope checks
- `routes/v1/chat.ts` hasScope + quota + breaker + verified skip + request-log
- `README.md` cập nhật 30 providers / 316 models / P2+P3+P4 done

### Planned
- Post-MVP: `/v1/embeddings`, `/v1/images`, Anthropic compat, BYOK, OAuth

## [1.0.0] - 2026-09-06

- **P5 Hardening**: `wrangler.jsonc` Cloudflare Workers (WinterCG `nodejs_compat`, KV, crons 02:00), `Dockerfile` multi-stage prod (non-root `app`, HEALTHCHECK 30s, copy `data`+`models.yaml`), `lib/otel.ts` GenAI OTel (`gen_ai.*`, `trace_id`, `withTrace`), `app.ts` `secureHeaders` + `cors maxAge 86400` + `bodyLimit` 10MB, `scripts/benchmark.ts` (health 40 + chat pollinations + models/verified → `data/benchmark.json` + `PROVIDER_TEST_RESULTS.md` online 13/offline 25), `scripts/rotate-keys.ts` AES re-encrypt, `SECURITY.md` hardening checklist + rotation docs, `PROVIDER_TEST_RESULTS.md` 2026-09-06T08:26
- MVP 100%: 30 providers, 316 free, 40 ids, 5 Dashboard routes, 24h verify, 15-tier fallback, streaming + tools

## [0.2.0] - 2026-09-06

- Freellms integration: 30 providers, 316 free models, live verify 24h

## [0.1.0] - 2026-09-06

- Initial commit (Apache-2.0)
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md`, `docs/API.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, `.gitignore`
- Scaffold Hono + Vite + Drizzle + Docker, `GET /v1/models` mock
