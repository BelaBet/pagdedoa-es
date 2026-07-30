// Server-only: busca a configuração de taxa atual do banco
// (public.platform_fee_config, editável pelo super admin em
// /admin/taxas). NUNCA importar este arquivo de código que roda no
// cliente — usa supabaseAdmin, que depende de variáveis de ambiente
// exclusivas de servidor.

export type FeeRow = {
  adm_percent: number;
  adquirencia_fixa: number | null;
  adquirencia_avista_percent: number | null;
  adquirencia_2x_percent: number | null;
  tk2_operacional_fixo: number | null;
  tk2_op_percent: number | null;
  transacao_fixa: number;
};

export type PaymentMethodKey = "pix" | "boleto" | "cartao_master_visa" | "cartao_ello_hiper_amex";

/**
 * Busca a configuração de taxa de um método de pagamento no banco. Se a
 * linha não existir por algum motivo (ex: migration ainda não rodou),
 * retorna null — quem chamar deve cair para os valores fixos de
 * fees.config.ts como rede de segurança, para nunca bloquear um
 * pagamento por falta de configuração de taxa.
 */
export async function getPlatformFeeRow(
  paymentMethod: PaymentMethodKey,
  tenantId?: string | null,
): Promise<FeeRow | null> {
  const columns =
    "adm_percent, adquirencia_fixa, adquirencia_avista_percent, adquirencia_2x_percent, tk2_operacional_fixo, tk2_op_percent, transacao_fixa";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Taxa específica da instituição (configurada em /admin/taxas)
    if (tenantId) {
      const { data: tenantRow } = await supabaseAdmin
        .from("tenant_fee_config" as any)
        .select(columns)
        .eq("tenant_id", tenantId)
        .eq("payment_method", paymentMethod)
        .maybeSingle();
      if (tenantRow) return tenantRow as unknown as FeeRow;
    }

    // 2) Taxa padrão da plataforma
    const { data, error } = await supabaseAdmin
      .from("platform_fee_config" as any)
      .select(
        "adm_percent, adquirencia_fixa, adquirencia_avista_percent, adquirencia_2x_percent, tk2_operacional_fixo, tk2_op_percent, transacao_fixa",
      )
      .eq("payment_method", paymentMethod)
      .maybeSingle();
    if (error || !data) {
      console.error("[fee-config.server] falha ao buscar platform_fee_config, caindo para valores fixos", paymentMethod, error);
      return null;
    }
    return data as unknown as FeeRow;
  } catch (e) {
    console.error("[fee-config.server] erro ao buscar platform_fee_config, caindo para valores fixos", paymentMethod, e);
    return null;
  }
}
