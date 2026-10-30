export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_call_id?: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  top_p?: number;
  top_k?: number;
  n?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  sessionId?: string;
  parentSessionId?: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName?: string;
  contextLength?: number;
  ownedBy?: string;
}

export interface EmbeddingsRequest {
  model: string;
  input: string | string[];
  encoding_format?: string;
  dimensions?: number;
  user?: string;
}

export interface ImagesRequest {
  model?: string;
  prompt: string;
  n?: number;
  size?: string;
  response_format?: string;
  user?: string;
}

export interface AudioTranscriptionRequest {
  file: File | Buffer | Blob;
  filename?: string;
  model: string;
  language?: string;
  prompt?: string;
  response_format?: string;
  temperature?: number;
}

export interface AudioSpeechRequest {
  model: string;
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}

export interface ResponsesRequest {
  model: string;
  input: string | ChatMessage[] | Array<{ role: string; content: string }>;
  instructions?: string;
  previous_response_id?: string;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  user?: string;
}

export interface AnthropicRequest {
  model: string;
  messages: Array<{ role: "user" | "assistant"; content: string | Array<{ type: string; text?: string; source?: unknown; tool_use_id?: string; content?: string }> }>;
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  stop_sequences?: string[];
}

export interface Provider {
  id: string;
  type: "openai-compatible" | "gemini" | "anthropic" | "scraped";
  /** `signal` = executor abort (timeout / parallel-loser cleanup). Providers
   * combine it with their internal timeout via AbortSignal.any — aborting
   * cancels the in-flight fetch. */
  chat(req: ChatRequest, apiKey: string, signal?: AbortSignal): Promise<Response>;
  embeddings?(req: EmbeddingsRequest, apiKey: string): Promise<Response>;
  images?(req: ImagesRequest, apiKey: string): Promise<Response>;
  transcriptions?(req: AudioTranscriptionRequest, apiKey: string): Promise<Response>;
  translations?(req: AudioTranscriptionRequest, apiKey: string): Promise<Response>;
  speech?(req: AudioSpeechRequest, apiKey: string): Promise<Response>;
  responses?(req: ResponsesRequest, apiKey: string, signal?: AbortSignal): Promise<Response>;
  anthropic?(req: AnthropicRequest, apiKey: string, signal?: AbortSignal): Promise<Response>;
  models(apiKey?: string): Promise<ModelInfo[]>;
  health(apiKey: string): Promise<boolean>;
}

/**
 * Combine the executor's abort signal with a per-call timeout.
 * Returns undefined when AbortSignal.timeout is unavailable (old runtimes) —
 * callers already handle undefined signal.
 */
export function makeCallSignal(ms: number, external?: AbortSignal): AbortSignal | undefined {
  const abs = AbortSignal as unknown as {
    timeout?: (ms: number) => AbortSignal;
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  const t = abs.timeout ? abs.timeout(ms) : undefined;
  if (t && external && abs.any) {
    try { return abs.any([t, external]); } catch { return t; }
  }
  return t ?? external;
}
