import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import { geminiProvider } from "./gemini.js";
import { pollinationsProvider } from "./pollinations.js";
import { anthropicProvider } from "./anthropic.js";
import type { Provider } from "./base.js";

// === Base URLs from freellms.org (2026-09-06 scan) ===
// See data/freellms-providers.json + docs/FREELLMS_FREE_TIER.md
const OPENAI = createOpenAICompatibleProvider;

export const providers: Record<string, Provider> = {
  // P0 — Permanent Free, high free model count, OpenAI compatible
  "nvidia-nim": OPENAI({ id: "nvidia-nim", baseUrl: "https://integrate.api.nvidia.com/v1" }), // 97 free, 40 RPM
  groq: OPENAI({ id: "groq", baseUrl: "https://api.groq.com/openai/v1" }), // 7 free
  cerebras: OPENAI({ id: "cerebras", baseUrl: "https://api.cerebras.ai/v1" }), // 5
  "github-models": OPENAI({ id: "github-models", baseUrl: "https://models.github.ai/inference" }), // 13, quota
  "ovhcloud-ai-endpoints": OPENAI({ id: "ovhcloud-ai-endpoints", baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" }), // 10
  cohere: OPENAI({ id: "cohere", baseUrl: "https://api.cohere.ai/compatibility/v1" }), // 10, rerank/embedding (OpenAI compat)
  "mistral-ai": OPENAI({ id: "mistral-ai", baseUrl: "https://api.mistral.ai/v1" }), // 9, quota

  // Cloudflare Workers AI — special path with {account_id}, uses Bearer token
  "cloudflare-workers-ai": OPENAI({ id: "cloudflare-workers-ai", baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1" }),

  // ModelScope, Chutes, SambaNova, SiliconFlow — OpenAI compat
  modelscope: OPENAI({ id: "modelscope", baseUrl: "https://api-inference.modelscope.cn/v1" }), // 43
  "chutes-ai": OPENAI({ id: "chutes-ai", baseUrl: "https://llm.chutes.ai/v1" }), // 2 (was api.chutes.ai 404)
  sambanova: OPENAI({ id: "sambanova", baseUrl: "https://api.sambanova.ai/v1" }), // 4
  siliconflow: OPENAI({ id: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1" }), // 2
  "kilo-code": OPENAI({ id: "kilo-code", baseUrl: "https://api.kilo.ai/api/gateway" }), // 6 free 2026-08
  opencode: OPENAI({ id: "opencode", baseUrl: "https://opencode.ai/zen/v1" }), // 8
  "llm7-io": OPENAI({ id: "llm7-io", baseUrl: "https://api.llm7.io/v1" }), // 6
  "agnes-ai": OPENAI({ id: "agnes-ai", baseUrl: "https://apihub.agnes-ai.com/v1" }), // 5, 30 RPM
  "aion-labs": OPENAI({ id: "aion-labs", baseUrl: "https://api.aionlabs.ai/v1" }), // 5
  "b-ai": OPENAI({ id: "b-ai", baseUrl: "https://api.b.ai/v1" }), // 4 free: qwen3.8-flash, hy3, mimo-v2.5, glm-5.3-flash (https://chat.b.ai/key, https://docs.b.ai/llmservice/promotions-and-pricing-notices 2026-09)
  tokenharbor: OPENAI({ id: "tokenharbor", baseUrl: "https://tokenharbor.ai/v1" }), // 3 free :free tier — deepseek-v4.1-flash:free, deepseek-v4-flash:free, mimo-v2.5:free (https://tokenharbor.ai/models?category=free 2026-09, 4th slot reserved for future free)
  "z-ai-zhipu-ai": OPENAI({ id: "z-ai-zhipu-ai", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }), // 4 GLM
  "experientiallabs": OPENAI({ id: "experientiallabs", baseUrl: "https://api.experientiallabs.ai/v1" }), // 3 free promotional (qwen3.8-27b, deepseek-v4-flash, gpt-5.6-luna) — OpenAI compatible
  kiraai: OPENAI({ id: "kiraai", baseUrl: "https://kiraai.vn/api/v1" }), // KiraAI Vietnam — OpenAI compatible, 150M free tokens/day (kira-mini-1.0 + Kira family)
  "grok-xai": OPENAI({ id: "grok-xai", baseUrl: "https://api.x.ai/v1" }), // 2, needs card (no free)
  deepseek: OPENAI({ id: "deepseek", baseUrl: "https://api.deepseek.com/v1" }),
  openrouter: OPENAI({ id: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }), // 17 free
  unorouter: OPENAI({ id: "unorouter", baseUrl: "https://api.unorouter.com/v1" }), // 219 free :free suffix, 1 req/min per model, OpenAI compatible (https://unorouter.com/en/models, key: https://unorouter.com/en/token)
  "ollama-cloud": OPENAI({ id: "ollama-cloud", baseUrl: "https://ollama.com/v1" }), // 6 free: gemma4:31b, gpt-oss:120b/20b, nemotron-3-super, etc. (was api.ollama.com 301)
  "alibaba-cloud-model-studio": OPENAI({ id: "alibaba-cloud-model-studio", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }),
  nscale: OPENAI({ id: "nscale", baseUrl: "https://api.nscale.com/v1" }),
  nebius: OPENAI({ id: "nebius", baseUrl: "https://api.studio.nebius.com/v1" }),
  "ai21-labs": OPENAI({ id: "ai21-labs", baseUrl: "https://api.ai21.com/studio/v1" }),

  // Custom from opencode.json (ORCAROUTER/FREEAI/CLINE)
  orcarouter: OPENAI({ id: "orcarouter", baseUrl: "https://api.orcarouter.ai/v1" }),
  freeai: OPENAI({ id: "freeai", baseUrl: "https://api.free.ai/v1" }),
  cline: OPENAI({ id: "cline", baseUrl: "https://api.cline.bot/api/v1" }),

  // Legacy / extra
  together: OPENAI({ id: "together", baseUrl: "https://api.together.xyz/v1" }),
  fireworks: OPENAI({ id: "fireworks", baseUrl: "https://api.fireworks.ai/inference/v1" }),
  novita: OPENAI({ id: "novita", baseUrl: "https://api.novita.ai/v3/openai" }),

  // Special
  "google-gemini": geminiProvider,
  pollinations: pollinationsProvider,
  anthropic: anthropicProvider,
  "claude-code": { ...anthropicProvider, id: "claude-code" } as Provider,
  codex: OPENAI({ id: "codex", baseUrl: "https://api.openai.com/v1" }),
};

// Alias -> canonical (dedup: no duplicate Provider objects, single backend per id)
export const PROVIDER_ALIASES: Record<string, string> = {
  nvidia: "nvidia-nim",
  bai: "b-ai",
  "chat-b-ai": "b-ai",
  mistral: "mistral-ai",
  chutes: "chutes-ai",
  gemini: "google-gemini",
  kira: "kiraai",
  experiential: "experientiallabs",
  "experiential-cloud": "experientiallabs",
  experiential_cloud: "experientiallabs",
};

export function resolveProviderId(id: string): string {
  return PROVIDER_ALIASES[id] ?? id;
}

export function getProvider(id: string): Provider | undefined {
  return providers[resolveProviderId(id)];
}

export const providerIds = Object.keys(providers);

// Metadata for docs / dashboard (caps, tier)
export const providerMeta: Record<string, { name: string; tier: string; tier_type: string; caps: string[]; noCard: boolean }> = {
  "nvidia-nim": { name: "NVIDIA NIM", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","image","video","embedding"], noCard: true },
  modelscope: { name: "ModelScope", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","video"], noCard: true },
  "cloudflare-workers-ai": { name: "Cloudflare Workers AI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","reasoning","code"], noCard: true },
  openrouter: { name: "OpenRouter", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","code"], noCard: true },
  "google-gemini": { name: "Google Gemini", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image","video","audio","live","transcription","translation"], noCard: true },
  "github-models": { name: "GitHub Models", tier: "Quota", tier_type: "quota", caps: ["text","reasoning"], noCard: true },
  "ovhcloud-ai-endpoints": { name: "OVHcloud AI Endpoints", tier: "Permanent Free", tier_type: "permanent", caps: ["text","image"], noCard: true },
  cohere: { name: "Cohere", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","embedding","rerank"], noCard: true },
  "mistral-ai": { name: "Mistral AI", tier: "Quota", tier_type: "quota", caps: ["text","code"], noCard: true },
  "kilo-code": { name: "Kilo Code", tier: "Quota", tier_type: "quota", caps: ["text","reasoning"], noCard: true },
  opencode: { name: "OpenCode Zen", tier: "Permanent Free", tier_type: "permanent", caps: ["reasoning","vision"], noCard: true },
  groq: { name: "Groq", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "llm7-io": { name: "LLM7.io", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  cerebras: { name: "Cerebras", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "agnes-ai": { name: "Agnes AI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","vision"], noCard: true },
  "aion-labs": { name: "Aion Labs", tier: "Permanent Free", tier_type: "permanent", caps: ["text"], noCard: true },
  "z-ai-zhipu-ai": { name: "Z AI (Zhipu AI)", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "b-ai": { name: "B.AI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","image","video"], noCard: true },
  tokenharbor: { name: "TokenHarbor", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","image","video"], noCard: true },
  experientiallabs: { name: "Experiential Labs", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","image","video"], noCard: true },
  kiraai: { name: "KiraAI", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","vision","image","audio"], noCard: true },
  sambanova: { name: "SambaNova", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "ollama-cloud": { name: "Ollama Cloud", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "chutes-ai": { name: "Chutes.ai", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  "grok-xai": { name: "Grok (xAI)", tier: "Permanent Free", tier_type: "permanent", caps: ["text"], noCard: false },
  siliconflow: { name: "SiliconFlow", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  deepseek: { name: "DeepSeek", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning"], noCard: true },
  unorouter: { name: "UnoRouter", tier: "Permanent Free", tier_type: "permanent", caps: ["text","reasoning","vision","code"], noCard: true },
  orcarouter: { name: "OrcaRouter", tier: "Custom", tier_type: "custom", caps: ["text","reasoning"], noCard: true },
  freeai: { name: "FreeAI", tier: "Custom", tier_type: "custom", caps: ["text"], noCard: true },
  cline: { name: "Cline", tier: "Custom", tier_type: "custom", caps: ["text"], noCard: true },
  anthropic: { name: "Anthropic", tier: "Custom", tier_type: "custom", caps: ["text","reasoning","vision"], noCard: false },
  "claude-code": { name: "Claude Code", tier: "Custom", tier_type: "custom", caps: ["text","reasoning","code","vision"], noCard: false },
  codex: { name: "Codex (OpenAI)", tier: "Custom", tier_type: "custom", caps: ["text","code","reasoning"], noCard: false },
};

// Alias map for smart routing (freellms-aware + custom opencode) — auto includes full 4-tier + public fallback
// Opencode custom models from user's opencode.json (2026-09-06) — many are :free variants not in freellms
export const modelAliases: Record<string, string[]> = {
  "free-llm-gateway/auto": [
    "kiraai",
    "pollinations",
    "llm7-io",
    "kilo-code",
    "nvidia-nim",
    "agnes-ai",
    "ollama-cloud",
    "orcarouter",
    "openrouter",
    "unorouter",
    "groq",
    "cerebras",
    "google-gemini",
    "cloudflare-workers-ai",
    "cohere",
    "sambanova",
    "siliconflow",
    "ovhcloud-ai-endpoints",
    "modelscope",
    "freeai",
    "cline",
    "b-ai",
    "tokenharbor",
  ],
  // Experiential Labs — promotional free (https://platform.experientiallabs.ai/models)
  "qwen3.8-27b": ["experientiallabs", "orcarouter", "modelscope"],
  "deepseek-v4-flash": ["experientiallabs", "kiraai", "cline", "deepseek", "nvidia-nim"],
  "gpt-5.6-luna": ["experientiallabs", "kiraai", "openrouter"],
  "experientiallabs/qwen3.8-27b": ["experientiallabs"],
  "experientiallabs/deepseek-v4-flash": ["experientiallabs"],
  "experientiallabs/gpt-5.6-luna": ["experientiallabs"],
  // KiraAI Vietnam (https://kiraai.vn/api/v1) — OpenAI compatible, 150M free tokens/day
  "kira-mini-1.0": ["kiraai"],
  "kira-auto": ["kiraai"],
  "kira-3.5-pro": ["kiraai"],
  "kira-3.5-flash": ["kiraai"],
  "kira-2.5-pro": ["kiraai"],
  "kira-2.5-flash": ["kiraai"],
  "kira-3.0-image": ["kiraai"],
  "kira-2.0-image": ["kiraai"],
  "kira-3.0-video": ["kiraai"],
  "kira-3.0-video-flash": ["kiraai"],
  "kira-3.0-flash-tts": ["kiraai"],
  "kira-2.0-flash-tts": ["kiraai"],
  "gpt-5.6-sol": ["kiraai"],
  "gpt-oss-120b": ["kiraai", "ollama-cloud", "openrouter"],
  // KiraAI free tier (150M tokens/day) — community free models
  "hy3-free": ["kiraai"],
  "glm-5.3-flash-free": ["kiraai", "cline", "z-ai-zhipu-ai"],
  "glm-5.3-free": ["kiraai", "z-ai-zhipu-ai"],
  "qwen3.8-flash-free": ["kiraai"],
  "qwen3.8-27b-free": ["kiraai", "orcarouter", "modelscope"],
  "ling-3.0-flash-sante-free": ["kiraai", "opencode", "kilo-code"],
  "deepseek-v4-flash-0731": ["nvidia-nim", "kiraai", "modelscope", "chutes-ai"],
  "deepseek-v4-pro": ["kiraai", "nvidia-nim", "modelscope"],
  "kiraai/mimo-v2.5-free": ["kiraai"],
  "kiraai/hy3-free": ["kiraai"],
  "kiraai/glm-5.3-flash-free": ["kiraai"],
  "kiraai/glm-5.3-free": ["kiraai"],
  "kiraai/qwen3.8-flash-free": ["kiraai"],
  "kiraai/qwen3.8-27b-free": ["kiraai"],
  "kiraai/ling-3.0-flash-sante-free": ["kiraai"],
  "kiraai/deepseek-v4-flash-0731": ["kiraai"],
  "kiraai/deepseek-v4-flash": ["kiraai"],
  "kiraai/deepseek-v4-pro": ["kiraai"],
  "kiraai/kira-mini-1.0": ["kiraai"],
  "kiraai/kira-auto": ["kiraai"],
  "kiraai/kira-3.5-pro": ["kiraai"],
  "kiraai/kira-3.5-flash": ["kiraai"],
  "kiraai/kira-2.5-pro": ["kiraai"],
  "kiraai/kira-2.5-flash": ["kiraai"],
  kira: ["kiraai"],
  kiraai: ["kiraai"],
  // B.AI — 4 free (https://chat.b.ai/key, https://docs.b.ai/llmservice/promotions-and-pricing-notices)
  "qwen3.8-flash": ["b-ai"],
  "qwen3-8-flash": ["b-ai"],
  "hy3": ["b-ai"],
  "mimo-v2.5": ["b-ai", "tokenharbor"],
  "b-ai/qwen3.8-flash": ["b-ai"],
  "b-ai/qwen3-8-flash": ["b-ai"],
  "b-ai/hy3": ["b-ai"],
  "b-ai/mimo-v2.5": ["b-ai"],
  "b-ai/glm-5.3-flash": ["b-ai"],
  // TokenHarbor — 3 :free tier (https://tokenharbor.ai/models?category=free)
  "deepseek-v4.1-flash:free": ["tokenharbor", "unorouter"],
  "deepseek-v4-flash:free": ["tokenharbor", "unorouter"],
  "mimo-v2.5:free": ["tokenharbor", "b-ai", "unorouter"],
  "tokenharbor/deepseek-v4.1-flash:free": ["tokenharbor"],
  "tokenharbor/deepseek-v4-flash:free": ["tokenharbor"],
  "tokenharbor/mimo-v2.5:free": ["tokenharbor"],
  // UnoRouter — 219 :free suffix, OpenAI compatible (https://api.unorouter.com/v1, key: https://unorouter.com/en/token, models: https://unorouter.com/en/models, docs: https://unorouter.com/en/docs/platform/quickstart, 1 req/min per :free model)
  "gpt-oss-120b:free": ["unorouter", "openrouter", "ollama-cloud"],
  "gpt-oss-20b:free": ["unorouter", "openrouter"],
  "deepseek-reasoner:free": ["unorouter", "nvidia-nim"],
  "deepseek-v4-pro:free": ["unorouter", "kiraai", "nvidia-nim"],
  "deepseek-v4-flash-0731:free": ["unorouter", "nvidia-nim", "kiraai", "modelscope"],
  "qwen3.8-27b:free": ["unorouter", "modelscope", "orcarouter"],
  "glm-5.3:free": ["unorouter", "z-ai-zhipu-ai", "kiraai"],
  "glm-5.3-flash:free": ["unorouter", "z-ai-zhipu-ai", "kiraai"],
  "glm-5.3-flash-search:free": ["unorouter"],
  "glm-5.3-flash-think-search:free": ["unorouter"],
  "glm-5.3-flash-thinking:free": ["unorouter"],
  "glm-5.3-search:free": ["unorouter"],
  "glm-5.3-think-search:free": ["unorouter"],
  "glm-5.3-thinking:free": ["unorouter"],
  "hy3:free": ["unorouter", "b-ai", "kiraai"],
  "hy4-preview": ["unorouter"],
  "ling-3.0-flash-fin:free": ["unorouter", "opencode", "kilo-code"],
  "nemotron-3.5-lightning:free": ["unorouter", "opencode", "nvidia-nim"],
  "laguna-xs-2.1:free": ["unorouter", "kilo-code"],
  "dots-3-note-preview:free": ["unorouter"],
  "lfm-2.5-2.6b:free": ["unorouter"],
  "sensenova-6.8-flash-lite:free": ["unorouter"],
  "muse-glimmer-30b:free": ["unorouter"],
  "unorouter/gpt-oss-120b:free": ["unorouter"],
  "unorouter/gpt-oss-20b:free": ["unorouter"],
  "unorouter/deepseek-v4-flash:free": ["unorouter"],
  "unorouter/deepseek-v4-pro:free": ["unorouter"],
  "unorouter/qwen3.8-27b:free": ["unorouter"],
  "unorouter/hy3:free": ["unorouter"],
  "unorouter/glm-5.3-flash:free": ["unorouter"],
  "unorouter/ling-3.0-flash-fin:free": ["unorouter"],
  unorouter: ["unorouter"],
  // Opencode custom — agnes
   "agnes-3.0-flash": ["agnes-ai"],
   "agnes-2.5-flash": ["agnes-ai"],
  // Opencode custom — openrouter free tier
  "openrouter/free": ["openrouter"],
  "z-ai/glm-5.2:free": ["openrouter", "z-ai-zhipu-ai", "nvidia-nim"],
  "nvidia/nemotron-3-ultra-550b-a55b:free": ["openrouter", "nvidia-nim", "kilo-code"],
  "minimax/minimax-m3:free": ["openrouter", "nvidia-nim"],
  "inclusionai/ling-3.0-flash-fin:free": ["openrouter", "kilo-code", "opencode"],
  "minimax/minimax-m2.7:free": ["openrouter", "sambanova"],
  "nvidia/nemotron-3.5-lightning:free": ["openrouter", "nvidia-nim"],
  "anthropic/claude-fable-5.1": ["openrouter", "cohere"],
  // Ollama cloud
  "gemma4:31b-cloud": ["ollama-cloud"],
  "gpt-oss:120b": ["ollama-cloud", "openrouter"],
  "nemotron-3-super:cloud": ["ollama-cloud", "nvidia-nim"],
  // Kilo auto
  "kilo-auto/free": ["kilo-code"],
  "stepfun/step-3.7-flash:free": ["kilo-code", "openrouter"],
  "poolside/laguna-s-2.1:free": ["kilo-code", "openrouter"],
  // Nvidia custom
  "nvidia/nemotron-3-ultra-550b-a55b": ["nvidia-nim", "kilo-code"],
  "deepseek-ai/deepseek-v4-flash-0731": ["nvidia-nim", "kiraai", "modelscope", "chutes-ai"],
  "deepseek-ai/deepseek-v4-pro-0813": ["nvidia-nim", "kiraai", "modelscope"],
  "moonshotai/kimi-k3": ["nvidia-nim", "ollama-cloud", "groq"],
  // OrcaRouter — 4 free (2026-05 catalog price=free): orcarouter/free (router) + 3× -free
  "orcarouter/free": ["orcarouter"],
  "deepseek/deepseek-v4-flash-free": ["orcarouter", "deepseek"],
  "tencent/hy3-free": ["orcarouter"],
  "z-ai/glm-5.3-flash-free": ["orcarouter", "z-ai-zhipu-ai"],
  "qwen/qwen3.8-27b-free": ["orcarouter", "modelscope", "siliconflow"], // legacy, no longer free (2026-05 priced), kept for compat
  // Cline / OpenCode Zen
  "nemotron-3.5-lightning-free": ["opencode", "nvidia-nim"],
  "nemotron-3-ultra-free": ["opencode", "nvidia-nim"],
  "mimo-v2.5-free": ["opencode", "kiraai"],
  "ling-3.0-flash-fin-free": ["opencode", "kilo-code"],
  "glm-5.3-flash": ["b-ai", "cline", "z-ai-zhipu-ai"],
  // Google custom gemini
  "gemini-3.5-flash-lite": ["google-gemini"],
  "gemini-3.1-flash-lite-preview": ["google-gemini", "llm7-io"],
  "gemini-3.7-flash": ["google-gemini"],
  "gemini-3.6-flash": ["google-gemini"],
  "gemini-3.1-flash-lite": ["google-gemini", "llm7-io"],
  "qwen3-8b": ["freeai", "modelscope"],
  "auto/coding": ["kilo-code", "opencode", "cohere"],
  "aion-labs/aion-3.0": ["aion-labs"],
  "minimax-m2.7": ["llm7-io", "sambanova"],
  "gpt-oss": ["llm7-io", "cerebras", "ollama-cloud"],
  "gpt-4": ["groq", "cerebras", "google-gemini", "openrouter", "nvidia-nim"],
  "gpt-3.5": ["groq", "pollinations", "ovhcloud-ai-endpoints", "modelscope"],
  "claude-3": ["cohere", "openrouter", "mistral-ai"],
  gemini: ["google-gemini"],
  "gemini-flash": ["google-gemini"],
  llama: ["groq", "cerebras", "nvidia-nim", "sambanova", "ovhcloud-ai-endpoints"],
  qwen: ["modelscope", "ovhcloud-ai-endpoints", "siliconflow", "alibaba-cloud-model-studio"],
  deepseek: ["deepseek", "siliconflow", "chutes-ai", "nvidia-nim"],
  mistral: ["mistral-ai", "groq", "nvidia-nim"],
  glm: ["z-ai-zhipu-ai", "nvidia-nim", "modelscope"],
  kimi: ["groq", "nvidia-nim", "modelscope"],
  code: ["kilo-code", "opencode", "cohere", "mistral-ai"],
  embedding: ["cohere", "nvidia-nim", "cloudflare-workers-ai"],
  rerank: ["cohere", "nvidia-nim"],
};

export function resolveProvidersForModel(model: string): string[] {
  if (model.includes("/")) {
    const prefix = model.split("/")[0];
    // First check if there's an alias for the model (with or without prefix)
    const withoutPrefix = model.startsWith(prefix + "/") ? model.slice(prefix.length + 1) : model;
    const alias = modelAliases[model.toLowerCase()] || modelAliases[withoutPrefix.toLowerCase()];
    if (alias) return alias;
    // Fall back to prefix-based routing (alias-aware)
    const canonicalPrefix = resolveProviderId(prefix);
    if (providers[canonicalPrefix]) return [canonicalPrefix];
    if (getProvider(prefix)) return [canonicalPrefix];
    // freellms slug with hyphen: nvidia-nim/z-ai/glm-5.2 -> try first part
    const slug = model.split("/")[0];
    const canonicalSlug = resolveProviderId(slug);
    if (providers[canonicalSlug]) return [canonicalSlug];
  }
  const alias = modelAliases[model.toLowerCase()];
  if (alias) return alias;
  return providerIds;
}
