GRANT SELECT (id, name, slug, logo_url, primary_color, secondary_color, accent_color, custom_domain, active, created_at, updated_at, tagline, cover_photo_url, legal_name, trade_name, institutional_email, main_phone, website, description, compliance_status, financial_active, deleted_at) ON public.tenants TO authenticated;
GRANT UPDATE (name, slug, logo_url, primary_color, secondary_color, accent_color, custom_domain, active, tagline, cover_photo_url, legal_name, trade_name, institutional_email, main_phone, website, description) ON public.tenants TO authenticated;
GRANT INSERT, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;