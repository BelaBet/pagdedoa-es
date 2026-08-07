import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cpf, cnpj } from "cpf-cnpj-validator";
import { useServerFn } from "@tanstack/react-start";
import { updateChurchIdentity } from "@/lib/church.functions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/igrejas/onboarding")({
  component: OnboardingGate,
});

function OnboardingGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!user?.email_confirmed_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 text-2xl">
            ✉
          </div>
          <h1 className="font-display text-2xl">Confirme seu e-mail</h1>
          <p className="mt-3 text-muted-foreground">
            Você precisa confirmar seu e-mail antes de iniciar o cadastro da igreja.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/login">Voltar ao login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <OnboardingPage />;
}

// ─────────────────────────── Helpers ───────────────────────────

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
};

const maskCNPJ = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const isValidCPF = (v: string) => cpf.isValid(v);
const isValidCNPJ = (v: string) => cnpj.isValid(v);

// ─────────────────────────── Schemas ───────────────────────────

const partnerSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo").max(120),
  cpf: z.string().refine(isValidCPF, "CPF do sócio inválido"),
  email: z.string().trim().email("E-mail inválido").max(160),
});

const schema = z
  .object({
    church_name: z.string().trim().min(2, "Informe o nome da igreja").max(120),
    church_tagline: z.string().trim().max(200).optional().or(z.literal("")),
    type: z.enum(["pj", "pf"]),
    document: z.string().min(1, "Informe o documento"),
    company_name: z.string().trim().max(160).optional().or(z.literal("")),
    company_email: z.string().trim().max(160).optional().or(z.literal("")),
    partners: z.array(partnerSchema).min(1).max(2),
    receiver_email: z.string().trim().max(160).optional().or(z.literal("")),
    description: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.type === "pj") {
      if (!isValidCNPJ(data.document))
        ctx.addIssue({ path: ["document"], code: "custom", message: "CNPJ inválido" });
      if (!data.company_name || data.company_name.trim().length < 2)
        ctx.addIssue({
          path: ["company_name"],
          code: "custom",
          message: "Informe o nome da empresa",
        });
      if (data.company_email && !/^\S+@\S+\.\S+$/.test(data.company_email))
        ctx.addIssue({ path: ["company_email"], code: "custom", message: "E-mail inválido" });
    } else {
      if (!isValidCPF(data.document))
        ctx.addIssue({ path: ["document"], code: "custom", message: "CPF inválido" });
    }
    if (data.receiver_email && !/^\S+@\S+\.\S+$/.test(data.receiver_email))
      ctx.addIssue({ path: ["receiver_email"], code: "custom", message: "E-mail inválido" });
  });

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { key: "identidade", title: "Identidade" },
  { key: "ident", title: "Documento" },
  { key: "empresa", title: "Empresa" },
  { key: "socio", title: "Sócio" },
  { key: "receb", title: "Recebimento" },
  { key: "revisao", title: "Revisão" },
] as const;

// ─────────────────────────── UI primitives ───────────────────────────

const fieldBase =
  "w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children} {required && <span className="text-primary">*</span>}
    </label>
  );
}

function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1.5 text-xs text-destructive">{msg}</p>;
}

// ─────────────────────────── Page ───────────────────────────

