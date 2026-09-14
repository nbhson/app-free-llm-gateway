> **English** | [🇻🇳 Tiếng Việt](../vi/FREELLMS_FREE_TIER.md) | [Docs Index](../README.md)

# Free Tier — Aggregated from freellms.org (scan 2026-09-06 — historical, live is new source of truth)

> Source historical: https://freellms.org/providers/ (30 providers) & https://freellms.org/models/ (365 models, **316 FREE** = `data-free="1"`).  
> Auto-scanned on 2026-09-06; raw JSON data stored in `data/freellms-providers.json` and `data/freellms-models-free.json`. **Freellms sync is now disabled (not latest) — live `data/live-models.json` 2185 total / 882 free / 853 hasKey is now source of truth via `jobs/sync-live-models.ts` (freeOnly).**

## 1. Overview (historical vs live)

| Metric | Value (freellms 2026-09-06) | Live current (`POST /api/models/live/sync`) |
|--------|---------|--------|
| Providers | 30 | 30 (hasRealKey + public) |
| Total models | 365 | **2185 total fetched** |
| **FREE** models | **316 (86.6%)** | **882 free (freeOnly)** |
| Paid / Not-free models | 49 (mostly OpenRouter 28, Groq 16, Ollama Cloud 5) | 1303 filtered out (quota paid) |
| Permanent Free providers | 26 | 26 (all live are free) |
| Trial/Quota providers | 4 (Kilo Code, GitHub Models, Mistral AI, Hugging Face) | filtered `:free`/`freellms list` |
| No Credit Card | 29/30 (only Grok xAI requires a card) | — |
| OpenAI Compatible | 30/30 (per freellms.org snapshot) | live fetch via `provider.models()` |

## 2. Providers — ranked by number of FREE models (freellms)

