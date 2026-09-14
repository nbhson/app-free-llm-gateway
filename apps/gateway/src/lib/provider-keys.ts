import { config } from "../config.js";
import { resolveProviderId } from "../providers/registry.js";

/** Providers that work without any API key (scraped / unlimited tier). Single source of truth. */
export const PUBLIC_PROVIDERS: ReadonlySet<string> = new Set([
  "pollinations",
  "llm7-io",
  "ollama-cloud",
  "glhf-chat",
  "glhf",
]);

export function isPublicProvider(providerId: string): boolean {
  return PUBLIC_PROVIDERS.has(providerId);
}

/**
 * A key is "real" when it is not empty and not a placeholder from .env.example.
 * Centralizes the `length > 20 && !xxx && !change-me` heuristic previously
 * duplicated in router.ts / api.ts / models.ts.
 */
export function isPlaceholderKey(key: string | undefined | null): boolean {
  if (!key) return true;
  const k = key.trim();
  if (k.length === 0) return true;
  if (k.length <= 20) return true;
  const low = k.toLowerCase();
  if (low.includes("xxx") || low.includes("change-me") || low.includes("please-generate")) return true;
  return false;
}

export function isRealKey(key: string | undefined | null): boolean {
  return !isPlaceholderKey(key);
}

export function hasRealKey(providerId: string): boolean {
  const canonical = resolveProviderId(providerId);
  const keys = config.providerKeys[canonical] || config.providerKeys[providerId] || [];
  return keys.some(isRealKey);
}

export function getProviderKeys(providerId: string): string[] {
  const canonical = resolveProviderId(providerId);
  return config.providerKeys[canonical] || config.providerKeys[providerId] || [];
}

/** Max number of providers allowed in strict single-tier mode (user-pinned fallback). */
export const STRICT_SINGLE_TIER_MAX = 8;
