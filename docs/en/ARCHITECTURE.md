# Architecture

This document describes the detailed architecture of `app-auto-llm-free` — unified gateway for free LLMs (30 freellms canonical + aliases via `PROVIDER_ALIASES` = 41 canonical ids, 344 models incl. Google 4 Unlimited Live + Gemma 4 26B/31B).

## 1. Overview

```mermaid
flowchart LR
  Client -->|OpenAI/Anthropic SDK| Gateway
  Gateway --> Router
  Router --> PA[Provider Adapters]
  PA -->|fetch| Upstream
  Upstream --> PA
  PA --> Normalizer --> Gateway --> Client
  Gateway --> Dashboard
  Dashboard --> DB[(SQLite/Postgres)]
  Gateway --> Redis[(Redis<br/>semantic cache)]
  Gateway -.-> Scheduler[24h Verify]
  Scheduler -.-> PA
  freellms.org -.-> Sync[scripts/sync-freellms.py]
  Sync -.-> Data[(data/*.json<br/>+ models.yaml<br/>+ provider-stats.json)]
  Data -.-> Cost[(LiteLLM CDN<br/>cost pricing)]
  Gateway --> Routes[/v1/chat<br/>/v1/embeddings<br/>/v1/images<br/>/v1/audio<br/>/v1/responses<br/>/v1/messages/]
  Gateway --> Libs[lib/redis<br/>lib/semantic-cache<br/>lib/compression<br/>lib/cost-router<br/>lib/analytics]
```

