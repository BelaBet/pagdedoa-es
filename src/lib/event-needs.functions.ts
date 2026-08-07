// Server functions para necessidades de evento (padrinhos e doação de itens)
// e para as promessas feitas a elas.
//
// Padrinho e doação de comida são a mesma estrutura: alguém se compromete com
// uma necessidade da festa. A diferença é apenas se o compromisso é em dinheiro
// ('sponsorship') ou em item ('item').
//
// Promessa NÃO é doação: fica fora de `donations` de propósito, para o total do
// tesoureiro continuar batendo com o extrato bancário.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NeedKind = z.enum(["sponsorship", "item"]);
const PledgeStatus = z.enum(["promised", "fulfilled", "cancelled"]);

export type EventNeed = {
  id: string;
  eventId: string;
  kind: "sponsorship" | "item";
  title: string;
  description: string | null;
  targetQuantity: number;
  unit: string | null;
  amountPerUnit: number | null;
  displayOrder: number;
  isActive: boolean;
  /** Somatório das promessas não canceladas. */
  pledgedQuantity: number;
};

export type EventPledge = {
  id: string;
  needId: string;
  needTitle: string;
  pledgerName: string;
  pledgerPhone: string | null;
  pledgerEmail: string | null;
  quantity: number;
  amount: number | null;
  note: string | null;
  status: "promised" | "fulfilled" | "cancelled";
  createdAt: string;
};

type Ctx = { user: { id: string } };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Confirma que a pessoa é staff da igreja dona do evento. */
async function assertEventAccess(userId: string, eventId: string) {
  const db = await admin();

  const { data: ev, error } = await db
    .from("events")
    .select("id, tenant_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) throw new Error("Evento não encontrado.");

  const { data: platform } = await db
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (platform) return ev.tenant_id as string;

  const { data: role } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", ev.tenant_id as string)
    .in("role", ["admin", "manager"])
    .maybeSingle();
  if (!role) throw new Error("Sem permissão para este evento.");

  return ev.tenant_id as string;
}

// ─────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────

export const listEventNeeds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EventNeed[]> => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    const { data: needs, error } = await db
      .from("event_needs")
      .select("*")
      .eq("event_id", data.eventId)
      .order("display_order")
      .order("title");
    if (error) throw new Error(error.message);

    const ids = (needs ?? []).map((n) => n.id);
    const promessas = new Map<string, number>();

    if (ids.length > 0) {
      const { data: pledges, error: pErr } = await db
        .from("event_pledges")
        .select("need_id, quantity, status")
        .in("need_id", ids);
      if (pErr) throw new Error(pErr.message);

      for (const p of pledges ?? []) {
        if (p.status === "cancelled") continue;
        promessas.set(p.need_id, (promessas.get(p.need_id) ?? 0) + (p.quantity ?? 0));
      }
    }

    return (needs ?? []).map((n) => ({
      id: n.id,
      eventId: n.event_id,
      kind: n.kind,
      title: n.title,
      description: n.description,
      targetQuantity: n.target_quantity,
      unit: n.unit,
      amountPerUnit: n.amount_per_unit === null ? null : Number(n.amount_per_unit),
      displayOrder: n.display_order,
      isActive: n.is_active,
      pledgedQuantity: promessas.get(n.id) ?? 0,
    }));
  });

export const listEventPledges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        status: PledgeStatus.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<EventPledge[]> => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    let q = db
      .from("event_pledges")
      .select("*, event_needs(title)")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false });

    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((p) => ({
      id: p.id,
      needId: p.need_id,
      needTitle: (p.event_needs as { title?: string } | null)?.title ?? "Necessidade removida",
      pledgerName: p.pledger_name,
      pledgerPhone: p.pledger_phone,
      pledgerEmail: p.pledger_email,
      quantity: p.quantity,
      amount: p.amount === null ? null : Number(p.amount),
      note: p.note,
      status: p.status,
      createdAt: p.created_at,
    }));
  });

