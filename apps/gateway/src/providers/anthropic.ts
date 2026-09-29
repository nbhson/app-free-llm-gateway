import type { Provider, AnthropicRequest, ChatRequest, ModelInfo } from "./base.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";

const CLAUDE_MODELS: ModelInfo[] = [
  { id: "anthropic/claude-3-5-sonnet-20241022", provider: "anthropic", displayName: "Claude 3.5 Sonnet", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-5-haiku-20241022", provider: "anthropic", displayName: "Claude 3.5 Haiku", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-opus-20240229", provider: "anthropic", displayName: "Claude 3 Opus", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-sonnet-20240229", provider: "anthropic", displayName: "Claude 3 Sonnet", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-haiku-20240307", provider: "anthropic", displayName: "Claude 3 Haiku", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-5-sonnet-latest", provider: "anthropic", displayName: "Claude 3.5 Sonnet Latest", contextLength: 200000, ownedBy: "anthropic" },
  { id: "anthropic/claude-3-5-haiku-latest", provider: "anthropic", displayName: "Claude 3.5 Haiku Latest", contextLength: 200000, ownedBy: "anthropic" },
];

function stripPrefix(model: string): string {
  if (model.includes("/")) return model.split("/").slice(1).join("/");
  return model;
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  type: "anthropic",

  async chat(_req: ChatRequest, _apiKey: string): Promise<Response> {
    throw new Error("anthropic provider: use anthropic() method, not chat()");
  },

  async anthropic(req: AnthropicRequest, apiKey: string): Promise<Response> {
    const model = stripPrefix(req.model) || "claude-3-5-sonnet-20241022";

    const body: {
      model: string;
      max_tokens: number;
      messages: AnthropicRequest["messages"];
      system?: string;
      temperature?: number;
      top_p?: number;
      top_k?: number;
      stream?: boolean;
      tools?: unknown;
      tool_choice?: unknown;
      stop_sequences?: string[];
    } = {
      model,
      max_tokens: req.max_tokens || 4096,
      messages: req.messages,
    };
    if (req.system) body.system = req.system;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (req.top_k !== undefined) body.top_k = req.top_k;
    if (req.stream !== undefined) body.stream = req.stream;
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;
    if (req.stop_sequences) body.stop_sequences = req.stop_sequences;

    const headers: Record<string, string> = {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    };

    const url = ANTHROPIC_API_URL;
    const signal = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout
      ? (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(60000)
      : undefined;

    // Streaming: forward SSE directly
    if (req.stream) {
      body.stream = true;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      if (!res.ok) return res;
      // Pass through Anthropic SSE stream as-is (caller may convert)
      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    return res;
  },

  async models(apiKey?: string): Promise<ModelInfo[]> {
    if (!apiKey) return CLAUDE_MODELS;
    try {
      const res = await fetch(ANTHROPIC_MODELS_URL, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      });
      if (!res.ok) return CLAUDE_MODELS;
      const data = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; name?: string; displayName?: string; context_window?: number }>;
      };
      const list = Array.isArray(data.data) ? data.data : [];
      if (list.length === 0) return CLAUDE_MODELS;
      return list.map((m) => ({
        id: `anthropic/${m.id || m.name}`,
        provider: "anthropic",
        displayName: m.displayName || m.id,
        contextLength: m.context_window || 200000,
        ownedBy: "anthropic",
      }));
    } catch {
      return CLAUDE_MODELS;
    }
  },

  async health(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(ANTHROPIC_MODELS_URL, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
