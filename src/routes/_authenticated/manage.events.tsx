import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { uploadEventBanner } from "@/lib/events.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, ExternalLink, HandHeart, Plus, Pencil, Trash2 } from "lucide-react";
import { EventNeedsPanel } from "@/components/events/EventNeedsPanel";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { externalEventUrlSchema, EXTERNAL_URL_PLACEHOLDER } from "@/lib/validators/url";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/manage/events")({
  component: ManageEventsPage,
  head: () => ({ meta: [{ title: "Eventos — Gestão" }] }),
});

const formSchema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(140),
  date: z.string().optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  banner_url: z.string().trim().url("Banner inválido").optional().or(z.literal("")),
  external_url: externalEventUrlSchema,
});
type FormData = z.infer<typeof formSchema>;

const empty: FormData = {
  title: "",
  date: "",
  location: "",
  description: "",
  banner_url: "",
  external_url: EXTERNAL_URL_PLACEHOLDER,
};

type EventRow = {
  id: string;
  title: string;
  date: string | null;
  location: string | null;
  description: string | null;
  banner_url: string | null;
  external_url: string;
  status: string;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ManageEventsPage() {
  const { profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(empty);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [toDelete, setToDelete] = useState<EventRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadBannerFn = useServerFn(uploadEventBanner);

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Envie uma imagem PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("A imagem deve ter até 6MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(file);
      });
      const result = await uploadBannerFn({
        data: { base64, contentType: file.type, filename: file.name },
      });
      setForm((f) => ({ ...f, banner_url: result.url }));
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setUploading(false);
    }
  }
  const { data: events, isLoading } = useQuery({
    queryKey: ["manage-events", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,title,date,location,description,banner_url,external_url,status,created_at")
        .eq("tenant_id", tenantId!)
        .order("date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (data: FormData) => {
      if (!tenantId) throw new Error("Tenant não definido");
      const parsed = formSchema.parse(data);
      const payload = {
        title: parsed.title,
        date: parsed.date ? new Date(parsed.date).toISOString() : null,
        location: parsed.location || null,
        description: parsed.description || null,
        banner_url: parsed.banner_url || null,
        external_url: parsed.external_url,
      };
      if (editing) {
        const { error } = await supabase.from("events").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("events")
          .insert({ tenant_id: tenantId, ...payload, status: "active" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Evento atualizado" : "Evento cadastrado");
      setOpen(false);
      setEditing(null);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["manage-events", tenantId] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento excluído");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["manage-events", tenantId] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const [needsFor, setNeedsFor] = useState<string | null>(null);

  function startEdit(ev: EventRow) {
    setEditing(ev);
    setForm({
      title: ev.title,
      date: ev.date ? toLocalInput(ev.date) : "",
      location: ev.location ?? "",
      description: ev.description ?? "",
      banner_url: ev.banner_url ?? "",
      external_url: ev.external_url,
    });
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = formSchema.safeParse(form);
    if (!r.success) {
      toast.error(r.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    saveMut.mutate(r.data);
  }

  return (
    <div>
      <BackButton />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl">Eventos</h1>
          <p className="mt-1 text-muted-foreground">
            Cadastre eventos da igreja. A inscrição é feita no link externo.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditing(null);
              setForm(empty);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar evento" : "Novo evento"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  maxLength={140}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="date">Data e hora</Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="location">Local</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <div>
                  <Label>Banner do Evento</Label>

                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    disabled={uploading}
                  />

                  {uploading && (
                    <p className="mt-2 text-sm text-muted-foreground">Enviando imagem...</p>
                  )}

                  {form.banner_url && (
                    <img
                      src={form.banner_url}
                      alt="Banner"
                      className="mt-3 h-48 w-full rounded-lg border object-cover"
                    />
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="external_url">URL do evento *</Label>
                <Input
                  id="external_url"
                  type="url"
                  required
                  placeholder="https://exemplo.com/seu-evento"
                  value={form.external_url}
                  onChange={(e) => setForm({ ...form, external_url: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Link de inscrição, bilheteria ou formulário.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8 grid auto-rows-fr gap-4 md:grid-cols-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (events?.length ?? 0) === 0 ? (
          <Card className="col-span-full p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum evento cadastrado.</p>
          </Card>
        ) : (
          events!.map((ev) => (
            <Card key={ev.id} className="flex h-full flex-col overflow-hidden">
              {/* Área de capa: sempre presente, sempre a mesma altura, com ou
                  sem imagem — cards sem banner nunca ficam menores nem com o
                  conteúdo começando "colado" no topo do card. */}
              {ev.banner_url ? (
                <img
                  src={ev.banner_url}
                  alt={ev.title}
                  className="h-40 w-full shrink-0 rounded-t-xl object-cover"
                />
              ) : (
                <div className="flex h-40 w-full shrink-0 items-center justify-center rounded-t-xl bg-gradient-to-br from-primary/15 via-accent/40 to-primary/5">
                  <Calendar className="h-10 w-10 text-primary/50" strokeWidth={1.5} />
                </div>
              )}

              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg break-words">{ev.title}</h3>

                {ev.date && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(ev.date).toLocaleString("pt-BR")}
                  </p>
                )}
                {ev.location && <p className="text-xs text-muted-foreground">{ev.location}</p>}

                {ev.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {ev.description}
                  </p>
                )}

                {/* Espaçador flexível: empurra o rodapé (link, ações, selo)
                    para uma posição consistente mesmo quando a descrição
                    varia de tamanho entre os cards da mesma linha. */}
                <div className="flex-1" />

                <a
                  href={ev.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Participar do Evento <ExternalLink className="h-3.5 w-3.5" />
                </a>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(ev as EventRow)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setNeedsFor(ev.id)}>
                      <HandHeart className="mr-1.5 h-3.5 w-3.5" /> Padrinhos e itens
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setToDelete(ev as EventRow)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                  <Badge variant={ev.status === "active" ? "default" : "secondary"}>
                    {ev.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento</AlertDialogTitle>
            <AlertDialogDescription>
              O evento “{toDelete?.title}” será removido definitivamente e deixará de aparecer na
              sua página de doação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={needsFor !== null} onOpenChange={(o) => !o && setNeedsFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Padrinhos e itens da festa</DialogTitle>
            <DialogDescription>
              O que estiver ativo aqui aparece na página pública da igreja, onde qualquer pessoa
              pode se oferecer.
            </DialogDescription>
          </DialogHeader>
          {needsFor && <EventNeedsPanel eventId={needsFor} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
