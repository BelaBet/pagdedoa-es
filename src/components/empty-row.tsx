import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * Estados exibidos dentro do corpo da tabela, para telas que preservam o
 * cabecalho enquanto carregam. Compartilham o mesmo tratamento visual dos
 * estados de tela cheia em data-table.tsx.
 */

export function EmptyRow({
  colSpan,
  message = "Nenhum registro encontrado.",
  description,
  action,
}: {
  colSpan: number;
  message?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-14">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">{message}</p>
          {description ? (
            <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
          ) : null}
          {action ? <div className="mt-1">{action}</div> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Esqueleto que preserva a grade de colunas, em vez de um texto centralizado. */
export function LoadingRow({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: colSpan }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className={c === 0 ? "h-4 w-3/4" : "h-4 w-1/2"} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
