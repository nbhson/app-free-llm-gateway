> **English** | [🇻🇳 Tiếng Việt](../vi/CONFIGURATION.md) | [Docs Index](../README.md)

# Configuration

## Environment Variables

See the full `.env.example` (30 providers from freellms.org, live sync is now source of truth — freellms disabled). The key groups are below:

### Gateway

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7373` | Gateway port |
| `NODE_ENV` | `development` | `development`/`production` |
| `DATABASE_URL` | `file:./data.db` | Drizzle DB — `file:./data.db` (SQLite) or `postgres://user:pass@host/db` |
| `REDIS_URL` | `redis://localhost:6379` | Redis for rate limiting; falls back to in-memory if empty |
| `MASTER_KEY` | (auto-generated) | Single API key for `/v1/*` + `/api/*` admin. Auto-generated `fgk-master-...` if missing/placeholder, persisted to `.env` or `data/.gateway-keys.json` (Docker). Override for prod via secret manager. |
| `ENCRYPTION_KEY` | (auto-generated) | Internal AES-256-GCM 32-byte hex. Auto-generated 64 hex if missing, never used as API key. |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `CORS_ORIGIN` | `*` | Allow Dashboard origin (2-row header + i18n VI/EN) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | _(unset)_ | Dev-only behind corporate SSL-inspection proxy (Zscaler) if you hit `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. `0` disables verification → MITM risk, **never in prod**. Safer: `NODE_EXTRA_CA_CERTS=/path/to/ca.crt` |
| `SYNC_INTERVAL_MS` | `86400000` | 24h scheduler for verify + live sync |
| `DISABLE_SCHEDULER` | `0` | Set to `1` to disable scheduler |
| `EXPOSE_BOOTSTRAP` | `0` (secure by default) | Public `GET /api/bootstrap` + `/api/config/master` returning `MASTER_KEY` for first-time local UI auto-bind (`app.ts:23`); set `1`/`true`/`yes`/`on` to enable locally only |

### Provider Keys (pooled, comma-separated) — 30 freellms providers, live via real keys

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEYS` | _(empty)_ | Anthropic-compatible `/v1/messages` upstream keys (comma-separated, round-robin). Required only if proxying to Anthropic directly; otherwise OpenAI adapters handle translation. |

```env
# Core
GROQ_API_KEYS=gsk_xxx
CEREBRAS_API_KEYS=csk_xxx
NVIDIA_API_KEYS=nvapi-xxx
GITHUB_TOKENS=ghp_xxx
OPENROUTER_API_KEYS=sk-or-xxx
GEMINI_API_KEYS=AIza_xxx
CLOUDFLARE_API_TOKEN=cf_xxx
CLOUDFLARE_ACCOUNT_ID=acc_xxx

# Anthropic (Vector 1+2 — /v1/messages)
ANTHROPIC_API_KEYS=sk-ant-xxx

# Cohere / Mistral / SiliconFlow / SambaNova / Chutes / HuggingFace
COHERE_API_KEYS=co_xxx
MISTRAL_API_KEYS=mst_xxx
SILICONFLOW_API_KEYS=sk-xxx
SAMBANOVA_API_KEYS=sn_xxx
CHUTES_API_KEYS=ch_xxx
HUGGINGFACE_API_KEYS=hf_xxx

# Freellms — new (2026-09-06 scan, 316 free models — historical, live now 882 free)
MODELSCOPE_API_KEYS=ms_xxx
OVHCLOUD_API_KEYS=ovh_xxx
KILO_CODE_API_KEYS=kc_xxx
OPENCODE_API_KEYS=oc_xxx
LLM7_API_KEYS=llm7_xxx
AGNES_API_KEYS=ag_xxx
AION_API_KEYS=aion_xxx
Z_AI_API_KEYS=zai_xxx
OLLAMA_CLOUD_API_KEYS=ollama_xxx
GLHF_API_KEYS=glhf_xxx
GROK_API_KEYS=xai_xxx
ALIBABA_API_KEYS=sk-xxx
NSCALE_API_KEYS=nsc_xxx
NEBIUS_API_KEYS=nebius_xxx
AI21_API_KEYS=ai21_xxx
POLLINATIONS_API_KEY= # optional — Pollinations anonymous works, but set enter.pollinations.ai key to track per-key budget; gateway forwards Authorization when set (pollinations.ts) and falls back on 402/403 budget

# KiraAI Vietnam (https://kiraai.vn/api/v1) — OpenAI compatible, 150M free tokens/day
KIRAAI_API_KEYS=kira_xxx
```

