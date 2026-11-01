import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { BarChart3, Activity, Sparkles } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";
import type { GatewayStats } from "../../../lib/api-types.ts";

export function UsageCharts({ stats }: { stats: GatewayStats | null }) {
  const { t } = useLang();
  if (!stats?.logs) return null;
  return (
    <>
      <div className="grid md:grid-cols-3 gap-5">
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-blue-soft rounded-lg"><BarChart3 className="w-3.5 h-3.5 text-blue-ink" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-body">{t("dashboard.requests_by_provider")}</h3></div>
          {stats?.logs?.byProvider && Object.keys(stats.logs.byProvider).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}><BarChart data={Object.entries(stats.logs.byProvider).map(([name, v]) => ({ name, count: v as number }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          ) : <p className="text-xs text-mutedtxt">{t("dashboard.no_data")}</p>}
        </div>
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-purple-soft rounded-lg"><Sparkles className="w-3.5 h-3.5 text-purple-ink" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-body">{t("dashboard.tokens_by_provider")}</h3></div>
          {stats?.logs?.tokensByProvider && Object.keys(stats.logs.tokensByProvider).length > 0 ? (
            <ResponsiveContainer width="100%" height={180}><BarChart data={Object.entries(stats.logs.tokensByProvider).map(([name, v]) => ({ name, tokens: v as number }))}><CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="tokens" fill="#9333ea" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          ) : <p className="text-xs text-mutedtxt">{t("dashboard.no_data")}</p>}
        </div>
        <div className="bg-surface rounded-xl p-5 border border-line/90 shadow-2xs">
          <div className="flex items-center gap-2 mb-3"><div className="p-1.5 bg-emerald-soft rounded-lg"><Activity className="w-3.5 h-3.5 text-emerald-ink" /></div><h3 className="text-xs font-bold uppercase tracking-wider text-body">{t("logs.status_distribution")}</h3></div>
          {(stats?.logs?.total || 0) > 0 ? (
            <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{ name: "success", value: 100 - Math.round((stats.logs.errorRate || 0) * 100) }, { name: "error", value: Math.round((stats.logs.errorRate || 0) * 100) }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label><Cell fill="#10b981" /><Cell fill="#ef4444" /></Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
          ) : <p className="text-xs text-mutedtxt">{t("dashboard.no_data")}</p>}
        </div>
      </div>
      <div className="bg-surface rounded-xl p-4 border border-line/90 shadow-2xs text-xs leading-relaxed">
        <b>{t("logs.tokens")}</b> {(stats?.logs?.totalTokens ?? 0).toLocaleString()} last 100 ({(stats?.logs?.promptTokens ?? 0).toLocaleString()} prompt + {(stats?.logs?.completionTokens ?? 0).toLocaleString()} completion, avg {stats?.logs?.avgTokens ?? 0}/req) • <b>{t("logs.all_time")}</b> {(stats?.logs?.allTimeTokens ?? 0).toLocaleString()} • <b>{t("logs.by_provider")}</b> {Object.entries(stats?.logs?.tokensByProvider || {}).map(([k, v]) => `${k}:${(v as number).toLocaleString()}`).join(" • ") || "—"}
      </div>
    </>
  );
}
