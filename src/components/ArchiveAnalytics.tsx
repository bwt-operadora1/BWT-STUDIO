import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import type { ArchiveEntry } from "@/lib/archive";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, MapPin, Building2 } from "lucide-react";

// ─── Output → category classification ──────────────────────────────────────
type TypeKey = "orcamentos" | "laminas" | "videos" | "scripts";

const TYPES: { key: TypeKey; label: string; color: string }[] = [
  { key: "orcamentos", label: "Orçamentos", color: "#9333EA" },
  { key: "laminas",    label: "Lâminas",    color: "#0ea5e9" },
  { key: "videos",     label: "Vídeos",     color: "#10b981" },
  { key: "scripts",    label: "Scripts",    color: "#f59e0b" },
];

function classifyOutput(o: string): TypeKey | null {
  if (o.includes("Orçamento")) return "orcamentos";
  if (o === "Feed PNG" || o === "Story PNG") return "laminas";
  if (o.includes("Vídeo")) return "videos";
  if (["Caption Instagram", "Mensagem WhatsApp", "E-mail de Vendas"].includes(o)) return "scripts";
  return null; // "Salvo" and anything else is not counted as a produced asset
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const AXIS = "#94a3b8";
const GRID = "rgba(148,163,184,0.15)";
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
} as const;

// ─── Chart card wrapper ─────────────────────────────────────────────────────
const ChartCard = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4" style={{ color: "#9333EA" }} />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    {children}
  </Card>
);

const ArchiveAnalytics = ({ entries }: { entries: ArchiveEntry[] }) => {
  // Stacked monthly composition: distribute each entry's outputs into type
  // buckets within the month it was last active.
  const monthly = useMemo(() => {
    const map = new Map<string, { key: string; label: string } & Record<TypeKey, number>>();
    for (const e of entries) {
      const d = new Date(e.savedAt);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      const row =
        map.get(key) ??
        { key, label, orcamentos: 0, laminas: 0, videos: 0, scripts: 0 };
      for (const o of e.outputs ?? []) {
        const c = classifyOutput(o);
        if (c) row[c] += 1;
      }
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [entries]);

  // Donut: total produced assets per type across the whole archive.
  const typeTotals = useMemo(() => {
    const counts: Record<TypeKey, number> = { orcamentos: 0, laminas: 0, videos: 0, scripts: 0 };
    for (const e of entries) {
      for (const o of e.outputs ?? []) {
        const c = classifyOutput(o);
        if (c) counts[c] += 1;
      }
    }
    return TYPES.map((t) => ({ name: t.label, value: counts[t.key], color: t.color })).filter(
      (d) => d.value > 0,
    );
  }, [entries]);

  const totalAssets = useMemo(
    () => typeTotals.reduce((sum, d) => sum + d.value, 0),
    [typeTotals],
  );

  const topBy = (keyFn: (e: ArchiveEntry) => string | undefined, n = 5) => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const k = keyFn(e)?.trim();
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
  };

  const topDestinos = useMemo(() => topBy((e) => e.data.destino), [entries]);
  const topAgencias = useMemo(() => topBy((e) => e.data.agencia), [entries]);

  return (
    <div className="space-y-4">
      {/* ── Monthly usage — stacked by asset type ── */}
      <ChartCard title="Uso por mês" icon={TrendingUp}>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(147,51,234,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              {TYPES.map((t, i) => (
                <Bar
                  key={t.key}
                  dataKey={t.key}
                  name={t.label}
                  stackId="a"
                  fill={t.color}
                  radius={i === TYPES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Asset type distribution (donut) ── */}
        <ChartCard title="Distribuição de conteúdo" icon={PieIcon}>
          <div style={{ width: "100%", height: 260, position: "relative" }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={typeTotals}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  stroke="none"
                >
                  {typeTotals.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{ top: -24 }}
            >
              <span className="font-display font-bold text-2xl leading-none">{totalAssets}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Conteúdos</span>
            </div>
          </div>
        </ChartCard>

        {/* ── Top 5 destinos ── */}
        <ChartCard title="Top 5 destinos" icon={MapPin}>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={topDestinos} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(147,51,234,0.06)" }} formatter={(v) => [`${v}`, "Orçamentos"]} />
                <Bar dataKey="value" fill="#9333EA" radius={[0, 4, 4, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* ── Top 5 agências (only if we have agency data) ── */}
      {topAgencias.length > 0 && (
        <ChartCard title="Top 5 agências" icon={Building2}>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={topAgencias} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(147,51,234,0.06)" }} formatter={(v) => [`${v}`, "Orçamentos"]} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
};

export default ArchiveAnalytics;