// ─────────────────────────────────────────────────────────────
// Escrita — necessidades
// ─────────────────────────────────────────────────────────────

const NeedInput = z
  .object({
    eventId: z.string().uuid(),
    kind: NeedKind,
    title: z.string().trim().min(2, "Informe um título").max(120),
    description: z.string().trim().max(500).optional().nullable(),
    targetQuantity: z.number().int().min(1).max(9999),
    unit: z.string().trim().max(30).optional().nullable(),
    amountPerUnit: z.number().positive().optional().nullable(),
    displayOrder: z.number().int().min(0).max(999).default(0),
  })
  .refine((v) => v.kind !== "sponsorship" || v.amountPerUnit != null, {
    message: "Padrinho precisa de valor por cota.",
    path: ["amountPerUnit"],
  });

export const createEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NeedInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const tenantId = await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    const { error } = await db.from("event_needs").insert({
      tenant_id: tenantId,
      event_id: data.eventId,
      kind: data.kind,
      title: data.title,
      description: data.description ?? null,
      target_quantity: data.targetQuantity,
      unit: data.unit ?? null,
      amount_per_unit: data.amountPerUnit ?? null,
      display_order: data.displayOrder,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        eventId: z.string().uuid(),
        title: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        targetQuantity: z.number().int().min(1).max(9999).optional(),
        unit: z.string().trim().max(30).nullable().optional(),
        amountPerUnit: z.number().positive().nullable().optional(),
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().min(0).max(999).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    type NeedPatch = Partial<{
      title: string;
      description: string | null;
      target_quantity: number;
      unit: string | null;
      amount_per_unit: number | null;
      is_active: boolean;
      display_order: number;
    }>;
    const patch: NeedPatch = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.targetQuantity !== undefined) patch.target_quantity = data.targetQuantity;
    if (data.unit !== undefined) patch.unit = data.unit;
    if (data.amountPerUnit !== undefined) patch.amount_per_unit = data.amountPerUnit;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;

    const { error } = await db
      .from("event_needs")
      .update(patch)
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEventNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), eventId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    // Apagar a necessidade leva junto as promessas (cascade). Se alguém já se
    // ofereceu, desativar preserva o histórico — e é quase sempre o que se quer.
    const { count } = await db
      .from("event_pledges")
      .select("id", { count: "exact", head: true })
      .eq("need_id", data.id)
      .neq("status", "cancelled");

    if ((count ?? 0) > 0) {
      throw new Error(
        `Esta necessidade já tem ${count} promessa(s). Desative em vez de excluir, para não perder o histórico.`,
      );
    }

    const { error } = await db
      .from("event_needs")
      .delete()
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Escrita — promessas
// ─────────────────────────────────────────────────────────────

export const setPledgeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        eventId: z.string().uuid(),
        status: PledgeStatus,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    const { error } = await db
      .from("event_pledges")
      .update({
        status: data.status,
        confirmed_at: data.status === "fulfilled" ? new Date().toISOString() : null,
        confirmed_by: data.status === "fulfilled" ? ctx.user.id : null,
      })
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Meta do evento e quanto já foi arrecadado em doações confirmadas. */
export const getEventGoal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    const { data: ev, error } = await db
      .from("events")
      .select("goal_amount")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: raised, error: rErr } = await db.rpc("event_raised_amount", {
      _event_id: data.eventId,
    });
    if (rErr) throw new Error(rErr.message);

    return {
      goal:
        ev?.goal_amount === null || ev?.goal_amount === undefined ? null : Number(ev.goal_amount),
      raised: Number(raised ?? 0),
    };
  });

export const setEventGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        goal: z.number().positive().max(99_999_999).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertEventAccess(ctx.user.id, data.eventId);
    const db = await admin();

    const { error } = await db
      .from("events")
      .update({ goal_amount: data.goal })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
