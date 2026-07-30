-- Configuração de taxas da plataforma, editável pelo super admin em vez
-- de fixa em código (src/lib/fees.config.ts). Uma linha por método de
-- pagamento; campos que não se aplicam a um método específico ficam nulos
-- (ex: cartão não usa adquirencia_fixa, pix/boleto não usam
-- adquirencia_avista_percent/adquirencia_2x_percent).
--
-- Valores monetários fixos em CENTAVOS (integer). Percentuais em decimal
-- (0.0352 = 3,52%), mesma convenção já usada em fees.config.ts.
CREATE TABLE public.platform_fee_config (
  payment_method text PRIMARY KEY CHECK (payment_method IN ('pix', 'boleto', 'cartao_master_visa', 'cartao_ello_hiper_amex')),
  adm_percent numeric(7,5) NOT NULL DEFAULT 0,
  adquirencia_fixa integer,               -- pix/boleto: taxa fixa da adquirente, em centavos
  adquirencia_avista_percent numeric(7,5), -- cartão à vista
  adquirencia_2x_percent numeric(7,5),     -- cartão parcelado
  tk2_operacional_fixo integer,            -- pix/boleto: custo operacional fixo, em centavos
  tk2_op_percent numeric(7,5),             -- cartão: percentual operacional
  transacao_fixa integer NOT NULL DEFAULT 0, -- taxa fixa por transação, em centavos
  antecipacao_custo_percent numeric(7,5),  -- só cartão, informativo (custo de antecipação)
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Semeia com os valores atuais de fees.config.ts, para a transição não
-- mudar nenhuma taxa em produção no momento em que a API passar a ler
-- do banco.
INSERT INTO public.platform_fee_config
  (payment_method, adm_percent, adquirencia_fixa, tk2_operacional_fixo, transacao_fixa)
VALUES
  ('pix',    0.0352, 40,  25,  28),
  ('boleto', 0.0352, 100, 250, 28);

INSERT INTO public.platform_fee_config
  (payment_method, adm_percent, adquirencia_avista_percent, adquirencia_2x_percent, tk2_op_percent, transacao_fixa, antecipacao_custo_percent)
VALUES
  ('cartao_master_visa',    0.0352, 0.0207, 0.0207, 0.0172, 28, 0.0148),
  ('cartao_ello_hiper_amex', 0.0352, 0.0249, 0.0249, 0.0172, 28, 0.0148);

ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;

-- Só super_admin gerencia (lê e edita) — a leitura pela API de pagamento
-- em si é feita com supabaseAdmin (service_role), que ignora RLS, então
-- essa restrição não afeta o funcionamento dos pagamentos.
CREATE POLICY platform_fee_config_super_admin_all
  ON public.platform_fee_config
  FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
