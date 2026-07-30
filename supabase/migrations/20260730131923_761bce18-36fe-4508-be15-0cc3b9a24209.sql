CREATE TABLE IF NOT EXISTS public.tenant_fee_config (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  adm_percent numeric NOT NULL DEFAULT 0,
  adquirencia_fixa integer,
  adquirencia_avista_percent numeric,
  adquirencia_2x_percent numeric,
  tk2_operacional_fixo integer,
  tk2_op_percent numeric,
  transacao_fixa integer NOT NULL DEFAULT 0,
  antecipacao_custo_percent numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (tenant_id, payment_method)
);

GRANT ALL ON public.tenant_fee_config TO service_role;

ALTER TABLE public.tenant_fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admin manages tenant fee config" ON public.tenant_fee_config;
CREATE POLICY "super admin manages tenant fee config"
ON public.tenant_fee_config FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));