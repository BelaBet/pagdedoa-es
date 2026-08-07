import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataTableShell,
  DataTableLoading,
  DataTableEmpty,
  DataTableCards,
  DataTableCard,
} from "@/components/data-table";
import {
  listEventNeeds,
  listEventPledges,
  createEventNeed,
  updateEventNeed,
  deleteEventNeed,
  setPledgeStatus,
} from "@/lib/event-needs.functions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  promised: "Prometido",
  fulfilled: "Cumprido",
  cancelled: "Cancelado",
};

export function EventNeedsPanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const needs = useQuery({
    queryKey: ["event-needs", eventId],
    queryFn: () => listEventNeeds({ data: { eventId } }),
  });

  const pledges = useQuery({
    queryKey: ["event-pledges", eventId],
    queryFn: () => listEventPledges({ data: { eventId } }),
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["event-needs", eventId] });
    qc.invalidateQueries({ queryKey: ["event-pledges", eventId] });
  };

  const criar = useMutation({
    mutationFn: createEventNeed,
    onSuccess: () => {
      toast.success("Necessidade adicionada.");
      setAberto(false);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: updateEventNeed,
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: deleteEventNeed,
    onSuccess: () => {
      toast.success("Necessidade removida.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: setPledgeStatus,
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg">O que a festa precisa</h3>
            <p className="text-sm text-muted-foreground">
              Padrinhos com valor em dinheiro, ou itens que as pessoas podem trazer.
            </p>
          </div>
          <Button size="sm" onClick={() => setAberto(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar
          </Button>
        </div>

        {needs.isLoading ? (
          <DataTableLoading rows={3} columns={3} />
        ) : (needs.data?.length ?? 0) === 0 ? (
          <DataTableEmpty
            title="Nada cadastrado ainda"
            description="Cadastre o que a festa precisa para que as pessoas possam se oferecer na página pública."
            action={
              <Button size="sm" onClick={() => setAberto(true)}>
                Adicionar a primeira
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {needs.data!.map((n) => {
              const pct = Math.min(100, Math.round((n.pledgedQuantity / n.targetQuantity) * 100));
              const completo = n.pledgedQuantity >= n.targetQuantity;
              return (
                <Card key={n.id} className={n.isActive ? undefined : "opacity-60"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.kind === "sponsorship"
                            ? `${brl(n.amountPerUnit ?? 0)} por cota`
                            : n.unit
                              ? `Medida: ${n.unit}`
                              : "Item"}
                        </p>
                      </div>
                      <Badge variant={n.kind === "sponsorship" ? "default" : "secondary"}>
                        {n.kind === "sponsorship" ? "Padrinho" : "Item"}
                      </Badge>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className={completo ? "font-medium text-primary" : undefined}>
                          {n.pledgedQuantity} de {n.targetQuantity}
                        </span>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} className="mt-1.5 h-1.5" />
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          atualizar.mutate({
                            data: { id: n.id, eventId, isActive: !n.isActive },
                          })
                        }
                      >
                        {n.isActive ? "Desativar" : "Reativar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remover.mutate({ data: { id: n.id, eventId } })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-lg">Quem se ofereceu</h3>
          <p className="text-sm text-muted-foreground">
            Marque como cumprido quando o item chegar ou o padrinho pagar.
          </p>
        </div>

        {pledges.isLoading ? (
          <DataTableLoading rows={4} columns={5} />
        ) : (pledges.data?.length ?? 0) === 0 ? (
          <DataTableEmpty
            title="Ninguém se ofereceu ainda"
            description="As promessas feitas na página pública da igreja aparecem aqui."
          />
        ) : (
          <>
            <DataTableCards>
              {pledges.data!.map((p) => (
                <DataTableCard
                  key={p.id}
                  title={p.pledgerName}
                  subtitle={`${p.needTitle} · ${p.quantity}x`}
                  value={p.amount ? brl(p.amount) : undefined}
                  badge={
                    <Badge
                      variant={
                        p.status === "fulfilled"
                          ? "default"
                          : p.status === "cancelled"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  }
                  meta={p.pledgerPhone ?? undefined}
                />
              ))}
            </DataTableCards>

            <DataTableShell className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quem</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Ofereceu</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pledges.data!.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.pledgerName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.pledgerPhone ?? p.pledgerEmail ?? "—"}
                      </TableCell>
                      <TableCell>
                        {p.quantity}x {p.needTitle}
                        {p.amount ? ` · ${brl(p.amount)}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === "fulfilled"
                              ? "default"
                              : p.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {STATUS_LABEL[p.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.status === "promised" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Marcar como cumprido"
                              onClick={() =>
                                mudarStatus.mutate({
                                  data: { id: p.id, eventId, status: "fulfilled" },
                                })
                              }
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Cancelar promessa"
                              onClick={() =>
                                mudarStatus.mutate({
                                  data: { id: p.id, eventId, status: "cancelled" },
                                })
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
          </>
        )}
      </section>

      <NeedDialog
        open={aberto}
        onOpenChange={setAberto}
        saving={criar.isPending}
        onSubmit={(v) => criar.mutate({ data: { ...v, eventId } })}
      />
    </div>
  );
}

type NovaNecessidade = {
  kind: "sponsorship" | "item";
  title: string;
  targetQuantity: number;
  unit: string | null;
  amountPerUnit: number | null;
  displayOrder: number;
};

function NeedDialog({
  open,
  onOpenChange,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: NovaNecessidade) => void;
  saving: boolean;
}) {
  const [kind, setKind] = useState<"sponsorship" | "item">("item");
  const [title, setTitle] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [unidade, setUnidade] = useState("");
  const [valor, setValor] = useState("");

  const enviar = () => {
    const qtd = Number(quantidade);
    if (title.trim().length < 2) return toast.error("Informe um título.");
    if (!Number.isFinite(qtd) || qtd < 1) return toast.error("Quantidade inválida.");
    if (kind === "sponsorship" && !Number(valor)) {
      return toast.error("Informe o valor de cada cota.");
    }
    onSubmit({
      kind,
      title: title.trim(),
      targetQuantity: qtd,
      unit: kind === "item" && unidade.trim() ? unidade.trim() : null,
      amountPerUnit: kind === "sponsorship" ? Number(valor) : null,
      displayOrder: 0,
    });
    setTitle("");
    setQuantidade("1");
    setUnidade("");
    setValor("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O que a festa precisa</DialogTitle>
          <DialogDescription>
            Padrinho é compromisso em dinheiro. Item é algo que a pessoa traz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "sponsorship" | "item")}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="item">Item — alguém traz</SelectItem>
                <SelectItem value="sponsorship">Padrinho — alguém paga</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Título</Label>
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "sponsorship" ? "Padrinho do som" : "Bolo caseiro"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{kind === "sponsorship" ? "Quantas cotas" : "Quantos"}</Label>
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            {kind === "sponsorship" ? (
              <div>
                <Label>Valor por cota (R$)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  min={0}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="500,00"
                />
              </div>
            ) : (
              <div>
                <Label>Medida (opcional)</Label>
                <Input
                  className="mt-1"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="unidades, kg, litros"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={saving}>
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
