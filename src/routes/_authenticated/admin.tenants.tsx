import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/lib/impersonation";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyRow, LoadingRow } from "@/components/empty-row";
import { Eye, Pause, Play, Trash2, Plus, Pencil, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  component: TenantsPage,
  head: () => ({ meta: [{ title: "Painel — Igrejas" }] }),
});

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TenantsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { start } = useImpersonation();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [imperId, setImperId] = useState<string | null>(null);
  const [imperReason, setImperReason] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id,name,slug,custom_domain,active,created_at,deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      const ids = (tenants ?? []).map((t) => t.id);
      if (!ids.length) return [];
      const [{ data: subs }, { data: dons }, { data: events }] = await Promise.all([
        supabase.from("tenant_subscriptions").select("tenant_id, status, subscription_plans(name, code, monthly_price)").in("tenant_id", ids),
        supabase.from("donations").select("tenant_id, amount, created_at").in("tenant_id", ids).is("deleted_at", null),
        supabase.from("events").select("tenant_id, id").in("tenant_id", ids).eq("status", "active"),
      ]);
      const since = new Date(); since.setDate(since.getDate() - 30);
      return (tenants ?? []).map((t) => {
        const sub = subs?.find((s: { tenant_id: string }) => s.tenant_id === t.id);
        const myDons = (dons ?? []).filter((d: { tenant_id: string }) => d.tenant_id === t.id);
        const total = myDons.reduce((s, d: { amount: number }) => s + Number(d.amount), 0);
        const monthly = myDons.filter((d: { created_at: string }) => new Date(d.created_at) >= since)
          .reduce((s, d: { amount: number }) => s + Number(d.amount), 0);
        const ev = (events ?? []).filter((e: { tenant_id: string }) => e.tenant_id === t.id).length;
        return { ...t, sub, total, monthly, eventsCount: ev };
      });
    },
  });

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from("tenants").update({ active: !current }).eq("id", id);
    if (error) toast.error(translateError(error));
    else { toast.success(current ? "Igreja suspensa" : "Igreja reativada"); qc.invalidateQueries({ queryKey: ["admin-tenants"] }); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("tenants").update({
      deleted_at: new Date().toISOString(), deleted_by: u.user?.id, active: false,
    }).eq("id", deleteId);
    setDeleteId(null);
    if (error) toast.error(translateError(error));
    else { toast.success("Igreja excluída"); qc.invalidateQueries({ queryKey: ["admin-tenants"] }); }
  };

  const confirmImpersonate = async () => {
    if (!imperId) return;
    try {
      await start(imperId, imperReason || undefined);
      toast.success("Impersonação iniciada");
      setImperId(null); setImperReason("");
      nav({ to: "/dashboard" });
    } catch (e) {
      toast.error(translateError(e));
    }
  };

  const filtered = (data ?? []).filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.custom_domain ?? "").toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Gestão de Igrejas</h1>
          <p className="text-sm text-muted-foreground">Todas as igrejas da plataforma.</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/igrejas/nova" search={{ tenantId: undefined }}>
            <Plus className="h-4 w-4" />
            Adicionar Igreja
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, slug ou domínio"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-8"
        />
      </div>

      <Card className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Igreja</TableHead>
              <TableHead>Slug / Domínio</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead className="text-right">Mensal</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Eventos</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <LoadingRow colSpan={9} />}
            {!isLoading && filtered.length === 0 && (
              <EmptyRow
                colSpan={9}
                message={search ? "Nenhuma igreja encontrada para essa busca." : "Nenhuma igreja cadastrada."}
              />
            )}
            {paginated.map((t, i) => (
              <TableRow key={t.id} className={i % 2 === 1 ? "bg-muted/40" : undefined}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.slug}{t.custom_domain ? ` · ${t.custom_domain}` : ""}
                </TableCell>
                <TableCell>
                  {t.active ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="destructive">Suspensa</Badge>}
                </TableCell>
                <TableCell className="text-xs">
                  {t.sub?.subscription_plans?.name ?? "—"} <span className="text-muted-foreground">({t.sub?.status ?? "—"})</span>
                </TableCell>
                <TableCell className="text-right">{fmtBRL(t.monthly)}</TableCell>
                <TableCell className="text-right">{fmtBRL(t.total)}</TableCell>
                <TableCell className="text-right">{t.eventsCount}</TableCell>
                <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Editar igreja" asChild>
                      <Link to="/igrejas/nova" search={{ tenantId: t.id }}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost" title="Acessar como" onClick={() => { setImperId(t.id); setImperReason(""); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title={t.active ? "Suspender" : "Reativar"} onClick={() => toggleActive(t.id, t.active)}>
                      {t.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "igreja" : "igrejas"}
            {search ? ` (filtradas de ${data?.length ?? 0})` : ""} — página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta igreja?</AlertDialogTitle>
            <AlertDialogDescription>
              A igreja será marcada como excluída e suspensa. Dados financeiros são preservados para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!imperId} onOpenChange={(v) => { if (!v) { setImperId(null); setImperReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acessar como esta igreja</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A ação será registrada na auditoria. Descreva brevemente o motivo.
            </p>
            <Textarea
              placeholder="Motivo (opcional)"
              value={imperReason}
              onChange={(e) => setImperReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImperId(null); setImperReason(""); }}>Cancelar</Button>
            <Button onClick={confirmImpersonate}>Iniciar impersonação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
