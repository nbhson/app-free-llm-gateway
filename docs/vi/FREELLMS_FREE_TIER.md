> **Tiếng Việt** | [🇬🇧 English](../en/FREELLMS_FREE_TIER.md) | [Docs Index](../README.md)

# Free Tier — Tổng hợp từ freellms.org (scan 2026-09-06 — lịch sử, live là source of truth mới)

> Nguồn lịch sử: https://freellms.org/providers/ (30 providers) & https://freellms.org/models/ (365 models, **316 FREE** = `data-free="1"`).  
> Scan tự động lúc 2026-09-06, dữ liệu JSON thô lưu tại `data/freellms-providers.json` và `data/freellms-models-free.json`. **Hiện freellms sync đã disabled (không còn latest) — live `data/live-models.json` 2185 total / 882 free / 853 hasKey mới là source of truth qua `jobs/sync-live-models.ts` (freeOnly).**

## 1. Tổng quan (lịch sử vs live)

| Chỉ số | Giá trị (freellms 2026-09-06) | Live hiện tại (`POST /api/models/live/sync`) |
|--------|---------|----------------------|
| Providers | 30 | 30 (hasRealKey + public) |
| Models tổng | 365 | **2185 total fetched** |
| Models **FREE** | **316 (86.6%)** | **882 free (freeOnly)** |
| Models Paid/Chưa free | 49 (chủ yếu OpenRouter 28, Groq 16, Ollama Cloud 5) | 1303 filtered out (quota paid) |
| Providers Permanent Free | 26 | 26 (all live là free) |
| Providers Trial/Quota | 4 (Kilo Code, GitHub Models, Mistral AI, Hugging Face) | lọc `:free`/`freellms list` |
| No Credit Card | 29/30 (chỉ Grok xAI yêu cầu card) | — |
| OpenAI Compatible | 30/30 đều hỗ trợ (theo freellms.org snapshot) | live fetch via `provider.models()` |

## 2. Providers — bảng xếp hạng theo số model FREE (freellms)

| # | Provider | Slug | Tier | No Card | No Phone | Caps | FREE / Tổng (freellms) | Live free (hasKey) | Ghi chú free tier |
|---|----------|------|------|---------|----------|------|-------------|-------------------|-------------------|
| 1 | **NVIDIA NIM** | `nvidia-nim` | Permanent | ✅ | ❌ (cần phone) | text,reasoning,image,video,embedding | **97 / 97** | 97 | Up to 40 RPM, 8K–1M ctx, no CC |
| 2 | **ModelScope** | `modelscope` | Permanent | ✅ | ✅ | text,image,video,audio | **43 / 43** | all live | Full free, Alibaba Qwen family |
| 3 | **Cloudflare Workers AI** | `cloudflare-workers-ai` | Permanent | ✅ | ✅ | text,image,reasoning,code | **35 / 35** | all live | 35 models, Workers AI |
| 4 | **OpenRouter** | `openrouter` | Permanent | ✅ | ✅ | text,reasoning,code,image,video | **17 / 45** | `:free` only | 200 req/day (free tier), 28 paid models |
| 5 | **Google Gemini** | `google-gemini` | Permanent | ✅ | ✅ | text,image,video,audio,live,transcription | **19 / 19** | all live (4 Unlimited Live) | 15 RPM/1.5K RPD Flash, 30 RPM Lite, **Unlimited Live API** (Native Audio 1M TPM, Flash Live 65K, Transcribe/Translate 20K) + Gemma 4 26B/31B |
| 6 | **GitHub Models** | `github-models` | Quota | ✅ | ✅ | text,reasoning,image | **13 / 13** | freellms list | Trial, نیاز GitHub PAT, o4-mini/gpt-4.1 |
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
| 19 | **Ollama Cloud** | `ollama-cloud` | Permanent | ✅ | ✅ | text,reasoning,image | **3 / 8** | public | Session/weekly limits, 5 paid |
| 21 | **Glhf.chat** | `glhf-chat` | Permanent | ✅ | ✅ | text | **2 / 2** | public | Mixtral 8x7B, Llama 3.1 70B |
| 22 | **SiliconFlow** | `siliconflow` | Permanent | ✅ | ✅ | text,reasoning | **2 / 2** | all live | DeepSeek R1 |
| 23 | **Chutes.ai** | `chutes-ai` | Permanent | ✅ | ✅ | text,reasoning | **2 / 2** | all live | Chutes |
| 24 | **Grok (xAI)** | `grok-xai` | Permanent | ❌ | — | text | **2 / 2** | all live | Yêu cầu card |
| 25–30 | Nscale, Nebius, Alibaba, xAI, DeepSeek, AI21 | … | Permanent | ✅ | ✅ | … | 1–4 | all live | Các provider còn lại |

> **Khuyến nghị tích hợp cho gateway** (theo độ ưu tiên FREE + OpenAI compat + no-card):
> **P0**: NVIDIA NIM (97), Groq (7), Cerebras (5), Gemini (15), Cloudflare (35), GitHub Models (13), Cohere (10), SambaNova (4), SiliconFlow (2), Chutes (2), Glhf (2), Mistral (9)
> **P1**: ModelScope (43) + OVH (10) + LLM7 (6) + Agnes (5) — bổ sung Qwen/GLM/Rerank
> **P2**: OpenRouter (17 free) — dùng như fallback tier, quota 200 req/day — live chỉ `:free`
> **P3**: Kilo Code/OpenCode Zen/Aion/Z AI — thử nghiệm, ít stable — live chỉ `:free`

Chi tiết per-provider snapshot (từ freellms.org/provider/<slug>):

