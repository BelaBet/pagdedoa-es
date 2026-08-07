// Server functions para gerenciar Centros de Custo.
// Super admin: cria, edita tudo (inclusive split).
// Admin da igreja: somente toggle is_active.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BRAND_URL } from "@/lib/brand";

const CostCenterType = z.enum(["online", "presencial", "totem"]);

const CreateSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  type: CostCenterType,
  description: z.string().trim().max(500).optional().nullable(),
  splitPlatformPercent: z.number().min(0).max(1),
  splitSellerPercent: z.number().min(0).max(1),
  allowsInstallments: z.boolean().default(true),
  maxInstallments: z.number().int().min(1).max(12).default(12),
  displayOrder: z.number().int().min(0).max(999).default(0),
});

const UpdateSchema = CreateSchema.partial({
  tenantId: true,
  name: true,
  type: true,
  description: true,
  splitPlatformPercent: true,
  splitSellerPercent: true,
  allowsInstallments: true,
  maxInstallments: true,
  displayOrder: true,
}).extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
});

const ToggleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

const ListSchema = z.object({
  tenantId: z.string().uuid().optional(),
});

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado — requer super_admin");
}

async function assertTenantStaff(userId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "manager"]);
  if (roles && roles.length > 0) return;
  // super_admin também pode
  const { data: p } = await supabaseAdmin
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!p) throw new Error("Acesso negado");
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

// ── Criar centro de custo (super admin) ─────────────────────────
export const createCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof CreateSchema>) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    if (Math.abs(data.splitPlatformPercent + data.splitSellerPercent - 1) > 0.0001) {
      throw new Error("A soma dos splits (plataforma + igreja) deve ser igual a 1.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, slug")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Igreja não encontrada");
    const tenantSlug = (tenant as { slug: string }).slug;

    const base = slugify(data.name) || `centro-${Date.now()}`;
    let slug = base;
    for (let i = 1; i < 30; i++) {
      const { data: clash } = await supabaseAdmin
        .from("cost_centers")
        .select("id")
        .eq("tenant_id", data.tenantId)
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${base}-${i}`;
    }

    const { data: created, error } = await supabaseAdmin
      .from("cost_centers")
      .insert({
        tenant_id: data.tenantId,
        name: data.name,
        slug,
        type: data.type,
        description: data.description ?? null,
        split_platform_percent: data.splitPlatformPercent,
        split_seller_percent: data.splitSellerPercent,
        allows_installments: data.allowsInstallments,
        max_installments: data.maxInstallments,
        display_order: data.displayOrder,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar centro de custo");

    // Gera QR Code apontando para /i/<tenant_slug>?cc=<slug>
    const origin = process.env.PUBLIC_SITE_URL || BRAND_URL;
    const target = `${origin.replace(/\/$/, "")}/i/${tenantSlug}?cc=${slug}`;
    const qrDataUrl = await generateQrDataUrl(target);
    await supabaseAdmin
      .from("cost_centers")
      .update({ qr_code_url: qrDataUrl })
      .eq("id", created.id);

    return { id: created.id, slug, qrTarget: target };
  });

// ── Atualizar (super admin) ─────────────────────────────────────
export const updateCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof UpdateSchema>) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    if (
      data.splitPlatformPercent !== undefined &&
      data.splitSellerPercent !== undefined &&
      Math.abs(data.splitPlatformPercent + data.splitSellerPercent - 1) > 0.0001
    ) {
      throw new Error("A soma dos splits deve ser 1.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.type !== undefined) patch.type = data.type;
    if (data.description !== undefined) patch.description = data.description;
    if (data.splitPlatformPercent !== undefined)
      patch.split_platform_percent = data.splitPlatformPercent;
    if (data.splitSellerPercent !== undefined) patch.split_seller_percent = data.splitSellerPercent;
    if (data.allowsInstallments !== undefined) patch.allows_installments = data.allowsInstallments;
    if (data.maxInstallments !== undefined) patch.max_installments = data.maxInstallments;
    if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    const { error } = await supabaseAdmin
      .from("cost_centers")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

// ── Toggle ativo (staff da igreja) ──────────────────────────────
export const toggleCostCenterActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ToggleSchema>) => ToggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("cost_centers")
      .select("tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Centro de custo não encontrado");

    await assertTenantStaff(userId, (row as { tenant_id: string }).tenant_id);

    const { error } = await supabaseAdmin
      .from("cost_centers")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id, isActive: data.isActive };
  });

// ── Regenerar QR (super admin) ──────────────────────────────────
export const regenerateCostCenterQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("cost_centers")
      .select("slug, tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Centro não encontrado");
    const cc = row as { slug: string; tenant_id: string };

    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("id", cc.tenant_id)
      .maybeSingle();
    if (!t) throw new Error("Igreja não encontrada");

    const origin = process.env.PUBLIC_SITE_URL || BRAND_URL;
    const target = `${origin.replace(/\/$/, "")}/i/${(t as { slug: string }).slug}?cc=${cc.slug}`;
    const qr = await generateQrDataUrl(target);
    await supabaseAdmin.from("cost_centers").update({ qr_code_url: qr }).eq("id", data.id);
    return { id: data.id, qrTarget: target };
  });

// ── Listar (staff/super admin) — inclui inativos ────────────────
export type CostCenterRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  type: "online" | "presencial" | "totem";
  description: string | null;
  split_platform_percent: number;
  split_seller_percent: number;
  allows_installments: boolean;
  max_installments: number;
  is_active: boolean;
  qr_code_url: string | null;
  display_order: number;
  created_at: string;
};

export const listCostCenters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ListSchema>) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Super admin vê tudo; staff só do próprio tenant
    const { data: p } = await supabaseAdmin
      .from("platform_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuper = !!p;

    let query = supabaseAdmin
      .from("cost_centers")
      .select("*")
      .order("tenant_id")
      .order("display_order")
      .order("name");

    if (data.tenantId) {
      query = query.eq("tenant_id", data.tenantId);
    } else if (!isSuper) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle();
      const tid = (profile as { tenant_id: string | null } | null)?.tenant_id;
      if (!tid) return [];
      query = query.eq("tenant_id", tid);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CostCenterRow[];
  });
