> **English** | [🇻🇳 Tiếng Việt](../vi/API.md) | [Docs Index](../README.md)

# API Reference

OpenAI-compatible gateway API (41 provider IDs — 30 freellms + 11 aliases; freellms snapshot 324 models — 316 free + alias, **live sync now 2185 total / 882 free / 853 hasKey, `?hasKey=1` returns 2190 total from live cache**). Use directly with the `openai` SDK or `curl`.

Base URL: `http://localhost:7373/v1` (with dashboard at `http://localhost:3000` — 2-row header, i18n VI/EN)

Endpoints: `POST /v1/chat/completions` · `GET /v1/models` · `POST /v1/embeddings` · `POST /v1/images/generations` · `GET /v1/health` · `POST /v1/audio/transcriptions` · `POST /v1/audio/translations` · `POST /v1/audio/speech` · `POST /v1/responses` · `GET /v1/responses/:id` · `POST /v1/conversations` · `POST /v1/messages` · `POST /v1/messages/count_tokens` + Admin `/api/*`

Auth: `Authorization: Bearer fgk-master-...` (auto-generated MASTER_KEY — single key for `/v1/*` + `/api/*`) or scoped `fgk-...` created in Dashboard. Health check requires no auth.

## Endpoints

### POST /v1/chat/completions

Create a chat completion. Supports streaming and tools. The gateway tries a 4-tier fallback (`nvidia-nim/groq/cerebras/gemini` → `cloudflare/cohere` → `ovh/modelscope/llm7` → `openrouter/kilo/pollinations`). 404/410 persisted models are skipped and saved to `data/model-health.json` (strikethrough `#dc2626`).

**Request**:

```json
{
  "model": "auto",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": { "name": "get_weather", "parameters": { "type": "object", "properties": { "city": { "type": "string" } } } }
    }
  ],
  "tool_choice": "auto"
}
```

Model can be an alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`) or a full ID such as `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`, `google-gemini/gemini-3.6-flash` (sanitized from `gemini 3.6 flash` -> `gemini-3.6-flash`), `openrouter/google/gemma-4-31b:free`. Freellms names containing spaces, `:` or `()` are sanitized in `openai-compatible.ts:31` and `models.ts:9`. The router resolves them via `providers/registry.ts:42`.

**Optional Headers**:

| Header | Description |
|--------|-------------|
| `x-router` | Pin a provider: `x-router: nvidia-nim` or `x-router: groq` |
| `x-router-tier` | Select tier: `tier1`, `tier2` (coming soon) |
| `x-request-id` | Idempotency / tracing |

**Response (non-stream)**:

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715433600,
  "model": "nvidia-nim/z-ai/glm-5.2",
  "choices": [
    { "index": 0, "message": { "role": "assistant", "content": "Hi!" }, "finish_reason": "stop" }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

When no provider key is configured (dev mode), the gateway returns `_mock: true` with `_errors` for tier debugging.

**Streaming** (`stream: true`):

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"index":0}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
```

Mid-stream errors emit `data: {"error": {"message": "...", "type": "provider_error"}}\n\n` and then close the connection.

### GET /v1/models

List models — **live is source of truth when `?hasKey=1`**: if `data/live-models.json` exists (2185 total, 882 free, 853 hasKey) and `hasKey=1`, gateway serves live cache 2190 total (incl alias). Otherwise serves freellms snapshot 324 (316 free). Supports live-verify + persisted 404 + **pagination LOV 25/50 at sticky bottom** (no longer on top filter bar), frontend debounce 400ms for `q` + `provider` (provider filter text input with datalist 20, `?provider=` exact).

```bash
curl http://localhost:7373/v1/models -H "Authorization: Bearer fgk-xxx"
# Live source of truth (recommended)
curl "http://localhost:7373/v1/models?hasKey=1" -H "Authorization: Bearer fgk-xxx" # 2190 total
curl "http://localhost:7373/v1/models?hasKey=1&q=gemma" -H "Authorization: Bearer fgk-xxx"
# Pagination LOV 25/50 — now at sticky bottom pagination (Page X/Y + LOV selector)
curl "http://localhost:7373/v1/models?page=1&limit=25" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:7373/v1/models?page=2&limit=50&q=gemma&hasKey=1" -H "Authorization: Bearer fgk-xxx"
# Only verified_free (still free after 24h probe) — freellms snapshot
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx"
# Deprecated (freellms says free but live is no longer free, includes persisted 404/410)
curl "http://localhost:7373/v1/models?verified=deprecated" -H "Authorization: Bearer fgk-xxx"
# Filter by provider
curl "http://localhost:7373/v1/models?provider=nvidia-nim&hasKey=1" -H "Authorization: Bearer fgk-xxx"
# Combined + search (400ms debounced)
curl "http://localhost:7373/v1/models?provider=groq&verified=free&q=llama&page=1&limit=25&hasKey=1" -H "Authorization: Bearer fgk-xxx"
```

