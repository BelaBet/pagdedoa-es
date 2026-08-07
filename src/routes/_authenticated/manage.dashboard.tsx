import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { DollarSign, Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/manage/dashboard")({
  component: ManagerDashboard,
  head: () => ({ meta: [{ title: "Painel — Visão geral" }] }),
});

type Kpis = { donationsMonth: number; eventsMonth: number };

function ManagerDashboard() {
  const { profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const [kpis, setKpis] = useState<Kpis>({ donationsMonth: 0, eventsMonth: 0 });
  const [donationSeries, setDonationSeries] = useState<{ month: string; total: number }[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sem tenant resolvido ainda — não busca (e principalmente não cai para
    // "todos os tenants" como fallback, que era o bug original desta tela).
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const startMonth = startOfMonth(new Date()).toISOString();
      const endMonthIso = endOfMonth(new Date()).toISOString();

      const [donationsAllRes, donationsMonthRes, eventsMonthRes] = await Promise.all([
        supabase.from("donations").select("amount, created_at").eq("tenant_id", tenantId),
        supabase
          .from("donations")
          .select("amount")
          .eq("tenant_id", tenantId)
          .gte("created_at", startMonth)
          .lte("created_at", endMonthIso),
        supabase
          .from("events")
          .select("id")
          .eq("tenant_id", tenantId)
          .gte("date", startMonth)
          .lte("date", endMonthIso),
      ]);

      setKpis({
        donationsMonth: (donationsMonthRes.data ?? []).reduce(
          (s, d) => s + Number(d.amount || 0),
          0,
        ),
        eventsMonth: (eventsMonthRes.data ?? []).length,
      });

      // Donations trend last 6 months
      const series: { month: string; total: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const ref = subMonths(new Date(), i);
        const s = startOfMonth(ref).getTime();
        const e = endOfMonth(ref).getTime();
        const total = (donationsAllRes.data ?? [])
          .filter((d) => {
            const t = new Date(d.created_at).getTime();
            return t >= s && t <= e;
          })
          .reduce((sum, d) => sum + Number(d.amount || 0), 0);
        series.push({ month: format(ref, "MMM", { locale: ptBR }), total });
      }
      setDonationSeries(series);

      setLoading(false);
    })();
  }, [tenantId]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Dashboard analítico</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua igreja</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          icon={DollarSign}
          label="Doações no mês"
          value={fmtBRL(kpis.donationsMonth)}
          loading={loading}
        />
        <KpiCard
          icon={Calendar}
          label="Eventos no mês"
          value={kpis.eventsMonth}
          loading={loading}
        />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-medium">Doações (últimos 6 meses)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={donationSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip
              formatter={(v) => fmtBRL(Number(v))}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
