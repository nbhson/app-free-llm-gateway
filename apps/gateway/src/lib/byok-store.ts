import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./paths.js";
import { encrypt, decrypt } from "./key-manager.js";

export type ByokMap = Record<string, Record<string, string[]>>; // vkId -> provider -> keys[]

const STORE_PATH = resolveDataPath("byok-store.json");

function loadRaw(): ByokMap {
  try { if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")); } catch { /* ignore */ }
  return {};
}

function saveRaw(map: ByokMap): void {
  try { fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true }); fs.writeFileSync(STORE_PATH, JSON.stringify(map, null, 2)); } catch { /* ignore */ }
}

// Encrypted at rest: store as encrypted JSON blob
function load(): ByokMap {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    // try encrypted blob first
    if (raw.trim().startsWith("{") && raw.includes(":")) {
      // heuristic: if file contains ":...:...:" pattern for encrypted, try decrypt wrapper
      const j = JSON.parse(raw);
      if (j.__enc) {
        const dec = decrypt(j.__enc);
        return JSON.parse(dec) as ByokMap;
      }
      // plain map
      return j as ByokMap;
    }
  } catch { /* ignore */ }
  return loadRaw();
}

function save(map: ByokMap): void {
  try {
    const enc = encrypt(JSON.stringify(map));
    const wrapper = { __enc: enc, updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(wrapper, null, 2));
  } catch { saveRaw(map); }
}

export function getByokKeys(vkId: string, provider: string): string[] {
  const m = load();
  return m[vkId]?.[provider] || [];
}

export function getByokForVk(vkId: string): Record<string, string[]> {
  const m = load();
  return m[vkId] || {};
}

export function setByokKeys(vkId: string, provider: string, keys: string[]): void {
  const m = load();
  if (!m[vkId]) m[vkId] = {};
  if (keys.length === 0) delete m[vkId][provider];
  else m[vkId][provider] = keys;
  if (Object.keys(m[vkId]).length === 0) delete m[vkId];
  save(m);
}

export function listByokProviders(vkId: string): string[] {
  const m = load();
  return Object.keys(m[vkId] || {});
}

export function hasByok(vkId: string, provider: string): boolean {
  return getByokKeys(vkId, provider).length > 0;
}

export function getEffectiveKeys(provider: string, vkId?: string, fallbackKeys: string[] = []): string[] {
  if (vkId) {
    const byok = getByokKeys(vkId, provider);
    if (byok.length > 0) return byok;
  }
  return fallbackKeys;
}
