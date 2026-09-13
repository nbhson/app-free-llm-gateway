> **English** | [🇻🇳 Tiếng Việt](../vi/PROVIDERS.md) | [Docs Index](../README.md)

# Providers

> **Historical source: freellms.org (scan 2026-09-06) — 30 providers, 316 free models, 41 IDs — live sync is now source of truth (2185 total / 882 free / 853 hasKey, `?hasKey=1` 2190 total) + 2 new providers B.AI/TokenHarbor → 51 IDs, 338 models (2026-09-10).**  
> Dashboard nav has **Providers (51) before Models (338)**. The **Get Key ↗** column (direct console + freellms ↗) lives in `apps/web/src/pages/Providers.tsx:1` + `lib/getKeyUrls.ts:1` (32 URLs). Table **highlights hasRealKey**: `background #f0fdf4` + `borderLeft 3px #16a34a` + badge `● has key` green + `Keys` `✓ real` green + `Get Key` green when hasRealKey. **Top filter** debounce 400ms `q` + pill `hasKey`, **sticky bottom pagination** LOV 25/50 (no longer on top).  
> Historical details: [`docs/FREELLMS_FREE_TIER.md`](FREELLMS_FREE_TIER.md) + `data/freellms-providers.json:1` / `data/freellms-models-free.json:1`; **live**: `data/live-models.json:1` / `GET /api/models/live` / `POST /api/models/live/sync`  
> Gateway `apps/gateway/src/providers/registry.ts:1` holds 51 IDs (30 freellms slugs + 14 alias + 2 new + 2 B.AI alias + 1 TokenHarbor + 2 b-ai alias), `models.yaml:1` has 338 models (316 freellms + 14 KiraAI + 8 B.AI/TokenHarbor), and `lib/paths.ts:1` fixes the 7→316 bug, `middleware/rate-limit.ts:1` 4x list limit 200.

## 1. freellms.org Overview (historical) + live current

| Metric | Value (freellms snapshot) | Live current (sync-live-models.ts) |
|--------|----------|----------------|
| Providers | **30** (26 Permanent Free, 4 Quota) | 30 (real keys + public) |
| Models | **365** (316 FREE `data-free=1`, 49 paid) | **2185 total fetched / 882 free (freeOnly) / 853 hasKey** |
| `GET /v1/models?hasKey=1` | — | **2190 total** (live + alias) |
| No Card | 29/30 (only Grok xAI requires one) | — |
| OpenAI Compatible | 30/30 | live fetch via `provider.models()` |
| Scan date | 2026-09-06, script `scripts/sync-freellms.py` **disabled, not latest** | Live sync every 24h via `jobs/scheduler.ts` + `POST /api/models/live/sync {freeOnly:true}` |

## 2. List of 30 Providers (from freellms.org — historical, live fetch via real keys)

### Permanent Free — No Card (P0 priority)

