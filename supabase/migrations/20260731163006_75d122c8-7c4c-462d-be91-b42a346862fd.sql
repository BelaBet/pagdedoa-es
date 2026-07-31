DROP POLICY IF EXISTS tenants_update ON public.tenants;
CREATE POLICY tenants_update ON public.tenants
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), id, 'admin'::app_role) OR is_platform_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), id, 'admin'::app_role) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS tickets_staff_update ON public.tickets;
CREATE POLICY tickets_staff_update ON public.tickets
FOR UPDATE TO authenticated
USING (is_tenant_staff(auth.uid(), tenant_id) OR is_platform_admin(auth.uid()))
WITH CHECK (is_tenant_staff(auth.uid(), tenant_id) OR is_platform_admin(auth.uid()));