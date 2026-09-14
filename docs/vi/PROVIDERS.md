> **Tiếng Việt** | [🇬🇧 English](../en/PROVIDERS.md) | [Docs Index](../README.md)

# Providers

> **Nguồn lịch sử: freellms.org (scan 2026-09-06) — 30 providers, 316 free models, 41 IDs — live sync là source of truth (2185 total / 882 free / 853 hasKey, `?hasKey=1` 2190 total) + 2 providers mới B.AI/TokenHarbor → 51 IDs, 338 models (2026-09-10).**  
> Dashboard nav **Providers (51) trước Models (338)**. Cột **Get Key ↗** (console trực tiếp + freellms ↗) trong `apps/web/src/pages/Providers.tsx:1` + `lib/getKeyUrls.ts:1` (32 URLs). Bảng **highlight hasRealKey**: `background #f0fdf4` + `borderLeft 3px #16a34a` + badge `● has key` xanh lá + `Keys` `✓ real` xanh + `Get Key` xanh lá khi hasRealKey. **Top filter** debounce 400ms `q` + pill `hasKey`, **sticky bottom pagination** LOV 25/50 (không còn trên top).  
> Chi tiết lịch sử: [`docs/FREELLMS_FREE_TIER.md`](FREELLMS_FREE_TIER.md) + `data/freellms-providers.json:1` / `data/freellms-models-free.json:1`; **live**: `data/live-models.json:1` / `GET /api/models/live` / `POST /api/models/live/sync`  
> Gateway `apps/gateway/src/providers/registry.ts:1` 51 IDs (30 freellms slugs + 14 alias + 2 new + 2 B.AI alias + 1 TokenHarbor + 2 b-ai alias), `models.yaml:1` có 338 models (316 freellms + 14 KiraAI + 8 B.AI/TokenHarbor), `lib/paths.ts:1` fix 7→316 bug, `middleware/rate-limit.ts:1` 4x list limit 200.

## 1. Tổng quan freellms.org (lịch sử) + live hiện tại

| Chỉ số | Giá trị (freellms snapshot) | Live hiện tại (sync-live-models.ts) |
|--------|------------------------------|-------------------------------------|
| Providers | **30** (26 Permanent Free, 4 Quota) | 30 (real keys + public) |
| Models | **365** (316 FREE `data-free=1`, 49 paid) | **2185 total fetched / 882 free (freeOnly) / 853 hasKey** |
| `GET /v1/models?hasKey=1` | — | **2190 total** (live + alias) |
| No Card | 29/30 (chỉ Grok xAI yêu cầu) | — |
| OpenAI Compatible | 30/30 | live fetch qua `provider.models()` |
| Scan date | 2026-09-06, script `scripts/sync-freellms.py` **disabled, không còn latest** | Live sync mỗi 24h via `jobs/scheduler.ts` + `POST /api/models/live/sync {freeOnly:true}` |

## 2. Danh sách 30 providers (từ freellms.org — lịch sử, live fetch qua real keys)

### Permanent Free — No Card (ưu tiên P0)

