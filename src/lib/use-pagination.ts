import { useMemo, useState } from "react";

/**
 * Paginação client-side genérica: recebe uma lista já carregada (ex: já
 * filtrada/ordenada) e devolve só a fatia da página atual, junto com tudo
 * que o <TablePagination /> precisa pra desenhar os controles.
 *
 * A página atual é sempre limitada ao total de páginas disponível — se a
 * lista encolher (ex: um filtro novo reduziu o resultado) e a página atual
 * deixar de existir, ela cai automaticamente para a última página válida,
 * nunca fica mostrando uma página vazia. Quem monta um campo de busca deve
 * chamar setPage(1) no onChange, para sempre voltar ao início ao filtrar.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paginated = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );

  const total = items.length;
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  return {
    page: currentPage,
    setPage,
    totalPages,
    paginated,
    total,
    start,
    end,
    pageSize,
  };
}
