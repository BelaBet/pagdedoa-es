import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  start: number;
  end: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Nome do item no plural/singular, para o resumo (ex: "doações", "igrejas"). */
  itemLabel?: string;
};

/**
 * Controles de paginação padrão do sistema: resumo "Exibindo X–Y de Z
 * registros" + Anterior / números de página / Próxima. Some sozinho se
 * couber tudo numa página só (nada para paginar).
 *
 * Funciona tanto para paginação client-side (via usePagination) quanto
 * server-side — quem chama só precisa fornecer page/totalPages/total/
 * start/end corretos e tratar onPageChange (buscando a página nova, se for
 * paginação de servidor).
 */
export function TablePagination({
  page,
  totalPages,
  total,
  start,
  end,
  onPageChange,
  itemLabel = "registros",
}: TablePaginationProps) {
  // Regra: com menos que uma página inteira de registros, não há o que
  // paginar — o controle inteiro fica oculto.
  if (totalPages <= 1) return null;

  const pageNumbers = getPageWindow(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-2 py-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Exibindo <span className="font-medium text-foreground">{start}–{end}</span> de{" "}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1 px-2.5"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ),
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1 px-2.5"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Janela de números de página com reticências para não estourar em telas pequenas. */
function getPageWindow(current: number, total: number): (number | "...")[] {
  const delta = 1;
  const range: (number | "...")[] = [];
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  range.push(1);
  if (left > 2) range.push("...");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("...");
  if (total > 1) range.push(total);

  return range;
}
