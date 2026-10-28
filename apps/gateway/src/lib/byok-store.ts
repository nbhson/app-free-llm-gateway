import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./paths.js";
import { encrypt, decrypt } from "./key-manager.js";
import { logger } from "../middleware/logger.js";

export type ByokMap = Record<string, Record<string, string[]>>; // vkId -> provider -> keys[]

const STORE_PATH = resolveDataPath("byok-store.json");

function loadRaw(): ByokMap {
  try { if (fs.existsSync(STORE_PATH)) return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")); } catch { /* ignore */ }
  return {};
}

function saveRaw(map: ByokMap): void {
  try { fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true }); fs.writeFileSync(STORE_PATH, JSON.stringify(map, null, 2)); } catch { /* ignore */ }
}

// Encrypted at rest: store as encrypted JSON blob.
// SECURITY NOTE: khi decrypt fail (ENCRYPTION_KEY sai / file corrupt), store fallback về
// plaintext — chỉ chấp nhận được khi file chưa tồn tại (fresh install). Nếu file có
// nội dung mã hóa mà không giải mã được → không load, báo lỗi thay vì để plaintext lộ.
function load(): ByokMap {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    // Nếu là encrypted blob (wrapper {__enc, updatedAt}) — bắt buộc giải mã.
    // Không fallback về plaintext khi decryption fail (trước đây bỏ qua cả try/catch).
    if (raw.trim().startsWith("{")) {
      const j = JSON.parse(raw);
      if (j.__enc) {
        try {
          const dec = decrypt(j.__enc);
          return JSON.parse(dec) as ByokMap;
        } catch {
          // Decryption failed — do NOT fallback to plaintext if the file has
          // an __enc field (means it was encrypted). Only use plaintext for
          // legacy files that were never encrypted.
          logger.error({ storePath: STORE_PATH }, "BYOK store decryption failed — remove the file to reset");
          return {}; // Fresh start; user must re-upload keys after reconfiguring ENCRYPTION_KEY
        }
      }
      // No __enc field: this is a plaintext legacy file or a brand-new store.
      // Accept it silently (fresh install = no keys yet). Log warning in production.
      if (raw.trim() !== "{}") {
        logger.warn("BYOK store is unencrypted — re-encrypt via saving new keys");
      }
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
