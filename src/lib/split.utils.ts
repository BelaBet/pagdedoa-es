// Utilitários de split de pagamento Pagar.me V5.
// Todos os valores em CENTAVOS (integer). Nunca usar float.

import { FEES, RECIPIENT_IDS } from "./fees.config";

export type PaymentMethod = "pix" | "credit_card" | "boleto";
export type CardBrand = "master_visa" | "ello_hiper_amex";

export interface SplitAmounts {
  donationAmount: number; // valor que vai para a igreja (centavos)
  platformFee: number; // taxa ADM da plataforma (3,5%)
  pagarmeFee: number; // taxa fixa Pagar.me absorvida
  g2OpFee: number; // taxa operacional G2
  transacaoFee: number; // taxa fixa por transação
  splitPlatformAmount: number; // total para plataforma G2
  totalAmount: number; // total cobrado do doador
}

export interface SplitPayload {
  amount: number;
  recipient_id: string;
  type: "flat";
  options: {
    liable: boolean;
    charge_processing_fee: boolean;
    charge_remainder_fee: boolean;
  };
}

function assertPositiveInt(v: number, name: string) {
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`${name} deve ser inteiro positivo em centavos`);
  }
}

type FeeRow = {
  adm_percent: number;
  adquirencia_fixa: number | null;
  adquirencia_avista_percent: number | null;
  adquirencia_2x_percent: number | null;
  g2_operacional_fixo: number | null;
  g2_op_percent: number | null;
  transacao_fixa: number;
};

// ── PIX ──────────────────────────────────────────────────────
// Função pura e síncrona — segura para uso tanto no servidor quanto no
// cliente (ex: prévia de valor no modal de doação antes de confirmar).
// `feeRow` é opcional: sem ele, usa os valores padrão de fees.config.ts.
// O servidor (payments.functions.ts) busca a taxa atual no banco
// (getPlatformFeeRow, em fee-config.server.ts) e passa aqui — essa função
// em si nunca acessa banco, então nunca precisa de código exclusivo de
// servidor e pode ser importada com segurança do lado do cliente.
export function calculatePixAmounts(
  ofertaEmCentavos: number,
  splitOverridePercent?: number | null,
  feeRow?: FeeRow,
): SplitAmounts {
  assertPositiveInt(ofertaEmCentavos, "donationAmount");
  const f = feeRow ?? FEES.pix;
  const donationAmount = ofertaEmCentavos;
  const admPercent = splitOverridePercent ?? Number(f.adm_percent);
  const pagarmeFee = Number(f.adquirencia_fixa ?? 0);
  const g2OpFee = Number(f.g2_operacional_fixo ?? 0);
  const transacaoFee = Number(f.transacao_fixa);

  // GROSS-UP: o percentual da taxa ADM incide sobre o valor TOTAL cobrado
  // do doador (que já inclui a própria taxa), não sobre a doação base —
  // é isso que efetivamente sai do bolso do doador. Calcular
  // "donationAmount * admPercent" direto subestima a taxa sempre que
  // admPercent > 0. Resolvendo totalAmount = (donationAmount + fixos) / (1 - admPercent).
  const fixedTotal = pagarmeFee + g2OpFee;
  const totalAmount = Math.round((donationAmount + fixedTotal) / (1 - admPercent));
  const platformFee = totalAmount - donationAmount - fixedTotal;
  const splitPlatformAmount = platformFee + pagarmeFee + g2OpFee;

  return {
    donationAmount,
    platformFee,
    pagarmeFee,
    g2OpFee,
    transacaoFee,
    splitPlatformAmount,
    totalAmount,
  };
}

// ── CARTÃO ───────────────────────────────────────────────────
export function calculateCardAmounts(
  ofertaEmCentavos: number,
  installments: number,
  brand: CardBrand,
  splitOverridePercent?: number | null,
  feeRow?: FeeRow,
): SplitAmounts {
  assertPositiveInt(ofertaEmCentavos, "donationAmount");
  const f =
    feeRow ?? (brand === "master_visa" ? FEES.cartao_master_visa : FEES.cartao_ello_hiper_amex);
  const donationAmount = ofertaEmCentavos;
  const admPercent = splitOverridePercent ?? Number(f.adm_percent);
  const adquirenciaPercent = Number(
    installments <= 1 ? f.adquirencia_avista_percent : f.adquirencia_2x_percent,
  );
  const g2OpPercent = Number(f.g2_op_percent ?? 0) * admPercent;

  const pagarmeFee = 0;
  const transacaoFee = Number(f.transacao_fixa);

  // GROSS-UP: os três percentuais (adm, g2_op, adquirência) incidem sobre
  // o valor total cobrado do doador, não sobre a doação base — mesmo
  // problema do PIX/boleto. totalPct é a soma de tudo; resolvendo
  // totalAmount = donationAmount / (1 - totalPct), depois distribuindo
  // proporcionalmente entre os três componentes (o resto vai para
  // adquirenciaValor, para não perder centavo de arredondamento).
  const totalPct = admPercent + g2OpPercent + adquirenciaPercent;
  const totalAmount = Math.round(donationAmount / (1 - totalPct));
  const splitPlatformAmount = totalAmount - donationAmount;

  const platformFee = Math.round((splitPlatformAmount * admPercent) / totalPct);
  const g2OpFee = Math.round((splitPlatformAmount * g2OpPercent) / totalPct);
  const adquirenciaValor = splitPlatformAmount - platformFee - g2OpFee;

  return {
    donationAmount,
    platformFee,
    pagarmeFee,
    g2OpFee,
    transacaoFee,
    splitPlatformAmount,
    totalAmount,
  };
}

