import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { QRCodeSVG } from "qrcode.react";
import { Ticket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
  head: () => ({ meta: [{ title: "Meus ingressos" }] }),
});

function TicketsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, qr_code_data, status, created_at, events(id, title, date, location)")
        .eq("profile_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <h1 className="font-display text-3xl md:text-4xl">Meus ingressos</h1>
      <p className="mt-1 text-muted-foreground">Apresente o QR code na entrada do evento.</p>

      <div className="mt-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Você ainda não tem ingressos.</p>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {data!.map((t) => {
              const ev = t.events as {
                id: string;
                title: string;
                date: string | null;
                location: string | null;
              } | null;
              return (
                <li
                  key={t.id}
                  className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-white p-2">
                      <QRCodeSVG value={t.qr_code_data ?? t.id} size={108} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display text-lg">{ev?.title ?? "Evento"}</h3>
                      {ev?.date && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.date).toLocaleString("pt-BR")}
                        </p>
                      )}
                      {ev?.location && (
                        <p className="text-xs text-muted-foreground">{ev.location}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            t.status === "active"
                              ? "bg-primary/10 text-primary"
                              : t.status === "used"
                                ? "bg-muted text-muted-foreground"
                                : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 break-all rounded bg-muted p-2 font-mono text-[10px] text-muted-foreground">
                    {t.qr_code_data}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
