import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../middleware/logger.js";
import { isPublicProvider } from "./provider-keys.js";
import { resolveProviderId } from "../providers/registry.js";

// AES-256-GCM encrypt/decrypt for at-rest storage (free-llm-gateway style)
const ALGO = "aes-256-gcm";
function getKey(): Buffer {
  const hex = config.encryptionKey.replace(/[^0-9a-f]/gi, "");
  if (config.nodeEnv === "production" && hex.length < 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes) in production");
  }
  // pad or slice to 32 bytes (64 hex)
  const padded = (hex + "0".repeat(64)).slice(0, 64);
  return Buffer.from(padded, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext all base64
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, encB64] = ciphertext.split(":");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("invalid ciphertext");
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

// In-memory round-robin + rate-limit skip + per-key cooldown
type KeyState = { key: string; failCount: number; cooldownUntil: number; lastUsed: number };
const keyStates = new Map<string, KeyState[]>(); // provider -> states

function ensure(providerId: string) {
  const canonical = resolveProviderId(providerId);
  if (keyStates.has(canonical)) return;
  if (keyStates.has(providerId) && canonical !== providerId) return;
  const keys = config.providerKeys[canonical] || config.providerKeys[providerId] || [];
  keyStates.set(
    canonical,
    keys.map((k) => ({ key: k, failCount: 0, cooldownUntil: 0, lastUsed: 0 }))
  );
}

export function getNextKeyManaged(providerId: string): string | null {
  const canonical = resolveProviderId(providerId);
  ensure(canonical);
  const states = keyStates.get(canonical) || keyStates.get(providerId)!;
  if (states.length === 0) {
    // public providers allow empty
    if (isPublicProvider(providerId)) return "";
    return null;
  }
  // Filter out cooldown
  const now = Date.now();
  const available = states.filter((s) => s.cooldownUntil <= now);
  if (available.length === 0) {
    logger.warn({ provider: providerId }, "all keys in cooldown");
    return null;
  }
  // Least-failed first (healthy keys preferred), LRU tie-break.
  // markSuccess resets failCount, so recovered keys float back up.
  const sorted = [...available].sort((a, b) => a.failCount - b.failCount || a.lastUsed - b.lastUsed);
  const chosen = sorted[0];
  chosen.lastUsed = now;
  return chosen.key;
}

export function markRateLimited(providerId: string, key: string, retryAfterMs: number = 60000) {
  const canonical = resolveProviderId(providerId);
  ensure(canonical);
  const states = keyStates.get(canonical) || keyStates.get(providerId)!;
  const s = states.find((x) => x.key === key);
  if (s) {
    s.cooldownUntil = Date.now() + retryAfterMs;
    s.failCount++;
    logger.warn({ provider: providerId, keyPrefix: key.slice(0, 8) + "...", retryAfterMs }, "key rate limited, cooldown");
  }
}

export function markSuccess(providerId: string, key: string) {
  const canonical = resolveProviderId(providerId);
  const states = keyStates.get(canonical) || keyStates.get(providerId);
  const s = states?.find((x) => x.key === key);
  if (s) s.failCount = 0;
}

export function getKeyStats(providerId: string) {
  const canonical = resolveProviderId(providerId);
  ensure(canonical);
  return (keyStates.get(canonical) || keyStates.get(providerId)!).map((s) => ({
    prefix: s.key.slice(0, 8) + "...",
    failCount: s.failCount,
    cooldownUntil: s.cooldownUntil,
    available: s.cooldownUntil <= Date.now(),
  }));
}

export function _resetKeyStates(): void {
  keyStates.clear();
}
