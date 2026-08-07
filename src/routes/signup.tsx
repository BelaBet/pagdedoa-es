import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import { Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { cpf, cnpj } from "cpf-cnpj-validator";
import { useServerFn } from "@tanstack/react-start";
import { reserveTenantForSignup } from "@/lib/tenant-signup.functions";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Criar conta" }] }),
});

const baseSchema = z
  .object({
    fullName: z.string().trim().min(2, "Nome muito curto").max(120),
    email: z.string().trim().email("E-mail inválido").max(255),
    phone: z
      .string()
      .trim()
      .regex(/^\(\d{2}\) \d{5}-\d{4}$/, "Telefone inválido"),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres.").max(72),
    confirmPassword: z.string().min(1, "Confirme sua senha"),
    churchName: z.string().trim().min(2, "Informe o nome da instituição").max(120),
    documentType: z.enum(["cnpj", "cpf"]),
    document: z.string().trim().min(11, "Documento obrigatório"),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirmPassword) {
      ctx.addIssue({
        path: ["confirmPassword"],
        code: "custom",
        message: "As senhas não conferem.",
      });
    }
    if (d.documentType === "cnpj" && !cnpj.isValid(d.document)) {
      ctx.addIssue({ path: ["document"], code: "custom", message: "CNPJ inválido" });
    }
    if (d.documentType === "cpf" && !cpf.isValid(d.document)) {
      ctx.addIssue({ path: ["document"], code: "custom", message: "CPF inválido" });
    }
  });

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, "($1");
  if (d.length <= 7) return d.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function SignupPage() {
  const { tenant } = useTenant();
  const reserveTenant = useServerFn(reserveTenantForSignup);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [churchName, setChurchName] = useState("");
  const [documentType, setDocumentType] = useState<"cnpj" | "cpf">("cnpj");
  const [document, setDocument] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const EMAIL_TAKEN_MSG = "Este e-mail já está cadastrado. Volte ao login para acessar sua conta.";
  const [emailTaken, setEmailTaken] = useState(false);

  const onDocumentChange = (v: string) => {
    setDocument(documentType === "cnpj" ? maskCNPJ(v) : maskCPF(v));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailTaken(false);
    if (!consent) return toast.error("Você precisa aceitar os termos LGPD.");
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedConfirmPassword = confirmPassword.trim();

    const parsed = baseSchema.safeParse({
      fullName,
      email: normalizedEmail,
      phone,
      password: normalizedPassword,
      confirmPassword: normalizedConfirmPassword,
      churchName,
      documentType,
      document,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue.path[0] === "email") setEmailError(issue.message);
      else toast.error(issue.message);
      return;
    }
    setLoading(true);

    // 1) E-mail já existe?
    const { data: taken, error: rpcError } = await supabase.rpc("is_email_registered", {
      _email: normalizedEmail,
    });
    if (rpcError) {
      setLoading(false);
      return toast.error(translateError(rpcError));
    }
    if (taken) {
      setLoading(false);
      setEmailError(EMAIL_TAKEN_MSG);
      setEmailTaken(true);
      return;
    }

    // 2) Reservar/criar tenant
    let tenantId: string;
    try {
      const res = await reserveTenant({
        data: {
          church_name: churchName,
          document,
          document_type: documentType,
        },
      });
      tenantId = res.tenant_id;
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "";
      // Só bloqueia se a instituição já tem usuário ativo
      if (msg.includes("já possui cadastro ativo")) {
        return toast.error("Esta instituição já possui cadastro. Use o login para acessar.");
      }
      return toast.error(msg || "Falha ao criar instituição.");
    }

    // 3) signUp com tenant_id da nova instituição
    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
        data: {
          full_name: fullName,
          phone,
          tenant_id: tenantId,
          is_tenant_founder: true,
          lgpd_consent: true,
          institution_name: churchName,
          document,
          document_type: documentType,
        },
      },
    });
    setLoading(false);
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = error.message ?? "";
      const isDuplicate =
        code === "user_already_exists" ||
        code === "email_exists" ||
        /already\s+registered|already\s+exists|user\s+already/i.test(msg);
      if (isDuplicate) {
        setEmailError(EMAIL_TAKEN_MSG);
        setEmailTaken(true);
        return;
      }
      return toast.error(translateError(error));
    }

    // ✅ Sucesso
    setSubmitted(true);
  };

  // ── Tela de sucesso corrigida ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 text-3xl">
            ✓
          </div>
          <h1 className="font-display text-2xl font-bold">Instituição cadastrada!</h1>
          <p className="mt-3 text-muted-foreground">
            <strong>{churchName}</strong> foi cadastrada com sucesso. Verifique o e-mail{" "}
            <strong>{email}</strong> para confirmar sua conta e em seguida faça o login.
          </p>
          <Button asChild className="mt-6">
            <Link to="/login">Ir para o login →</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-sm text-muted-foreground hover:underline">
          ← Voltar
        </Link>
        <h1 className="font-display text-3xl">Cadastre sua instituição</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie a conta do administrador e a instituição em um único passo.
        </p>

        <form onSubmit={submit} className="auth-fields mt-8 space-y-5">
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Instituição
            </p>
            <div>
              <Label htmlFor="church">Nome da igreja / instituição</Label>
              <Input
                id="church"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div>
              <Label>Tipo de documento</Label>
              <RadioGroup
                value={documentType}
                onValueChange={(v) => {
                  setDocumentType(v as "cnpj" | "cpf");
                  setDocument("");
                }}
                className="mt-2 flex gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="cnpj" id="t-cnpj" /> CNPJ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="cpf" id="t-cpf" /> CPF
                </label>
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="doc">{documentType === "cnpj" ? "CNPJ" : "CPF"}</Label>
              <Input
                id="doc"
                value={document}
                onChange={(e) => onDocumentChange(e.target.value)}
                placeholder={documentType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
                inputMode="numeric"
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Administrador
            </p>
            <div>
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                  if (emailTaken) setEmailTaken(false);
                }}
                required
                autoComplete="email"
                maxLength={255}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "email-error" : undefined}
                className={
                  emailError ? "border-destructive focus-visible:ring-destructive" : undefined
                }
              />
              {emailError && (
                <p id="email-error" className="mt-1.5 text-xs text-destructive">
                  {emailError}{" "}
                  {emailTaken && (
                    <Link to="/login" className="font-medium text-primary underline">
                      Ir para o login
                    </Link>
                  )}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Celular</Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                required
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
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
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
            <div>
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 text-xs text-muted-foreground">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span>
              Concordo com o tratamento dos meus dados pessoais conforme a{" "}
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="text-primary underline">
                    LGPD
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tratamento de dados (LGPD)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      <strong>Dados coletados:</strong> nome, e-mail, telefone, documento da
                      instituição, status de instituição.
                    </p>
                    <p>
                      <strong>Finalidade:</strong> gestão da comunidade, comunicação, controle de
                      acesso.
                    </p>
                    <p>
                      <strong>Base legal:</strong> consentimento (Art. 7º, I da Lei 13.709/2018).
                    </p>
                  </div>
                </DialogContent>
              </Dialog>{" "}
              para fins de gestão da comunidade.
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta e instituição"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
        {tenant?.name && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Visitando: {tenant.name}</p>
        )}
      </div>
    </div>
  );
}
