import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Entrar" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const confirmed = new URLSearchParams(window.location.search).get("confirmed") === "1";
    if (!confirmed) return;

    setEmailConfirmed(true);
    let signedOut = false;
    const signOutConfirmationSession = async (session: unknown) => {
      if (!session || signedOut) return;
      signedOut = true;
      await supabase.auth.signOut();
    };

    supabase.auth.getSession().then(({ data }) => signOutConfirmationSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void signOutConfirmationSession(session);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });
    setLoading(false);
    if (error) return toast.error(translateError(error));
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  };

  const enterDemo = async () => {
    setDemoLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: "admin@igrejademo.org.br",
      password: "Demo@2026",
    });
    setDemoLoading(false);
    if (error) return toast.error(translateError(error));
    toast.success("Entrando na Igreja Demonstração");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 block text-sm text-muted-foreground hover:underline">
          ← Voltar
        </Link>
        <h1 className="font-display text-3xl">Bem-vindo ao Centro de Doações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse sua conta.</p>
        {emailConfirmed && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
            E-mail confirmado. Agora entre com seu e-mail e senha.
          </div>
        )}
        <form onSubmit={submit} className="auth-fields mt-8 space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <div className="mt-6 rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm font-medium">Conhecer a plataforma</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Acesse a Igreja Demonstração com dados de exemplo.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={enterDemo}
            disabled={demoLoading}
          >
            {demoLoading ? "Entrando..." : "Entrar na demonstração"}
          </Button>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Sem conta?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Cadastrar-me
          </Link>
        </p>
      </div>
    </div>
  );
}