function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [savedTenant, setSavedTenant] = useState<{
    name: string;
    tagline: string;
    logo_url: string | null;
    completo: boolean;
    pendencias: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitChurch = useServerFn(updateChurchIdentity);
  const queryClient = useQueryClient();

  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
  const prefilledDoc = (meta.document ?? "").replace(/\D/g, "");
  const prefilledType: "pj" | "pf" =
    meta.document_type === "cpf"
      ? "pf"
      : meta.document_type === "cnpj"
        ? "pj"
        : prefilledDoc.length === 11
          ? "pf"
          : "pj";
  const prefilledDocMasked = prefilledDoc
    ? prefilledType === "pj"
      ? maskCNPJ(prefilledDoc)
      : maskCPF(prefilledDoc)
    : "";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      church_name: meta.institution_name ?? "",
      church_tagline: "",
      type: prefilledType,
      document: prefilledDocMasked,
      company_name: meta.institution_name ?? "",
      company_email: "",
      partners: [{ full_name: meta.full_name ?? "", cpf: "", email: user?.email ?? "" }],
      receiver_email: user?.email ?? "",
      description: "",
    },
  });

  const { register, watch, setValue, formState, trigger, getValues, handleSubmit } = form;
  const errors = formState.errors;
  const type = watch("type");
  const partners = watch("partners");
  const churchName = watch("church_name");

  // Skip empresa step for PF
  const visibleSteps = useMemo(
    () => (type === "pj" ? STEPS : STEPS.filter((s) => s.key !== "empresa")),
    [type],
  );
  const currentIndex = Math.min(step, visibleSteps.length - 1);
  const currentKey = visibleSteps[currentIndex].key;
  const progress = ((currentIndex + 1) / visibleSteps.length) * 100;

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoError(null);
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      setLogoError("Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setLogoError("Tamanho máximo: 4 MB.");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function next() {
    const fieldsByKey: Record<
      string,
      (keyof FormValues | `partners.${number}.${"full_name" | "cpf" | "email"}`)[]
    > = {
      identidade: ["church_name", "church_tagline"],
      ident: ["type", "document"],
      empresa: ["company_name", "company_email"],
      socio: partners.flatMap((_, i) => [
        `partners.${i}.full_name` as const,
        `partners.${i}.cpf` as const,
        `partners.${i}.email` as const,
      ]),
      receb: ["receiver_email", "description"],
      revisao: [],
    };
    const ok = await trigger(fieldsByKey[currentKey] as never, { shouldFocus: true });
    if (!ok) return;
    setStep(currentIndex + 1);
  }

  function prev() {
    setStep(Math.max(0, currentIndex - 1));
  }

  function goTo(idx: number) {
    if (idx <= currentIndex) setStep(idx);
  }

  function addPartner() {
    if (partners.length >= 2) return;
    setValue("partners", [...partners, { full_name: "", cpf: "", email: "" }], {
      shouldValidate: false,
    });
  }

  function removePartner(i: number) {
    setValue(
      "partners",
      partners.filter((_, idx) => idx !== i),
      { shouldValidate: false },
    );
  }

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const payload: {
        name: string;
        tagline: string;
        logo?: { base64: string; contentType: string; filename: string };
      } = {
        name: values.church_name,
        tagline: values.church_tagline || "",
      };
      if (logoFile) {
        const base64 = await fileToBase64(logoFile);
        payload.logo = {
          base64,
          contentType: logoFile.type,
          filename: logoFile.name,
        };
      }
      const result = await submitChurch({ data: payload });

      const { data: tenantRow, error: tErr } = await supabase
        .from("tenants")
        .select("id, name, tagline, logo_url, compliance_status")
        .eq("id", result.tenantId)
        .maybeSingle();
      if (tErr) throw new Error(`Falha ao verificar a igreja: ${tErr.message}`);
      if (!tenantRow || tenantRow.name !== values.church_name) {
        throw new Error("Dados da igreja não foram persistidos corretamente.");
      }

      // O cadastro so esta completo quando recompute_tenant_compliance()
      // considera o tenant apto a receber. Endereco, conta bancaria e
      // responsavel legal sao coletados em outras telas, entao esta etapa
      // quase sempre termina incompleta — e precisa dizer isso.
      const [addr, bank, resp] = await Promise.all([
        supabase
          .from("tenant_address")
          .select("tenant_id")
          .eq("tenant_id", result.tenantId)
          .maybeSingle(),
        supabase
          .from("tenant_bank_account")
          .select("tenant_id")
          .eq("tenant_id", result.tenantId)
          .maybeSingle(),
        supabase
          .from("tenant_legal_responsible")
          .select("tenant_id")
          .eq("tenant_id", result.tenantId)
          .maybeSingle(),
      ]);
      const pendencias: string[] = [];
      if (!addr.data) pendencias.push("Endereço da instituição");
      if (!bank.data) pendencias.push("Conta bancária para recebimento");
      if (!resp.data) pendencias.push("Responsável legal");
      if (tenantRow.compliance_status === "pending_documents") {
        pendencias.push("Documentos obrigatórios");
      }

      const completo = tenantRow.compliance_status === "active" && pendencias.length === 0;

      // Grava a flag apenas quando o cadastro fecha de verdade. Marca-la
      // antes fazia a igreja sair achando que tinha terminado.
      if (completo) {
        const { error: updErr } = await supabase.auth.updateUser({
          data: { onboarding_completed: true },
        });
        if (updErr) throw new Error(`Falha ao marcar onboarding: ${updErr.message}`);
      }

      setSavedTenant({
        name: tenantRow.name,
        tagline: tenantRow.tagline ?? "",
        logo_url: tenantRow.logo_url ?? null,
        completo,
        pendencias,
      });
      // Invalida caches do tenant para que a logo/cores apareçam imediatamente
      // na home "/" e no header sem reload manual.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["home-tenant"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenant"] }),
        queryClient.invalidateQueries({ queryKey: ["my-tenant-header"] }),
      ]);
      toast.success(completo ? "Cadastro concluído." : "Identidade salva. Ainda faltam etapas.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível concluir o cadastro.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  });

  if (savedTenant) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {savedTenant.completo ? "Cadastro concluído" : "Identidade salva"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {savedTenant.completo
              ? "A instituição já pode receber doações."
              : "Faltam etapas antes de a instituição poder receber doações."}
          </p>

          <div className="mt-6 flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4 text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
              {savedTenant.logo_url ? (
                <img src={savedTenant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{savedTenant.name}</p>
              {savedTenant.tagline && (
                <p className="truncate text-xs text-muted-foreground">{savedTenant.tagline}</p>
              )}
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {savedTenant.completo ? "Apta a receber" : "Cadastro incompleto"}
              </p>
            </div>
          </div>

          {savedTenant.pendencias.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-left">
              <p className="text-xs font-medium text-foreground">Ainda falta cadastrar</p>
              <ul className="mt-2 space-y-1">
                {savedTenant.pendencias.map((p) => (
                  <li key={p} className="text-xs text-muted-foreground">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            className="mt-6 w-full"
            onClick={() => {
              if (typeof window !== "undefined") window.location.assign("/");
              else router.navigate({ to: "/" });
            }}
          >
            {savedTenant.completo ? "Ir para o painel" : "Continuar cadastro no painel"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-10">
      <div className="mx-auto w-full max-w-[640px]">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Cadastro de Igreja
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete as etapas para configurar a identidade visual e habilitar o recebimento.
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {/* Progress bar */}
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Steps breadcrumb */}
          <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
            {visibleSteps.map((s, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex;
              const clickable = i <= currentIndex;
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={!clickable}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
                      active
                        ? "bg-primary/10 text-primary"
                        : done
                          ? "text-primary/80 hover:text-primary"
                          : "text-muted-foreground"
                    } ${clickable ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{s.title}</span>
                  </button>
                  {i < visibleSteps.length - 1 && <span className="text-border">›</span>}
                </li>
              );
            })}
          </ol>

          <form onSubmit={onSubmit} className="space-y-6">
            {/* STEP: IDENTIDADE (logo + nome + tagline) */}
            {currentKey === "identidade" && (
              <div className="space-y-5">
                <h2 className="text-lg font-medium text-foreground">Identidade visual da igreja</h2>
                <p className="-mt-3 text-xs text-muted-foreground">
                  A logo será aplicada imediatamente na página pública e no painel.
                </p>

                <div>
                  <Label>Logo da igreja</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoPreview}
                          alt="Pré-visualização da logo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-7 w-7 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={onLogoChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        {logoFile ? "Trocar imagem" : "Enviar logo"}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        PNG, JPG, WEBP ou SVG · até 4 MB
                      </p>
                    </div>
                  </div>
                  <ErrorMsg msg={logoError ?? undefined} />
                </div>

                <div>
                  <Label required>Nome da igreja</Label>
                  <input
                    {...register("church_name")}
                    className={`${fieldBase} ${errors.church_name ? "border-destructive ring-1 ring-destructive" : ""}`}
                    placeholder="Ex: Igreja Comunidade da Graça"
                  />
                  <ErrorMsg msg={errors.church_name?.message} />
                </div>
                <div>
                  <Label>Frase de apresentação</Label>
                  <input
                    {...register("church_tagline")}
                    className={fieldBase}
                    placeholder="Ex: Um lugar de fé, amor e comunidade"
                  />
                  <ErrorMsg msg={errors.church_tagline?.message} />
                </div>
              </div>
            )}

            {/* STEP: IDENT (documento) */}
            {currentKey === "ident" && (
              <div className="space-y-5">
                <h2 className="text-lg font-medium text-foreground">Identificação da igreja</h2>
                <div>
                  <Label required>Tipo de cadastro</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { v: "pj", label: "Pessoa Jurídica" },
                      { v: "pf", label: "Pessoa Física" },
                    ].map((opt) => {
                      const selected = type === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => {
                            setValue("type", opt.v as "pj" | "pf");
                            setValue("document", "");
                          }}
                          className={`rounded-md border px-4 py-3 text-sm font-medium transition ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input bg-background text-muted-foreground hover:border-ring/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label required>Número do documento</Label>
                  <input
                    {...register("document")}
                    onChange={(e) => {
                      const masked =
                        type === "pj" ? maskCNPJ(e.target.value) : maskCPF(e.target.value);
                      setValue("document", masked, { shouldValidate: false });
                    }}
                    placeholder={type === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                    className={`${fieldBase} ${errors.document ? "border-destructive ring-1 ring-destructive focus:border-destructive focus:ring-destructive/40" : ""}`}
                    inputMode="numeric"
                  />
                  <ErrorMsg msg={errors.document?.message} />
                </div>
              </div>
            )}

            {/* STEP: EMPRESA */}
            {currentKey === "empresa" && (
              <div className="space-y-5">
                <h2 className="text-lg font-medium">Dados da empresa</h2>
                <div>
                  <Label required>Nome da empresa</Label>
                  <input
                    {...register("company_name")}
                    className={fieldBase}
                    placeholder="Razão social"
                  />
                  <ErrorMsg msg={errors.company_name?.message} />
                </div>
                <div>
                  <Label>E-mail da empresa</Label>
                  <input
                    {...register("company_email")}
                    type="email"
                    className={fieldBase}
                    placeholder="contato@empresa.com"
                  />
                  <ErrorMsg msg={errors.company_email?.message} />
                </div>
              </div>
            )}

            {/* STEP: SOCIO */}
            {currentKey === "socio" && (
              <div className="space-y-6">
                <h2 className="text-lg font-medium">Dados do responsável</h2>
                {partners.map((_, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-medium text-primary">Responsável {i + 1}</h3>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => removePartner(i)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remover
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label required>Nome completo</Label>
                        <input {...register(`partners.${i}.full_name`)} className={fieldBase} />
                        <ErrorMsg msg={errors.partners?.[i]?.full_name?.message} />
                      </div>
                      <div>
                        <Label required>CPF</Label>
                        <input
                          {...register(`partners.${i}.cpf`)}
                          onChange={(e) =>
                            setValue(`partners.${i}.cpf`, maskCPF(e.target.value), {
                              shouldValidate: false,
                            })
                          }
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          className={fieldBase}
                        />
                        <ErrorMsg msg={errors.partners?.[i]?.cpf?.message} />
                      </div>
                      <div>
                        <Label required>E-mail</Label>
                        <input
                          type="email"
                          {...register(`partners.${i}.email`)}
                          className={fieldBase}
                          placeholder="responsavel@igreja.com"
                        />
                        <ErrorMsg msg={errors.partners?.[i]?.email?.message} />
                      </div>
                    </div>
                  </div>
                ))}
                {partners.length < 2 && (
                  <button
                    type="button"
                    onClick={addPartner}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 px-4 py-3 text-sm text-primary transition hover:bg-primary/5"
                  >
                    <Plus className="h-4 w-4" /> Adicionar outro responsável
                  </button>
                )}
              </div>
            )}

            {/* STEP: RECEB */}
            {currentKey === "receb" && (
              <div className="space-y-5">
                <h2 className="text-lg font-medium">Dados de recebimento</h2>
                <div>
                  <Label>E-mail financeiro</Label>
                  <input
                    type="email"
                    {...register("receiver_email")}
                    className={fieldBase}
                    placeholder="financeiro@igreja.com"
                  />
                  <ErrorMsg msg={errors.receiver_email?.message} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <textarea
                    {...register("description")}
                    rows={4}
                    className={`${fieldBase} resize-none`}
                    placeholder="Descreva brevemente a atividade da igreja"
                  />
                  <ErrorMsg msg={errors.description?.message} />
                </div>
              </div>
            )}

            {/* STEP: REVISAO */}
            {currentKey === "revisao" && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium">Revisão e confirmação</h2>

                <ReviewBlock title="Identidade">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                      {logoPreview ? (
                        <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-foreground">{churchName || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {getValues("church_tagline") || "—"}
                      </p>
                    </div>
                  </div>
                </ReviewBlock>

                <ReviewBlock title="Documento">
                  <Row
                    label="Tipo"
                    value={getValues("type") === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
                  />
                  <Row label="Documento" value={getValues("document")} />
                </ReviewBlock>

                {getValues("type") === "pj" && (
                  <ReviewBlock title="Empresa">
                    <Row label="Nome" value={getValues("company_name") || "—"} />
                    <Row label="E-mail" value={getValues("company_email") || "—"} />
                  </ReviewBlock>
                )}

                <ReviewBlock
                  title={getValues("partners").length > 1 ? "Responsáveis" : "Responsável"}
                >
                  {getValues("partners").map((p, i) => (
                    <div key={i} className="rounded-md border border-border bg-background p-3">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-primary">
                        Responsável {i + 1}
                      </p>
                      <Row label="Nome" value={p.full_name} />
                      <Row label="CPF" value={p.cpf} />
                      <Row label="E-mail" value={p.email} />
                    </div>
                  ))}
                </ReviewBlock>

                <ReviewBlock title="Recebimento">
                  <Row label="E-mail" value={getValues("receiver_email") || "—"} />
                  <Row label="Descrição" value={getValues("description") || "—"} />
                </ReviewBlock>
              </div>
            )}

            {/* Nav */}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
              <button
                type="button"
                onClick={prev}
                disabled={currentIndex === 0 || submitting}
                className="flex items-center gap-1.5 rounded-md border border-input bg-transparent px-4 py-2.5 text-sm text-muted-foreground transition hover:border-ring/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>

              {currentKey !== "revisao" ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={
                    (currentKey === "identidade" && !!errors.church_name) ||
                    (currentKey === "ident" && !!errors.document) ||
                    (currentKey === "empresa" &&
                      (!!errors.company_name || !!errors.company_email)) ||
                    (currentKey === "socio" && !!errors.partners)
                  }
                  className="flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próximo <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Cadastrando..." : "Confirmar e cadastrar"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