Leaving a provider empty disables it (except `pollinations`/`llm7-io` scraped providers, which are auto-enabled). Real-key `k.length>20 && !k.includes('xxx') && !k.includes('change-me')` for `hasRealKey` `api.ts:27`. **Changing `.env` requires killing old process & restarting** because `config.ts:22` reads only at boot (`tsx watch` does not watch `.env`):
- **Docker (any OS):** `docker compose restart gateway`
- **macOS/Linux:** `pkill -f "tsx watch"; lsof -ti:7373 | xargs kill -9; npm run dev:gateway`
- **Windows PowerShell:** `netstat -ano | findstr :7373` → `taskkill /PID <PID> /F` (or `taskkill /F /IM node.exe`)
- **Windows CMD/Git Bash:** `netstat -ano | findstr :7373` → `taskkill /PID <PID> /F`

then **auto boot-sync** (`jobs/boot-sync.ts`) tự phát hiện provider mới (qua `data/.provider-fingerprint.json`) và `syncLiveModels` + `verify` sau ~3s — không cần bấm **Sync Live Now** nữa (vẫn có thể bấm `POST /api/models/live/sync` thủ công). Fresh clone có `data/` rỗng (`data/.gitkeep` only, `b930e6d` — `data/*.json` gitignored); lần đầu boot sẽ tự sync nếu có key, hoặc bấm sync. Xem `docs/PROVIDERS.md:1`.

