import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Copy,
  Check,
  Info,
  Search,
  Download,
  Upload,
  Zap,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers,
  SlidersHorizontal,
  Globe,
  BarChart3,
  AlertTriangle,
  FileJson,
  Sparkles,
  X,
} from "lucide-react";
import { useLang } from "../lib/i18n.tsx";

function HelpTip({ text, id }: { text: string; id?: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      aria-describedby={id}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 cursor-help"
    >
      <Info className="w-3 h-3 text-slate-500" />
    </span>
  );
}

// ---------- Types & Defaults ----------
type SettingsState = {
  SEMANTIC_CACHE_ENABLED: number;
  SEMANTIC_THRESHOLD: number;
  CACHE_TTL_S: number;
  EMBEDDING_MODEL: string;
  EMBEDDING_FALLBACKS: string;
  SEMANTIC_CACHE_MAX_MEM: number;
  SEMANTIC_CACHE_SCAN_CAP: number;
  COMPRESSION_ENABLED: number;
  COMPRESSION_MAX_TOKENS: number;
  COST_ROUTING_ENABLED: number;
  COST_WEIGHT: number;
  LATENCY_WEIGHT: number;
  HEADROOM_WEIGHT: number;
  SUCCESS_WEIGHT: number;
  ANALYTICS_RETENTION_DAYS: number;
  PROVIDER_TIMEOUT_MS: number;
  PROVIDER_TIMEOUT_AUTO_MS: number;
  PROVIDER_TIMEOUT_REASONING_MS: number;
  PROVIDER_PARALLEL_AUTO: number;
  PROVIDER_PARALLEL_DEFAULT: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CIRCUIT_BREAKER_COOLDOWN_MS: number;
  WEB_TOOLS_ENABLED: number;
  WEB_SEARCH_PROVIDER: string;
  WEB_FETCH_TIMEOUT_MS: number;
  WEB_FETCH_MAX_BYTES: number;
  WEB_SEARCH_MAX_RESULTS: number;
  WEB_TOOLS_MAX_ITERATIONS: number;
  WEB_CACHE_TTL_S: number;
  FALLBACK_TIERS: string; // JSON string
};

const PUBLIC_PROVIDERS_UI = new Set(["pollinations", "llm7-io", "ollama-cloud", "glhf", "glhf-chat"]);

const STORAGE_KEY = "gatewaySettings";
const LAST_SAVED_KEY = "gatewaySettings_lastSaved";
const COLLAPSED_KEY = "gatewaySettings_collapsed";

const DEFAULT_TIER_JSON = JSON.stringify([
  [
    "kiraai",
    "pollinations",
    "llm7-io",
    "kilo-code",
    "agnes-ai",
    "ollama-cloud",
    "nvidia-nim",
    "orcarouter",
    "openrouter",
    "claude-code",
    "codex",
    "groq",
    "cerebras",
    "google-gemini",
    "github-models",
    "modelscope",
    "chutes-ai",
    "sambanova",
    "siliconflow",
    "cohere",
    "mistral-ai",
    "cloudflare-workers-ai",
    "ovhcloud-ai-endpoints",
    "aion-labs",
    "z-ai-zhipu-ai",
    "experientiallabs",
    "opencode",
    "freeai",
    "cline",
    "b-ai",
    "tokenharbor",
    "together",
    "fireworks",
    "novita",
    "deepseek",
    "grok-xai",
    "alibaba-cloud-model-studio",
    "nscale",
    "nebius",
    "ai21-labs",
    "anthropic",
  ],
]);

const DEFAULTS: SettingsState = {
  SEMANTIC_CACHE_ENABLED: 0,
  SEMANTIC_THRESHOLD: 0.92,
  CACHE_TTL_S: 3600,
  EMBEDDING_MODEL: "cohere/embed-english-v3.0",
  EMBEDDING_FALLBACKS: "nvidia-nim/nvidia/nv-embed-v1,cloudflare-workers-ai/@cf/baai/bge-large-en-v1.5",
  SEMANTIC_CACHE_MAX_MEM: 1000,
  SEMANTIC_CACHE_SCAN_CAP: 200,
  COMPRESSION_ENABLED: 0,
  COMPRESSION_MAX_TOKENS: 8192,
  COST_ROUTING_ENABLED: 0,
  COST_WEIGHT: 5,
  LATENCY_WEIGHT: 0.0005,
  HEADROOM_WEIGHT: 0.3,
  SUCCESS_WEIGHT: 2,
  ANALYTICS_RETENTION_DAYS: 30,
  PROVIDER_TIMEOUT_MS: 25000,
  PROVIDER_TIMEOUT_AUTO_MS: 12000,
  PROVIDER_TIMEOUT_REASONING_MS: 60000,
  PROVIDER_PARALLEL_AUTO: 3,
  PROVIDER_PARALLEL_DEFAULT: 2,
  CIRCUIT_BREAKER_THRESHOLD: 8,
  CIRCUIT_BREAKER_COOLDOWN_MS: 20000,
  WEB_TOOLS_ENABLED: 0,
  WEB_SEARCH_PROVIDER: "tavily",
  WEB_FETCH_TIMEOUT_MS: 8000,
  WEB_FETCH_MAX_BYTES: 500000,
  WEB_SEARCH_MAX_RESULTS: 5,
  WEB_TOOLS_MAX_ITERATIONS: 3,
  WEB_CACHE_TTL_S: 3600,
  FALLBACK_TIERS: DEFAULT_TIER_JSON,
};

const PRESETS: Record<string, Partial<SettingsState>> = {
  balanced: {
    SEMANTIC_CACHE_ENABLED: 1,
    SEMANTIC_THRESHOLD: 0.92,
    CACHE_TTL_S: 3600,
    COMPRESSION_ENABLED: 1,
    COMPRESSION_MAX_TOKENS: 4096,
    COST_ROUTING_ENABLED: 0,
    COST_WEIGHT: 5,
    LATENCY_WEIGHT: 0.0005,
    HEADROOM_WEIGHT: 0.3,
    SUCCESS_WEIGHT: 2,
  },
  cheapest: {
    SEMANTIC_CACHE_ENABLED: 1,
    SEMANTIC_THRESHOLD: 0.88,
    CACHE_TTL_S: 7200,
    COMPRESSION_ENABLED: 1,
    COMPRESSION_MAX_TOKENS: 2048,
    COST_ROUTING_ENABLED: 1,
    COST_WEIGHT: 10,
    LATENCY_WEIGHT: 0.0001,
    HEADROOM_WEIGHT: 0.5,
    SUCCESS_WEIGHT: 1,
  },
  fastest: {
    SEMANTIC_CACHE_ENABLED: 0,
    COMPRESSION_ENABLED: 0,
    COST_ROUTING_ENABLED: 1,
    COST_WEIGHT: 2,
    LATENCY_WEIGHT: 0.002,
    HEADROOM_WEIGHT: 0.1,
    SUCCESS_WEIGHT: 3,
    PROVIDER_TIMEOUT_MS: 15000,
    PROVIDER_TIMEOUT_AUTO_MS: 5000,
    PROVIDER_TIMEOUT_REASONING_MS: 25000,
  },
  performance: {
    SEMANTIC_CACHE_ENABLED: 1,
    SEMANTIC_THRESHOLD: 0.92,
    CACHE_TTL_S: 3600,
    SEMANTIC_CACHE_MAX_MEM: 2000,
    SEMANTIC_CACHE_SCAN_CAP: 400,
    COMPRESSION_ENABLED: 1,
    COMPRESSION_MAX_TOKENS: 8192,
    COST_ROUTING_ENABLED: 1,
    WEB_TOOLS_ENABLED: 1,
  },
};

// Realistic compression sample: 7 messages to trigger compression (threshold >6)
const COMPRESSION_SAMPLE = JSON.stringify(
  [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum computing basics." },
    { role: "assistant", content: "Quantum computing uses qubits which can be 0 and 1 simultaneously..." },
    { role: "user", content: "What about superposition?" },
    { role: "assistant", content: "Superposition allows qubits to exist in multiple states..." },
    { role: "user", content: "And entanglement?" },
    { role: "user", content: "Give me a detailed example with code in Python for a quantum circuit using Qiskit, explain each gate and measurement." },
  ],
  null,
  2
);

// ---------- Helpers ----------
function normalizeTiersString(s: string): string {
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return s;
    const cleaned = parsed.map((tier: unknown) => {
      if (!Array.isArray(tier)) return [];
      const deduped = [...new Set((tier as unknown[]).filter((x) => typeof x === "string" && (x as string).trim()).map((x) => (x as string).trim()))];
      return deduped.slice(0, 60);
    }).filter((t: string[]) => t.length > 0);
    return JSON.stringify(cleaned);
  } catch {
    return s;
  }
}

