import type { Provider, ChatRequest, ModelInfo } from "./base.js";

// Pollinations is OpenAI-compatible at https://text.pollinations.ai/openai
export const pollinationsProvider: Provider = {
  id: "pollinations",
  type: "scraped",
  async chat(req: ChatRequest, apiKey: string): Promise<Response> {
    const url = "https://text.pollinations.ai/openai";
    // Map generic aliases to pollinations openai model
    const aliasMap: Record<string, string> = { auto: "openai", "gpt-4": "openai", "gpt-3.5": "openai", llama: "openai" };
    const raw = req.model.includes("/") ? req.model.split("/").pop()! : req.model || "openai";
    const model = aliasMap[raw.toLowerCase()] || raw;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // If POLLINATIONS_API_KEY is configured (enter.pollinations.ai), send it so per-key budget is tracked correctly
    // Pollinations accepts Authorization: Bearer <key> for authenticated budget; anonymous still works without it
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream: req.stream ?? false,
      }),
    });
  },
  async models(): Promise<ModelInfo[]> {
    return [
      { id: "pollinations/openai", provider: "pollinations", displayName: "Pollinations OpenAI", contextLength: 8192 },
      { id: "pollinations/mistral", provider: "pollinations", displayName: "Pollinations Mistral" },
    ];
  },
  async health(): Promise<boolean> {
    try {
      const res = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
