import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { provisionTenant, getTenantForEdit, updateTenantFull } from "@/lib/tenant-signup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Check, ShieldAlert } from "lucide-react";
import { cpf, cnpj } from "cpf-cnpj-validator";

export const Route = createFileRoute("/_authenticated/igrejas/nova")({
  component: WizardGate,
  validateSearch: (search: Record<string, unknown>) => ({
    tenantId: typeof search.tenantId === "string" ? search.tenantId : undefined,
  }),
  head: () => ({ meta: [{ title: "Nova Igreja — Super Admin" }] }),
});

function WizardGate() {
  const { isSuperAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-3 font-display text-xl">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apenas super administradores podem criar novas igrejas.
        </p>
      </div>
    );
  }
  return <WizardPage />;
}

// ─────────────────────── State ───────────────────────

type WizardState = {
  // Passo 1
  church_name: string;
  trade_name: string;
  legal_name: string;
  document: string;
  institutional_email: string;
  main_phone: string;
  website: string;
  description: string;
  logo_url: string;
  cover_photo_url: string;
  tagline: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  // Passo 2
  resp_full_name: string;
  resp_cpf: string;
  resp_birth_date: string;
  resp_mother_name: string;
  resp_role: string;
  resp_email: string;
  resp_phone_ddd: string;
  resp_phone_number: string;
  // Passo 3
  cep: string;
  street: string;
  number: string;
  no_number: boolean;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  uf: string;
  reference_point: string;
  // Passo 4
  bank_code: string;
  branch: string;
  branch_digit: string;
  account: string;
  account_digit: string;
  account_type: "checking" | "checking_joint" | "savings" | "savings_joint";
  holder_name: string;
  holder_document: string;
  // Passo 5
  use_pagarme: boolean;
  pagarme_recipient_id: string;
  split_platform_percent: number;
  auto_anticipation: boolean;
  anticipation_model: string;
  anticipation_days: string;
  auto_transfer: boolean;
  transfer_frequency: "daily" | "weekly" | "monthly" | "";
  // Admin
  admin_email: string;
  admin_name: string;
};

