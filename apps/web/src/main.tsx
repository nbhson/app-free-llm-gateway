import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Zap, LayoutDashboard, Server, Cpu, Key, ScrollText, ShieldCheck, Copy, Eye, EyeOff, Check, ChevronDown, Settings as SettingsIcon, BarChart3, MessageSquare, GitCompare } from "lucide-react";
import Dashboard from "./pages/Dashboard.tsx";
import Models from "./pages/Models.tsx";
import Providers from "./pages/Providers.tsx";
import Keys from "./pages/Keys.tsx";
import Logs from "./pages/Logs.tsx";
import Usage from "./pages/Usage.tsx";
import Settings from "./pages/Settings.tsx";
import Chat from "./pages/Chat.tsx";
import Compare from "./pages/Compare.tsx";
import "./index.css";
import { LangProvider, useLang } from "./lib/i18n.tsx";
import pkg from "../package.json";

const APP_VERSION = pkg.version;

function getMasterKey() {
  return localStorage.getItem("masterKey") || "fgk-master-dev-key";
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = React.useState(() => getMasterKey());
  const [health, setHealth] = React.useState<"ok" | "down" | "loading">("loading");
  const [showKey, setShowKey] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [langMenuOpen, setLangMenuOpen] = React.useState(false);
  const langMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [headerStats, setHeaderStats] = React.useState<{ providers?: number; count?: number; free_models?: number } | null>(null);
  const { lang, setLang, t } = useLang();

  // Close the language menu on outside click / Escape (it previously stayed
  // open until another click on the toggle itself)
  React.useEffect(() => {
    if (!langMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) setLangMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [langMenuOpen]);

  React.useEffect(() => {
    const saved = localStorage.getItem("masterKey");
    if (saved && saved !== masterKey) setMasterKey(saved);
  }, []);
  React.useEffect(() => {
    if (masterKey) localStorage.setItem("masterKey", masterKey);
  }, [masterKey]);

  // Auto-bootstrap: fetch auto-generated MASTER_KEY from backend if local key is placeholder
  // Ensures fresh clone / new user always has valid key bound to top-right input on first start
  React.useEffect(() => {
    const saved = localStorage.getItem("masterKey");
    const isPlaceholder = !saved || saved === "fgk-master-dev-key" || saved.includes("change-me") || saved.trim().length < 16;
    if (!isPlaceholder) return;
    fetch("/api/bootstrap").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const k = d?.masterKey;
      if (k && k.startsWith("fgk-master-") && k !== saved) {
        localStorage.setItem("masterKey", k);
        setMasterKey(k);
      }
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    fetch("/v1/health").then((r) => (r.ok ? setHealth("ok") : setHealth("down"))).catch(() => setHealth("down"));
  }, []);
  React.useEffect(() => {
    if (!masterKey || masterKey === "fgk-master-dev-key" || masterKey.includes("change-me")) return;
    fetch("/api/stats", { headers: { Authorization: `Bearer ${masterKey}` } }).then((r) => {
      if (r.status === 401) throw new Error("unauthorized");
      return r.json();
    }).then(setHeaderStats).catch((e) => {
      if (String(e).includes("unauthorized")) {
        // Key outdated (gateway regenerated) — re-bootstrap
        fetch("/api/bootstrap").then((r2) => (r2.ok ? r2.json() : null)).then((d) => {
          const k = d?.masterKey;
          if (k && k.startsWith("fgk-master-") && k !== masterKey) {
            localStorage.setItem("masterKey", k);
            setMasterKey(k);
          }
        }).catch(() => {});
      }
    });
  }, [masterKey]);

  const handleCopyMasterKey = () => {
    navigator.clipboard.writeText(masterKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const providersBadge = headerStats ? String(headerStats.providers ?? headerStats.count ?? 40) : "—";
  const modelsBadge = headerStats ? String(headerStats.free_models ?? 316) : "—";
  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: <LayoutDashboard className="w-4 h-4" />, end: true as const },
    { to: "/providers", label: t("nav.providers"), icon: <Server className="w-4 h-4" />, badge: providersBadge },
    { to: "/models", label: t("nav.models"), icon: <Cpu className="w-4 h-4" />, badge: modelsBadge },
    { to: "/keys", label: t("nav.keys"), icon: <Key className="w-4 h-4" /> },
    { to: "/usage", label: t("nav.usage"), icon: <BarChart3 className="w-4 h-4" /> },
    { to: "/logs", label: t("nav.logs"), icon: <ScrollText className="w-4 h-4" /> },
  ];
  const settingsNav = { to: "/settings", label: t("nav.settings"), icon: <SettingsIcon className="w-4 h-4" /> };
  const chatNav = { to: "/chat", label: t("nav.chat"), icon: <MessageSquare className="w-4 h-4" /> };
  const compareNav = { to: "/compare", label: t("nav.compare"), icon: <GitCompare className="w-4 h-4" /> };
  const utilityNav = [chatNav, compareNav, settingsNav];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
                {t("a11y.skipToContent")}
      </a>
      <header className="sticky top-0 z-40 w-full bg-surface/90 backdrop-blur-md border-b border-line/80 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-linesoft/80">
            <div className="flex items-center gap-3">
              <NavLink to="/" className="group flex items-center gap-2.5 text-left focus:outline-none transition-transform active:scale-[0.98]">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white flex items-center justify-center shadow-xs ring-1 ring-black/5 group-hover:shadow-sm group-hover:scale-105 transition-all duration-200">
                  <Zap className="w-4 h-4 fill-white stroke-white" />
                </div>
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-heading group-hover:text-amber-ink transition-colors">Free LLM Gateway</span>
                <span className="font-mono text-[10px] font-semibold text-mutedtxt px-1.5 py-0.5 rounded bg-muted border border-line/60 hidden sm:inline-flex">v{APP_VERSION}</span>
              </NavLink>

              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${health === "ok" ? "bg-emerald-soft text-emerald-ink border-emerald-line/80" : health === "down" ? "bg-rose-soft text-rose-ink border-rose-line/80" : "bg-muted text-secondary border-line/80"}`}>
                <span className="relative flex h-2 w-2">
                  {health === "ok" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${health === "ok" ? "bg-emerald-500" : health === "down" ? "bg-rose-500" : "bg-slate-400"}`}></span>
                </span>
                <span className="tracking-wide">{health === "ok" ? t("header.online") : health === "down" ? t("header.offline") : t("header.loading")}</span>
              </div>

              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-secondary border border-line/80 shadow-2xs">
                <span className="font-semibold text-title">{headerStats?.providers ?? headerStats?.count ?? "—"}</span>
                <span>providers</span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-amber-ink">{headerStats?.free_models ?? "—"}</span>
                <span>free</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative" ref={langMenuRef}>
                <button
                  type="button"
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  aria-haspopup="listbox"
                  aria-expanded={langMenuOpen}
                  aria-label={t("nav.settings") === "Settings" ? "Change language" : "Thay đổi ngôn ngữ"}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-body bg-surface hover:bg-raised active:bg-muted border border-line transition-colors shadow-2xs"
                >
                  <span>{lang === "en" ? "🇬🇧 EN" : "🇻🇳 VI"}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${langMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {langMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Language"
                    className="absolute right-0 mt-1.5 w-32 bg-surface rounded-xl shadow-lg border border-line py-1 z-50"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={lang === "en"}
                      onClick={() => { setLang("en"); setLangMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-body hover:bg-raised flex items-center justify-between"
                    >
                      <span>🇬🇧 English</span>
                      {lang === "en" && <Check className="w-3.5 h-3.5 text-amber-ink" />}
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={lang === "vi"}
                      onClick={() => { setLang("vi"); setLangMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-body hover:bg-raised flex items-center justify-between"
                    >
                      <span>🇻🇳 Tiếng Việt</span>
                      {lang === "vi" && <Check className="w-3.5 h-3.5 text-amber-ink" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 bg-raised/90 border border-line/90 rounded-lg px-2.5 py-1 shadow-2xs focus-within:ring-1 focus-within:ring-amber-500/20 focus-within:border-amber-line">
                <div className="flex items-center gap-1 text-mutedtxt select-none" title="Master key — auto-filled from server on first start, editable">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-mutedtxt hidden sm:inline">{t("header.master")}</span>
                </div>
                <input
                  type={showKey ? "text" : "password"}
                  value={masterKey}
                  onChange={(e) => setMasterKey(e.target.value)}
                  onBlur={() => { const v = masterKey.trim(); if (v) { localStorage.setItem("masterKey", v); setMasterKey(v); } }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="font-mono text-xs text-body bg-transparent max-w-[160px] sm:max-w-[220px] truncate focus:outline-none px-1"
                  title={masterKey}
                  placeholder="fgk-master-..."
                  spellCheck={false}
                  autoComplete="off"
                  readOnly={false}
                  disabled={false}
                />
                <button type="button" onClick={() => setShowKey(!showKey)} className="p-1 text-slate-400 hover:text-secondary rounded transition-colors" title={showKey ? "Hide" : "Show"}>
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button type="button" onClick={handleCopyMasterKey} className="p-1 text-slate-400 hover:text-body rounded transition-colors" title="Copy">
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-ink" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between overflow-x-auto no-scrollbar pt-2">
            <nav className="flex items-center gap-1.5 sm:gap-2 pb-2 min-w-max flex-1" aria-label="Navigation Tabs">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${isActive ? "bg-slate-900 text-white shadow-xs" : "text-secondary hover:text-heading hover:bg-muted/80"}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? "text-amber-400" : "text-mutedtxt"}>{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-slate-800 text-slate-200 border border-slate-700" : "bg-strong/80 text-body"}`}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 rounded-lg -z-10 bg-slate-900" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
              <div className="ml-auto pl-4 border-l border-line ml-4 flex items-center gap-1.5 sm:gap-2">
                {utilityNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${isActive ? "bg-slate-900 text-white shadow-xs" : "text-secondary hover:text-heading hover:bg-muted/80"}`}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={isActive ? "text-amber-400" : "text-mutedtxt"}>{item.icon}</span>
                        <span>{item.label}</span>
                        {isActive && <div className="absolute inset-0 rounded-lg -z-10 bg-slate-900" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-4 lg:px-6 pt-6 pb-12">{children}</main>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return <LangProvider><LayoutInner>{children}</LayoutInner></LangProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/models" element={<Models />} />
          <Route path="/keys" element={<Keys />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/benchmark" element={<Compare />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);
