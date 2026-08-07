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
import type { TransferItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

type Props = {
  items?: TransferItem[];
  loading?: boolean;
  showRecipient?: boolean;
};

export function TransfersTable({ items, loading, showRecipient }: Props) {
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(
    items ?? [],
    10,
  );

  if (loading) return <DataTableLoading rows={5} columns={5} />;

  if (!items || items.length === 0) {
    return (
      <DataTableEmpty
        title="Nenhuma retirada encontrada"
        description="As retiradas solicitadas aparecem aqui com o banco de destino."
      />
    );
  }
  return (
    <>
      <DataTableCards>
        {paginated.map((t) => (
          <DataTableCard
            key={t.id}
            title={brl(t.amount)}
            subtitle={t.bank_account?.bank ?? "Banco não informado"}
            badge={<StatusBadge status={t.status} />}
            meta={fmtDate(t.created_at)}
          />
        ))}
      </DataTableCards>

      <DataTableShell className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Banco destino</TableHead>
              {showRecipient && <TableHead>Recebedor</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(t.created_at)}</TableCell>
                <TableMoneyCell>{brl(t.amount)}</TableMoneyCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.bank_account?.bank ?? "—"}{" "}
                  {t.bank_account?.branch_number ? `· Ag ${t.bank_account.branch_number}` : ""}{" "}
                  {t.bank_account?.account_number ? `· CC ${t.bank_account.account_number}` : ""}
                </TableCell>
                {showRecipient && <TableCell className="text-xs">—</TableCell>}
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
        itemLabel={total === 1 ? "retirada" : "retiradas"}
      />
    </>
  );
}
