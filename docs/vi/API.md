> **Tiếng Việt** | [🇬🇧 English](../en/API.md) | [Docs Index](../README.md)

# API Reference

OpenAI-compatible API của gateway (41 provider ids — 30 freellms + 11 alias; freellms snapshot 324 models — 316 free + alias, **live sync hiện 2185 total / 882 free / 853 hasKey, `?hasKey=1` trả 2190 total từ live cache**). Dùng trực tiếp với `openai` SDK hoặc `curl`.

Base URL: `http://localhost:7373/v1` (kèm dashboard tại `http://localhost:3000` — header 2 hàng, i18n VI/EN)

Endpoints: `POST /v1/chat/completions` · `GET /v1/models` · `POST /v1/embeddings` · `POST /v1/images/generations` · `GET /v1/health` · `POST /v1/audio/transcriptions` · `POST /v1/audio/translations` · `POST /v1/audio/speech` · `POST /v1/responses` · `GET /v1/responses/:id` · `POST /v1/conversations` · `POST /v1/messages` · `POST /v1/messages/count_tokens` + Admin `/api/*`

Auth: `Authorization: Bearer fgk-master-...` (MASTER_KEY tự sinh — 1 key duy nhất cho `/v1/*` + `/api/*`) hoặc `fgk-...` scoped tạo trong Dashboard. Health không cần auth.

## Endpoints

### POST /v1/chat/completions

Tạo chat completion. Hỗ trợ streaming + tools. Gateway thử 4-tier fallback (`nvidia-nim/groq/cerebras/gemini` → `cloudflare/cohere` → `ovh/modelscope/llm7` → `openrouter/kilo/pollinations`). Model 404/410 persisted sẽ bị skip và lưu `data/model-health.json` (strikethrough `#dc2626`).

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

Model có thể là alias (`auto`, `gpt-4`, `glm`, `qwen`, `code`, `embedding`, `kilo-auto`) hoặc full `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`, `google-gemini/gemini-3.6-flash` (đã sanitize `gemini 3.6 flash` -> `gemini-3.6-flash`), `openrouter/google/gemma-4-31b:free`. Freellms tên có khoảng trắng `:` `()` đã được sanitize ở `openai-compatible.ts:31` và `models.ts:9`. Router resolve theo `providers/registry.ts:42`.

**Headers tùy chọn**:

| Header | Mô tả |
|--------|-------|
| `x-router` | Pin provider: `x-router: nvidia-nim` hoặc `x-router: groq` |
| `x-router-tier` | Chọn tier: `tier1`, `tier2` (sắp tới) |
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

Khi không có key (dev), gateway trả `_mock: true` với `_errors` để debug tier.

**Streaming** (`stream: true`):

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"index":0}]}
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"index":0,"finish_reason":"stop"}]}
data: [DONE]
```

Mid-stream error sẽ emit `data: {"error": {"message": "...", "type": "provider_error"}}\n\n` rồi close.

### GET /v1/models

Liệt kê models — **live là source of truth khi `?hasKey=1`**: nếu có `data/live-models.json` (2185 total, 882 free, 853 hasKey) và `hasKey=1`, gateway trả live cache 2190 total (kèm alias). Ngược lại trả freellms snapshot 324 (316 free). Hỗ trợ lọc live verify + persisted 404 + pagination **LOV 25/50 ở sticky bottom** (không còn trên top filter bar), debounce 400ms cho `q` + `provider` (filter theo provider, datalist 20, `?provider=` exact).

```bash
curl http://localhost:7373/v1/models -H "Authorization: Bearer fgk-xxx"
# Live source of truth (khuyến nghị)
curl "http://localhost:7373/v1/models?hasKey=1" -H "Authorization: Bearer fgk-xxx" # 2190 total
curl "http://localhost:7373/v1/models?hasKey=1&q=gemma" -H "Authorization: Bearer fgk-xxx"
# Pagination LOV 25/50 — giờ ở sticky bottom pagination (Page X/Y + LOV selector)
curl "http://localhost:7373/v1/models?page=1&limit=25" -H "Authorization: Bearer fgk-xxx"
curl "http://localhost:7373/v1/models?page=2&limit=50&q=gemma&hasKey=1" -H "Authorization: Bearer fgk-xxx"
# Chỉ verified_free (thực sự còn free sau probe 24h) — dùng với freellms snapshot
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx"
# Deprecated (freellms nói free nhưng live không còn, gồm persisted 404/410)
curl "http://localhost:7373/v1/models?verified=deprecated" -H "Authorization: Bearer fgk-xxx"
# Filter theo provider
curl "http://localhost:7373/v1/models?provider=nvidia-nim&hasKey=1" -H "Authorization: Bearer fgk-xxx"
# Kết hợp + search (debounce 400ms)
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

