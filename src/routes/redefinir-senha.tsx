import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { Eye, EyeOff, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/redefinir-senha")({
  component: RedefinirSenhaPage,
  head: () => ({ meta: [{ title: "Redefinir senha" }] }),
});

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    // 1) Detect explicit error returned by Supabase on the redirect
    const hashParams = parseHashParams();
    const search = new URLSearchParams(window.location.search);
    const errCode =
      hashParams.get("error_code") ||
      hashParams.get("error") ||
      search.get("error_code") ||
      search.get("error");
    const errDesc =
      hashParams.get("error_description") || search.get("error_description");

    if (errCode) {
      const msg =
        errDesc?.replace(/\+/g, " ") ||
        "O link de recuperação é inválido ou expirou.";
      setLinkError(decodeURIComponent(msg));
      setChecking(false);
      return;
    }

    // 2) Listen for PASSWORD_RECOVERY (fires when the token is exchanged)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    // 3) Fallback: check if a session already exists (e.g., direct navigation after recovery)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setHasRecoverySession(true);
      }
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 8) return toast.error("A senha deve ter no mínimo 8 caracteres.");
    if (novaSenha !== confirmar) return toast.error("As senhas não coincidem.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setLoading(false);

    if (error) return toast.error(translateError(error));
    toast.success("Senha redefinida com sucesso!");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/login" className="mb-8 block text-sm text-muted-foreground hover:underline">← Voltar</Link>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="font-display text-3xl">Redefinir senha</h1>

          {checking ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando link...
            </div>
          ) : linkError ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Link inválido ou expirado</p>
                  <p className="mt-1 text-destructive/80">{linkError}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Os links de recuperação têm validade curta e só podem ser usados uma vez.
                Solicite um novo link abaixo.
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Solicitar novo link</Link>
              </Button>
            </div>
          ) : !hasRecoverySession ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Não encontramos uma sessão de recuperação ativa. Acesse esta página
                  pelo link enviado ao seu e-mail.
                </p>
              </div>
              <Button asChild className="w-full" variant="outline">
                <Link to="/forgot-password">Solicitar novo link</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Digite sua nova senha abaixo</p>
              <form onSubmit={submit} className="mt-8 space-y-4">
                <div>
                  <Label htmlFor="nova">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="nova"
                      type={showNova ? "text" : "password"}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNova((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showNova ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showNova ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmar">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmar"
                      type={showConfirmar ? "text" : "password"}
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmar((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmar ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showConfirmar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    "Salvar nova senha"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
