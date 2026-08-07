import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Painel — Plataforma" }] }),
});

function SettingsPage() {
  const [row, setRow] = useState<{
    id?: string;
    default_primary_color: string;
    default_accent_color: string;
    default_logo_url: string | null;
    signup_open: boolean;
  } | null>(null);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setRow({
            id: data.id,
            default_primary_color: data.default_primary_color ?? "#1a3a5c",
            default_accent_color: data.default_accent_color ?? "#C9993A",
            default_logo_url: data.default_logo_url,
            signup_open: data.signup_open,
          });
      });
  }, []);

  if (!row) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const save = async () => {
    const { error } = await supabase
      .from("platform_settings")
      .update({
        default_primary_color: row.default_primary_color,
        default_accent_color: row.default_accent_color,
        default_logo_url: row.default_logo_url,
        signup_open: row.signup_open,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id!);
    if (error) toast.error(translateError(error));
    else toast.success("Configurações salvas");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl">Plataforma — White Label</h1>
        <p className="text-sm text-muted-foreground">Branding padrão e regras globais.</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="grid gap-2">
          <Label>Cor primária padrão</Label>
          <Input
            type="color"
            value={row.default_primary_color}
            onChange={(e) => setRow({ ...row, default_primary_color: e.target.value })}
            className="h-10 w-20"
          />
        </div>
        <div className="grid gap-2">
          <Label>Cor de destaque padrão</Label>
          <Input
            type="color"
            value={row.default_accent_color}
            onChange={(e) => setRow({ ...row, default_accent_color: e.target.value })}
            className="h-10 w-20"
          />
        </div>
        <div className="grid gap-2">
          <Label>Logo padrão (URL)</Label>
          <Input
            value={row.default_logo_url ?? ""}
            onChange={(e) => setRow({ ...row, default_logo_url: e.target.value || null })}
            placeholder="https://..."
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Cadastro aberto</Label>
            <p className="text-xs text-muted-foreground">
              Permite criação de novos tenants sem aprovação manual.
            </p>
          </div>
          <Switch
            checked={row.signup_open}
            onCheckedChange={(v) => setRow({ ...row, signup_open: v })}
          />
        </div>
        <Button onClick={save}>Salvar</Button>
      </Card>
    </div>
  );
}
