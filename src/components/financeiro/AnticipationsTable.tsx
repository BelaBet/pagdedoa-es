import {
  DataTableShell,
  DataTableLoading,
  DataTableEmpty,
  DataTableCards,
  DataTableCard,
} from "@/components/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMoneyCell,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { brl, fmtDate } from "./format";
import type { AnticipationItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

type Props = {
  items?: AnticipationItem[];
  loading?: boolean;
  showFeeDetails?: boolean;
};

export function AnticipationsTable({ items, loading, showFeeDetails }: Props) {
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(
    items ?? [],
    10,
  );

  if (loading) return <DataTableLoading rows={5} columns={4} />;

  if (!items || items.length === 0) {
    return (
      <DataTableEmpty
        title="Nenhuma antecipação encontrada"
        description="As antecipações solicitadas aparecem aqui."
      />
    );
  }
  return (
    <>
      <DataTableCards>
        {paginated.map((a) => (
          <DataTableCard
            key={a.id}
            title={brl(a.amount)}
            subtitle={`Taxa ${brl(a.fee ?? a.anticipation_fee)}`}
            badge={<StatusBadge status={a.status} />}
            meta={fmtDate(a.created_at)}
          />
        ))}
      </DataTableCards>

      <DataTableShell className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor bruto</TableHead>
              <TableHead className="text-right">
                {showFeeDetails ? "Taxa de antecipação" : "Taxa de serviço"}
              </TableHead>
              <TableHead className="text-right">Valor líquido</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{fmtDate(a.created_at)}</TableCell>
                <TableMoneyCell>{brl(a.amount)}</TableMoneyCell>
                <TableMoneyCell className="text-muted-foreground">
                  {brl(a.fee ?? a.anticipation_fee)}
                </TableMoneyCell>
                <TableCell>{brl(a.net_amount ?? a.amount - (a.fee ?? 0))}</TableCell>
                <TableCell>{fmtDate(a.payment_date)}</TableCell>
                <TableCell>
                  <StatusBadge status={a.status} />
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
        start={start}
        end={end}
        onPageChange={setPage}
        itemLabel={total === 1 ? "antecipação" : "antecipações"}
      />
    </>
  );
}
