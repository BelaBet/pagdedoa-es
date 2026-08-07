import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  format,
  startOfDay,
  startOfYear,
  startOfWeek,
  startOfMonth,
  subDays,
  differenceInDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachHourOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const AUTHORIZED = new Set(["confirmed"]);
const PENDING = new Set(["pending"]);
const REFUSED = new Set(["failed", "refused", "refunded", "canceled", "cancelled"]);

type Periodo = "hoje" | "7d" | "30d" | "90d" | "ano" | "custom";
type Row = { amount: number; created_at: string; status: string | null };

function getDateRange(periodo: Periodo, dataInicio: string, dataFim: string) {
  const hoje = new Date();
  switch (periodo) {
    case "hoje":
      return { inicio: startOfDay(hoje), fim: hoje };
    case "7d":
      return { inicio: subDays(hoje, 7), fim: hoje };
    case "30d":
      return { inicio: subDays(hoje, 30), fim: hoje };
    case "90d":
      return { inicio: subDays(hoje, 90), fim: hoje };
    case "ano":
      return { inicio: startOfYear(hoje), fim: hoje };
    case "custom":
      if (!dataInicio || !dataFim) return { inicio: subDays(hoje, 7), fim: hoje };
      return { inicio: startOfDay(new Date(dataInicio)), fim: new Date(dataFim + "T23:59:59") };
  }
}

function useDashboardMetrics(
  periodo: Periodo,
  dataInicio: string,
  dataFim: string,
  tenantId: string | null,
) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Sem tenant resolvido ainda (ex: perfil carregando) — não busca nada,
    // e principalmente NÃO cai para "todas as doações" como fallback.
    if (!tenantId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const range = getDateRange(periodo, dataInicio, dataFim);
    (async () => {
      const { data, error } = await supabase
        .from("donations")
        .select("amount, created_at, payments(status)")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .gte("created_at", range.inicio.toISOString())
        .lte("created_at", range.fim.toISOString());
      if (!alive) return;
      if (error) {
        toast.error("Erro ao carregar métricas de doações");
        setRows([]);
        setLoading(false);
        return;
      }
      type DonationRow = {
        amount: number;
        created_at: string;
        payments: { status: string | null } | null;
      };
      const normalized: Row[] = ((data ?? []) as DonationRow[]).map((d) => ({
        amount: Number(d.amount) || 0,
        created_at: d.created_at,
        status: d.payments?.status ?? null,
      }));
      setRows(normalized);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [periodo, dataInicio, dataFim, tenantId]);

  return { rows, loading, range: getDateRange(periodo, dataInicio, dataFim) };
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const QUICK: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "ano", label: "Este ano" },
];

const PERIOD_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  ano: "Este ano",
  custom: "Período personalizado",
};

type Bucket = "hour" | "day" | "week" | "month";