function loadStored(): SettingsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate: old FALLBACK_TIERS may be array not string
    if (Array.isArray(parsed.FALLBACK_TIERS)) {
      parsed.FALLBACK_TIERS = JSON.stringify(parsed.FALLBACK_TIERS);
    }
    if (typeof parsed.FALLBACK_TIERS === "string") {
      parsed.FALLBACK_TIERS = normalizeTiersString(parsed.FALLBACK_TIERS as string);
    }
    // Ensure all defaults present + coerce types
    const merged = { ...DEFAULTS, ...parsed } as SettingsState;
    // Clamp numeric fields to valid ranges (defensive)
    merged.SEMANTIC_THRESHOLD = Math.min(1, Math.max(0, Number(merged.SEMANTIC_THRESHOLD) || 0.92));
    merged.CACHE_TTL_S = Math.min(604800, Math.max(60, parseInt(String(merged.CACHE_TTL_S), 10) || 3600));
    merged.SEMANTIC_CACHE_MAX_MEM = Math.min(10000, Math.max(100, parseInt(String(merged.SEMANTIC_CACHE_MAX_MEM), 10) || 1000));
    merged.SEMANTIC_CACHE_SCAN_CAP = Math.min(1000, Math.max(10, parseInt(String(merged.SEMANTIC_CACHE_SCAN_CAP), 10) || 200));
    merged.COMPRESSION_MAX_TOKENS = Math.min(32000, Math.max(512, parseInt(String(merged.COMPRESSION_MAX_TOKENS), 10) || 4096));
    merged.ANALYTICS_RETENTION_DAYS = Math.min(365, Math.max(1, parseInt(String(merged.ANALYTICS_RETENTION_DAYS), 10) || 30));
    return merged;
  } catch {
    return null;
  }
}

function validateSettings(s: SettingsState): string[] {
  const errs: string[] = [];
  if (s.SEMANTIC_THRESHOLD < 0 || s.SEMANTIC_THRESHOLD > 1 || !Number.isFinite(s.SEMANTIC_THRESHOLD)) errs.push("SEMANTIC_THRESHOLD must be 0..1");
  if (!Number.isFinite(s.CACHE_TTL_S) || s.CACHE_TTL_S < 60 || s.CACHE_TTL_S > 604800) errs.push("CACHE_TTL_S must be 60..604800");
  if (!s.EMBEDDING_MODEL.trim()) errs.push("EMBEDDING_MODEL empty");
  if (s.EMBEDDING_MODEL.length > 200) errs.push("EMBEDDING_MODEL too long");
  if (s.EMBEDDING_FALLBACKS.length > 2000) errs.push("EMBEDDING_FALLBACKS too long");
  if (s.SEMANTIC_CACHE_MAX_MEM < 100 || s.SEMANTIC_CACHE_MAX_MEM > 10000) errs.push("SEMANTIC_CACHE_MAX_MEM 100..10000");
  if (s.SEMANTIC_CACHE_SCAN_CAP < 10 || s.SEMANTIC_CACHE_SCAN_CAP > 1000) errs.push("SEMANTIC_CACHE_SCAN_CAP 10..1000");
  if (s.COMPRESSION_MAX_TOKENS < 512 || s.COMPRESSION_MAX_TOKENS > 32000) errs.push("COMPRESSION_MAX_TOKENS 512..32000");
  for (const k of ["COST_WEIGHT", "LATENCY_WEIGHT", "HEADROOM_WEIGHT", "SUCCESS_WEIGHT"] as const) {
    const v = s[k];
    if (!Number.isFinite(v) || v < 0 || v > 1000) errs.push(`${k} must be 0..1000`);
  }
  if (s.ANALYTICS_RETENTION_DAYS < 1 || s.ANALYTICS_RETENTION_DAYS > 365) errs.push("ANALYTICS_RETENTION_DAYS 1..365");
  if (s.PROVIDER_TIMEOUT_MS < 1000 || s.PROVIDER_TIMEOUT_MS > 120000) errs.push("PROVIDER_TIMEOUT_MS 1000..120000");
  if (s.PROVIDER_TIMEOUT_AUTO_MS < 1000 || s.PROVIDER_TIMEOUT_AUTO_MS > 30000) errs.push("PROVIDER_TIMEOUT_AUTO_MS 1000..30000");
  if (s.PROVIDER_TIMEOUT_REASONING_MS < 1000 || s.PROVIDER_TIMEOUT_REASONING_MS > 120000) errs.push("PROVIDER_TIMEOUT_REASONING_MS 1000..120000");
  if (s.PROVIDER_PARALLEL_AUTO < 1 || s.PROVIDER_PARALLEL_AUTO > 5) errs.push("PROVIDER_PARALLEL_AUTO 1..5");
  if (s.PROVIDER_PARALLEL_DEFAULT < 1 || s.PROVIDER_PARALLEL_DEFAULT > 5) errs.push("PROVIDER_PARALLEL_DEFAULT 1..5");
  if (s.CIRCUIT_BREAKER_THRESHOLD < 1 || s.CIRCUIT_BREAKER_THRESHOLD > 100) errs.push("CIRCUIT_BREAKER_THRESHOLD 1..100");
  if (s.CIRCUIT_BREAKER_COOLDOWN_MS < 1000 || s.CIRCUIT_BREAKER_COOLDOWN_MS > 300000) errs.push("CIRCUIT_BREAKER_COOLDOWN_MS 1000..300000");
  if (!["tavily", "brave", "serper", "jina"].includes(s.WEB_SEARCH_PROVIDER)) errs.push("WEB_SEARCH_PROVIDER invalid");
  if (s.WEB_FETCH_TIMEOUT_MS < 1000 || s.WEB_FETCH_TIMEOUT_MS > 30000) errs.push("WEB_FETCH_TIMEOUT_MS 1000..30000");
  if (s.WEB_FETCH_MAX_BYTES < 1000 || s.WEB_FETCH_MAX_BYTES > 2000000) errs.push("WEB_FETCH_MAX_BYTES 1000..2000000");
  if (s.WEB_SEARCH_MAX_RESULTS < 1 || s.WEB_SEARCH_MAX_RESULTS > 10) errs.push("WEB_SEARCH_MAX_RESULTS 1..10");
  if (s.WEB_TOOLS_MAX_ITERATIONS < 1 || s.WEB_TOOLS_MAX_ITERATIONS > 5) errs.push("WEB_TOOLS_MAX_ITERATIONS 1..5");
  if (s.WEB_CACHE_TTL_S < 60 || s.WEB_CACHE_TTL_S > 86400) errs.push("WEB_CACHE_TTL_S 60..86400");
  try {
    const tiers = JSON.parse(s.FALLBACK_TIERS);
    if (!Array.isArray(tiers) || tiers.length === 0 || tiers.length > 8) errs.push("FALLBACK_TIERS must be 1..8 tiers");
    else {
      let total = 0;
      for (const t of tiers) {
        if (!Array.isArray(t) || t.length === 0) errs.push("Each tier must be non-empty array");
        else total += t.length;
      }
      if (total > 200) errs.push("Total providers exceed 200");
    }
  } catch {
    errs.push("FALLBACK_TIERS invalid JSON");
  }
  return errs;
}

