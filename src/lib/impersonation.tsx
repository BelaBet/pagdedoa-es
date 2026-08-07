/**
 * Session-based tenant impersonation for Platform Admins.
 * - State lives in React context (NOT localStorage)
 * - Every start/end is recorded in `impersonation_sessions` (auditable)
 * - Only platform admins can start a session (RLS enforces it server-side too)
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type ImpersonationCtx = {
  active: boolean;
  tenantId: string | null;
  sessionId: string | null;
  start: (tenantId: string, reason?: string) => Promise<void>;
  stop: () => Promise<void>;
};

const Ctx = createContext<ImpersonationCtx>({
  active: false,
  tenantId: null,
  sessionId: null,
  start: async () => {},
  stop: async () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // End any orphan session on mount (browser was closed mid-impersonation)
  useEffect(() => {
    if (!user || !isSuperAdmin) return;
    supabase
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .is("ended_at", null)
      .eq("impersonator_id", user.id)
      .then(() => {});
  }, [user, isSuperAdmin]);

  const start = async (tid: string, reason?: string) => {
    if (!user || !isSuperAdmin) return;
    const { data, error } = await supabase
      .from("impersonation_sessions")
      .insert({
        impersonator_id: user.id,
        tenant_id: tid,
        reason: reason ?? null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    setTenantId(tid);
    setSessionId(data.id);
  };

  const stop = async () => {
    if (sessionId) {
      await supabase
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
    setTenantId(null);
    setSessionId(null);
  };

  return (
    <Ctx.Provider value={{ active: !!tenantId, tenantId, sessionId, start, stop }}>
      {children}
    </Ctx.Provider>
  );
}

export const useImpersonation = () => useContext(Ctx);

/**
 * Tenant "efetivo" para fins de exibição/edição de dados: quando um super
 * admin está impersonando uma igreja, deve ser o tenant impersonado — não
 * o tenant_id do próprio perfil do super admin (que normalmente é null,
 * ou pode ser de uma instituição diferente da que ele está tentando ver).
 * Usar em TODA tela do lado da igreja (/dashboard, /manage/*) no lugar de
 * profile?.tenant_id direto, para que a impersonação realmente funcione.
 */
export function useEffectiveTenantId(profileTenantId: string | null | undefined): string | null {
  const { active, tenantId } = useImpersonation();
  return (active && tenantId ? tenantId : profileTenantId) ?? null;
}
