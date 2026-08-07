import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { DonationsSummary } from "@/components/donations-summary";
import { ExternalLink, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Painel" }] }),
});

function Dashboard() {
  const { profile, roles } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const isStaff = roles.includes("manager") || roles.includes("admin");
  const qrRef = useRef<HTMLDivElement>(null);

  const { data: myTenant } = useQuery({
    queryKey: ["my-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name, logo_url, slug, primary_color, secondary_color")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  const onboardingDone = myTenant ? myTenant.logo_url != null && myTenant.name !== "Comunidade Demo" : false;

  const greeting = `Olá, ${profile?.full_name?.split(" ")[0] ?? "instituição"}`;

  const qrUrl = myTenant?.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/i/${myTenant.slug}` : "";
  const primary = myTenant?.primary_color ?? "#1a3a5c";

  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl">{greeting}</h1>
      <p className="mt-1 text-muted-foreground">
        {isStaff ? "Visão geral da sua igreja." : "Acompanhe sua jornada na igreja."}
      </p>

      <DonationsSummary tenantId={tenantId} />

      {isStaff && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/dashboard/financeiro" className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm hover:bg-accent">
            Ver financeiro →
          </Link>
          {myTenant?.slug && (
            <a
              href={`/i/${myTenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              Página de doação
            </a>
          )}
        </div>
      )}

      {/* ── QR CODE CARD ─────────────────────────────────────────── */}
      {myTenant?.slug && (
        <div className="mt-8 rounded-2xl border bg-card p-6 md:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: myTenant.secondary_color ?? "#C9993A" }}>
              QR Code
            </span>
            <h2 className="mt-2 font-display text-xl md:text-2xl" style={{ color: primary }}>
              Doe pelo QR Code
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escaneie com a câmera do celular e contribua de onde estiver
            </p>

            <div className="mt-6 inline-flex flex-col items-center gap-4 rounded-2xl border p-6" style={{ borderColor: `${primary}22`, background: "#fafaf7" }}>
              <div
                ref={qrRef}
                className="rounded-xl bg-white p-4 shadow-lg"
              >
                <QRCodeCanvas
                  value={qrUrl}
                  size={200}
                  level="M"
                  includeMargin={false}
                  fgColor={primary}
                />
              </div>

              <p className="max-w-[220px] break-all text-center text-xs text-muted-foreground">{qrUrl}</p>

              <button
                type="button"
                onClick={() => {
                  const canvas = qrRef.current?.querySelector("canvas");
                  if (!canvas) return;
                  const link = document.createElement("a");
                  link.download = `qrcode-${myTenant.slug}.png`;
                  link.href = (canvas as HTMLCanvasElement).toDataURL("image/png");
                  link.click();
                  toast.success("QR Code baixado!");
                }}
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                style={{ borderColor: primary, color: primary }}
              >
                <Download className="h-4 w-4" />
                Baixar QR Code
              </button>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
              Página segura · Centro de Doações
            </p>
          </div>
        </div>
      )}

      {!onboardingDone && (
        <div className="mt-10 rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl">Próximos passos</h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              <Link to="/igrejas/onboarding" className="underline decoration-primary hover:text-foreground transition-colors">
                Atualize seu <strong>perfil</strong> e preferências de privacidade.
              </Link>
            </li>
            {isStaff && <li>Crie uma nova campanha de doação.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
