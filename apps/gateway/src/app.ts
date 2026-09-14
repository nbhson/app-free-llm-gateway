import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { config } from "./config.js";
import { requestLogger } from "./middleware/logger.js";
import { virtualKeyRateLimit } from "./middleware/rate-limit.js";
import { healthRoute } from "./routes/v1/health.js";
import { modelsRoute } from "./routes/v1/models.js";
import { chatRoute } from "./routes/v1/chat.js";
import { embeddingsRoute } from "./routes/v1/embeddings.js";
import { imagesRoute } from "./routes/v1/images.js";
import { audioRoute } from "./routes/v1/audio.js";
import { responsesRoute } from "./routes/v1/responses.js";
import { anthropicRoute } from "./routes/v1/anthropic.js";
import { compareRoute } from "./routes/v1/compare.js";
import { apiRoute } from "./routes/api.js";
import { extractBearer } from "./lib/auth.js";
import { setRequestVk } from "./lib/types.js";
import { isValidVirtualKeyLive } from "./lib/virtual-keys.js";
import { initRedis } from "./lib/redis.js";
import { logger } from "./middleware/logger.js";

export function createApp() {
  const app = new Hono();

  // Init Redis lazily for Vector 2 features
  try { initRedis(); } catch { /* ignore: redis optional */ }

  app.use("*", secureHeaders());
  app.use("*", cors({ origin: config.corsOrigin, allowHeaders: ["Authorization", "Content-Type", "x-router", "x-router-tier", "x-request-id", "X-Session-ID", "X-Parent-Session-ID", "x-session-id", "x-parent-session-id", "anthropic-version", "x-api-key"], maxAge: 86400 }));
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/v1/audio/")) {
      return bodyLimit({ maxSize: 25 * 1024 * 1024 })(c, next);
    }
    return bodyLimit({ maxSize: 10 * 1024 * 1024 })(c, next);
  });
  app.use("*", requestLogger);
  app.use("*", virtualKeyRateLimit);

  // Public bootstrap — expose auto-generated MASTER_KEY for first-time UI binding (local self-hosted)
  // Secure by default (EXPOSE_BOOTSTRAP=0): only enabled when explicitly
  // EXPOSE_BOOTSTRAP=1/true/yes/on (e.g. local `docker compose` first boot).
  // Public deployments MUST keep it disabled (default) — otherwise anyone can
  // fetch MASTER_KEY without auth.
  function isBootstrapExposed(): boolean {
    const v = (process.env.EXPOSE_BOOTSTRAP ?? "0").toLowerCase().trim();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }
  const bootstrapHandler = (c: { json: (o: unknown, s?: number) => unknown }) => {
    if (!isBootstrapExposed()) {
      return (c as unknown as { json: (o: unknown, s?: number) => unknown }).json(
        { error: { message: "Bootstrap disabled", type: "forbidden" } },
        403,
      );
    }
    return (c as unknown as { json: (o: unknown) => unknown }).json({ masterKey: config.masterKey });
  };
  app.get("/api/bootstrap", (c) => {
    const res = bootstrapHandler(c) as Response | Promise<Response>;
    // Never cache the master key
    c.header("Cache-Control", "no-store");
    return res;
  });
  // Alias for convenience
  app.get("/api/config/master", (c) => {
    const res = bootstrapHandler(c) as Response | Promise<Response>;
    c.header("Cache-Control", "no-store");
    return res;
  });

  // Metrics (Prometheus via prom-client) — public if enabled, no auth
  app.get("/metrics", async (c) => {
    if (!config.prometheusEnabled) return c.text("prometheus disabled", 404);
    const { renderMetrics } = await import("./lib/metrics.js");
    const { getAllStates } = await import("./lib/circuit-breaker.js");
    const { metrics } = await import("./lib/metrics.js");
    // update gauges
    const breakers = getAllStates() as Record<string, { state: string }>;
    for (const [id, st] of Object.entries(breakers)) metrics.circuitOpen(id, st.state === "open" ? 1 : 0);
    return c.text(await renderMetrics(), 200, { "Content-Type": "text/plain; version=0.0.4" });
  });

  // MCP manifest
  app.get("/mcp.json", (c) => {
    if (!config.mcpEnabled) return c.json({ error: "MCP disabled" }, 404);
    return c.json({
      name: "app-auto-llm-free",
      version: "1.11.3",
      tools: [
        { name: "gateway_chat", endpoint: "/v1/chat/completions", method: "POST", description: "Chat completions via gateway" },
        { name: "gateway_compare", endpoint: "/v1/chat/compare", method: "POST", description: "Compare 2-5 models side-by-side" },
        { name: "gateway_list_models", endpoint: "/v1/models", method: "GET" },
        { name: "gateway_provider_health", endpoint: "/api/providers/health", method: "GET" },
      ],
      auth: "Bearer fgk-...",
    });
  });

  // Public
  app.get("/", (c) => c.json({ name: "app-auto-llm-free", version: "1.11.3", docs: "/docs", health: "/v1/health", models: "/v1/models" }));
  app.route("/v1/health", healthRoute);
  // LB-friendly liveness/readiness probes — no auth, no version payload
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/health/ready", (c) => c.json({ ready: true }));
  app.get("/docs", (c) => c.html(`<!doctype html><html><head><title>Gateway Docs</title></head><body><h1>Gateway Docs</h1><p>See <a href="/README.md">README</a> and docs/API.md</p><pre>GET /v1/models\nPOST /v1/chat/completions\nPOST /v1/embeddings\nPOST /v1/images/generations\nPOST /v1/audio/transcriptions\nPOST /v1/audio/speech\nPOST /v1/responses\nPOST /v1/messages (Anthropic)\nGET /v1/health</pre></body></html>`));

  // Auth middleware for /v1/* (except health) — uses virtual-keys + master
  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/health" || c.req.path === "/v1/health/ready") return next();
    // Support both Authorization: Bearer fgk-... and x-api-key: fgk-... (Anthropic style for Claude Code)
    let key = extractBearer(c);
    if (!key) {
      const xKey = c.req.header("x-api-key") || c.req.header("X-API-Key");
      if (xKey) key = xKey.trim();
    }
    const vk = key ? isValidVirtualKeyLive(key) : null;
    if (!vk) {
      return c.json({ error: { message: "Invalid API key", type: "invalid_api_key", code: 401 } }, 401);
    }
    // Scope check for chat: if model or provider pinned via x-router, verify scope
    const pinned = c.req.header("x-router");
    const model = c.req.query("model") || "";
    if (vk && !vk.scopes.models.includes("*") && model && !vk.scopes.models.some((m) => model.includes(m))) {
      // For chat POST we check body later; this is query param check for models list
      if (c.req.path.startsWith("/v1/models") && model && !vk.scopes.models.includes("*")) {
        // allow list but filter later
      }
    }
    if (vk && pinned && !vk.scopes.providers.includes("*") && !vk.scopes.providers.includes(pinned)) {
      return c.json({ error: { message: `Key not allowed for provider ${pinned}`, type: "insufficient_scope" } }, 403);
    }
    setRequestVk(c, vk);
    return next();
  });

  app.route("/v1/models", modelsRoute);
  app.route("/v1/chat", chatRoute);
  app.route("/v1/chat", compareRoute);
  app.route("/v1/embeddings", embeddingsRoute);
  app.route("/v1/images", imagesRoute);
  app.route("/v1/audio", audioRoute);
  app.route("/v1/responses", responsesRoute);
  app.route("/v1/messages", anthropicRoute);
  // Alias: /v1/conversations -> responses
  app.route("/v1/conversations", responsesRoute);

  // Legacy compat: /v1/chat/completions is at /v1/chat/completions via chatRoute
  // Also support /v1/completions stub
  app.post("/v1/completions", async (c) => {
    return c.json({ error: { message: "Use /v1/chat/completions", type: "invalid_request" } }, 400);
  });

  // Admin /api/* — require master or admin virtual key
  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/bootstrap" || c.req.path === "/api/config/master") return next();
    const key = extractBearer(c);
    const vk = key ? isValidVirtualKeyLive(key) : null;
    if (!vk) return c.json({ error: { message: "Unauthorized", type: "invalid_api_key" } }, 401);
    // For /api/keys POST/DELETE and PUT /api/config require admin
    if (((c.req.path.startsWith("/api/keys") && c.req.method !== "GET") || (c.req.path === "/api/config" && c.req.method === "PUT")) && vk.role !== "admin") {
      return c.json({ error: { message: "Admin required", type: "forbidden" } }, 403);
    }
    setRequestVk(c, vk);
    return next();
  });
  app.route("/api", apiRoute);

  // 404
  app.notFound((c) => c.json({ error: { message: `Not found: ${c.req.path}`, type: "not_found" } }, 404));

  app.onError((err, c) => {
    logger.error({ err, path: c.req.path }, "unhandled error");
    return c.json({ error: { message: err.message || "Internal error", type: "internal_error" } }, 500);
  });

  return app;
}
