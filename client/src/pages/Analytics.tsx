import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";

interface ProcessingStats {
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number | null;
  byDay: { date: string; count: number }[];
}

interface EngagementStats {
  totalItems: number;
  itemsTracked: { date: string; count: number }[];
  repairsOpened: number;
  repairsResolved: number;
  repairsBySeverity: { severity: string; count: number }[];
  walkthroughsPerUser: { userId: string; count: number }[];
  activeUsers: { dau: number; wau: number; mau: number };
}

interface InventoryBreakdown {
  categories: { category: string; count: number }[];
  itemsPerSpace: { spaceName: string; count: number }[];
}

interface AnalyticsSnapshot {
  processing: ProcessingStats;
  engagement: EngagementStats;
  inventory: InventoryBreakdown;
}

const DAYS_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function formatMs(ms: number | null): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics?days=${days}`, {
      headers: { "x-tenant-id": localStorage.getItem("trace-tenant-id") || "default" },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div style={shell}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div style={hero}>
        <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
          Processing metrics and engagement overview
        </p>
      </div>

      {/* Time range selector */}
      <div style={rangeRow}>
        {DAYS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            style={days === opt.value ? chipActive : chip}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          Loading analytics...
        </div>
      ) : data ? (
        <>
          {/* Summary stat cards */}
          <div style={cardGrid}>
            <StatCard label="Walkthroughs" value={data.processing.total} sub={`${data.processing.completed} completed`} />
            <StatCard label="Avg Duration" value={formatMs(data.processing.avgDurationMs)} sub="upload to complete" />
            <StatCard label="Failure Rate" value={data.processing.total > 0 ? `${Math.round((data.processing.failed / data.processing.total) * 100)}%` : "--"} sub={`${data.processing.failed} failed`} />
            <StatCard label="Inventory Items" value={data.engagement.totalItems} sub="total tracked" />
            <StatCard label="Repairs" value={data.engagement.repairsOpened + data.engagement.repairsResolved} sub={`${data.engagement.repairsResolved} resolved`} />
            <StatCard label="Active Users" value={data.engagement.activeUsers.wau} sub={`DAU: ${data.engagement.activeUsers.dau}`} />
          </div>

          {/* Walkthroughs over time */}
          <ChartSection title="Walkthroughs Over Time">
            <BarChart
              data={data.processing.byDay}
              xKey="date"
              yKey="count"
              emptyMessage="No walkthrough data for this period"
            />
          </ChartSection>

          {/* Items tracked over time */}
          <ChartSection title="Items Tracked Over Time">
            <BarChart
              data={data.engagement.itemsTracked}
              xKey="date"
              yKey="count"
              emptyMessage="No item observations for this period"
            />
          </ChartSection>

          {/* Repairs by severity + Inventory by category (side by side on desktop) */}
          <div style={twoCol}>
            <ChartSection title="Repairs by Severity">
              <HorizontalBarChart
                data={data.engagement.repairsBySeverity}
                keyName="severity"
                valueKey="count"
                emptyMessage="No repair issues in this period"
              />
            </ChartSection>
            <ChartSection title="Items by Category">
              <HorizontalBarChart
                data={data.inventory.categories}
                keyName="category"
                valueKey="count"
                emptyMessage="No categorized items"
              />
            </ChartSection>
          </div>

          {/* User engagement */}
          <ChartSection title="Active Users">
            <div style={userMetrics}>
              <UserMetric label="Daily Active" value={data.engagement.activeUsers.dau} />
              <UserMetric label="Weekly Active" value={data.engagement.activeUsers.wau} />
              <UserMetric label="Monthly Active" value={data.engagement.activeUsers.mau} />
            </div>
          </ChartSection>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          No analytics data available.
        </div>
      )}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div style={summaryCard}>
      <span style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, color: "var(--sm-text-primary)" }}>
        {value}
      </span>
      <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, color: "var(--sm-text-primary)" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>{sub}</span>
    </div>
  );
}

// ── Chart Components ───────────────────────────────────────────────────

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: 0, marginBottom: "var(--sm-space-4)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

interface BarDatum {
  [key: string]: string | number;
}

function BarChart({
  data,
  xKey,
  yKey,
  height = 200,
  emptyMessage,
}: {
  data: BarDatum[];
  xKey: string;
  yKey: string;
  height?: number;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return <div style={emptyChart}>{emptyMessage}</div>;
  }

  const maxVal = Math.max(1, ...data.map((d) => Number(d[yKey]) || 0));
  const barWidth = Math.max(4, Math.min(24, (600 - data.length * 4) / data.length));
  const chartH = height - 30;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={Math.max(300, data.length * (barWidth + 4) + 40)} height={height} style={{ display: "block" }}>
        {/* Y axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = chartH - pct * chartH + 10;
          const val = Math.round(maxVal * pct);
          return (
            <g key={pct}>
              <line x1={36} y1={y} x2="100%" y2={y} stroke="var(--sm-border-default)" strokeDasharray="3 3" />
              <text x={30} y={y + 4} textAnchor="end" fontSize={10} fill="var(--sm-text-tertiary)">
                {val}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val = Number(d[yKey]) || 0;
          const barH = Math.max(1, (val / maxVal) * chartH);
          const x = 40 + i * (barWidth + 4);
          const y = chartH - barH + 10;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={2}
                fill="var(--sm-brand-500)"
              >
                <title>{String(d[xKey])}: {val}</title>
              </rect>
              {/* X axis label — show every Nth to avoid crowding */}
              {(data.length <= 14 || i % Math.ceil(data.length / 14) === 0) && (
                <text
                  x={x + barWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--sm-text-tertiary)"
                  transform={`rotate(-30, ${x + barWidth / 2}, ${height - 4})`}
                >
                  {String(d[xKey]).slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HorizontalBarChart({
  data,
  keyName,
  valueKey,
  emptyMessage,
}: {
  data: BarDatum[];
  keyName: string;
  valueKey: string;
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return <div style={emptyChart}>{emptyMessage}</div>;
  }

  const maxVal = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  const barH = 22;
  const gap = 6;
  const height = data.length * (barH + gap) + 10;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" height={height} style={{ display: "block", minWidth: 280 }}>
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0;
          const w = Math.max(4, (val / maxVal) * 240);
          const y = i * (barH + gap);
          return (
            <g key={i}>
              <text x={0} y={y + 14} fontSize={11} fill="var(--sm-text-secondary)">
                {String(d[keyName])}
              </text>
              <rect x={120} y={y + 2} width={w} height={barH} rx={3} fill="var(--sm-brand-500)" />
              <text x={124 + w} y={y + 15} fontSize={10} fill="var(--sm-text-tertiary)">
                {val}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function UserMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={userMetricCard}>
      <span style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, color: "var(--sm-text-primary)" }}>
        {value}
      </span>
      <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{label}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-8)",
};

const hero: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  marginBottom: "var(--sm-space-4)",
};

const rangeRow: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-2)",
  marginBottom: "var(--sm-space-6)",
};

const chip: React.CSSProperties = {
  padding: "var(--sm-space-1) var(--sm-space-3)",
  fontSize: "var(--sm-text-sm)",
  borderRadius: "var(--sm-radius-full)",
  border: "1px solid var(--sm-border-default)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
};

const chipActive: React.CSSProperties = {
  ...chip,
  background: "var(--sm-brand-600)",
  color: "#fff",
  borderColor: "var(--sm-brand-600)",
};

const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
};

const summaryCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  padding: "var(--sm-space-4)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-8)",
};

const emptyChart: React.CSSProperties = {
  padding: "var(--sm-space-8)",
  textAlign: "center",
  border: "1px dashed var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  color: "var(--sm-text-tertiary)",
  fontSize: "var(--sm-text-sm)",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--sm-space-6)",
};

const userMetrics: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "var(--sm-space-4)",
};

const userMetricCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  padding: "var(--sm-space-4)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  textAlign: "center",
};
