import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "./paths.js";

export interface ModelListEntry {
  id: string;
  raw_id?: string;
  object?: string;
  owned_by: string;
  provider?: string;
  display_name?: string;
  context_length?: number;
  score?: number;
  tier?: unknown;
  freellms_verified?: boolean;
  no_card?: boolean;
  capabilities?: unknown;
  limit?: unknown;
  created?: number;
  health?: unknown;
  persisted_404?: boolean;
  [key: string]: unknown;
}

/** Parse a single YAML models file (block format) into catalog entries. */
export function parseModelsYamlContent(raw: string): ModelListEntry[] {
  const blocks = raw.split(/\n\s*-\s+id:\s*/);
  const out: ModelListEntry[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const blk = blocks[i];
    const idMatch = blk.match(/^"([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const provider = (blk.match(/provider:\s*([^\n]+)/)?.[1] || id.split("/")[0]).trim();
    const display_name = (blk.match(/display_name:\s*"([^"]+)"/)?.[1] || id).trim();
    const context_length = parseInt(blk.match(/context_length:\s*(\d+)/)?.[1] || "8192", 10);
    const score = parseInt(blk.match(/score:\s*(\d+)/)?.[1] || "50", 10);
    const tier = (blk.match(/tier:\s*([^\n]+)/)?.[1] || "permanent").trim();
    const verified = blk.includes("verified: true");
    const no_card = !blk.includes("no_card: false");
    const capsRaw = blk.match(/capabilities:\s*\[([^\]]+)\]/)?.[1] || "text";
    const capabilities = capsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const limit = (blk.match(/limit:\s*"([^"]+)"/)?.[1] || "").trim();
    out.push({ id, raw_id: id, object: "model", owned_by: provider, provider, display_name, context_length, score, tier, freellms_verified: verified, no_card, capabilities, limit, created: 1715433600 });
  }
  return out;
}

/** Resolve candidate roots where models.yaml / models/ live. */
function modelYamlRoots(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // __dirname = apps/gateway/src/lib
  const hereParent2 = path.resolve(path.join(here, "../..")); // apps/gateway
  const hereParent3 = path.resolve(path.join(here, "../../..")); // apps
  const hereParent4 = path.resolve(path.join(here, "../../../..")); // repo root
  const roots: string[] = [
    // Repo root: models/ directory lives here in this monorepo
    hereParent4,
    process.cwd(),
    // Fallbacks: data dir siblings, apps/gateway, apps
    path.resolve(path.join(hereParent2, "data")),
    path.resolve(path.join(hereParent3, "data")),
    hereParent2,
    hereParent3,
  ];
  try { roots.push(resolveDataPath(".")); } catch { /* ignore */ }
  try { roots.push(resolveDataPath("..")); } catch { /* ignore */ }
  return roots;
}

/** Load models from either split `models/` directory or legacy `models.yaml`. */
export function loadModelsYaml(): ModelListEntry[] {
  try {
    const roots = modelYamlRoots();
    const mergedAll: ModelListEntry[] = [];
    const seenAll = new Set<string>();
    for (const root of roots) {
      const dir = path.join(root, "models");
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
        const merged: ModelListEntry[] = [];
        const seen = new Set<string>();
        for (const f of files) {
          for (const entry of parseModelsYamlContent(fs.readFileSync(path.join(dir, f), "utf-8"))) {
            if (!seen.has(entry.id)) {
              seen.add(entry.id);
              merged.push(entry);
            }
            if (!seenAll.has(entry.id)) {
              seenAll.add(entry.id);
              mergedAll.push(entry);
            }
          }
        }
        if (merged.length > 0) return merged;
      }
    }
    if (mergedAll.length > 0) return mergedAll;
  } catch { /* ignore */ }
  return [];
}
