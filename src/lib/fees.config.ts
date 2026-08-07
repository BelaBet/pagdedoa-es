// ============================================================
// TAXAS G2 — Configuração centralizada
// Atualizar APENAS aqui quando as taxas mudarem.
// Todos os valores monetários em CENTAVOS (integer).
// ============================================================

export const FEES = {
  // ── PIX ──────────────────────────────────────────────────
  pix: {
    adquirencia_fixa: 40, // R$0,40 — custo Pagar.me fixo
    g2_operacional_fixo: 25, // R$0,25 — custo adquirência separado
    adm_percent: 0.0352, // 3,52%
    transacao_fixa: 28, // R$0,28
  },

  // ── CARTÃO MASTER / VISA ─────────────────────────────────
  cartao_master_visa: {
    adquirencia_avista_percent: 0.0207,
    adquirencia_2x_percent: 0.0207,
    antecipacao_custo_percent: 0.0148,
    g2_op_percent: 0.0172,
    adm_percent: 0.0352,
    transacao_fixa: 28,
  },

  // ── CARTÃO ELLO / HIPER / AMEX ───────────────────────────
  cartao_ello_hiper_amex: {
    adquirencia_avista_percent: 0.0249,
    adquirencia_2x_percent: 0.0249,
    antecipacao_custo_percent: 0.0148,
    g2_op_percent: 0.0172,
    adm_percent: 0.0352,
    transacao_fixa: 28,
  },

  // ── BOLETO ───────────────────────────────────────────────
  boleto: {
    adquirencia_fixa: 100, // R$1,00
    g2_operacional_fixo: 250, // R$2,50
    adm_percent: 0.0352,
    transacao_fixa: 28,
  },
} as const;

export const RECIPIENT_IDS = {
  get platform() {
    return process.env.PLATFORM_RECIPIENT_ID ?? "";
  },
};
