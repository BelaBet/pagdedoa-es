import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, User, LogOut, Bell, Megaphone, ExternalLink, ArrowLeft, Menu, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { initials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading, signOut, profile, isStaff, isAdmin, isSuperAdmin } = useAuth();
  const { tenant: urlTenant } = useTenant();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const router = useRouter();
  const location = useLocation();

  // Always load the *effective* tenant (o próprio, ou o impersonado quando
  // ativo) para que o cabeçalho — inclusive o link "Página de Doação" —
  // reflita a instituição certa, nunca a resolvida por URL nem a do próprio
  // super admin enquanto ele estiver impersonando outra igreja.
  const { data: myTenant } = useQuery({
    queryKey: ["my-tenant-header", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id,name,logo_url,tagline,slug")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      router.navigate({ to: "/login" });
    }
  }, [user, loading, router]);

  // First-run onboarding: send tenant admins without a logo to /igrejas/onboarding.
  useEffect(() => {
    if (loading || !user || !profile || !myTenant) return;
    if (!isAdmin) return;
    if (myTenant.logo_url) return;
    if (!user.email_confirmed_at) return;
    const path = location.pathname;
    if (path.startsWith("/igrejas/onboarding") || path.startsWith("/login")) return;
    router.navigate({ to: "/igrejas/onboarding" });
  }, [loading, user, profile, myTenant, isAdmin, location.pathname, router]);

  void supabase;
  void redirect;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!user) return null;

  if (profile?.status === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl">Cadastro não aprovado</h1>
          <p className="mt-3 text-muted-foreground">Entre em contato com o gestor da sua comunidade.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sair</Button>
        </div>
      </div>
    );
  }

  // Prefer the user's own tenant (from profile) over the URL-resolved tenant.
  const tenant = myTenant ?? urlTenant;
  const name = tenant?.name ?? "Comunidade";
  const tagline = tenant?.tagline;
  const logoUrl = (tenant as { logo_url?: string | null } | null | undefined)?.logo_url ?? null;

  return (
    <div className="flex min-h-screen flex-col pb-20 md:pb-0">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {location.pathname !== "/dashboard" && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => router.history.back()}
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white overflow-hidden p-1 border">
                  <img
                    src={logoUrl}
                    alt={name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display text-sm">
                  {initials(name)}
                </div>
              )}
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="font-display text-base truncate">{name}</span>
                {tagline && (
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                    {tagline}
                  </span>
                )}
              </div>
            </Link>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            <Button asChild variant="ghost" size="sm"><Link to="/dashboard">{"\n"}</Link></Button>
            {isStaff && (myTenant as { slug?: string } | null)?.slug && (
              <Button asChild variant="ghost" size="sm">
                <a href={`/i/${(myTenant as { slug: string }).slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> Página de Doação
                </a>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm"><Link to="/manage/mensagens">Mensagens</Link></Button>
            <Button asChild variant="ghost" size="sm"><Link to="/notifications"><Bell className="h-4 w-4" /></Link></Button>
            {isStaff && <Button asChild variant="default" size="sm"><Link to="/manage/dashboard">Gestão</Link></Button>}
            {isSuperAdmin && <Button asChild variant="default" size="sm"><Link to="/admin/dashboard"><ShieldAlert className="h-4 w-4 mr-1" /> Plataforma</Link></Button>}
            <Button asChild variant="ghost" size="sm"><Link to="/profile">Perfil</Link></Button>
            <Button onClick={signOut} variant="ghost" size="sm">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{profile?.full_name ?? user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/dashboard"><LayoutDashboard className="h-4 w-4 mr-2" />Painel</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/manage/mensagens"><Megaphone className="h-4 w-4 mr-2" />Mensagens</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/notifications"><Bell className="h-4 w-4 mr-2" />Avisos</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/profile"><User className="h-4 w-4 mr-2" />Perfil</Link></DropdownMenuItem>
                {isStaff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild><Link to="/manage/dashboard"><LayoutDashboard className="h-4 w-4 mr-2" />Gestão</Link></DropdownMenuItem>
                  </>
                )}
                {isSuperAdmin && (
                  <DropdownMenuItem asChild><Link to="/admin/dashboard"><ShieldAlert className="h-4 w-4 mr-2" />Plataforma</Link></DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <span className="hidden text-xs text-muted-foreground md:inline">
            {profile?.full_name ?? user.email}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card md:hidden">
        {[
          { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
          { to: "/manage/mensagens", label: "Mensagens", icon: Megaphone },
          { to: "/notifications", label: "Avisos", icon: Bell },
          { to: "/profile", label: "Perfil", icon: User },
        ].map((i) => (
          <Link key={i.to} to={i.to} className="flex flex-col items-center justify-center gap-0.5 py-2 text-xs text-muted-foreground"
                activeProps={{ className: "flex flex-col items-center justify-center gap-0.5 py-2 text-xs text-primary" }}>
            <i.icon className="h-5 w-5" />
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
