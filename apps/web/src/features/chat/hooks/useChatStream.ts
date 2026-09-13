import { useRef, useCallback, useEffect } from "react";
import { parseSseStream } from "../lib/sse-parser";
import { getMasterKey } from "../lib/storage";
import type { ChatMessage } from "../types";

type UseChatStreamOpts = {
  selectedModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  streamEnabled: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setLastMeta: React.Dispatch<React.SetStateAction<{ provider?: string; model?: string; latencyMs?: number; usage?: unknown } | null>>;
  setError: (e: string | null) => void;
  setIsStreaming: (v: boolean) => void;
};

function getWebToolsFromServer(): boolean {
  try {
    const raw = localStorage.getItem("gatewaySettings");
    if (!raw) return false;
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    return (cfg.WEB_TOOLS_ENABLED === 1 || cfg.WEB_TOOLS_ENABLED === "1" || cfg.WEB_TOOLS_ENABLED === true);
  } catch {
    return false;
  }
}

export function useChatStream(opts: UseChatStreamOpts) {
  const { selectedModel, systemPrompt, temperature, maxTokens, streamEnabled, messages, setMessages, setLastMeta, setError, setIsStreaming } = opts;
  const webToolsEnabled = getWebToolsFromServer();
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<{ pending: string; raf: number | null; targetId: string | null; provider?: string; modelHeader?: string }>({ pending: "", raf: null, targetId: null });

  // Cleanup on unmount — prevents leaked fetch + setState on unmounted
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (throttleRef.current.raf) cancelAnimationFrame(throttleRef.current.raf);
    };
  }, []);

  const flushThrottle = useCallback(() => {
    const t = throttleRef.current;
    if (!t.pending || !t.targetId) return;
    const toApply = t.pending;
    const targetId = t.targetId;
    const provider = t.provider;
    const modelHeader = t.modelHeader;
    t.pending = "";
    t.raf = null;
    setMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content: (m.content || "") + toApply, provider, model: modelHeader } : m)));
    // We store full separately and flush via RAF batching; provider/model already set
  }, [setMessages]);

  const scheduleFlush = useCallback((delta: string, targetId: string, provider?: string, modelHeader?: string) => {
    const t = throttleRef.current;
    t.pending += delta;
    t.targetId = targetId;
    t.provider = provider;
    t.modelHeader = modelHeader;
    if (t.raf == null) {
      t.raf = requestAnimationFrame(() => {
        flushThrottle();
      });
    }
  }, [flushThrottle]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async (inputText: string, pendingAttachments: ChatMessage["attachments"], clearComposer: () => void) => {
    const rawText = inputText.trim();
    if (!rawText && (!pendingAttachments || pendingAttachments.length === 0)) return;
    // Prevent concurrent sends
    if (abortRef.current) return;
    setError(null);

    let finalText = rawText;
    const textFiles = (pendingAttachments || []).filter((a) => a.type === "text");
    if (textFiles.length) {
      finalText += (finalText ? "\n\n" : "") + textFiles.map((f) => `File: ${f.name}\n\`\`\`markdown\n${f.text}\n\`\`\``).join("\n\n");
    }
    const imageAttachments = (pendingAttachments || []).filter((a) => a.type === "image");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: finalText || (imageAttachments.length ? "(image)" : ""),
      attachments: pendingAttachments?.length ? [...pendingAttachments] : undefined,
      createdAt: new Date().toISOString(),
    };
    const assistantId = `a-${Date.now()}`;
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      model: selectedModel,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    clearComposer();
    setIsStreaming(true);

    const mk = getMasterKey();
    if (!mk) {
      setError("Missing MASTER key — set it in header (localStorage.masterKey) or via /api/bootstrap");
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "**Error:** Missing MASTER key", error: "missing key" } : m)));
      setIsStreaming(false);
      return;
    }

    const apiMessages: unknown[] = [];
    if (systemPrompt.trim()) apiMessages.push({ role: "system", content: systemPrompt.trim() });
    for (const m of [...messages, userMsg]) {
      if (m.id === "welcome" || m.id.startsWith("welcome-")) continue;
      const imgs = (m.attachments || []).filter((a) => a.type === "image" && a.dataUrl);
      if (imgs.length && m.role === "user") {
        const parts: unknown[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const im of imgs) parts.push({ type: "image_url", image_url: { url: im.dataUrl } });
        apiMessages.push({ role: m.role, content: parts });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const body: Record<string, unknown> = {
      model: selectedModel,
      messages: apiMessages,
      temperature,
      max_tokens: maxTokens,
      stream: streamEnabled,
    };

    const controller = new AbortController();
    abortRef.current = controller;
    const start = Date.now();
    // Reset throttle buffer
    throttleRef.current.pending = "";
    throttleRef.current.targetId = assistantId;
    if (throttleRef.current.raf) { cancelAnimationFrame(throttleRef.current.raf); throttleRef.current.raf = null; }

    try {
      const res = await fetch(`/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mk}`,
          "Content-Type": "application/json",
          "x-web-tools": webToolsEnabled ? "1" : "0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let msg = txt;
        let hint = "";
        let providerErrors: unknown[] | undefined;
        try {
          const j = JSON.parse(txt);
          msg = j.error?.message || j.error || txt;
          hint = j.error?.hint || "";
          providerErrors = j.error?.provider_errors || j.error?.providerErrors;
          // Append concise provider summary for UX (avoid huge blob)
          if (providerErrors && Array.isArray(providerErrors) && providerErrors.length) {
            const summary = (providerErrors as Array<{ provider?: string; error?: string; status?: number }>)
              .slice(0, 2)
              .map((e) => `${e.provider || "?"}: ${String(e.error || "").slice(0, 160)}${e.status ? ` (${e.status})` : ""}`)
              .join(" | ");
            if (summary && !msg.includes(summary.slice(0, 20))) {
              msg = msg + (msg.endsWith(".") ? " " : " — ") + summary;
            }
          }
          if (hint && !msg.includes(hint.slice(0, 15))) msg = msg + `\n\nGợi ý: ${hint}`;
        } catch { /* ignore */ }
        // Map generic 502 into user-friendly Vietnamese hint if backend didn't provide
        if (!hint && msg.includes("All providers failed") && !msg.includes("Gợi ý")) {
          msg = msg + "\n\nGợi ý: Thử tắt Web Tools trong Settings rồi gửi lại, chọn model khác (ví dụ kiraai/kira-auto, kilo-code/kilo-auto), hoặc đợi 15s rồi gửi lại. Kiểm tra /providers để xem provider nào đang online.";
        }
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const provider = res.headers.get("x-provider") || res.headers.get("X-Provider") || undefined;
      const modelHeader = res.headers.get("x-model") || res.headers.get("X-Model") || selectedModel;

      if (!streamEnabled || !res.body) {
        const data = (await res.json().catch(async () => ({ text: await res.text() }))) as Record<string, unknown>;
        const choices = data.choices as Array<Record<string, unknown>> | undefined;
        const rawChoice = choices?.[0];
        const rawMsg = rawChoice?.message as Record<string, unknown> | undefined;
        let content = "";
        if (rawMsg) {
          if (typeof rawMsg.content === "string") content = rawMsg.content as string;
          else if (Array.isArray(rawMsg.content)) content = (rawMsg.content as Array<Record<string, unknown>>).map((p) => (p.text as string) || (p.content as string) || "").join("");
          else if (rawMsg.content) content = String(rawMsg.content);
          if (!content && rawMsg.reasoning_content) content = String(rawMsg.reasoning_content);
          if (!content && rawMsg.reasoning) content = String(rawMsg.reasoning);
        }
        if (!content) content = (data.content as string) || (data.text as string) || (data.output_text as string) || "";
        if (!content) content = JSON.stringify(data, null, 2);
        const usage = data.usage as Record<string, unknown> | undefined;
        const finishReason = (rawChoice as Record<string, unknown> | undefined)?.finish_reason as string | undefined || (data.finish_reason as string | undefined) || null;
        const isTruncated = finishReason === "length";
        let finalContent = String(content);
        if (isTruncated) {
          finalContent += `\n\n---\n⚠️ *Câu trả lời bị cắt do đạt giới hạn Max Tokens (${maxTokens}). Tăng Max Tokens trong Settings (tối đa 16384) hoặc bấm **Tiếp tục** để sinh tiếp.*`;
        }
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: finalContent, truncated: isTruncated || undefined, provider: (data.provider as string) || provider, model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens as number, completion: usage.completion_tokens as number, total: usage.total_tokens as number } : undefined } : m)));
        setLastMeta({ provider: provider || (data.provider as string), model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, usage });
      } else {
        // Reuse shared SSE parser — DRY, throttle via RAF
        const { full, reasoningFull, error: streamError, finishReason } = await parseSseStream(
          res.body,
          {
            onDelta: (delta) => scheduleFlush(delta, assistantId, provider, modelHeader),
            onUsage: (u) => setLastMeta((p) => ({ ...(p || {}), usage: u })),
            onError: (_msg) => setLastMeta((p) => ({ ...(p || {}), usage: undefined })),
          },
          controller.signal,
        );
        // Flush any pending RAF batch
        if (throttleRef.current.raf) {
          cancelAnimationFrame(throttleRef.current.raf);
          throttleRef.current.raf = null;
        }
        if (throttleRef.current.pending) {
          const pending = throttleRef.current.pending;
          throttleRef.current.pending = "";
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + pending, provider, model: modelHeader } : m)));
        }
        if (streamError) throw new Error(streamError);
        // If only reasoning, show it
        setMessages((prev) => {
          const cur = prev.find((m) => m.id === assistantId);
          if (cur && !cur.content.trim() && reasoningFull.trim()) {
            return prev.map((m) => (m.id === assistantId ? { ...m, content: reasoningFull, provider, model: modelHeader } : m));
          }
          return prev;
        });
        const curContent = full.trim() || reasoningFull.trim();
        if (!curContent) {
          // fallback to non-stream once — with its own AbortController so Stop works
          const fallbackController = new AbortController();
          const prevAbort = abortRef.current;
          abortRef.current = fallbackController;
          try {
            const fallbackRes = await fetch(`/v1/chat/completions`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${mk}`,
                "Content-Type": "application/json",
                "x-web-tools": webToolsEnabled ? "1" : "0",
              },
              body: JSON.stringify({ ...body, stream: false }),
              signal: fallbackController.signal,
            });
            if (fallbackRes.ok) {
              const data = await fallbackRes.json() as Record<string, unknown>;
              const fbChoices = (data.choices as Array<Record<string, unknown>> | undefined);
              const fbChoice = fbChoices?.[0]?.message as Record<string, unknown> | undefined;
              let fbContent = "";
              if (fbChoice) {
                if (typeof fbChoice.content === "string") fbContent = fbChoice.content as string;
                else if (Array.isArray(fbChoice.content)) fbContent = (fbChoice.content as Array<Record<string, unknown>>).map((p) => (p.text as string) || "").join("");
                if (!fbContent) fbContent = (fbChoice.reasoning_content as string) || (fbChoice.reasoning as string) || "";
              }
              if (!fbContent) fbContent = (data.content as string) || (data.text as string) || "";
              if (fbContent) {
                const fbFull = String(fbContent);
                const usage = data.usage as Record<string, unknown> | undefined;
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: fbFull, provider: (data.provider as string) || provider, model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, tokens: usage ? { prompt: usage.prompt_tokens as number, completion: usage.completion_tokens as number, total: usage.total_tokens as number } : undefined } : m)));
                setLastMeta({ provider: provider || (data.provider as string), model: (data.model as string) || modelHeader, latencyMs: Date.now() - start, usage });
              } else {
                throw new Error("Empty response (stream and fallback both empty). Try different model or increase Max Tokens.");
              }
            } else {
              const txt = await fallbackRes.text().catch(() => "");
              let fbMsg = txt.slice(0, 800);
              try {
                const j = JSON.parse(txt);
                const base = j.error?.message || j.error || txt;
                const h = j.error?.hint || "";
                fbMsg = base + (h ? `\nGợi ý: ${h}` : "");
                const pe = j.error?.provider_errors;
                if (pe && Array.isArray(pe) && pe.length) {
                  const sum = (pe as Array<{ provider?: string; error?: string; status?: number }>).slice(0, 1).map((e) => `${e.provider}: ${String(e.error || "").slice(0, 120)}`).join("");
                  if (sum) fbMsg += ` — ${sum}`;
                }
              } catch { /* ignore */ }
              throw new Error(fbMsg || "Empty stream — fallback failed");
            }
          } catch (fbErr: unknown) {
            if ((fbErr as { name?: string })?.name === "AbortError") throw fbErr;
            const msg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            if (msg.includes("Empty response")) throw fbErr;
            throw new Error("Empty response from model (stream returned no content). " + (msg || "Try non-stream or different model / increase Max Tokens."));
          } finally {
            // restore original controller if still fallback one
            if (abortRef.current === fallbackController) abortRef.current = prevAbort;
          }
        } else {
          const latency = Date.now() - start;
          const isTruncated = finishReason === "length";
          if (isTruncated) {
            const notice = `\n\n---\n⚠️ *Câu trả lời bị cắt do đạt giới hạn Max Tokens (${maxTokens}). Tăng Max Tokens trong Settings (tối đa 16384) hoặc bấm **Tiếp tục** để sinh tiếp.*`;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + notice, truncated: true, latencyMs: latency } : m)));
          } else {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, latencyMs: latency } : m)));
          }
          setLastMeta((p) => ({ ...(p || {}), provider, model: modelHeader, latencyMs: latency }));
        }
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || "(stopped)", error: "stopped" } : m)));
      } else {
        const msg = err.message || String(e);
        setError(msg.slice(0, 800));
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: msg ? `**Error:** ${msg}` : m.content, error: msg } : m)));
      }
    } finally {
      if (throttleRef.current.raf) { cancelAnimationFrame(throttleRef.current.raf); throttleRef.current.raf = null; }
      throttleRef.current.pending = "";
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, selectedModel, systemPrompt, temperature, maxTokens, streamEnabled, setMessages, setLastMeta, setError, setIsStreaming, scheduleFlush]);

  const handleContinue = useCallback(() => {
    // Trigger continuation with a short prompt that preserves context
    handleSend("Tiếp tục phần còn thiếu, giữ nguyên format và không lặp lại phần đã trả lời.", [], () => {});
  }, [handleSend]);

  return { handleSend, handleStop, handleContinue, abortRef };
}
