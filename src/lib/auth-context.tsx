import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  lgpd_consent: boolean;
};

export type PlatformRole = "super_admin" | "support" | "finance" | "operator";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];                  // tenant roles (admin/manager/member)
  platformRoles: PlatformRole[];    // global platform roles
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isPlatformAdmin: boolean;         // any platform role
  isSuperAdmin: boolean;            // strict super_admin
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, roles: [], platformRoles: [],
  loading: true, isStaff: false, isAdmin: false,
  isPlatformAdmin: false, isSuperAdmin: false,
  signOut: async () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [platformRoles, setPlatformRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: r }, { data: pr }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("platform_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(prof as Profile | null);
    setRoles((r ?? []).map((x: { role: string }) => x.role));
    setPlatformRoles((pr ?? []).map((x: { role: PlatformRole }) => x.role));

    // Audit login event
    if (prof) {
      await supabase.from("audit_logs").insert({
        tenant_id: (prof as Profile).tenant_id,
        user_id: uid,
        action: "auth:login",
        entity: "session",
        metadata: { at: new Date().toISOString() },
      }).then(() => {}, () => {});
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null); setRoles([]); setPlatformRoles([]);
      }
      // Redirect to password reset page when user clicks recovery link.
      // Preserva o hash da URL (#access_token=...&type=recovery) no
      // redirecionamento — sem isso, se o Supabase não cair direto em
      // /redefinir-senha (ex: por causa da config de Redirect URLs
      // permitidas), esse "resgate" perderia o token no caminho e a
      // página de redefinição mostraria erro de link inválido mesmo com
      // o link original sendo válido.
      if (event === "PASSWORD_RECOVERY" && typeof window !== "undefined") {
        if (window.location.pathname !== "/redefinir-senha") {
          window.location.assign("/redefinir-senha" + window.location.hash);
        }
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (user && profile) {
      await supabase.from("audit_logs").insert({
        tenant_id: profile.tenant_id,
        user_id: user.id,
        action: "auth:logout",
        entity: "session",
      }).then(() => {}, () => {});
    }
    await supabase.auth.signOut();
  };
  const refresh = async () => { if (user) await loadProfile(user.id); };

  return (
    <Ctx.Provider value={{
      user, session, profile, roles, platformRoles, loading,
      isStaff: roles.includes("manager") || roles.includes("admin"),
      isAdmin: roles.includes("admin"),
      isPlatformAdmin: platformRoles.length > 0,
      isSuperAdmin: platformRoles.includes("super_admin"),
      signOut, refresh,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
