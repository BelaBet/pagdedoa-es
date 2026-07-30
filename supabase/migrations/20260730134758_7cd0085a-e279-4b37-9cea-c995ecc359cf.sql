REVOKE SELECT (legal_name) ON public.tenants FROM authenticated;
REVOKE SELECT (legal_name) ON public.tenants FROM anon;
REVOKE SELECT (document, recipient_id, recipient_status, recipient_error) ON public.tenants FROM authenticated, anon;
REVOKE SELECT (split_platform_percent, split_seller_percent) ON public.cost_centers FROM authenticated, anon;
REVOKE SELECT (acquirer_fee_percent, tk2_op_fixed, tk2_op_percent, adm_fee_percent) ON public.fee_rules FROM authenticated, anon;
REVOKE SELECT (gateway_request, gateway_response, platform_recipient_id, seller_recipient_id, split_platform_amount, split_seller_amount, tk2_op_fee, pagarme_fee, transacao_fee) ON public.payments FROM authenticated, anon;
REVOKE SELECT (branch, branch_digit, account, account_digit, holder_name, holder_document) ON public.tenant_bank_account FROM authenticated, anon;
REVOKE SELECT (pagarme_recipient_id, pagarme_recipient_status, split_platform_percent, auto_anticipation, anticipation_model, anticipation_days) ON public.tenant_financial_config FROM authenticated, anon;