* **Gateway**: Hono app running on Bun/Node/Cloudflare Workers (WinterCG). Multi-runtime, ultrafast RegExpRouter. Vector 1+2 routes: `/v1/chat/completions`, `/v1/embeddings`, `/v1/images/generations`, **new** `/v1/audio/transcriptions`, `/v1/audio/speech`, `/v1/responses` (+ alias `/v1/conversations`), `/v1/messages` (Anthropic) — see `app.ts:14` + `routes/v1/audio.ts`, `routes/v1/responses.ts`, `routes/v1/anthropic.ts`. Middleware: `secureHeaders` + `cors` + `bodyLimit` 10MB **skip for `multipart/form-data` audio** (`app.ts:29` `if path startsWith /v1/audio`) + `traceparent` propagation via `requestLogger`/`otel` + `virtualKeyRateLimit`.
* **Router**: Select provider pool based on `model`, alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`), header `x-router`, tier fallback 4-tier freellms, sanitize `gemini 3.6 flash`/`nvidia: nemotron` (`openai-compatible.ts:31`). When `COST_ROUTING_ENABLED=1` re-rank via `rankProvidersByCostAndLatency` (`lib/cost-router.ts:99`).
* **Adapters**: Each provider implements `Provider` interface. 41 canonical ids (30 freellms NVIDIA 97, ModelScope 43, Cloudflare 35..., aliases `gemini→google-gemini`, `bai→b-ai`, `nvidia→nvidia-nim` via `PROVIDER_ALIASES` `registry.ts:67`) via `createOpenAICompatibleProvider`, Gemini `gemini-3.6-flash` + 4 Unlimited Live (`gemini-3-flash-live`, `gemini-2.5-flash-native-audio-dialog`, `gemini-3.5-live-translate/transcribe-live`) + Gemma 4 26B/31B (`gemini.ts:5`), Pollinations scraped, **Anthropic** (`providers/anthropic.ts`) via `anthropic-translator`. `nvidia-nim auto: nvidia/nemotron-3-ultra-550b-a55b` (fixed 410).
* **Vector 2 libs**: `lib/redis.ts` singleton lazy `initRedis()`/`getRedis()` (ioredis, fallback in-memory), `lib/semantic-cache.ts` SHA256 `semantic:{model}:{hash}` + Redis + mem + `hitRate`, `lib/compression.ts` (`toolsMinify`/`relevanceKeep` query-aware/`historySummarize`/`codeDedup` normalized + `compressMessages` returns `savedTokens`/`ratio`), `lib/cost-router.ts` (`FREELLMS_COST` $/1M + `rankProvidersByCostAndLatency` + `syncPricing` CDN LiteLLM + rolling `successRate` from request-log), `lib/provider-executor.ts` (shared `tryProviders()` fallback loop for all 6 v1 routes: breaker → key → quota → skip → call), `lib/sliding-window.ts` (Redis Lua sliding-window-counter for quota + rate-limit, in-memory fallback), `lib/analytics.ts` (`getAnalytics` interval/groupBy + `calculateSavings` + `costBreakdown`), `lib/anthropic-translator.ts` (keeps `tool_use` → `tool_calls`) + `lib/responses-translator.ts`.
* **Dashboard**: Vite + React (recharts), 6 routes `Dashboard→Providers→Models→Keys→Usage→Logs` (header 2 rows `max-w-[1440px]` + Master **editable input** row 1 (password/text toggle, auto-filled from `GET /api/bootstrap`), nav centered row 2), `Dashboard` 4 cards + 3 charts + tokens, `Models` **filter bar 1 row**: `q` + `provider` + `verified` + **Filters** dropdown (4 toggles `hasKey` **default OFF** + `hide404`/`Hide credits`/`Hide invalid ID` default ON) + **top-right 3 buttons** `Check Live (n)`/`Sync Live Now`/`Refresh` (`Refresh` resets `hasKeyOnly:false`, `Check` requires filter `q`/`provider`), pagination 25/50 sticky bottom + checkbox (`isRowDisabled` prioritizes `live usable 200`/`usage>0` before `deprecated`/`404/410`) + `Used/Limit` + `auto sync` (fetch once on reload via `/api/sync/status`), `Providers` pagination 25/50 + `Get Key ↗` + health + **Sync Live Now** + **auto boot-sync** (`★ NEW` violet + fetch once on reload), `Usage` Provider topology (App centre + green/violet animated line, **auto highlight newest provider**), `Keys` Generator + CRUD `fgk-...`, `Logs` charts + SSE.
* **Data Layer**: `data/freellms-providers.json` (30), `data/freellms-models-free.json` (316), `models.yaml` (316), `data/verified-models.json` (live verify), `data/model-health.json` (persisted `404/410` + `200 usable` — `POST /api/models/health/mark` `200` override `404`, `GET /v1/models` `verified_free` after `Check`), `data/live-models.json` (live sync 882 free, `POST /api/models/live/sync {freeOnly:true}` on both pages), `data/request-log.json` (1000 logs), **new** `data/provider-stats.json` (latency EMA per provider for cost-router), **Redis semantic cache** (`semantic:*` keys, TTL `CACHE_TTL_S`), **cost pricing** sync from LiteLLM CDN (`model_prices_and_context_window.json` → `FREELLMS_COST`), `lib/paths.ts` resolve `data/` for both `cwd=root` and `cwd=apps/gateway`.
* **Scheduler + Boot-Sync**: `jobs/scheduler.ts` 24h + `jobs/boot-sync.ts:76 runBootSync()` auto detect new providers via `data/.provider-fingerprint.json` (`hasKey` false→true, `addedAt`) → auto `syncLiveModels` + `verify` ~3s after start, persist `newestProviders`/`lastAdded` for UI. `GET /api/sync/status` + `GET /api/providers` (`isNewest`/`addedAt`) + `POST /api/sync/boot`. Frontend **fetch once on reload** (không poll liên tục) highlight violet `★ NEW` — **sau khi update `.env` + restart gateway, reload trang Providers/Models/Usage sẽ tự có provider mới + models mới + topology cập nhật**. Changing `.env` still requires **restart gateway** `config.ts:22` to reload `hasRealKey`.
* **Token & Vector 2 flags**: `lib/token-estimator.ts` char/4, `lib/request-log.ts` aggregation `allTimeTokens` + `tokensByProvider` for Dashboard/Logs charts. Flags: `SEMANTIC_CACHE_ENABLED` (default 0, `SEMANTIC_THRESHOLD=0.92`, `CACHE_TTL_S=3600`, `EMBEDDING_MODEL`), `COMPRESSION_ENABLED` (default 0), `COST_ROUTING_ENABLED` (default 0) — `config.ts:158`.

References: `free-llm-gateway` (24+ providers) and `OmniRoute` (271 providers, 90 free).

## 2. Request Flow

```
1. POST /v1/chat/completions  {model, messages, stream, tools}
2. middleware/auth            -> verify `fgk-...` timing-safe, load scopes
3. middleware/rateLimit       -> Redis sliding-window RPM check (atomic, shared across instances)
4. token-estimator            -> estimate TPM pre-flight, reject if exceeded
5. smart-router               -> resolve alias (auto/gpt-4/glm/qwen) -> provider pool ordered
                                filter deprecated if verified data exists (verified=free)
