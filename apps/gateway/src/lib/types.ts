import type { Context } from "hono";
import type { VirtualKey } from "./virtual-keys.js";

/**
 * Shared gateway types — single source to avoid `any` across routes/lib/providers.
 */

/** Error entry accumulated while trying providers in order. */
export interface ProviderError {
  provider: string;
  error?: string;
  status?: number;
  retryAfterMs?: number;
}

/** Loose JSON value for dynamic upstream payloads. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Message shape accepted by token-estimator / compression. */
export interface TokenCountMessage {
  role: string;
  content: unknown;
}

/** Compressible chat message (tools/history/code engines). */
export interface CompressibleMessage {
  role: string;
  content: unknown;
  tools?: Array<{
    function?: {
      name?: string;
      description?: string;
      parameters?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  tool_choice?: unknown;
  functions?: unknown;
  [key: string]: unknown;
}

/** Upstream chat completion (OpenAI shape, fields optional since providers vary). */
export interface UpstreamChatCompletion {
  id?: string;
  object?: string;
  model?: string;
  created?: number;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: unknown; tool_calls?: unknown };
    delta?: { content?: unknown };
    finish_reason?: string | null;
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    total_tokens_compat?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  output?: unknown;
  content?: unknown;
  text?: string;
  data?: unknown;
  error?: unknown;
}

/** Upstream Anthropic message (fields optional). */
export interface UpstreamAnthropicMessage {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Upstream embeddings response (OpenAI shape). */
export interface UpstreamEmbeddings {
  object?: string;
  data?: Array<{ object?: string; index?: number; embedding?: number[] }>;
  embedding?: number[];
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/** Upstream images response. */
export interface UpstreamImages {
  created?: number;
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  url?: string;
  b64_json?: string;
}

/** Freellms catalog entry (loose source JSON). */
export interface FreellmsModelEntry {
  slug?: string;
  name?: string;
  provider?: string;
  score?: string | number;
  context?: string | number;
  [key: string]: unknown;
}

/** Freellms provider entry (loose source JSON). */
export interface FreellmsProviderEntry {
  slug?: string;
  name?: string;
  tier?: string;
  tier_type?: string;
  caps?: string[];
  noCard?: boolean;
  baseUrl?: string;
  free_models?: number;
  total_models?: number;
  [key: string]: unknown;
}

/** Helper: parse a `Response` body as typed JSON (replaces `const data: any = await res.json()`). */
export async function resJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- Shared API response shapes (replaces `const data: any` in tests) ----

export interface OpenAIErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
    provider_errors?: Array<{ provider?: string; status?: number; error?: string }>;
  };
  message?: string;
  code?: string;
}

export interface OpenAIModelsResponse {
  object?: string;
  data?: Array<{
    id?: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
  total?: number;
}

export interface OpenAIChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: string | null; tool_calls?: unknown };
    finish_reason?: string | null;
    delta?: { role?: string; content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_computed?: number;
  };
  error?: OpenAIErrorBody["error"];
}

export interface ApiProvidersResponse {
  providers?: string[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    total_pages?: number;
  };
  detailed?: Array<{
    id?: string;
    name?: string;
    tier?: string;
    tier_type?: string;
    base_url?: string;
    hasKey?: boolean;
    no_card?: boolean;
    models?: number;
    free_models?: number;
    health?: string;
    addedAt?: string;
  }>;
}

export interface ApiModelsResponse {
  models?: string[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    total_pages?: number;
  };
  detailed?: Array<{
    id?: string;
    name?: string;
    provider?: string;
    tier?: string;
    tier_type?: string;
    context_length?: number;
    hasKey?: boolean;
    disabled?: boolean;
  }>;
}

export interface HealthResponse {
  status?: string;
  version?: string;
  uptime?: number;
  providers?: number;
  tiers?: number;
  timestamp?: string;
}

export interface ReadyResponse {
  ready?: boolean;
}

/** Extract message from unknown throwables (replaces `catch (e: any) => e.message`).
 * Includes `cause` chain (undici `fetch failed` hides ECONNRESET/ETIMEDOUT/DNS/TLS in cause). */
export function errMessage(e: unknown): string {
  if (e instanceof Error) {
    const parts: string[] = [e.message || String(e)];
    // Unwrap cause chain (max 3 levels to avoid bloat)
    let cause = (e as { cause?: unknown }).cause;
    for (let i = 0; i < 3 && cause; i++) {
      if (cause instanceof Error) {
        parts.push(`cause: ${cause.message}`);
        cause = (cause as { cause?: unknown }).cause;
      } else if (typeof cause === "string") {
        parts.push(`cause: ${cause}`);
        break;
      } else {
        try {
          parts.push(`cause: ${JSON.stringify(cause).slice(0, 200)}`);
        } catch {
          parts.push(`cause: ${String(cause).slice(0, 200)}`);
        }
        break;
      }
    }
    return parts.join(" | ");
  }
  return String(e);
}

/**
 * Typed accessor for the virtual key set by auth middleware.
 * Replaces `(c as any).get("vk")` — single sanctioned cast site.
 */
export function getRequestVk(c: unknown): VirtualKey | undefined {
  const getter = (c as { get: (key: string) => unknown }).get.bind(c);
  const vk = getter("vk") as VirtualKey | undefined;
  return vk && typeof vk === "object" && "id" in vk ? vk : undefined;
}

/** Typed setter for the virtual key (auth middleware). */
export function setRequestVk(c: Context, vk: VirtualKey): void {
  (c as unknown as { set: (key: string, value: unknown) => void }).set("vk", vk);
}
