import type { MiddlewareHandler } from "hono";
import { isValidVirtualKeyLive } from "../lib/virtual-keys.js";
import { slidingCheck } from "../lib/sliding-window.js";

const windows = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to avoid unbounded memory growth (many virtual keys / list buckets).
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) {
    if (w.resetAt <= now) windows.delete(k);
  }
  // Cap size as a backstop against key-spam DoS
  if (windows.size > 10000) {
    const oldest = [...windows.keys()].slice(0, windows.size - 10000);
    for (const k of oldest) windows.delete(k);
  }
}, 60_000).unref?.();

function memoryCheck(key: string, limit: number, now: number): { allowed: boolean; remaining: number; resetSec: number } {
  let w = windows.get(key);
  if (!w || w.resetAt <= now) w = { count: 0, resetAt: now + 60000 };
  if (w.count >= limit) {
    return { allowed: false, remaining: 0, resetSec: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count++;
  windows.set(key, w);
  // resetSec is RELATIVE (seconds until the window resets) — same semantics as
  // the denied path's retryAfter, so x-ratelimit-reset means one thing.
  return { allowed: true, remaining: Math.max(0, limit - w.count), resetSec: Math.ceil((w.resetAt - now) / 1000) };
}

export const virtualKeyRateLimit: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  // Skip strict limit for list endpoints (cheap, high frequency on typing/pagination)
  // They use debounced frontend (400ms) but still need higher burst
  const isListEndpoint = path.startsWith("/v1/models") || path.startsWith("/api/providers") || path.startsWith("/api/models/health");
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const raw = m ? m[1].trim() : "";
  if (!raw) return next();
  const vk = isValidVirtualKeyLive(raw);
  if (!vk) return next(); // will be 401 later
  // RPM check per virtual key — use higher limit for list endpoints (4x)
  const effectiveLimit = isListEndpoint ? Math.max(vk.rpmLimit * 4, 200) : vk.rpmLimit;
  const now = Date.now();
  const key = `vk:${vk.id}:${isListEndpoint ? "list" : "default"}`;

  // Distributed sliding-window-counter when Redis is up (atomic check+commit,
  // no boundary spike, shared across instances); else in-memory fixed window.
  // Race with 250ms timeout so slow Redis doesn't block gateway hot path.
  const sliding = await Promise.race([
    slidingCheck({
      namespace: `vkrl:${key}`,
      limit: effectiveLimit,
      tokens: 1,
      incr: 1,
      windowMs: 60000,
      nowMs: now,
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 250).unref?.()),
  ]).catch(() => null) as Awaited<ReturnType<typeof slidingCheck>>;
  if (sliding !== null) {
    if (!sliding.allowed) {
      return c.json({ error: { message: `Virtual key RPM limit ${effectiveLimit} exceeded`, type: "rate_limit_exceeded", retryAfter: Math.max(1, Math.ceil(sliding.retryAfterMs / 1000)) } }, 429);
    }
    c.header("x-ratelimit-limit-requests", String(effectiveLimit));
    c.header("x-ratelimit-remaining-requests", String(Math.max(0, effectiveLimit - Math.ceil(sliding.estimated) - 1)));
    c.header("x-ratelimit-reset", String(Math.ceil(60000 / 1000))); // relative seconds (window is 60s)
    await next();
    return;
  }
  const mem = memoryCheck(key, effectiveLimit, now);
  if (!mem.allowed) {
    return c.json({ error: { message: `Virtual key RPM limit ${effectiveLimit} exceeded`, type: "rate_limit_exceeded", retryAfter: mem.resetSec } }, 429);
  }
  c.header("x-ratelimit-limit-requests", String(effectiveLimit));
  c.header("x-ratelimit-remaining-requests", String(mem.remaining));
  c.header("x-ratelimit-reset", String(mem.resetSec));
  await next();
};