6. provider-executor          -> shared tryProviders() loop for every v1 route:
     breaker 5xx/429-only (4xx never trips) -> key least-failed-first -> checkQuotaAsync
     (Redis sliding, in-memory fallback) -> deprecated skip -> provider call
     catch 429: markRateLimited + retryAfterMs in error; catch other: next provider
     success: recordUsage, break
7. normalizer                 -> convert Gemini shape to OpenAI shape
8. SSE passthrough            -> if stream: proxy chunk-by-chunk, handle mid-stream error
9. logger + request_db        -> log latency, tokens, cost, provider used
10. return OpenAI JSON/SSE
```

## 3. Provider Interface

`apps/gateway/src/providers/base.ts:1`

```ts
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  top_p?: number;
  top_k?: number;
  // ... n, stop, presence_penalty, frequency_penalty, user, sessionId
}

export interface AudioTranscriptionRequest {
  file: File | Buffer | Blob;
  filename?: string;
  model: string;
  language?: string;
  prompt?: string;
  response_format?: string;
  temperature?: number;
}

export interface AudioSpeechRequest {
  model: string;
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}

export interface ResponsesRequest {
  model: string;
  input: string | ChatMessage[] | Array<{ role: string; content: string }>;
  instructions?: string;
  previous_response_id?: string;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
}

export interface AnthropicRequest {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string | Array<{ type: string; text?: string }> }>;
  max_tokens: number;
  system?: string;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
  stop_sequences?: string[];
}

