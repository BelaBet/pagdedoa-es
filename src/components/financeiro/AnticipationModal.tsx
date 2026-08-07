import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { simulateAnticipation, requestAnticipation } from "@/lib/recipient.functions";
import { brl } from "./format";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "tenant" | "platform";
  showFeeDetails?: boolean;
  onDone?: () => void;
};

export function AnticipationModal({ open, onOpenChange, scope, showFeeDetails, onDone }: Props) {
  const simulate = useServerFn(simulateAnticipation);
  const request = useServerFn(requestAnticipation);
  const [amountBrl, setAmountBrl] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sim, setSim] = useState<null | {
    amount: number;
    fee: number;
    net_amount: number;
    payment_date: string;
  }>(null);
  const [busy, setBusy] = useState(false);

  const cents = Math.round(parseFloat(amountBrl.replace(",", ".")) * 100) || 0;

  async function handleSimulate() {
    if (cents <= 0) return toast.error("Informe um valor válido");
    setBusy(true);
    try {
      const r = await simulate({
        data: { scope, amount: cents, timeframe: "start", payment_date: paymentDate },
      });
      setSim(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao simular");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!sim) return;
    setBusy(true);
    try {
      await request({
        data: { scope, amount: sim.amount, timeframe: "start", payment_date: sim.payment_date },
      });
      toast.success("Antecipação solicitada");
      onOpenChange(false);
      setSim(null);
      setAmountBrl("");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSim(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Simular antecipação</DialogTitle>
        </DialogHeader>

        {!sim ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="amt">Valor a antecipar (R$)</Label>
              <Input
                id="amt"
                inputMode="decimal"
                placeholder="0,00"
                value={amountBrl}
                onChange={(e) => setAmountBrl(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pd">Data de recebimento</Label>
              <Input
                id="pd"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            {showFeeDetails && (
              <p className="text-xs text-muted-foreground">
                Taxa de antecipação Pagar.me: 1,10% ao mês.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSimulate} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simular
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <Row label="Valor bruto" value={brl(sim.amount)} />
              <Row
                label={showFeeDetails ? "Taxa de antecipação (1,10%)" : "Taxa de serviço"}
                value={brl(sim.fee)}
              />
              <div className="h-px bg-border" />
              <Row label="Valor líquido" value={brl(sim.net_amount)} bold />
              <Row
                label="Data de pagamento"
                value={new Date(sim.payment_date).toLocaleDateString("pt-BR")}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSim(null)} disabled={busy}>
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar antecipação
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-display text-base" : ""}>{value}</span>
    </div>
  );
}