| # | Provider | Slug | Tier | No Card | No Phone | Caps | FREE / Total (freellms) | Live free (hasKey) | Free tier notes |
|---|----------|------|------|---------|----------|------|--------------|----------------|-----------------|
| 1 | **NVIDIA NIM** | `nvidia-nim` | Permanent | ✅ | ❌ (phone required) | text,reasoning,image,video,embedding | **97 / 97** | 97 | Up to 40 RPM, 8K–1M ctx, no CC |
| 2 | **ModelScope** | `modelscope` | Permanent | ✅ | ✅ | text,image,video,audio | **43 / 43** | all live | Fully free, Alibaba Qwen family |
| 3 | **Cloudflare Workers AI** | `cloudflare-workers-ai` | Permanent | ✅ | ✅ | text,image,reasoning,code | **35 / 35** | all live | 35 models, Workers AI |
| 4 | **OpenRouter** | `openrouter` | Permanent | ✅ | ✅ | text,reasoning,code,image,video | **17 / 45** | `:free` only | 200 req/day (free tier), 28 paid models |
| 5 | **Google Gemini** | `google-gemini` | Permanent | ✅ | ✅ | text,image,video,audio,live,transcription | **19 / 19** | all live (4 Unlimited Live) | 15 RPM/1.5K RPD Flash, 30 RPM Lite, **Unlimited Live API** (Native Audio 1M TPM, Flash Live 65K, Transcribe/Translate 20K) + Gemma 4 26B/31B |
| 6 | **GitHub Models** | `github-models` | Quota | ✅ | ✅ | text,reasoning,image | **13 / 13** | freellms list | Trial, requires GitHub PAT, o4-mini/gpt-4.1 |
| 7 | **OVHcloud AI Endpoints** | `ovhcloud-ai-endpoints` | Permanent | ✅ | ✅ | text,image,video | **10 / 10** | all live | 2 RPM anonymous |
| 8 | **Cohere** | `cohere` | Permanent | ✅ | ✅ | text,reasoning,image,embedding | **10 / 10** | all live | Command A/A+/Rerank |
| 9 | **Mistral AI** | `mistral-ai` | Quota | ✅ | ✅ | text,code,image | **9 / 9** | freellms list | Trial free |
| 10 | **Kilo Code** | `kilo-code` | Quota | ✅ | ✅ | text,reasoning,image | **8 / 8** | `:free` only | ~200 req/hr, :free suffix |
| 11 | **OpenCode Zen** | `opencode` | Permanent | ✅ | ✅ | reasoning,vision,audio | **8 / 8** | all live | Opencode Zen |
| 12 | **Groq** | `groq` | Permanent | ✅ | ✅ | text,image,video | **7 / 23** | all live | 30 RPM/250 RPD (primary), 16 paid/check-provider |
| 13 | **LLM7.io** | `llm7-io` | Permanent | ✅ | ✅ | text,reasoning,image | **6 / 6** | public | LLM7 |
| 14 | **Agnes AI** | `agnes-ai` | Permanent | ✅ | ✅ | text,vision,image | **5 / 5** | all live | 30 RPM |
| 15 | **Cerebras** | `cerebras` | Permanent | ✅ | ✅ | text,reasoning | **5 / 5** | all live | 15 RPM/30K TPM/1M TPD, WSE chips |
| 16 | **Aion Labs** | `aion-labs` | Permanent | ✅ | ✅ | text | **5 / 5** | all live | Aion 3.0 family |
| 17 | **SambaNova** | `sambanova` | Permanent | ✅ | ✅ | text,reasoning,image | **4 / 4** | all live | SambaNova |
| 18 | **Z AI (Zhipu AI)** | `z-ai-zhipu-ai` | Permanent | ✅ | ✅ | text,reasoning,image | **4 / 4** | all live | GLM-4.7-Flash etc |
| 18 | **OVHCloud AI Endpoints** | `ovhcloud-ai-endpoints` | Quota | ✅ | ✅ | text,code | **2 / 2** | public | Inference API |
| 20 | **Ollama Cloud** | `ollama-cloud` | Permanent | ✅ | ✅ | text,reasoning,image | **3 / 8** | public | Session/weekly limits, 5 paid |
| 21 | **Glhf.chat** | `glhf-chat` | Permanent | ✅ | ✅ | text | **2 / 2** | public | Mixtral 8x7B, Llama 3.1 70B |
| 22 | **SiliconFlow** | `siliconflow` | Permanent | ✅ | ✅ | text,reasoning | **2 / 2** | all live | DeepSeek R1 |
| 23 | **Chutes.ai** | `chutes-ai` | Permanent | ✅ | ✅ | text,reasoning | **2 / 2** | all live | Chutes |
| 24 | **Grok (xAI)** | `grok-xai` | Permanent | ❌ | — | text | **2 / 2** | all live | Card required |
| 25–30 | Nscale, Nebius, Alibaba, xAI, DeepSeek, AI21 | … | Permanent | ✅ | ✅ | … | 1–4 | all live | Remaining providers |

> **Recommended gateway integration priority** (by FREE count + OpenAI compat + no-card):
> **P0**: NVIDIA NIM (97), Groq (7), Cerebras (5), Gemini (15), Cloudflare (35), GitHub Models (13), Cohere (10), SambaNova (4), SiliconFlow (2), Chutes (2), Glhf (2), Mistral (9)
> **P1**: ModelScope (43) + OVH (10) + LLM7 (6) + Agnes (5) — adds Qwen/GLM/Rerank
> **P2**: OpenRouter (17 free) — use as fallback tier, quota 200 req/day — live only `:free`
> **P3**: Kilo Code/OpenCode Zen/Aion/Z AI — experimental, less stable — live only `:free`

Per-provider snapshot details (from freellms.org/provider/<slug>):

