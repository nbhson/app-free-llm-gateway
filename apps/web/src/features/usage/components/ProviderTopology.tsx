import { Zap, Server } from "lucide-react";
import type { ApiLog, ApiProvider } from "../../../lib/api-types.ts";
import { isPublicProvider } from "../lib/helpers";

export function ProviderTopology({ providers, activeProvider, newestProviders, logs }: { providers: ApiProvider[]; activeProvider: string | null; newestProviders?: string[]; logs: ApiLog[] }) {
  const n = providers.length;
  const width = 800;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = n <= 6 ? 130 : n <= 10 ? 150 : 165;
  // compute positions
  const nodes = providers.map((p, i) => {
    const angle = -90 + (360 / n) * i; // start top
    const rad = (angle * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    return { p, x, y, angle };
  });

  const requestCountByProvider = logs.reduce<Record<string, number>>((acc, l) => { acc[l.provider] = (acc[l.provider] || 0) + 1; return acc; }, {});

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px] h-[400px] select-none">
        <defs>
          {/* gradient for active line */}
          <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="1" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#22c55e" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* background subtle grid */}
        <rect x="0" y="0" width={width} height={height} rx="16" fill="var(--app-surface)" stroke="var(--app-line)" strokeWidth="1" />

        {/* center app node shadow */}
        {/* lines */}
        {nodes.map(({ p, x, y }) => {
          const isActive = activeProvider === p.id;
          const isPublic = isPublicProvider(p.id);
          const hasKey = !!p.hasRealKey;
          const isNewest = newestProviders?.includes(p.id);
          // determine line color: active green, newest violet, else based on availability
          const idleColor = isActive ? "#22c55e" : isNewest ? "#c4b5fd" : hasKey ? "var(--app-line-strong)" : isPublic ? "#bae6fd" : "var(--app-line)";
          return (
            <g key={`line-${p.id}`}>
              {/* idle line */}
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={idleColor}
                strokeWidth={isActive ? 3 : isNewest ? 2.6 : 1.8}
                strokeLinecap="round"
                opacity={isActive || isNewest ? 1 : 0.85}
                style={isActive || isNewest ? { filter: "url(#glow)" } : undefined}
              />
              {/* animated dash overlay for active */}
              {isActive && (
                <>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray="8 10"
                    opacity={0.95}
                    className="animate-dash"
                  />
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="#22c55e"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray="12 12"
                    className="animate-dash-slow"
                    opacity={0.9}
                  />
                  {/* moving dot */}
                  <circle r="5" fill="#22c55e" stroke="white" strokeWidth="2" opacity={0.95}>
                    <animateMotion dur="1.2s" repeatCount="indefinite" path={`M ${cx} ${cy} L ${x} ${y}`} />
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {/* provider nodes */}
        {nodes.map(({ p, x, y }) => {
          const isActive = activeProvider === p.id;
          const isPublic = isPublicProvider(p.id);
          const hasKey = !!p.hasRealKey;
          const isNewest = newestProviders?.includes(p.id);
          const count = requestCountByProvider[p.id] || 0;
          const bg = isNewest ? "var(--violet-soft)" : hasKey ? "var(--emerald-soft)" : isPublic ? "var(--sky-soft)" : "var(--app-surface)";
          const border = isActive ? "#22c55e" : isNewest ? "#8b5cf6" : hasKey ? "#6ee7b7" : isPublic ? "#7dd3fc" : "var(--app-line)";
          const textColor = isNewest ? "var(--violet-ink)" : hasKey ? "var(--emerald-ink)" : isPublic ? "var(--sky-ink)" : "var(--app-body)";
          return (
            <g key={`node-${p.id}`} className="cursor-pointer">
              {/* node rect centered at x,y */}
              <g transform={`translate(${x}, ${y})`}>
                <rect
                  x={-52}
                  y={-18}
                  width={104}
                  height={36}
                  rx={10}
                  fill={bg}
                  stroke={border}
                  strokeWidth={isActive || isNewest ? 2.5 : 1.4}
                  style={isActive || isNewest ? { filter: "url(#glow)" } : undefined}
                />
                {isNewest && !isActive && <circle r={6} cx={46} cy={-14} fill="#8b5cf6" opacity={0.9} stroke="white" strokeWidth={1.2} />}
                {/* provider icon circle */}
                <g transform={`translate(-36, 0)`}>
                  <circle r={12} fill={hasKey ? "#10b981" : isPublic ? "#0ea5e9" : "#94a3b8"} />
                  <foreignObject x={-7} y={-7} width={14} height={14} style={{ overflow: "visible" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, color: "white" }}>
                      <Server size={10} />
                    </div>
                  </foreignObject>
                </g>
                <text
                  x={-18}
                  y={-2}
                  textAnchor="start"
                  fontSize="10"
                  fontWeight="700"
                  fill={textColor}
                  className="font-mono"
                >
                  {p.id.length > 13 ? p.id.slice(0, 13) + "…" : p.id}
                </text>
                <text x={-18} y={10} textAnchor="start" fontSize="8.5" fontWeight="600" fill={isActive ? "#15803d" : isNewest ? "#7c3aed" : "var(--app-mutedtxt)"}>
                  {isNewest ? "★ NEW" : hasKey ? "● has key" : isPublic ? "no key needed" : "no key"} {count > 0 ? `• ${count}` : ""}
                </text>
                {(isActive || isNewest) && (
                  <g transform={`translate(42, -14)`}>
                    <circle r={7} fill={isActive ? "#22c55e" : "#8b5cf6"} />
                    <circle r={7} fill="none" stroke={isActive ? "#22c55e" : "#8b5cf6"} strokeWidth={2} opacity={0.4}>
                      <animate attributeName="r" values="7;13;7" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* central app node */}
        <g transform={`translate(${cx}, ${cy})`} style={{ filter: "drop-shadow(0 4px 12px rgba(15,23,42,0.15))" }}>
          {/* outer glow when active */}
          {activeProvider && <circle r={58} fill="none" stroke="#22c55e" strokeWidth={1.5} opacity={0.25} strokeDasharray="6 6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
          </circle>}
          <rect x={-70} y={-32} width={140} height={64} rx={16} fill="#0f172a" stroke={activeProvider ? "#22c55e" : "#1e293b"} strokeWidth={activeProvider ? 2.5 : 1.5} />
          <g transform={`translate(0, -10)`}>
            <rect x={-18} y={-14} width={36} height={28} rx={8} fill="white" opacity={0.08} />
            <foreignObject x={-12} y={-10} width={24} height={20}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 20, color: "#f59e0b" }}>
                <Zap size={18} fill="white" color="#f59e0b" />
              </div>
            </foreignObject>
          </g>
          <text x={0} y={18} textAnchor="middle" fontSize="11" fontWeight="800" fill="white" letterSpacing="0.3">Free LLM Gateway</text>
          <text x={0} y={28} textAnchor="middle" fontSize="8" fontWeight="600" fill={activeProvider ? "#86efac" : "#94a3b8"} letterSpacing="0.8">APP • {activeProvider ? `→ ${activeProvider}` : "idle"}</text>
          {activeProvider && (
            <g transform={`translate(0, -38)`}>
              <rect x={-28} y={-8} width={56} height={16} rx={8} fill="#22c55e" />
              <text x={0} y={3} textAnchor="middle" fontSize="8" fontWeight="800" fill="white">● LIVE</text>
            </g>
          )}
        </g>
      </svg>

      <style>{`
        .animate-dash { animation: dash 0.8s linear infinite; }
        .animate-dash-slow { animation: dash 1.2s linear infinite reverse; }
        @keyframes dash { to { stroke-dashoffset: -24; } }
      `}</style>

      {/* legend below svg for mobile */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary text-primary-ink"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />{activeProvider ? `${activeProvider} active` : "no active request"}</span>
        <span className="text-mutedtxt">• Tap Refresh or send POST /v1/chat/completions to trigger animation</span>
      </div>
    </div>
  );
}
