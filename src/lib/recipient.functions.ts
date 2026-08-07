import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGARME_BASE = "https://api.pagar.me/core/v5";

function authHeader() {
  const key = process.env.PAGARME_SECRET_KEY;
  if (!key) throw new Error("PAGARME_SECRET_KEY não configurado");
  // btoa is available in Workers / browsers; use Buffer fallback if needed
  const token =
    typeof btoa === "function" ? btoa(`${key}:`) : Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

async function pagarme<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAGARME_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? (body as { message?: string }).message
        : res.statusText;
    throw new Error(`Pagar.me ${res.status}: ${msg ?? "erro"}`);
  }
  return body as T;
}

/** Resolve recipientId based on scope: tenant uses tenant_payment_settings; platform uses PLATFORM_RECIPIENT_ID. */
async function resolveRecipientId(
  scope: "tenant" | "platform",
  ctx: {
    supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>;
    userId: string;
  },
  explicitTenantId?: string,
): Promise<string> {
  if (scope === "platform") {
    // Verify platform role
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin
      .from("platform_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    if (!pr) throw new Error("Acesso restrito à plataforma");
    const id = process.env.PLATFORM_RECIPIENT_ID;
    if (!id) throw new Error("PLATFORM_RECIPIENT_ID não configurado");
    return id;
  }
  // tenant scope
  let tenantId: string | undefined;
  if (explicitTenantId) {
    // Só um platform admin pode consultar o recipient de uma instituição que
    // não é a sua própria (ex: gerar relatório de saques de outra igreja).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin
      .from("platform_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    if (!pr) throw new Error("Acesso restrito à plataforma");
    tenantId = explicitTenantId;
  } else {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    tenantId = (profile as { tenant_id?: string } | null)?.tenant_id;
  }
  if (!tenantId) throw new Error("Tenant não encontrado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tps } = await supabaseAdmin
    .from("tenant_payment_settings")
    .select("pagarme_recipient_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const recId = (tps as { pagarme_recipient_id?: string | null } | null)?.pagarme_recipient_id;
  if (!recId)
    throw new Error("Esta instituição ainda não está habilitada para receber pagamentos.");
  return recId;
}

const Scope = z.enum(["tenant", "platform"]);

export type BalanceResponse = {
  available: { amount: number };
  waiting_funds: { amount: number };
  transferred: { amount: number };
};

export const getRecipientBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "tenant" | "platform" }) => z.object({ scope: Scope }).parse(d))
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    return pagarme<BalanceResponse>(`/recipients/${recipientId}/balance`);
  });

export type TransferItem = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  bank_account?: {
    holder_name?: string;
    bank?: string;
    branch_number?: string;
    account_number?: string;
  };
};

export const getRecipientTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "tenant" | "platform"; page?: number; size?: number }) =>
    z
      .object({
        scope: Scope,
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    const res = await pagarme<{ data: TransferItem[]; paging?: unknown }>(
      `/recipients/${recipientId}/transfers?page=${data.page}&size=${data.size}`,
    );
    return { items: res.data ?? [] };
  });

export type AnticipationItem = {
  id: string;
  amount: number;
  fee: number;
  anticipation_fee?: number;
  net_amount?: number;
  status: string;
  created_at: string;
  payment_date?: string;
};

export const getRecipientAnticipations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { scope: "tenant" | "platform"; page?: number; size?: number }) =>
    z
      .object({
        scope: Scope,
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    try {
      const res = await pagarme<{ data: AnticipationItem[] }>(
        `/recipients/${recipientId}/anticipations?page=${data.page}&size=${data.size}`,
      );
      return { items: res.data ?? [] };
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) return { items: [] };
      throw e;
    }
  });

export const getAnticipationLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { scope: "tenant" | "platform"; timeframe?: "start" | "end"; payment_date?: string }) =>
      z
        .object({
          scope: Scope,
          timeframe: z.enum(["start", "end"]).default("start"),
          payment_date: z.string().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    const date = data.payment_date ?? new Date().toISOString().slice(0, 10);
    return pagarme<{
      maximum?: { amount: number; anticipation_fee?: number; fee?: number };
      minimum?: { amount: number };
    }>(
      `/recipients/${recipientId}/anticipation_limits?timeframe=${data.timeframe}&payment_date=${date}`,
    );
  });

export const simulateAnticipation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      scope: "tenant" | "platform";
      amount: number;
      timeframe: "start" | "end";
      payment_date: string;
    }) =>
      z
        .object({
          scope: Scope,
          amount: z.number().int().positive(),
          timeframe: z.enum(["start", "end"]),
          payment_date: z.string().min(8),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    return pagarme<{
      amount: number;
      anticipation_fee: number;
      fee: number;
      net_amount: number;
      payment_date: string;
    }>(`/recipients/${recipientId}/anticipations/simulate`, {
      method: "POST",
      body: JSON.stringify({
        amount: data.amount,
        timeframe: data.timeframe,
        payment_date: data.payment_date,
      }),
    });
  });

