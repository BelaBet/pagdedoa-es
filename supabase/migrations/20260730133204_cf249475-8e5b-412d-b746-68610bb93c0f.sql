-- Protect server-only financial columns on tenant_financial_config
CREATE OR REPLACE FUNCTION public.tenant_financial_config_protect_sensitive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.split_platform_percent := COALESCE(
      (SELECT adm_percent FROM public.platform_fee_config LIMIT 0), NULL);
    -- force platform defaults on insert by tenant staff
    NEW.split_platform_percent := 0.0352;
    NEW.pagarme_recipient_id := NULL;
    NEW.pagarme_recipient_status := NULL;
    NEW.auto_anticipation := false;
    NEW.anticipation_model := NULL;
    NEW.anticipation_days := NULL;
    RETURN NEW;
  END IF;

  IF NEW.split_platform_percent IS DISTINCT FROM OLD.split_platform_percent
     OR NEW.pagarme_recipient_id IS DISTINCT FROM OLD.pagarme_recipient_id
     OR NEW.pagarme_recipient_status IS DISTINCT FROM OLD.pagarme_recipient_status
     OR NEW.auto_anticipation IS DISTINCT FROM OLD.auto_anticipation
     OR NEW.anticipation_model IS DISTINCT FROM OLD.anticipation_model
     OR NEW.anticipation_days IS DISTINCT FROM OLD.anticipation_days
     OR NEW.receiver_type IS DISTINCT FROM OLD.receiver_type
     OR NEW.use_pagarme IS DISTINCT FROM OLD.use_pagarme THEN
    RAISE EXCEPTION 'Apenas a plataforma pode alterar configurações financeiras sensíveis.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenant_financial_config_protect_sensitive_trg ON public.tenant_financial_config;
CREATE TRIGGER tenant_financial_config_protect_sensitive_trg
BEFORE INSERT OR UPDATE ON public.tenant_financial_config
FOR EACH ROW EXECUTE FUNCTION public.tenant_financial_config_protect_sensitive();

-- Protect pagarme_recipient_id on tenant_payment_settings
CREATE OR REPLACE FUNCTION public.tenant_payment_settings_protect_sensitive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.pagarme_recipient_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.pagarme_recipient_id IS DISTINCT FROM OLD.pagarme_recipient_id THEN
    RAISE EXCEPTION 'Apenas a plataforma pode alterar o recebedor de pagamentos.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenant_payment_settings_protect_sensitive_trg ON public.tenant_payment_settings;
CREATE TRIGGER tenant_payment_settings_protect_sensitive_trg
BEFORE INSERT OR UPDATE ON public.tenant_payment_settings
FOR EACH ROW EXECUTE FUNCTION public.tenant_payment_settings_protect_sensitive();