import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/lib/impersonation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";

export function TenantSwitcher() {
  const nav = useNavigate();
  const { start, tenantId, active } = useImpersonation();

  const { data: tenants } = useQuery({
    queryKey: ["admin-tenants-switcher"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,active")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleChange = async (id: string) => {
    try {
      await start(id);
      toast.success("Acessando como igreja selecionada");
      nav({ to: "/dashboard" });
    } catch (e) {
      toast.error(translateError(e));
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={active ? (tenantId ?? undefined) : undefined} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-[220px] text-xs">
          <SelectValue placeholder="Alternar para igreja…" />
        </SelectTrigger>
        <SelectContent>
          {(tenants ?? []).map((t) => (
            <SelectItem key={t.id} value={t.id} className="text-xs">
              {t.name} {!t.active && <span className="ml-1 text-muted-foreground">(suspensa)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
