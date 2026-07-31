import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Copy, Settings2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  listTenantsWithRecipientStatus,
  type TenantRecipientRow,
  type RecipientStatus,
} from "@/lib/recipient-registration.functions";
import { BankingSetupModal } from "./BankingSetupModal";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

function statusBadge(status: string | null) {
  const s = (status ?? "not_configured") as RecipientStatus;
  switch (s) {
    case "active":
      return <Badge className="bg-emerald-500 hover:bg-emerald-500">Ativo</Badge>;
    case "registration":
      return <Badge variant="secondary">Cadastro em análise</Badge>;
    case "affiliation":
      return <Badge variant="secondary">Em afiliação</Badge>;
    case "refused":
      return <Badge variant="destructive">Recusado</Badge>;
    case "error":
      return <Badge variant="destructive">Erro</Badge>;
    case "not_configured":
    default:
      return <Badge variant="outline">Não configurado</Badge>;
  }
}

export function RecipientsSection() {
  const list = useServerFn(listTenantsWithRecipientStatus);
  const [selected, setSelected] = useState<TenantRecipientRow | null>(null);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ["superadmin-recipients"],
    queryFn: () => list(),
  });
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(tenants ?? [], 10);

  const counts = useMemo(() => {
    const c = { configured: 0, pending: 0, missing: 0, error: 0 };
    for (const t of tenants ?? []) {
      const s = t.recipient_status ?? "not_configured";
      if (s === "active") c.configured++;
      else if (s === "registration" || s === "affiliation") c.pending++;
      else if (s === "error" || s === "refused") c.error++;
      else c.missing++;
    }
    return c;
  }, [tenants]);

  const copyId = async (id: string | null) => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success("recipient_id copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recebedores Pagar.me</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusTile icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} label="Configurados" value={counts.configured} />
            <StatusTile icon={<Clock className="h-4 w-4 text-amber-500" />} label="Em análise" value={counts.pending} />
            <StatusTile icon={<Ban className="h-4 w-4 text-muted-foreground" />} label="Não configurados" value={counts.missing} />
            <StatusTile icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Com erro" value={counts.error} />
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Igreja</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : !tenants?.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum tenant.</TableCell></TableRow>
                ) : (
                  paginated.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.document ?? "—"}</TableCell>
                      <TableCell className="text-xs">{t.bank_code ?? "—"}</TableCell>
                      <TableCell>{statusBadge(t.recipient_status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {t.recipient_id && (
                            <Button size="icon" variant="ghost" onClick={() => copyId(t.recipient_id)} aria-label="Copiar recipient_id">
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={t.recipient_id && t.recipient_status !== "error" ? "outline" : "default"}
                            onClick={() => setSelected(t)}
                          >
                            {t.recipient_id && t.recipient_status !== "error" ? (
                              <><RefreshCw className="mr-1 h-3 w-3" /> Status</>
                            ) : (
                              <><Settings2 className="mr-1 h-3 w-3" /> Configurar</>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            itemLabel={total === 1 ? "igreja" : "igrejas"}
          />
        </CardContent>
      </Card>

      {selected && (
        <BankingSetupModal
          tenant={selected}
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
        />
      )}
    </>
  );
}

function StatusTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-xl">{value}</p>
      </div>
      <div className="rounded-md bg-muted p-2">{icon}</div>
    </div>
  );
}
