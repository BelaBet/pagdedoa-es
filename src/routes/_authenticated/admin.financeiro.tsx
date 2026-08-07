import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { FinanceiroPanel } from "@/components/financeiro/FinanceiroPanel";
import { getPlatformFeeRevenue, getRecipientBalance } from "@/lib/recipient.functions";
import { brl } from "@/components/financeiro/format";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  component: FinanceiroPlataforma,
  head: () => ({ meta: [{ title: `Financeiro ${BRAND.name}` }] }),
});

function FinanceiroPlataforma() {
  return (
    <FinanceiroPanel
      scope="platform"
      title={`Financeiro ${BRAND.name}`}
      subtitle="Visão completa da plataforma."
      showFeeDetails
      platformSummary={<PlatformOverview />}
    />
  );
}

function PlatformOverview() {
  const balanceFn = useServerFn(getRecipientBalance);
  const feesFn = useServerFn(getPlatformFeeRevenue);

  const balance = useQuery({
    queryKey: ["pagarme-balance", "platform"],
    queryFn: () => balanceFn({ data: { scope: "platform" } }),
  });
  const fees = useQuery({ queryKey: ["platform-fees"], queryFn: () => feesFn() });

  const feeRevenue = fees.data?.totalFeeCents ?? 0;
  // Estimativa simples: taxa Pagar.me média ~3,99% sobre o total processado.
  // Como temos apenas a receita de taxas (3,5% do bruto), bruto ≈ feeRevenue / 0.035.
  const grossEst = feeRevenue > 0 ? Math.round(feeRevenue / 0.035) : 0;
  const pagarmeAbsorbedEst = Math.round(grossEst * 0.0399);
  const margin = feeRevenue - pagarmeAbsorbedEst;

  return (
    <Card className="border-amber-500/30">
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-600">Plataforma Ticketto</p>
          <h2 className="font-display text-xl">Visão geral</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Saldo disponível" value={balance.isLoading ? null : brl(balance.data?.available?.amount)} />
          <Stat label="A receber" value={balance.isLoading ? null : brl(balance.data?.waiting_funds?.amount)} />
        </div>
        <div className="h-px bg-border" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Receita de taxas (3,5% adm)" value={fees.isLoading ? null : brl(feeRevenue)} />
          <Stat label="Taxa Pagar.me absorvida (estimativa)" value={fees.isLoading ? null : brl(pagarmeAbsorbedEst)} />
          <Stat label="Margem líquida estimada" value={fees.isLoading ? null : brl(margin)} highlight />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl ${highlight ? "text-amber-600" : ""}`}>
        {value === null ? <Skeleton className="h-8 w-32" /> : value}
      </p>
    </div>
  );
}
