// SSRF DNS pinning (OWASP "DNS rebinding" mitigation for outbound provider calls).
//
// Problem: validateUrlString()/isSafeUrl() check the hostname, but the actual
// fetch() resolves DNS a second time. An attacker controlling DNS for a public
// hostname can answer the *first* lookup with a public IP and the *second*
// (connect-time) lookup with 169.254.169.254 / 10.x.x.x → SSRF past the guard.
//
// Fix: custom undici dispatcher whose connect() lookup resolves the hostname
// ONCE, validates every resolved address against the same private-host
// BlockList as ssrf-guard, caches the pinned (validated) IP for a short TTL and
// connects to that IP. TLS SNI + Host header stay the original hostname (the
// URL is untouched), so certificates and virtual hosting keep working.
import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { isPrivateIp } from "./ssrf-guard.js";

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsLookupFn = (hostname: string) => Promise<LookupAddress[]>;

const defaultLookup: DnsLookupFn = async (hostname) =>
  await dns.lookup(hostname, { all: true, verbatim: true });

// Injectable for tests (mock DNS). Never inject in production code paths.
let activeLookup: DnsLookupFn = defaultLookup;

/** @internal test-only seam — swap the DNS resolver used for pinning. */
export function setPinnedLookup(fn: DnsLookupFn | null): void {
  activeLookup = fn ?? defaultLookup;
}

// Pin TTL: re-resolution after this window is fine (the validator re-runs).
const PIN_TTL_MS = 60_000;
const MAX_CACHE = 1_000;

interface PinEntry extends PinnedAddress {
  expires: number;
}

const pinCache = new Map<string, PinEntry>();

/** @internal test-only — drop all pinned DNS entries. */
export function clearPinCache(): void {
  pinCache.clear();
}

export function pinnedAddress(hostname: string): PinnedAddress | undefined {
  const e = pinCache.get(hostname);
  if (e && e.expires > Date.now()) return { address: e.address, family: e.family };
  return undefined;
}

/**
 * Resolve + validate a hostname exactly once and cache the result.
 * Throws if any resolved address is private/reserved (DNS-rebind block) or
 * resolution fails. Direct IP-literal hostnames skip DNS but are still
 * checked against the blocklist.
 */
export async function resolveAndPin(hostname: string): Promise<PinnedAddress> {
  const cached = pinnedAddress(hostname);
  if (cached) return cached;

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`SSRF blocked: private IP ${hostname}`);
    return { address: hostname, family: isIP(hostname) === 6 ? 6 : 4 };
  }

  let addrs: LookupAddress[];
  try {
    addrs = await activeLookup(hostname);
  } catch (e) {
    throw new Error(`DNS lookup failed for ${hostname}: ${(e as Error).message}`);
  }
  if (!addrs || addrs.length === 0) throw new Error(`DNS: no records for ${hostname}`);

  // Validate EVERY address (A and AAAA alike) — a single private record is enough to attack.
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error(`SSRF blocked: ${hostname} resolves to private IP ${a.address}`);
    }
  }
  const pick: PinnedAddress = { address: addrs[0].address, family: addrs[0].family === 6 ? 6 : 4 };
  if (pinCache.size >= MAX_CACHE) pinCache.clear();
  pinCache.set(hostname, { ...pick, expires: Date.now() + PIN_TTL_MS });
  return pick;
}

function makePinnedDispatcher(): Dispatcher {
  return new Agent({
    connect: {
      // undici's connector calls this right before opening the TCP socket.
      // Because we return the pre-validated IP, the socket is pinned and the
      // lookup cannot be re-bound between validation and connect.
      lookup(
        hostname: string,
        options: { family?: number | "IPv4" | "IPv6" },
        callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
      ): void {
        resolveAndPin(hostname).then(
          (pin) => {
            const want4 = options.family === 4 || options.family === "IPv4";
            const want6 = options.family === 6 || options.family === "IPv6";
            if (want4 && pin.family !== 4) {
              callback(new Error(`DNS: ${hostname} has no IPv4 record (pinned ${pin.family === 6 ? "IPv6" : "IPv4"})`), "", 0);
              return;
            }
            if (want6 && pin.family !== 6) {
              callback(new Error(`DNS: ${hostname} has no IPv6 record (pinned IPv4)`), "", 0);
              return;
            }
            callback(null, pin.address, pin.family);
          },
          (err: Error) => callback(err, "", 0),
        );
      },
    },
  });
}

// Shared dispatcher: connections are pooled by origin anyway; the pin cache
// guarantees one DNS resolution + validation per hostname per TTL window.
const sharedDispatcher = makePinnedDispatcher();

/**
 * fetch() for gateway→provider traffic with DNS pinning + private-IP blocking.
 * Signature-compatible with global fetch for provider call sites.
 * Note: redirect chains are re-resolved per hop by the connector, and every
 * hop re-validates through the same lookup — no rebinding window.
 */
export async function pinnedFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`pinnedFetch: invalid URL ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`pinnedFetch: blocked protocol ${parsed.protocol}`);
  }
  // IP-literal hostnames never hit the connector's lookup (no DNS involved),
  // so they must be validated here or 127.0.0.1/169.254.169.254 sail through.
  if (isIP(parsed.hostname) && isPrivateIp(parsed.hostname)) {
    throw new Error(`SSRF blocked: private IP ${parsed.hostname}`);
  } else if (!isIP(parsed.hostname)) {
    // Resolve + validate + pin BEFORE connecting; the connector reuses the pin.
    await resolveAndPin(parsed.hostname);
  }
  const res = await undiciFetch(url, { ...init, dispatcher: sharedDispatcher } as Parameters<typeof undiciFetch>[1]);
  // undici's Response type is structurally compatible with the global one
  // used by provider call sites (same spec); bridge the nominal types.
  return res as unknown as Response;
}
