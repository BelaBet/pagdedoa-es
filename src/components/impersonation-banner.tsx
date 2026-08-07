import { useQuery } from "@tanstack/react-query";
import { useImpersonation } from "@/lib/impersonation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export function ImpersonationBanner() {
  const { active, tenantId, stop } = useImpersonation();

  const { data: tenant } = useQuery({
    queryKey: ["impersonated-tenant", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data } = await supabase
        .from("tenants")
        .select("name,slug")
        .eq("id", tenantId)
        .maybeSingle();
      return data;
    },
    enabled: !!tenantId,
  });

  if (!active) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950 shadow">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        <span>
          Acessando como <strong>{tenant?.name ?? tenantId?.slice(0, 8) + "…"}</strong>
          {tenant?.slug && <span className="ml-1 text-amber-900/70">({tenant.slug})</span>} — toda
          ação é auditada.
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => stop()}>
        Sair da impersonação
      </Button>
    </div>
  );
}