Khi `?hasKey=1` với live cache: `total: 2190`, `free: 316` (snapshot), `pagination` vẫn 25/50, `filters.hasKey: true`. Top filter bar có `q`, `provider` (datalist 20, `?provider=` exact), `verified`, pill `hasKey`/`hide404`/`hidePayment`; **LOV 25/50 dời xuống sticky bottom pagination** cùng `Page X/Y`. Row vừa `Check Live` 404/payment vẫn hiện với strikethrough (hide chỉ áp dụng với `m.health` persisted) nên kết quả không biến mất tức thì.

Query params:

| Param | Mô tả |
|-------|-------|
| `provider` | `nvidia-nim`, `groq`, `google-gemini`, `modelscope`… hoặc `gateway` cho alias |
| `verified` | `free` → chỉ `verified_free`, `deprecated` → chỉ deprecated (kể cả persisted 404/410), `unverified` → unverified_no_key/error, omit → tất cả 324 |
| `q` | Search `id/display_name/provider` (vd `gemma`, `nvidia`) — **debounce 400ms** |
| `page` | Trang 1-indexed (mặc định 1) |
| `limit` `per_page` | LOV `25` hoặc `50` (mặc định 25) — **selector ở sticky bottom pagination, không còn trên top filter bar** |
| `hasKey` `has_key` | `1` → chỉ provider có real key (`!xxx`, length>20 hoặc public) — khi có live cache sẽ phục vụ live 2190 total, ngược lại filter freellms snapshot |
| `free` | `0` để hiển thị cả paid (hiện tất cả freellms đều free nên ít dùng) |

`GET /v1/models/:id` (ví dụ `/v1/models/nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) trả chi tiết + `live_status` + `persisted_404`.

### POST /v1/embeddings

```json
{ "model": "cohere/embed-v3", "input": "Hello world" }
```

Stub P1 (P5 sẽ proxy tới Cohere/NVIDIA embedding). Trả mock embedding 8 dims.

### POST /v1/images/generations

Dùng Pollinations hoặc provider hỗ trợ images.

```json
{ "model": "pollinations/flux", "prompt": "a cat", "n": 1, "size": "1024x1024" }
```

### POST /v1/audio/transcriptions (và translations)

Chuyển audio thành text qua `multipart/form-data`. `file` (bắt buộc), `model` mặc định `whisper-large-v3`, `language` tùy chọn (ISO-639-1). Thử theo thứ tự `groq` → `openrouter`; fallback mock trong dev (không có key).

```bash
curl -X POST http://localhost:7373/v1/audio/transcriptions \
  -H "Authorization: Bearer fgk-xxx" \
  -F file=@audio.mp3 \
  -F model=whisper-large-v3 \
  -F language=en
# translations: cùng cú pháp
curl -X POST http://localhost:7373/v1/audio/translations \
  -H "Authorization: Bearer fgk-xxx" \
  -F file=@audio.mp3 \
  -F model=whisper-large-v3
```

**Response**:

```json
{ "text": "Hello world", "model": "whisper-large-v3", "language": "en" }
```

Dev mock trả `{ "text": "[mock transcription]", "_mock": true }` khi chưa cấu hình key STT.

### POST /v1/audio/speech

Tạo speech từ text. Body JSON `{model, input, voice, response_format, speed}` → `audio/mpeg`. Trả `501` nếu không có TTS provider free.

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

**Headers**: thành công `Content-Type: audio/mpeg`. Lỗi `501 { "error": { "message": "No TTS provider available", "type": "no_tts_provider" } }`.

### POST /v1/responses và GET /v1/responses/:id và POST /v1/conversations

Alias Responses API trên chat completions. `POST /v1/responses` tạo response, `GET /v1/responses/:id` lấy lại, `POST /v1/conversations` là alias cũng tạo response qua conversation.

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

`input` chấp nhận `string` hoặc mảng messages (`[{role:"user",content:"Hello"}]`). Khi `stream: true` trả SSE `data: {...}\n\n` với `data: [DONE]`.

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

**Lấy lại**:

```bash
curl http://localhost:7373/v1/responses/resp_xxx -H "Authorization: Bearer fgk-xxx"
curl -X POST http://localhost:7373/v1/conversations \
  -H "Authorization: Bearer fgk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","input":"Hello"}'