| Provider | Slug | Base URL | Free Models (freellms) | Live free (hasKey) | Limit | Caps | Env Key |
|----------|------|----------|-----------------------|-------------------|-------|------|---------|
| **NVIDIA NIM** | `nvidia-nim` | `https://integrate.api.nvidia.com/v1` | 97 | live 97 | Up to 40 RPM, 8K–1M | text,reasoning,image,video,embedding | `NVIDIA_API_KEYS` |
| **ModelScope** | `modelscope` | `https://api-inference.modelscope.cn/v1` | 43 | live Permanent → all | 2K RPD total, ≤500/model | text,image,video,audio | `MODELSCOPE_API_KEYS` |
| **Cloudflare Workers AI** | `cloudflare-workers-ai` | `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run` | 35 | live Permanent → all | 10K neurons/day | text,image,reasoning,code | `CLOUDFLARE_API_TOKEN` + `ACCOUNT_ID` |
| **Google Gemini** | `google-gemini` / `gemini` | `https://generativelanguage.googleapis.com/v1beta` | 15 | live Permanent → all | 15 RPM/1.5K RPD (Flash), 30 RPM Lite | text,image,video,audio | `GEMINI_API_KEYS` |
| **OVHcloud AI Endpoints** | `ovhcloud-ai-endpoints` | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | 10 | live Permanent → all | 2 RPM anon | text,image,video | `OVHCLOUD_API_KEYS` |
| **Cohere** | `cohere` | `https://api.cohere.com/v2` | 10 | live Permanent → all | — | text,reasoning,embedding,rerank | `COHERE_API_KEYS` |
| **SambaNova** | `sambanova` | `https://api.sambanova.ai/v1` | 4 | live | — | text,reasoning | `SAMBANOVA_API_KEYS` |
| **SiliconFlow** | `siliconflow` | `https://api.siliconflow.cn/v1` | 2 | live | — | text,reasoning | `SILICONFLOW_API_KEYS` |
| **Chutes.ai** | `chutes-ai` / `chutes` | `https://api.chutes.ai/v1` | 2 | live | — | text,reasoning | `CHUTES_API_KEYS` |
| **Glhf.chat** | `glhf-chat` / `glhf` | `https://glhf.chat/api/openai/v1` | 2 | live public | — | text | `GLHF_API_KEYS` |
| **Z AI (Zhipu)** | `z-ai-zhipu-ai` | `https://open.bigmodel.cn/api/paas/v4` | 4 | live | — | text,reasoning | `Z_AI_API_KEYS` |
| **Agnes AI** | `agnes-ai` | `https://apihub.agnes-ai.com/v1` | 5 | live | 30 RPM | text,vision | `AGNES_API_KEYS` |
| **Aion Labs** | `aion-labs` | `https://api.aionlabs.ai/v1` | 5 | live | — | text | `AION_API_KEYS` |
| **LLM7.io** | `llm7-io` | `https://api.llm7.io/v1` | 6 | live public | — | text,reasoning | `LLM7_API_KEYS` |
| **Cerebras** | `cerebras` | `https://api.cerebras.ai/v1` | 5 | live | 15 RPM/30K TPM/1M TPD, 128K ctx | text,reasoning | `CEREBRAS_API_KEYS` |
| **Groq** | `groq` | `https://api.groq.com/openai/v1` | 7 / 23 total | live | 30 RPM/250 RPD primary, 14.4K RPD large | text,reasoning | `GROQ_API_KEYS` |
| **OpenCode Zen** | `opencode` | `https://opencode.ai/zen/v1` | 8 | live | — | reasoning,vision | `OPENCODE_API_KEYS` |
| **Ollama Cloud** | `ollama-cloud` | `https://api.ollama.com` | 3 / 8 total | live public | Session/weekly limits | text,reasoning | `OLLAMA_CLOUD_API_KEYS` |
| **B.AI** | `b-ai` / `bai` / `chat-b-ai` | `https://api.b.ai/v1` | 4 (qwen3.8-flash, hy3, mimo-v2.5, glm-5.3-flash) | live 0 Credits (free) | 0 Credits, promo 10% after 2026-09-12 | text,reasoning,image,video | `BAI_API_KEYS` |
| **TokenHarbor** | `tokenharbor` | `https://tokenharbor.ai/v1` | 3 + 1 reserved (`:free` tier: deepseek-v4.1-flash:free, deepseek-v4-flash:free, mimo-v2.5:free) | live Free (:free) | Free | text,reasoning,image,video | `TOKENHARBOR_API_KEYS` |
| **Groq xAI** | `grok-xai` / `xai` | `https://api.x.ai/v1` | 2 | live | — | text | `GROK_API_KEYS` / `XAI_API_KEYS` |

### Quota / Trial (P1 — used after Permanent)

| Provider | Slug | Free (freellms) | Live free (freeOnly `:free`/Permanent/freellms list) | Limit | Env Key |
|----------|------|----------------|--------------------------------------------------------|-------|---------|
| **GitHub Models** | `github-models` | 13 | filtered via freellms list | PAT, quota | `GITHUB_TOKENS` |
| **Mistral AI** | `mistral-ai` / `mistral` | 9 | filtered | 5 RPS free | `MISTRAL_API_KEYS` |
| **Kilo Code** | `kilo-code` | 8 | `:free` suffix | ~200 req/hr, `:free` suffix | `KILO_CODE_API_KEYS` |

### Legacy / Extra (still supported)

| Provider | Base URL | Env |
|----------|----------|-----|
| Together AI | `https://api.together.xyz/v1` | `TOGETHER_API_KEYS` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEYS` |
| Novita | `https://api.novita.ai/v3/openai` | `NOVITA_API_KEYS` |
| DeepSeek | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEYS` |
| Pollinations | `https://text.pollinations.ai/openai` | `POLLINATIONS_API_KEY` (optional, `enter.pollinations.ai` per-key budget; anonymous works) |

> Pollinations budget fallback: `402/403 "reached its budget"` and streaming `200 SSE {error:"reached its budget"}` are treated as retryable failures (`provider-executor.ts` budget detector + `circuit-breaker.ts:63` 402/403 retryable) and the gateway auto-falls back to the next `auto` tier (`kiraai→llm7-io→kilo-code…`) and opens the breaker after `CIRCUIT_BREAKER_THRESHOLD` (5). When `Authorization: Bearer <key>` is set (`pollinations.ts`), per-key budget is tracked correctly. > Topping up the wallet alone does not raise the per-key budget — use `enter.pollinations.ai/edit-key` to raise it.
> Scraped warning: Pollinations/LLM7 are not fully stable and need a health cron with auto-disable in P3.

