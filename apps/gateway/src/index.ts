import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./middleware/logger.js";
import { startScheduler } from "./jobs/scheduler.js";

const app = createApp();

let server: ServerType | undefined;

// Graceful shutdown — SIGTERM (Docker/K8s) and SIGINT (Ctrl-C) stop accepting
// new connections, give in-flight requests a grace period, then exit. Circuit
// breaker state is flushed by its own process exit handler.
const SHUTDOWN_GRACE_MS = 10_000;
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal: signal }, "shutting down — closing server");
  try {
    server?.close(() => {
      logger.info("server closed");
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
  // Force-exit if connections don't drain in time (keep-alive sockets, SSE)
  setTimeout(() => {
    logger.warn({ graceMs: SHUTDOWN_GRACE_MS }, "grace period elapsed — forcing exit");
    process.exit(0);
  }, SHUTDOWN_GRACE_MS).unref?.();
}

try { process.on("SIGTERM", (s) => shutdown(s)); } catch { /* ignore */ }
try { process.on("SIGINT", shutdown); } catch { /* ignore */ }

server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    logger.info(`🚀 Gateway listening on http://localhost:${info.port}`);
    logger.info(`   Health: http://localhost:${info.port}/v1/health`);
    logger.info(`   Models: http://localhost:${info.port}/v1/models`);
    logger.info(`   Chat:   POST http://localhost:${info.port}/v1/chat/completions`);
    logger.info(`Docs: http://localhost:${info.port}/docs`);
    // Start 24h verify scheduler (checks freellms vs live /models)
    if (process.env.DISABLE_SCHEDULER !== "1") {
      startScheduler();
    }
  }
);