const initial: WizardState = {
  church_name: "",
  trade_name: "",
  legal_name: "",
  document: "",
  institutional_email: "",
  main_phone: "",
  website: "",
  description: "",
  logo_url: "",
  cover_photo_url: "",
  tagline: "",
  primary_color: "#1a1a1a",
  secondary_color: "#f5f5f5",
  accent_color: "#3b82f6",
  resp_full_name: "",
  resp_cpf: "",
  resp_birth_date: "",
  resp_mother_name: "",
  resp_role: "",
  resp_email: "",
  resp_phone_ddd: "",
  resp_phone_number: "",
  cep: "",
  street: "",
  number: "",
  no_number: false,
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  uf: "",
  reference_point: "",
  bank_code: "",
  branch: "",
  branch_digit: "",
  account: "",
  account_digit: "",
  account_type: "checking",
  holder_name: "",
  holder_document: "",
  use_pagarme: true,
  pagarme_recipient_id: "",
  split_platform_percent: 4.15,
  auto_anticipation: false,
  anticipation_model: "",
  anticipation_days: "",
  auto_transfer: false,
  transfer_frequency: "",
  admin_email: "",
  admin_name: "",
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const STEPS = [
  "Igreja",
  "Responsável",
  "Endereço",
  "Bancário",
  "Financeiro",
  "Documentos",
  "Resumo",
] as const;

const REQUIRED_DOCS = ["Cartão CNPJ", "Documento do Responsável", "Comprovante Bancário"];

// ─────────────────────── Page ───────────────────────

function WizardPage() {
  const router = useRouter();
  const { tenantId: editTenantId } = Route.useSearch();
  const isEditing = !!editTenantId;
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(initial);
  const [busy, setBusy] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEditing);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const provision = useServerFn(provisionTenant);
  const fetchEdit = useServerFn(getTenantForEdit);
  const update = useServerFn(updateTenantFull);

  // Faz o upload do arquivo escolhido para o bucket tenant-logos (já existia,
  // nunca tinha sido usado) e devolve a URL pública. tenant-logos exige que o
  // primeiro segmento do caminho seja o tenant_id (é assim que a RLS do bucket
  // decide quem pode escrever); por isso só dá pra subir depois de ter um id
  // de tenant — no modo criação, isso só existe depois do provisionTenant.
  async function uploadLogo(tenantId: string): Promise<string> {
    const ext = logoFile!.name.split(".").pop() || "png";
    const path = `${tenantId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("tenant-logos").upload(path, logoFile!, {
      upsert: true,
      contentType: logoFile!.type || undefined,
    });
    if (error) throw new Error(`Falha ao enviar a logo: ${error.message}`);
    const { data } = supabase.storage.from("tenant-logos").getPublicUrl(path);
    return data.publicUrl;
  }

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const result = await fetchEdit({ data: { tenantId: editTenantId! } });
        const tenant = result.tenant as NonNullable<typeof result.tenant>;
        // legal/address/bank/fin vêm de tabelas consultadas com "as any" em
        // getTenantForEdit (não estão nos tipos gerados do Supabase), o que
        // faz o client inferir SelectQueryError em vez do formato real —
        // mesmo padrão de "as any" já usado no resto do arquivo pra essas
        // tabelas.
        const legal = result.legal as any;
        const address = result.address as any;
        const bank = result.bank as any;
        const fin = result.fin as any;
        const phones = result.phones as any[];
        const phone = phones?.[0];
        setS((p) => ({
          ...p,
          church_name: tenant.name ?? "",
          trade_name: tenant.trade_name ?? "",
          legal_name: tenant.legal_name ?? "",
          document: tenant.document ?? "",
          institutional_email: tenant.institutional_email ?? "",
          main_phone: tenant.main_phone ?? "",
          website: tenant.website ?? "",
          description: tenant.description ?? "",
          logo_url: tenant.logo_url ?? "",
          cover_photo_url: tenant.cover_photo_url ?? "",
          tagline: tenant.tagline ?? "",
          primary_color: tenant.primary_color ?? p.primary_color,
          secondary_color: tenant.secondary_color ?? p.secondary_color,
          accent_color: tenant.accent_color ?? p.accent_color,
          resp_full_name: legal?.full_name ?? "",
          resp_cpf: legal?.cpf ?? "",
          resp_birth_date: legal?.birth_date ?? "",
          resp_mother_name: legal?.mother_name ?? "",
          resp_role: legal?.role ?? "",
          resp_email: legal?.email ?? "",
          resp_phone_ddd: phone?.ddd ?? "",
          resp_phone_number: phone?.number ?? "",
          cep: address?.cep ?? "",
          street: address?.street ?? "",
          number: address?.number ?? "",
          no_number: address?.no_number ?? false,
          complement: address?.complement ?? "",
          neighborhood: address?.neighborhood ?? "",
          city: address?.city ?? "",
          state: address?.state ?? "",
          uf: address?.uf ?? "",
          reference_point: address?.reference_point ?? "",
          bank_code: bank?.bank_code ?? "",
          branch: bank?.branch ?? "",
          branch_digit: bank?.branch_digit ?? "",
          account: bank?.account ?? "",
          account_digit: bank?.account_digit ?? "",
          account_type: bank?.account_type ?? "checking",
          holder_name: bank?.holder_name ?? "",
          holder_document: bank?.holder_document ?? "",
          use_pagarme: fin?.use_pagarme ?? true,
          pagarme_recipient_id: fin?.pagarme_recipient_id ?? "",
          split_platform_percent: fin?.split_platform_percent
            ? Number(fin.split_platform_percent) * 100
            : p.split_platform_percent,
          auto_anticipation: fin?.auto_anticipation ?? false,
          anticipation_model: fin?.anticipation_model ?? "",
          anticipation_days: fin?.anticipation_days != null ? String(fin.anticipation_days) : "",
          auto_transfer: fin?.auto_transfer ?? false,
          transfer_frequency: fin?.transfer_frequency ?? "",
        }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar dados da instituição.");
      } finally {
        setLoadingEdit(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, editTenantId]);

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  // ────── ViaCEP autofill simples
  const fetchCep = async () => {
    const raw = onlyDigits(s.cep);
    if (raw.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const j = await r.json();
      if (j.erro) return toast.error("CEP não encontrado.");
      setS((p) => ({
        ...p,
        street: j.logradouro ?? p.street,
        neighborhood: j.bairro ?? p.neighborhood,
        city: j.localidade ?? p.city,
        state: j.uf ?? p.state,
        uf: j.uf ?? p.uf,
      }));
    } catch {
      toast.error("Falha ao consultar CEP.");
    }
  };

  // ────── Validações por passo
  const errors = useMemo(() => validate(step, s), [step, s]);
  const canAdvance = errors.length === 0;

  const submit = async () => {
    if (errors.length) return toast.error(errors[0]);
    setBusy(true);
    try {
      const phones =
        s.resp_phone_ddd && s.resp_phone_number
          ? [
              {
                phone_type: "mobile" as const,
                ddd: onlyDigits(s.resp_phone_ddd),
                number: onlyDigits(s.resp_phone_number),
              },
            ]
          : undefined;

      const commonData = {
        church_name: s.church_name,
        document: onlyDigits(s.document),
        institution: {
          trade_name: s.trade_name || undefined,
          legal_name: s.legal_name || undefined,
          institutional_email: s.institutional_email || undefined,
          main_phone: s.main_phone || undefined,
          website: s.website || undefined,
          description: s.description || undefined,
        },
        branding: {
          logo_url: s.logo_url || undefined,
          cover_photo_url: s.cover_photo_url || undefined,
          tagline: s.tagline || undefined,
          primary_color: s.primary_color,
          secondary_color: s.secondary_color,
          accent_color: s.accent_color,
        },
        legal_responsible: s.resp_full_name
          ? {
              full_name: s.resp_full_name,
              cpf: onlyDigits(s.resp_cpf),
              email: s.resp_email || undefined,
              birth_date: s.resp_birth_date || undefined,
              mother_name: s.resp_mother_name || undefined,
              role: s.resp_role || undefined,
            }
          : undefined,
        address: s.cep
          ? {
              cep: onlyDigits(s.cep),
              street: s.street,
              number: s.no_number ? undefined : s.number,
              no_number: s.no_number,
              complement: s.complement || undefined,
              neighborhood: s.neighborhood,
              city: s.city,
              state: s.state,
              uf: s.uf.toUpperCase(),
              reference_point: s.reference_point || undefined,
            }
          : undefined,
        phones,
        bank: s.bank_code
          ? {
              bank_code: s.bank_code,
              branch: s.branch,
              branch_digit: s.branch_digit || undefined,
              account: s.account,
              account_digit: s.account_digit,
              account_type: s.account_type,
              holder_name: s.holder_name,
              holder_document: onlyDigits(s.holder_document),
            }
          : undefined,
        financial: {
          use_pagarme: s.use_pagarme,
          pagarme_recipient_id:
            s.use_pagarme && s.pagarme_recipient_id ? s.pagarme_recipient_id : undefined,
          split_platform_percent: s.split_platform_percent / 100,
          auto_anticipation: s.auto_anticipation,
          anticipation_model: s.anticipation_model || undefined,
          anticipation_days: s.anticipation_days ? Number(s.anticipation_days) : undefined,
          auto_transfer: s.auto_transfer,
          transfer_frequency: s.transfer_frequency || undefined,
          receiver_type: onlyDigits(s.document).length === 14 ? ("pj" as const) : ("pf" as const),
        },
      };

      if (isEditing) {
        if (logoFile) {
          setLogoUploading(true);
          try {
            commonData.branding = {
              ...commonData.branding,
              logo_url: await uploadLogo(editTenantId!),
            };
          } finally {
            setLogoUploading(false);
          }
        }
        const res = await update({ data: { tenantId: editTenantId!, data: commonData } });
        toast.success("Igreja atualizada com sucesso!");
        if (res.warnings?.length) res.warnings.forEach((w) => toast.warning(w));
        router.navigate({ to: "/admin/tenants" });
        return;
      }

      const res = await provision({
        data: {
          ...commonData,
          document_type: onlyDigits(s.document).length === 14 ? "cnpj" : "cpf",
          admin: s.admin_email
            ? {
                email: s.admin_email,
                full_name: s.admin_name || undefined,
              }
            : undefined,
        },
      });

      if (logoFile) {
        setLogoUploading(true);
        try {
          const logo_url = await uploadLogo(res.tenant_id);
          await update({ data: { tenantId: res.tenant_id, data: { branding: { logo_url } } } });
        } catch (e) {
          // A igreja já foi criada com sucesso; só a logo falhou — avisa mas
          // não trata como erro fatal do cadastro inteiro.
          toast.warning(
            e instanceof Error
              ? e.message
              : "Igreja criada, mas a logo não pôde ser enviada. Edite a igreja para tentar de novo.",
          );
        } finally {
          setLogoUploading(false);
        }
      }

      toast.success("Igreja criada com sucesso!");
      if (res.warnings?.length) {
        res.warnings.forEach((w) => toast.warning(w));
      }
      if (res.slug && typeof window !== "undefined") {
        window.open(`/i/${res.slug}`, "_blank", "noopener,noreferrer");
      }
      router.navigate({ to: "/igrejas" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar igreja.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Nova Igreja</h1>
          <p className="text-sm text-muted-foreground">
            Passo {step + 1} de {STEPS.length}: {STEPS[step]}
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link to="/igrejas">Cancelar</Link>
        </Button>
      </header>

      <Stepper current={step} />

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 0 && <Step1 s={s} set={set} logoFile={logoFile} setLogoFile={setLogoFile} />}
          {step === 1 && <Step2 s={s} set={set} />}
          {step === 2 && <Step3 s={s} set={set} fetchCep={fetchCep} />}
          {step === 3 && <Step4 s={s} set={set} />}
          {step === 4 && <Step5 s={s} set={set} />}
          {step === 5 && <Step6 />}
          {step === 6 && <Step7 s={s} set={set} />}
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {errors[0]}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((x) => Math.max(0, x - 1))}
          disabled={step === 0 || busy}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((x) => x + 1)} disabled={!canAdvance}>
            Continuar <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy || !canAdvance}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Criar Igreja
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── Validation ───────────────────────

function validate(step: number, s: WizardState): string[] {
  const e: string[] = [];
  const dDoc = onlyDigits(s.document);
  if (step === 0) {
    if (s.church_name.trim().length < 2) e.push("Informe o nome da igreja.");
    if (!(dDoc.length === 11 ? cpf.isValid(dDoc) : cnpj.isValid(dDoc)))
      e.push("CNPJ/CPF inválido.");
    if (s.institutional_email && !/^\S+@\S+\.\S+$/.test(s.institutional_email))
      e.push("E-mail institucional inválido.");
  }
  if (step === 1) {
    if (s.resp_full_name && s.resp_full_name.trim().length < 2)
      e.push("Nome do responsável inválido.");
    if (s.resp_cpf && !cpf.isValid(s.resp_cpf)) e.push("CPF do responsável inválido.");
    if (s.resp_email && !/^\S+@\S+\.\S+$/.test(s.resp_email))
      e.push("E-mail do responsável inválido.");
    if (s.resp_phone_ddd && !/^\d{2}$/.test(onlyDigits(s.resp_phone_ddd))) e.push("DDD inválido.");
    if (s.resp_phone_number && !/^\d{8,9}$/.test(onlyDigits(s.resp_phone_number)))
      e.push("Telefone inválido.");
  }
  if (step === 2 && s.cep) {
    if (!/^\d{8}$/.test(onlyDigits(s.cep))) e.push("CEP inválido.");
    if (!s.street) e.push("Logradouro obrigatório.");
    if (!s.no_number && !s.number) e.push("Informe o número ou marque S/N.");
    if (!s.neighborhood) e.push("Bairro obrigatório.");
    if (!s.city) e.push("Cidade obrigatória.");
    if (!s.uf || s.uf.length !== 2) e.push("UF inválida.");
  }
  if (step === 3 && s.bank_code) {
    if (!/^\d{3}$/.test(s.bank_code)) e.push("Código do banco inválido.");
    if (!/^\d{1,5}$/.test(s.branch)) e.push("Agência inválida.");
    if (s.branch_digit && !/^[0-9Xx]$/.test(s.branch_digit)) e.push("Dígito da agência inválido.");
    if (!/^\d{1,12}$/.test(s.account)) e.push("Conta inválida.");
    if (!/^[0-9Xx]$/.test(s.account_digit)) e.push("Dígito da conta inválido.");
    if (!s.holder_name) e.push("Nome do titular obrigatório.");
    const hd = onlyDigits(s.holder_document);
    if (!(hd.length === 11 ? cpf.isValid(hd) : cnpj.isValid(hd)))
      e.push("Documento do titular inválido.");
  }
  if (step === 4) {
    if (
      s.use_pagarme &&
      s.pagarme_recipient_id &&
      !/^rp_[A-Za-z0-9]+$/.test(s.pagarme_recipient_id)
    )
      e.push("Recipient ID Pagar.me inválido (deve começar com rp_).");
    if (s.split_platform_percent < 0 || s.split_platform_percent > 100)
      e.push("Split deve estar entre 0% e 100%.");
  }
  return e;
}

// ─────────────────────── Stepper ───────────────────────

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`flex items-center gap-1 rounded-full border px-3 py-1 ${
            i === current
              ? "border-primary bg-primary text-primary-foreground"
              : i < current
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                : "border-muted text-muted-foreground"
          }`}
        >
          {i < current ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
          {label}
        </li>
      ))}
    </ol>
  );
}

// ─────────────────────── Steps ───────────────────────

type SetFn = <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Step1({
  s,
  set,
  logoFile,
  setLogoFile,
}: {
  s: WizardState;
  set: SetFn;
  logoFile: File | null;
  setLogoFile: (f: File | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nome da Igreja" required>
        <Input value={s.church_name} onChange={(e) => set("church_name", e.target.value)} />
      </Field>
      <Field label="Nome Fantasia">
        <Input value={s.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
      </Field>
      <Field label="Razão Social">
        <Input value={s.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
      </Field>
      <Field label="CNPJ / CPF" required>
        <Input
          value={s.document}
          onChange={(e) => set("document", e.target.value)}
          placeholder="00.000.000/0000-00"
        />
      </Field>
      <Field label="E-mail Institucional">
        <Input
          type="email"
          value={s.institutional_email}
          onChange={(e) => set("institutional_email", e.target.value)}
        />
      </Field>
      <Field label="Telefone Principal">
        <Input
          value={s.main_phone}
          onChange={(e) => set("main_phone", e.target.value)}
          placeholder="(11) 99999-9999"
        />
      </Field>
      <Field label="Site">
        <Input
          value={s.website}
          onChange={(e) => set("website", e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label="Tagline">
        <Input value={s.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Descrição">
          <Textarea
            rows={3}
            value={s.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Logo">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <label>
              <Upload className="h-3.5 w-3.5" />
              {logoFile ? "Trocar arquivo" : "Enviar arquivo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </Button>
          {logoFile && <span className="text-xs text-muted-foreground">{logoFile.name}</span>}
        </div>
        <Input
          className="mt-2"
          value={s.logo_url}
          onChange={(e) => {
            setLogoFile(null);
            set("logo_url", e.target.value);
          }}
          placeholder="ou cole uma URL (https://...)"
        />
      </Field>
      <Field label="Foto de Capa (URL)">
        <Input
          value={s.cover_photo_url}
          onChange={(e) => set("cover_photo_url", e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <Field label="Cor Primária">
        <Input
          type="color"
          value={s.primary_color}
          onChange={(e) => set("primary_color", e.target.value)}
        />
      </Field>
      <Field label="Cor Secundária">
        <Input
          type="color"
          value={s.secondary_color}
          onChange={(e) => set("secondary_color", e.target.value)}
        />
      </Field>
      <Field label="Cor de Destaque">
        <Input
          type="color"
          value={s.accent_color}
          onChange={(e) => set("accent_color", e.target.value)}
        />
      </Field>
      <div
        className="md:col-span-2 rounded-md border p-4"
        style={{ background: s.secondary_color }}
      >
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Preview página pública
        </div>
        <div className="mt-2 flex items-center gap-3">
          {(logoFile || s.logo_url) && (
            <img
              src={logoFile ? URL.createObjectURL(logoFile) : s.logo_url}
              alt=""
              className="h-12 w-12 rounded bg-white object-contain p-1"
            />
          )}
          <div>
            <div style={{ color: s.primary_color, fontWeight: 600 }}>
              {s.church_name || "Nome da igreja"}
            </div>
            {s.tagline && (
              <div className="text-xs" style={{ color: s.accent_color }}>
                {s.tagline}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2({ s, set }: { s: WizardState; set: SetFn }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nome Completo">
        <Input value={s.resp_full_name} onChange={(e) => set("resp_full_name", e.target.value)} />
      </Field>
      <Field label="CPF">
        <Input
          value={s.resp_cpf}
          onChange={(e) => set("resp_cpf", e.target.value)}
          placeholder="000.000.000-00"
        />
      </Field>
      <Field label="Data de Nascimento">
        <Input
          type="date"
          value={s.resp_birth_date}
          onChange={(e) => set("resp_birth_date", e.target.value)}
        />
      </Field>
      <Field label="Nome da Mãe">
        <Input
          value={s.resp_mother_name}
          onChange={(e) => set("resp_mother_name", e.target.value)}
        />
      </Field>
      <Field label="Cargo / Função">
        <Input value={s.resp_role} onChange={(e) => set("resp_role", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <Input
          type="email"
          value={s.resp_email}
          onChange={(e) => set("resp_email", e.target.value)}
        />
      </Field>
      <Field label="DDD">
        <Input
          value={s.resp_phone_ddd}
          onChange={(e) => set("resp_phone_ddd", e.target.value)}
          maxLength={2}
          placeholder="11"
        />
      </Field>
      <Field label="Telefone">
        <Input
          value={s.resp_phone_number}
          onChange={(e) => set("resp_phone_number", e.target.value)}
          placeholder="999999999"
        />
      </Field>
    </div>
  );
}

function Step3({ s, set, fetchCep }: { s: WizardState; set: SetFn; fetchCep: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-1">
        <Field label="CEP">
          <div className="flex gap-2">
            <Input
              value={s.cep}
              onChange={(e) => set("cep", e.target.value)}
              onBlur={fetchCep}
              placeholder="00000-000"
            />
            <Button type="button" variant="outline" onClick={fetchCep}>
              Buscar
            </Button>
          </div>
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Logradouro">
          <Input value={s.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
      </div>
      <Field label="Número">
        <Input
          value={s.number}
          onChange={(e) => set("number", e.target.value)}
          disabled={s.no_number}
        />
      </Field>
      <div className="flex items-end gap-2">
        <Switch checked={s.no_number} onCheckedChange={(v) => set("no_number", v)} />
        <span className="text-sm">Sem número (S/N)</span>
      </div>
      <Field label="Complemento">
        <Input value={s.complement} onChange={(e) => set("complement", e.target.value)} />
      </Field>
      <Field label="Bairro">
        <Input value={s.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
      </Field>
      <Field label="Cidade">
        <Input value={s.city} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <Field label="Estado">
        <Input value={s.state} onChange={(e) => set("state", e.target.value)} />
      </Field>
      <Field label="UF">
        <Input
          value={s.uf}
          onChange={(e) => set("uf", e.target.value.toUpperCase())}
          maxLength={2}
        />
      </Field>
      <div className="md:col-span-3">
        <Field label="Ponto de Referência">
          <Input
            value={s.reference_point}
            onChange={(e) => set("reference_point", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

function Step4({ s, set }: { s: WizardState; set: SetFn }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Banco (3 dígitos)">
        <Input
          value={s.bank_code}
          onChange={(e) => set("bank_code", onlyDigits(e.target.value).slice(0, 3))}
          placeholder="341"
        />
      </Field>
      <Field label="Agência">
        <Input value={s.branch} onChange={(e) => set("branch", onlyDigits(e.target.value))} />
      </Field>
      <Field label="Dígito Agência">
        <Input
          value={s.branch_digit}
          onChange={(e) => set("branch_digit", e.target.value.slice(0, 1))}
        />
      </Field>
      <Field label="Conta">
        <Input value={s.account} onChange={(e) => set("account", onlyDigits(e.target.value))} />
      </Field>
      <Field label="Dígito Conta">
        <Input
          value={s.account_digit}
          onChange={(e) => set("account_digit", e.target.value.slice(0, 1))}
        />
      </Field>
      <Field label="Tipo de Conta">
        <Select
          value={s.account_type}
          onValueChange={(v) => set("account_type", v as WizardState["account_type"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="checking">Conta Corrente</SelectItem>
            <SelectItem value="checking_joint">Conta Corrente Conjunta</SelectItem>
            <SelectItem value="savings">Conta Poupança</SelectItem>
            <SelectItem value="savings_joint">Conta Poupança Conjunta</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Nome do Titular">
        <Input value={s.holder_name} onChange={(e) => set("holder_name", e.target.value)} />
      </Field>
      <Field label="Documento do Titular">
        <Input
          value={s.holder_document}
          onChange={(e) => set("holder_document", e.target.value)}
          placeholder="CPF ou CNPJ"
        />
      </Field>
    </div>
  );
}

function Step5({ s, set }: { s: WizardState; set: SetFn }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="font-medium">Utilizar Pagar.me</div>
          <p className="text-xs text-muted-foreground">
            Quando desativado, os dados são registrados mas pagamentos ficam bloqueados.
          </p>
        </div>
        <Switch checked={s.use_pagarme} onCheckedChange={(v) => set("use_pagarme", v)} />
      </div>

      {s.use_pagarme && (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Recipient ID Pagar.me">
            <Input
              value={s.pagarme_recipient_id}
              onChange={(e) => set("pagarme_recipient_id", e.target.value)}
              placeholder="rp_..."
            />
          </Field>
          <Field label="Split da Plataforma (%)">
            <Input
              type="number"
              step="0.01"
              value={s.split_platform_percent}
              onChange={(e) => set("split_platform_percent", Number(e.target.value))}
            />
          </Field>

          <div className="md:col-span-2 grid gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Antecipação Automática</span>
              <Switch
                checked={s.auto_anticipation}
                onCheckedChange={(v) => set("auto_anticipation", v)}
              />
            </div>
            {s.auto_anticipation && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Modelo de Antecipação">
                  <Select
                    value={s.anticipation_model}
                    onValueChange={(v) => set("anticipation_model", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by_volume">Recebimento por Volume</SelectItem>
                      <SelectItem value="dx">Recebimento em D+X</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {s.anticipation_model === "dx" && (
                  <Field label="Prazo D+X (dias)">
                    <Input
                      type="number"
                      value={s.anticipation_days}
                      onChange={(e) => set("anticipation_days", e.target.value)}
                    />
                  </Field>
                )}
              </div>
            )}
          </div>

          <div className="md:col-span-2 grid gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Transferência Automática</span>
              <Switch checked={s.auto_transfer} onCheckedChange={(v) => set("auto_transfer", v)} />
            </div>
            {s.auto_transfer && (
              <Field label="Periodicidade">
                <Select
                  value={s.transfer_frequency}
                  onValueChange={(v) =>
                    set("transfer_frequency", v as WizardState["transfer_frequency"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diária</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Step6() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Os documentos serão solicitados após a criação. Por enquanto, ficam registrados como
        pendências:
      </p>
      <ul className="space-y-2">
        {REQUIRED_DOCS.map((d) => (
          <li key={d} className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <span className="inline-block h-4 w-4 rounded border" />
            {d}
            <Badge variant="outline" className="ml-auto text-[10px]">
              obrigatório
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step7({ s, set }: { s: WizardState; set: SetFn }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v || "—"}</span>
    </div>
  );
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Igreja</h3>
        <Row k="Nome" v={s.church_name} />
        <Row k="Documento" v={s.document} />
        <Row k="E-mail" v={s.institutional_email} />
        <Row k="Telefone" v={s.main_phone} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Responsável</h3>
        <Row k="Nome" v={s.resp_full_name} />
        <Row k="CPF" v={s.resp_cpf} />
        <Row k="Cargo" v={s.resp_role} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Endereço</h3>
        <Row k="CEP" v={s.cep} />
        <Row k="Cidade/UF" v={`${s.city}/${s.uf}`} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Bancário</h3>
        <Row k="Banco" v={s.bank_code} />
        <Row k="Agência" v={`${s.branch}${s.branch_digit ? "-" + s.branch_digit : ""}`} />
        <Row k="Conta" v={`${s.account}-${s.account_digit}`} />
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Financeiro</h3>
        <Row k="Pagar.me" v={s.use_pagarme ? "Ativado" : "Desativado"} />
        <Row k="Recipient" v={s.pagarme_recipient_id} />
        <Row k="Split Plataforma" v={`${s.split_platform_percent}%`} />
      </section>
      <section className="rounded-md border p-4">
        <h3 className="mb-2 text-sm font-semibold">Administrador inicial (opcional)</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Se informado, enviaremos um convite por e-mail para acesso ao painel.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="E-mail do Admin">
            <Input value={s.admin_email} onChange={(e) => set("admin_email", e.target.value)} />
          </Field>
          <Field label="Nome do Admin">
            <Input value={s.admin_name} onChange={(e) => set("admin_name", e.target.value)} />
          </Field>
        </div>
      </section>
    </div>
  );
}
