import { config } from "../config.js";
import { resolveProvidersForModel, getProvider, resolveProviderId } from "../providers/registry.js";
import { isPublicProvider, hasRealKey, STRICT_SINGLE_TIER_MAX } from "./provider-keys.js";

export { isPublicProvider };

type Strategy = "round-robin" | "tiered";

// Separate rotation cursors: rrIndex for provider order, keyIndex for legacy
// getNextKey round-robin. Split to avoid cross-talk (previous shared counter
// advanced provider rotation when keys were fetched).
let rrIndex = 0;
let keyIndex = 0;

/** Final fallback provider — always tried last regardless of sort. */
const FINAL_FALLBACK = "agnes-ai";

function isUsableProvider(pid: string): boolean {
  return hasRealKey(pid) || isPublicProvider(pid);
}

export function getProvidersForRequest(model: string, strategy: Strategy = "tiered"): string[] {
  const explicitPrefix = model.includes("/") ? resolveProviderId(model.split("/")[0]) : null;
  const keepExplicit = (pid: string) => explicitPrefix === pid;

  if (strategy === "round-robin") {
    const ids = resolveProvidersForModel(model);
    // rotate
    const rotated = [...ids.slice(rrIndex % ids.length), ...ids.slice(0, rrIndex % ids.length)];
    rrIndex++;
    // Only return providers that are configured (hasRealKey) or public (pollinations etc.)
    // — keeps fallback cheap and avoids trying dummy providers with no key.
    // Explicitly requested prefix is kept even if not configured to surface proper "no key" error.
    return rotated.filter((id) => getProvider(id) && (isUsableProvider(id) || keepExplicit(id)));
  }

  // tiered: respect FALLBACK_TIERS strictly (user-defined single tier = only those 8, no append)
  const preferred = resolveProvidersForModel(model);
  // normalize tiers: alias -> canonical and dedupe
  const tiers = config.fallbackTiers.map((tier) => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const p of tier) { const c = resolveProviderId(p); if (!seen.has(c)) { seen.add(c); out.push(c); } }
    return out;
  });
  const ordered: string[] = [];
  for (const tier of tiers) {
    for (const p of tier) {
      if (preferred.includes(p) && getProvider(p) && !ordered.includes(p)) ordered.push(p);
    }
  }
  // Only append remaining preferred if FALLBACK_TIERS is multi-tier (default) - for single-tier strict mode, keep only tier providers
  const isSingleTierStrict = tiers.length === 1 && tiers[0].length <= STRICT_SINGLE_TIER_MAX;
  if (!isSingleTierStrict) {
    for (const p of preferred) {
      if (!ordered.includes(p) && getProvider(p)) ordered.push(p);
    }
  }
  // For strict single-tier (user-defined 8), keep exact tier order as specified, no re-sort
  // Still filter to only configured providers (+ public like pollinations) to avoid hardcode bloat.
  // Explicit prefix is kept to allow "groq/xxx" to surface "no key" rather than empty fallback.
  if (isSingleTierStrict) {
    return ordered.filter((p) => isUsableProvider(p) || keepExplicit(p));
  }
  // Filter to only configured providers (+ public like pollinations) — no hardcode dummy.
  const filtered = ordered.filter((p) => isUsableProvider(p) || keepExplicit(p));
  // Priority: real key -> public free (pollinations).
  // If no real keys are configured, public providers go first so `auto` hits
  // live free instead of failing fast.
  const hasRealKeyFor = (pid: string): boolean => {
    return hasRealKey(pid);
  };
  filtered.sort((a, b) => {
    // FINAL_FALLBACK always last — never pulled up by sort (if it passed isUsable).
    if (a === FINAL_FALLBACK && b !== FINAL_FALLBACK) return 1;
    if (b === FINAL_FALLBACK && a !== FINAL_FALLBACK) return -1;
    const aReal = hasRealKeyFor(a);
    const bReal = hasRealKeyFor(b);
    if (aReal !== bReal) return aReal ? -1 : 1;
    const aPublic = isPublicProvider(a);
    const bPublic = isPublicProvider(b);
    if (aPublic !== bPublic) return aPublic ? -1 : 1; // public before dummy (dummy already filtered)
    const aHas = hasRealKey(a);
    const bHas = hasRealKey(b);
    if (aHas !== bHas) return aHas ? -1 : 1;
    return 0;
  });
  // Keep FINAL_FALLBACK last even if sort stability changes
  if (filtered.includes(FINAL_FALLBACK)) {
    return [...filtered.filter((p) => p !== FINAL_FALLBACK), FINAL_FALLBACK];
  }
  return filtered;
}

export function getNextKey(providerId: string): string | null {
  const canonical = resolveProviderId(providerId);
  const keys = config.providerKeys[canonical] || config.providerKeys[providerId] || [];
  if (keys.length === 0) {
    if (isPublicProvider(providerId)) return "";
    return null;
  }
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

export function _resetRouterState(): void {
  rrIndex = 0;
  keyIndex = 0;
}
