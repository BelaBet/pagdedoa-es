import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Percent, Save } from "lucide-react";
import { toast } from "sonner";
import { getFeeConfig, updateFeeConfig, type FeeConfigRow, type PaymentMethodKey } from "@/lib/fee-config.functions";

export const Route = createFileRoute("/_authenticated/admin/taxas")({
  component: TaxasPage,
  head: () => ({ meta: [{ title: "Configuração de Taxas" }] }),
});

const METHOD_LABEL: Record<PaymentMethodKey, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao_master_visa: "Cartão — Master / Visa",
  cartao_ello_hiper_amex: "Cartão — Ello / Hiper / Amex",
};

const HAS_FIXED_ADQUIRENCIA: PaymentMethodKey[] = ["pix", "boleto"];
const HAS_PERCENT_ADQUIRENCIA: PaymentMethodKey[] = ["cartao_master_visa", "cartao_ello_hiper_amex"];

function TaxasPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getFeeConfig);
  const updateFn = useServerFn(updateFeeConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["fee-config"],
    queryFn: () => fetchFn(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Configuração de Taxas</h1>
        <p className="text-sm text-muted-foreground">
          Taxas cobradas em cada doação, por método de pagamento. Editar aqui muda o valor
          cobrado em <strong>todas as próximas doações</strong>, em todas as instituições — sem
          precisar de deploy. Doações já processadas não são afetadas.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data ?? []).map((row) => (
            <FeeCard
              key={row.payment_method}
              row={row}
              onSave={async (payload) => {
                await updateFn({ data: payload });
                toast.success(`Taxa de ${METHOD_LABEL[row.payment_method]} atualizada.`);
                qc.invalidateQueries({ queryKey: ["fee-config"] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeeCard({
  row,
  onSave,
}: {
  row: FeeConfigRow;
  onSave: (payload: {
    payment_method: PaymentMethodKey;
    adm_percent: number;
    adquirencia_fixa?: number | null;
    adquirencia_avista_percent?: number | null;
    adquirencia_2x_percent?: number | null;
    tk2_operacional_fixo?: number | null;
    tk2_op_percent?: number | null;
    transacao_fixa: number;
    antecipacao_custo_percent?: number | null;
  }) => Promise<void>;
}) {
  // Estado do formulário em unidades "humanas": percentuais em % (3.52),
  // valores fixos em reais (0.40) — convertidos para decimal/centavos só
  // no momento de salvar.
  const [admPercent, setAdmPercent] = useState((row.adm_percent * 100).toString());
  const [adquirenciaFixa, setAdquirenciaFixa] = useState(row.adquirencia_fixa != null ? (row.adquirencia_fixa / 100).toFixed(2) : "");
  const [adquirenciaAvista, setAdquirenciaAvista] = useState(row.adquirencia_avista_percent != null ? (row.adquirencia_avista_percent * 100).toString() : "");
  const [adquirencia2x, setAdquirencia2x] = useState(row.adquirencia_2x_percent != null ? (row.adquirencia_2x_percent * 100).toString() : "");
  const [tk2OpFixo, setTk2OpFixo] = useState(row.tk2_operacional_fixo != null ? (row.tk2_operacional_fixo / 100).toFixed(2) : "");
  const [tk2OpPercent, setTk2OpPercent] = useState(row.tk2_op_percent != null ? (row.tk2_op_percent * 100).toString() : "");
  const [transacaoFixa, setTransacaoFixa] = useState((row.transacao_fixa / 100).toFixed(2));
  const [antecipacao, setAntecipacao] = useState(row.antecipacao_custo_percent != null ? (row.antecipacao_custo_percent * 100).toString() : "");
  const [saving, setSaving] = useState(false);

  const hasFixed = HAS_FIXED_ADQUIRENCIA.includes(row.payment_method);
  const hasPercent = HAS_PERCENT_ADQUIRENCIA.includes(row.payment_method);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        payment_method: row.payment_method,
        adm_percent: Number(admPercent),
        adquirencia_fixa: hasFixed ? Math.round(Number(adquirenciaFixa) * 100) : null,
        adquirencia_avista_percent: hasPercent ? Number(adquirenciaAvista) : null,
        adquirencia_2x_percent: hasPercent ? Number(adquirencia2x) : null,
        tk2_operacional_fixo: hasFixed ? Math.round(Number(tk2OpFixo) * 100) : null,
        tk2_op_percent: hasPercent ? Number(tk2OpPercent) : null,
        transacao_fixa: Math.round(Number(transacaoFixa) * 100),
        antecipacao_custo_percent: hasPercent ? Number(antecipacao) : null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar taxa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" />
          {METHOD_LABEL[row.payment_method]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Taxa administrativa (%)</Label>
            <Input type="number" step="0.01" value={admPercent} onChange={(e) => setAdmPercent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Taxa fixa/transação (R$)</Label>
            <Input type="number" step="0.01" value={transacaoFixa} onChange={(e) => setTransacaoFixa(e.target.value)} />
          </div>
        </div>

        {hasFixed && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Adquirência fixa (R$)</Label>
              <Input type="number" step="0.01" value={adquirenciaFixa} onChange={(e) => setAdquirenciaFixa(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operacional TK2 fixo (R$)</Label>
              <Input type="number" step="0.01" value={tk2OpFixo} onChange={(e) => setTk2OpFixo(e.target.value)} />
            </div>
          </div>
        )}

        {hasPercent && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Adquirência à vista (%)</Label>
                <Input type="number" step="0.01" value={adquirenciaAvista} onChange={(e) => setAdquirenciaAvista(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Adquirência parcelado (%)</Label>
                <Input type="number" step="0.01" value={adquirencia2x} onChange={(e) => setAdquirencia2x(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Operacional TK2 (%)</Label>
                <Input type="number" step="0.01" value={tk2OpPercent} onChange={(e) => setTk2OpPercent(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo antecipação (%)</Label>
                <Input type="number" step="0.01" value={antecipacao} onChange={(e) => setAntecipacao(e.target.value)} />
              </div>
            </div>
          </>
        )}

        <Button onClick={save} disabled={saving} className="w-full gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
