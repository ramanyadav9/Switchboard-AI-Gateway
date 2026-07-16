"use client";

import { useEffect, useState, useCallback } from "react";
import { keys, usage } from "@/lib/api";

type DailyUsage = { date: string; requests: number; tokens: number };
type UsageStats = {
  requests_today: number;
  requests_yesterday: number;
  tokens_today: number;
  tokens_yesterday: number;
  daily: DailyUsage[];
};
type RecentReq = {
  method: string;
  path: string;
  status_code: number;
  latency_ms: number;
  created_at: string;
};
type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "down";
  latency_ms: number | null;
};

function pctChange(today: number, yesterday: number): { text: string; color: string } {
  if (yesterday === 0 && today === 0) return { text: "—", color: "text-[#c7c4d7]" };
  if (yesterday === 0) return { text: "+100%", color: "text-[#ffb783]" };
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0) return { text: `+${pct}%`, color: "text-[#ffb783]" };
  if (pct < 0) return { text: `${pct}%`, color: "text-[#ffb4ab]" };
  return { text: "0%", color: "text-[#c7c4d7]" };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

const RANGE_DAYS: Record<string, number> = { "7D": 7, "30D": 30, "90D": 90 };

function buildChartPath(daily: DailyUsage[], width: number, height: number): { line: string; area: string; points: { x: number; y: number; val: number }[] } {
  if (daily.length === 0) return { line: "", area: "", points: [] };
  const maxVal = Math.max(...daily.map((d) => d.requests), 1);
  const points = daily.map((d, i) => ({
    x: daily.length === 1 ? width / 2 : (i / (daily.length - 1)) * width,
    y: height - (d.requests / maxVal) * height,
    val: d.requests,
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area, points };
}

export default function DashboardPage() {
  const [keyList, setKeyList] = useState<{ id: string; status: string }[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [recent, setRecent] = useState<RecentReq[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<"7D" | "30D" | "90D">("30D");

  const fetchData = useCallback((range: string) => {
    const days = RANGE_DAYS[range] ?? 30;
    Promise.all([
      keys.list().catch(() => []),
      usage.stats(days).catch(() => null),
      usage.recent(10).catch(() => []),
      usage.status().catch(() => ({ services: [] })),
    ]).then(([k, s, r, st]) => {
      setKeyList(k);
      setStats(s);
      setRecent(r);
      setServices(st.services ?? []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(chartRange); }, [chartRange, fetchData]);

  const activeKeys = keyList.filter((k) => k.status === "active").length;
  const reqChange = stats ? pctChange(stats.requests_today, stats.requests_yesterday) : { text: "—", color: "text-[#c7c4d7]" };
  const tokChange = stats ? pctChange(stats.tokens_today, stats.tokens_yesterday) : { text: "—", color: "text-[#c7c4d7]" };

  const chartW = 100;
  const chartH = 100;
  const chart = stats ? buildChartPath(stats.daily, chartW, chartH) : { line: "", area: "", points: [] };
  const maxChartVal = stats?.daily?.length ? Math.max(...stats.daily.map((d) => d.requests), 1) : 10000;

  const statusColor: Record<string, string> = {
    operational: "bg-[#4ade80]",
    degraded: "bg-[#fbbf24]",
    down: "bg-[#f87171]",
  };
  const statusTextColor: Record<string, string> = {
    operational: "text-[#4ade80]",
    degraded: "text-[#fbbf24]",
    down: "text-[#f87171]",
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full flex flex-col gap-12 p-6 md:p-12">
      {/* Page Header */}
      <header>
        <h2 className="text-[24px] leading-[32px] tracking-[-0.01em] font-semibold text-[#e5e2e1]">Dashboard</h2>
        <p className="text-[14px] leading-[20px] text-[#c7c4d7] mt-1">Overview of your API usage and performance.</p>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[#c7c4d7]">
            <h3 className="text-[12px] leading-[18px]">Requests today</h3>
            <span className="material-symbols-outlined text-[16px]">swap_vert</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold font-[family-name:var(--font-mono)] text-[#e5e2e1]">
              {loading ? "—" : formatNum(stats?.requests_today ?? 0)}
            </span>
            <span className={`font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold ${reqChange.color}`}>
              {loading ? "" : reqChange.text}
            </span>
          </div>
        </div>

        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[#c7c4d7]">
            <h3 className="text-[12px] leading-[18px]">Tokens used</h3>
            <span className="material-symbols-outlined text-[16px]">token</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold font-[family-name:var(--font-mono)] text-[#e5e2e1]">
              {loading ? "—" : formatNum(stats?.tokens_today ?? 0)}
            </span>
            <span className={`font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold ${tokChange.color}`}>
              {loading ? "" : tokChange.text}
            </span>
          </div>
        </div>

        <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[#c7c4d7]">
            <h3 className="text-[12px] leading-[18px]">Active Keys</h3>
            <span className="material-symbols-outlined text-[16px]">key</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] leading-[36px] tracking-[-0.02em] font-semibold font-[family-name:var(--font-mono)] text-[#e5e2e1]">
              {loading ? "—" : activeKeys}
            </span>
            <span className="text-[12px] leading-[18px] text-[#c7c4d7]">/ 10 limit</span>
          </div>
        </div>
      </section>

      {/* Usage Chart */}
      <section className="bg-[#171717] border border-[#262626] rounded-lg flex flex-col h-[400px]">
        <div className="border-b border-[#262626] p-4 flex items-center justify-between">
          <h3 className="text-[14px] leading-[20px] text-[#e5e2e1] font-semibold">
            Usage Overview ({chartRange === "7D" ? "7" : chartRange === "30D" ? "30" : "90"} Days)
          </h3>
          <div className="flex gap-1">
            {(["7D", "30D", "90D"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`text-[12px] leading-[18px] px-2 py-1 rounded transition-colors ${
                  chartRange === r
                    ? "bg-[#c0c1ff] text-[#1000a9]"
                    : "bg-[#262626] text-[#e5e2e1] hover:bg-[#353534]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 p-4 relative flex items-end">
          {/* Y-axis labels */}
          <div className="absolute left-4 top-4 bottom-8 w-10 flex flex-col justify-between items-end font-[family-name:var(--font-mono)] text-[11px] leading-[16px] text-[#c7c4d7] pr-1">
            <span>{formatNum(maxChartVal)}</span>
            <span>{formatNum(Math.round(maxChartVal * 0.75))}</span>
            <span>{formatNum(Math.round(maxChartVal * 0.5))}</span>
            <span>{formatNum(Math.round(maxChartVal * 0.25))}</span>
            <span>0</span>
          </div>
          {/* Chart area */}
          <div className="flex-1 ml-12 border-l border-b border-[#262626] relative h-full">
            <div className="absolute top-1/4 left-0 w-full border-t border-[#262626] border-dashed opacity-50" />
            <div className="absolute top-2/4 left-0 w-full border-t border-[#262626] border-dashed opacity-50" />
            <div className="absolute top-3/4 left-0 w-full border-t border-[#262626] border-dashed opacity-50" />
            {chart.line && (
              <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${chartW} ${chartH}`}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d={chart.area} fill="url(#chartGrad)" opacity="0.15" />
                <path d={chart.line} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                {chart.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3" fill="#6366f1" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            )}
            {!chart.line && !loading && (
              <div className="absolute inset-0 flex items-center justify-center text-[#464554] text-[13px] font-[family-name:var(--font-mono)]">
                No usage data yet
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Row */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Recent Endpoints */}
        <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#262626]">
            <h3 className="text-[14px] leading-[20px] text-[#e5e2e1] font-semibold">Recent Endpoints</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#262626]">
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Method</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Path</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Status</th>
                <th className="py-2 px-4 font-[family-name:var(--font-mono)] text-[10px] leading-[12px] tracking-[0.05em] font-bold text-[#c7c4d7] uppercase">Latency</th>
              </tr>
            </thead>
            <tbody className="text-[14px] leading-[20px] text-[#e5e2e1] divide-y divide-[#262626]">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-[#464554] text-[13px]">Loading...</td></tr>
              ) : recent.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-[#464554] text-[13px] font-[family-name:var(--font-mono)]">No requests yet</td></tr>
              ) : recent.map((r, i) => (
                <tr key={i} className="hover:bg-[#201f1f] transition-colors">
                  <td className="py-2.5 px-4">
                    <span className={`font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold px-1.5 py-0.5 rounded ${
                      r.method === "POST" ? "bg-[#6366f1]/15 text-[#c0c1ff]" : "bg-[#4ade80]/15 text-[#4ade80]"
                    }`}>
                      {r.method}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-[family-name:var(--font-mono)] text-[13px] text-[#c7c4d7]">{r.path}</td>
                  <td className={`py-2.5 px-4 font-[family-name:var(--font-mono)] text-[13px] ${r.status_code < 400 ? "text-[#4ade80]" : "text-[#ffb4ab]"}`}>{r.status_code}</td>
                  <td className="py-2.5 px-4 font-[family-name:var(--font-mono)] text-[13px] text-[#c7c4d7]">{r.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* System Status */}
        <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#262626]">
            <h3 className="text-[14px] leading-[20px] text-[#e5e2e1] font-semibold">System Status</h3>
          </div>
          <div className="divide-y divide-[#262626]">
            {loading ? (
              <div className="px-4 py-6 text-center text-[#464554] text-[13px]">Checking...</div>
            ) : services.length === 0 ? (
              <div className="px-4 py-6 text-center text-[#464554] text-[13px] font-[family-name:var(--font-mono)]">No services</div>
            ) : services.map((s, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <span className="text-[14px] text-[#e5e2e1]">{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusColor[s.status] ?? "bg-[#908fa0]"}`} />
                  <span className={`font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] font-bold capitalize ${statusTextColor[s.status] ?? "text-[#908fa0]"}`}>
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
            <div className="px-4 py-3">
              <a href="#" className="text-[12px] text-[#c0c1ff] hover:text-[#494bd6] transition-colors flex items-center gap-1">
                View Status Page
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
