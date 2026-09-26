# Graph Report - app-auto-llm-free  (2026-09-26)

## Corpus Check
- 222 files · ~332,187 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 6, .example 1, .jsonc 1)

## Summary
- 1150 nodes · 2629 edges · 93 communities (53 shown, 40 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- BYOK & Adaptive Router State
- Gateway Core & Boot Sync
- Adaptive EWMA Router
- Quota Tracker
- Root Package & ESLint Config
- OTel & SSRF Guard
- Auth & Virtual Keys
- Chat Header & Composer UI
- Chat Component & API Types
- Gateway Chat Tests
- Gateway Type Definitions
- Gateway Package & Drizzle Config
- Token Compression Engine
- Freellms Sync Script
- Prometheus Metrics Layer
- Token Estimator
- Embeddings & Images Routes
- Web TypeScript Config
- Deployment & Docs Core
- Root TypeScript Config
- Web Package Config
- Favorites & Chat Hooks
- Gateway Dependencies
- Format Translator & Gemini Stream
- Web Dependencies
- Gateway Build Scripts
- Provider Adapters & Sanitize
- Gateway TypeScript Config
- Web Base URLs & Key URLs
- Web Node TypeScript Config
- Anthropic Provider & Base Types
- Settings Page
- Provider Registry & Sync Jobs
- Provider Executor & Interface
- Audio Routes & Scope Checks
- API Routes & Tests
- Context Panel & Token Estimation
- DB Migration & Postgres
- Error Boundary & Message List
- Compare Page
- Gateway App & Middleware
- Responses API Translator
- Responses & Conversations Routes
- Usage Page & Provider Types
- Providers Docs & Grok Catalog
- Gateway Config Module
- Anthropic Messages Translator
- Gateway Dev Dependencies
- Markdown Rendering Components
- Drizzle DB Schema
- Web Dev Dependencies
- Web Build Scripts
- Changelog & Roadmap Docs
- Operations Docs & Sync Workflow
- API Docs (EN/VI)
- Configuration Docs (EN/VI)
- Agnes AI Model Catalog
- Aion Labs Model Catalog
- B.AI Model Catalog
- Cerebras Model Catalog
- Chutes AI Model Catalog
- Cloudflare Workers AI Catalog
- Cohere Model Catalog
- CommandCode Model Catalog
- ExperientialLabs Model Catalog
- GitHub Models Catalog
- Google Gemini Model Catalog
- Groq Model Catalog
- Kilo Code Model Catalog
- KiosAPI Model Catalog
- KiraAI Model Catalog
- LLM7.io Model Catalog
- Mistral AI Model Catalog
- ModelScope Model Catalog
- NVIDIA NIM Model Catalog
- OpenCode Model Catalog
- OpenRouter Model Catalog
- OrcRouter Model Catalog
- OVHcloud Model Catalog
- SambaNova Model Catalog
- SiliconFlow Model Catalog
- TokenHarbor Model Catalog
- Z AI Zhipu Model Catalog
- Web Dashboard Entry HTML
- Benchmark Dashboard Screenshot
- Benchmark Screenshot Rationale
- Chat Screenshot Rationale
- Models Dashboard Screenshot
- Models Screenshot Rationale
- Providers Screenshot Rationale
- Usage Dashboard Screenshot
- Usage Screenshot Rationale
- CI Pipeline

## God Nodes (most connected - your core abstractions)
1. `vitest` - 51 edges
2. `config` - 40 edges
3. `Provider Catalog Doc` - 34 edges
4. `useLang()` - 31 edges
5. `tryProviders()` - 28 edges
6. `logger` - 25 edges
7. `resolveDataPath()` - 24 edges
8. `semanticCache` - 24 edges
9. `providers` - 23 edges
10. `readDataJson()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `README (project overview)` --references--> `Providers Dashboard Screenshot`  [EXTRACTED]
  README.md → docs/images/providers.png
- `Agnes AI provider` --references--> `Provider Catalog Doc`  [INFERRED]
  models/agnes-ai.yaml → docs/en/PROVIDERS.md
- `Aion Labs provider` --references--> `Provider Catalog Doc`  [INFERRED]
  models/aion-labs.yaml → docs/en/PROVIDERS.md
- `B.AI provider` --references--> `Provider Catalog Doc`  [INFERRED]
  models/b-ai.yaml → docs/en/PROVIDERS.md
- `Cerebras provider` --references--> `Provider Catalog Doc`  [INFERRED]
  models/cerebras.yaml → docs/en/PROVIDERS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **EN/VI bilingual docs pairing** — docs_en_roadmap_md, docs_vi_roadmap_md, docs_readme_md_docs_index [INFERRED 0.85]
- **2-layer sync documentation** — docs_en_operations_md, docs_en_providers_md, github_workflows_sync_freellms_yml_sync_freellms [INFERRED 0.85]
- **All 30 provider model catalogs feed the gateway registry + live sync** — models_nvidia_nim_yaml, models_cloudflare_workers_ai_yaml, models_unorouter_yaml [INFERRED 0.95]
- **Permanent-free provider catalogs (no card)** — models_groq_yaml, models_cerebras_yaml, models_google_gemini_yaml, models_agnes_ai_yaml [INFERRED 0.85]
- **Dashboard screenshot set (5 pages)** — docs_images_models_png, docs_images_providers_png, docs_images_usage_png, docs_images_chat_png, docs_images_benchmark_png [INFERRED 0.95]

## Communities (93 total, 40 thin omitted)

### Community 0 - "BYOK & Adaptive Router State"
Cohesion: 0.06
Nodes (73): updateLatencyEMA(), ByokMap, getByokForVk(), getByokKeys(), getEffectiveKeys(), hasByok(), listByokProviders(), load() (+65 more)

### Community 1 - "Gateway Core & Boot Sync"
Cohesion: 0.07
Nodes (59): config, app, detectNewProviders(), getCurrentFingerprint(), getFingerprintState(), getNewestProviders(), needsLiveSync(), nowIso() (+51 more)

### Community 2 - "Adaptive EWMA Router"
Cohesion: 0.07
Nodes (52): ADAPTIVE_STORE_PATH, adaptiveRank(), emaLatency, getAdaptiveScores(), getAdaptiveState(), lastUpdate, persistAdaptiveSync(), scheduleAdaptivePersist() (+44 more)

### Community 3 - "Quota Tracker"
Cohesion: 0.05
Nodes (33): commitUsageAsync(), FREELLMS_LIMITS, persistQuotaSync(), QUOTA_STORE_PATH, QuotaDim, quotaDims(), rpdWindows, rpmWindows (+25 more)

### Community 4 - "Root Package & ESLint Config"
Cohesion: 0.05
Nodes (41): devDependencies, concurrently, eslint, @eslint/js, globals, pg, react-is, @types/better-sqlite3 (+33 more)

### Community 5 - "OTel & SSRF Guard"
Cohesion: 0.08
Nodes (37): logGenAI(), otelEnabled(), withTrace(), BLOCKED_HOSTNAMES, fetchWithSsrfGuard(), isBlockedHostname(), isPrivateIp(), isSafeUrl() (+29 more)

### Community 6 - "Auth & Virtual Keys"
Cohesion: 0.11
Nodes (31): extractBearer(), isValidMasterKey(), isValidVirtualKey(), timingSafeEqual(), createVirtualKey(), deleteVirtualKey(), findByKey(), flushVirtualKeysSync() (+23 more)

### Community 7 - "Chat Header & Composer UI"
Cohesion: 0.12
Nodes (26): ChatHeader, Props, Composer, Props, useChatAttachments(), getWebToolsFromServer(), useChatStream(), UseChatStreamOpts (+18 more)

### Community 8 - "Chat Component & API Types"
Cohesion: 0.13
Nodes (25): CodeBlock, TipsCard, apps_web_src_index, ApiLog, ApiModel, GatewayStats, VerifySummary, VirtualKeyView (+17 more)

### Community 9 - "Gateway Chat Tests"
Cohesion: 0.10
Nodes (14): extractDelta, parserCode, parserPath, parseSseStream, loadModelsYaml(), ModelListEntry, modelYamlRoots(), parseModelsYamlContent() (+6 more)

### Community 10 - "Gateway Type Definitions"
Cohesion: 0.14
Nodes (13): ApiModelsResponse, ApiProvidersResponse, FreellmsProviderEntry, JsonValue, OpenAIChatResponse, OpenAIErrorBody, OpenAIModelsResponse, ProviderError (+5 more)

### Community 11 - "Gateway Package & Drizzle Config"
Cohesion: 0.11
Nodes (17): isPostgres, js-tiktoken, simple-statistics, typescript, name, private, type, version (+9 more)

### Community 12 - "Token Compression Engine"
Cohesion: 0.23
Nodes (17): calcLength(), codeDedup(), CompressionStageMetrics, compressMessages(), CompressOpts, CompressResult, compressWithMetrics(), historySummarize() (+9 more)

### Community 13 - "Freellms Sync Script"
Cohesion: 0.12
Nodes (15): collections, glob, json, os, pathlib, re, extract_ld_json(), fetch() (+7 more)

### Community 14 - "Prometheus Metrics Layer"
Cohesion: 0.16
Nodes (17): counterCache, CounterCfg, gaugeCache, getOrCreateCounter(), getOrCreateGauge(), getOrCreateHistogram(), histogramCache, HistogramCfg (+9 more)

### Community 15 - "Token Estimator"
Cohesion: 0.17
Nodes (9): enc, estimateChatTokens(), estimateMessagesTokens(), estimateTokens(), estimateTokensWithModel(), TokenCountMessage, UpstreamAnthropicMessage, anthropicRoute (+1 more)

### Community 16 - "Embeddings & Images Routes"
Cohesion: 0.16
Nodes (11): UpstreamEmbeddings, UpstreamImages, providers, compareRoute, compareSchema, embeddingsRoute, embeddingsSchema, imagesRoute (+3 more)

### Community 17 - "Web TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 18 - "Deployment & Docs Core"
Cohesion: 0.12
Nodes (18): Docker Compose Stack, Architecture Doc, Deployment Guide, Freellms Free Tier Ranking, Getting Started Guide, Production Operations Guide, Chat Dashboard Screenshot, Providers Dashboard Screenshot (+10 more)

### Community 19 - "Root TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 20 - "Web Package Config"
Cohesion: 0.13
Nodes (15): js-tiktoken, simple-statistics, typescript, name, private, type, version, motion (+7 more)

### Community 21 - "Favorites & Chat Hooks"
Cohesion: 0.23
Nodes (14): useFavoriteModels(), ALLOWED_CHAT_MODELS, errMsg(), FAVORITES_EVENT, FAVORITES_KEY, getFavoriteIds(), getFavoriteSet(), isFavorite() (+6 more)

### Community 22 - "Gateway Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, cockatiel, dotenv, drizzle-orm, hono, @hono/node-server, @hono/zod-validator, ioredis (+8 more)

### Community 23 - "Format Translator & Gemini Stream"
Cohesion: 0.21
Nodes (7): createOpenAIChunk(), GeminiPart, OpenAIToolDef, translateGeminiToOpenAI(), translateOpenAIToGemini(), geminiToOpenAIStream(), KNOWN_GEMINI_PATTERNS

### Community 24 - "Web Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, highlight.js, js-tiktoken, lucide-react, motion, react, react-dom, react-markdown (+7 more)

### Community 25 - "Gateway Build Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:generate, db:migrate, dev, lint, start, sync:freellms (+6 more)

### Community 26 - "Provider Adapters & Sanitize"
Cohesion: 0.19
Nodes (5): sanitizeFreellmsName(), AudioSpeechRequest, AudioTranscriptionRequest, createOpenAICompatibleProvider(), loadFreellmsModels()

### Community 27 - "Gateway TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, module, moduleResolution, outDir, resolveJsonModule, rootDir, strict (+5 more)

### Community 28 - "Web Base URLs & Key URLs"
Cohesion: 0.23
Nodes (11): ApiHealth, baseUrls, getBaseUrl(), getKeyUrl(), getKeyUrls, getProviderInfoUrl(), providerInfoUrls, HealthPayload (+3 more)

### Community 29 - "Web Node TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+5 more)

### Community 30 - "Anthropic Provider & Base Types"
Cohesion: 0.22
Nodes (9): anthropicProvider, CLAUDE_MODELS, AnthropicRequest, ChatMessage, ChatRequest, EmbeddingsRequest, ImagesRequest, ModelInfo (+1 more)

### Community 31 - "Settings Page"
Cohesion: 0.22
Nodes (11): COMPRESSION_SAMPLE, copyWithFallback(), DEFAULT_TIER_JSON, DEFAULTS, loadStored(), normalizeTiersString(), PRESETS, PUBLIC_PROVIDERS_UI (+3 more)

### Community 32 - "Provider Registry & Sync Jobs"
Cohesion: 0.27
Nodes (6): HealthResponse, ReadyResponse, modelAliases, PROVIDER_ALIASES, providerIds, healthRoute

### Community 34 - "Audio Routes & Scope Checks"
Cohesion: 0.26
Nodes (9): getRequestVk(), hasScope(), audioRoute, filenameOf(), handleAudioForm(), PRIORITY, providerOrderFor(), speechSchema (+1 more)

### Community 35 - "API Routes & Tests"
Cohesion: 0.17
Nodes (11): apiRoute, ApiAnalyticsResponse, ApiCacheStatsResponse, ApiCompressionPreviewResponse, ApiConfigResponse, ApiKeysResponse, ApiLogsResponse, ApiPersistedHealthResponse (+3 more)

### Community 36 - "Context Panel & Token Estimation"
Cohesion: 0.29
Nodes (9): ContextPanel, Props, CHAT_CONSTANTS, estimateMessageTokens(), estimateTokens(), estimateTokensAccurate(), estimateTotalPromptTokens(), getTiktoken() (+1 more)

### Community 37 - "DB Migration & Postgres"
Cohesion: 0.22
Nodes (7): isPostgres, main(), migratePostgres(), migrateSqlite(), better-sqlite3, drizzle-orm, pg

### Community 38 - "Error Boundary & Message List"
Cohesion: 0.20
Nodes (6): ErrorBoundary, Props, State, MessageList, Props, lucide-react

### Community 39 - "Compare Page"
Cohesion: 0.25
Nodes (10): Agg, aggregate(), Benchmark(), csvEscape(), estimateCost(), FREE_PROVIDERS, getMasterKey(), PRESETS (+2 more)

### Community 40 - "Gateway App & Middleware"
Cohesion: 0.27
Nodes (5): createApp(), setRequestVk(), requestLogger(), app, authHeaders

### Community 41 - "Responses API Translator"
Cohesion: 0.38
Nodes (8): ChatLikeResponse, createResponsesStreamChunk(), InputItem, textOfPart(), toText(), translateChatToResponses(), translateResponsesToChat(), handleResponses()

### Community 42 - "Responses & Conversations Routes"
Cohesion: 0.22
Nodes (6): UpstreamChatCompletion, conversationsRoute, loadVerifiedMap(), ResponsesHandlerContext, responsesRoute, responsesSchema

### Community 43 - "Usage Page & Provider Types"
Cohesion: 0.29
Nodes (9): ApiProvider, ProvidersPayload, isPublicProvider(), mk(), ProvidersPayload, ProviderTopology(), PUBLIC_PROVIDERS, Usage() (+1 more)

### Community 44 - "Providers Docs & Grok Catalog"
Cohesion: 0.20
Nodes (10): Contributing Guide, Provider Catalog Doc, Provider Evidence URLs, PROVIDERS (Vietnamese), Grok xAI model catalog (2 models), Grok xAI provider, Ollama Cloud model catalog (3 models), Ollama Cloud provider (+2 more)

### Community 45 - "Gateway Config Module"
Cohesion: 0.33
Nodes (5): DEFAULT_FALLBACK_TIER, ensureKeysAutoGenerated(), isPlaceholderEncryption(), isPlaceholderMaster(), tryLoadPersistedFallback()

### Community 46 - "Anthropic Messages Translator"
Cohesion: 0.31
Nodes (7): AnthropicContentBlock, AnthropicResponse, anthropicStreamToOpenAIChunk(), ContentPart, OpenAITool, translateAnthropicToOpenAI(), translateOpenAIToAnthropic()

### Community 47 - "Gateway Dev Dependencies"
Cohesion: 0.25
Nodes (8): devDependencies, better-sqlite3, drizzle-kit, tsx, @types/lru-cache, @types/node, typescript, vitest

### Community 48 - "Markdown Rendering Components"
Cohesion: 0.29
Nodes (6): MarkdownContent, Props, highlight.js, react-markdown, rehype-highlight, remark-gfm

### Community 49 - "Drizzle DB Schema"
Cohesion: 0.33
Nodes (5): providerKeys, requests, users, usersPg, virtualKeys

### Community 50 - "Web Dev Dependencies"
Cohesion: 0.33
Nodes (6): devDependencies, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react

### Community 51 - "Web Build Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, typecheck

### Community 52 - "Changelog & Roadmap Docs"
Cohesion: 0.67
Nodes (3): Changelog, Roadmap (P1-P7), ROADMAP (Vietnamese)

### Community 53 - "Operations Docs & Sync Workflow"
Cohesion: 0.67
Nodes (3): Operations & 24h Sync Guide, OPERATIONS (Vietnamese), Freellms Sync Workflow (disabled)

## Knowledge Gaps
- **380 isolated node(s):** `isPostgres`, `name`, `private`, `type`, `version` (+375 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 481 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Gateway Chat Tests` to `BYOK & Adaptive Router State`, `Gateway Core & Boot Sync`, `Adaptive EWMA Router`, `Quota Tracker`, `Auth & Virtual Keys`, `Gateway Type Definitions`, `Gateway Package & Drizzle Config`, `Token Compression Engine`, `Token Estimator`, `Embeddings & Images Routes`, `Format Translator & Gemini Stream`, `Provider Adapters & Sanitize`, `Provider Registry & Sync Jobs`, `Audio Routes & Scope Checks`, `API Routes & Tests`, `Gateway App & Middleware`, `Responses API Translator`, `Responses & Conversations Routes`, `Anthropic Messages Translator`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `react` connect `Chat Component & API Types` to `Context Panel & Token Estimation`, `Error Boundary & Message List`, `Chat Header & Composer UI`, `Compare Page`, `Usage Page & Provider Types`, `Markdown Rendering Components`, `Web Package Config`, `Favorites & Chat Hooks`, `Web Base URLs & Key URLs`, `Settings Page`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `semanticCache` connect `Quota Tracker` to `Gateway Core & Boot Sync`, `Adaptive EWMA Router`, `OTel & SSRF Guard`, `Token Estimator`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `Provider Catalog Doc` (e.g. with `Agnes AI provider` and `Aion Labs provider`) actually correct?**
  _`Provider Catalog Doc` has 30 INFERRED edges - model-reasoned connections that need verification._
- **What connects `isPostgres`, `name`, `private` to the rest of the system?**
  _380 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `BYOK & Adaptive Router State` be split into smaller, more focused modules?**
  _Cohesion score 0.0584385226741468 - nodes in this community are weakly interconnected._
- **Should `Gateway Core & Boot Sync` be split into smaller, more focused modules?**
  _Cohesion score 0.06660006660006661 - nodes in this community are weakly interconnected._