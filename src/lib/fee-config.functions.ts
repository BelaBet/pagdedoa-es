import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Apenas super administradores podem gerenciar taxas.");
}

export type PaymentMethodKey = "pix" | "boleto" | "cartao_master_visa" | "cartao_ello_hiper_amex";

export type FeeConfigRow = {
  payment_method: PaymentMethodKey;
  adm_percent: number;
  adquirencia_fixa: number | null;
  adquirencia_avista_percent: number | null;
  adquirencia_2x_percent: number | null;
  tk2_operacional_fixo: number | null;
  tk2_op_percent: number | null;
  transacao_fixa: number;
  antecipacao_custo_percent: number | null;
  updated_at: string;
};

export type FeeConfigResult = {
  rows: (FeeConfigRow & { inherited: boolean })[];
};

/** Lista instituições para o seletor de taxas (somente super admin). */
export const listTenantsForFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id,name,slug")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string; slug: string }[];
  });

export const getFeeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenantId: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<FeeConfigResult> => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: platform, error } = await supabaseAdmin
      .from("platform_fee_config" as any)
      .select("*")
      .order("payment_method");
    if (error) throw new Error(error.message);
    const base = (platform ?? []) as unknown as FeeConfigRow[];

    if (!data.tenantId) {
      return { rows: base.map((r) => ({ ...r, inherited: false })) };
    }

    const { data: overrides } = await supabaseAdmin
      .from("tenant_fee_config" as any)
      .select("*")
      .eq("tenant_id", data.tenantId);
    const byMethod = new Map(
      ((overrides ?? []) as unknown as FeeConfigRow[]).map((r) => [r.payment_method, r]),
    );
    return {
      rows: base.map((r) => {
        const o = byMethod.get(r.payment_method);
        return o ? { ...o, inherited: false } : { ...r, inherited: true };
      }),
    };
  });

const UpdateSchema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  payment_method: z.enum(["pix", "boleto", "cartao_master_visa", "cartao_ello_hiper_amex"]),
  // Percentuais chegam do formulário em % (ex: 3.52), convertidos para
  // decimal (0.0352) antes de gravar — mesma convenção do resto do sistema.
  adm_percent: z.number().min(0).max(90),
  adquirencia_fixa: z.number().int().min(0).nullable().optional(),
  adquirencia_avista_percent: z.number().min(0).max(90).nullable().optional(),
  adquirencia_2x_percent: z.number().min(0).max(90).nullable().optional(),
  tk2_operacional_fixo: z.number().int().min(0).nullable().optional(),
  tk2_op_percent: z.number().min(0).max(90).nullable().optional(),
  transacao_fixa: z.number().int().min(0),
  antecipacao_custo_percent: z.number().min(0).max(90).nullable().optional(),
});

export const updateFeeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pct = (v: number | null | undefined) => (v == null ? v : v / 100);

    const values = {
      adm_percent: pct(data.adm_percent),
      adquirencia_fixa: data.adquirencia_fixa ?? null,
      adquirencia_avista_percent: pct(data.adquirencia_avista_percent),
      adquirencia_2x_percent: pct(data.adquirencia_2x_percent),
      tk2_operacional_fixo: data.tk2_operacional_fixo ?? null,
      tk2_op_percent: pct(data.tk2_op_percent),
      transacao_fixa: data.transacao_fixa,
      antecipacao_custo_percent: pct(data.antecipacao_custo_percent),
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };

    if (data.tenant_id) {
      const { error } = await supabaseAdmin
        .from("tenant_fee_config" as any)
        .upsert(
          { tenant_id: data.tenant_id, payment_method: data.payment_method, ...values },
          { onConflict: "tenant_id,payment_method" },
        );
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { error } = await supabaseAdmin
      .from("platform_fee_config" as any)
      .update(values)
      .eq("payment_method", data.payment_method);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a taxa específica da instituição, voltando ao padrão da plataforma. */
export const resetTenantFeeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tenant_id: z.string().uuid(),
        payment_method: z.enum(["pix", "boleto", "cartao_master_visa", "cartao_ello_hiper_amex"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenant_fee_config" as any)
      .delete()
      .eq("tenant_id", data.tenant_id)
      .eq("payment_method", data.payment_method);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