```

### POST /v1/messages (tương thích Anthropic) và POST /v1/messages/count_tokens

Endpoint tương thích Anthropic Messages API. Yêu cầu headers `anthropic-version: 2023-06-01` và `x-api-key: fgk-xxx` (hoặc `Authorization: Bearer fgk-xxx` cũng được chấp nhận).

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

`messages[].content` chấp nhận `string` hoặc content blocks Anthropic (`[{type:"text",text:"Hello"}]`). `max_tokens` bắt buộc. `system` có thể là `string` hoặc blocks.

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

Streaming (`stream: true`) emit SSE events Anthropic `event: message_start` / `content_block_delta` / `message_stop`.

Upstream `tool_use` blocks được giữ nguyên thành OpenAI `tool_calls` khi upstream trả shape Anthropic (agentic flow không bị mất tool calls khi qua gateway).

### GET /v1/health

Không cần auth, trả status gateway + provider pool.

```json
{ "status":"ok", "providers":43, "tiers":[["nvidia-nim","groq",...]], "uptime":123 }
```

### Admin API (`/api/*`, cần `MASTER_KEY` hoặc `admin` role — trừ bootstrap)

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/api/bootstrap` | **Mới `8f1b3b7`**: Public, không cần auth — tắt mặc định (`EXPOSE_BOOTSTRAP=0`, bật `1` cho local lần đầu), trả `{masterKey}` tự sinh (`config.masterKey`) để UI lần đầu tự bind (`main.tsx:34`); tắt bằng `EXPOSE_BOOTSTRAP=0`/`false` (`app.ts:23`) |
| `GET` | `/api/config/master` | Alias cho `/api/bootstrap` |
| `POST` | `/api/keys` | Tạo virtual key `fgk-...` (hash SHA256, scopes, RPM) |
| `GET` | `/api/keys` | List keys + `requestCount` |
| `DELETE` | `/api/keys/:id` | Xóa key |
| `GET` | `/api/providers?page=&limit=&q=&hasKey=` | List providers + `detailed[]` (free_models, keys, `hasRealKey` highlight `#f0fdf4` + `● has key`, `Get Key` URL xanh khi hasRealKey) — **pagination 25/50 LOV ở sticky bottom**, `q` debounce 400ms, `hasKey` filter real keys |
| `GET` | `/api/providers/health` | Live ping 41 providers parallel 5s (online/offline/no-key, latency, breaker) |
| `GET` | `/api/models/health?model=` | Probe **1 model** live chat `Hi` 5 tokens 8s → `usable/unusable/no-key/timeout` + `410 Gone` |
| `GET` | `/api/models/health?provider=&limit=` | Bulk probe `limit` models của provider (summary usable/unusable) |
| `GET` | `/api/models/health/:id` | Probe 1 model full id (vd `nvidia-nim/nvidia/nemotron-3-ultra-550b-a55b`) |
| `GET` | `/api/models/health/persisted` | List persisted health (`data/model-health.json`) — `404/410` strikethrough + `200 usable` giữ không đỏ sau reload |
| `POST` | `/api/models/health/mark` | Mark health `{ids:[],http_status:404|200,error,status:"usable"|"unusable",latency_ms}` -> persist `data/model-health.json`; `200 usable` override `404` trước nên `GET /v1/models` `live_status:"verified_free"` `v1/models.ts:153` + `isRowDisabled` xóa strikethrough |
| `DELETE` | `/api/models/health/persisted/:id` | Xóa 1 persisted, `DELETE /api/models/health/persisted` xóa hết |
| `POST` | `/api/models/live/sync` | Sync live models `{freeOnly:true}` (mặc định true, lọc Permanent Free hoặc `:free` hoặc freellms list) → `data/live-models.json` (2185 total, 882 free) — cùng endpoint **Sync Live Now** ở cả `/providers` và `/models` `Providers.tsx:37`/`Models.tsx:99` |
| `GET` | `/api/models/live` | **Mới**: Get live cache `{total, providers, free_only, models[]}` — `/v1/models?hasKey=1` dùng cache này |
| `GET` | `/api/stats` | `allTimeTokens`, `tokensByProvider`, `avgTokens`, `providers:41`, `free_models:316`, `breakers` |
| `GET` | `/api/models/sync` | Freellms sync info (source, last_sync, script — lịch sử, disabled) |
| `GET` | `/api/verify` | Full live verify `data/verified-models.json` (316 rows, `verified_free/deprecated`) |
| `GET` | `/api/verify/summary` | Summary nhanh (per-provider) |
| `POST` | `/api/verify` | Trigger verify `{dryRun:false}` — scheduler cũng gọi syncLiveModels kèm |
| `GET` | `/api/logs` | Paginated logs (`promptTokens/completionTokens/totalTokens`) |
| `GET` | `/api/logs/stream` | SSE live logs — **Live ON (SSE + 2s poll)**, đã bỏ Auto sync 5s duplicate |
| `GET` | `/api/analytics?interval=hour\|day&groupBy=provider\|key\|model` | Thống kê tổng hợp (tokens, requests theo provider/key/model, interval `hour`/`day`, kèm `costBreakdown` và `savings`) |
| `GET` | `/api/cache/stats` | Thống kê cache (hits, misses, size) |
| `DELETE` | `/api/cache` | Xóa cache gateway |
| `POST` | `/api/compression/preview` | Preview nén prompt — body `{messages:[], maxTokens}` → `{original, compressed, ratio, savedTokens, summarized, summaryVia, droppedMessages, preview}` (tin cũ được TÓM TẮT thành summary, không xóa; cần 7+ msgs) |

**Tạo key**:

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

**Verify live** (kiểm tra tier thực sự còn free không — xem `docs/OPERATIONS.md`):

```bash
# Xem summary
curl http://localhost:7373/api/verify/summary -H "Authorization: Bearer $MASTER_KEY" | jq

# Trigger live probe (cần keys trong .env, nếu không sẽ dry-run)
curl -X POST http://localhost:7373/api/verify -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"dryRun":false}' | jq '.total_verified_free'

# Live sync (source of truth mới)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER_KEY" -H "Content-Type: application/json" -d '{"freeOnly":true}' | jq
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER_KEY" | jq '.total'

# Chỉ lấy models thực sự còn free sau probe (live)
curl "http://localhost:7373/v1/models?hasKey=1" -H "Authorization: Bearer fgk-xxx" | jq '.total' # 2190
curl "http://localhost:7373/v1/models?verified=free" -H "Authorization: Bearer fgk-xxx" | jq '.total' # freellms snapshot
```

## Model Aliases (freellms-aware)

`auto`, `gpt-4`, `gpt-3.5`, `claude-3`, `gemini`, `gemini-flash`, `llama`, `qwen`, `glm`, `kimi`, `code`, `embedding`, `rerank`, `deepseek`, `mistral` sẽ được `smart-router` resolve.

Ví dụ:

```ts
{ model: "auto" } // -> nvidia-nim/z-ai/glm-5.2 hoặc groq/qwen3...
{ model: "gpt-4" } // -> groq/cerebras/gemini/openrouter
{ model: "glm" } // -> z-ai-zhipu-ai/nvidia-nim/modelscope
{ model: "qwen" } // -> modelscope/ovhcloud/siliconflow/alibaba
{ model: "code" } // -> kilo-code/opencode/cohere/mistral-ai
{ model: "nvidia-nim/z-ai/glm-5.2" } // pin chính xác
```

Chi tiết alias map: `apps/gateway/src/providers/registry.ts:42`.

## Error Codes

| Status | Code | Mô tả |
|--------|------|-------|
| 401 | `invalid_api_key` | Sai `fgk-` key |
| 403 | `insufficient_scope` | Key không có quyền model/provider |
| 429 | `rate_limit_exceeded` | Vượt RPM/TPM, kèm `Retry-After` — **list endpoints đã tăng 4x (200) + debounce 400ms để giảm 429** |
| 429 | `provider_rate_limit` | Provider hết quota, gateway đã fallback hết pool |
| 502 | `provider_error` | Tất cả provider fail, kèm `provider_errors` array (mỗi entry có thể kèm `status` và `retryAfterMs`, nhất là khi 429) |
| 404 | `model_not_found` | Model lạ với provider có catalog cố định (ví dụ Gemini fail-fast trả 404 local thay vì đốt upstream call) |
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

Frontend đã debounce search `q` 400ms (Models/Providers) để tránh bắn nhiều request khi gõ.

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
