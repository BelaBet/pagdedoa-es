import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_authenticated/manage/mensagens")({
  component: MessagesPage,
  head: () => ({ meta: [{ title: "Mensagens" }] }),
});

function MessagesPage() {
  const { isStaff, profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const [channel, setChannel] = useState<"in_app" | "sms" | "whatsapp">("in_app");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  if (!isStaff) {
    return <Card className="p-8 text-center text-muted-foreground">Acesso restrito à equipe.</Card>;
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSending(true);
    try {
      const { error: msgErr } = await supabase.from("messages").insert({
        tenant_id: tenantId,
        sender_id: profile!.id,
        channel,
        target_type: "broadcast",
        target_id: null,
        content,
        status: channel === "in_app" ? "sent" : "queued",
        sent_at: channel === "in_app" ? new Date().toISOString() : null,
      });
      if (msgErr) throw msgErr;

      if (channel === "in_app") {
        const { data } = await supabase.from("profiles").select("id").eq("tenant_id", tenantId);
        const recipientIds = (data ?? []).map((p) => p.id);
        if (recipientIds.length > 0) {
          await supabase.from("notifications").insert(
            recipientIds.map((pid) => ({
              tenant_id: tenantId,
              profile_id: pid,
              title: title || "Nova mensagem",
              body: content.slice(0, 200),
              type: "broadcast",
            })),
          );
        }
        toast.success(`Enviado para ${recipientIds.length} pessoa(s)`);
      } else {
        toast.success(`Mensagem enfileirada (${channel}). Integração em breve.`);
      }
      setTitle("");
      setContent("");
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="font-display text-3xl">Mensagens</h1>
        <p className="text-sm text-muted-foreground">Envie comunicados para sua comunidade</p>
      </div>

      <Card className="p-6">
        <form onSubmit={send} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Canal</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
            >
              <option value="in_app">In-app</option>
              <option value="sms">SMS (em breve)</option>
              <option value="whatsapp">WhatsApp (em breve)</option>
            </select>
          </div>

          {channel === "in_app" && (
            <div>
              <label className="text-sm font-medium">Título</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Culto especial"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Mensagem</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={5}
            />
          </div>

          <Button type="submit" disabled={sending}>
            <Megaphone className="h-4 w-4" /> {sending ? "Enviando..." : "Enviar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
