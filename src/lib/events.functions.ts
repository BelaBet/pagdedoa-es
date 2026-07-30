import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InputSchema = z.object({
  base64: z.string().min(1).max(8_000_000), // ~6MB
  contentType: z.string().regex(/^image\/(png|jpe?g|webp)$/, "Tipo de imagem inválido"),
  filename: z.string().min(1).max(120),
  tenantId: z.string().uuid().optional(),
});

const AdminEventSchema = z.object({
  tenant_id: z.string().uuid(),
  title: z.string().trim().min(2).max(140),
  date: z.string().datetime().nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  banner_url: z.string().url().nullable().optional(),
  external_url: z.string().url(),
});

async function assertPlatformAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!roles?.length) {
    throw new Error("Acesso restrito a administradores da plataforma.");
  }
}


/** Upload do banner de um evento para o bucket público event-banners. */
export const uploadEventBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    let tenantId: string | null = null;
    if (data.tenantId) {
      // Só permite escolher tenant se for platform admin
      await assertPlatformAdmin(userId);
      tenantId = data.tenantId;
    } else {
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle();
      if (pErr || !prof?.tenant_id) {
        throw new Error("Perfil ou igreja não encontrados para este usuário.");
      }
      tenantId = prof.tenant_id as string;
    }

    const ext = (data.filename.split(".").pop() || "png").toLowerCase().replace("jpeg", "jpg");
    const path = `${tenantId}/banner-${Date.now()}.${ext}`;
    const buffer = Buffer.from(data.base64, "base64");
    const { error: uErr } = await supabaseAdmin.storage
      .from("event-banners")
      .upload(path, buffer, { contentType: data.contentType, upsert: true });
    if (uErr) throw new Error(`Falha ao enviar o banner: ${uErr.message}`);

    const { data: pub } = supabaseAdmin.storage.from("event-banners").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

/** Lista todos os eventos de todas as igrejas (apenas plataforma). */
export const getAllEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);

    let query = supabaseAdmin
      .from("events")
      .select(
        "id,title,date,location,description,banner_url,external_url,status,created_at,tenant_id,tenants(name,slug)"
      )
      .order("date", { ascending: false, nullsFirst: false });
    if (data.tenantId) query = query.eq("tenant_id", data.tenantId);

    const { data: rows, error } = await query;
    if (error) throw error;
    return rows ?? [];
  });

/** Lista igrejas ativas (para seleção pelo super admin). */
export const listTenantsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id,name,slug")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** Cria um evento em qualquer igreja (apenas super admin). Evento já entra ativo. */
export const createEventAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminEventSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin.from("events").insert({
      tenant_id: data.tenant_id,
      title: data.title,
      date: data.date ?? null,
      location: data.location ?? null,
      description: data.description ?? null,
      banner_url: data.banner_url ?? null,
      external_url: data.external_url,
      status: "active",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Atualiza um evento de qualquer igreja (apenas super admin). */
export const updateEventAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    AdminEventSchema.omit({ tenant_id: true })
      .extend({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "closed"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("events")
      .update({
        title: data.title,
        date: data.date ?? null,
        location: data.location ?? null,
        description: data.description ?? null,
        banner_url: data.banner_url ?? null,
        external_url: data.external_url,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove um evento de qualquer igreja (apenas super admin). */
export const deleteEventAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


