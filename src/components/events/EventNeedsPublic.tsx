import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandHeart } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Lista pública de necessidades de um evento — padrinhos e itens — com o
 * formulário para qualquer pessoa se oferecer, sem login.
 *
 * O progresso vem de `event_public_progress`, que devolve apenas o agregado.
 * Nome e telefone de quem se ofereceu nunca são expostos aqui: a RLS permite
 * inserir mas não ler, justamente para a página não virar lista de contatos.
 */

type NeedProgress = {
  need_id: string;
  title: string;
  kind: "sponsorship" | "item";
  unit: string | null;
  amount_per_unit: number | null;
  target_quantity: number;
  pledged_quantity: number;
  display_order: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EventNeedsPublic({
  eventId,
  eventTitle,
  accent,
}: {
  eventId: string;
  eventTitle?: string;
  accent?: string;
}) {
  const qc = useQueryClient();
  const [escolhida, setEscolhida] = useState<NeedProgress | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["event-public-progress", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_public_progress", {
        _event_id: eventId,
      });
      if (error) throw error;
      return (data ?? []) as NeedProgress[];
    },
  });

  const abertas = (data ?? []).filter((n) => n.pledged_quantity < n.target_quantity);

  if (isLoading || (data ?? []).length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="text-center">
        <HandHeart className="mx-auto h-8 w-8 opacity-50" style={{ color: accent }} />
        <h2 className="mt-3 font-display text-2xl">Ajude nesta festa</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {eventTitle
            ? `A comunidade está organizando ${eventTitle}. Veja o que ainda falta.`
            : "Veja o que ainda falta e escolha como contribuir."}
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((n) => {
          const restante = Math.max(0, n.target_quantity - n.pledged_quantity);
          const pct = Math.min(100, Math.round((n.pledged_quantity / n.target_quantity) * 100));
          const completo = restante === 0;

          return (
            <Card key={n.need_id} className={completo ? "opacity-70" : undefined}>
              <CardContent className="p-4">
                <p className="font-medium">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {n.kind === "sponsorship"
                    ? `${brl(Number(n.amount_per_unit ?? 0))} por cota`
                    : n.unit
                      ? `Medida: ${n.unit}`
                      : "Item"}
                </p>

                <Progress value={pct} className="mt-3 h-1.5" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {completo
                    ? "Já conseguimos tudo. Obrigado!"
                    : `Faltam ${restante} de ${n.target_quantity}`}
                </p>

                {!completo && (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setEscolhida(n)}
                    style={accent ? { backgroundColor: accent } : undefined}
                  >
                    {n.kind === "sponsorship" ? "Quero ser padrinho" : "Quero trazer"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {abertas.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Tudo o que a festa precisava já foi oferecido. Obrigado a quem ajudou.
        </p>
      )}

      <PledgeDialog
        need={escolhida}
        onClose={() => setEscolhida(null)}
        onDone={() => {
          setEscolhida(null);
          qc.invalidateQueries({ queryKey: ["event-public-progress", eventId] });
        }}
      />
    </section>
  );
}

function PledgeDialog({
  need,
  onClose,
  onDone,
}: {
  need: NeedProgress | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [recado, setRecado] = useState("");

  const restante = need ? Math.max(0, need.target_quantity - need.pledged_quantity) : 0;
  const padrinho = need?.kind === "sponsorship";

  const enviar = useMutation({
    mutationFn: async () => {
      if (!need) return;
      const qtd = Number(quantidade);

      if (nome.trim().length < 2) throw new Error("Escreva seu nome.");
      if (!Number.isFinite(qtd) || qtd < 1) throw new Error("Quantidade inválida.");
      if (qtd > restante) throw new Error(`Ainda faltam apenas ${restante}.`);

      // tenant_id e event_id são preenchidos pelo trigger a partir da
      // necessidade — não confiamos no que vem do navegador.
      // tenant_id e event_id sao omitidos de proposito: o trigger
      // event_pledges_enforce_parent os define a partir da necessidade, antes
      // da checagem de NOT NULL. Enviar do navegador permitiria associar a
      // promessa a outra igreja. O cast existe so porque o tipo gerado os
      // marca como obrigatorios.
      const { error } = await supabase.from("event_pledges").insert({
        need_id: need.need_id,
        pledger_name: nome.trim(),
        pledger_phone: telefone.trim() || null,
        quantity: qtd,
        amount: padrinho ? Number(need.amount_per_unit ?? 0) * qtd : null,
        note: recado.trim() || null,
        status: "promised",
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Obrigado! A comunidade vai entrar em contato.");
      setNome("");
      setTelefone("");
      setQuantidade("1");
      setRecado("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={need !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{need?.title}</DialogTitle>
          <DialogDescription>
            {padrinho
              ? `Cada cota é ${brl(Number(need?.amount_per_unit ?? 0))}. Combinamos o pagamento depois, pelo contato que você deixar.`
              : "Deixe seu contato para a comunidade combinar a entrega."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pledge-nome">Seu nome</Label>
            <Input
              id="pledge-nome"
              className="mt-1"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como podemos te chamar"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pledge-tel">Telefone</Label>
              <Input
                id="pledge-tel"
                className="mt-1"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label htmlFor="pledge-qtd">{padrinho ? "Cotas" : "Quantos"}</Label>
              <Input
                id="pledge-qtd"
                className="mt-1"
                type="number"
                min={1}
                max={restante}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
          </div>

          {padrinho && Number(quantidade) > 0 && (
            <p className="text-sm text-muted-foreground">
              Total do compromisso:{" "}
              <span className="font-medium text-foreground">
                {brl(Number(need?.amount_per_unit ?? 0) * Number(quantidade))}
              </span>
            </p>
          )}

          <div>
            <Label htmlFor="pledge-recado">Recado (opcional)</Label>
            <Textarea
              id="pledge-recado"
              className="mt-1"
              rows={2}
              value={recado}
              onChange={(e) => setRecado(e.target.value)}
              placeholder="Alguma observação para a organização"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending}>
            {enviar.isPending ? "Enviando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
