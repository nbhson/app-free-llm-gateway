import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { clearPinCache, pinnedAddress, resolveAndPin, setPinnedLookup, pinnedFetch } from "./pinned-fetch.js";

function fakeDns(map: Record<string, string[]>, calls: { count: number }) {
  return async (hostname: string) => {
    calls.count++;
    const rec = map[hostname];
    if (!rec) {
      const err = new Error(`NXDOMAIN ${hostname}`) as NodeJS.ErrnoException;
      err.code = "ENOTFOUND";
      throw err;
    }
    return rec.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

describe("pinned-fetch (SSRF DNS pinning)", () => {
  beforeEach(() => {
    clearPinCache();
  });
  afterEach(() => {
    setPinnedLookup(null);
    clearPinCache();
  });

  it("resolves a public hostname and pins the validated IP", async () => {
    const calls = { count: 0 };
    setPinnedLookup(fakeDns({ "pub.example": ["93.184.216.34"] }, calls));
    const pin = await resolveAndPin("pub.example");
    expect(pin).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("blocks hostnames that resolve to a private IPv4", async () => {
    const calls = { count: 0 };
    setPinnedLookup(fakeDns({ "evil.example": ["169.254.169.254"] }, calls));
    await expect(resolveAndPin("evil.example")).rejects.toThrow(/private IP/);
    expect(calls.count).toBe(1);
  });

  it("blocks if ANY record is private (mixed public+private A/AAAA)", async () => {
    setPinnedLookup(
      fakeDns({ "mixed.example": ["93.184.216.34", "fd00::1"] }, { count: 0 }),
    );
    await expect(resolveAndPin("mixed.example")).rejects.toThrow(/private IP fd00::1/);
  });

  it("blocks IPv4-mapped IPv6 rebinding (::ffff:10.0.0.5)", async () => {
    setPinnedLookup(fakeDns({ "mapped.example": ["::ffff:10.0.0.5"] }, { count: 0 }));
    await expect(resolveAndPin("mapped.example")).rejects.toThrow(/private IP/);
  });

  it("blocks private IP literals without DNS", async () => {
    await expect(resolveAndPin("127.0.0.1")).rejects.toThrow(/private IP/);
    await expect(resolveAndPin("10.1.2.3")).rejects.toThrow(/private IP/);
    // public IP literal is fine and needs no DNS
    await expect(resolveAndPin("1.2.3.4")).resolves.toEqual({ address: "1.2.3.4", family: 4 });
  });

  it("pinned entry is reused without re-resolving", async () => {
    const calls = { count: 0 };
    setPinnedLookup(fakeDns({ "pin.example": ["1.1.1.1"] }, calls));
    const a = await resolveAndPin("pin.example");
    const b = await resolveAndPin("pin.example");
    expect(a).toEqual(b);
    expect(calls.count).toBe(1);
    expect(pinnedAddress("pin.example")).toEqual({ address: "1.1.1.1", family: 4 });
  });

  it("re-resolves (and re-validates) after the pin TTL expires", async () => {
    const calls = { count: 0 };
    setPinnedLookup(fakeDns({ "ttl.example": ["9.9.9.9"] }, calls));
    await resolveAndPin("ttl.example");
    expect(calls.count).toBe(1);
    clearPinCache(); // simulate TTL expiry (cache drop)
    await resolveAndPin("ttl.example");
    expect(calls.count).toBe(2);
  });

  it("propagates DNS failures with a clear reason", async () => {
    setPinnedLookup(fakeDns({}, { count: 0 }));
    await expect(resolveAndPin("nope.example")).rejects.toThrow(/DNS lookup failed/);
  });

  it("errors on empty DNS records", async () => {
    setPinnedLookup(fakeDns({ "empty.example": [] }, { count: 0 }));
    await expect(resolveAndPin("empty.example")).rejects.toThrow(/no records/);
  });

  it("pinnedFetch refuses to even open a socket to a private IP target", async () => {
    const server = http.createServer((_req, res) => res.end("pwned"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    await expect(pinnedFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/SSRF blocked: private IP/);
    await new Promise<void>((r) => server.close(() => r()));
  });
});
