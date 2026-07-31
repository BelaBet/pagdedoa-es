import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { supabase } from "@/integrations/supabase/client";
import { DynamicQrButton } from "@/components/dynamic-qr-button";
import {
  listCostCenters,
  toggleCostCenterActive,
} from "@/lib/cost-centers.functions";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";

export function CostCentersAdminPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listCostCenters);
  const toggleFn = useServerFn(toggleCostCenterActive);
  const { profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);

  const { data: tenant } = useQuery({
    queryKey: ["my-tenant-slug", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("slug, primary_color")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["cost-centers", tenantId],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId: tenantId! } }),
  });
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(rows ?? [], 10);

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost-centers", "my-tenant"] }),
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Centros de custo</CardTitle>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Para criar novos centros ou alterar taxas, fale com o suporte.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Parcelas</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">QR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : !rows?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nenhum centro disponível.</TableCell></TableRow>
              ) : (
                paginated.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                    <TableCell className="text-center text-xs">
                      {r.allows_installments ? `até ${r.max_installments}x` : "à vista"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.is_active}
                        disabled={toggleMut.isPending}
                        onCheckedChange={(v) => toggleMut.mutate({ id: r.id, isActive: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DynamicQrButton
                        url={
                          tenant?.slug
                            ? `${window.location.origin}/i/${tenant.slug}${r.slug !== "online" ? `?cc=${r.slug}` : ""}`
                            : ""
                        }
                        fileName={`qr-${r.slug}`}
                        primary={tenant?.primary_color ?? undefined}
                      />
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
          itemLabel={total === 1 ? "centro de custo" : "centros de custo"}
        />
      </CardContent>
    </Card>
  );
}