| Provider | Slug | Base URL | Free Models (freellms) | Live free (hasKey) | Limit | Caps | Env Key |
|----------|------|----------|-----------------------|-------------------|-------|------|---------|
| **NVIDIA NIM** | `nvidia-nim` | `https://integrate.api.nvidia.com/v1` | 97 | live 97 | Up to 40 RPM, 8K–1M | text,reasoning,image,video,embedding | `NVIDIA_API_KEYS` |
| **ModelScope** | `modelscope` | `https://api-inference.modelscope.cn/v1` | 43 | live Permanent → all | 2K RPD total, ≤500/model | text,image,video,audio | `MODELSCOPE_API_KEYS` |
| **Cloudflare Workers AI** | `cloudflare-workers-ai` | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run` | 35 | live Permanent → all | 10K neurons/day | text,image,reasoning,code | `CLOUDFLARE_API_TOKEN` + `ACCOUNT_ID` |
| **Google Gemini** | `google-gemini` / `gemini` | `https://generativelanguage.googleapis.com/v1beta` | 19 | live Permanent → all (4 Unlimited Live) | 15 RPM/1.5K RPD Flash, 30 RPM Lite, **Unlimited Live API** (Native Audio 1M TPM, Flash Live 65K, Transcribe/Translate 20K) + Gemma 4 26B/31B 262K | text,image,video,audio,live,transcription | `GEMINI_API_KEYS` |
| **OVHcloud AI Endpoints** | `ovhcloud-ai-endpoints` | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | 10 | live Permanent → all | 2 RPM anon | text,image,video | `OVHCLOUD_API_KEYS` |
| **Cohere** | `cohere` | `https://api.cohere.com/v2` | 10 | live Permanent → all | — | text,reasoning,embedding,rerank | `COHERE_API_KEYS` |
| **SambaNova** | `sambanova` | `https://api.sambanova.ai/v1` | 4 | live | — | text,reasoning | `SAMBANOVA_API_KEYS` |
| **SiliconFlow** | `siliconflow` | `https://api.siliconflow.cn/v1` | 2 | live | — | text,reasoning | `SILICONFLOW_API_KEYS` |
| **Chutes.ai** | `chutes-ai` / `chutes` | `https://api.chutes.ai/v1` | 2 | live | — | text,reasoning | `CHUTES_API_KEYS` |
| **Glhf.chat** | `glhf-chat` / `glhf` | `https://glhf.chat/api/openai/v1` | 2 | live public | — | text | `GLHF_API_KEYS` |
| **Z AI (Zhipu)** | `z-ai-zhipu-ai` | `https://api.z.ai/api/paas/v4` | 3 (glm-4.7-flash, glm-4.5-flash, glm-4.6v-flash) | live | 1 concurrent | text,reasoning,image,video | `Z_AI_API_KEYS` |
| **Agnes AI** | `agnes-ai` | `https://apihub.agnes-ai.com/v1` | 5 | live | 30 RPM | text,vision | `AGNES_API_KEYS` |
| **Aion Labs** | `aion-labs` | `https://api.aionlabs.ai/v1` | 5 | live | — | text | `AION_API_KEYS` |
| **LLM7.io** | `llm7-io` | `https://api.llm7.io/v1` | 6 | live public | — | text,reasoning | `LLM7_API_KEYS` |
| **Cerebras** | `cerebras` | `https://api.cerebras.ai/v1` | 5 | live | 15 RPM/30K TPM/1M TPD, 128K ctx | text,reasoning | `CEREBRAS_API_KEYS` |
| **Groq** | `groq` | `https://api.groq.com/openai/v1` | 7 / 23 total | live | 30 RPM/250 RPD primary, 14.4K RPD large | text,reasoning | `GROQ_API_KEYS` |
| **OpenCode Zen** | `opencode` | `https://opencode.ai/zen/v1` | 8 | live | — | reasoning,vision | `OPENCODE_API_KEYS` |
| **Ollama Cloud** | `ollama-cloud` | `https://api.ollama.com` | 3 / 8 total | live public | Session/weekly limits | text,reasoning | `OLLAMA_CLOUD_API_KEYS` |
| **Groq xAI** | `grok-xai` / `xai` | `https://api.x.ai/v1` | 2 | live | — | text | `GROK_API_KEYS` / `XAI_API_KEYS` |

### Quota / Trial (P1 — dùng sau Permanent)

| Provider | Slug | Free (freellms) | Live free (freeOnly lọc `:free`/Permanent/freellms list) | Limit | Env Key |
|----------|------|----------------|--------------------------------------------------------|-------|---------|
| **GitHub Models** | `github-models` | 13 | lọc freellms list | PAT, quota | `GITHUB_TOKENS` |
| **Mistral AI** | `mistral-ai` / `mistral` | 9 | lọc | 5 RPS free | `MISTRAL_API_KEYS` |
| **Kilo Code** | `kilo-code` | 8 | `:free` suffix | ~200 req/hr, `:free` suffix | `KILO_CODE_API_KEYS` |

### Legacy / extra (vẫn hỗ trợ)

| Provider | Base URL | Env |
|----------|----------|-----|
| Together AI | `https://api.together.xyz/v1` | `TOGETHER_API_KEYS` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEYS` |
| Novita | `https://api.novita.ai/v3/openai` | `NOVITA_API_KEYS` |
| DeepSeek | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEYS` |
| Pollinations | `https://text.pollinations.ai/openai` | `POLLINATIONS_API_KEY` (tùy chọn, `enter.pollinations.ai` budget theo key; để trống vẫn chạy anonymous) |

> Pollinations hết budget: `402/403 "reached its budget"` và `200 SSE {error:"reached its budget"}` được coi là lỗi retryable (`provider-executor.ts` detector + `circuit-breaker.ts:63` 402/403 retryable) — gateway tự fallback sang provider tiếp theo của `free-llm-gateway/auto` (`kiraai→llm7-io→kilo-code…`) và mở breaker sau `CIRCUIT_BREAKER_THRESHOLD` (5). Khi có `POLLINATIONS_API_KEY`, `pollinations.ts` gửi `Authorization: Bearer <key>` để tracking đúng per-key budget. > Nạp tiền wallet không tự tăng per-key budget — phải vào `enter.pollinations.ai/edit-key` để raise.
> Cảnh báo scraped: Pollinations/LLM7 không ổn định, cần health cron và auto-disable trong P3.

