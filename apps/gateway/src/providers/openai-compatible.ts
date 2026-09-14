import crypto from "node:crypto";
import type { Provider, ChatRequest, ModelInfo, AudioTranscriptionRequest, AudioSpeechRequest, ResponsesRequest } from "./base.js";
import { translateResponsesToChat } from "../lib/responses-translator.js";
import { sanitizeFreellmsName } from "../lib/sanitize.js";

function generateSessionId(): string {
  return `ses_${crypto.randomBytes(12).toString("hex")}`;
}
function isOpencodeFreeModel(_model: string): boolean {
  // opencode Zen: all 8 live models are free and session-gated; require X-Session-ID for every chat
  // previous regex missed deepseek/laguna/longcat/north and still returned 401
  return true;
}

export function createOpenAICompatibleProvider(opts: {
  id: string;
  baseUrl: string;
  modelsPath?: string;
}): Provider {
  const modelsPath = opts.modelsPath || "/models";
  // Resolve templated baseUrl like cloudflare {account_id}
  function resolveBase(): string {
    let base = opts.baseUrl.replace(/\/$/, "");
    if (base.includes("{account_id}")) {
      const acct = process.env.CLOUDFLARE_ACCOUNT_ID || "";
      base = base.replace("{account_id}", acct);
    }
    return base;
  }
  return {
    id: opts.id,
    type: "openai-compatible",
    async chat(req: ChatRequest, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/chat/completions`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0",
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      // Extract model after provider prefix (e.g. nvidia-nim/z-ai/glm-5.2 -> z-ai/glm-5.2)
      let rawModel = req.model.includes("/") ? req.model.split("/").slice(1).join("/") : req.model;
      rawModel = rawModel || req.model;
      // Sanitize freellms names with spaces/parens (shared helper)
      if (/[\s()]/.test(rawModel) && !rawModel.startsWith("@cf/")) {
        rawModel = sanitizeFreellmsName(rawModel);
      }
      // Map alias "auto" and generic aliases to provider's default free model (canonical ids only; aliases resolved via PROVIDER_ALIASES)
      const autoMap: Record<string, string> = {
        "nvidia-nim": "nvidia/nemotron-3-ultra-550b-a55b",
        groq: "llama-3.3-70b-versatile",
        cerebras: "llama3.1-70b",
        "google-gemini": "gemini-2.0-flash",
        "cloudflare-workers-ai": "@cf/meta/llama-3.1-8b-instruct",
        cohere: "command-r-plus",
        "mistral-ai": "ministral-8b-latest",
        modelscope: "Qwen/Qwen3-30b-A3B",
        "chutes-ai": "deepseek-ai/DeepSeek-V3",
        sambanova: "Meta-Llama-3.1-405B-Instruct",
        siliconflow: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
        "glhf-chat": "hf:meta-llama/Llama-3.1-70B",
        glhf: "hf:meta-llama/Llama-3.1-70B",
        "kilo-code": "stepfun/step-3.7-flash:free",
        opencode: "opencode/mimo-v2.5-free",
        "llm7-io": "minimax-m2.7",
        "agnes-ai": "agnes-2.5-flash",
        "aion-labs": "aion-labs/aion-3.0",
        "z-ai-zhipu-ai": "glm-4.7-flash",
        experientiallabs: "qwen3.8-27b",
        kiraai: "kira-mini-1.0",
        "grok-xai": "grok-2",
        xai: "grok-2",
        deepseek: "deepseek-chat",
        openrouter: "openrouter/auto",
        "ollama-cloud": "llama3.1:70b",
        "alibaba-cloud-model-studio": "qwen-plus",
        nscale: "meta-llama/Llama-3.1-70B",
        nebius: "meta-llama/Meta-Llama-3.1-70B-Instruct",
        "ai21-labs": "jamba-1.5-large",
        orcarouter: "orcarouter/free",
        unorouter: "gpt-oss-120b:free",
        freeai: "freeai/qwen3-8b",
        cline: "cline/deepseek-v4-flash",
        "b-ai": "qwen3.8-flash",
        tokenharbor: "deepseek-v4-flash:free",
        together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
        novita: "meta-llama/llama-3.1-70b-instruct",
        pollinations: "openai",
      };
      const lower = rawModel.toLowerCase();
      const aliasMap: Record<string, string> = { auto: autoMap[opts.id] || "openai", "gpt-4": autoMap[opts.id] || "openai", "gpt-3.5": autoMap[opts.id] || "openai", llama: autoMap[opts.id] || rawModel, "claude-3": "claude-3-haiku" };
      let model = aliasMap[lower] || rawModel;
      // cline short aliases: dashboard shows cline/glm-5.3-flash (raw glm-5.3-flash) but upstream expects z-ai/glm-5.3-flash
      if (opts.id === "cline") {
        const lm = model.toLowerCase();
        if (lm === "glm-5.3-flash") model = "z-ai/glm-5.3-flash";
        else if (lm === "glm-5.3") model = "z-ai/glm-5.3";
        else if (lm === "deepseek-v4-flash") model = "deepseek/deepseek-v4-flash";
      }
      // Auto session for opencode free tier (and similar session-gated providers)
      // Priority: req.sessionId > env > auto-generated for free models
      {
        const needsSession = opts.id === "opencode" && isOpencodeFreeModel(model);
        const incomingSid = req.sessionId;
        const incomingParentSid = req.parentSessionId;
        if (needsSession || incomingSid) {
          const sid = incomingSid || process.env.OPENCODE_SESSION_ID || generateSessionId();
          if (sid) {
            headers["X-Session-ID"] = sid;
            headers["x-session-id"] = sid;
          }
          const parentSid = incomingParentSid || process.env.OPENCODE_PARENT_SESSION_ID;
          if (parentSid) {
            headers["X-Parent-Session-ID"] = parentSid;
            headers["x-parent-session-id"] = parentSid;
          }
        }
      }
      // Build body filtering undefined/null to avoid provider strict validation (kilo 400, agnes 500)
      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
        stream: req.stream ?? false,
      };
      if (req.temperature !== undefined && req.temperature !== null) body.temperature = req.temperature;
      if (req.max_tokens !== undefined && req.max_tokens !== null) body.max_tokens = req.max_tokens;
      if (req.top_p !== undefined && req.top_p !== null) body.top_p = req.top_p;
      if (req.top_k !== undefined && req.top_k !== null) body.top_k = req.top_k;
      if (req.n !== undefined && req.n !== null) body.n = req.n;
      if (req.stop !== undefined && req.stop !== null) body.stop = req.stop;
      if (req.presence_penalty !== undefined && req.presence_penalty !== null) body.presence_penalty = req.presence_penalty;
      if (req.frequency_penalty !== undefined && req.frequency_penalty !== null) body.frequency_penalty = req.frequency_penalty;
      if (req.tools !== undefined && req.tools !== null) body.tools = req.tools;
      if (req.tool_choice !== undefined && req.tool_choice !== null) body.tool_choice = req.tool_choice;
      if (req.user !== undefined && req.user !== null) body.user = req.user;
      // Initial fetch with auto session header if needed
      let res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      // Generic auto-retry for session-gated providers (opencode free, etc.)
      // opencode now returns plain 401 Unauthorized without SessionID hint for models like deepseek/laguna/longcat
      if (!res.ok) {
        const cloneText = await res.clone().text().catch(() => "");
        const isOpencode401 = opts.id === "opencode" && res.status === 401;
        const needsRetry = isOpencode401 || cloneText.includes("MissingSessionID") || cloneText.includes("can only be used in OpenCode") || cloneText.includes("SessionID") || cloneText.includes("Unauthorized");
        if (needsRetry) {
          const retrySid = process.env.OPENCODE_SESSION_ID || generateSessionId();
          const retryHeaders: Record<string, string> = {
            ...headers,
            "X-Session-ID": retrySid,
            "x-session-id": retrySid,
          };
          const parentSid = process.env.OPENCODE_PARENT_SESSION_ID;
          if (parentSid) {
            retryHeaders["X-Parent-Session-ID"] = parentSid;
            retryHeaders["x-parent-session-id"] = parentSid;
          }
          res = await fetch(url, {
            method: "POST",
            headers: retryHeaders,
            body: JSON.stringify(body),
          });
        }
      }
      return res;
    },
    async embeddings(req, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/embeddings`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      let model = req.model;
      if (model.includes("/")) model = model.split("/").slice(1).join("/");
      const body: Record<string, unknown> = { model, input: req.input };
      if (req.encoding_format) body.encoding_format = req.encoding_format;
      if (req.dimensions) body.dimensions = req.dimensions;
      if (req.user) body.user = req.user;
      return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    },
    async images(req, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/images/generations`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const body: Record<string, unknown> = { prompt: req.prompt };
      if (req.model) {
        let m = req.model;
        if (m.includes("/")) m = m.split("/").slice(1).join("/");
        body.model = m;
      }
      if (req.n) body.n = req.n;
      if (req.size) body.size = req.size;
      if (req.response_format) body.response_format = req.response_format;
      if (req.user) body.user = req.user;
      return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    },
    async models(apiKey?: string): Promise<ModelInfo[]> {
      const base = resolveBase();
      const url = `${base}${modelsPath}`;
      const headers: Record<string, string> = { "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const data = (await res.json().catch(() => ({}))) as { data?: unknown };
      const rawList: unknown = Array.isArray(data.data) ? data.data : [];
      const list = (Array.isArray(rawList) ? rawList : []) as Array<{ id?: string; name?: string }>;
      return list.map((m) => ({
        id: `${opts.id}/${m.id || m.name}`,
        provider: opts.id,
        displayName: m.id || m.name,
        ownedBy: opts.id,
      }));
    },
    async transcriptions(req: AudioTranscriptionRequest, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/audio/transcriptions`;
      const headers: Record<string, string> = { "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const form = new FormData();
      const blob = req.file instanceof Blob ? req.file : new Blob([Uint8Array.from(req.file)]);
      form.append("file", blob, req.filename || "audio.wav");
      form.append("model", req.model);
      if (req.language) form.append("language", req.language);
      if (req.prompt) form.append("prompt", req.prompt);
      if (req.response_format) form.append("response_format", req.response_format);
      if (req.temperature !== undefined) form.append("temperature", String(req.temperature));
      return fetch(url, { method: "POST", headers, body: form });
    },
    async speech(req: AudioSpeechRequest, apiKey: string): Promise<Response> {
      const base = resolveBase();
      const url = `${base}/audio/speech`;
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      let model = req.model;
      if (model.includes("/")) model = model.split("/").slice(1).join("/");
      return fetch(url, { method: "POST", headers, body: JSON.stringify({ model, input: req.input, voice: req.voice, response_format: req.response_format, speed: req.speed }) });
    },
    async responses(req: ResponsesRequest, apiKey: string): Promise<Response> {
      // Prefer native /responses if provider supports, else fallback to /chat/completions via translation
      const base = resolveBase();
      const url = `${base}/responses`;
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const chat = translateResponsesToChat(req);
      // try native responses endpoint first
      try {
        const native = await fetch(url, { method: "POST", headers, body: JSON.stringify(req) });
        if (native.ok || native.status < 500) return native;
      } catch { /* ignore: native responses failed, fallback to chat */ }
      // fallback to chat completions
      const chatUrl = `${base}/chat/completions`;
      let model = chat.model;
      if (model.includes("/")) model = model.split("/").slice(1).join("/");
      return fetch(chatUrl, { method: "POST", headers, body: JSON.stringify({ model, messages: chat.messages, temperature: chat.temperature, max_tokens: chat.max_tokens, stream: chat.stream, tools: chat.tools }) });
    },
    async health(apiKey: string): Promise<boolean> {
      try {
        const base = resolveBase();
        const url = `${base}${modelsPath}`;
        const headers: Record<string, string> = { "User-Agent": opts.id === "cline" ? "Cline/3.24.1" : "opencode-gateway/1.0" };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(url, { headers });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