export interface Provider {
  id: string; // 'nvidia-nim' | 'groq' | 'google-gemini' | 'pollinations' | 'anthropic'
  type: 'openai-compatible' | 'gemini' | 'anthropic' | 'scraped';
  chat(req: ChatRequest, apiKey: string): Promise<Response>;
  embeddings?(req: EmbeddingsRequest, apiKey: string): Promise<Response>;
  images?(req: ImagesRequest, apiKey: string): Promise<Response>;
  transcriptions?(req: AudioTranscriptionRequest, apiKey: string): Promise<Response>;
  speech?(req: AudioSpeechRequest, apiKey: string): Promise<Response>;
  responses?(req: ResponsesRequest, apiKey: string): Promise<Response>;
  anthropic?(req: AnthropicRequest, apiKey: string): Promise<Response>;
  models(apiKey?: string): Promise<ModelInfo[]>; // GET {baseUrl}/models
  health(apiKey: string): Promise<boolean>;
}
```

* `openai-compatible` (28/30): NVIDIA (`integrate.api.nvidia.com/v1`), Groq (`api.groq.com/openai/v1`), Cerebras, GitHub Models (`models.github.ai/inference`), OVH, Cohere (`/v2`), ModelScope, Chutes, SambaNova, SiliconFlow, Glhf, Mistral, LLM7, Agnes, Aion, Z AI (`api.z.ai/api/paas/v4`), DeepSeek, OpenRouter, Ollama Cloud, Nscale, Nebius, AI21… — just `baseURL + Authorization`.
* `gemini`: Google (`generativelanguage.googleapis.com/v1beta`) — needs `format-translator` (OpenAI → Gemini contents).
* `scraped`: Pollinations (`text.pollinations.ai/openai`) — optional `POLLINATIONS_API_KEY` forwarded as `Authorization: Bearer` (`providers/pollinations.ts`), auto maps alias `auto` → `openai`; budget `402/403` + streaming `200 SSE budget` are detected (`provider-executor.ts` budget detector) and trigger fallback + breaker `402/403` retryable (`circuit-breaker.ts:63`).

Registry `apps/gateway/src/providers/registry.ts:1` lists 41 ids (30 freellms slugs + 11 alias `mistral`/`gemini`/`nvidia`/`kilo-code`/`openrouter`), `providerMeta` contains caps/tier/noCard, alias map 15+ keys (`kilo-auto`, `gemini-3.6`...).

## 4. Router & Fallback

Based on `smart_router.py` + OmniRoute 19 strategies, actual freellms tiers:

| Strategy | Description |
|----------|-------------|
| `round-robin` | Default, distribute load |
| `tiered` | 4-tier from `.env.example:19` `FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io"],["openrouter","kilo-code","pollinations"]]` |
| `latency` | Pick lowest p50 (P3) |
| `alias` | `auto`→5 P0, `gpt-4`→5, `claude-3`→4, `glm`→3, `qwen`→4, `code`→4, `embedding`→3 (see `registry.ts:42`) |
| `verified` | If `data/verified-models.json` + `data/model-health.json` (persisted 404/410) exists, `GET /v1/models?verified=free` removes `deprecated` from pool |
| `cost-aware` | When `COST_ROUTING_ENABLED=1`, `rankProvidersByCostAndLatency(ids)` (`lib/cost-router.ts:99`) re-ranks pool by `FREELLMS_COST` ($/1M tokens) + latency EMA from `data/provider-stats.json` (fallback 100ms) + quota headroom — `score = cost*COST_WEIGHT(5) + latency*LATENCY_WEIGHT(0.0005) - headroom*HEADROOM_WEIGHT(0.3)`, sort asc (env overrides); `syncPricing()` syncs from LiteLLM CDN `model_prices_and_context_window.json` |

Fallback: Tiered fallback with circuit breaker (5 fails / 30s cooldown, `config.ts:30`; `402/403 budget` now retryable `circuit-breaker.ts:63`). Budget exhaustion (`402/403 "reached its budget"` + streaming `200 SSE budget` via `provider-executor.ts` detector) triggers immediate fallback to next `auto` tier and breaker counting. Mid-stream SSE error → emit `data: {"error": ...}\n\n` then close (budget SSE is intercepted before streaming). Persisted `model-health.json` is merged by `chat.ts:22` to skip `deprecated` even before `verify`. With cost-routing, sorted pool is iterated in cheapest + fastest order. Pollinations sends `Authorization: Bearer POLLINATIONS_API_KEY` when configured (`providers/pollinations.ts`).

## 5. Key Management & Security

* **Encryption at rest**: AES-256-GCM (WebCrypto), key from `ENCRYPTION_KEY` — **auto-generated** 64 hex if missing/placeholder (`config.ts:32`), persisted to `.env` or `data/.gateway-keys.json`, never used as API key.
* **Master key (single-key)**: `MASTER_KEY=fgk-master-...` — **single key** for `/v1/*` + `/api/*` admin, auto-generated if missing and seeded as `vk-master` (`lib/virtual-keys.ts:116`). `fgk-...` scoped is optional per-app.
* **Virtual keys**: prefix `fgk-`, hash SHA-256, scopes `{models, providers}`, `rpmLimit`, `tpdLimit`.
* **Key pool**: `GROQ_API_KEYS=gsk_xxx,gsk_yyy` → round-robin, skip `Retry-After`. `config.ts:32` supports 30 freellms providers (including `OVHCLOUD_API_KEYS` alias).
* **Auth**: `hono/bearer-auth` + timing-safe compare, `admin`/`user`.

## 6. Rate Limiting & Quota

* **Redis rolling window**: RPM/RPD/TPM/TPD per virtual key + per provider key (freellms limits: NVIDIA 40 RPM shared, Groq 30/14.4K, Cerebras 15/1M TPD, Gemini 15/1.5K, OVH 2 anon, Agnes 30, OpenRouter 200/day, Kilo ~200/hr).
* **Headers**: `x-ratelimit-remaining-*`, `retry-after` on 429.
* **Token estimator**: `js-tiktoken` pre-flight. `quota-tracker.ts` (P3) will use `models.yaml:1` `limit` field.

