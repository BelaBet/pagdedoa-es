import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { Download, ShieldAlert, Pencil, Check, X } from "lucide-react";
import { initials } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Meu perfil" }] }),
});

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground sm:text-right">
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

function ProfilePage() {
  const { profile, user, refresh, signOut } = useAuth();

  const { data: tenant } = useQuery({
    queryKey: ["tenant", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("name, tagline, logo_url, slug")
        .eq("id", profile!.tenant_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (!editingEmail) setEmail(user?.email ?? "");
  }, [user?.email, editingEmail]);
  useEffect(() => {
    if (!editingPhone) setPhone(profile?.phone ?? "");
  }, [profile?.phone, editingPhone]);

  const saveEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("E-mail inválido.");
    setSavingEmail(true);
    const { error: authErr } = await supabase.auth.updateUser({ email });
    if (authErr) {
      setSavingEmail(false);
      return toast.error(translateError(authErr));
    }
    await supabase.from("profiles").update({ email }).eq("id", user!.id);
    setSavingEmail(false);
    setEditingEmail(false);
    toast.success("Enviamos um link de confirmação para o novo e-mail.");
    refresh();
  };

  const savePhone = async () => {
    setSavingPhone(true);
    const { error } = await supabase.from("profiles").update({ phone }).eq("id", user!.id);
    setSavingPhone(false);
    if (error) return toast.error(translateError(error));
    setEditingPhone(false);
    toast.success("Telefone atualizado.");
    refresh();
  };

  const exportData = async () => {
    const tables = ["profiles", "tickets", "payments", "donations", "notifications"] as const;
    const out: Record<string, unknown> = {};
    for (const t of tables) {
      const { data } = await supabase.from(t).select("*");
      out[t] = data ?? [];
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meus-dados.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dados exportados.");
  };

  const anonymize = async () => {
    if (
      !confirm("Tem certeza? Seus dados pessoais serão anonimizados e não poderão ser restaurados.")
    )
      return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: "Instituição anônima", phone: null, email: null, avatar_url: null })
      .eq("id", user!.id);
    if (error) return toast.error(translateError(error));
    toast.success("Dados anonimizados.");
    await signOut();
  };

  const createdAt = user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl md:text-4xl">Meu perfil</h1>
      <p className="mt-1 text-muted-foreground">Veja suas informações e atualize seu contato.</p>

      {/* Dados pessoais */}
      <div className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="font-display text-xl">Dados pessoais</h2>
        <div className="mt-3">
          <InfoRow label="Nome completo" value={profile?.full_name} />

          {/* E-mail editável */}
          <div className="flex flex-col gap-2 border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              E-mail
            </span>
            {editingEmail ? (
              <div className="flex flex-1 items-center gap-2 sm:max-w-sm">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={saveEmail}
                  disabled={savingEmail}
                  aria-label="Salvar e-mail"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingEmail(false)}
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:text-right">
                <span className="text-sm">{user?.email}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingEmail(true)}
                  aria-label="Editar e-mail"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Telefone editável */}
          <div className="flex flex-col gap-2 border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Telefone
            </span>
            {editingPhone ? (
              <div className="flex flex-1 items-center gap-2 sm:max-w-sm">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={savePhone}
                  disabled={savingPhone}
                  aria-label="Salvar telefone"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingPhone(false)}
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 sm:text-right">
                <span className="text-sm">
                  {profile?.phone || <span className="text-muted-foreground">—</span>}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingPhone(true)}
                  aria-label="Editar telefone"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <InfoRow label="Status" value={profile?.status} />
          <InfoRow
            label="Consentimento LGPD"
            value={profile?.lgpd_consent ? "Aceito" : "Pendente"}
          />
          <InfoRow label="Instituição desde" value={createdAt} />
        </div>
      </div>

      {/* Dados da igreja (do onboarding) */}
      <div className="mt-6 rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">Minha igreja</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informações enviadas no cadastro da igreja.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/igrejas/onboarding">Editar cadastro</Link>
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary text-primary-foreground font-display text-lg">
            {initials(tenant?.name)}
          </div>
          <div>
            <p className="font-medium">{tenant?.name ?? "—"}</p>
            {tenant?.tagline && <p className="text-sm text-muted-foreground">{tenant.tagline}</p>}
          </div>
        </div>

        <div className="mt-4">
          <InfoRow label="Nome da igreja" value={tenant?.name} />
          <InfoRow label="Frase de apresentação" value={tenant?.tagline} />
          <InfoRow label="Identificador (slug)" value={tenant?.slug} />
        </div>
      </div>

      {/* LGPD */}
      <div className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="font-display text-xl">Privacidade · LGPD</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Você tem direito de acessar, exportar e solicitar a anonimização dos seus dados.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4" /> Exportar meus dados
          </Button>
          <Button variant="destructive" onClick={anonymize}>
            <ShieldAlert className="h-4 w-4" /> Anonimizar minha conta
          </Button>
        </div>
      </div>
    </div>
  );
}
