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
import { Search, Inbox } from "lucide-react";

const PAGE_SIZE = 10;

function last7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: toIso(start), periodEnd: toIso(end) };
}

export function DonationsTable({ showTenantFilter = true }: { showTenantFilter?: boolean } = {}) {
  const [period, setPeriod] = useState(last7DaysRange);
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

      <div className="flex flex-wrap items-end gap-2">
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
      </div>

      {donations.isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhuma doação encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
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
                    <TableCell className="text-right font-medium">{brl(d.amountCents)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
            end={Math.min(page * PAGE_SIZE, total)}
            onPageChange={goToPage}
            itemLabel={total === 1 ? "doação" : "doações"}
          />
        </Card>
      )}

      <DonationDetailDialog paymentId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