## 3. Model Catalog — freellms 316 free (historical) + live 882 free

`models.yaml:1` is synced from freellms (historical):

```bash
python scripts/sync-freellms.py   # fetch freellms.org -> data/*.json + models.yaml (disabled, not latest)
# Live current (source of truth)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
curl http://localhost:7373/api/models/live -H "Authorization: Bearer $MASTER" | jq '.total, .free_only'
```

Each freellms entry:

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

Live `data/live-models.json` (freeOnly): each model `{id, provider, display_name, context_length, owned_by}` — filtered: Permanent Free → all live are free; Quota → only `:free` suffix or in freellms free list.

The Dashboard at `/models` (Vite) and `GET /v1/models?hasKey=1` are served from `data/live-models.json` (live 882) when hasRealKey, otherwise from `data/freellms-models-free.json:1` (316 rows with `score`, `verified`, `limit`). Aliases are still supported:

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

Top 30 by score: see `docs/FREELLMS_FREE_TIER.md:1` (historical).

## 4. Fallback Tiers (updated in .env.example & config.ts)

```env
FALLBACK_TIERS=[["nvidia-nim","groq","cerebras","google-gemini"],["cloudflare-workers-ai","cohere","sambanova","siliconflow"],["ovhcloud-ai-endpoints","modelscope","llm7-io"],["openrouter","kilo-code","pollinations"]]
```

The router `apps/gateway/src/lib/router.ts:1` uses this tier along with `providerMeta` to fall back on 429/timeout. `hasKey` filter (`!xxx`, length>20) determines live cache usage.

## 5. Adding a New Provider

1. Add the env var to `.env.example` (per the table above)
2. Add it to `apps/gateway/src/config.ts:19` `providerKeys`
3. Register it in `apps/gateway/src/providers/registry.ts:1`:

```ts
export const myProvider = createOpenAICompatibleProvider({ id: "my-provider", baseUrl: "https://api.myprovider.com/v1" });
export const providers = { ..., myProvider };
```

4. Run `POST /api/models/live/sync` with a real key to update `data/live-models.json` (instead of historical `python scripts/sync-freellms.py`)
5. Test:

```bash
curl http://localhost:7373/v1/chat/completions \
  -H "Authorization: Bearer fgk-xxx" \
  -H "x-router: my-provider" \
  -d '{"model":"my-model","messages":[{"role":"user","content":"hi"}]}'
```

## 6. Health Check (live) + hasRealKey highlight + rate limit

* `GET /api/providers?page=&limit=&q=&hasKey=` — `detailed[]` with `free_models`, `keys`, `hasRealKey` (check `!xxx`, length>20), `status`, **Get Key ↗** (console link) + freellms ↗. **UI highlight**: row with hasRealKey → `background #f0fdf4` + `borderLeft 3px solid #16a34a` + badge `● has key` green + cell `Keys: ✓ real` green + `Get Key` button green. Pagination **LOV 25/50 at sticky bottom**, top filter only `q` (400ms debounce) + pill `hasKey`.
* `GET /api/providers/health` — live ping of 41 providers in parallel with 5s timeout (online/offline/no-key, `latency_ms`, `breaker: open/closed`)
* `GET /api/models/health?model=pollinations/openai` — single-model chat probe (`usable` 2457ms, `unusable 410 Gone`)
* `GET /api/models/health?provider=nvidia-nim&limit=2` — bulk probe, summary `usable/unusable/no-key`
* `GET /api/models/health/persisted` — list persisted 404/410 strikethrough `#dc2626` + `hide404` pill
* `GET /v1/models?hasKey=1` + `POST /api/models/live/sync {freeOnly:true}` — identify actually free models from live (882 free)
* `GET /v1/models?verified=free` + Dashboard **Models** checkbox + `Check Live (n)` + `Used/Limit` (from logs) — identifies which models are actually usable (freellms snapshot)
* `GET /api/stats` — `allTimeTokens`, `tokensByProvider`, `avgTokens`, `providers:41`, `free_models:316`, `breakers`
* **Rate limit**: `middleware/rate-limit.ts` — list endpoints (`/v1/models`, `/api/providers`, `/api/models/health`) limit 4x (min 200), debounce search `q` 400ms to prevent 429.
