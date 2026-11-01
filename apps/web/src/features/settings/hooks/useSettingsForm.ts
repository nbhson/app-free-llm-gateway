import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLLAPSED_KEY, DEFAULTS, DEFAULT_TIER_JSON, LAST_SAVED_KEY, PRESETS, STORAGE_KEY } from "../lib/constants";
import { copyWithFallback, getMasterKey, loadStored, normalizeTiersString, validateSettings } from "../lib/helpers";
import type { SettingsSource, SettingsState } from "../types";

export function useSettingsForm() {
  const [form, setForm] = useState<SettingsState>(() => loadStored() || { ...DEFAULTS });
  const [envDefaults, setEnvDefaults] = useState<SettingsState>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [source, setSource] = useState<SettingsSource>(() => (loadStored() ? "localStorage" : ".env"));
  const [lastSaved, setLastSaved] = useState<string | null>(() => localStorage.getItem(LAST_SAVED_KEY));
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
    const key = getMasterKey();
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
    const key = getMasterKey();
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

  return {
    // state
    form,
    envDefaults,
    isDirty,
    setIsDirty,
    saved,
    copiedEnv,
    copiedDiff,
    source,
    lastSaved,
    showSnippetDiffOnly,
    setShowSnippetDiffOnly,
    applying,
    applyMsg,
    setApplyMsg,
    applyMsgTimeoutRef,
    collapsed,
    setCollapsed,
    validationErrors,
    tiersText,
    setTiersText,
    tiersError,
    setTiersError,
    newProvider,
    setNewProvider,
    // derived
    isModified,
    diffKeys,
    costPreview,
    envSnippet,
    envSnippetDiff,
    // handlers
    update,
    handleSave,
    handleApplyToServer,
    handleReset,
    handleResetSection,
    handlePreset,
    handleCopyEnv,
    handleCopyDiff,
    handleDownload,
    handleExportJson,
    handleImportJson,
    handleTiersSave,
    handleTiersAddProvider,
    // refs
    fileInputRef,
  };
}
