import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BRAND_URL } from "@/lib/brand";

/**
 * getTenantForEdit e updateTenantFull expõem/alteram dados sensíveis de
 * QUALQUER instituição (responsável legal com CPF, conta bancária,
 * endereço, config financeira) usando supabaseAdmin (service role,
 * ignora RLS). Precisam ser restritas a super admin explicitamente aqui,
 * já que não há política de RLS te protegendo nesse caminho.
 */
async function assertPlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Apenas super administradores podem editar instituições.");
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

const BrandingSchema = z
  .object({
    logo_url: z.string().url().max(500).optional(),
    cover_photo_url: z.string().url().max(500).optional(),
    primary_color: z.string().regex(HEX).optional(),
    secondary_color: z.string().regex(HEX).optional(),
    accent_color: z.string().regex(HEX).optional(),
    tagline: z.string().trim().max(200).optional(),
  })
  .partial();

const InstitutionSchema = z
  .object({
    trade_name: z.string().trim().max(160).optional(),
    legal_name: z.string().trim().max(200).optional(),
    institutional_email: z.string().trim().email().max(200).optional(),
    main_phone: z.string().trim().max(20).optional(),
    website: z.string().url().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .partial();

const LegalResponsibleSchema = z
  .object({
    full_name: z.string().trim().min(2).max(160),
    cpf: z.string().trim().min(11).max(14),
    email: z.string().trim().email().max(200).optional(),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mother_name: z.string().trim().max(160).optional(),
    role: z.string().trim().max(80).optional(),
    monthly_revenue: z.number().nonnegative().optional(),
  })
  .optional();

const AddressSchema = z
  .object({
    cep: z.string().regex(/^\d{5}-?\d{3}$/),
    street: z.string().trim().min(2).max(200),
    number: z.string().trim().max(20).optional(),
    no_number: z.boolean().optional(),
    complement: z.string().trim().max(120).optional(),
    neighborhood: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(60),
    uf: z.string().trim().length(2),
    reference_point: z.string().trim().max(200).optional(),
  })
  .optional();

const PhoneSchema = z.object({
  phone_type: z.enum(["mobile", "landline", "whatsapp"]),
  ddd: z.string().regex(/^\d{2}$/),
  number: z.string().regex(/^\d{8,9}$/),
});

const BankSchema = z
  .object({
    bank_code: z.string().regex(/^\d{3}$/),
    branch: z.string().regex(/^\d{1,5}$/),
    branch_digit: z
      .string()
      .regex(/^[0-9Xx]$/)
      .optional(),
    account: z.string().regex(/^\d{1,12}$/),
    account_digit: z.string().regex(/^[0-9Xx]$/),
    account_type: z.enum(["checking", "checking_joint", "savings", "savings_joint"]),
    holder_name: z.string().trim().min(2).max(160),
    holder_document: z.string().trim().min(11).max(20),
  })
  .optional();

const FinancialSchema = z
  .object({
    receiver_type: z.enum(["pf", "pj"]).optional(),
    use_pagarme: z.boolean().optional(),
    pagarme_recipient_id: z
      .string()
      .regex(
        /^re_[A-Za-z0-9]+$/,
        "pagarme_recipient_id inválido (deve começar com 're_', formato do Pagar.me v5)",
      )
      .optional(),
    split_platform_percent: z.number().min(0).max(1).optional(),
    auto_anticipation: z.boolean().optional(),
    anticipation_model: z.string().max(40).optional(),
    anticipation_days: z.number().int().min(1).max(31).optional(),
    auto_transfer: z.boolean().optional(),
    transfer_frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  })
  .optional();

const AdminSchema = z
  .object({
    email: z.string().trim().email().max(160),
    full_name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(8).max(20).optional(),
  })
  .optional();

const InputSchema = z.object({
  church_name: z.string().trim().min(2).max(120),
  document: z.string().trim().min(11).max(20),
  document_type: z.enum(["cnpj", "cpf"]),

  institution: InstitutionSchema.optional(),
  branding: BrandingSchema.optional(),
  legal_responsible: LegalResponsibleSchema,
  address: AddressSchema,
  phones: z.array(PhoneSchema).max(5).optional(),
  bank: BankSchema,
  financial: FinancialSchema,
  admin: AdminSchema,
});

type Input = z.infer<typeof InputSchema>;

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

type PagarmeLookup = { status: string | null; found: boolean };

async function lookupPagarmeRecipient(recipientId: string): Promise<PagarmeLookup> {
  const key = process.env.PAGARME_SECRET_KEY;
  if (!key) return { status: null, found: false };
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(
    `https://api.pagar.me/core/v5/recipients/${encodeURIComponent(recipientId)}`,
    {
      headers: { Authorization: auth },
    },
  );
  if (res.status === 404) return { status: null, found: false };
  if (!res.ok) return { status: null, found: false };
  const json: any = await res.json().catch(() => null);
  return { status: json?.status ?? null, found: true };
}

async function generateQrDataUrl(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });
}

