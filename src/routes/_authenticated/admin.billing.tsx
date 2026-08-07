import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: BillingPage,
  head: () => ({ meta: [{ title: "Painel — Financeiro" }] }),
});

const SUB_STATUS: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  paused: "Pausada",
  incomplete: "Incompleta",
};
const INV_STATUS: Record<string, string> = {
  pending: "Pendente",
  paid: "Paga",
  overdue: "Em atraso",
  canceled: "Cancelada",
  refunded: "Reembolsada",
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BillingPage() {
  const { data: plans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("*").order("sort_order");
      return data ?? [];
    },
  });
  const { data: subs } = useQuery({
    queryKey: ["subs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_subscriptions")
        .select(
          "id, status, current_period_end, tenants(name, slug), subscription_plans(name, monthly_price)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_invoices")
        .select("id, amount, status, period_start, period_end, due_date, paid_at, tenants(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const plansPg = usePagination(plans ?? [], 10);
  const subsPg = usePagination(subs ?? [], 10);
  const invoicesPg = usePagination(invoices ?? [], 10);

  const overdue = (invoices ?? []).filter((i: { status: string }) => i.status === "overdue").length;
  const mrr = (subs ?? [])
    .filter((s: { status: string }) => s.status === "active")
    .reduce(
      (acc, s: { subscription_plans?: { monthly_price?: number } | null }) =>
        acc + Number(s.subscription_plans?.monthly_price ?? 0),
      0,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Planos, assinaturas e faturas das igrejas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">MRR</div>
          <div className="font-display text-2xl">{fmtBRL(mrr)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Assinaturas ativas</div>
          <div className="font-display text-2xl">
            {(subs ?? []).filter((s: { status: string }) => s.status === "active").length}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Faturas em atraso</div>
          <div className="font-display text-2xl text-destructive">{overdue}</div>
        </Card>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="subs">Assinaturas</TabsTrigger>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
        </TabsList>

        <TabsContent value="plans">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead className="text-right">Mensal</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead className="text-right">Instituições</TableHead>
                  <TableHead className="text-right">Eventos/mês</TableHead>
                  <TableHead>Recursos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plansPg.paginated.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{fmtBRL(Number(p.monthly_price))}</TableCell>
                    <TableCell className="text-right">
                      {Number(p.transaction_fee_percent).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">{p.max_members ?? "∞"}</TableCell>
                    <TableCell className="text-right">{p.max_events_per_month ?? "∞"}</TableCell>
                    <TableCell className="text-xs">
                      {Object.entries((p.features ?? {}) as Record<string, boolean>)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={plansPg.page}
              totalPages={plansPg.totalPages}
              total={plansPg.total}
              start={plansPg.start}
              end={plansPg.end}
              onPageChange={plansPg.setPage}
              itemLabel={plansPg.total === 1 ? "plano" : "planos"}
            />
          </Card>
        </TabsContent>

        <TabsContent value="subs">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próx. cobrança</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsPg.paginated.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{(s.tenants as { name?: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell>
                      {(s.subscription_plans as { name?: string } | null)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "active"
                            ? "secondary"
                            : s.status === "past_due"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {SUB_STATUS[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(s.current_period_end).toLocaleDateString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={subsPg.page}
              totalPages={subsPg.totalPages}
              total={subsPg.total}
              start={subsPg.start}
              end={subsPg.end}
              onPageChange={subsPg.setPage}
              itemLabel={subsPg.total === 1 ? "assinatura" : "assinaturas"}
            />
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesPg.paginated.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{(i.tenants as { name?: string } | null)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtBRL(Number(i.amount))}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          i.status === "paid"
                            ? "secondary"
                            : i.status === "overdue"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {INV_STATUS[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(i.period_start).toLocaleDateString("pt-BR")} →{" "}
                      {new Date(i.period_end).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {i.due_date ? new Date(i.due_date).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(invoices?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Nenhuma fatura ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={invoicesPg.page}
              totalPages={invoicesPg.totalPages}
              total={invoicesPg.total}
              start={invoicesPg.start}
              end={invoicesPg.end}
              onPageChange={invoicesPg.setPage}
              itemLabel={invoicesPg.total === 1 ? "fatura" : "faturas"}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
