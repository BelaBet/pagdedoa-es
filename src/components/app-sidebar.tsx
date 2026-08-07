import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Megaphone,
  Calendar,
  Settings,
  ArrowLeft,
  HeartHandshake,
  Building2,
  CreditCard,
  ScrollText,
  Wallet,
  ShieldAlert,
  AlertTriangle,
  Percent,
  Mail,
  Phone,
  Headphones,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const MANAGE_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Doações", url: "/manage/donations", icon: HeartHandshake },
  { title: "Relatórios", url: "/manage/relatorios", icon: ScrollText },
  { title: "Financeiro", url: "/dashboard/financeiro", icon: Wallet },
  { title: "Eventos", url: "/manage/events", icon: Calendar },
  { title: "Mensagens", url: "/manage/mensagens", icon: Megaphone },
  { title: "Pendências", url: "/manage/pendencias", icon: AlertTriangle },
  { title: "Configurações", url: "/manage/settings", icon: Settings },
];

const PLATFORM_ITEMS = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Igrejas", url: "/admin/tenants", icon: Building2 },
  { title: "Doações", url: "/admin/donations", icon: HeartHandshake },
  { title: "Eventos", url: "/admin/events", icon: Calendar },
  { title: "Relatórios", url: "/admin/relatorios", icon: ScrollText },
  { title: "Financeiro", url: "/admin/financeiro", icon: Wallet },
  { title: "Taxas", url: "/admin/taxas", icon: Percent },
  { title: "Plataforma", url: "/admin/settings", icon: Settings },
];

/**
 * Sidebar única e compartilhada entre /manage e /admin.
 * Mostra a seção "Gestão" para quem é staff de algum tenant (isStaff) e a
 * seção "Plataforma" para quem tem qualquer platform_role (isPlatformAdmin).
 * Quem tem os dois papéis vê as duas seções no mesmo menu, mesmo que cada
 * uma ainda viva sob sua própria rota/layout (/manage/* e /admin/*).
 */
export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isStaff, isSuperAdmin, profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);

  // NOTA: useTenant() (tenant-context.tsx) resolve pelo domínio/URL da
  // página atual — pensado pra página pública (church-page.tsx), não pro
  // painel logado. Quem acessa o painel pelo domínio compartilhado (não
  // pelo subdomínio próprio da igreja) caía no fallback "default" desse
  // resolvedor, que aponta pro tenant interno da TK2 — mostrando o nome
  // dela no menu de qualquer igreja. Aqui usamos o tenant de quem está
  // logado (considerando impersonação), nunca a URL.
  const { data: tenant } = useQuery({
    queryKey: ["sidebar-tenant-name", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1">
          {isSuperAdmin ? (
            <>
              {!collapsed && (
                <div className="flex flex-col leading-tight">
                  <span className="font-display text-sm">Painel da Plataforma</span>
                  <span className="text-[10px] uppercase tracking-wider text-accent">
                    Super Admin
                  </span>
                </div>
              )}
            </>
          ) : isStaff ? (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                {initials(tenant?.name ?? "Gestão")}
              </div>
              {!collapsed && (
                <span className="font-display text-sm">{tenant?.name ?? "Gestão"}</span>
              )}
            </>
          ) : null}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isStaff && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestão</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {MANAGE_ITEMS.map((i) => (
                  <SidebarMenuItem key={i.url}>
                    <SidebarMenuButton asChild isActive={path === i.url}>
                      <Link to={i.url} className="flex items-center gap-2">
                        <i.icon className="h-4 w-4" />
                        {!collapsed && <span>{i.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="h-auto py-2 leading-tight">Plataforma&nbsp;{"\n"}Centro de Doações</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {PLATFORM_ITEMS.map((i) => (
                  <SidebarMenuItem key={i.url}>
                    <SidebarMenuButton asChild isActive={path === i.url}>
                      <Link to={i.url} className="flex items-center gap-2">
                        <i.icon className="h-4 w-4" />
                        {!collapsed && <span>{i.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-2">
              {!collapsed ? (
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Headphones className="h-3.5 w-3.5" />
                    <span>Suporte</span>
                  </div>
                  <a
                    href={`mailto:${BRAND.support.email}`}
                    className="mt-2 flex items-center gap-2 text-xs hover:text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {BRAND.support.email}
                  </a>
                  <a
                    href={`tel:${BRAND.support.phoneE164}`}
                    className="mt-1.5 flex items-center gap-2 text-xs hover:text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {BRAND.support.phone}
                  </a>
                </div>
              ) : (
                <a
                  href={`mailto:${BRAND.support.email}`}
                  title="Suporte"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card hover:bg-accent"
                >
                  <Headphones className="h-4 w-4" />
                </a>
              )}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/dashboard" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                {!collapsed && <span>Sair da gestão</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
