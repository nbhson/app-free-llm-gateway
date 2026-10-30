import { useEffect, useState } from "react";
import { Copy, Check, Key, Trash2, ShieldCheck, Dices, Terminal, ShieldAlert, ChevronDown } from "lucide-react";
import { useLang } from "../lib/i18n.tsx";
import type { VirtualKeyView } from "../lib/api-types.ts";
function mk() { return localStorage.getItem("masterKey") || "fgk-master-dev-key"; }
function randHex(bytes: number) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join(""); }

export default function Keys() {
  const { t } = useLang();
  const [keys, setKeys] = useState<VirtualKeyView[]>([]);
  const [name, setName] = useState("my-app");
  const [scopes, setScopes] = useState('{"models":["*"],"providers":["*"]}');
  const [rpm, setRpm] = useState("60");
  const [lastCreated, setLastCreated] = useState<VirtualKeyView | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(true);

  const load = () => { fetch("/api/keys", { headers: { Authorization: `Bearer ${mk()}` } }).then((r) => r.json()).then((d) => setKeys(d.data || [])).catch(() => {}); };
  useEffect(() => { load(); }, []);
  const create = async () => {
    let sc: { models?: string[]; providers?: string[] }; try { sc = JSON.parse(scopes); } catch { alert("scopes JSON invalid"); return; }
    const res = await fetch("/api/keys", { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes: sc, rpmLimit: parseInt(rpm, 10) }) });
    const data = await res.json(); if (!res.ok) alert(JSON.stringify(data)); else { setLastCreated(data); load(); }
  };
  const del = async (id: string) => { if (!confirm(`Delete ${id}?`)) return; await fetch(`/api/keys/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${mk()}` } }); load(); };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-heading">{t("keys.title")} <span className="text-sm font-mono bg-primary text-primary-ink px-2.5 py-0.5 rounded-full">{keys.length}</span></h1>
        <p className="text-sm text-mutedtxt mt-0.5">{t("keys.subtitle")}</p>
      </div>

      {/* Step 1 */}
      <div className="bg-surface rounded-xl border border-line/90 shadow-2xs">
        <button type="button" onClick={() => setGenOpen(!genOpen)} className="w-full flex items-center justify-between p-5 text-left">
          <div className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">1</span><div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-ink"><Key className="w-4 h-4" /></div><div><h2 className="text-sm font-bold text-heading">{t("keys.generator_title")}</h2><p className="text-xs text-mutedtxt">{t("keys.generator_desc")}</p></div></div>
          <ChevronDown className={`w-4 h-4 text-mutedtxt transition-transform ${genOpen ? "rotate-180" : ""}`} />
        </button>
        {genOpen && <div className="px-5 pb-5"><KeyGen /></div>}
      </div>

      {/* Step 2 */}
      <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs space-y-3">
        <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span><div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-ink"><Key className="w-4 h-4" /></div><h2 className="text-sm font-bold text-heading">{t("keys.create_title")}</h2><span className="ml-auto text-[11px] font-semibold text-mutedtxt bg-muted px-2 py-0.5 rounded-full">needs MASTER_KEY</span></div>
        <div className="flex flex-wrap gap-3 items-end bg-raised/50 p-3 rounded-lg border border-linesoft">
          <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider">Name <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider">RPM <input value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder="60" className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono w-24 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider flex-1 min-w-[280px]">Scopes <input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder='{"models":["*"],"providers":["*"]}' className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
          <button onClick={create} className="h-[38px] px-5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-xs active:scale-[0.98] transition-transform">Create</button>
        </div>
        <p className="text-[11px] text-mutedtxt bg-blue-soft/50 border border-blue-line rounded-lg px-3 py-2">{t("keys.create_scopes_hint")}</p>
      </div>

      {/* Step 3 - Copy key */}
      {lastCreated ? (
        <div className="p-5 bg-amber-soft border-2 border-amber-line rounded-xl shadow-md flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">3</span><div className="flex items-center gap-2 text-amber-ink font-bold text-sm"><ShieldAlert className="w-4 h-4 text-amber-ink" /> {t("keys.save_title")}</div></div>
            <button onClick={() => setLastCreated(null)} className="text-xs underline text-amber-ink">Dismiss</button>
          </div>
          <div className="flex items-center gap-2 bg-surface/90 p-2.5 rounded-lg border border-amber-line">
            <code className="flex-1 font-mono text-xs truncate select-all">{lastCreated.key}</code>
            <button onClick={() => { navigator.clipboard.writeText(lastCreated.key || ""); setCopied("new"); setTimeout(()=>setCopied(null),1500); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 text-white">{copied==="new" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied==="new" ? "Copied" : "Copy Key"}</button>
          </div>
          <p className="text-[11px] text-amber-ink">{t("keys.save_desc")}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl p-5 border border-dashed border-linestrong shadow-2xs">
          <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-strong text-secondary flex items-center justify-center text-xs font-bold">3</span><h2 className="text-sm font-bold text-body">{t("keys.copy_placeholder_title")}</h2><span className="text-[11px] text-mutedtxt">{t("keys.copy_placeholder_hint")}</span></div>
          <p className="text-xs text-mutedtxt mt-2">{t("keys.copy_placeholder_desc")}</p>
        </div>
      )}

      {/* Step 4 - Quick Test */}
      <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs space-y-4">
        <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">4</span><div className="p-1.5 bg-primary text-primary-ink rounded-md"><Terminal className="w-4 h-4" /></div><h2 className="text-sm font-bold text-heading">{t("keys.quick_test")}</h2></div>
        <p className="text-xs text-mutedtxt">{t("keys.quick_test_desc")} <code className="bg-muted border border-line px-1.5 py-0.5 rounded text-xs">$FGK_KEY</code></p>
        <div className="relative rounded-xl bg-codebg p-4 border border-codeline font-mono text-xs shadow-2xs">
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-mutedtxt text-[11px] ml-2">Auto router</span></div><button onClick={() => navigator.clipboard.writeText(`curl http://localhost:7373/v1/chat/completions -H "Authorization: Bearer $FGK_KEY" -H "Content-Type: application/json" -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`)} className="text-[11px] font-semibold text-codetextdim hover:text-codetextbright">Copy</button></div>
          <pre className="text-emerald-400 whitespace-pre-wrap break-all">{`curl http://localhost:7373/v1/chat/completions \\\n  -H "Authorization: Bearer $FGK_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        </div>
        <div className="relative rounded-xl bg-codebg p-4 border border-codeline font-mono text-xs shadow-2xs">
          <div className="flex items-center gap-1.5 mb-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-codetextfaint text-[11px] ml-2">Pin provider: pollinations</span></div>
          <pre className="text-sky-300 whitespace-pre-wrap break-all">{`curl http://localhost:7373/v1/chat/completions \\\n  -H "Authorization: Bearer $FGK_KEY" -H "x-router: pollinations" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"pollinations/openai","messages":[{"role":"user","content":"Hi"}]}'`}</pre>
        </div>
      </div>

      {/* Table at bottom */}
      <div className="bg-surface rounded-xl border border-line/90 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-linesoft bg-raised/70">
          <h2 className="text-sm font-bold text-heading">{t("keys.your_keys")} <span className="ml-2 text-xs font-mono bg-primary text-primary-ink px-2 py-0.5 rounded-full">{keys.length}</span></h2>
          <span className="text-[11px] text-mutedtxt">{t("keys.table_bottom")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-raised text-secondary font-bold border-b border-line/80 uppercase tracking-wider text-[11px]">
              <tr><th className="px-4 py-3">{t("keys.th_id")}</th><th className="px-4 py-3">{t("keys.th_name")}</th><th className="px-4 py-3">{t("keys.th_role")}</th><th className="px-4 py-3">{t("keys.th_scopes")}</th><th className="px-4 py-3">{t("keys.th_rpm")}</th><th className="px-4 py-3">{t("keys.th_requests")}</th><th className="px-4 py-3">{t("keys.th_created")}</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-divsoft">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-raised/80">
                  <td className="px-4 py-3"><code className="text-xs font-mono bg-muted border border-line px-2 py-0.5 rounded">{k.id}</code></td>
                  <td className="px-4 py-3 font-semibold text-heading">{k.name}</td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${k.role === "admin" ? "bg-rose-soft text-rose-ink border-rose-line" : "bg-sky-soft text-sky-ink border-sky-line"}`}>{k.role}</span></td>
                  <td className="px-4 py-3 font-mono text-[11px] text-secondary max-w-xs truncate">{JSON.stringify(k.scopes)}</td>
                  <td className="px-4 py-3 font-mono font-bold">{k.rpmLimit}</td>
                  <td className="px-4 py-3 font-mono">{k.requestCount ?? 0}</td>
                  <td className="px-4 py-3 text-mutedtxt">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "-"}</td>
                  <td className="px-4 py-3">{k.id !== "vk-master" && <button onClick={() => del(k.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-ink hover:bg-rose-soft px-2 py-1 rounded-md border border-transparent hover:border-rose-line"><Trash2 className="w-3.5 h-3.5" />Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length === 0 && <div className="p-8 text-center text-sm text-mutedtxt">{t("keys.no_keys")}</div>}
      </div>

      {/* BYOK — per-virtual-key provider keys (self-serve) */}
      <ByokPanel keys={keys} />
    </div>
  );
}

interface ByokVkLite { id: string; name?: string; role?: string }

function ByokPanel({ keys }: { keys: VirtualKeyView[] }) {
  const { t } = useLang();
  const [vkId, setVkId] = useState("");
  const [provider, setProvider] = useState("");
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [raw, setRaw] = useState("");
  const [byok, setByok] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // provider list for the dropdown (single page covers all providers)
  useEffect(() => {
    fetch("/api/providers?page=1&limit=100", { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const ids: string[] = (d?.detailed || d?.data || d?.providers || []).map((p: { id?: string }) => p.id).filter(Boolean);
        if (ids.length === 0) throw new Error("empty");
        setProviderIds(ids);
        setProvider((p) => p || ids[0]);
      })
      .catch(() => setMsg(t("byok.load_error")));
  }, []);

  const loadByok = (id: string) => {
    if (!id) return;
    fetch(`/api/byok?vkId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${mk()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setByok(d?.providers || {}))
      .catch(() => setByok({}));
  };
  useEffect(() => {
    if (!vkId && keys.length > 0) setVkId(keys[0].id);
    if (vkId) loadByok(vkId);
  }, [keys, vkId]);

  const save = async () => {
    const keysArr = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!vkId || !provider) return;
    if (keysArr.length === 0) { alert(t("byok.keys_hint")); return; }
    const res = await fetch("/api/byok", { method: "POST", headers: { Authorization: `Bearer ${mk()}`, "Content-Type": "application/json" }, body: JSON.stringify({ vkId, provider, keys: keysArr }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { alert(JSON.stringify(d)); return; }
    setRaw("");
    setMsg(t("byok.saved").replace("{provider}", provider));
    loadByok(vkId);
  };
  const remove = async (pid: string) => {
    if (!confirm(`${t("byok.delete")}: ${pid}?`)) return;
    const res = await fetch(`/api/byok?vkId=${encodeURIComponent(vkId)}&provider=${encodeURIComponent(pid)}`, { method: "DELETE", headers: { Authorization: `Bearer ${mk()}` } });
    if (res.ok) { setMsg(t("byok.deleted").replace("{provider}", pid)); loadByok(vkId); }
  };

  const vks: ByokVkLite[] = keys.map((k) => ({ id: k.id, name: k.name, role: k.role }));

  return (
    <div className="bg-surface rounded-xl border border-line/90 shadow-2xs">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500"><Key className="w-4 h-4" /></div>
          <div><h2 className="text-sm font-bold text-heading">{t("byok.title")}</h2><p className="text-xs text-mutedtxt">{t("byok.subtitle")}</p></div>
        </div>
        <ChevronDown className={`w-4 h-4 text-mutedtxt transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3">
          <div className="flex flex-wrap gap-3 items-end bg-raised/50 p-3 rounded-lg border border-linesoft">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider min-w-[200px]">
              {t("byok.vk_label")}
              <select value={vkId} onChange={(e) => setVkId(e.target.value)} className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {vks.map((k) => <option key={k.id} value={k.id}>{k.id === "vk-master" ? k.id : `${k.name || k.id} (${k.id})`}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider min-w-[180px]">
              {t("byok.provider_label")}
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {providerIds.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-bold text-body uppercase tracking-wider">
            {t("byok.keys_label")}
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} placeholder={"gsk_xxx...\nAIza_xxx..."} className="px-3 py-2 bg-surface border border-linestrong rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={save} className="h-[34px] px-4 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 shadow-xs active:scale-[0.98] transition-transform">{t("byok.save")}</button>
            {msg && <span className="text-[11px] font-semibold text-emerald-ink bg-emerald-soft border border-emerald-line px-2.5 py-1 rounded-full">{msg}</span>}
          </div>
          <p className="text-[11px] text-mutedtxt">{t("byok.keys_hint")}</p>
          <div className="border border-linesoft rounded-lg divide-y divide-divsoft overflow-hidden">
            {Object.keys(byok).length === 0 ? (
              <div className="p-4 text-center text-xs text-mutedtxt">{t("byok.empty")}</div>
            ) : (
              Object.entries(byok).map(([pid, masked]) => (
                <div key={pid} className="flex items-center gap-3 px-3 py-2.5 hover:bg-raised/70">
                  <code className="text-xs font-bold text-heading min-w-[120px]">{pid}</code>
                  <span className="flex-1 font-mono text-[11px] text-mutedtxt truncate">{masked.join(", ")}</span>
                  <button onClick={() => remove(pid)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-ink hover:bg-rose-soft px-2 py-1 rounded-md border border-transparent hover:border-rose-line"><Trash2 className="w-3.5 h-3.5" />{t("byok.delete")}</button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyGen() {
  const { t } = useLang();
  const [master, setMaster] = useState("");
  const [enc, setEnc] = useState("");
  const gen = () => { setMaster(`fgk-master-${randHex(16)}`); setEnc(randHex(32)); };
  useEffect(() => { gen(); }, []);
  const useMaster = () => { localStorage.setItem("masterKey", master); alert(t("keys.saved_alert")); location.reload(); };
  const syncFromServer = () => {
    fetch("/api/bootstrap").then(r=>r.ok?r.json():null).then(d=>{
      const k=d?.masterKey;
      if(k && k.startsWith("fgk-master-")){
        localStorage.setItem("masterKey", k);
        alert(t("keys.synced_alert") || "Synced MASTER_KEY from server to header");
        location.reload();
      } else alert("Failed to fetch master key from server");
    }).catch(()=>alert("Failed to fetch master key"));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={gen} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted border border-line hover:bg-strong"><Dices className="w-3.5 h-3.5" />{t("keys.gen_new")}</button>
        <span className="text-[11px] text-mutedtxt">{t("keys.gen_hint")}</span>
      </div>
      <div className="grid gap-3">
        <label className="text-xs font-semibold text-secondary">MASTER_KEY <div className="flex gap-2 mt-1"><code className="flex-1 font-mono text-xs bg-raised border border-line px-3 py-2 rounded-lg break-all">{master}</code><button onClick={() => navigator.clipboard.writeText(master)} className="px-3 py-2 bg-surface border border-line rounded-lg text-xs font-semibold hover:bg-raised">Copy</button><button onClick={useMaster} className="px-3 py-2 bg-emerald-soft border border-emerald-line text-emerald-ink rounded-lg text-xs font-semibold hover:bg-emerald-wash inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />{t("keys.use_in_ui")}</button><button onClick={syncFromServer} className="px-3 py-2 bg-amber-soft border border-amber-line text-amber-ink rounded-lg text-xs font-semibold hover:bg-amber-wash inline-flex items-center gap-1">{t("keys.sync_from_server") || "Sync from server"}</button></div><p className="text-[11px] text-mutedtxt mt-1">{t("keys.sync_hint") || "Fix Admin required when header outdated"} — {t("keys.use_in_ui")} áp key mới tự sinh (cần update .env + restart), {t("keys.sync_from_server")} lấy key hiện tại từ BE</p></label>
        <label className="text-xs font-semibold text-secondary">ENCRYPTION_KEY (64 hex) <div className="flex gap-2 mt-1"><code className="flex-1 font-mono text-xs bg-raised border border-line px-3 py-2 rounded-lg break-all">{enc}</code><button onClick={() => navigator.clipboard.writeText(enc)} className="px-3 py-2 bg-surface border border-line rounded-lg text-xs font-semibold hover:bg-raised">Copy</button></div></label>
      </div>
      <div className="relative rounded-xl bg-codebg p-4 border border-codeline font-mono text-xs">
        <div className="flex items-center gap-1.5 mb-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80 inline-block" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 inline-block" /><span className="text-codetextfaint text-[11px] ml-2"># Paste into .env</span></div>
        <pre className="text-emerald-400 whitespace-pre-wrap break-all">{`MASTER_KEY=${master}\nENCRYPTION_KEY=${enc}`}</pre>
      </div>
    </div>
  );
}
