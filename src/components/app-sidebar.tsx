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
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/utils";

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
              <img
                src="/__l5e/assets-v1/64e1ae41-9cf7-45e3-ac17-3658b088a3df/ticketconnect-logo-long.jpeg"
                alt=""
                className="h-6 w-auto rounded-sm"
              />
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
            <SidebarGroupLabel className="h-auto py-2 leading-tight">Plataforma&nbsp;{"\n"}TicketConnect</SidebarGroupLabel>
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