async function copyWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ---------- Component ----------
export default function Settings() {
  const { t } = useLang();
  const [form, setForm] = useState<SettingsState>(() => loadStored() || { ...DEFAULTS });
  const [envDefaults, setEnvDefaults] = useState<SettingsState>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [source, setSource] = useState<".env" | "localStorage">(() => (loadStored() ? "localStorage" : ".env"));
  const [lastSaved, setLastSaved] = useState<string | null>(() => localStorage.getItem(LAST_SAVED_KEY));
  const [search, setSearch] = useState("");
  const [showSnippetDiffOnly, setShowSnippetDiffOnly] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // embedding check
  const [embStatus, setEmbStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [fallbackStatuses, setFallbackStatuses] = useState<Record<string, "idle" | "checking" | "ok" | "error">>({});

  // P1: cache stats
  const [cacheStats, setCacheStats] = useState<{ enabled?: boolean; hits?: number; misses?: number; hitRate?: number; size?: number; error?: string } | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // P1: compression preview
  const [previewInput, setPreviewInput] = useState(COMPRESSION_SAMPLE);
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // P2: tiers editor
  const [tiersText, setTiersText] = useState(form.FALLBACK_TIERS);
  const [tiersError, setTiersError] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedTimeoutRef = useRef<number | null>(null);
  const applyMsgTimeoutRef = useRef<number | null>(null);
  const copyEnvTimeoutRef = useRef<number | null>(null);
  const copyDiffTimeoutRef = useRef<number | null>(null);

  const isModified = useCallback((key: keyof SettingsState) => {
    const a = form[key];
    const b = (envDefaults as unknown as Record<string, unknown>)[key];
    if (key === "FALLBACK_TIERS") {
      return normalizeTiersString(String(a)) !== normalizeTiersString(String(b));
    }
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [form, envDefaults]);

  const diffKeys = useMemo(() => (Object.keys(form) as (keyof SettingsState)[]).filter((k) => isModified(k)), [form, isModified]);

  const costPreview = useMemo(() => `score = cost*${form.COST_WEIGHT} + latency*${form.LATENCY_WEIGHT} - headroom*${form.HEADROOM_WEIGHT} - successRate*${form.SUCCESS_WEIGHT}`, [form.COST_WEIGHT, form.LATENCY_WEIGHT, form.HEADROOM_WEIGHT, form.SUCCESS_WEIGHT]);

  // Persist collapsed
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  // Fetch .env defaults
  useEffect(() => {
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    let cancelled = false;
    fetch("/api/config", { headers: { Authorization: `Bearer ${key}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d.SEMANTIC_CACHE_ENABLED === "undefined") return;
        const fetched: SettingsState = {
          SEMANTIC_CACHE_ENABLED: Number(d.SEMANTIC_CACHE_ENABLED) || 0,
          SEMANTIC_THRESHOLD: Number(d.SEMANTIC_THRESHOLD) || 0.92,
          CACHE_TTL_S: Number(d.CACHE_TTL_S) || 3600,
          EMBEDDING_MODEL: String(d.EMBEDDING_MODEL || DEFAULTS.EMBEDDING_MODEL).split(",")[0],
          EMBEDDING_FALLBACKS: String(d.EMBEDDING_FALLBACKS || DEFAULTS.EMBEDDING_FALLBACKS),
          SEMANTIC_CACHE_MAX_MEM: Number(d.SEMANTIC_CACHE_MAX_MEM) || 1000,
          SEMANTIC_CACHE_SCAN_CAP: Number(d.SEMANTIC_CACHE_SCAN_CAP) || 200,
          COMPRESSION_ENABLED: Number(d.COMPRESSION_ENABLED) || 0,
          COMPRESSION_MAX_TOKENS: Number(d.COMPRESSION_MAX_TOKENS) || 4096,
          COST_ROUTING_ENABLED: Number(d.COST_ROUTING_ENABLED) || 0,
          COST_WEIGHT: Number(d.COST_WEIGHT ?? 5),
          LATENCY_WEIGHT: Number(d.LATENCY_WEIGHT ?? 0.0005),
          HEADROOM_WEIGHT: Number(d.HEADROOM_WEIGHT ?? 0.3),
          SUCCESS_WEIGHT: Number(d.SUCCESS_WEIGHT ?? 2),
          ANALYTICS_RETENTION_DAYS: Number(d.ANALYTICS_RETENTION_DAYS) || 30,
          PROVIDER_TIMEOUT_MS: Number(d.PROVIDER_TIMEOUT_MS) || 25000,
          PROVIDER_TIMEOUT_AUTO_MS: Number(d.PROVIDER_TIMEOUT_AUTO_MS) || 8000,
          PROVIDER_TIMEOUT_REASONING_MS: Number(d.PROVIDER_TIMEOUT_REASONING_MS) || 35000,
          PROVIDER_PARALLEL_AUTO: Number(d.PROVIDER_PARALLEL_AUTO) || 3,
          PROVIDER_PARALLEL_DEFAULT: Number(d.PROVIDER_PARALLEL_DEFAULT) || 2,
          CIRCUIT_BREAKER_THRESHOLD: Number(d.CIRCUIT_BREAKER_THRESHOLD) || 5,
          CIRCUIT_BREAKER_COOLDOWN_MS: Number(d.CIRCUIT_BREAKER_COOLDOWN_MS) || 30000,
          WEB_TOOLS_ENABLED: Number(d.WEB_TOOLS_ENABLED) || 0,
          WEB_SEARCH_PROVIDER: String(d.WEB_SEARCH_PROVIDER || "tavily"),
          WEB_FETCH_TIMEOUT_MS: Number(d.WEB_FETCH_TIMEOUT_MS) || 8000,
          WEB_FETCH_MAX_BYTES: Number(d.WEB_FETCH_MAX_BYTES) || 500000,
          WEB_SEARCH_MAX_RESULTS: Number(d.WEB_SEARCH_MAX_RESULTS) || 5,
          WEB_TOOLS_MAX_ITERATIONS: Number(d.WEB_TOOLS_MAX_ITERATIONS) || 3,
          WEB_CACHE_TTL_S: Number(d.WEB_CACHE_TTL_S) || 3600,
          FALLBACK_TIERS: normalizeTiersString(String(d.FALLBACK_TIERS || DEFAULT_TIER_JSON)),
        };
        setEnvDefaults(fetched);
        const stored = loadStored();
        if (!stored) {
          setForm(fetched);
          setTiersText(fetched.FALLBACK_TIERS);
          setSource(".env");
        } else {
          setSource("localStorage");
          if (stored.FALLBACK_TIERS) setTiersText(normalizeTiersString(stored.FALLBACK_TIERS));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setTiersText(form.FALLBACK_TIERS);
  }, [form.FALLBACK_TIERS]);

  // Validate on change
  useEffect(() => {
    setValidationErrors(validateSettings(form));
  }, [form]);

  // beforeunload cleanup
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) window.clearTimeout(savedTimeoutRef.current);
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      if (copyEnvTimeoutRef.current) window.clearTimeout(copyEnvTimeoutRef.current);
      if (copyDiffTimeoutRef.current) window.clearTimeout(copyDiffTimeoutRef.current);
    };
  }, []);

  // cache stats polling
  const fetchCacheStats = useCallback(async () => {
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    setCacheLoading(true);
    setCacheError(null);
    try {
      const r = await fetch("/api/cache/stats", { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setCacheStats(d);
    } catch (e) {
      setCacheError((e as Error).message);
    } finally {
      setCacheLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchCacheStats();
    const id = window.setInterval(fetchCacheStats, 30000);
    return () => window.clearInterval(id);
  }, [fetchCacheStats]);

  const update = useCallback((patch: Partial<SettingsState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch } as SettingsState;
      // normalize tiers if touched
      if (patch.FALLBACK_TIERS !== undefined) {
        next.FALLBACK_TIERS = normalizeTiersString(String(patch.FALLBACK_TIERS));
      }
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const errs = validateSettings(form);
    if (errs.length > 0) {
      setValidationErrors(errs);
      setApplyMsg(`❌ Validation failed: ${errs.join(", ")}`);
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 5000);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SAVED_KEY, now);
      setLastSaved(now);
      setSource("localStorage");
      setIsDirty(false);
      setSaved(true);
      if (savedTimeoutRef.current) window.clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setApplyMsg(`❌ Save failed: ${(e as Error).message}`);
    }
  }, [form]);

  const handleApplyToServer = useCallback(async () => {
    const errs = validateSettings(form);
    if (errs.length > 0) {
      setValidationErrors(errs);
      setApplyMsg(`❌ Validation failed: ${errs.join(", ")}`);
      return;
    }
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    setApplying(true);
    setApplyMsg(null);
    if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { data = { error: await res.text().catch(() => res.statusText) } as Record<string, unknown>; }
      if (!res.ok) {
        const msg = (data.errors as string[] | undefined)?.join(", ") || (data.error as string) || res.statusText;
        setApplyMsg(`❌ ${msg}`);
      } else {
        setApplyMsg(`✅ Applied ${String((data.updated as number) || 0)} keys in-memory. ${String(data.message || "")}`);
        // atomic: also persist to localStorage now
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
          const now = new Date().toISOString();
          localStorage.setItem(LAST_SAVED_KEY, now);
          setLastSaved(now);
          setSource("localStorage");
          setIsDirty(false);
        } catch { /* ignore */ }
      }
    } catch (e) {
      setApplyMsg(`❌ ${(e as Error).message}`);
    } finally {
      setApplying(false);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 6000);
    }
  }, [form]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_SAVED_KEY);
    setForm({ ...envDefaults });
    setTiersText(normalizeTiersString(envDefaults.FALLBACK_TIERS));
    setSource(".env");
    setIsDirty(false);
    setLastSaved(null);
    setValidationErrors([]);
    setApplyMsg(null);
  }, [envDefaults]);

  const handleResetSection = useCallback((keys: (keyof SettingsState)[]) => {
    const patch: Partial<SettingsState> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = (envDefaults as unknown as Record<string, unknown>)[k];
    setForm((prev) => ({ ...prev, ...patch }));
    if (keys.includes("FALLBACK_TIERS")) setTiersText(normalizeTiersString(envDefaults.FALLBACK_TIERS));
    setIsDirty(true);
  }, [envDefaults]);

  const handlePreset = useCallback((name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    // normalize tiers if preset contains it
    const normalized = p.FALLBACK_TIERS ? { ...p, FALLBACK_TIERS: normalizeTiersString(String(p.FALLBACK_TIERS)) } : p;
    update(normalized);
  }, [update]);

  const envSnippetFull = useMemo(() => `SEMANTIC_CACHE_ENABLED=${form.SEMANTIC_CACHE_ENABLED}
SEMANTIC_THRESHOLD=${form.SEMANTIC_THRESHOLD}
CACHE_TTL_S=${form.CACHE_TTL_S}
EMBEDDING_MODEL=${form.EMBEDDING_MODEL}
EMBEDDING_FALLBACKS=${form.EMBEDDING_FALLBACKS}
SEMANTIC_CACHE_MAX_MEM=${form.SEMANTIC_CACHE_MAX_MEM}
SEMANTIC_CACHE_SCAN_CAP=${form.SEMANTIC_CACHE_SCAN_CAP}
COMPRESSION_ENABLED=${form.COMPRESSION_ENABLED}
COMPRESSION_MAX_TOKENS=${form.COMPRESSION_MAX_TOKENS}
COST_ROUTING_ENABLED=${form.COST_ROUTING_ENABLED}
COST_WEIGHT=${form.COST_WEIGHT}
LATENCY_WEIGHT=${form.LATENCY_WEIGHT}
HEADROOM_WEIGHT=${form.HEADROOM_WEIGHT}
SUCCESS_WEIGHT=${form.SUCCESS_WEIGHT}
ANALYTICS_RETENTION_DAYS=${form.ANALYTICS_RETENTION_DAYS}
PROVIDER_TIMEOUT_MS=${form.PROVIDER_TIMEOUT_MS}
PROVIDER_TIMEOUT_AUTO_MS=${form.PROVIDER_TIMEOUT_AUTO_MS}
PROVIDER_TIMEOUT_REASONING_MS=${form.PROVIDER_TIMEOUT_REASONING_MS}
PROVIDER_PARALLEL_AUTO=${form.PROVIDER_PARALLEL_AUTO}
PROVIDER_PARALLEL_DEFAULT=${form.PROVIDER_PARALLEL_DEFAULT}
CIRCUIT_BREAKER_THRESHOLD=${form.CIRCUIT_BREAKER_THRESHOLD}
CIRCUIT_BREAKER_COOLDOWN_MS=${form.CIRCUIT_BREAKER_COOLDOWN_MS}
WEB_TOOLS_ENABLED=${form.WEB_TOOLS_ENABLED}
WEB_SEARCH_PROVIDER=${form.WEB_SEARCH_PROVIDER}
WEB_FETCH_TIMEOUT_MS=${form.WEB_FETCH_TIMEOUT_MS}
WEB_FETCH_MAX_BYTES=${form.WEB_FETCH_MAX_BYTES}
WEB_SEARCH_MAX_RESULTS=${form.WEB_SEARCH_MAX_RESULTS}
WEB_TOOLS_MAX_ITERATIONS=${form.WEB_TOOLS_MAX_ITERATIONS}
WEB_CACHE_TTL_S=${form.WEB_CACHE_TTL_S}
FALLBACK_TIERS=${form.FALLBACK_TIERS}`, [form]);

  const envSnippetDiff = useMemo(() => diffKeys.map((k) => `${k}=${form[k]}`).join("\n") || "# no changes vs .env", [diffKeys, form]);

  const envSnippet = showSnippetDiffOnly ? envSnippetDiff : envSnippetFull;

  const handleCopyEnv = useCallback(async () => {
    const ok = await copyWithFallback(envSnippet);
    if (ok) {
      setCopiedEnv(true);
      if (copyEnvTimeoutRef.current) window.clearTimeout(copyEnvTimeoutRef.current);
      copyEnvTimeoutRef.current = window.setTimeout(() => setCopiedEnv(false), 2000);
    } else {
      setApplyMsg("❌ Clipboard failed - copy manually");
    }
  }, [envSnippet]);
  const handleCopyDiff = useCallback(async () => {
    const ok = await copyWithFallback(envSnippetDiff);
    if (ok) {
      setCopiedDiff(true);
      if (copyDiffTimeoutRef.current) window.clearTimeout(copyDiffTimeoutRef.current);
      copyDiffTimeoutRef.current = window.setTimeout(() => setCopiedDiff(false), 2000);
    }
  }, [envSnippetDiff]);
  const handleDownload = useCallback(() => {
    const blob = new Blob([envSnippet], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = showSnippetDiffOnly ? "gateway.diff.env" : "gateway.env.patch";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [envSnippet, showSnippetDiffOnly]);
  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gatewaySettings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [form]);
  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON must be object");
        // allow both stringified tiers and array
        if (Array.isArray(parsed.FALLBACK_TIERS)) parsed.FALLBACK_TIERS = JSON.stringify(parsed.FALLBACK_TIERS);
        const next = { ...DEFAULTS, ...parsed } as SettingsState;
        if (typeof next.FALLBACK_TIERS === "string") next.FALLBACK_TIERS = normalizeTiersString(next.FALLBACK_TIERS);
        const errs = validateSettings(next);
        if (errs.length > 0) {
          setApplyMsg(`❌ Import validation failed: ${errs.slice(0, 3).join(", ")}`);
          if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
          applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 5000);
          return;
        }
        setForm(next);
        setTiersText(next.FALLBACK_TIERS);
        setIsDirty(true);
        setValidationErrors([]);
        setApplyMsg("✅ Imported JSON - review then Save/Apply");
        if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
        applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 4000);
      } catch (err) {
        setApplyMsg(`❌ Invalid JSON: ${(err as Error).message}`);
        if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
        applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 4000);
      }
    };
    reader.onerror = () => setApplyMsg("❌ File read failed");
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  // embedding check helpers
  const checkOneEmbedding = useCallback(async (model: string, setStatus: (s: "checking" | "ok" | "error") => void) => {
    const m = model.trim();
    if (!m) { setStatus("error"); return; }
    setStatus("checking");
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ctrl = new AbortController();
    try {
      timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, input: "hello" }),
        signal: ctrl.signal,
      });
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);
  const checkPrimary = useCallback(() => checkOneEmbedding(form.EMBEDDING_MODEL, (s) => setEmbStatus(s)), [form.EMBEDDING_MODEL, checkOneEmbedding]);
  const checkFallbacks = useCallback(async () => {
    const list = form.EMBEDDING_FALLBACKS.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    const init: Record<string, "checking" | "ok" | "error"> = {};
    list.forEach((m) => (init[m] = "checking"));
    setFallbackStatuses(init);
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    const results = await Promise.all(
      list.map(async (m) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const res = await fetch("/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: m, input: "hello" }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          return { m, ok: res.ok } as const;
        } catch {
          clearTimeout(timer);
          return { m, ok: false } as const;
        }
      })
    );
    setFallbackStatuses((prev) => {
      const next = { ...prev };
      for (const { m, ok } of results) next[m] = ok ? "ok" : "error";
      return next;
    });
  }, [form.EMBEDDING_FALLBACKS]);

  const handleClearCache = useCallback(async () => {
    if (!confirm("Clear semantic cache? This removes all cached embeddings and completions.")) return;
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    setClearingCache(true);
    try {
      const r = await fetch("/api/cache", { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(txt || `HTTP ${r.status}`);
      }
      await fetchCacheStats();
      setApplyMsg("✅ Cache cleared");
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 3000);
    } catch (e) {
      setApplyMsg(`❌ Clear cache failed: ${(e as Error).message}`);
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 4000);
    } finally {
      setClearingCache(false);
    }
  }, [fetchCacheStats]);

  const handleCompressionPreview = useCallback(async () => {
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    setPreviewLoading(true);
    setPreviewResult(null);
    setPreviewError(null);
    try {
      let messages: unknown;
      try {
        messages = JSON.parse(previewInput);
        if (!Array.isArray(messages)) throw new Error("Must be JSON array");
      } catch (e) {
        setPreviewError((e as Error).message);
        return;
      }
      const res = await fetch("/api/compression/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages, maxTokens: form.COMPRESSION_MAX_TOKENS }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setPreviewResult(d);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewInput, form.COMPRESSION_MAX_TOKENS]);

  const handleTiersSave = useCallback(() => {
    try {
      const parsed = JSON.parse(tiersText);
      if (!Array.isArray(parsed)) throw new Error("Must be array of arrays");
      const cleaned = parsed.map((tier: unknown) => {
        if (!Array.isArray(tier)) throw new Error("Each tier must be array");
        const deduped = [...new Set((tier as unknown[]).filter((x): x is string => typeof x === "string" && (x as string).trim().length > 0).map((x) => (x as string).trim()))].slice(0, 60);
        if (deduped.length === 0) throw new Error("Each tier must have at least one provider");
        return deduped;
      });
      if (cleaned.length === 0) throw new Error("Empty");
      if (cleaned.length > 8) throw new Error("Max 8 tiers");
      const total = cleaned.reduce((a, b) => a + b.length, 0);
      if (total > 200) throw new Error("Total providers exceed 200");
      const json = JSON.stringify(cleaned);
      update({ FALLBACK_TIERS: json });
      setTiersError(null);
      setApplyMsg("✅ Tiers validated & staged - Save/Apply to persist");
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 3000);
    } catch (e) {
      setTiersError((e as Error).message);
    }
  }, [tiersText, update]);

  const handleTiersAddProvider = useCallback(() => {
    const p = newProvider.trim();
    if (!p) return;
    if (!/^[a-z0-9._\-/@]+$/i.test(p)) {
      setTiersError("Provider id invalid: use a-z 0-9 . _ - / @");
      return;
    }
    try {
      const tiers: string[][] = JSON.parse(tiersText);
      if (tiers.length === 0) tiers.push([]);
      // dedupe across all tiers
      const all = new Set(tiers.flat());
      if (all.has(p)) {
        setTiersError(`Provider ${p} already exists`);
        return;
      }
      tiers[0] = [p, ...tiers[0]].slice(0, 60);
      const json = JSON.stringify(tiers);
      setTiersText(json);
      update({ FALLBACK_TIERS: json });
      setNewProvider("");
      setTiersError(null);
    } catch {
      setTiersError("Invalid JSON tiers");
    }
  }, [newProvider, tiersText, update]);

  const handleModelHealthClear = useCallback(async () => {
    if (!confirm("Clear persisted model health (model-health.json)? This removes all 404/410 marks.")) return;
    const key = localStorage.getItem("masterKey") || "fgk-master-dev-key";
    try {
      const r = await fetch("/api/models/health/persisted", { method: "DELETE", headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setApplyMsg("✅ Model health cleared");
    } catch (e) {
      setApplyMsg(`❌ ${(e as Error).message}`);
    } finally {
      if (applyMsgTimeoutRef.current) window.clearTimeout(applyMsgTimeoutRef.current);
      applyMsgTimeoutRef.current = window.setTimeout(() => setApplyMsg(null), 3000);
    }
  }, []);

  // Search: filter sections
  const matchesSearch = useCallback((keywords: string) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return keywords.toLowerCase().includes(q);
  }, [search]);

  const Toggle = useCallback(({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || "toggle"}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); }
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${disabled ? "opacity-50 cursor-not-allowed bg-slate-200" : checked ? "bg-amber-500" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  ), []);

  const Section = useCallback(({ id, title, icon, desc, keywords, children, onResetSection }: { id: string; title: string; icon: React.ReactNode; desc?: string; keywords?: string; children: React.ReactNode; onResetSection?: () => void }) => {
    if (!matchesSearch(`${title} ${desc || ""} ${keywords || ""} ${id}`)) return null;
    const isCollapsed = collapsed[id];
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50/70 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))}
            className="flex items-center gap-2.5 flex-1 text-left"
            aria-expanded={!isCollapsed}
            aria-controls={`section-${id}`}
          >
            <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700">{icon}</span>
            <div>
              <div className="text-sm font-bold text-slate-900">{title}</div>
              {desc && <div className="text-xs text-slate-500">{desc}</div>}
            </div>
          </button>
          <div className="flex items-center gap-1.5">
            {onResetSection && (
              <button type="button" onClick={onResetSection} className="px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-600" title="Reset this section to .env">
                <RotateCcw className="w-3 h-3 inline mr-1" />Reset
              </button>
            )}
            <button type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))} className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200" aria-label={isCollapsed ? "Expand" : "Collapse"}>
              {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
            </button>
          </div>
        </div>
        {!isCollapsed && <div id={`section-${id}`} className="p-5 space-y-4">{children}</div>}
      </div>
    );
  }, [collapsed, matchesSearch]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-slate-700" /> {t("settings.title") || "Settings"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{t("settings.subtitle") || "Gateway runtime flags. Defaults from .env, overrides stored in localStorage."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full border font-semibold ${source === "localStorage" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {source === "localStorage" ? "localStorage" : ".env"} {source === "localStorage" ? t("settings.overridden") : t("settings.default")}
              </span>
              <span className="text-slate-400 hidden sm:inline">{t("settings.hint")}</span>
              {lastSaved && <span className="text-slate-400">• saved {new Date(lastSaved).toLocaleString()}</span>}
              {diffKeys.length > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">{diffKeys.length} modified</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("settings.searchPlaceholder") || "Filter settings... (e.g. cache, timeout, web)"}
                aria-label="Filter settings"
                className="pl-8 pr-8 py-1.5 rounded-lg text-xs border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded" aria-label="Clear filter">
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <select onChange={(e) => handlePreset(e.target.value)} defaultValue="" className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700" aria-label="Presets">
                <option value="" disabled>{t("settings.preset") || "Preset..."}</option>
                <option value="balanced">{t("settings.presetBalanced") || "Balanced"}</option>
                <option value="cheapest">{t("settings.presetCheapest") || "Cheapest"}</option>
                <option value="fastest">{t("settings.presetFastest") || "Fastest"}</option>
                <option value="performance">{t("settings.presetPerformance") || "Performance"}</option>
              </select>
              <button onClick={handleExportJson} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700" title={t("settings.export") || "Export JSON"}>
                <Download className="w-3.5 h-3.5" /> {t("settings.export") || "Export"}
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700" title={t("settings.import") || "Import JSON"}>
                <Upload className="w-3.5 h-3.5" /> {t("settings.import") || "Import"}
              </button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} aria-hidden />
            </div>
            <button onClick={handleReset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
              <RotateCcw className="w-3.5 h-3.5" /> {t("settings.reset") || "Reset to .env"}
            </button>
            <button onClick={handleSave} className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold border shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isDirty ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800" : "bg-white text-slate-500 border-slate-200"} ${validationErrors.length > 0 ? "opacity-70" : ""}`} aria-disabled={validationErrors.length > 0} title={validationErrors.length ? validationErrors.join(", ") : undefined}>
              {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? (t("settings.saved") || "Saved") : (t("settings.save") || "Save to localStorage")}
            </button>
            <button onClick={handleApplyToServer} disabled={applying || validationErrors.length > 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 border border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" title={validationErrors.length ? validationErrors.join(", ") : (t("settings.applyToServer") + " — PUT /api/config hot-reload, no restart")}>
              {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} {applying ? (t("settings.applying") || "Applying...") : (t("settings.applyToServer") || "Apply to server")}
            </button>
          </div>
        </div>
        {validationErrors.length > 0 && (
          <div className="text-xs px-3 py-2 rounded-lg border bg-rose-50 border-rose-200 text-rose-800" role="alert">
            <span className="font-bold">Validation:</span> {validationErrors.join(" • ")}
          </div>
        )}
        {applyMsg && <div className="text-xs px-3 py-2 rounded-lg border bg-slate-50 border-slate-200 font-mono" role="status" aria-live="polite">{applyMsg}</div>}
      </div>

      {/* Cache live stats banner - pretty */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              {t("settings.cacheLive") || "Cache Live"} <HelpTip text={t("settings.cacheLiveDesc") || "Live semantic cache status — requires admin MASTER_KEY"} /> <span className={`w-2 h-2 rounded-full ${cacheStats?.enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} aria-label={cacheStats?.enabled ? "enabled" : "disabled"} />
              {cacheError && <span className="text-xs font-normal text-rose-300">• {cacheError}</span>}
            </div>
            <div className="text-xs text-slate-300 flex flex-wrap gap-2 mt-0.5">
              {cacheLoading ? <span className="text-slate-400">loading...</span> : cacheStats ? (
                <>
                  <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheHits") || "hits"}>{cacheStats.hits ?? 0} {t("settings.cacheHits") || "hits"}</span>
                  <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheMisses") || "misses"}>{cacheStats.misses ?? 0} {t("settings.cacheMisses") || "misses"}</span>
                  <span className="font-mono bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-500/30" title={t("settings.cacheHitRate") || "hit rate"}>{typeof cacheStats.hitRate === "number" ? `${(cacheStats.hitRate * 100).toFixed(1)}%` : "—"} {t("settings.cacheHitRate") || "hit rate"}</span>
                  <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded" title={t("settings.cacheSize") || "entries"}>{cacheStats.size ?? 0} {t("settings.cacheSize") || "entries"}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${cacheStats.enabled ? "bg-emerald-500 text-white" : "bg-slate-600 text-slate-200"}`}>{cacheStats.enabled ? "enabled" : "disabled"}</span>
                </>
              ) : <span className="text-slate-400">No stats yet — call /api/cache/stats</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={fetchCacheStats} disabled={cacheLoading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 hover:bg-slate-100 border flex items-center gap-1.5 disabled:opacity-50" title="GET /api/cache/stats — requires admin">
            <RefreshCw className={`w-3.5 h-3.5 ${cacheLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={handleClearCache} disabled={clearingCache} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 border border-rose-700 flex items-center gap-1.5 disabled:opacity-50" title={t("settings.clearCacheConfirm") || "Clear semantic cache"}>
            <Trash2 className="w-3.5 h-3.5" /> {clearingCache ? "Clearing..." : (t("settings.clearCache") || "Clear Cache")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Single column — all sections stacked */}
        <div className="space-y-6">
          <Section id="semantic" title={t("settings.semanticCache") || "Semantic Cache"} icon={<Layers className="w-4 h-4" />} desc={t("settings.enabledOnlyIf") as string} keywords="semantic cache threshold ttl embedding" onResetSection={() => handleResetSection(["SEMANTIC_CACHE_ENABLED","SEMANTIC_THRESHOLD","CACHE_TTL_S","EMBEDDING_MODEL","EMBEDDING_FALLBACKS","SEMANTIC_CACHE_MAX_MEM","SEMANTIC_CACHE_SCAN_CAP"])}>
            <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("SEMANTIC_CACHE_ENABLED") ? "border-amber-300 bg-amber-50/50" : "border-transparent"}`}>
              <div>
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  {t("settings.semanticEnabled")} {isModified("SEMANTIC_CACHE_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" aria-label="modified" />}
                </div>
                <div className="text-xs text-slate-500">{t("settings.semanticEnabledDesc")}</div>
              </div>
              <Toggle checked={!!form.SEMANTIC_CACHE_ENABLED} onChange={(v) => update({ SEMANTIC_CACHE_ENABLED: v ? 1 : 0 })} label="SEMANTIC_CACHE_ENABLED" />
            </div>

            <div className={`p-3 rounded-lg border ${isModified("SEMANTIC_THRESHOLD") ? "border-amber-300 bg-amber-50/30" : "border-slate-100 bg-slate-50/50"}`}>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                {t("settings.threshold")} <span className="font-normal text-slate-500">(0.0-1.0)</span> <HelpTip text={t("settings.thresholdDesc") || "Cosine threshold 0.92 recommended for cohere/embed-english-v3.0 — higher = stricter, fewer false hits"} />
                {isModified("SEMANTIC_THRESHOLD") && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">modified</span>}
              </label>
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={0.7} max={0.99} step={0.01} value={form.SEMANTIC_THRESHOLD} onChange={(e) => update({ SEMANTIC_THRESHOLD: parseFloat(e.target.value) || 0.92 })} className="flex-1 accent-amber-500" aria-label="SEMANTIC_THRESHOLD slider" />
                <input type="number" step="0.01" min={0} max={1} value={form.SEMANTIC_THRESHOLD} onChange={(e) => update({ SEMANTIC_THRESHOLD: parseFloat(e.target.value) || 0 })} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" aria-label="SEMANTIC_THRESHOLD input" />
              </div>
              <p className="text-xs text-slate-400 mt-1">{t("settings.thresholdDesc")} • Recommended 0.92 <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" title="recommended" /></p>
            </div>

            <div className={`${isModified("CACHE_TTL_S") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                {t("settings.ttl")} <HelpTip text={t("settings.ttlDesc") || "TTL seconds (3600 = 1 hour) — cap 7 days"} /> {isModified("CACHE_TTL_S") && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">modified</span>}
              </label>
              <input type="number" min={60} max={604800} value={form.CACHE_TTL_S} onChange={(e) => update({ CACHE_TTL_S: parseInt(e.target.value) || 3600 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" aria-label="CACHE_TTL_S" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[{ label: "1h", v: 3600 }, { label: "6h", v: 21600 }, { label: "24h", v: 86400 }, { label: "7d", v: 604800 }].map((p) => (
                  <button key={p.label} type="button" onClick={() => update({ CACHE_TTL_S: p.v })} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${form.CACHE_TTL_S === p.v ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200 hover:bg-slate-50"}`} aria-pressed={form.CACHE_TTL_S === p.v}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">{t("settings.ttlDesc")} • cap 7d</p>
            </div>

            <div className={`border rounded-lg p-3 ${isModified("SEMANTIC_CACHE_MAX_MEM") || isModified("SEMANTIC_CACHE_SCAN_CAP") ? "border-amber-300 bg-amber-50/20" : "border-slate-100 bg-slate-50/30"}`}>
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced Cache <HelpTip text="Tuning for Redis/in-memory scan — higher = more accurate but slower. Scope: System" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">MAX_MEM (100..10000)</label>
                  <input type="number" min={100} max={10000} value={form.SEMANTIC_CACHE_MAX_MEM} onChange={(e) => update({ SEMANTIC_CACHE_MAX_MEM: parseInt(e.target.value) || 1000 })} className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-mono ${isModified("SEMANTIC_CACHE_MAX_MEM") ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} aria-label="SEMANTIC_CACHE_MAX_MEM" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">SCAN_CAP (10..1000)</label>
                  <input type="number" min={10} max={1000} value={form.SEMANTIC_CACHE_SCAN_CAP} onChange={(e) => update({ SEMANTIC_CACHE_SCAN_CAP: parseInt(e.target.value) || 200 })} className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm font-mono ${isModified("SEMANTIC_CACHE_SCAN_CAP") ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} aria-label="SEMANTIC_CACHE_SCAN_CAP" />
                </div>
              </div>
            </div>

            <div className={`${isModified("EMBEDDING_MODEL") ? "border-amber-300" : "border-slate-200"} border rounded-lg p-3`}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  {t("settings.embeddingModel")} {isModified("EMBEDDING_MODEL") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </label>
                <button type="button" onClick={checkPrimary} disabled={embStatus === "checking"} className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${embStatus === "ok" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : embStatus === "error" ? "bg-red-50 border-red-300 text-red-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"} ${embStatus === "checking" ? "opacity-70" : ""}`} aria-live="polite">
                  {embStatus === "checking" ? (t("settings.checking") || "Checking...") : embStatus === "ok" ? "✓ OK" : embStatus === "error" ? "✗ Fail" : (t("settings.check") || "Check")}
                </button>
              </div>
              <input type="text" value={form.EMBEDDING_MODEL} onChange={(e) => { update({ EMBEDDING_MODEL: e.target.value }); setEmbStatus("idle"); }} className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 ${embStatus === "ok" ? "border-green-500 ring-green-500 bg-green-50/30" : embStatus === "error" ? "border-red-500 ring-red-500 bg-red-50/30" : "border-slate-200 focus:ring-amber-500"}`} aria-label="EMBEDDING_MODEL" />
              <p className="text-xs text-slate-400 mt-1">{t("settings.embeddingFallbackDesc")}</p>
            </div>

            <div className={`${isModified("EMBEDDING_FALLBACKS") ? "border-amber-300" : "border-slate-200"} border rounded-lg p-3`}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  {t("settings.embeddingFallbacks")} <span className="font-normal text-slate-500">(comma-separated)</span>
                </label>
                <button type="button" onClick={checkFallbacks} className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-white border-slate-200 text-slate-700 hover:bg-slate-50">
                  {Object.values(fallbackStatuses).some((v) => v === "checking") ? (t("settings.checking") || "Checking...") : (t("settings.check") || "Check")}
                </button>
              </div>
              <input type="text" value={form.EMBEDDING_FALLBACKS} onChange={(e) => { update({ EMBEDDING_FALLBACKS: e.target.value }); setFallbackStatuses({}); }} className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 ${Object.keys(fallbackStatuses).length > 0 && Object.values(fallbackStatuses).every((v) => v === "ok") ? "border-green-500 ring-green-500 bg-green-50/30" : Object.values(fallbackStatuses).some((v) => v === "error") ? "border-red-500 ring-red-500 bg-red-50/30" : "border-slate-200 focus:ring-amber-500"}`} placeholder="nvidia-nim/nvidia/nv-embed-v1,cloudflare-..." aria-label="EMBEDDING_FALLBACKS" />
              {Object.keys(fallbackStatuses).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2" role="status" aria-live="polite">
                  {form.EMBEDDING_FALLBACKS.split(",").map((s) => s.trim()).filter(Boolean).map((m) => {
                    const st = fallbackStatuses[m] || "idle";
                    return (
                      <span key={m} className={`px-2 py-0.5 rounded-full text-xs font-mono border ${st === "ok" ? "bg-green-50 border-green-300 text-green-700" : st === "error" ? "bg-red-50 border-red-300 text-red-700" : st === "checking" ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                        {m} {st === "ok" ? "✓" : st === "error" ? "✗" : st === "checking" ? "…" : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          <Section id="routing" title={t("settings.compressionRouting") || "Compression & Routing"} icon={<Zap className="w-4 h-4" />} keywords="compression cost routing weight" onResetSection={() => handleResetSection(["COMPRESSION_ENABLED","COMPRESSION_MAX_TOKENS","COST_ROUTING_ENABLED","COST_WEIGHT","LATENCY_WEIGHT","HEADROOM_WEIGHT","SUCCESS_WEIGHT"])}>
            <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("COMPRESSION_ENABLED") ? "border-amber-300 bg-amber-50/50" : "border-slate-100 bg-slate-50/50"}`}>
              <div>
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  {t("settings.compressionEnabled")} {isModified("COMPRESSION_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </div>
                <div className="text-xs text-slate-500">{t("settings.compressionDesc")}</div>
              </div>
              <Toggle checked={!!form.COMPRESSION_ENABLED} onChange={(v) => update({ COMPRESSION_ENABLED: v ? 1 : 0 })} label="COMPRESSION_ENABLED" />
            </div>

            <div className={`p-3 rounded-lg border ${isModified("COMPRESSION_MAX_TOKENS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"}`}>
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>COMPRESSION_MAX_TOKENS (512..32000)</span>
                <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded border">{form.COMPRESSION_MAX_TOKENS}</span>
              </label>
              <input type="range" min={512} max={32000} step={512} value={form.COMPRESSION_MAX_TOKENS} onChange={(e) => update({ COMPRESSION_MAX_TOKENS: parseInt(e.target.value) || 4096 })} className="w-full mt-2 accent-amber-500" aria-label="COMPRESSION_MAX_TOKENS" />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>512</span>
                <span>16k</span>
                <span>32k</span>
              </div>
            </div>

            <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("COST_ROUTING_ENABLED") ? "border-amber-300 bg-amber-50/50" : "border-slate-100 bg-slate-50/50"}`}>
              <div>
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  {t("settings.costEnabled")} {isModified("COST_ROUTING_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </div>
                <div className="text-xs text-slate-500">{t("settings.costDesc")}</div>
              </div>
              <Toggle checked={!!form.COST_ROUTING_ENABLED} onChange={(v) => update({ COST_ROUTING_ENABLED: v ? 1 : 0 })} label="COST_ROUTING_ENABLED" />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/30">
              <div className="text-xs font-bold text-slate-700">Cost Router Weights • <span className="font-mono font-normal text-slate-500">{costPreview}</span></div>
              {([
                { k: "COST_WEIGHT" as const, label: "COST_WEIGHT", min: 0, max: 10, step: 0.5, range: "0..10" },
                { k: "LATENCY_WEIGHT" as const, label: "LATENCY_WEIGHT", min: 0, max: 0.005, step: 0.0001, range: "0..0.005" },
                { k: "HEADROOM_WEIGHT" as const, label: "HEADROOM_WEIGHT", min: 0, max: 1, step: 0.05, range: "0..1" },
                { k: "SUCCESS_WEIGHT" as const, label: "SUCCESS_WEIGHT", min: 0, max: 5, step: 0.5, range: "0..5" },
              ] as const).map((w) => (
                <div key={w.k} className={`${isModified(w.k) ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"} border rounded-lg p-2.5`}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      {w.label} <span className="font-normal text-slate-400">({w.range})</span> {isModified(w.k) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </label>
                    <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded border">{form[w.k]}</span>
                  </div>
                  <input type="range" min={w.min} max={w.max} step={w.step} value={form[w.k]} onChange={(e) => update({ [w.k]: parseFloat(e.target.value) } as Partial<SettingsState>)} className="w-full mt-1 accent-amber-500" aria-label={w.label} />
                </div>
              ))}
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5" /> Compression Preview • POST /api/compression/preview <span className="font-normal text-slate-400">(7 msgs sample triggers compression)</span>
              </div>
              <textarea value={previewInput} onChange={(e) => setPreviewInput(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" placeholder='[{"role":"user","content":"hello"}]' aria-label="Compression preview input" />
              {previewError && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1" role="alert">{previewError}</div>}
              <button type="button" onClick={handleCompressionPreview} disabled={previewLoading} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5">
                {previewLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Preview
              </button>
              {previewResult && (
                <pre className="text-xs font-mono bg-slate-900 text-emerald-200 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap break-all" role="status">
                  {JSON.stringify(previewResult, null, 2)}
                </pre>
              )}
            </div>
          </Section>
        </div>

        {/* Right col */}
        <div className="space-y-6">
          <Section id="reliability" title="Reliability & Timeouts" icon={<ShieldAlert className="w-4 h-4" />} desc="Provider timeout, parallel auto, circuit breaker" keywords="timeout parallel breaker" onResetSection={() => handleResetSection(["PROVIDER_TIMEOUT_MS","PROVIDER_TIMEOUT_AUTO_MS","PROVIDER_TIMEOUT_REASONING_MS","PROVIDER_PARALLEL_AUTO","PROVIDER_PARALLEL_DEFAULT","CIRCUIT_BREAKER_THRESHOLD","CIRCUIT_BREAKER_COOLDOWN_MS"])}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`${isModified("PROVIDER_TIMEOUT_MS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">PROVIDER_TIMEOUT_MS (1k..120k)</label>
                <input type="number" min={1000} max={120000} value={form.PROVIDER_TIMEOUT_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_MS: parseInt(e.target.value) || 25000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_MS" />
              </div>
              <div className={`${isModified("PROVIDER_TIMEOUT_AUTO_MS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">PROVIDER_TIMEOUT_AUTO_MS (1k..30k) <span className="font-normal text-slate-400">rec ≥12k</span></label>
                <input type="number" min={1000} max={30000} value={form.PROVIDER_TIMEOUT_AUTO_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_AUTO_MS: parseInt(e.target.value) || 12000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_AUTO_MS" />
              </div>
              <div className={`${isModified("PROVIDER_TIMEOUT_REASONING_MS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">PROVIDER_TIMEOUT_REASONING_MS (1k..120k) <span className="font-normal text-amber-600">rec ≥60k</span></label>
                <input type="number" min={1000} max={120000} value={form.PROVIDER_TIMEOUT_REASONING_MS} onChange={(e) => update({ PROVIDER_TIMEOUT_REASONING_MS: parseInt(e.target.value) || 60000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" aria-label="PROVIDER_TIMEOUT_REASONING_MS" />
              </div>
              <div className={`${isModified("PROVIDER_PARALLEL_AUTO") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">PROVIDER_PARALLEL_AUTO (1..5)</label>
                <input type="range" min={1} max={5} value={form.PROVIDER_PARALLEL_AUTO} onChange={(e) => update({ PROVIDER_PARALLEL_AUTO: parseInt(e.target.value) || 3 })} className="w-full accent-amber-500 mt-2" aria-label="PROVIDER_PARALLEL_AUTO" />
                <div className="text-xs font-mono text-center bg-slate-100 rounded py-0.5 mt-1">{form.PROVIDER_PARALLEL_AUTO}</div>
              </div>
              <div className={`${isModified("PROVIDER_PARALLEL_DEFAULT") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">PROVIDER_PARALLEL_DEFAULT (1..5)</label>
                <input type="range" min={1} max={5} value={form.PROVIDER_PARALLEL_DEFAULT} onChange={(e) => update({ PROVIDER_PARALLEL_DEFAULT: parseInt(e.target.value) || 2 })} className="w-full accent-amber-500 mt-2" aria-label="PROVIDER_PARALLEL_DEFAULT" />
                <div className="text-xs font-mono text-center bg-slate-100 rounded py-0.5 mt-1">{form.PROVIDER_PARALLEL_DEFAULT}</div>
              </div>
              <div className={`${isModified("CIRCUIT_BREAKER_THRESHOLD") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">CIRCUIT_BREAKER_THRESHOLD (1..100) <span className="font-normal text-slate-400">rec 8</span></label>
                <input type="number" min={1} max={100} value={form.CIRCUIT_BREAKER_THRESHOLD} onChange={(e) => update({ CIRCUIT_BREAKER_THRESHOLD: parseInt(e.target.value) || 8 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" aria-label="CIRCUIT_BREAKER_THRESHOLD" />
              </div>
              <div className={`sm:col-span-2 ${isModified("CIRCUIT_BREAKER_COOLDOWN_MS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">CIRCUIT_BREAKER_COOLDOWN_MS (1k..300k)</label>
                <input type="number" min={1000} max={300000} value={form.CIRCUIT_BREAKER_COOLDOWN_MS} onChange={(e) => update({ CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(e.target.value) || 20000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" aria-label="CIRCUIT_BREAKER_COOLDOWN_MS" />
              </div>
            </div>
            {(form.PROVIDER_TIMEOUT_REASONING_MS < 50000 || form.PROVIDER_TIMEOUT_AUTO_MS < 10000) && (
              <div className="mt-3 flex gap-2 p-3 rounded-lg border bg-amber-50 border-amber-200 text-xs text-amber-900" role="alert">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Dễ 502 với context lớn</div>
                  <p className="mt-1 leading-relaxed">Agnes 3.0 / reasoning với 130k tokens từng timeout 35s trong log. Khuyến nghị <span className="font-mono bg-white px-1 rounded border">REASONING_MS ≥ 60000</span> + <span className="font-mono bg-white px-1 rounded border">AUTO_MS ≥ 12000</span> và bật <span className="font-mono bg-white px-1 rounded border">COMPRESSION_ENABLED</span> (8192 tokens).</p>
                </div>
              </div>
            )}
            {form.CIRCUIT_BREAKER_THRESHOLD <= 5 && (
              <div className="mt-2 flex gap-2 p-3 rounded-lg border bg-rose-50 border-rose-200 text-xs text-rose-800" role="alert">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Circuit breaker quá nhạy</div>
                  <p className="mt-1">Threshold 5 + cooldown 30s khiến 5 timeout liên tiếp (như log agnes) mở breaker 30s → loạt 502 <span className="font-mono bg-white px-1 rounded border">circuit open</span>. Đã nâng default lên 8 / 20s.</p>
                </div>
              </div>
            )}
            {!form.COMPRESSION_ENABLED && (
              <div className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="font-bold">Gợi ý:</span> Log gần đây có request 160k-220k tokens. Bật <span className="font-mono">COMPRESSION_ENABLED</span> để tự động <span className="font-mono">relevanceKeep + codeDedup</span> giảm prompt trước khi gửi upstream, giảm timeout đáng kể.
              </div>
            )}
          </Section>

          <Section id="webtools" title="Web Tools" icon={<Globe className="w-4 h-4" />} desc="Gateway-hosted web_search + web_fetch" keywords="web tools search fetch tavily" onResetSection={() => handleResetSection(["WEB_TOOLS_ENABLED","WEB_SEARCH_PROVIDER","WEB_FETCH_TIMEOUT_MS","WEB_FETCH_MAX_BYTES","WEB_SEARCH_MAX_RESULTS","WEB_TOOLS_MAX_ITERATIONS","WEB_CACHE_TTL_S"])}>
            <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isModified("WEB_TOOLS_ENABLED") ? "border-amber-300 bg-amber-50/50" : "border-slate-100 bg-slate-50/50"}`}>
              <div>
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  WEB_TOOLS_ENABLED {isModified("WEB_TOOLS_ENABLED") && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </div>
                <div className="text-xs text-slate-500">Enable gateway web_search/web_fetch loop</div>
              </div>
              <Toggle checked={!!form.WEB_TOOLS_ENABLED} onChange={(v) => update({ WEB_TOOLS_ENABLED: v ? 1 : 0 })} label="WEB_TOOLS_ENABLED" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`${isModified("WEB_SEARCH_PROVIDER") ? "border-amber-300" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">WEB_SEARCH_PROVIDER</label>
                <select value={form.WEB_SEARCH_PROVIDER} onChange={(e) => update({ WEB_SEARCH_PROVIDER: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white" aria-label="WEB_SEARCH_PROVIDER">
                  <option value="tavily">tavily</option>
                  <option value="brave">brave</option>
                  <option value="serper">serper</option>
                  <option value="jina">jina</option>
                </select>
              </div>
              <div className={`${isModified("WEB_FETCH_TIMEOUT_MS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
                <label className="text-xs font-semibold text-slate-700">FETCH_TIMEOUT_MS (1k..30k)</label>
                <input type="number" min={1000} max={30000} value={form.WEB_FETCH_TIMEOUT_MS} onChange={(e) => update({ WEB_FETCH_TIMEOUT_MS: parseInt(e.target.value) || 8000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono" aria-label="WEB_FETCH_TIMEOUT_MS" />
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-semibold text-slate-700">FETCH_MAX_BYTES (1k..2M)</label>
                <input type="number" min={1000} max={2000000} value={form.WEB_FETCH_MAX_BYTES} onChange={(e) => update({ WEB_FETCH_MAX_BYTES: parseInt(e.target.value) || 500000 })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono" aria-label="WEB_FETCH_MAX_BYTES" />
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-semibold text-slate-700">SEARCH_MAX_RESULTS (1..10)</label>
                <input type="range" min={1} max={10} value={form.WEB_SEARCH_MAX_RESULTS} onChange={(e) => update({ WEB_SEARCH_MAX_RESULTS: parseInt(e.target.value) || 5 })} className="w-full accent-amber-500 mt-2" aria-label="WEB_SEARCH_MAX_RESULTS" />
                <div className="text-xs font-mono text-center bg-slate-100 rounded py-0.5 mt-1">{form.WEB_SEARCH_MAX_RESULTS}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-semibold text-slate-700">MAX_ITERATIONS (1..5)</label>
                <input type="range" min={1} max={5} value={form.WEB_TOOLS_MAX_ITERATIONS} onChange={(e) => update({ WEB_TOOLS_MAX_ITERATIONS: parseInt(e.target.value) || 3 })} className="w-full accent-amber-500 mt-2" aria-label="WEB_TOOLS_MAX_ITERATIONS" />
                <div className="text-xs font-mono text-center bg-slate-100 rounded py-0.5 mt-1">{form.WEB_TOOLS_MAX_ITERATIONS}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <label className="text-xs font-semibold text-slate-700">WEB_CACHE_TTL_S (60..86400)</label>
                <input type="number" min={60} max={86400} value={form.WEB_CACHE_TTL_S} onChange={(e) => update({ WEB_CACHE_TTL_S: parseInt(e.target.value) || 3600 })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono" aria-label="WEB_CACHE_TTL_S" />
              </div>
            </div>
          </Section>

          <Section id="analytics" title={t("settings.analytics") || "Analytics"} icon={<BarChart3 className="w-4 h-4" />} keywords="analytics retention" onResetSection={() => handleResetSection(["ANALYTICS_RETENTION_DAYS"])}>
            <div className={`${isModified("ANALYTICS_RETENTION_DAYS") ? "border-amber-300 bg-amber-50/30" : "border-slate-200"} border rounded-lg p-3`}>
              <label className="text-xs font-semibold text-slate-700">ANALYTICS_RETENTION_DAYS (1..365)</label>
              <input type="range" min={1} max={365} value={form.ANALYTICS_RETENTION_DAYS} onChange={(e) => update({ ANALYTICS_RETENTION_DAYS: parseInt(e.target.value) || 30 })} className="w-full accent-amber-500 mt-2" aria-label="ANALYTICS_RETENTION_DAYS" />
              <div className="flex justify-between text-xs text-slate-500 font-mono">
                <span>1</span>
                <span className="font-bold text-slate-800">{form.ANALYTICS_RETENTION_DAYS} days</span>
                <span>365</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{t("settings.analyticsDesc")}</p>
            </div>
          </Section>

          <Section id="tiers" title="Fallback Tiers" icon={<Layers className="w-4 h-4" />} desc="FALLBACK_TIERS JSON — tier order defines routing priority (max 8 tiers, 200 providers)" keywords="fallback tiers providers routing" onResetSection={() => handleResetSection(["FALLBACK_TIERS"])}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="text" value={newProvider} onChange={(e) => setNewProvider(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleTiersAddProvider(); } }} placeholder="Add provider id (e.g. groq)" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono" aria-label="New provider id" />
                <button type="button" onClick={handleTiersAddProvider} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800">Add to tier 1</button>
              </div>
              <textarea value={tiersText} onChange={(e) => setTiersText(e.target.value)} rows={6} className={`w-full rounded-lg border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 ${tiersError ? "border-red-300 ring-red-500 bg-red-50/30" : isModified("FALLBACK_TIERS") ? "border-amber-300 focus:ring-amber-500 bg-amber-50/20" : "border-slate-200 focus:ring-amber-500"}`} placeholder={DEFAULT_TIER_JSON} aria-label="FALLBACK_TIERS JSON" aria-invalid={!!tiersError} />
              {tiersError && <p className="text-xs text-red-600" role="alert">{tiersError}</p>}
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleTiersSave} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800">
                  Validate & Stage
                </button>
                <button type="button" onClick={() => { const norm = normalizeTiersString(DEFAULT_TIER_JSON); setTiersText(norm); update({ FALLBACK_TIERS: norm }); setTiersError(null); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50">
                  Reset default
                </button>
                <span className="text-xs text-slate-400">JSON array of arrays • deduped, max 60/tier</span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-32 overflow-y-auto" role="list" aria-label="Tiers preview">
                {(() => {
                  try {
                    const tiers: string[][] = JSON.parse(tiersText);
                    const flat = tiers.flat();
                    return flat.map((p: string, idx: number) => {
                      const isPublic = PUBLIC_PROVIDERS_UI.has(p);
                      return (
                        <span key={`${p}-${idx}`} className={`px-2 py-0.5 rounded-full text-xs font-mono border ${isPublic ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200 text-slate-700"}`} title={isPublic ? "public (no key, free fallback)" : "requires API key"} role="listitem">
                          {p} {isPublic ? "• public" : ""}
                        </span>
                      );
                    });
                  } catch {
                    return <span className="text-xs text-slate-400">Invalid JSON</span>;
                  }
                })()}
              </div>
              {(() => {
                try {
                  const tiers: string[][] = JSON.parse(tiersText);
                  const flat = tiers.flat();
                  const publicCount = flat.filter((p) => PUBLIC_PROVIDERS_UI.has(p)).length;
                  const total = flat.length;
                  if (total < 4) return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠️ Pool quá nhỏ ({total} providers) — dễ 502 khi 1 provider timeout. Khuyến nghị ≥6 với ít nhất 2 public (pollinations, llm7-io).</p>;
                  if (publicCount === 0) return <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">💡 Chưa có public fallback (pollinations/llm7-io). Thêm pollinations để không 502 khi hết key.</p>;
                  return <p className="text-xs text-slate-500">{total} providers • {publicCount} public • sẽ filter theo hasRealKey (đã config) khi chạy.</p>;
                } catch { return null; }
              })()}
              <p className="text-xs text-slate-400">Chips xanh = public (giữ lại khi filter), trắng = cần key. Router mới chỉ fallback vào provider đã config + public.</p>
            </div>
          </Section>

          <div className="bg-rose-50 rounded-xl border border-rose-200 p-4">
            <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Danger Zone
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button type="button" onClick={handleClearCache} disabled={clearingCache} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-sm font-semibold text-rose-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Clear Semantic Cache
                </span>
                <span className="text-xs font-normal text-rose-500">DELETE /api/cache</span>
              </button>
              <button type="button" onClick={handleModelHealthClear} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-sm font-semibold text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <span className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Clear Model Health
                </span>
                <span className="text-xs font-normal text-rose-500">DELETE /api/models/health/persisted</span>
              </button>
              <button type="button" onClick={() => { if (!confirm("Reset all Settings to .env defaults and clear localStorage? This cannot be undone.")) return; handleReset(); }} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-sm font-semibold text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Reset localStorage
                </span>
                <span className="text-xs font-normal text-rose-500">Remove gatewaySettings</span>
              </button>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <div className="font-bold">{t("settings.noteTitle")}</div>
                <p className="mt-1">{t("settings.noteDesc")}</p>
                <p className="mt-1 text-amber-700">Tip: Dùng "Apply to server" để hot-reload (PUT /api/config) không cần restart. Sau đó vẫn nên copy snippet vào .env để persist qua reboot.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-slate-200">{t("settings.envSnippet")} </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showSnippetDiffOnly} onChange={(e) => setShowSnippetDiffOnly(e.target.checked)} className="accent-amber-500" aria-label="Show diff only" /> diff only ({diffKeys.length})
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleCopyDiff} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
              {copiedDiff ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedDiff ? (t("settings.copied") || "Copied") : "Copy diff"}
            </button>
            <button type="button" onClick={handleCopyEnv} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
              {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedEnv ? (t("settings.copied") || "Copied") : (t("settings.copy") || "Copy")}
            </button>
            <button type="button" onClick={handleDownload} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </div>
        </div>
        <pre className="text-xs font-mono text-emerald-200 whitespace-pre-wrap break-all bg-slate-800 rounded-lg p-3 border border-slate-700 max-h-64 overflow-y-auto" tabIndex={0} aria-label=".env snippet">{envSnippet}</pre>
      </div>

      {isDirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white px-4 py-2.5 rounded-full shadow-xl border border-slate-700 flex items-center gap-3 text-sm" role="status" aria-live="polite">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />
          <span className="font-semibold">Unsaved changes • {diffKeys.length} fields</span>
          {validationErrors.length > 0 && <span className="text-rose-300 text-xs">• {validationErrors.length} invalid</span>}
          <button type="button" onClick={handleSave} disabled={validationErrors.length > 0} className="ml-2 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50">Save</button>
          <button type="button" onClick={handleApplyToServer} disabled={applying || validationErrors.length > 0} className="px-3 py-1 rounded-full bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold disabled:opacity-50">Apply</button>
          <button type="button" onClick={() => setIsDirty(false)} className="p-1 hover:bg-white/10 rounded-full" aria-label="Dismiss">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}
    </div>
  );
}