## 7. Data & Verification

| File | Nguồn | Nội dung |
|------|-------|----------|
| `data/freellms-providers.json` | freellms.org/providers (30) | `name, slug, tier, caps, noCard, free_models` |
| `data/freellms-models-free.json` | freellms.org/models (316 free) | `name, slug, context, score, limit, verified, modality` |
| `models.yaml` | `scripts/sync-freellms.py` | 316 entries, `id: nvidia-nim/z-ai/glm-5.2`, `score`, `limit` |
| `data/verified-models.json` | `jobs/verify-free.ts` live probe | `status: verified_free / deprecated / unverified_no_key / error`, `last_verified` |
| `data/verified-summary.json` | `jobs/verify-free.ts` | Summary per-provider |
| `data/provider-stats.json` | `lib/cost-router.ts` + `lib/analytics.ts` | Latency EMA per provider (`emaLatencyMs`/`latency`), quota headroom — used for `rankProvidersByCostAndLatency` |
| `data/.provider-fingerprint.json` | `jobs/boot-sync.ts` | Fingerprint `providers` `hasKey`/`keyCount`/`addedAt`, `lastAdded`/`lastAddedAt`, `bootSync`/`liveSync` — auto detect newest provider sau khi update `.env` + restart |
| `Redis semantic cache` | `lib/redis.ts` singleton + `lib/semantic-cache.ts` | `semantic:{model}:{sha256}` keys, TTL `CACHE_TTL_S` (3600), `hits`/`misses`/`hitRate` (scan+del clear) — fallback in-memory Map |
| `cost pricing CDN` | `lib/cost-router.ts` `syncPricing()` | LiteLLM CDN `model_prices_and_context_window.json` → `FREELLMS_COST` ($ per 1M tokens, free=0, groq 0.05, openrouter 0.1...) |

Sync flow: `scripts/sync-freellms.py` (Layer 1) → `jobs/verify-free.ts` probe `provider.models()` every 24h (Layer 2, scheduler + `POST /api/verify`) → `GET /v1/models?verified=free` returns only `verified_free` + `?provider=` exact filter (frontend `provider` datalist 20). See `docs/OPERATIONS.md:1`.

## 8. Database & Files

Drizzle ORM (`apps/gateway/src/db/schema.ts:1`):

```ts
users(id, email, password_hash, role)
virtual_keys(id, prefix, hash, user_id, scopes JSON, rpm_limit, tpd_limit)
provider_keys(id, provider, encrypted_key, status, last_checked_at)
requests(id, virtual_key_id, provider, model, prompt_tokens, completion_tokens, latency, cost, status, created_at)
providers_cache(provider, models JSON, synced_at)
```

* SQLite dev, Postgres prod, BRIN index. Runtime `data/virtual-keys.json` (hash), `data/request-log.json` (1000), `resolveDataPath` for both `cwd=root` and `cwd=apps/gateway`.

## 9. Directory Structure