function pickBucket(periodo: Periodo, inicio: Date, fim: Date): Bucket {
  if (periodo === "hoje") return "hour";
  if (periodo === "7d" || periodo === "30d") return "day";
  if (periodo === "90d") return "week";
  if (periodo === "ano") return "month";
  const days = differenceInDays(fim, inicio);
  if (days <= 1) return "hour";
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function buildBuckets(bucket: Bucket, inicio: Date, fim: Date) {
  if (bucket === "hour") {
    return eachHourOfInterval({ start: startOfDay(inicio), end: fim }).map((d) => ({
      key: format(d, "yyyy-MM-dd-HH"),
      label: format(d, "HH'h'"),
    }));
  }
  if (bucket === "day") {
    return eachDayOfInterval({ start: inicio, end: fim }).map((d) => ({
      key: format(d, "yyyy-MM-dd"),
      label: format(d, "dd/MM"),
    }));
  }
  if (bucket === "week") {
    return eachWeekOfInterval({ start: inicio, end: fim }, { weekStartsOn: 1 }).map((d) => ({
      key: format(d, "yyyy-'W'II"),
      label: format(d, "dd/MM"),
    }));
  }
  return eachMonthOfInterval({ start: inicio, end: fim }).map((d) => ({
    key: format(d, "yyyy-MM"),
    label: format(d, "MMM", { locale: ptBR }),
  }));
}

function bucketKey(bucket: Bucket, d: Date) {
  if (bucket === "hour") return format(d, "yyyy-MM-dd-HH");
  if (bucket === "day") return format(d, "yyyy-MM-dd");
  if (bucket === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'II");
  return format(startOfMonth(d), "yyyy-MM");
}

export function DonationsSummary({ tenantId }: { tenantId: string | null }) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [appliedInicio, setAppliedInicio] = useState("");
  const [appliedFim, setAppliedFim] = useState("");

  const { rows, loading, range } = useDashboardMetrics(
    periodo,
    appliedInicio,
    appliedFim,
    tenantId,
  );

  const aplicarCustom = () => {
    if (!dataInicio || !dataFim) {
      toast.error("Selecione data inicial e final");
      return;
    }
    setAppliedInicio(dataInicio);
    setAppliedFim(dataFim);
    setPeriodo("custom");
  };

  const limpar = () => {
    setDataInicio("");
    setDataFim("");
    setAppliedInicio("");
    setAppliedFim("");
    setPeriodo("7d");
  };

  const { metrics, lineData, statusCounts } = useMemo(() => {
    const r = rows ?? [];
    const created = r.reduce((s, x) => s + x.amount, 0);
    const authorized = r
      .filter((x) => x.status && AUTHORIZED.has(x.status))
      .reduce((s, x) => s + x.amount, 0);
    const count = r.length;
    const avg = count ? created / count : 0;

    const bucket = pickBucket(periodo, range.inicio, range.fim);
    const buckets = buildBuckets(bucket, range.inicio, range.fim);
    const authMap = new Map(buckets.map((b) => [b.key, 0]));
    const createdMap = new Map(buckets.map((b) => [b.key, 0]));
    for (const x of r) {
      const k = bucketKey(bucket, new Date(x.created_at));
      if (createdMap.has(k)) createdMap.set(k, (createdMap.get(k) ?? 0) + x.amount);
      if (x.status && AUTHORIZED.has(x.status) && authMap.has(k)) {
        authMap.set(k, (authMap.get(k) ?? 0) + x.amount);
      }
    }
    const lineData = {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: "Autorizado",
          data: buckets.map((b) => authMap.get(b.key) ?? 0),
          borderColor: "#1D9E75",
          backgroundColor: "rgba(29,158,117,0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
        {
          label: "Criado",
          data: buckets.map((b) => createdMap.get(b.key) ?? 0),
          borderColor: "#888780",
          borderDash: [5, 3],
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    };

    let a = 0,
      p = 0,
      f = 0;
    for (const x of r) {
      if (x.status && AUTHORIZED.has(x.status)) a++;
      else if (x.status && REFUSED.has(x.status)) f++;
      else if (x.status && PENDING.has(x.status)) p++;
      else p++;
    }
    const totalC = a + p + f;

    return {
      metrics: { created, authorized, count, avg },
      lineData,
      statusCounts: { authorized: a, pending: p, refused: f, total: totalC },
    };
  }, [rows, periodo, range.inicio, range.fim]);

  const pendingAmount = metrics.created - metrics.authorized;

  const secondaryStats = [
    { label: "Número de doações", value: String(metrics.count) },
    { label: "Valor médio por doação", value: fmtBRL(metrics.avg) },
  ];

  const pct = (n: number) =>
    statusCounts.total ? `${Math.round((n / statusCounts.total) * 100)}%` : "0%";
  const statusPills = [
    {
      color: "#1D9E75",
      label: "Autorizadas",
      count: statusCounts.authorized,
      pct: pct(statusCounts.authorized),
    },
    {
      color: "#C9A84C",
      label: "Pendentes",
      count: statusCounts.pending,
      pct: pct(statusCounts.pending),
    },
    {
      color: "#888780",
      label: "Recusadas",
      count: statusCounts.refused,
      pct: pct(statusCounts.refused),
    },
  ];

  const customAtivo = periodo === "custom";

  return (
    <section
      className="mx-auto mt-10 w-full px-4 py-4 sm:px-6 sm:py-5 md:px-6"
      style={{ maxWidth: 1200 }}
      aria-label="Resumo de doações do período"
    >
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        Resumo de doações do período
      </h2>

      {/* Filtros */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => {
            const active = periodo === q.key;
            return (
              <button
                key={q.key}
                type="button"
                onClick={() => {
                  setPeriodo(q.key);
                  setAppliedInicio("");
                  setAppliedFim("");
                  setDataInicio("");
                  setDataFim("");
                }}
                className={cn(
                  "rounded-md transition-colors",
                  active ? "border text-[#C9A84C]" : "text-muted-foreground hover:text-foreground",
                )}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  borderWidth: active ? 1 : 0.5,
                  borderStyle: "solid",
                  borderColor: active ? "#C9A84C" : "var(--border)",
                }}
              >
                {q.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="rounded-md bg-background px-3 py-1.5 text-sm"
            style={{ border: "0.5px solid var(--border)" }}
            aria-label="De"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="rounded-md bg-background px-3 py-1.5 text-sm"
            style={{ border: "0.5px solid var(--border)" }}
            aria-label="Até"
          />
          <button
            type="button"
            onClick={aplicarCustom}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-black"
            style={{ background: "#C9A84C" }}
          >
            Aplicar
          </button>
          {customAtivo && (
            <button
              type="button"
              onClick={limpar}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              style={{ border: "0.5px solid var(--border)" }}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Resumo: número-hero + secundários */}
      <div
        className="bg-card"
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg, 0.75rem)",
          padding: "20px 24px",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-6 sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Recebido no período
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-10 w-44" />
            ) : (
              <p className="font-display mt-1 text-3xl leading-none sm:text-4xl">
                {fmtBRL(metrics.authorized)}
              </p>
            )}
            {!loading && pendingAmount > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700">
                {fmtBRL(pendingAmount)} aguardando confirmação
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-left sm:gap-8 sm:text-right">
            {secondaryStats.map((s) => (
              <div key={s.label}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-20" />
                ) : (
                  <p className="font-display mt-1 text-xl">{s.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Line chart */}
      <div
        className="mt-6 bg-card"
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg, 0.75rem)",
          padding: 20,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Volume total de doações</div>
            <div className="text-xs text-muted-foreground">
              {PERIOD_LABEL[periodo]} — valores em R$
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { c: "#1D9E75", l: "Autorizado" },
              { c: "#888780", l: "Criado" },
            ].map((it) => (
              <span key={it.l} className="flex items-center gap-1.5">
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: it.c,
                    display: "inline-block",
                    borderRadius: 2,
                  }}
                />
                {it.l}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4" style={{ height: 260 }}>
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <Line
              data={lineData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: {
                    ticks: {
                      callback: (v) => "R$ " + Number(v).toLocaleString("pt-BR"),
                    },
                  },
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Status: pílulas em vez de gráfico de barra */}
      <div
        className="mt-6 bg-card"
        style={{
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius-lg, 0.75rem)",
          padding: 20,
        }}
      >
        <div className="font-medium">Doações por status</div>
        <div className="text-xs text-muted-foreground">Distribuição acumulada de doações</div>
        <div className="mt-4 flex flex-wrap gap-3">
          {loading ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            statusPills.map((it) => (
              <div
                key={it.label}
                className="flex flex-1 min-w-[140px] items-center gap-3 rounded-lg bg-muted/60 px-4 py-3"
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: it.color,
                    display: "inline-block",
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p className="text-xs text-muted-foreground">{it.label}</p>
                  <p className="font-display text-lg">
                    {it.count} <span className="text-xs text-muted-foreground">({it.pct})</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