**Response**:

```json
{
  "object": "list",
  "data": [
    { "id": "nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b", "object": "model", "owned_by": "nvidia-nim", "context_length": 1048576, "score": 94, "tier": "permanent", "capabilities": ["text","reasoning"], "limit": "Up to 40 RPM", "live_status": "verified_free", "last_verified": "2026-09-06T08:01:55.995Z" },
    { "id": "auto", "object": "model", "owned_by": "gateway", "live_status": "alias" }
  ],
  "total": 324,
  "free": 316,
  "verified": { "total_verified_free": 314, "total_deprecated": 0, "total_unverified_no_key": 0 },
  "pagination": { "page": 1, "limit": 25, "total": 324, "total_pages": 13, "has_next": true, "has_prev": false },
  "filters": { "provider": null, "verified": "free", "q": null, "hasKey": false }
}
```

When `?hasKey=1` with live cache: `total: 2190`, `free: 316` (snapshot), `pagination` still 25/50, `filters.hasKey: true`. Top filter bar has `q`, `provider` (datalist 20, `?provider=` exact), `verified`, pill `hasKey` (default OFF `hasKeyOnly:0`)/`hide404`/`hidePayment`/`hideInvalid` (default ON); **LOV 25/50 at sticky bottom pagination** with `Page X/Y`. `Check` per-row `GET /api/models/health?model=` → `POST /api/models/health/mark {status:"usable",http_status:200}` persists `200` so reload keeps `isRowDisabled==false` and `live_status:"verified_free"`; `Delete` persisted + `hasKeyOnly:false` on **Refresh** `Models.tsx:86`.

Query params:

| Param | Description |
|-------|-------------|
| `provider` | `nvidia-nim`, `groq`, `google-gemini`, `modelscope`… or `gateway` for aliases |
| `verified` | `free` → only `verified_free`, `deprecated` → only deprecated (including persisted 404/410), `unverified` → unverified_no_key/error, omit → all 324 |
| `q` | Search `id/display_name/provider` (e.g. `gemma`, `nvidia`) — **400ms debounced** |
| `page` | 1-indexed page (default 1) |
| `limit` `per_page` | LOV `25` or `50` (default 25) — **selector at sticky bottom pagination, no longer on top filter bar** |
| `hasKey` `has_key` | `1` → only providers with real keys (`!xxx`, length>20 or public) — when live cache exists serves live 2190 total, otherwise filters freellms snapshot |
| `free` | `0` to show paid as well (all freellms are currently free, so rarely used) |

