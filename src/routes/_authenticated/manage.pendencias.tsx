import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, ShieldX } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manage/pendencias")({
  component: PendenciasPage,
  head: () => ({ meta: [{ title: "Pendências de cadastro" }] }),
});

const STATUS_LABEL: Record<string, string> = {
  pending_documents: "Documentos pendentes",
  pending_financial_setup: "Configuração financeira pendente",
  active: "Cadastro completo",
  blocked: "Bloqueado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_documents: "secondary",
  pending_financial_setup: "secondary",
  active: "default",
  blocked: "destructive",
};

function PendenciasPage() {
  const { profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);

  const { data: tenant } = useQuery({
    queryKey: ["tenant-compliance", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name, compliance_status, financial_active")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["tenant-pending-docs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_pending_documents" as any)
        .select("doc_type, label, required, status")
        .eq("tenant_id", tenantId!)
        .order("required", { ascending: false });
      return (data ?? []) as unknown as Array<{
        doc_type: string;
        label: string;
        required: boolean;
        status: "pending" | "submitted" | "approved" | "rejected";
      }>;
    },
  });

  const status = tenant?.compliance_status ?? "pending_documents";
  const finActive = tenant?.financial_active === true;

  const reqPending = (docs ?? []).filter((d) => d.required && d.status !== "approved");
  const optPending = (docs ?? []).filter((d) => !d.required && d.status !== "approved");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="font-display text-2xl">Pendências de cadastro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tenant?.name ?? "Sua instituição"} — finalize as pendências para ativar pagamentos.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {finActive ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            Status do cadastro
          </CardTitle>
          <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
            {STATUS_LABEL[status] ?? status}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {finActive ? (
            <p>Tudo certo. Recebimentos via PIX, cartão e boleto estão ativos.</p>
          ) : (
            <p>
              Enquanto houver pendências, você pode usar o sistema normalmente, mas
              <strong className="text-foreground">
                {" "}
                PIX, cartão, boleto, transferências e split{" "}
              </strong>
              ficam bloqueados.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos obrigatórios</CardTitle>
        </CardHeader>
        <CardContent>
          {reqPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todos os documentos obrigatórios estão aprovados.
            </p>
          ) : (
            <ul className="divide-y">
              {reqPending.map((d) => (
                <DocRow key={d.doc_type} doc={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos opcionais</CardTitle>
        </CardHeader>
        <CardContent>
          {optPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento opcional pendente.</p>
          ) : (
            <ul className="divide-y">
              {optPending.map((d) => (
                <DocRow key={d.doc_type} doc={d} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link to="/manage/settings">Editar dados da igreja</Link>
        </Button>
      </div>
    </div>
  );
}

function DocRow({ doc }: { doc: { label: string; status: string; required: boolean } }) {
  const Icon =
    doc.status === "approved" ? CheckCircle2 : doc.status === "rejected" ? ShieldX : Clock;
  const tone =
    doc.status === "approved"
      ? "text-emerald-600"
      : doc.status === "rejected"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <li className="flex items-center justify-between py-3 text-sm">
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        {doc.label}
        {doc.required && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            obrigatório
          </Badge>
        )}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{doc.status}</span>
    </li>
  );
}
