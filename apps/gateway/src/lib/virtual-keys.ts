import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { timingSafeEqual } from "./auth.js";
import { resolveDataPath } from "./paths.js";

export interface VirtualKey {
  id: string;
  name: string;
  prefix: string; // fgk-
  hash: string; // sha256
  key?: string; // full key, only on create (not stored)
  encrypted?: string; // for persistence
  scopes: { models: string[]; providers: string[] };
  rpmLimit: number;
  tpdLimit: number;
  role: "user" | "admin";
  createdAt: string;
  lastUsedAt?: string;
  requestCount?: number;
}

const STORE_PATH = resolveDataPath("virtual-keys.json");

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function load(): VirtualKey[] {
  try {
    if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch { /* ignore: store load failed */ }
  // Seed with master key as admin virtual key if no store
  const master: VirtualKey = {
    id: "vk-master",
    name: "master",
    prefix: "fgk-",
    hash: hashKey(config.masterKey),
    scopes: { models: ["*"], providers: ["*"] },
    rpmLimit: 1000,
    tpdLimit: 10000000,
    role: "admin",
    createdAt: new Date().toISOString(),
    requestCount: 0,
  };
  return [master];
}

function save(keys: VirtualKey[]): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(keys, null, 2));
}

async function saveAsync(keys: VirtualKey[]): Promise<void> {
  try {
    await fs.promises.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(keys, null, 2));
  } catch { /* ignore: async save failed */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;
function scheduleSave(): void {
  if (saveTimer) {
    pendingSave = true;
    return;
  }
  // debounce 1s to avoid per-request fs sync
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const keys = cache ? [...cache] : [];
    void saveAsync(keys).finally(() => {
      if (pendingSave) {
        pendingSave = false;
        scheduleSave();
      }
    });
  }, 1000);
  saveTimer.unref?.();
}

function flushVirtualKeysSync(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingSave = false;
  }
  if (cache) {
    try { save(cache); } catch { /* ignore */ }
  }
}

const isVkTestEnv = process.env.NODE_ENV === "test" || !!process.env.VITEST;
if (!isVkTestEnv && typeof process !== "undefined" && typeof process.on === "function") {
  const flush = () => { try { flushVirtualKeysSync(); } catch { /* ignore */ } };
  try { process.on("exit", flush); } catch { /* ignore */ }
  for (const sig of ["SIGTERM", "SIGINT", "SIGUSR2", "SIGHUP"] as const) {
    try { process.on(sig as NodeJS.Signals, () => { flush(); }); } catch { /* ignore */ }
  }
  try { process.on("beforeExit", flush); } catch { /* ignore */ }
}

let cache: VirtualKey[] | null = null;
function getAll(): VirtualKey[] {
  if (cache) return cache;
  cache = load();
  return cache;
}

export function listVirtualKeys(): Omit<VirtualKey, "hash" | "encrypted" | "key">[] {
  return getAll().map(({ hash: _hash, encrypted: _encrypted, key: _key, ...rest }) => rest);
}

export function createVirtualKey(opts: { name: string; scopes?: { models?: string[]; providers?: string[] }; rpmLimit?: number; tpdLimit?: number; role?: "user" | "admin" }): VirtualKey & { key: string } {
  const id = `vk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const raw = `fgk-${crypto.randomBytes(18).toString("base64url")}`;
  const vk: VirtualKey & { key: string } = {
    id,
    name: opts.name,
    prefix: "fgk-",
    hash: hashKey(raw),
    key: raw,
    scopes: {
      models: opts.scopes?.models || ["*"],
      providers: opts.scopes?.providers || ["*"],
    },
    rpmLimit: opts.rpmLimit ?? 60,
    tpdLimit: opts.tpdLimit ?? 100000,
    role: opts.role || "user",
    createdAt: new Date().toISOString(),
    requestCount: 0,
  };
  const all = getAll();
  // Store hash only, not raw (key already overridden to undefined above)
  const stored: VirtualKey = { ...vk, key: undefined, encrypted: undefined };
  all.push(stored);
  save(all);
  cache = all;
  return vk;
}

export function deleteVirtualKey(id: string): boolean {
  const all = getAll();
  const idx = all.findIndex((k) => k.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  save(all);
  cache = all;
  return true;
}

export function findByKey(raw: string): VirtualKey | null {
  const h = hashKey(raw);
  const all = getAll();
  for (const k of all) {
    if (timingSafeEqual(k.hash, h)) return k;
  }
  return null;
}

export function isValidVirtualKeyLive(key: string): VirtualKey | null {
  // Check master first
  if (timingSafeEqual(key, config.masterKey)) {
    return {
      id: "vk-master",
      name: "master",
      prefix: "fgk-",
      hash: hashKey(key),
      scopes: { models: ["*"], providers: ["*"] },
      rpmLimit: 1000,
      tpdLimit: 10000000,
      role: "admin",
      createdAt: new Date().toISOString(),
    };
  }
  const vk = findByKey(key);
  if (vk) {
    vk.lastUsedAt = new Date().toISOString();
    vk.requestCount = (vk.requestCount || 0) + 1;
    scheduleSave();
    return vk;
  }
  // Secure: no fallback for arbitrary fgk- keys. All keys must be registered via createVirtualKey or master.
  // To enable legacy dev fallback, set ALLOW_DEV_FALLBACK=1 explicitly (not recommended for production)
  if (process.env.ALLOW_DEV_FALLBACK === "1" && config.nodeEnv === "development" && key.startsWith("fgk-")) {
    return {
      id: "vk-dev",
      name: "dev-fallback",
      prefix: "fgk-",
      hash: hashKey(key),
      scopes: { models: ["*"], providers: ["*"] },
      rpmLimit: 60,
      tpdLimit: 100000,
      role: "user",
      createdAt: new Date().toISOString(),
    };
  }
  return null;
}

export function hasScope(vk: VirtualKey, model?: string, provider?: string): boolean {
  if (vk.role === "admin") return true;
  const modelOk = !model || vk.scopes.models.includes("*") || vk.scopes.models.includes(model) || vk.scopes.models.some((m) => model.startsWith(m));
  const provOk = !provider || vk.scopes.providers.includes("*") || vk.scopes.providers.includes(provider);
  return modelOk && provOk;
}
