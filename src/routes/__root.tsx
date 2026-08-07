import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { TenantProvider } from "@/lib/tenant-context";
import { TenantThemeBridge } from "@/lib/theme/TenantThemeBridge";
import { AuthProvider } from "@/lib/auth-context";
import { ImpersonationProvider } from "@/lib/impersonation";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Toaster } from "@/components/ui/sonner";
import { BRAND_TITLE, BRAND_DESCRIPTION } from "@/lib/brand";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl">404</h1>
        <p className="mt-4 text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: BRAND_TITLE },
      { name: "description", content: BRAND_DESCRIPTION },
      { property: "og:title", content: BRAND_TITLE },
      { name: "twitter:title", content: BRAND_TITLE },
      { property: "og:description", content: BRAND_DESCRIPTION },
      { name: "twitter:description", content: BRAND_DESCRIPTION },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2aaa2783-fb62-4b53-a332-d006a47f2d29/id-preview-4c4bb4e9--06de6279-a941-4827-a6b4-839819780a01.lovable.app-1778355730732.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2aaa2783-fb62-4b53-a332-d006a47f2d29/id-preview-4c4bb4e9--06de6279-a941-4827-a6b4-839819780a01.lovable.app-1778355730732.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <TenantThemeBridge>
          <AuthProvider>
            <ImpersonationProvider>
              <ImpersonationBanner />
              <Outlet />
              <Toaster />
            </ImpersonationProvider>
          </AuthProvider>
        </TenantThemeBridge>
      </TenantProvider>
    </QueryClientProvider>
  );
}
