import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMoneyCell,
  TableRow,
} from "@/components/ui/table";
import {
  DataTableShell,
  DataTableLoading,
  DataTableEmpty,
  DataTableCards,
  DataTableCard,
} from "@/components/data-table";
import { StatusBadge } from "./StatusBadge";
import { brl, fmtDate, translateMethod } from "./format";
import type { PaymentListItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

type Props = {
  items?: PaymentListItem[];
  loading?: boolean;
};

export function PaymentsTable({ items, loading }: Props) {
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(
    items ?? [],
    10,
  );

  if (loading) return <DataTableLoading rows={5} columns={4} />;

  if (!items || items.length === 0) {
    return (
      <DataTableEmpty
        title="Nenhuma doação no período"
        description="Ajuste o período acima para ver outras datas."
      />
    );
  }

  return (
    <>
      <DataTableCards>
        {paginated.map((p) => (
          <DataTableCard
            key={p.id}
            title={translateMethod(p.method) + (p.card_brand ? ` · ${p.card_brand}` : "")}
            value={brl(p.donation_amount)}
            badge={<StatusBadge status={p.status} />}
            meta={fmtDate(p.created_at)}
          />
        ))}
      </DataTableCards>

      <DataTableShell className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Forma de pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(p.created_at)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {translateMethod(p.method)}
                  {p.card_brand ? ` · ${p.card_brand}` : ""}
                </TableCell>
                <TableMoneyCell>{brl(p.donation_amount)}</TableMoneyCell>
                <TableCell>
                  <StatusBadge status={p.status} />
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
        itemLabel={total === 1 ? "pagamento" : "pagamentos"}
      />
    </>
  );
}
