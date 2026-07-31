import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { brl, fmtDate } from "./format";
import type { AnticipationItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { Inbox } from "lucide-react";

type Props = {
  items?: AnticipationItem[];
  loading?: boolean;
  showFeeDetails?: boolean;
};

export function AnticipationsTable({ items, loading, showFeeDetails }: Props) {
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
              <TableHead>Valor bruto</TableHead>
              <TableHead>{showFeeDetails ? "Taxa de antecipação" : "Taxa de serviço"}</TableHead>
              <TableHead>Valor líquido</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{fmtDate(a.created_at)}</TableCell>
                <TableCell className="font-medium">{brl(a.amount)}</TableCell>
                <TableCell>{brl(a.fee ?? a.anticipation_fee)}</TableCell>
                <TableCell>{brl(a.net_amount ?? (a.amount - (a.fee ?? 0)))}</TableCell>
                <TableCell>{fmtDate(a.payment_date)}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
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
        itemLabel={total === 1 ? "antecipação" : "antecipações"}
      />
    </Card>
  );
}
