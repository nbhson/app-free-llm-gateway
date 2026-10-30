import { describe, it, expect, afterEach } from "vitest";
import { tryProviders } from "./provider-executor.js";
import { providers } from "../providers/registry.js";
import { getState } from "./circuit-breaker.js";
import { _resetKeyStates } from "./key-manager.js";

function ok(text: string) {
  return new Response(JSON.stringify({ ok: true, text }), { status: 200 });
}

describe("provider-executor", () => {
  const origPollinations = providers["pollinations"];
  const origLlm7 = providers["llm7-io"];
  const origOllama = providers["ollama-cloud"];
  afterEach(() => {
    providers["pollinations"] = origPollinations;
    providers["llm7-io"] = origLlm7;
    providers["ollama-cloud"] = origOllama;
    _resetKeyStates();
  });

  it("returns first success with providerId + key + res", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => ok("hi") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations", "llm7-io"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerId).toBe("pollinations");
      expect(typeof r.key).toBe("string");
      expect(r.res.ok).toBe(true);
    }
  });

  it("falls back to next provider on 500", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => new Response("boom", { status: 500 }) } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("second") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations", "llm7-io"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
  });

  it("collects errors when all fail (with status)", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => new Response("down", { status: 503 }) } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatchObject({ provider: "pollinations", status: 503 });
    }
  });

  it("skips unknown providers and open circuits", async () => {
    // force ollama-cloud breaker open (isolated id, unused elsewhere in this file)
    const { recordFailure } = await import("./circuit-breaker.js");
    for (let i = 0; i < 5; i++) recordFailure("ollama-cloud");
    providers["pollinations"] = { ...origPollinations, chat: async () => ok("hi") } as any;
    const r = await tryProviders({
      providerOrder: ["no-such-provider", "ollama-cloud", "pollinations"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("pollinations");
  });

  it("shouldSkip vetoes with reason", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => ok("hi") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations"],
      shouldSkip: () => "model deprecated per verified-models.json",
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].error).toMatch(/deprecated/);
  });

  it("4xx does not trip the breaker, 5xx does", async () => {
    const pid = "pollinations";
    const before = getState(pid).failures;
    providers[pid] = { ...origPollinations, chat: async () => new Response("bad request", { status: 400 }) } as any;
    for (let i = 0; i < 3; i++) {
      await tryProviders({ providerOrder: [pid], call: ({ provider, key }) => (provider as any).chat({}, key) });
    }
    expect(getState(pid).failures).toBe(before); // 400s ignored
    expect(getState(pid).state).not.toBe("open");

    providers[pid] = { ...origPollinations, chat: async () => new Response("err", { status: 500 }) } as any;
    await tryProviders({ providerOrder: [pid], call: ({ provider, key }) => (provider as any).chat({}, key) });
    expect(getState(pid).failures).toBeGreaterThan(before); // 500 counted
  });

  it("records 429 status in errors", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => new Response("slow", { status: 429, headers: { "retry-after": "1" } }) } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].status).toBe(429);
      expect(r.errors[0].retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("falls back on 403 budget exhausted (Pollinations)", async () => {
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => new Response(JSON.stringify({ error: "The API key used for this request has reached its budget. Please raise the key budget" }), { status: 403 }),
    } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("llm7-ok") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations", "llm7-io"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
  });

  it("falls back on 200 SSE containing budget phrase", async () => {
    providers["pollinations"] = {
      ...origPollinations,
      chat: async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"error":"reached its budget"}\n\n'));
            controller.close();
          },
        });
        return new Response(stream as any, { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("llm7-ok") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations", "llm7-io"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
  });

  it("parallel fallback skips pollinations budget and wins with next", async () => {
    providers["pollinations"] = { ...origPollinations, chat: async () => new Response("reached its budget", { status: 403 }) } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("llm7-ok") } as any;
    const r = await tryProviders({
      providerOrder: ["pollinations", "llm7-io"],
      parallel: 3,
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
  });

  it("402 budget trips breaker", async () => {
    // use isolated public provider to avoid polluted breaker from previous pollinations tests (threshold 5)
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    const before = getState(pid).failures;
    providers[pid] = { id: pid, type: "scraped", chat: async () => new Response("budget exceeded", { status: 402 }), models: async () => [], health: async () => true } as any;
    await tryProviders({ providerOrder: [pid], call: ({ provider, key }) => (provider as any).chat({}, key) });
    expect(getState(pid).failures).toBeGreaterThan(before);
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("retries same provider on 5xx before falling back", async () => {
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    let calls = 0;
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => {
        calls++;
        if (calls === 1) return new Response("transient blip", { status: 503 });
        return ok("recovered");
      },
    } as any;
    const r = await tryProviders({
      providerOrder: [pid],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe(pid);
    expect(calls).toBe(2); // first 503 + retry success
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("does NOT retry 4xx (fails over immediately)", async () => {
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    let calls = 0;
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => { calls++; return new Response("model not found", { status: 400 }); },
    } as any;
    const r = await tryProviders({
      providerOrder: [pid],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("does NOT retry on timeout (would double worst-case latency)", async () => {
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    let calls = 0;
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => { calls++; return new Promise(() => {}); }, // never resolves
    } as any;
    const r = await tryProviders({
      providerOrder: [pid],
      timeoutMs: 60,
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].error).toMatch(/timeout/i);
    expect(calls).toBe(1);
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("retries network errors (fetch throws) before failing over", async () => {
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    let calls = 0;
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => {
        calls++;
        if (calls === 1) throw new Error("fetch failed");
        return ok("net-ok");
      },
    } as any;
    const r = await tryProviders({
      providerOrder: [pid],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe(pid);
    expect(calls).toBe(2);
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("falls back on 200 JSON with top-level error object (any provider)", async () => {
    // non-pollinations provider returning 200 + {"error": ...} in body
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => new Response(JSON.stringify({ error: { message: "internal upstream failure" } }), { status: 200, headers: { "content-type": "application/json" } }),
    } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("llm7-ok") } as any;
    const r = await tryProviders({
      providerOrder: [pid, "llm7-io"],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("does NOT false-positive on 200 JSON containing 'error' as data content", async () => {
    const pid = "glhf-chat" as const;
    const orig = providers[pid];
    providers[pid] = {
      id: pid, type: "scraped", models: async () => [], health: async () => true,
      chat: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"error": "just text the user asked for"}' } }] }), { status: 200, headers: { "content-type": "application/json" } }),
    } as any;
    const r = await tryProviders({
      providerOrder: [pid],
      call: ({ provider, key }) => (provider as any).chat({}, key),
    });
    expect(r.ok).toBe(true);
    if (orig) providers[pid] = orig;
    else delete (providers as any)[pid];
  });

  it("parallel: aborts loser fetches after a sibling wins", async () => {
    const pids = ["glhf-chat", "llm7-io"] as const;
    const origs = pids.map((p) => providers[p]);
    const aborted: string[] = [];
    providers["glhf-chat"] = {
      id: "glhf-chat", type: "scraped", models: async () => [], health: async () => true,
      // slow loser: hangs until aborted
      chat: (_req: unknown, _key: unknown, signal?: AbortSignal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => { aborted.push("glhf-chat"); reject(new Error("aborted")); });
        }),
    } as any;
    providers["llm7-io"] = { ...origLlm7, chat: async () => ok("fast-winner") } as any;
    const r = await tryProviders({
      providerOrder: [...pids],
      parallel: 3,
      call: ({ provider, key, signal }) => (provider as any).chat({}, key, signal),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe("llm7-io");
    // loser was aborted via its signal
    expect(aborted).toContain("glhf-chat");
    origs.forEach((o, i) => { const p = pids[i]; if (o) providers[p] = o; else delete (providers as any)[p]; });
  });

  it("demoted pair (400 x2) is tried last, not first", async () => {
    const { recordModelFailure: _rmf, isDemoted, _resetPairHealth } = await import("./pair-health.js");
    _resetPairHealth();
    const bad = "glhf-chat" as const;
    const good = "llm7-io";
    const origBad = providers[bad];
    const origGood = providers[good];
    try {
      // teach: bad returns 400 "model not found" for this model twice
      providers[bad] = { id: bad, type: "scraped", models: async () => [], health: async () => true, chat: async () => new Response("model not found", { status: 400 }) } as any;
      providers[good] = { ...origGood, chat: async () => ok("good") } as any;
      for (let i = 0; i < 2; i++) {
        await tryProviders({ providerOrder: [bad, good], quotaModel: "stub-model", call: ({ provider, key }) => (provider as any).chat({}, key) });
      }
      expect(isDemoted(bad, "stub-model")).toBe(true);
      // next request: bad tried LAST — good must succeed first, bad receives no call
      let badCalls = 0;
      providers[bad] = { id: bad, type: "scraped", models: async () => [], health: async () => true, chat: async () => { badCalls++; return ok("bad-recovered"); } } as any;
      const r = await tryProviders({ providerOrder: [bad, good], quotaModel: "stub-model", call: ({ provider, key }) => (provider as any).chat({}, key) });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.providerId).toBe(good);
      expect(badCalls).toBe(0);
    } finally {
      if (origBad) providers[bad] = origBad; else delete (providers as any)[bad];
      if (origGood) providers[good] = origGood; else delete (providers as any)[good];
      _resetPairHealth();
    }
  });
});