### Router

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MODEL` | `auto` | Model used when the client sends none |
| `FALLBACK_TIERS` | `[[...]]` | JSON freellms tiers: `[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io"],["openrouter","kilo-code","pollinations"]]` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before opening the circuit |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Cooldown duration |

### Vector 1+2 — Audio / Responses / Anthropic / Semantic Cache / Compression / Cost Routing / Analytics (2026-09-08) — now tunable via `/settings` + `PUT /api/config` hot-reload (no restart)

| Variable | Default | Description | UI Control (Settings) |
|----------|---------|-------------|-------------|
| `ANTHROPIC_API_KEYS` | _(empty)_ | Comma-separated Anthropic keys for `/v1/messages` upstream (round-robin) | — (env only, secret) |
| `SEMANTIC_CACHE_ENABLED` | `0` | Enable semantic vector cache for `/v1/chat/completions` + `/v1/messages`. `1` to enable | Toggle + `role=switch` a11y, shows `HIT` vs `Upstream` |
| `SEMANTIC_THRESHOLD` | `0.92` | Cosine similarity threshold for cache hit (0.0–1.0, higher = stricter). Tuned for `cohere/embed-english-v3.0` | Slider `0.7-0.99` + number sync, `recommended 0.92` dot, validation `0..1` |
| `CACHE_TTL_S` | `3600` | TTL in seconds for cached completions (1 hour). Evicted via Redis TTL or in-memory sweep | Number + chips `1h/6h/24h/7d`, cap `604800` (7d) |
| `EMBEDDING_MODEL` | `cohere/embed-english-v3.0` | Embedding model for semantic cache. Uses Cohere embeddings; swap to any compatible endpoint | Text + `Check` live `POST /v1/embeddings` 8s `green-500/red-500` |
| `EMBEDDING_FALLBACKS` | `nvidia-nim/... ,cloudflare/...` | Comma-separated fallback chain → final `hash exact` | Text + per-model `Check` chips `✓/✗/…` |
| `SEMANTIC_CACHE_MAX_MEM` | `1000` | Max in-memory entries before LRU evict (100..10000) | Number `100..10000` |
| `SEMANTIC_CACHE_SCAN_CAP` | `200` | Max entries scanned for cosine hit (10..1000) | Number `10..1000` |
| `COMPRESSION_ENABLED` | `0` | Enable token compression: query-aware `relevanceKeep` (BM25-lite vs last user message, keeps system + 3 recent + top-5 relevant) + tools minify + normalized code dedup | Toggle, dependency: only on cache miss `chat.ts:165` |
| `COMPRESSION_MAX_TOKENS` | `4096` | Token budget before compression kicks in (512..32000) — `>80% context` triggers | Slider `512..32000` |
| `COST_ROUTING_ENABLED` | `0` | Enable cost-aware routing — score `cost*COST_WEIGHT + latency*LATENCY_WEIGHT - headroom*HEADROOM_WEIGHT - successRate*SUCCESS_WEIGHT` (success from request-log last100, default 1 when no data) | Toggle, live formula preview |
| `COST_WEIGHT` | `5` | Cost weight ($/1M) — higher = prefer cheapest | Slider `0..10` |
| `LATENCY_WEIGHT` | `0.0005` | Latency weight (ms) — higher = prefer fastest | Slider `0..0.005` |
| `HEADROOM_WEIGHT` | `0.3` | Headroom weight — higher = avoid near-limit providers | Slider `0..1` |
| `SUCCESS_WEIGHT` | `2` | Success rate weight — demotes flaky providers before breaker opens (`0` disables) | Slider `0..5` |
| `ANALYTICS_RETENTION_DAYS` | `30` | Days to retain admin analytics rollups (`costByProvider`, `cacheHitRate`, `p95` latency) | Slider `1..365` |
| `PROVIDER_TIMEOUT_MS` | `25000` | Timeout for regular providers (1000..120000 ms) | Number `1k..120k` |
| `PROVIDER_TIMEOUT_AUTO_MS` | `8000` | Timeout when `model=auto` (1000..30000) — faster failover | Number `1k..30k` |
| `PROVIDER_PARALLEL_AUTO` | `3` | Parallel providers when `auto` (1..5) | Slider `1..5` |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Consecutive failures before opening breaker (1..100) | Number `1..100` |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `30000` | Cooldown before half-open (1000..300000 ms) | Number `1k..300k` |
| `FALLBACK_TIERS` | `[[...default 41 providers...]]` | Provider priority order — JSON array of arrays (max 8 tiers, 200 providers, 60/tier, deduped) | JSON editor + preview chips + `Add to tier 1` + `Validate & Stage` |

Flags are off by default (`0`) for backwards compatibility. **New:** all tunable live via `/settings` → `Apply to server` `PUT /api/config` (atomic, admin, caps, audit `logger.info`) without restart; also available via `.env` + restart (see kill/restart notes above). `GET /api/config` returns all 29 keys, `PUT` validates ranges and returns `{applied, errors}` 400 on invalid.

### Web Tools — Gateway-hosted web_search + web_fetch (1.8.0)

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_TOOLS_ENABLED` | `0` | Enable gateway web tools. `1` to enable — toggle in **Settings → Web Tools** (applies server-wide, no per-chat Globe button). Frontend reads `WEB_TOOLS_ENABLED` from `/api/config` (cached in `localStorage.gatewaySettings`) and sends `x-web-tools:1` automatically. |
| `WEB_SEARCH_PROVIDER` | `tavily` | Preferred `tavily`/`brave`/`serper`/`jina` (fallback `jina` free, no key, 500 RPM) |
| `TAVILY_API_KEY` | _(empty)_ | Tavily search API key (ranked excerpts, `0.008$/credit`) |
| `BRAVE_API_KEY` | _(empty)_ | Brave Search API key (`$5/1k`, 669ms) |
| `SERPER_API_KEY` | _(empty)_ | Serper API key (`$1-0.3/1k`) |
| `JINA_API_KEY` | _(empty)_ | Jina AI key (optional, `s.jina.ai` free 500 RPM when empty) |
| `WEB_FETCH_TIMEOUT_MS` | `8000` | HTML fetch timeout (ms, max 30000) |
| `WEB_FETCH_MAX_BYTES` | `500000` | HTML size limit (bytes, max 2M, HTML only) |
| `WEB_SEARCH_MAX_RESULTS` | `5` | Search results count (1-10) |
| `WEB_TOOLS_MAX_ITERATIONS` | `3` | Max tool-loop iterations (max 5) |
| `WEB_CACHE_TTL_S` | `3600` | Cache TTL for web_search/web_fetch (s) |

Flow `apps/gateway/src/routes/v1/chat.ts:175` + `lib/web-tools.ts:1` + `lib/ssrf-guard.ts:1` (block `loopback/private/169.254.169.254`, DNS pinning, redirect re-validation, `<web_content>` wrap against prompt injection) + `lib/web-extract.ts:1` (strip script, markdown). Chat default `max_tokens 8192` (max 16384) + `finish_reason:length` detection with **Continue** button.

### Rate Limit

`middleware/rate-limit.ts` — sliding-window-counter over Redis Lua when available (atomic check+commit, shared across instances, no boundary spike), in-memory fixed window otherwise. List endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) get 4x (`Math.max(rpmLimit*4, 200)`), frontend debounces search `q` by 400ms (Models/Providers) to reduce 429.

### Quota

`lib/quota-tracker.ts` — same sliding-window engine for provider quotas (RPM/TPM per minute, RPD/TPD per day). `checkQuotaAsync` probes Redis once per request and falls back wholesale to in-memory when Redis is down; `recordUsage` dual-writes (in-memory mirror keeps `getQuotaHeadroom`/cost-router working). Note: a provider with both TPM and TPD trips TPM first by design (per-minute binds tighter).

## models.yaml — 316 free models (freellms snapshot, historical) + live-models.json (882 free)

Synced historically from freellms.org:

```yaml
models:
  - id: "nvidia-nim/z-ai/glm-5.2"
    display_name: "z-ai/glm-5.2"
    provider: nvidia-nim
    context_length: 1048576
    score: 94
    tier: permanent
    verified: true
    capabilities: [text, reasoning]
    limit: "Up to 40 RPM"
```

Sync job **new** (live source of truth):

```bash
npx tsx apps/gateway/src/jobs/sync-live-models.ts        # fetch live -> data/live-models.json (2185 total, 882 free, freeOnly)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
# Historical
python scripts/sync-freellms.py        # fetch freellms.org -> data/*.json + models.yaml (disabled)
npm run sync:freellms -w apps-gateway  # alias
```

The gateway `GET /v1/models` reads `data/live-models.json:1` (live 882) when `?hasKey=1` with real keys, otherwise `data/freellms-models-free.json:1` (316 rows), and `GET /api/providers` returns `detailed[]` with `free_models`, `hasRealKey` (green highlight), `limit`, and `verified`, pagination LOV 25/50 at sticky bottom (400ms debounce).

## UI Filters — hasKeyOnly + hide404/hidePayment/hideInvalid

`apps/web/src/pages/Models.tsx:32,86` 4 toggles in **Filters** dropdown next to `Verified`: `hasKeyOnly` **default OFF** (`localStorage hasKeyOnly:0`, `hasKeyOnly_migrated`), 3 `hide404`/`hidePayment`/`hideInvalid` default ON. `Refresh` `handleRefresh` clears `q`/`provider`/`verified`, resets `hasKeyOnly:false` + `hide*` true, does not auto-enable `hasKey`. `Check Live (n)` requires `qDebounced || providerDebounced` (tooltip when no filter).

## Persisted Health — 404/410 and usable 200

`data/model-health.json` stores both `404/410` **and** `usable 200` (`api.ts:222 POST /api/models/health/mark` saves `status:"usable",http_status:200`). `GET /v1/models` `v1/models.ts:153` if `h.http_status==200` then `live_status:"verified_free"` overrides `deprecated`. Frontend `Models.tsx:160,366` `isRowDisabled`/`isDisabledForHide` prioritizes `(usage>0) || (live usable 200)` before `404/410`/`deprecated`/`isInvalidId`, so per-row `Check` `GET /api/models/health?model=` → `POST /mark usable` keeps non-red after reload. `GET /api/models/health/persisted` `api.ts:217` lists, `DELETE` clears.

## Rate Limit Config — per-provider (from freellms, live uses same)

| Provider | RPM | RPD | TPM/TPD | Notes |
|----------|-----|-----|---------|-------|
| NVIDIA NIM | 40 shared | — | — | phone required |
| Groq | 30 | 250–14.4K | — | per-model |
| Cerebras | 15 | — | 30K TPM / 1M TPD | — |
| Gemini Flash | 15 | 1.5K | — | — |
| Gemini Lite | 30 | 1.5K | — | — |
| OVH | 2 anon | — | — | — |
| Agnes | 30 | — | — | — |
| OpenRouter | — | 200 free | — | — |
| Kilo Code | ~200/hr | — | — | `:free` suffix |

Stored in `models.yaml:1` `limit` and enforced by `apps/gateway/src/lib/quota-tracker.ts` + `middleware/rate-limit.ts` 4x for list. Token usage `allTimeTokens` + `tokensByProvider` from `lib/request-log.ts:1` powers the Dashboard 4th card and Logs charts (recharts, Live ON SSE + 2s poll).

In the `virtual_keys` table:

```json
{
  "rpmLimit": 60,
  "rpdLimit": 1000,
  "tpmLimit": 100000,
  "tpdLimit": 1000000,
  "scopes": { "models": ["*"], "providers": ["nvidia-nim","groq","google-gemini"] }
}
```

## i18n

`apps/web/src/lib/i18n.tsx` — `VI/EN` dict, `LangProvider`, `localStorage lang` (`vi` default), selector in header row 1 (alongside Master). Docs have `docs/vi/` + `docs/en/` with own banners, root `README.md` default English + `README.vi.md` Vietnamese.

## 2-Row Header

`apps/web/src/main.tsx:40` — `display: flex; flexDirection: column; gap:10`: row 1 `justifyContent: space-between` left logo + health + `30 providers • 316 free` / right `VI/EN` + `Master` **editable input** (password/text toggle, auto-filled from `GET /api/bootstrap` on placeholder/mismatch, `localStorage masterKey`); row 2 nav 5 tabs centered `alignSelf: center`. Previously single row with grid/nav centered — now split into 2 rows. Header input is **not read-only** since `8f1b3b7`.

## Bootstrap — auto-bind MASTER_KEY

`apps/gateway/src/app.ts:23` public `GET /api/bootstrap` (alias `/api/config/master`) returns `{masterKey}` for first-time UI binding. Disabled by default (`EXPOSE_BOOTSTRAP=0`, secure). Frontend `apps/web/src/main.tsx:34` fetches when `localStorage masterKey` is placeholder (`fgk-master-dev-key`/`change-me`/len<16) and re-bootstraps on `401`. Enable locally only via `EXPOSE_BOOTSTRAP=1`.

## Fresh clone data

`b930e6d` clears committed `data/*.json`; `.gitignore:18` now `data/*.json` + `!data/.gitkeep`. Fresh `git clone` → empty `data/`; run `POST /api/models/live/sync` or `npx tsx apps/gateway/src/jobs/sync-live-models.ts` with real keys to populate live cache before `?hasKey=1` works.

## Persisted 404 + hide404

`data/model-health.json` + `localStorage hide404`/`hide404_migrated` — 404/410 strikethrough `line-through #dc2626`, disabled checkbox, `hide404` pill default checked hides from UI, `POST /api/models/health/mark` persists.

## Drizzle Config

`drizzle.config.ts`:

```ts
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_URL.startsWith("postgres") ? "postgresql" : "sqlite",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Migrate (Node >= 22, npm):

```bash
npm run db:generate
npm run db:migrate
npm run db:studio   # GUI
```