- **NVIDIA NIM**: Base `https://integrate.api.nvidia.com/v1`, Phone Required=Yes, Rate ~40 RPM shared, Context 8K–1M, Last 2026-08-06
- **Groq**: Base `https://api.groq.com/openai/v1`, 30 RPM/250 RPD primary, 30 RPM/14.4K RPD most models, LPU 2.6k tok/s
- **Cerebras**: Base `https://api.cerebras.ai/v1`, 15 RPM/30K TPM/1M TPD, 128K–131K ctx, WSE
- **Gemini**: Base `generativelanguage.googleapis.com/v1beta`, 15 RPM/1.5K RPD Flash, Vision+Audio, **4 Unlimited Live** (2.5 Flash Native Audio Dialog 1M TPM, 3 Flash Live 65K, 3.5 Live Translate/Transcribe 20K), Gemma 4 26B/31B 262K ctx
- **Cohere**: Rerank + Command A, embedding
- **Cloudflare**: Workers AI, 8K–262K, binding `ai` (khác OpenAI path)

## 3. Models FREE — top 30 theo score (freellms.org score 0–100, lịch sử) — live top khác

| Score | Provider | Model ID | Context | Rate Limit | Verified | Live hiện tại |
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

Xem toàn bộ freellms 316 models: `data/freellms-models-free.json` (lịch sử). Live 882 free: `GET /api/models/live` hoặc `GET /v1/models?hasKey=1`.

## 4. Phân tích để tích hợp gateway

### Ưu tiên adapter

1. **Nhóm A — OpenAI-compatible thuần túy (dễ nhất)**: NVIDIA, Groq, Cerebras, Cloudflare (Workers AI có path `/accounts/{id}/ai/run`), Cohere (`/compatibility/v1`), SambaNova, SiliconFlow, Chutes, HuggingFace, Glhf, Mistral, OVH
   - Chỉ cần `baseUrl + Authorization: Bearer` là chạy với factory `createOpenAICompatibleProvider`
2. **Nhóm B — Gemini-style**: Google Gemini (cần `format-translator`)
3. **Nhóm C — Scraped/Unlimited**: LLM7.io, Pollinations (hiện chưa trong freellms.org dataset nhưng vẫn giữ), Ollama Cloud (có 5 paid nên cần filter `data-free=1` — live lọc `:free`)
4. **Nhóm D — Quota trial**: GitHub Models (PAT `ghp_`), Kilo Code (`:free` suffix) — cần đánh dấu `quota` để router ưu tiên sau Permanent, live chỉ giữ `:free`/freellms list

### Gợi ý cấu hình tier

```json
FALLBACK_TIERS = [
  ["nvidia-nim", "groq", "cerebras", "google-gemini"],
  ["cloudflare-workers-ai", "cohere", "sambanova", "siliconflow"],
  ["ovhcloud-ai-endpoints", "modelscope", "llm7-io"],
  ["openrouter", "kilo-code", "pollinations"]
]
```

### Rate limit mapping để điền vào `quota-tracker.ts` + `middleware/rate-limit.ts` 4x

| Provider | RPM | RPD | TPM/TPD | Ghi chú |
|----------|-----|-----|---------|---------|
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

## 5. File dữ liệu (lịch sử vs live)

- `data/freellms-providers.json` — 30 providers, fields: `name, slug, tier, tier_type, caps, noCard, noPhone, free_models, total_models` (lịch sử, disabled)
- `data/freellms-models-free.json` — 316 models, fields: `name, provider, slug, context, tier_type, verified, free, nocard, modality, score, limit` (lịch sử)
- `data/live-models.json` — **mới, source of truth**: `total, providers, free_only, total_fetched, models[]` (2185 total / 882 free, filtered freeOnly)
- `data/model-health.json` — persisted 404/410 cho `hide404`

Dùng để:
- Sinh `models.yaml` cho gateway: `bun run sync:freellms --out models.yaml` (lịch sử)
- Seed `providers/registry.ts` providerIds
- Hiển thị dashboard `/models?hasKey=1` (live) hoặc `?free=1` (freellms snapshot)
- Live: `POST /api/models/live/sync` với real keys (`!xxx`, length>20) → `data/live-models.json`

## 6. Cách sync lại

```bash
# Live hiện tại (source of truth)
curl -X POST http://localhost:7373/api/models/live/sync -H "Authorization: Bearer $MASTER" -d '{"freeOnly":true}'
curl http://localhost:7373/api/models/live | jq '.total, .providers, .free_only'
npx tsx apps/gateway/src/jobs/sync-live-models.ts

# Lịch sử freellms (disabled)
curl -s https://freellms.org/providers/ | grep -o 'ItemList' # check version
python3 scripts/sync-freellms.py  # fetch & regenerate data/ (không còn latest)
```

Last scan freellms: **2026-09-06T08:01 UTC** (script `scripts/sync-freellms.py:1`), data `data/verified-models.json:1` (dry-run 314/316 verified, live 5/316 do thiếu keys). **Live scan**: `jobs/sync-live-models.ts:1` 2185 total, 882 free, `GET /api/verify/summary` + `GET /api/models/live` — scheduler 24h tự sync. Chi tiết xem `docs/OPERATIONS.md:1`.

> **Lưu ý verify & live:** freellms nói free nhưng live có thể đã deprecated (llm7 4/6 trong probe public). Gateway đánh dấu `deprecated` và có thể lọc `?verified=free` (snapshot) hoặc `?hasKey=1` (live 882 free). **Freellms hiện disabled** — dùng live mới chính xác. Persisted 404/410 lưu `data/model-health.json` + `hide404` pill, rate-limit list endpoints đã tăng 4x (200) + debounce 400ms.
