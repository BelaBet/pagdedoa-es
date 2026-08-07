import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMoneyCell,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyRow, LoadingRow } from "@/components/empty-row";
import { TablePagination } from "@/components/table-pagination";
import { usePagination } from "@/lib/use-pagination";
import {
  MoreVertical,
  Search,
  UserCheck,
  UserX,
  Eye,
  Pencil,
  Trash2,
  Building2,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/manage/members")({
  component: SuperAdminMembersPage,
});

type Tenant = {
  id: string;
  name: string;
  slug: string;
  active: boolean | null;
  created_at: string;
  trade_name: string | null;
};
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: "pending" | "approved" | "blocked";
  created_at: string;
  tenant_id: string;
};
type Role = "admin" | "manager" | "member";

function SuperAdminMembersPage() {
  const { profile: me } = useAuth();
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    (async () => {
      if (!me?.id) return;
      const { data } = await supabase
        .from("platform_roles")
        .select("role")
        .eq("user_id", me.id)
        .eq("role", "super_admin")
        .maybeSingle();
      setIsSuper(!!data);
    })();
  }, [me?.id]);

  const loadTenants = async () => {
    setLoading(true);
    const [{ data: ts }, { data: ps }] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, active, created_at, trade_name")
        .order("name"),
      supabase.from("profiles").select("tenant_id"),
    ]);
    setTenants((ts ?? []) as Tenant[]);
    const map: Record<string, number> = {};
    (ps ?? []).forEach((p: { tenant_id: string }) => {
      map[p.tenant_id] = (map[p.tenant_id] ?? 0) + 1;
    });
    setCounts(map);
    setLoading(false);
  };

  useEffect(() => {
    if (isSuper) loadTenants();
  }, [isSuper]);

  const filtered = useMemo(() => {
    if (!search) return tenants;
    const q = search.toLowerCase();
    return tenants.filter((t) =>
      `${t.name} ${t.slug} ${t.trade_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [tenants, search]);
  const { page, setPage, totalPages, paginated, total, start, end } = usePagination(filtered, 10);

  const doDeleteTenant = async () => {
    if (!deleteTenant) return;
    const { error } = await supabase.from("tenants").delete().eq("id", deleteTenant.id);
    if (error) return toast.error(translateError(error));
    toast.success("Instituição removida");
    setDeleteTenant(null);
    loadTenants();
  };

  if (isSuper === null) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (isSuper === false) {
    return (
      <Card className="m-6 p-8 text-center space-y-2">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="font-display text-xl">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">
          Este painel é exclusivo para super administradores da plataforma.
        </p>
      </Card>
    );
  }

  if (selectedTenant) {
    return (
      <TenantMembersView
        tenant={selectedTenant}
        onBack={() => {
          setSelectedTenant(null);
          loadTenants();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Instituições</h1>
        <p className="text-sm text-muted-foreground">
          Painel do super administrador — gerencie instituições cadastradas.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar instituição por nome ou slug"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Badge variant="outline">{tenants.length} instituições</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instituição</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Instituições</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRow colSpan={6} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={6} message="Nenhuma instituição encontrada." />
              ) : (
                paginated.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTenant(t)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {t.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.slug}</TableCell>
                    <TableCell>{counts[t.id] ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={t.active ? "default" : "secondary"}>
                        {t.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(t.created_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedTenant(t)}>
                            <Eye className="h-4 w-4" /> Ver instituições
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTenant(t)}>
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTenant(t)}
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
          itemLabel={total === 1 ? "instituição" : "instituições"}
        />
      </Card>

      <TenantEditDialog
        tenant={editTenant}
        onOpenChange={(v) => !v && setEditTenant(null)}
        onSaved={() => {
          setEditTenant(null);
          loadTenants();
        }}
      />

      <AlertDialog open={!!deleteTenant} onOpenChange={(v) => !v && setDeleteTenant(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instituição?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente <b>{deleteTenant?.name}</b> e todos os dados
              associados. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDeleteTenant}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TenantEditDialog({
  tenant,
  onOpenChange,
  onSaved,
}: {
  tenant: Tenant | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setActive(tenant.active ?? true);
    }
  }, [tenant]);

  if (!tenant) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ name, slug, active })
      .eq("id", tenant.id);
    setSaving(false);
    if (error) return toast.error(translateError(error));
    toast.success("Instituição atualizada");
    onSaved();
  };

  return (
    <Dialog open={!!tenant} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar instituição</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="text-sm font-medium">Ativa</p>
              <p className="text-xs text-muted-foreground">
                Instituições inativas ficam ocultas no app.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TenantMembersView({ tenant, onBack }: { tenant: Tenant; onBack: () => void }) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [donations, setDonations] = useState<{ profile_id: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteMember, setDeleteMember] = useState<Profile | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: ps }, { data: rs }, { data: ds }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, status, created_at, tenant_id")
        .eq("tenant_id", tenant.id),
      supabase.from("user_roles").select("user_id, role").eq("tenant_id", tenant.id),
      supabase.from("donations").select("profile_id, amount").eq("tenant_id", tenant.id),
    ]);
    setMembers((ps ?? []) as Profile[]);
    const rmap: Record<string, Role> = {};
    (rs ?? []).forEach((r: { user_id: string; role: Role }) => {
      rmap[r.user_id] = r.role;
    });
    setRoles(rmap);
    setDonations((ds ?? []) as never);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant.id]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    donations.forEach((d) =>
      m.set(d.profile_id, (m.get(d.profile_id) ?? 0) + Number(d.amount || 0)),
    );
    return m;
  }, [donations]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${m.full_name ?? ""} ${m.email ?? ""} ${m.phone ?? ""}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [members, statusFilter, search]);
  const {
    page: mPage,
    setPage: setMPage,
    totalPages: mTotalPages,
    paginated: mPaginated,
    total: mTotal,
    start: mStart,
    end: mEnd,
  } = usePagination(filtered, 10);

  const updateStatus = async (id: string, status: Profile["status"]) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) return toast.error(translateError(error));
    toast.success("Atualizado");
    load();
  };

  const changeRole = async (userId: string, role: Role) => {
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("tenant_id", tenant.id);
    if (delErr) return toast.error(translateError(delErr));
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, tenant_id: tenant.id, role });
    if (error) return toast.error(translateError(error));
    toast.success("Papel atualizado");
    load();
  };

  const doDeleteMember = async () => {
    if (!deleteMember) return;
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", deleteMember.id)
      .eq("tenant_id", tenant.id);
    const { error } = await supabase.from("profiles").delete().eq("id", deleteMember.id);
    if (error) return toast.error(translateError(error));
    toast.success("Instituição removida");
    setDeleteMember(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2">
            <Building2 className="h-6 w-6" /> {tenant.name}
          </h1>
          <p className="text-sm text-muted-foreground">Instituições desta instituição</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar nome, e-mail, telefone"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setMPage(1);
              }}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setMPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline">{members.length} instituições</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Doado</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRow colSpan={7} />
              ) : filtered.length === 0 ? (
                <EmptyRow colSpan={7} message="Nenhum membro encontrado." />
              ) : (
                mPaginated.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name ?? "—"}</TableCell>
                    <TableCell>{m.email ?? "—"}</TableCell>
                    <TableCell>{m.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={roles[m.id] ?? "member"}
                        onValueChange={(v) => changeRole(m.id, v as Role)}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Instituição</SelectItem>
                          <SelectItem value="manager">Gestor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          m.status === "approved"
                            ? "default"
                            : m.status === "pending"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {m.status === "approved"
                          ? "Aprovado"
                          : m.status === "pending"
                            ? "Pendente"
                            : "Bloqueado"}
                      </Badge>
                    </TableCell>
                    <TableMoneyCell>
                      {(totals.get(m.id) ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableMoneyCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.status !== "approved" && (
                            <DropdownMenuItem onClick={() => updateStatus(m.id, "approved")}>
                              <UserCheck className="h-4 w-4" /> Aprovar
                            </DropdownMenuItem>
                          )}
                          {m.status !== "blocked" && (
                            <DropdownMenuItem onClick={() => updateStatus(m.id, "blocked")}>
                              <UserX className="h-4 w-4" /> Bloquear
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteMember(m)}
                          >
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={mPage}
          totalPages={mTotalPages}
          total={mTotal}
          start={mStart}
          end={mEnd}
          onPageChange={setMPage}
          itemLabel={mTotal === 1 ? "membro" : "membros"}
        />
      </Card>

      <AlertDialog open={!!deleteMember} onOpenChange={(v) => !v && setDeleteMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instituição?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <b>{deleteMember?.full_name ?? deleteMember?.email}</b> desta instituição.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDeleteMember}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
