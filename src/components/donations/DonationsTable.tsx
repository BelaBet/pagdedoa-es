import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableMoneyCell,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/financeiro/StatusBadge";
import { brl, fmtDate, translateMethod } from "@/components/financeiro/format";
import { getDonationsList, getTenantOptions } from "@/lib/donations.functions";
import { useImpersonation } from "@/lib/impersonation";
import { DonationDetailDialog } from "./DonationDetailDialog";
import { TablePagination } from "@/components/table-pagination";
import { Search } from "lucide-react";
import {
  DataTableShell,
  DataTableToolbar,
  DataTableLoading,
  DataTableEmpty,
  DataTableNoResults,
  DataTableError,
  DataTableCards,
  DataTableCard,
} from "@/components/data-table";

const PAGE_SIZE = 10;

const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Mes corrente: o recorte de quem fecha caixa mensal. */
function currentMonthRange() {
  const now = new Date();
  return {
    periodStart: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    periodEnd: toIso(now),
  };
}

const PERIOD_SHORTCUTS: {
  label: string;
  range: () => { periodStart: string; periodEnd: string };
}[] = [
  { label: "Este mês", range: currentMonthRange },
  {
    label: "Mês passado",
    range: () => {
      const n = new Date();
      return {
        periodStart: toIso(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        periodEnd: toIso(new Date(n.getFullYear(), n.getMonth(), 0)),
      };
    },
  },
  {
    label: "Este ano",
    range: () => {
      const n = new Date();
      return { periodStart: toIso(new Date(n.getFullYear(), 0, 1)), periodEnd: toIso(n) };
    },
  },
];

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-xl">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DonationsTable({ showTenantFilter = true }: { showTenantFilter?: boolean } = {}) {
  const [period, setPeriod] = useState(currentMonthRange);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { active: impersonating, tenantId: impersonatedTenantId } = useImpersonation();

  const listFn = useServerFn(getDonationsList);
  const tenantsFn = useServerFn(getTenantOptions);

  const tenants = useQuery({
    queryKey: ["donation-tenant-options"],
    queryFn: () => tenantsFn(),
    enabled: showTenantFilter && !impersonating,
  });
  const isPlatformView =
    showTenantFilter && !impersonating && (tenants.data?.isPlatformAdmin ?? false);

  // Quando um super admin impersona uma igreja, força o filtro para o tenant
  // impersonado — mesmo sendo super admin de verdade, a tela de Doações deve
  // mostrar somente as informações da igreja em questão.
  const effectiveTenantId =
    impersonating && impersonatedTenantId
      ? impersonatedTenantId
      : tenantFilter !== "all"
        ? tenantFilter
        : undefined;

  const donations = useQuery({
    queryKey: ["donations-list", period, effectiveTenantId ?? "all", page],
    queryFn: () =>
      listFn({
        data: {
          ...period,
          tenantId: effectiveTenantId,
          page,
          size: PAGE_SIZE,
        },
      }),
  });

  const total = donations.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // volta para a primeira página sempre que filtros mudarem
  useEffect(() => {
    setPage(1);
  }, [period.periodStart, period.periodEnd, effectiveTenantId, search]);

  const filtered = (donations.data?.items ?? []).filter((d) =>
    search ? (d.donorName ?? "").toLowerCase().includes(search.toLowerCase()) : true,
  );

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">Doações</h1>
        <p className="text-sm text-muted-foreground">
          {isPlatformView
            ? "Todas as contribuições recebidas na plataforma"
            : "Lista de contribuições recebidas pela sua igreja"}
        </p>
      </div>

      {!donations.isLoading && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCell
            label="Recebido no período"
            value={brl(donations.data?.summary?.grossCents ?? 0)}
          />
          <SummaryCell
            label={isPlatformView ? "Repassado às igrejas" : "Líquido para a igreja"}
            value={brl(donations.data?.summary?.netCents ?? 0)}
          />
          <SummaryCell
            label="Doações confirmadas"
            value={String(donations.data?.summary?.paidCount ?? 0)}
          />
        </div>
      )}

      <DataTableToolbar>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={period.periodStart}
            onChange={(e) => setPeriod((p) => ({ ...p, periodStart: e.target.value }))}
            className="w-40"
            aria-label="De"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={period.periodEnd}
            onChange={(e) => setPeriod((p) => ({ ...p, periodEnd: e.target.value }))}
            className="w-40"
            aria-label="Até"
          />
        </div>
        <div className="flex items-center gap-1">
          {PERIOD_SHORTCUTS.map((sc) => {
            const r = sc.range();
            const ativo = r.periodStart === period.periodStart && r.periodEnd === period.periodEnd;
            return (
              <button
                key={sc.label}
                type="button"
                onClick={() => setPeriod(r)}
                className={
                  "h-9 px-3 text-xs border transition-colors " +
                  (ativo
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {sc.label}
              </button>
            );
          })}
        </div>
        {isPlatformView && (
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todas as instituições" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as instituições</SelectItem>
              {tenants.data?.items.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </DataTableToolbar>

      {donations.isError ? (
        <DataTableError
          message={(donations.error as Error)?.message}
          onRetry={() => donations.refetch()}
        />
      ) : donations.isLoading ? (
        <DataTableLoading rows={6} columns={isPlatformView ? 6 : 5} />
      ) : filtered.length === 0 ? (
        search || total > 0 ? (
          <DataTableNoResults
            onClear={() => {
              setSearch("");
              setPeriod(currentMonthRange());
            }}
          />
        ) : (
          <DataTableEmpty
            title="Nenhuma doação recebida ainda"
            description="Assim que a primeira contribuição entrar, ela aparece aqui."
          />
        )
      ) : (
        <>
          {/* Celular: cada doacao vira card, com doador, valor e status
              visiveis de imediato; o resto fica no detalhe ao tocar. */}
          <DataTableCards>
            {filtered.map((d) => (
              <DataTableCard
                key={d.id}
                title={d.donorName ?? "Doador não identificado"}
                subtitle={
                  isPlatformView
                    ? (d.tenantName ?? undefined)
                    : `${translateMethod(d.paymentMethod)}${d.cardBrand ? ` · ${d.cardBrand}` : ""}`
                }
                value={brl(d.amountCents)}
                badge={<StatusBadge status={d.status} />}
                meta={fmtDate(d.createdAt)}
                onClick={() => setSelectedId(d.id)}
              />
            ))}
          </DataTableCards>

          <DataTableShell className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doador</TableHead>
                  {isPlatformView && <TableHead>Instituição</TableHead>}
                  <TableHead>Forma de pagamento</TableHead>
                  <TableHead className="text-right">
                    {isPlatformView ? "Valor bruto" : "Valor"}
                  </TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(d.id)}
                  >
                    <TableCell className="font-medium">{d.donorName ?? "—"}</TableCell>
                    {isPlatformView && (
                      <TableCell className="text-muted-foreground">{d.tenantName ?? "—"}</TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {translateMethod(d.paymentMethod)}
                      {d.cardBrand ? ` · ${d.cardBrand}` : ""}
                    </TableCell>
                    <TableMoneyCell>{brl(d.amountCents)}</TableMoneyCell>
                    <TableCell className="text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
            end={Math.min(page * PAGE_SIZE, total)}
            onPageChange={goToPage}
            itemLabel={total === 1 ? "doação" : "doações"}
          />
        </>
      )}

      <DonationDetailDialog paymentId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