// ── BOLETO ───────────────────────────────────────────────────
export function calculateBoletoAmounts(
  ofertaEmCentavos: number,
  splitOverridePercent?: number | null,
  feeRow?: FeeRow,
): SplitAmounts {
  assertPositiveInt(ofertaEmCentavos, "donationAmount");
  const f = feeRow ?? FEES.boleto;
  const donationAmount = ofertaEmCentavos;
  const admPercent = splitOverridePercent ?? Number(f.adm_percent);
  const pagarmeFee = Number(f.adquirencia_fixa ?? 0);
  const g2OpFee = Number(f.g2_operacional_fixo ?? 0);
  const transacaoFee = Number(f.transacao_fixa);

  // GROSS-UP: mesmo ajuste do PIX — ver comentário em calculatePixAmounts.
  const fixedTotal = pagarmeFee + g2OpFee;
  const totalAmount = Math.round((donationAmount + fixedTotal) / (1 - admPercent));
  const platformFee = totalAmount - donationAmount - fixedTotal;
  const splitPlatformAmount = platformFee + g2OpFee + pagarmeFee;

  return {
    donationAmount,
    platformFee,
    pagarmeFee,
    g2OpFee,
    transacaoFee,
    splitPlatformAmount,
    totalAmount,
  };
}

// ── BUILD SPLIT PAYLOAD ───────────────────────────────────────
export function buildSplitPayload(
  amounts: SplitAmounts,
  sellerRecipientId: string,
): SplitPayload[] {
  if (!sellerRecipientId) {
    throw new Error("seller_recipient_id ausente — instituição não habilitada para pagamentos");
  }
  const platform = RECIPIENT_IDS.platform;
  if (!platform) {
    throw new Error("PLATFORM_RECIPIENT_ID não configurado");
  }

  return [
    {
      amount: amounts.splitPlatformAmount,
      recipient_id: platform,
      type: "flat",
      options: {
        liable: true,
        charge_processing_fee: true,
        charge_remainder_fee: true,
      },
    },
    {
      amount: amounts.donationAmount,
      recipient_id: sellerRecipientId,
      type: "flat",
      options: {
        liable: false,
        charge_processing_fee: false,
        charge_remainder_fee: false,
      },
    },
  ];
}

/**
 * Compat: usado pela UI para estimar o total cobrado.
 * Para cartão usa parcelamento à vista com bandeira master/visa como padrão.
 * Usa sempre os valores padrão (fees.config.ts) — é só uma prévia no
 * cliente; o valor final de verdade é calculado no servidor, com a taxa
 * atual configurada no banco (ver fee-config.server.ts).
 */
export function calculateAmounts(
  donationAmount: number,
  method: PaymentMethod = "pix",
): SplitAmounts {
  if (method === "pix") return calculatePixAmounts(donationAmount);
  if (method === "boleto") return calculateBoletoAmounts(donationAmount);
  return calculateCardAmounts(donationAmount, 1, "master_visa");
}

/**
 * Busca o recipient_id (ID do recebedor Pagar.me) de um tenant.
 * O valor é armazenado em `tenants.recipient_id` e preenchido manualmente
 * pelo admin no banco. Lança erro caso não esteja configurado.
 */
export async function fetchSellerRecipientId(tenantId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_financial_config")
    .select("pagarme_recipient_id, use_pagarme")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { pagarme_recipient_id?: string | null; use_pagarme?: boolean | null } | null;
  const recipientId = row?.pagarme_recipient_id;
  if (!recipientId || !row?.use_pagarme) {
    throw new Error("Tenant sem recipient_id configurado na Pagar.me");
  }
  return recipientId;
}

// NOTA: a checagem de tenant habilitado pra receber pagamentos vive em
// @/lib/compliance (assertFinancialActive) — é a versão realmente usada
// pelos handlers de Pix/Cartão/Boleto. Havia uma segunda função quase
// idêntica aqui (assertTenantFinancialActive) que nunca era chamada em
// lugar nenhum; removida para não confundir qual é a "de verdade".

export type CostCenterConfig = {
  id: string;
  tenant_id: string;
  split_platform_percent: number;
  allows_installments: boolean;
  max_installments: number;
  is_active: boolean;
};

/**
 * Busca configuração de um centro de custo, validando que pertence ao tenant
 * e está ativo. Lança erro caso contrário.
 */
export async function fetchCostCenter(
  costCenterId: string,
  tenantId: string,
): Promise<CostCenterConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("cost_centers")
    .select(
      "id, tenant_id, split_platform_percent, allows_installments, max_installments, is_active",
    )
    .eq("id", costCenterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const cc = data as CostCenterConfig | null;
  if (!cc) throw new Error("Centro de custo não encontrado");
  if (cc.tenant_id !== tenantId) throw new Error("Centro de custo não pertence a esta igreja");
  if (!cc.is_active) throw new Error("Centro de custo está desativado");
  return cc;
}
