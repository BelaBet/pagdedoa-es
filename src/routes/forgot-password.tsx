import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Recuperar senha" }] }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Force a stable app origin so the recovery link works from any preview/editor host
    const host = window.location.hostname;
    const isEditor =
      host.includes("lovable.dev") ||
      host.includes("lovableproject.com") ||
      host.includes("id-preview--") ||
      host === "localhost";
    const appOrigin = isEditor
      ? "https://tk2projeto1.lovable.app"
      : window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin}/redefinir-senha`,
    });
    setLoading(false);
    if (error) return toast.error(translateError(error));
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-8 block text-sm text-muted-foreground hover:underline">← Voltar</Link>
        <h1 className="font-display text-3xl">Recuperar senha</h1>
        {sent ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