- **NVIDIA NIM**: Base `https://integrate.api.nvidia.com/v1`, Phone Required=Yes, Rate ~40 RPM shared, Context 8K–1M, Last 2026-08-06
- **Groq**: Base `https://api.groq.com/openai/v1`, 30 RPM/250 RPD primary, 30 RPM/14.4K RPD most models, LPU 2.6k tok/s
- **Cerebras**: Base `https://api.cerebras.ai/v1`, 15 RPM/30K TPM/1M TPD, 128K–131K ctx, WSE
- **Gemini**: Base `generativelanguage.googleapis.com/v1beta`, 15 RPM/1.5K RPD Flash, Vision+Audio, **4 Unlimited Live** (2.5 Flash Native Audio Dialog 1M TPM, 3 Flash Live 65K, 3.5 Live Translate/Transcribe 20K), Gemma 4 26B/31B 262K ctx
- **Cohere**: Rerank + Command A, embedding
- **Cloudflare**: Workers AI, 8K–262K, binding `ai` (different OpenAI path)

## 3. FREE Models — top 30 by score (freellms.org score 0–100, historical) — live top differs

| Score | Provider | Model ID | Context | Rate Limit | Verified | Live current |
|-------|----------|----------|---------|------------|----------|----------------|
| 94 | NVIDIA NIM | z-ai/glm-5.2 | 1.0M | Up to 40 RPM | ✅ | live |
| 91 | Google Gemini | gemini 3.6 flash | 1.0M | 15 RPM, 1,500 RPD | ✅ | live |
| 88 | NVIDIA NIM | deepseek-ai/deepseek-v4-flash | 1.0M | Up to 40 RPM | ✅ | live |
| 88 | Ollama Cloud | minimax-m3 | 1.0M | Session/weekly limits | ✅ | public |
| 87 | NVIDIA NIM | minimaxai/minimax-m3 | 1.0M | Up to 40 RPM | ✅ | live |
| 87 | Google Gemini | gemini 3.5 flash | 1.0M | 15 RPM, 1,500 RPD | ✅ | live |
| 85 | Kilo Code | inclusionai/ling-3.0-flash:free | 262K | ~200 req/hr | ❌ | `:free` |
| 85 | OpenRouter | nvidia: nemotron 3 ultra (free) | 1.0M | 200 req/day | ✅ | `:free` |
| 83 | Kilo Code | nvidia/nemotron-3-ultra-550b-a55b:free | 1.0M | ~200 req/hr | ❌ | `:free` |
| 82 | NVIDIA NIM | moonshotai/kimi-k2.6 | 262K | Up to 40 RPM | ✅ | live |
| 81 | Agnes AI | agnes-2.0-flash | 256K | 30 RPM | ✅ | live |
| 81 | Google Gemini | gemini 3.5 flash-lite | 1.0M | 30 RPM, 1,500 RPD | ✅ | live |
| 78 | OVHcloud | qwen3.6-27b | 131K | 2 RPM (anonymous) | ❌ | live |
| 77 | NVIDIA NIM | stepfun-ai/step-3.7-flash | 262K | Up to 40 RPM | ✅ | live |
| … | … | … | … | … | … | … |

See all freellms 316 models: `data/freellms-models-free.json` (historical). Live 882 free: `GET /api/models/live` or `GET /v1/models?hasKey=1`.

## 4. Analysis for Gateway Integration

### Adapter priority

1. **Group A — Pure OpenAI-compatible (easiest)**: NVIDIA, Groq, Cerebras, Cloudflare (Workers AI uses path `/accounts/{id}/ai/run`), Cohere (`/compatibility/v1`), SambaNova, SiliconFlow, Chutes, HuggingFace, Glhf, Mistral, OVH
   - Only `baseUrl + Authorization: Bearer` is needed with the `createOpenAICompatibleProvider` factory
2. **Group B — Gemini-style**: Google Gemini (requires `format-translator`)
3. **Group C — Scraped/Unlimited**: LLM7.io, Pollinations (not yet in the freellms.org dataset but still retained), Ollama Cloud (5 paid, so filter `data-free=1` — live filters `:free`)
4. **Group D — Quota trial**: GitHub Models (PAT `ghp_`), Kilo Code (`:free` suffix) — mark as `quota` so the router deprioritizes them behind Permanent, live keeps only `:free`/freellms list

