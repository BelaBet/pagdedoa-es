import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ShieldAlert, Crown, Users, Building2, CreditCard, Activity } from "lucide-react";
import { initials } from "@/lib/utils";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { RecipientsSection } from "@/components/superadmin/RecipientsSection";
import { CostCentersSection } from "@/components/superadmin/CostCentersSection";

export const Route = createFileRoute("/_authenticated/super-admin")({
  component: SuperAdminPage,
});

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  active: boolean;
  created_at: string;
};

type PlatformMember = {
  user_id: string;
  role: string;
  created_at: string;
};

function SuperAdminPage() {
  const { isSuperAdmin, loading } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["super-admin", "stats"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const [t, p, s, pr] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("tenant_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("platform_roles").select("user_id", { count: "exact", head: true }),
      ]);
      return {
        tenants: t.count ?? 0,
        users: p.count ?? 0,
        activeSubs: s.count ?? 0,
        platformMembers: pr.count ?? 0,
      };
    },
  });

  const { data: tenants } = useQuery({
    queryKey: ["super-admin", "tenants"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id,name,slug,logo_url,active,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as TenantRow[];
    },
  });

  const { data: platformMembers } = useQuery({
    queryKey: ["super-admin", "platform-members"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_roles")
        .select("user_id,role,created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as PlatformMember[];
    },
  });

  if (loading) return null;

  if (!isSuperAdmin) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="font-display text-xl">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é exclusiva para super administradores da plataforma.
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-600">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Centro de Doações
            </p>
            <h1 className="font-display text-2xl leading-tight">Plataforma de igrejas</h1>
            <p className="text-sm text-muted-foreground">
              Gestão das igrejas administradas pela plataforma
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Ir para painel da plataforma</Link>
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="Igrejas"
          value={stats?.tenants ?? "—"}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Usuários"
          value={stats?.users ?? "—"}
        />
        <StatCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Assinaturas ativas"
          value={stats?.activeSubs ?? "—"}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Equipe plataforma"
          value={stats?.platformMembers ?? "—"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Igrejas cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tenants?.length ? (
            tenants.map((t) => <TenantRowItem key={t.id} tenant={t} />)
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma igreja cadastrada.</p>
          )}
        </CardContent>
      </Card>

      <RecipientsSection />

      <CostCentersSection />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe da plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {platformMembers?.length ? (
            platformMembers.map((m) => (
              <div
                key={`${m.user_id}-${m.role}`}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <code className="truncate text-xs text-muted-foreground">{m.user_id}</code>
                <Badge variant={m.role === "super_admin" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma instituição da plataforma.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl">{value}</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function TenantRowItem({ tenant }: { tenant: TenantRow }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("tenants").update({ active }).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: (_d, active) => {
      toast.success(active ? "Igreja ativada" : "Igreja desativada");
      qc.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-primary text-primary-foreground text-xs font-medium grid place-items-center">
          {initials(tenant.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{tenant.name}</div>
          <div className="truncate text-xs text-muted-foreground">/{tenant.slug}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={tenant.active ? "default" : "secondary"}>
          {tenant.active ? "Ativa" : "Inativa"}
        </Badge>
        <Switch
          checked={tenant.active}
          disabled={mutation.isPending}
          onCheckedChange={(v) => mutation.mutate(v)}
          aria-label="Ativar igreja"
        />
      </div>
    </div>
  );
}