## 3. Model Catalog — freellms 316 free (lịch sử) + live 882 free

`models.yaml:1` đã được sync từ freellms (lịch sử):

```bash
python scripts/sync-freellms.py   # fetch freellms.org -> data/*.json + models.yaml (disabled, không còn latest)
# Live hiện tại (source of truth)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER" | jq '.total, .free_only'
```

Mỗi entry freellms:

```yaml
- id: nvidia-nim/z-ai/glm-5.2
  provider: nvidia-nim
  context_length: 1048576
  score: 94
  tier: permanent
  verified: true
  capabilities: [text, reasoning]
  limit: "Up to 40 RPM"
```

Live `data/live-models.json` (freeOnly): mỗi model `{id, provider, display_name, context_length, owned_by}` — lọc: Permanent Free → tất cả live là free; Quota → chỉ `:free` suffix hoặc trong freellms free list.

Dashboard `/models` (Vite) và `GET /v1/models?hasKey=1` phục vụ từ `data/live-models.json` (live 882) khi hasRealKey, ngược lại từ `data/freellms-models-free.json:1` (316 rows, có `score`, `verified`, `limit`). Alias vẫn hỗ trợ:

```
auto           -> nvidia-nim, groq, cerebras, google-gemini, cloudflare
gpt-4 / gpt4   -> groq, cerebras, google-gemini, openrouter, nvidia-nim
claude-3       -> cohere, openrouter, mistral-ai
gemini-flash   -> google-gemini
llama          -> groq, cerebras, nvidia-nim, sambanova, ovhcloud
qwen           -> modelscope, ovhcloud, siliconflow, alibaba
glm            -> z-ai-zhipu-ai, nvidia-nim, modelscope
code           -> kilo-code, opencode, cohere, mistral-ai
```

Chi tiết top 30 theo score: xem `docs/FREELLMS_FREE_TIER.md:1` (lịch sử).

## 4. Fallback Tiers (đã cập nhật trong .env.example & config.ts)

```env
FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io"],["openrouter","kilo-code","pollinations"]]
```

Router `apps/gateway/src/lib/router.ts:1` dùng tier này + `providerMeta` để fallback khi 429/timeout. `hasKey` filter (`!xxx`, length>20) quyết định live cache.

## 5. Thêm provider mới

1. Thêm env vào `.env.example` (theo bảng trên)
2. Thêm vào `apps/gateway/src/config.ts:19` `providerKeys`
3. Đăng ký trong `apps/gateway/src/providers/registry.ts:1`:

```ts
export const myProvider = createOpenAICompatibleProvider({ id: "my-provider", baseUrl: "https://api.myprovider.com/v1" });
export const providers = { ..., myProvider };
```

4. Chạy `POST /api/models/live/sync` với real key để cập nhật `data/live-models.json` (thay vì `python scripts/sync-freellms.py` lịch sử)
5. Test:

```bash
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "x-router: my-provider" \
  -d '{"model":"my-model","messages":[{"role":"user","content":"hi"}]}'
```

## 6. Health Check (live) + hasRealKey highlight + rate limit

* `GET /api/providers?page=&limit=&q=&hasKey=` — `detailed[]` với `free_models`, `keys`, `hasRealKey` (check `!xxx`, length>20), `status`, **Get Key ↗** (link console) + freellms ↗. **UI highlight**: row có hasRealKey → `background #f0fdf4` + `borderLeft 3px solid #16a34a` + badge `● has key` xanh lá + cell `Keys: ✓ real` xanh + nút `Get Key` nền xanh lá. Pagination **LOV 25/50 ở sticky bottom**, top filter chỉ có `q` (debounce 400ms) + pill `hasKey`.
* `GET /api/providers/health` — live ping 41 providers parallel 5s (online/offline/no-key, `latency_ms`, `breaker: open/closed`)
* `GET /api/models/health?model=pollinations/openai` — probe chat 1 model (`usable` 2457ms, `unusable 410 Gone`)
* `GET /api/models/health?provider=nvidia-nim&limit=2` — bulk probe, summary `usable/unusable/no-key`
* `GET /api/models/health/persisted` — list persisted 404/410 Strikethrough `#dc2626` + `hide404` pill
* `GET /v1/models?hasKey=1` + `POST /api/models/live/sync {freeOnly:true}` — biết model nào thực sự free từ live (882 free)
* `GET /v1/models?verified=free` + Dashboard **Models** checkbox + `Check Live (n)` + `Used/Limit` (từ logs) — biết model nào thực sự usable (freellms snapshot)
* `GET /api/stats` — `allTimeTokens`, `tokensByProvider`, `avgTokens`, `providers:41`, `free_models:316`, `breakers`
* **Rate limit**: `middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) limit 4x (min 200), debounce search `q` 400ms để tránh 429.