export const requestAnticipation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      scope: "tenant" | "platform";
      amount: number;
      timeframe: "start" | "end";
      payment_date: string;
    }) =>
      z
        .object({
          scope: Scope,
          amount: z.number().int().positive(),
          timeframe: z.enum(["start", "end"]),
          payment_date: z.string().min(8),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const recipientId = await resolveRecipientId(data.scope, context as never);
    return pagarme<AnticipationItem>(`/recipients/${recipientId}/anticipations`, {
      method: "POST",
      body: JSON.stringify({
        amount: data.amount,
        timeframe: data.timeframe,
        payment_date: data.payment_date,
      }),
    });
  });

export type TransactionsSummary = {
  totalGrossCents: number;
  totalFeeCents: number;
  totalNetCents: number;
  count: number;
  periodStart: string;
  periodEnd: string;
};

/**
 * Tenant-only: extrato da igreja, calculado a partir de payments confirmados.
 * Não consulta o Pagar.me — só agrega donation_amount/platform_fee já guardados
 * no momento do split. Não expõe taxa por transação, somente o total do período.
 */
export const getRecipientTransactionsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { periodStart: string; periodEnd: string }) =>
    z
      .object({
        periodStart: z.string().min(8),
        periodEnd: z.string().min(8),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>;
      userId: string;
    };
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const tenantId = (profile as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) throw new Error("Tenant não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .eq("tenant_id", tenantId)
      .in("role", ["manager", "admin"])
      .limit(1)
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso restrito a administradores da igreja.");

    const { data: rows, error } = await supabaseAdmin
      .from("payments")
      .select("donation_amount, platform_fee")
      .eq("tenant_id", tenantId)
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`);
    if (error) throw new Error(error.message);

    type Row = { donation_amount: number | null; platform_fee: number | null };
    const list = (rows ?? []) as Row[];
    const totals = list.reduce(
      (acc, r) => {
        acc.gross += r.donation_amount ?? 0;
        acc.fee += r.platform_fee ?? 0;
        return acc;
      },
      { gross: 0, fee: 0 },
    );

    return {
      totalGrossCents: totals.gross,
      totalFeeCents: totals.fee,
      totalNetCents: totals.gross - totals.fee,
      count: list.length,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    } satisfies TransactionsSummary;
  });

export type PaymentListItem = {
  id: string;
  donation_amount: number | null;
  method: string;
  card_brand: string | null;
  status: string;
  created_at: string;
};

/** Tenant-only: lista de doações para a tabela de extrato (sem taxa por linha). */
export const getRecipientPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { periodStart: string; periodEnd: string; page?: number; size?: number }) =>
    z
      .object({
        periodStart: z.string().min(8),
        periodEnd: z.string().min(8),
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>;
      userId: string;
    };
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const tenantId = (profile as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) throw new Error("Tenant não encontrado");

    // NOTA: a view payments_staff foi removida na migration
    // 20260612172845 (substituída por GRANT de coluna direto na tabela).
    // As colunas abaixo já constam no GRANT SELECT para 'authenticated'
    // em public.payments, então a query direta funciona sob RLS normal.
    const { data: rows, error } = await ctx.supabase
      .from("payments")
      .select("id, donation_amount, method, card_brand, status, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.size, data.page * data.size - 1);
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as PaymentListItem[] };
  });

/** Platform-only: aggregate platform fee revenue from paid payments. */
export const getPlatformFeeRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin
      .from("platform_roles")
      .select("role")
      .eq("user_id", (context as { userId: string }).userId)
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    if (!pr) throw new Error("Acesso restrito à plataforma");
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(
        "platform_fee, pagarme_fee, tk2_op_fee, transacao_fee, split_platform_amount, split_seller_amount, seller_recipient_id",
      )
      .eq("status", "confirmed")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    type Row = {
      platform_fee: number | null;
      pagarme_fee: number | null;
      tk2_op_fee: number | null;
      transacao_fee: number | null;
      split_platform_amount: number | null;
      split_seller_amount: number | null;
      seller_recipient_id: string | null;
    };
    const rows = (data ?? []) as Row[];
    const totals = rows.reduce(
      (acc, r) => {
        acc.platformRevenue += r.platform_fee ?? 0;
        acc.pagarmeAbsorbed += r.pagarme_fee ?? 0;
        acc.tk2OpRevenue += r.tk2_op_fee ?? 0;
        acc.transacaoAbsorbed += r.transacao_fee ?? 0;
        acc.totalPlatform += r.split_platform_amount ?? 0;
        acc.totalSeller += r.split_seller_amount ?? 0;
        return acc;
      },
      {
        platformRevenue: 0,
        pagarmeAbsorbed: 0,
        tk2OpRevenue: 0,
        transacaoAbsorbed: 0,
        totalPlatform: 0,
        totalSeller: 0,
      },
    );
    const bySellerMap = new Map<
      string,
      {
        sellerRecipientId: string;
        platformRevenue: number;
        tk2OpRevenue: number;
        totalPlatform: number;
        totalSeller: number;
        count: number;
      }
    >();
    for (const r of rows) {
      const k = r.seller_recipient_id ?? "—";
      const cur = bySellerMap.get(k) ?? {
        sellerRecipientId: k,
        platformRevenue: 0,
        tk2OpRevenue: 0,
        totalPlatform: 0,
        totalSeller: 0,
        count: 0,
      };
      cur.platformRevenue += r.platform_fee ?? 0;
      cur.tk2OpRevenue += r.tk2_op_fee ?? 0;
      cur.totalPlatform += r.split_platform_amount ?? 0;
      cur.totalSeller += r.split_seller_amount ?? 0;
      cur.count += 1;
      bySellerMap.set(k, cur);
    }
    return {
      totalFeeCents: totals.platformRevenue,
      count: rows.length,
      breakdown: totals,
      bySeller: Array.from(bySellerMap.values()),
    };
  });

export type WithdrawalReportItem = {
  id: string;
  type: "transfer" | "anticipation";
  status: string;
  amountCents: number;
  feeCents: number;
  createdAt: string;
};

/**
 * Retiradas (transfers) e antecipações do período, para o relatório em PDF.
 * A API do Pagar.me não filtra por data — busca as páginas necessárias e
 * filtra created_at no período localmente.
 */
export const getWithdrawalsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { periodStart: string; periodEnd: string; tenantId?: string }) =>
      z
        .object({
          periodStart: z.string().min(8),
          periodEnd: z.string().min(8),
          tenantId: z.string().uuid().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>;
      userId: string;
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin
      .from("platform_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();
    const isPlatformAdmin = !!pr;

    if (isPlatformAdmin && !data.tenantId) {
      // "Todas as instituições" não tem um único recipient para consultar —
      // saques/antecipações são por instituição.
      return { items: [] as WithdrawalReportItem[], unavailable: true as const };
    }

    let recipientId: string;
    try {
      recipientId = await resolveRecipientId(
        "tenant",
        ctx,
        isPlatformAdmin ? data.tenantId : undefined,
      );
    } catch {
      // Instituição ainda sem recipient configurado no Pagar.me, ou sem
      // permissão — mostra "indisponível" na tela em vez de quebrar a página.
      return { items: [] as WithdrawalReportItem[], unavailable: true as const };
    }

    const start = new Date(`${data.periodStart}T00:00:00.000Z`).getTime();
    const end = new Date(`${data.periodEnd}T23:59:59.999Z`).getTime();

    async function fetchAllPages<T extends { created_at: string }>(
      path: string,
    ): Promise<T[]> {
      const out: T[] = [];
      let page = 1;
      // Os resultados vêm ordenados do mais recente para o mais antigo; para
      // quando a página inteira já está fora (mais antiga) do período.
      for (let i = 0; i < 20; i++) {
        const res = await pagarme<{ data: T[] }>(`${path}?page=${page}&size=50`);
        const items = res.data ?? [];
        if (items.length === 0) break;
        out.push(...items);
        const oldest = new Date(items[items.length - 1].created_at).getTime();
        if (oldest < start) break;
        page += 1;
      }
      return out;
    }

    const [transfers, anticipations] = await Promise.all([
      fetchAllPages<TransferItem>(`/recipients/${recipientId}/transfers`).catch(
        () => [] as TransferItem[],
      ),
      fetchAllPages<AnticipationItem>(`/recipients/${recipientId}/anticipations`).catch(
        () => [] as AnticipationItem[],
      ),
    ]);

    const items: WithdrawalReportItem[] = [
      ...transfers.map((t) => ({
        id: t.id,
        type: "transfer" as const,
        status: t.status,
        amountCents: t.amount,
        feeCents: 0,
        createdAt: t.created_at,
      })),
      ...anticipations.map((a) => ({
        id: a.id,
        type: "anticipation" as const,
        status: a.status,
        amountCents: a.net_amount ?? a.amount,
        feeCents: a.fee ?? a.anticipation_fee ?? 0,
        createdAt: a.created_at,
      })),
    ]
      .filter((i) => {
        const t = new Date(i.createdAt).getTime();
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { items, unavailable: false as const };
  });