```
.
├── apps/gateway/src/
│   ├── index.ts              # serve + startScheduler()
│   ├── app.ts                # Hono + secureHeaders + cors + bodyLimit skip audio + traceparent + auth + virtualKeyRateLimit
│   ├── config.ts             # 30 providers keys + 4-tier fallback + SYNC_INTERVAL_MS + Vector 2 flags
│   ├── lib/paths.ts          # resolveDataPath (fix 7 vs 316 bug)
│   ├── lib/redis.ts          # singleton ioredis lazyConnect + isRedisAvailable + pipeline (Vector 2)
│   ├── lib/semantic-cache.ts # SHA256 semantic cache Redis+mem + hitRate (Vector 2)
│   ├── lib/compression.ts    # toolsMinify/historySummarize/codeDedup + compressMessages (Vector 2)
│   ├── lib/cost-router.ts    # FREELLMS_COST + rankProvidersByCostAndLatency + syncPricing CDN (Vector 2)
│   ├── lib/analytics.ts      # getAnalytics/calculateSavings/costBreakdown (Vector 2)
│   ├── lib/anthropic-translator.ts # Anthropic → OpenAI translate (Vector 2)
│   ├── lib/responses-translator.ts # Responses API translate (Vector 2)
│   ├── lib/key-manager.ts    # AES-GCM + round-robin + markRateLimited
│   ├── lib/quota-tracker.ts  # FREELLMS_LIMITS RPM/TPM
│   ├── lib/circuit-breaker.ts# 5/30s half-open
│   ├── lib/token-estimator.ts# char/4
│   ├── lib/virtual-keys.ts   # fgk- CRUD + hasScope
│   ├── lib/request-log.ts    # 1000 logs + tokens aggregation
│   ├── lib/otel.ts           # GenAI OTel + traceparent
│   ├── lib/gemini-stream.ts  # Gemini SSE → OpenAI
│   ├── providers/registry.ts # 40 ids, providerMeta, auto 15-tier (real key → public)
│   ├── providers/anthropic.ts# Anthropic provider adapter (Vector 2)
│   ├── jobs/verify-free.ts   # freellms vs live /models
│   ├── jobs/probe-models.ts  # chat probe per-model usable
│   ├── jobs/scheduler.ts     # 24h
│   ├── routes/v1/models.ts   # freellms 316 + checkbox + Used/Limit + pollinations fallback
│   ├── routes/v1/chat.ts     # quota/breaker/verified/log + X-Verified + cost-routing re-rank
│   ├── routes/v1/audio.ts    # POST /v1/audio/transcriptions + /v1/audio/speech multipart (Vector 2)
│   ├── routes/v1/responses.ts# POST /v1/responses + /v1/conversations (Vector 2)
│   ├── routes/v1/anthropic.ts# POST /v1/messages Anthropic compat (Vector 2)
│   └── routes/api.ts         # /providers/health live, /models/health, /verify, /keys, /logs/stream, /stats + analytics
├── apps/web/src/
│   ├── main.tsx              # sticky nav Dashboard→Providers→Models→Keys→Logs
│   ├── pages/Dashboard.tsx   # 4 cards + 3 charts + tokens
│   ├── pages/Providers.tsx   # Get Key ↗ + health
│   ├── pages/Models.tsx      # checkbox + single Check Live + Used/Limit
│   ├── pages/Keys.tsx        # Key Generator + CRUD + Quick Test
│   ├── pages/Logs.tsx        # charts + SSE
│   ├── lib/getKeyUrls.ts     # 30 console URLs
│   └── index.css             # unified card/button/table (nav style)
├── data/*.json               # freellms + verified + benchmark
├── models.yaml               # 316 free
├── scripts/sync-freellms.py, benchmark.ts, rotate-keys.ts
└── .github/workflows/sync-freellms.yml # daily 02:00 UTC
```

## 10. Observability & Deploy

* `pino` pretty dev / JSON prod, OTel GenAI (`lib/otel.ts` + traceparent propagation), `secureHeaders`, `bodyLimit` 10MB (skip `/v1/audio` multipart).
* `GET /api/stats` — `allTimeTokens`, `tokensByProvider`, `avgTokens`, **p95 latency**, `cacheHitRate`, `compressedSavedTokens` + `GET /api/verify/summary` + `GET /api/models/health` chat probe. `GET /api/analytics?interval=hour|day&groupBy=provider|model|key` (`lib/analytics.ts:53`).
* Vector 2 flags (`config.ts:158`): `SEMANTIC_CACHE_ENABLED` (semantic-cache hitRate), `COMPRESSION_ENABLED` (ratio/savedTokens), `COST_ROUTING_ENABLED` (costBreakdown/savings) — expose qua `GET /api/stats` flags + `GET /api/analytics` `savings.hitRate`.
* Docker prod non-root + HEALTHCHECK, Wrangler `wrangler.jsonc` Cloudflare. Xem `docs/DEPLOYMENT.md:1`.
