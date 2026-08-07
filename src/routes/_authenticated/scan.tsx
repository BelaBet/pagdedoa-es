import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveTenantId } from "@/lib/impersonation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ScanLine, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
  head: () => ({ meta: [{ title: "Validar ingresso" }] }),
});

type Result = { ok: true; eventTitle: string; member: string } | { ok: false; reason: string };

function ScanPage() {
  const { roles, profile } = useAuth();
  const tenantId = useEffectiveTenantId(profile?.tenant_id);
  const isStaff = roles.includes("manager") || roles.includes("admin");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isStaff) return <p className="text-sm text-muted-foreground">Acesso restrito a gestores.</p>;

  const validate = async () => {
    if (!code.trim() || !tenantId) return;
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase
      .from("tickets")
      .select("id, status, profiles(full_name), events(title)")
      .eq("qr_code_data", code.trim())
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) {
      setResult({ ok: false, reason: "Ingresso não encontrado." });
      setLoading(false);
      return;
    }
    if (data.status !== "active") {
      setResult({ ok: false, reason: `Ingresso ${data.status}.` });
      setLoading(false);
      return;
    }
    const { error: upErr } = await supabase
      .from("tickets")
      .update({ status: "used" })
      .eq("id", data.id);
    if (upErr) {
      setResult({ ok: false, reason: upErr.message });
    } else {
      const ev = data.events as { title: string } | null;
      const pr = data.profiles as { full_name: string | null } | null;
      setResult({ ok: true, eventTitle: ev?.title ?? "—", member: pr?.full_name ?? "—" });
      toast.success("Ingresso validado!");
      setCode("");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md">
      <h1 className="font-display text-3xl">Validar ingresso</h1>
      <p className="mt-1 text-muted-foreground">Cole o código do QR para marcar como utilizado.</p>

      <div className="mt-6 space-y-3 rounded-2xl border bg-card p-6">
        <Label htmlFor="code">Código do ingresso</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="TKT-..."
        />
        <Button onClick={validate} disabled={loading} className="w-full">
          <ScanLine className="h-4 w-4" /> {loading ? "Validando..." : "Validar"}
        </Button>
      </div>

      {result && (
        <div
          className={`mt-4 rounded-2xl border p-5 ${result.ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}
        >
          {result.ok ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Ingresso válido</p>
                <p className="text-sm text-muted-foreground">
                  {result.eventTitle} · {result.member}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <p className="text-sm">{result.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