`GET /v1/models/:id` (e.g. `/v1/models/nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) returns details plus `live_status` and `persisted_404`.

### POST /v1/embeddings

```json
{ "model": "cohere/embed-v3", "input": "Hello world" }
```

Stub P1 (P5 will proxy to Cohere/NVIDIA embeddings). Returns a mock 8-dim embedding.

### POST /v1/images/generations

Uses Pollinations or any provider that supports images.

```json
{ "model": "pollinations/flux", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```

### POST /v1/audio/transcriptions (and translations)

Transcribe audio via `multipart/form-data`. `file` (required), `model` defaults to `whisper-large-v3`, `language` optional (ISO-639-1). Tries `groq` → `openrouter` providers; fallback mock in dev (no key).

```bash
curl -X POST http://localhost:7373/v1/audio/transcriptions \
  -H "Authorization: Bearer fgk-xxx" \
  -F file=@audio.mp3 \
  -F model=whisper-large-v3 \
  -F language=en
# translations: same shape
curl -X POST http://localhost:7373/v1/audio/translations \
  -H "Authorization: Bearer fgk-xxx" \
  -F file=@audio.mp3 \
  -F model=whisper-large-v3
```

**Response**:

```json
{ "text": "Hello world", "model": "whisper-large-v3", "language": "en" }
```

Dev mock returns `{ "text": "[mock transcription]", "_mock": true }` when no STT provider key is configured.

### POST /v1/audio/speech

Generate speech from text. JSON body `{model, input, voice, response_format, speed}` → `audio/mpeg`. Returns `501` if no TTS provider is free (no free TTS upstream configured).

```bash
curl -X POST http://localhost:7373/v1/audio/speech \
  -H "Authorization: Bearer fgk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"Hello world","voice":"alloy","response_format":"mp3","speed":1.0}' \
  --output speech.mp3
```

**Request**:

```json
{
  "model": "tts-1",
  "input": "Hello world",
  "voice": "alloy",
  "response_format": "mp3",
  "speed": 1.0
}
```

**Headers**: `Content-Type: audio/mpeg` on success. Error `501 { "error": { "message": "No TTS provider available", "type": "no_tts_provider" } }`.

### POST /v1/responses and GET /v1/responses/:id and POST /v1/conversations

OpenAI Responses API alias over chat completions. `POST /v1/responses` creates a response, `GET /v1/responses/:id` retrieves it, `POST /v1/conversations` is an alias that also creates a response via conversation.

**Request** (`POST /v1/responses` / `POST /v1/conversations`):

```json
{
  "model": "auto",
  "input": "Hello",
  "instructions": "You are helpful.",
  "previous_response_id": "resp_xxx",
  "stream": false,
  "temperature": 0.7,
  "max_output_tokens": 1024,
  "tools": [{ "type": "function", "function": { "name": "get_weather", "parameters": { "type": "object", "properties": { "city": { "type": "string" } } } } }]
}
```

`input` accepts `string` or `messages` array (`[{role:"user",content:"Hello"}]`). When `stream: true` returns SSE `data: {...}\n\n` with `data: [DONE]`.

**Response**:

```json
{
  "id": "resp_xxx",
  "object": "response",
  "created_at": 1715433600,
  "model": "nvidia-nim/z-ai/glm-5.2",
  "output": [
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "Hi!" }] }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
}
```

**Retrieve**:

```bash
curl http://localhost:7373/v1/responses/resp_xxx -H "Authorization: Bearer fgk-xxx"
curl -X POST http://localhost:7373/v1/conversations \
  -H "Authorization: Bearer fgk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","input":"Hello"}'
```

### POST /v1/messages (Anthropic compatible) and POST /v1/messages/count_tokens

Anthropic Messages API compatible endpoint. Requires headers `anthropic-version: 2023-06-01` and `x-api-key: fgk-xxx` (or `Authorization: Bearer fgk-xxx` also accepted).

**Request**:

```json
{
  "model": "auto",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 1024,
  "system": "You are helpful.",
  "temperature": 0.7,
  "top_p": 1,
  "top_k": 40,
  "stream": false,
  "tools": [{ "name": "get_weather", "description": "Get weather", "input_schema": { "type": "object", "properties": { "city": { "type": "string" } } } }]
}
```

`messages[].content` accepts `string` or Anthropic content blocks (`[{type:"text",text:"Hello"}]`). `max_tokens` is required. `system` can be `string` or blocks.

```bash
curl -X POST http://localhost:7373/v1/messages \
  -H "x-api-key: fgk-xxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}],"max_tokens":1024}'

curl -X POST http://localhost:7373/v1/messages/count_tokens \
  -H "x-api-key: fgk-xxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
