import crypto from "node:crypto";

// Timing-safe compare using Node crypto (constant-time for equal-length buffers,
// length-mismatch short-circuits safely without leaking content).
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still compare against same-length dummy to keep timing uniform-ish,
    // then return false.
    const dummy = Buffer.alloc(Math.max(bufA.length, bufB.length));
    try {
      crypto.timingSafeEqual(dummy, dummy);
    } catch { /* ignore: timing dummy compare failed */ }
    // Compare byte-by-byte to avoid early exit on content
    let diff = bufA.length ^ bufB.length;
    const max = Math.max(bufA.length, bufB.length);
    for (let i = 0; i < max; i++) {
      diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
    }
    return diff === 0;
  }
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function extractBearer(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const auth = c.req.header("authorization") || c.req.header("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