### Suggested tier configuration

```json
FALLBACK_TIERS = [
  ["nvidia-nim", "groq", "cerebras", "google-gemini"],
  ["cloudflare-workers-ai", "cohere", "sambanova", "siliconflow"],
  ["ovhcloud-ai-endpoints", "modelscope", "llm7-io"],
  ["openrouter", "kilo-code", "pollinations"]
]
```

### Rate limit mapping for `quota-tracker.ts` + `middleware/rate-limit.ts` 4x

| Provider | RPM | RPD | TPM/TPD | Notes |
|----------|-----|-----|---------|-------|
| NVIDIA | 40 shared | — | — | phone required |
| Groq | 30 | 250–14.4K | — | per-model |
| Cerebras | 15 | — | 30K TPM / 1M TPD | — |
| Gemini Flash | 15 | 1.5K | — | — |
| Gemini Lite | 30 | 1.5K | — | — |
| Gemini Live Unlimited | Unlimited | Unlimited | 1M Native Audio, 65K Flash Live, 20K Translate/Transcribe | Live API — aistudio.google.com/rate-limit |
| Gemma 4 31B/26B | 15 | 1.5K | 262K ctx | text/reasoning/code |
| OVH | 2 anon | — | — | — |
| Agnes | 30 | — | — | — |
| OpenRouter | — | 200 free | — | — |
| Kilo | ~200/hr | — | — | — |

## 5. Data Files (historical vs live)

- `data/freellms-providers.json` — 30 providers, fields: `name, slug, tier, tier_type, caps, noCard, noPhone, free_models, total_models` (historical, disabled)
- `data/freellms-models-free.json` — 316 models, fields: `name, provider, slug, context, tier_type, verified, free, nocard, modality, score, limit` (historical)
- `data/live-models.json` — **new, source of truth**: `total, providers, free_only, total_fetched, models[]` (2185 total / 882 free, filtered freeOnly)
- `data/model-health.json` — persisted 404/410 for `hide404`

Used to:
- Generate `models.yaml` for the gateway: `bun run sync:freellms --out models.yaml` (historical)
- Seed `providers/registry.ts` providerIds
- Power the dashboard at `/models?hasKey=1` (live) or `?free=1` (freellms snapshot)
- Live: `POST /api/models/live/sync` with real keys (`!xxx`, length>20) → `data/live-models.json`

## 6. How to Re-sync

```bash
# Live current (source of truth)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
curl http://localhost:7373/api/models/live | jq '.total, .providers, .free_only'
npx tsx apps/gateway/src/jobs/sync-live-models.ts

# Historical freellms (disabled)
curl -s https://freellms.org/providers/ | grep -o 'ItemList' # check version
python3 scripts/sync-freellms.py  # fetch & regenerate data/ (not latest)
```

Last freellms scan: **2026-09-06T08:01 UTC** (script `scripts/sync-freellms.py:1`), data `data/verified-models.json:1` (dry-run 314/316 verified, live 5/316 due to missing keys). **Live scan**: `jobs/sync-live-models.ts:1` 2185 total, 882 free, `GET /api/verify/summary` + `GET /api/models/live` — scheduler 24h auto-syncs. See `docs/OPERATIONS.md:1`.

> **Verification & live note:** freellms may list a model as free while live checks show it is already deprecated (e.g. llm7 4/6 in the public probe). The gateway marks these as `deprecated` and you can filter with `?verified=free` (snapshot) or `?hasKey=1` (live 882 free). **Freellms is now disabled** — use live for accuracy. Persisted 404/410 saved in `data/model-health.json` + `hide404` pill, rate-limit for list endpoints increased to 4x (200) + 400ms debounce.