# -> { "input_tokens": 5 }
```

**Response** (`POST /v1/messages`):

```json
{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "Hi!" }],
  "model": "auto",
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 10, "output_tokens": 5 }
}
```

Streaming (`stream: true`) emits Anthropic SSE events `event: message_start` / `content_block_delta` / `message_stop`.

Upstream `tool_use` blocks are preserved as OpenAI `tool_calls` when the upstream returns Anthropic shape (agentic flows keep working through the gateway).

### GET /v1/health

No auth required; returns gateway status and provider pool.

```json
{ "status":"ok", "providers":41, "tiers":[["nvidia-nim","groq",...]], "uptime":123 }
```

### Admin API (`/api/*`, requires `MASTER_KEY` or `admin` role — except bootstrap)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/bootstrap` | **New `8f1b3b7`**: Public, no auth — disabled by default (`EXPOSE_BOOTSTRAP=0`, enable with `1` for local first boot), returns `{masterKey}` auto-generated (`config.masterKey`) for first-time UI auto-bind (`main.tsx:34`); disable via `EXPOSE_BOOTSTRAP=0`/`false` (`app.ts:23`) |
| `GET` | `/api/config/master` | Alias for `/api/bootstrap` |
| `POST` | `/api/keys` | Create virtual key `fgk-...` (SHA256 hash, scopes, RPM) |
| `GET` | `/api/keys` | List keys + `requestCount` |
| `DELETE` | `/api/keys/:id` | Delete a key |
| `GET` | `/api/providers?page=&limit=&q=&hasKey=` | List providers + `detailed[]` (free_models, keys, `hasRealKey` highlight `#f0fdf4` + `● has key`, `Get Key` URL green when hasRealKey) — **pagination 25/50 LOV at sticky bottom**, `q` 400ms debounce, `hasKey` filters real keys |
| `GET` | `/api/providers/health` | Live ping of 41 providers in parallel, 5s (online/offline/no-key, latency, breaker) |
| `GET` | `/api/models/health?model=` | Probe **1 model** with live chat `Hi` 5 tokens 8s → `usable/unusable/no-key/timeout` + `410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models of a provider (summary usable/unusable) |
| `GET` | `/api/models/health/:id` | Probe 1 model by full id (e.g. `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) |
| `GET` | `/api/models/health/persisted` | List persisted health (`data/model-health.json`) — `404/410` strikethrough + `200 usable` keeps non-red after reload |
| `POST` | `/api/models/health/mark` | Mark health `{ids:[],http_status:404|200,error,status:"usable"|"unusable",latency_ms}` -> persist to `data/model-health.json`; `200 usable` overrides previous `404` so `GET /v1/models` sets `live_status:"verified_free"` `v1/models.ts:153` + frontend `isRowDisabled` clears strikethrough |
| `DELETE` | `/api/models/health/persisted/:id` | Remove one persisted entry, `DELETE /api/models/health/persisted` removes all |
| `POST` | `/api/models/live/sync` | Sync live models `{freeOnly:true}` (default true, filtered by Permanent Free tier or `:free` suffix or freellms free list) → `data/live-models.json` (2185 total, 882 free) — same endpoint used by **Sync Live Now** on both `/providers` and `/models` `Providers.tsx:37`/`Models.tsx:99` |
| `GET` | `/api/models/live` | **New**: Get live cache `{total, providers, free_only, models[]}` — `/v1/models?hasKey=1` uses this cache |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `providers:41`, `free_models:316`, `breakers` |
| `GET` | `/api/models/sync` | Freellms sync info (source, last_sync, script — historical, disabled) |
| `GET` | `/api/verify` | Full live verify `data/verified-models.json` (316 rows, `verified_free/deprecated`) |
| `GET` | `/api/verify/summary` | Quick summary (per-provider) |
| `POST` | `/api/verify` | Trigger verify `{dryRun:false}` — scheduler also calls syncLiveModels together |
| `GET` | `/api/logs` | Paginated logs (`promptTokens/completionTokens/totalTokens`) |
| `GET` | `/api/logs/stream` | SSE live logs — **Live ON (SSE + 2s poll)**, duplicate Auto sync 5s removed |
| `GET` | `/api/analytics?interval=hour\|day&groupBy=provider\|key\|model` | Aggregated analytics (tokens, requests grouped by provider/key/model, interval `hour`/`day`, plus `costBreakdown` and `savings`) |
| `GET` | `/api/config` | Get runtime config — returns 29 keys `SEMANTIC_*`/`COMPRESSION_*`/`COST_*`/`PROVIDER_TIMEOUT_*`/`CIRCUIT_BREAKER_*`/`WEB_*`/`FALLBACK_TIERS` + `_source` (`.env`). Used by `/settings` to load defaults |
| `PUT` | `/api/config` | **New hot-reload**: Update runtime config in-memory (admin only, atomic). Body is partial `SettingsState` JSON. Validates ranges (`threshold 0..1`, `TTL 60..604800`, `tiers 8*60 deduped 200`), strict bool `0/1/true/false`, caps, returns `{applied, updated, message}` or `400 {errors, applied:{}}` without mutating on error. Audit `logger.info`. Persists only in-memory — copy `.env snippet` + restart to persist |
| `GET` | `/api/cache/stats` | Cache stats — `{enabled, hits, misses, hitRate, size}` pretty in Settings Cache Live banner (poll 30s) |
| `DELETE` | `/api/cache` | Clear gateway cache — `DELETE /api/cache` (admin, confirm in Settings Danger Zone) |
| `POST` | `/api/compression/preview` | Preview compression for a prompt — body `{messages:[], maxTokens}` → `{original, compressed, ratio, savedTokens, summarized, summaryVia, droppedMessages, preview}` (older messages are condensed into a summary, never deleted; needs 7+ msgs to trigger) |

**Create a key**:

```bash
curl -X POST http://localhost:7373/api/keys \
  -H "Authorization: Bearer $MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "scopes": { "models": ["*"], "providers": ["*"] },
    "rpmLimit": 60,
    "tpdLimit": 100000
  }'
# -> { "key": "fgk-abc123...", "id": "..." }
```

**Verify live** (check whether the tier is still actually free — see `docs/OPERATIONS.md`):

```bash
# View summary
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer $MASTER_KEY" | jq

# Trigger live probe (requires keys in .env, otherwise dry-run)
curl -X POST http://localhost:7373/api/verify -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"dryRun":false}' | jq '.total_verified_free'

# Live sync (new source of truth)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"freeOnly":true}' | jq
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER_KEY" | jq '.total'

# Only models still free after probing (live)
curl "http://localhost:7373/v1/models?hasKey=1" -H "Authorization: Bearer fgk-xxx" | jq '.total' # 2190
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx" | jq '.total' # freellms snapshot
```

## Model Aliases (freellms-aware)

`auto`, `gpt-4`, `gpt-3.5`, `claude-3`, `gemini`, `gemini-flash`, `llama`, `qwen`, `glm`, `kimi`, `code`, `embedding`, `rerank`, `deepseek`, `mistral` are resolved by the `smart-router`.

Examples:

```ts
{ model: "auto" } // -> nvidia-nim/z-ai/glm-5.2 or groq/qwen3...
{ model: "gpt-4" } // -> groq/cerebras/gemini/openrouter
{ model: "glm" } // -> z-ai-zhipu-ai/nvidia-nim/modelscope
{ model: "qwen" } // -> modelscope/ovhcloud/siliconflow/alibaba
{ model: "code" } // -> kilo-code/opencode/cohere/mistral-ai
{ model: "nvidia-nim/z-ai/glm-5.2" } // pin exact model
```

Alias map details: `apps/gateway/src/providers/registry.ts:42`.

## Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 401 | `invalid_api_key` | Invalid `fgk-` key |
| 403 | `insufficient_scope` | Key lacks permission for the model/provider |
| 429 | `rate_limit_exceeded` | RPM/TPM exceeded, includes `Retry-After` — **list endpoints now 4x (200) + 400ms debounce to reduce 429** |
| 429 | `provider_rate_limit` | Provider quota exhausted, gateway has exhausted fallback pool |
| 502 | `provider_error` | All providers failed, includes `provider_errors` array (each entry may carry `status` and `retryAfterMs`, notably on 429) |
| 404 | `model_not_found` | Unknown model for providers with a known catalog (e.g. Gemini fail-fast returns 404 locally instead of burning an upstream call) |
| 504 | `provider_timeout` | Upstream timeout |

## Rate Limit Headers

```
x-ratelimit-limit-requests: 60 (list endpoints: 200 = max(60*4,200))
x-ratelimit-remaining-requests: 59
x-ratelimit-limit-tokens: 100000
x-ratelimit-remaining-tokens: 99900
retry-after: 12
x-provider: nvidia-nim
```

Frontend debounces search `q` by 400ms (Models/Providers) to avoid firing many requests while typing.

## SDK Examples

**OpenAI Python**:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:7373/v1", api_key="fgk-xxx")
print(client.chat.completions.create(model="auto", messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
# Verified only (freellms snapshot)
print(client.models.list(extra_query={"verified":"free"}))
# Live source of truth
print(client.models.list(extra_query={"hasKey":1, "limit":25}))
```

**Vercel AI SDK**:

```ts
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI({ baseURL: "http://localhost:7373/v1", apiKey: "fgk-xxx" });
```

**LangChain**:

```ts
import { ChatOpenAI } from "@langchain/openai";
const llm = new ChatOpenAI({ configuration: { baseURL: "http://localhost:7373/v1" }, apiKey: "fgk-xxx", model: "nvidia-nim/z-ai/glm-5.2" });
```
