import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  custom_domain: string | null;
  tagline: string | null;
};

type TenantCtx = {
  tenant: Tenant | null;
  loading: boolean;
  /** True when authenticated user's tenant differs from resolved tenant. */
  crossTenantMismatch: boolean;
  /** How the tenant was resolved. */
  resolvedBy: "custom_domain" | "subdomain" | "slug" | "default" | null;
};

const TenantContext = createContext<TenantCtx>({
  tenant: null,
  loading: true,
  crossTenantMismatch: false,
  resolvedBy: null,
});

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "id-preview",
  "preview",
  "lovable",
  "localhost",
]);

/**
 * Resolve tenant identity from the current URL.
 * Priority:
 *   1. custom domain  (host matches tenants.custom_domain)
 *   2. subdomain      (first label of host, excluding reserved)
 *   3. slug param     (?t=slug)
 *   4. default        ("default")
 */
async function resolveTenant(): Promise<{
  tenant: Tenant | null;
  resolvedBy: TenantCtx["resolvedBy"];
}> {
  if (typeof window === "undefined") return { tenant: null, resolvedBy: null };

  const host = window.location.hostname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get("t");

  // 1. Custom domain
  const { data: byDomain } = await supabase
    .from("tenants_public")
    .select("id,name,slug,logo_url,primary_color,secondary_color,custom_domain,tagline")
    .eq("custom_domain", host)
    .eq("active", true)
    .maybeSingle();
  if (byDomain) return { tenant: byDomain as Tenant, resolvedBy: "custom_domain" };

  // 2. Subdomain (only when host has at least 3 labels, e.g. tenant.app.com)
  const labels = host.split(".");
  if (labels.length >= 3) {
    const sub = labels[0];
    if (!RESERVED_SUBDOMAINS.has(sub) && !sub.startsWith("id-preview")) {
      const { data: bySub } = await supabase
        .from("tenants_public")
        .select("id,name,slug,logo_url,primary_color,secondary_color,custom_domain,tagline")
        .eq("slug", sub)
        .eq("active", true)
        .maybeSingle();
      if (bySub) return { tenant: bySub as Tenant, resolvedBy: "subdomain" };
    }
  }

  // 3. Slug query param
  if (slugParam) {
    const { data: bySlug } = await supabase
      .from("tenants_public")
      .select("id,name,slug,logo_url,primary_color,secondary_color,custom_domain,tagline")
      .eq("slug", slugParam)
      .eq("active", true)
      .maybeSingle();
    if (bySlug) return { tenant: bySlug as Tenant, resolvedBy: "slug" };
  }

  // 4. Default
  const { data: def } = await supabase
    .from("tenants_public")
    .select("id,name,slug,logo_url,primary_color,secondary_color,custom_domain,tagline")
    .eq("slug", "default")
    .maybeSingle();
  return { tenant: (def as Tenant) ?? null, resolvedBy: def ? "default" : null };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [resolvedBy, setResolvedBy] = useState<TenantCtx["resolvedBy"]>(null);
  const [loading, setLoading] = useState(true);
  const [crossTenantMismatch, setMismatch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { tenant: t, resolvedBy: r } = await resolveTenant();
      if (cancelled) return;
      setTenant(t);
      setResolvedBy(r);
      if (t?.primary_color) {
        document.documentElement.style.setProperty("--brand-primary", t.primary_color);
      }
      if (t?.secondary_color) {
        document.documentElement.style.setProperty("--brand-secondary", t.secondary_color);
      }
      setLoading(false);

      // Cross-tenant guard: if user is signed in to a different tenant, flag it.
      if (t) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("tenant_id")
            .eq("id", user.id)
            .maybeSingle();
          if (prof && prof.tenant_id !== t.id) {
            setMismatch(true);
            console.warn(
              "[multi-tenant] Cross-tenant access blocked: signed-in user belongs to a different tenant.",
            );
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, crossTenantMismatch, resolvedBy }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
