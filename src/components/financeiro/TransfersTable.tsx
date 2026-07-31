import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { brl, fmtDate } from "./format";
import type { TransferItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { Inbox } from "lucide-react";

type Props = {
  items?: TransferItem[];
  loading?: boolean;
  showRecipient?: boolean;
};

export function TransfersTable({ items, loading, showRecipient }: Props) {
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(items ?? [], 10);

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Inbox className="h-10 w-10 opacity-40" />
          <p className="text-sm">Ops, nenhuma solicitação foi encontrada.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Banco destino</TableHead>
              {showRecipient && <TableHead>Recebedor</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{fmtDate(t.created_at)}</TableCell>
                <TableCell className="font-medium">{brl(t.amount)}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.bank_account?.bank ?? "—"} {t.bank_account?.branch_number ? `· Ag ${t.bank_account.branch_number}` : ""} {t.bank_account?.account_number ? `· CC ${t.bank_account.account_number}` : ""}
                </TableCell>
                {showRecipient && <TableCell className="text-xs">—</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        start={start}
        end={end}
        onPageChange={setPage}
        itemLabel={total === 1 ? "retirada" : "retiradas"}
      />
    </Card>
  );
}
