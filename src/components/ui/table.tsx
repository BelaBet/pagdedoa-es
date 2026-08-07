import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Base de tabela do sistema. Tudo que e padrao visual mora aqui — padding,
 * cabecalho, zebra, hover, divisorias — para que as 14 tabelas do produto
 * herdem o mesmo tratamento sem estilo solto em cada tela.
 *
 * Ritmo de espacamento: 20px na horizontal, 15px na vertical nas celulas.
 */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    // Cabecalho na cor principal. Cantos arredondados apenas no topo externo,
    // aplicados na primeira e ultima celula para nao vazar o preenchimento.
    className={cn(
      "bg-primary text-primary-foreground",
      "[&_tr]:border-0 [&_tr]:hover:bg-transparent",
      "[&_tr>th:first-child]:rounded-tl-xl [&_tr>th:last-child]:rounded-tr-xl",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    // Zebra sutil: impares no fundo do cartao, pares num tom levissimo da
    // familia azul. Aplicada por :nth-child, entao vale para qualquer tabela.
    className={cn("[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/40", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/50 transition-colors",
        "hover:bg-accent/60 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "px-5 py-3.5 text-left align-middle text-xs font-semibold uppercase tracking-wider",
      "whitespace-nowrap text-primary-foreground/90",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-5 py-[15px] align-middle",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

/** Celula de valor monetario: alinhada a direita, tabular, com destaque. */
const TableMoneyCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <TableCell
    ref={ref}
    className={cn("text-right font-medium tabular-nums font-mono", className)}
    {...props}
  />
));
TableMoneyCell.displayName = "TableMoneyCell";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableMoneyCell,
  TableCaption,
};
