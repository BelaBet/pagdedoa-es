import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { brl, fmtDate, translateMethod } from "./format";
import type { PaymentListItem } from "@/lib/recipient.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { Inbox } from "lucide-react";

type Props = {
  items?: PaymentListItem[];
  loading?: boolean;
};

export function PaymentsTable({ items, loading }: Props) {
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
          <p className="text-sm">Nenhuma doação encontrada no período.</p>
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
              <TableHead>Forma de pagamento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{fmtDate(p.created_at)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {translateMethod(p.method)}
                  {p.card_brand ? ` · ${p.card_brand}` : ""}
                </TableCell>
                <TableCell className="font-medium">{brl(p.donation_amount)}</TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
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
        start={start}
        end={end}
        onPageChange={setPage}
        itemLabel={total === 1 ? "pagamento" : "pagamentos"}
      />
    </Card>
  );
}