// NOTA: provisionTenant é compartilhada com o cadastro público de igrejas
// (reserveTenantForSignup, abaixo, é literalmente um alias desta função) —
// por isso NÃO pode ter uma trava de super admin aqui. O controle de quem
// pode criar via o wizard (/igrejas/nova) fica só na tela (WizardGate),
// igual já era antes. getTenantForEdit e updateTenantFull, mais abaixo,
// são exclusivas do super admin e essas sim têm a trava adicionada.
export const provisionTenant = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }: { data: Input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const warnings: string[] = [];
    const origin = process.env.PUBLIC_SITE_URL || BRAND_URL;

    const onlyDigitsDoc = data.document.replace(/\D/g, "");

    // ── CORREÇÃO: findReusableTenant retorna dados reais do tenant ────────
    async function findReusableTenant(): Promise<{
      tenant_id: string;
      slug: string;
      public_url: string;
      qr_code_url: string;
      cost_center_id: string | null;
      compliance_status: string;
      warnings: string[];
    } | null> {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("tenants")
        .select("id, slug, compliance_status")
        .eq("document", onlyDigitsDoc)
        .is("deleted_at", null)
        .maybeSingle();

      if (exErr) throw new Error(exErr.message);
      if (!existing) return null;

      const status = (existing as any).compliance_status as string | null;
      const reusableStatus =
        status === "pending_documents" ||
        status === "pending" ||
        status === "onboarding" ||
        status === "pending_financial_setup";

      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("tenant_id", existing.id);

      if (!reusableStatus || (count ?? 0) > 0) {
        // Tenant ativo com usuário → erro real de duplicidade
        throw new Error("Esta instituição já possui cadastro ativo.");
      }

      // Tenant reutilizável — buscar dados reais
      const slug = (existing as any).slug ?? "";
      const publicUrl = slug ? `${origin}/i/${slug}` : "";

      // Buscar cost_center existente — qr_code_url vive em cost_centers
      const { data: cc } = await supabaseAdmin
        .from("cost_centers")
        .select("id, qr_code_url")
        .eq("tenant_id", existing.id)
        .eq("slug", "online")
        .maybeSingle();

      return {
        tenant_id: existing.id as string,
        slug,
        public_url: publicUrl,
        qr_code_url: (cc as any)?.qr_code_url ?? "", // ← vem de cost_centers
        cost_center_id: (cc as any)?.id ?? null,
        compliance_status: status ?? "pending_documents",
        warnings: [],
      };
    }

    const reusable = await findReusableTenant();
    if (reusable) return reusable;

    // 1. Slug único
    const base = slugify(data.church_name) || `igreja-${Date.now()}`;
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const { data: clash } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${base}-${i}`;
    }

    // 2. Insert tenant
    const inst = data.institution ?? {};
    const br = data.branding ?? {};
    const tenantInsert: Record<string, unknown> = {
      name: data.church_name,
      slug,
      document: onlyDigitsDoc,
      document_type: data.document_type,
      active: true,
      compliance_status: "pending_documents",
      financial_active: false,
    };
    if (inst.trade_name) tenantInsert.trade_name = inst.trade_name;
    if (inst.legal_name) tenantInsert.legal_name = inst.legal_name;
    if (inst.institutional_email) tenantInsert.institutional_email = inst.institutional_email;
    if (inst.main_phone) tenantInsert.main_phone = inst.main_phone;
    if (inst.website) tenantInsert.website = inst.website;
    if (inst.description) tenantInsert.description = inst.description;
    if (br.logo_url) tenantInsert.logo_url = br.logo_url;
    if (br.cover_photo_url) tenantInsert.cover_photo_url = br.cover_photo_url;
    if (br.primary_color) tenantInsert.primary_color = br.primary_color;
    if (br.secondary_color) tenantInsert.secondary_color = br.secondary_color;
    if (br.accent_color) tenantInsert.accent_color = br.accent_color;
    if (br.tagline) tenantInsert.tagline = br.tagline;

    const { data: created, error: cErr } = await supabaseAdmin
      .from("tenants")
      .insert(tenantInsert as any)
      .select("id")
      .single();

    if (cErr || !created) {
      // Race condition: documento inserido entre o check e o insert
      if ((cErr as { code?: string } | null)?.code === "23505") {
        const reusedData = await findReusableTenant();
        if (reusedData) return reusedData;
      }
      throw new Error(cErr?.message || "Falha ao criar a instituição.");
    }
    const tenantId = created.id as string;

    // 3. Sementes de pendências
    await supabaseAdmin.rpc("seed_tenant_pending_documents" as any, { _tenant_id: tenantId });

    // 4. Blocos auxiliares
    if (data.legal_responsible) {
      const lr = data.legal_responsible;
      const { error } = await supabaseAdmin.from("tenant_legal_responsible" as any).insert({
        tenant_id: tenantId,
        full_name: lr.full_name,
        cpf: lr.cpf.replace(/\D/g, ""),
        email: lr.email,
        birth_date: lr.birth_date,
        mother_name: lr.mother_name,
        role: lr.role,
        monthly_revenue: lr.monthly_revenue,
      });
      if (error) warnings.push(`responsável legal: ${error.message}`);
    }

    if (data.address) {
      const ad = data.address;
      const { error } = await supabaseAdmin.from("tenant_address" as any).insert({
        tenant_id: tenantId,
        cep: ad.cep.replace(/\D/g, ""),
        street: ad.street,
        number: ad.number,
        no_number: ad.no_number ?? false,
        complement: ad.complement,
        neighborhood: ad.neighborhood,
        city: ad.city,
        state: ad.state,
        uf: ad.uf.toUpperCase(),
        reference_point: ad.reference_point,
      });
      if (error) warnings.push(`endereço: ${error.message}`);
    }

    if (data.phones?.length) {
      const { error } = await supabaseAdmin
        .from("tenant_contact_phone" as any)
        .insert(data.phones.map((p) => ({ tenant_id: tenantId, ...p })));
      if (error) warnings.push(`telefones: ${error.message}`);
    }

    if (data.bank) {
      const { error } = await supabaseAdmin.from("tenant_bank_account" as any).insert({
        tenant_id: tenantId,
        ...data.bank,
        holder_document: data.bank.holder_document.replace(/\D/g, ""),
      });
      if (error) warnings.push(`banco: ${error.message}`);
    }

    // 5. Pagar.me
    const fin = data.financial ?? {};
    const usePagarme = fin.use_pagarme !== false;
    let recipientStatus: string | null = null;
    if (usePagarme && fin.pagarme_recipient_id) {
      const lookup = await lookupPagarmeRecipient(fin.pagarme_recipient_id);
      if (!lookup.found) {
        warnings.push(
          "Não encontramos um recebedor aprovado na Pagar.me para este cadastro. Finalize primeiro a aprovação financeira.",
        );
      } else if (!["registered", "active", "approved"].includes(lookup.status ?? "")) {
        warnings.push(`Recipient encontrado mas com status "${lookup.status}".`);
      } else {
        recipientStatus = lookup.status;
      }
    }

    const splitPlatform =
      typeof fin.split_platform_percent === "number" ? fin.split_platform_percent : 0.0415;

    {
      const { error } = await supabaseAdmin.from("tenant_financial_config" as any).insert({
        tenant_id: tenantId,
        receiver_type: fin.receiver_type ?? (data.document_type === "cpf" ? "pf" : "pj"),
        use_pagarme: usePagarme,
        pagarme_recipient_id: fin.pagarme_recipient_id ?? null,
        pagarme_recipient_status: recipientStatus,
        split_platform_percent: splitPlatform,
        auto_anticipation: fin.auto_anticipation ?? false,
        anticipation_model: fin.anticipation_model ?? null,
        anticipation_days: fin.anticipation_days ?? null,
        auto_transfer: fin.auto_transfer ?? false,
        transfer_frequency: fin.transfer_frequency ?? null,
      });
      if (error) warnings.push(`config financeira: ${error.message}`);
    }

    // 6. Cost center "Online"
    const splitSeller = Number((1 - splitPlatform).toFixed(6));
    const { data: cc, error: ccErr } = await supabaseAdmin
      .from("cost_centers")
      .insert({
        tenant_id: tenantId,
        name: "Online",
        slug: "online",
        type: "online" as any,
        is_active: true,
        allows_installments: true,
        max_installments: 2,
        split_platform_percent: splitPlatform,
        split_seller_percent: splitSeller,
      } as any)
      .select("id")
      .single();
    if (ccErr || !cc)
      throw new Error(`Falha ao criar centro de custo padrão: ${ccErr?.message ?? "?"}`);
    const costCenterId = cc.id as string;

    // 7. QR Code
    const publicUrl = `${origin}/i/${slug}`;
    let qrCodeUrl: string | null = null;
    try {
      qrCodeUrl = await generateQrDataUrl(publicUrl);
      await supabaseAdmin
        .from("cost_centers")
        .update({ qr_code_url: qrCodeUrl })
        .eq("id", costCenterId);
    } catch (e) {
      console.warn("[onboarding] falha ao gerar QR:", e);
    }

    // 8. Admin
    if (data.admin) {
      const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.admin.email,
        {
          data: {
            full_name: data.admin.full_name ?? "",
            phone: data.admin.phone ?? "",
            tenant_id: tenantId,
            is_tenant_founder: true,
            lgpd_consent: true,
          },
          redirectTo: `${origin}/login?confirmed=1`,
        },
      );
      if (invErr) {
        warnings.push(`convite admin: ${invErr.message}`);
      } else if (invited?.user?.id) {
        await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: invited.user.id, tenant_id: tenantId, role: "admin" as any },
            { onConflict: "user_id,tenant_id" },
          );
      }
    }

    // 9. Recompute compliance
    const { data: status } = await supabaseAdmin.rpc("recompute_tenant_compliance" as any, {
      _tenant_id: tenantId,
    });

    return {
      tenant_id: tenantId,
      slug,
      public_url: publicUrl,
      qr_code_url: qrCodeUrl,
      cost_center_id: costCenterId,
      compliance_status: (status as string) ?? "pending_documents",
      warnings,
    };
  });

// Alias retrocompatível
export const reserveTenantForSignup = provisionTenant;

// ─────────────────────── Edição (super admin) ───────────────────────
// Reaproveita os mesmos schemas de validação e o mesmo layout de dados do
// wizard de cadastro (/igrejas/nova), mas para UPDATE em vez de INSERT —
// não reserva slug novo, não convida admin novo, não recria centro de
// custo/QR Code (esses já existem desde o cadastro original).

const UpdateInputSchema = InputSchema.omit({ admin: true, document_type: true }).extend({
  document_type: z.enum(["cnpj", "cpf"]).optional(),
});
type UpdateInput = z.infer<typeof UpdateInputSchema>;

export const getTenantForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: tenant },
      { data: legal },
      { data: address },
      { data: phones },
      { data: bank },
      { data: fin },
    ] = await Promise.all([
      supabaseAdmin.from("tenants").select("*").eq("id", data.tenantId).maybeSingle(),
      supabaseAdmin
        .from("tenant_legal_responsible" as any)
        .select("*")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from("tenant_address" as any)
        .select("*")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from("tenant_contact_phone" as any)
        .select("*")
        .eq("tenant_id", data.tenantId),
      supabaseAdmin
        .from("tenant_bank_account" as any)
        .select("*")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from("tenant_financial_config" as any)
        .select("*")
        .eq("tenant_id", data.tenantId)
        .maybeSingle(),
    ]);
    if (!tenant) throw new Error("Instituição não encontrada.");
    return { tenant, legal, address, phones: phones ?? [], bank, fin };
  });

export const updateTenantFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenantId: z.string().uuid(), data: UpdateInputSchema }).parse(d),
  )
  .handler(async ({ data: input, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tenantId, data } = input;
    const warnings: string[] = [];

    const inst = data.institution ?? {};
    const br = data.branding ?? {};
    const tenantUpdate: Record<string, unknown> = {
      name: data.church_name,
      document: data.document.replace(/\D/g, ""),
    };
    if (inst.trade_name !== undefined) tenantUpdate.trade_name = inst.trade_name;
    if (inst.legal_name !== undefined) tenantUpdate.legal_name = inst.legal_name;
    if (inst.institutional_email !== undefined)
      tenantUpdate.institutional_email = inst.institutional_email;
    if (inst.main_phone !== undefined) tenantUpdate.main_phone = inst.main_phone;
    if (inst.website !== undefined) tenantUpdate.website = inst.website;
    if (inst.description !== undefined) tenantUpdate.description = inst.description;
    if (br.logo_url !== undefined) tenantUpdate.logo_url = br.logo_url;
    if (br.cover_photo_url !== undefined) tenantUpdate.cover_photo_url = br.cover_photo_url;
    if (br.primary_color !== undefined) tenantUpdate.primary_color = br.primary_color;
    if (br.secondary_color !== undefined) tenantUpdate.secondary_color = br.secondary_color;
    if (br.accent_color !== undefined) tenantUpdate.accent_color = br.accent_color;
    if (br.tagline !== undefined) tenantUpdate.tagline = br.tagline;

    const { error: tErr } = await supabaseAdmin
      .from("tenants")
      .update(tenantUpdate as any)
      .eq("id", tenantId);
    if (tErr) throw new Error(`Falha ao atualizar a instituição: ${tErr.message}`);

    if (data.legal_responsible) {
      const lr = data.legal_responsible;
      const { error } = await supabaseAdmin.from("tenant_legal_responsible" as any).upsert(
        {
          tenant_id: tenantId,
          full_name: lr.full_name,
          cpf: lr.cpf.replace(/\D/g, ""),
          email: lr.email,
          birth_date: lr.birth_date,
          mother_name: lr.mother_name,
          role: lr.role,
          monthly_revenue: lr.monthly_revenue,
        },
        { onConflict: "tenant_id" },
      );
      if (error) warnings.push(`responsável legal: ${error.message}`);
    }

    if (data.address) {
      const ad = data.address;
      const { error } = await supabaseAdmin.from("tenant_address" as any).upsert(
        {
          tenant_id: tenantId,
          cep: ad.cep.replace(/\D/g, ""),
          street: ad.street,
          number: ad.number,
          no_number: ad.no_number ?? false,
          complement: ad.complement,
          neighborhood: ad.neighborhood,
          city: ad.city,
          state: ad.state,
          uf: ad.uf.toUpperCase(),
          reference_point: ad.reference_point,
        },
        { onConflict: "tenant_id" },
      );
      if (error) warnings.push(`endereço: ${error.message}`);
    }

    if (data.phones) {
      await supabaseAdmin
        .from("tenant_contact_phone" as any)
        .delete()
        .eq("tenant_id", tenantId);
      if (data.phones.length) {
        const { error } = await supabaseAdmin
          .from("tenant_contact_phone" as any)
          .insert(data.phones.map((p) => ({ tenant_id: tenantId, ...p })));
        if (error) warnings.push(`telefones: ${error.message}`);
      }
    }

    if (data.bank) {
      const { error } = await supabaseAdmin.from("tenant_bank_account" as any).upsert(
        {
          tenant_id: tenantId,
          ...data.bank,
          holder_document: data.bank.holder_document.replace(/\D/g, ""),
        },
        { onConflict: "tenant_id" },
      );
      if (error) warnings.push(`banco: ${error.message}`);
    }

    if (data.financial) {
      const fin = data.financial;
      const splitPlatform =
        typeof fin.split_platform_percent === "number" ? fin.split_platform_percent : 0.0415;
      const { error } = await supabaseAdmin.from("tenant_financial_config" as any).upsert(
        {
          tenant_id: tenantId,
          use_pagarme: fin.use_pagarme ?? true,
          pagarme_recipient_id: fin.pagarme_recipient_id ?? null,
          split_platform_percent: splitPlatform,
          auto_anticipation: fin.auto_anticipation ?? false,
          anticipation_model: fin.anticipation_model ?? null,
          anticipation_days: fin.anticipation_days ?? null,
          auto_transfer: fin.auto_transfer ?? false,
          transfer_frequency: fin.transfer_frequency ?? null,
        },
        { onConflict: "tenant_id" },
      );
      if (error) warnings.push(`config financeira: ${error.message}`);
    }

    await supabaseAdmin.rpc("recompute_tenant_compliance" as any, { _tenant_id: tenantId });

    return { tenant_id: tenantId, warnings };
  });
