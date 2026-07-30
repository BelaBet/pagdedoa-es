import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAllEvents,
  listTenantsForAdmin,
  createEventAsAdmin,
  updateEventAsAdmin,
  deleteEventAsAdmin,
  uploadEventBanner,
} from "@/lib/events.functions";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmptyRow, LoadingRow } from "@/components/empty-row";
import { ExternalLink, Calendar, Plus, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { externalEventUrlSchema, TICKETTO_BASE } from "@/lib/validators/url";
import { z } from "zod";
import { useImpersonation } from "@/lib/impersonation";

export const Route = createFileRoute("/_authenticated/admin/events")({
  component: AdminEventsPage,
  head: () => ({ meta: [{ title: "Eventos — Plataforma" }] }),
});

type AdminEvent = {
  id: string;
  title: string;
  date: string | null;
  location: string | null;
  description: string | null;
  banner_url: string | null;
  external_url: string;
  status: string;
  created_at: string;
  tenant_id: string;
  tenants: { name: string | null; slug: string | null } | null;
};

const formSchema = z.object({
  tenant_id: z.string().uuid("Selecione uma igreja"),
  title: z.string().trim().min(2, "Título obrigatório").max(140),
  date: z.string().optional(),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  banner_url: z.string().trim().url("Banner inválido").optional().or(z.literal("")),
  external_url: externalEventUrlSchema,
});
type FormData = z.infer<typeof formSchema>;

const empty: FormData = {
  tenant_id: "",
  title: "",
  date: "",
  location: "",
  description: "",
  banner_url: "",
  external_url: TICKETTO_BASE,
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}



function AdminEventsPage() {
  const qc = useQueryClient();
  const { active, tenantId: impersonatedTenantId } = useImpersonation();
  const fetchEvents = useServerFn(getAllEvents);
  const fetchTenants = useServerFn(listTenantsForAdmin);
  const createEventFn = useServerFn(createEventAsAdmin);
  const updateEventFn = useServerFn(updateEventAsAdmin);
  const deleteEventFn = useServerFn(deleteEventAsAdmin);
  const uploadBannerFn = useServerFn(uploadEventBanner);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(empty);
  const [editing, setEditing] = useState<AdminEvent | null>(null);
  const [toDelete, setToDelete] = useState<AdminEvent | null>(null);
  const [uploading, setUploading] = useState(false);


  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-events", active ? impersonatedTenantId : null],
    queryFn: () => fetchEvents({ data: active && impersonatedTenantId ? { tenantId: impersonatedTenantId } : {} }),
  });
  const { data: tenants } = useQuery({
    queryKey: ["admin-tenants-list"],
    queryFn: () => fetchTenants(),
  });

  if (error) {
    toast.error(translateError(error));
  }

  const events = (data ?? []) as AdminEvent[];

  const saveMut = useMutation({
    mutationFn: async (d: FormData) => {
      const parsed = formSchema.parse(d);
      const payload = {
        title: parsed.title,
        date: parsed.date ? new Date(parsed.date).toISOString() : null,
        location: parsed.location || null,
        description: parsed.description || null,
        banner_url: parsed.banner_url || null,
        external_url: parsed.external_url,
      };
      if (editing) {
        await updateEventFn({ data: { id: editing.id, ...payload } });
      } else {
        await createEventFn({ data: { tenant_id: parsed.tenant_id, ...payload } });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Evento atualizado" : "Evento criado");
      setOpen(false);
      setEditing(null);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await deleteEventFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Evento excluído");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  function startEdit(ev: AdminEvent) {
    setEditing(ev);
    setForm({
      tenant_id: ev.tenant_id,
      title: ev.title,
      date: ev.date ? toLocalInput(ev.date) : "",
      location: ev.location ?? "",
      description: ev.description ?? "",
      banner_url: ev.banner_url ?? "",
      external_url: ev.external_url,
    });
    setOpen(true);
  }


  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!form.tenant_id) {
      toast.error("Selecione a igreja antes de enviar o banner.");
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Envie PNG, JPG ou WEBP.");
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
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      const result = await uploadBannerFn({
        data: {
          base64,
          contentType: file.type,
          filename: file.name,
          tenantId: form.tenant_id,
        },
      });
      setForm((f) => ({ ...f, banner_url: result.url }));
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setUploading(false);
    }
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            {active
              ? "Eventos desta instituição (impersonando)."
              : "Todos os eventos cadastrados pelas igrejas da plataforma."}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditing(null);
              setForm(empty);
            } else if (!editing && active && impersonatedTenantId) {
              setForm((f) => ({ ...f, tenant_id: impersonatedTenantId }));
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setForm(empty); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar evento" : "Novo evento (qualquer igreja)"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">

              <div>
                <Label>Igreja *</Label>
                <Select
                  value={form.tenant_id}
                  onValueChange={(v) => setForm({ ...form, tenant_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a igreja" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenants ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name ?? t.slug ?? t.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <div className="grid grid-cols-2 gap-3">
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
                <Label>Banner do Evento</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleBannerUpload}
                  disabled={uploading || !form.tenant_id}
                />
                {uploading && (
                  <p className="mt-2 text-sm text-muted-foreground">Enviando imagem…</p>
                )}
                {form.banner_url && (
                  <img
                    src={form.banner_url}
                    alt="Banner"
                    className="mt-3 h-40 w-full rounded-lg border object-cover"
                  />
                )}
              </div>
              <div>
                <Label htmlFor="external_url">URL do evento *</Label>
                <Input
                  id="external_url"
                  type="url"
                  required
                  placeholder="https://www.ticketto.com.br/evento/…"
                  value={form.external_url}
                  onChange={(e) => setForm({ ...form, external_url: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Salvando…" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              {!active && <TableHead>Igreja</TableHead>}
              <TableHead>Data</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <LoadingRow colSpan={active ? 5 : 6} />}
            {!isLoading && events.length === 0 && (
              <EmptyRow colSpan={active ? 5 : 6} message="Nenhum evento cadastrado." />
            )}
            {events.map((ev) => (
              <TableRow key={ev.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    {ev.banner_url && (
                      <img
                        src={ev.banner_url}
                        alt={ev.title}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    )}
                    <span>{ev.title}</span>
                  </div>
                </TableCell>
                {!active && (
                  <TableCell className="text-sm text-muted-foreground">
                    {ev.tenants?.name ?? "—"}
                  </TableCell>
                )}
                <TableCell className="text-sm whitespace-nowrap">
                  {ev.date ? new Date(ev.date).toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ev.location ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={ev.status === "active" ? "default" : "secondary"}>
                    {ev.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {ev.tenants?.slug && (
                      <Button asChild variant="ghost" size="icon" title="Ver página da igreja">
                        <Link
                          to="/i/$slug"
                          params={{ slug: ev.tenants.slug }}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Calendar className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild title="Abrir link externo">
                      <a href={ev.external_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
