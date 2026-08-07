import * as React from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Peças compartilhadas das tabelas do sistema.
 *
 * Existe para que carregamento, vazio, erro e barra de filtros tenham o mesmo
 * tratamento em todas as telas, em vez de cada tabela inventar o seu. As cores,
 * a tipografia e os componentes vêm do design system — nada novo é introduzido.
 */

/** Casca da tabela: borda, cantos e recorte do cabeçalho colorido. */
export function DataTableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

/**
 * Barra superior: busca e filtros à esquerda, ação principal à direita.
 * Empilha no celular em vez de espremer.
 */
export function DataTableToolbar({
  children,
  action,
  className,
}: {
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">{children}</div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Carregamento. `columns` só afeta a densidade das barras. */
export function DataTableLoading({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <DataTableShell>
      <div className="h-11 bg-primary/90" />
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-5 py-[15px]">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-4"
                style={{ width: c === 0 ? "28%" : `${Math.max(12, 60 / columns)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </DataTableShell>
  );
}

function StateFrame({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <DataTableShell>
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <div className="text-muted-foreground/50">{icon}</div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </DataTableShell>
  );
}

/** Nunca houve dado. Diferente de "o filtro não achou". */
export function DataTableEmpty({
  title = "Nada por aqui ainda",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <StateFrame
      icon={<Inbox className="h-9 w-9" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

/** Há dados, mas o recorte atual não retornou nada. */
export function DataTableNoResults({ onClear }: { onClear?: () => void }) {
  return (
    <StateFrame
      icon={<SearchX className="h-9 w-9" />}
      title="Nenhum resultado para esses filtros"
      description="Tente ampliar o período ou limpar a busca."
      action={
        onClear ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        ) : null
      }
    />
  );
}

export function DataTableError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <StateFrame
      icon={<AlertCircle className="h-9 w-9 text-destructive/60" />}
      title="Não foi possível carregar"
      description={message ?? "Verifique sua conexão e tente novamente."}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : null
      }
    />
  );
}

/**
 * No celular a tabela vira lista de cards. Use com `hidden md:block` na tabela
 * e `md:hidden` aqui — cada registro mantém o essencial visível e o toque
 * confortável.
 */
export function DataTableCards({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-2 md:hidden", className)}>{children}</div>;
}

export function DataTableCard({
  title,
  subtitle,
  value,
  badge,
  meta,
  onClick,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  onClick?: () => void;
  action?: React.ReactNode;
}) {
  const clicavel = Boolean(onClick);
  return (
    <Card
      onClick={onClick}
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn("p-4", clicavel && "cursor-pointer transition-colors hover:bg-accent/60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {value ? (
          <p className="shrink-0 font-mono font-medium tabular-nums text-foreground">{value}</p>
        ) : null}
      </div>

      {badge || meta || action ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
          </div>
          {action}
        </div>
      ) : null}
    </Card>
  );
}
