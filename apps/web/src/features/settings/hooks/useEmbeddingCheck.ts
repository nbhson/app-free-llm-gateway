import { useCallback, useState } from "react";
import { getMasterKey } from "../lib/helpers";
import type { CheckStatus, SettingsState } from "../types";

export function useEmbeddingCheck(form: SettingsState) {
  // embedding check
  const [embStatus, setEmbStatus] = useState<CheckStatus>("idle");
  const [fallbackStatuses, setFallbackStatuses] = useState<Record<string, CheckStatus>>({});

  const checkOneEmbedding = useCallback(async (model: string, setStatus: (s: "checking" | "ok" | "error") => void) => {
    const m = model.trim();
    if (!m) { setStatus("error"); return; }
    setStatus("checking");
    const key = getMasterKey();
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
    const key = getMasterKey();
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

  return { embStatus, setEmbStatus, fallbackStatuses, setFallbackStatuses, checkPrimary, checkFallbacks };
}
