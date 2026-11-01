import { useCallback, useState } from "react";
import { COMPRESSION_SAMPLE } from "../lib/constants";
import { getMasterKey } from "../lib/helpers";
import type { SettingsState } from "../types";

export function useCompressionPreview(form: SettingsState) {
  // P1: compression preview
  const [previewInput, setPreviewInput] = useState(COMPRESSION_SAMPLE);
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleCompressionPreview = useCallback(async () => {
    const key = getMasterKey();
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

  return { previewInput, setPreviewInput, previewResult, previewLoading, previewError, handleCompressionPreview };
}
