import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Tela "Doações": lista resumida + detalhe por doação/tentativa de pagamento.
 *
 * Fonte primária: payments (reference_type='donation'), não donations.
 * donations só é criada quando o pagamento NÃO falha (ver payments.functions.ts,
 * persistPayment: `if (args.status !== "failed")`), então tentativas falhadas
 * só existem em payments, sem doador associado. Para listar "todas as
 * tentativas, inclusive falhas", a lista parte de payments e busca o doador
 * (via donations.payment_id) quando existir.
 *
 * Regras de acesso:
 * - Staff de tenant (manager/admin): só vê pagamentos do próprio tenant_id,
 *   valor mostrado é líquido (sem taxa visível).
 * - Super admin (platform_roles): vê pagamentos de todos os tenants, com
 *   filtro opcional por tenant, valor bruto + taxa administrativa visíveis.
 *
 * Endereço de cobrança (cartão/boleto) não tem coluna própria — é extraído
 * em tempo real de payments.gateway_request (jsonb), que é bloqueado para
 * o client (REVOKE SELECT) e só acessado aqui via supabaseAdmin no server.
 * Doações via Pix não têm endereço (não é coletado nesse fluxo).
 */

type Ctx = {
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>;
  userId: string;
};

async function resolveAccess(ctx: Ctx) {
  // NOTA: usa supabaseAdmin (service_role) de propósito, não o client da
  // sessão do usuário.
  // Essa função É a checagem de autorização em si — ela decide se quem
  // está chamando pode ver dados de todas as instituições ou só da
  // própria. Rodar essas consultas sob RLS/GRANTs de coluna do papel
  // 'authenticated' não faz sentido aqui (nenhuma delas expõe dado a mais
  // por conta disso) e evita qualquer dependência frágil de GRANT em
  // colunas específicas só para uma checagem de papel.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Existem 4 papéis de plataforma (super_admin, support, finance, operator),
  // mas só super_admin deve enxergar dados de todas as instituições — igual
  // já é reforçado no banco (is_platform_admin() SQL exige role='super_admin'
  // especificamente). Checar só "existe alguma linha em platform_roles" (sem
  // filtrar o role) tratava support/finance/operator como super admin
  // também, o que não deveria acontecer.
  const { data: roleRow } = await supabaseAdmin
    .from("platform_roles")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .eq("role", "super_admin")
    .limit(1)
    .maybeSingle();
  if (roleRow) return { isPlatformAdmin: true as const, tenantId: null as string | null };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tenantId = (profile as { tenant_id?: string } | null)?.tenant_id ?? null;
  if (!tenantId) throw new Error("Tenant não encontrado.");

  const { data: staffRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("tenant_id", tenantId)
    .in("role", ["manager", "admin"])
    .limit(1)
    .maybeSingle();
  if (!staffRow) throw new Error("Acesso restrito a administradores da igreja.");

  return { isPlatformAdmin: false as const, tenantId };
}

export type DonationListItem = {
  id: string; // payment id (fonte primária agora é payments, não donations)
  donationId: string | null; // null quando o pagamento falhou antes de criar a doação
  donorName: string | null;
  tenantId: string;
  tenantName: string | null;
  paymentMethod: string | null;
  cardBrand: string | null;
  amountCents: number;
  status: string | null;
  createdAt: string;
};

export const getDonationsList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      periodStart: string;
      periodEnd: string;
      tenantId?: string;
      page?: number;
      size?: number;
    }) =>
      z
        .object({
          periodStart: z.string().min(8),
          periodEnd: z.string().min(8),
          tenantId: z.string().uuid().optional(),
          page: z.number().int().min(1).default(1),
          size: z.number().int().min(1).max(100).default(20),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const access = await resolveAccess(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let countQuery = supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("reference_type", "donation")
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`);

    if (!access.isPlatformAdmin) {
      countQuery = countQuery.eq("tenant_id", access.tenantId as string);
    } else if (data.tenantId) {
      countQuery = countQuery.eq("tenant_id", data.tenantId);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    // Soma do periodo inteiro, nao apenas da pagina visivel. Sem isto o
    // tesoureiro precisa somar na calculadora para fechar o caixa.
    // Considera apenas o que foi efetivamente pago.
    let sumQuery = supabaseAdmin
      .from("payments")
      // NOTA: no banco a coluna ja se chama platform_fee, mas o types.ts
      // gerado ainda diz platform_fee. Ao regenerar os tipos, trocar aqui.
      .select("donation_amount, platform_fee, amount")
      .eq("reference_type", "donation")
      .eq("status", "confirmed")
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`);

    if (!access.isPlatformAdmin) {
      sumQuery = sumQuery.eq("tenant_id", access.tenantId as string);
    } else if (data.tenantId) {
      sumQuery = sumQuery.eq("tenant_id", data.tenantId);
    }

    const { data: sumRows, error: sumError } = await sumQuery;
    if (sumError) throw new Error(sumError.message);

    let paidCount = 0;
    let grossCents = 0;
    let netCents = 0;
    for (const r of sumRows ?? []) {
      const bruto = r.donation_amount ?? Math.round(Number(r.amount ?? 0) * 100);
      paidCount += 1;
      grossCents += bruto;
      netCents += bruto - (r.platform_fee ?? 0);
    }

    let query = supabaseAdmin
      .from("payments")
      .select(
        "id, tenant_id, method, card_brand, donation_amount, status, created_at, reference_id",
      )
      .eq("reference_type", "donation")
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .range((data.page - 1) * data.size, data.page * data.size - 1);

    if (!access.isPlatformAdmin) {
      query = query.eq("tenant_id", access.tenantId as string);
    } else if (data.tenantId) {
      query = query.eq("tenant_id", data.tenantId);
    }

    type PaymentRow = {
      id: string;
      tenant_id: string;
      method: string | null;
      card_brand: string | null;
      donation_amount: number | null;
      status: string;
      created_at: string;
      reference_id: string | null; // = donations.id quando a doação foi criada
    };
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const payments = (rows ?? []) as PaymentRow[];

    // doador + bruto/admin_fee vêm de donations (só existe quando o pagamento não falhou)
    const donationIds = [
      ...new Set(payments.map((p) => p.reference_id).filter(Boolean)),
    ] as string[];
    const donationById = new Map<
      string,
      { donor_name: string | null; gross_amount: number | null; net_amount: number | null }
    >();
    if (donationIds.length > 0) {
      // NOTA: a view donations_staff foi removida na migration
      // 20260612172845 (substituída por GRANT de coluna direto na tabela).
      // supabaseAdmin usa service_role, que ignora RLS/GRANTs de coluna,
      // então consultamos a tabela base diretamente.
      const { data: dons, error: donsErr } = await supabaseAdmin
        .from("donations")
        .select("id, donor_name, gross_amount, net_amount")
        .in("id", donationIds);
      if (donsErr) {
        // Antes essa falha era ignorada silenciosamente — nome do doador e
        // valores ficavam em branco sem nenhum aviso no log, dificultando
        // diagnosticar o problema. Logamos aqui, mas sem quebrar a lista
        // inteira por causa disso (fallback abaixo já cobre esse caso).
        console.error("[getDonationsList] falha ao buscar donations", donsErr);
      }
      for (const d of (dons ?? []) as {
        id: string;
        donor_name: string | null;
        gross_amount: number | null;
        net_amount: number | null;
      }[])
        donationById.set(d.id, d);
    }

    // nome do tenant só é necessário para super admin (a igreja já sabe quem é)
    const tenantNameById = new Map<string, string>();
    if (access.isPlatformAdmin) {
      const tenantIds = [...new Set(payments.map((p) => p.tenant_id))];
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabaseAdmin
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds);
        for (const t of (tenants ?? []) as { id: string; name: string }[])
          tenantNameById.set(t.id, t.name);
      }
    }

    const items: DonationListItem[] = payments.map((p) => {
      const donation = p.reference_id ? donationById.get(p.reference_id) : undefined;
      // fallback para payments.donation_amount (líquido) quando não há donation vinculada
      // (pagamento falhou antes de gravar gross_amount em donations)
      const fallbackNet = p.donation_amount ?? 0;
      return {
        id: p.id,
        donationId: p.reference_id,
        donorName: donation?.donor_name ?? null,
        tenantId: p.tenant_id,
        tenantName: access.isPlatformAdmin ? (tenantNameById.get(p.tenant_id) ?? null) : null,
        paymentMethod: p.method,
        cardBrand: p.card_brand,
        amountCents: access.isPlatformAdmin
          ? (donation?.gross_amount ?? fallbackNet)
          : (donation?.net_amount ?? fallbackNet),
        status: p.status,
        createdAt: p.created_at,
      };
    });

    return {
      items,
      isPlatformAdmin: access.isPlatformAdmin,
      total: count ?? 0,
      summary: { paidCount, grossCents, netCents },
    };
  });

type BillingAddress = { line1: string; city: string; state: string; zipCode: string } | null;

function extractBillingAddress(gatewayRequest: unknown): BillingAddress {
  if (!gatewayRequest || typeof gatewayRequest !== "object") return null;
  // payload enviado ao Pagar.me: customer.address ou billing_address, conforme o fluxo (cartão/boleto)
  const req = gatewayRequest as Record<string, unknown>;
  const addr =
    (req.billing_address as Record<string, unknown> | undefined) ??
    ((req.customer as Record<string, unknown> | undefined)?.address as
      Record<string, unknown> | undefined);
  if (!addr) return null;
  const line1 = [addr.line_1, addr.line1].find((v) => typeof v === "string") as string | undefined;
  const city = addr.city as string | undefined;
  const state = addr.state as string | undefined;
  const zip = [addr.zip_code, addr.zipCode].find((v) => typeof v === "string") as
    string | undefined;
  if (!line1 && !city && !zip) return null;
  return { line1: line1 ?? "", city: city ?? "", state: state ?? "", zipCode: zip ?? "" };
}

export type DonationDetail = {
  id: string; // payment id
  donationId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  donorPhone: string | null;
  tenantId: string;
  tenantName: string | null;
  paymentMethod: string | null;
  cardBrand: string | null;
  grossAmountCents: number | null;
  netAmountCents: number | null;
  adminFeeCents: number | null;
  status: string | null;
  errorMessage: string | null;
  gatewayId: string | null;
  createdAt: string;
  updatedAt: string | null;
  billingAddress: BillingAddress;
  isPlatformAdmin: boolean;
};

export const getDonationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const access = await resolveAccess(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("payments")
      .select(
        // gateway_request está REVOKEd para o client — omitido; billingAddress fica null.
        "id, tenant_id, method, card_brand, donation_amount, status, error_message, gateway_id, created_at, reference_id, reference_type",
      )
      .eq("id", data.paymentId)
      .eq("reference_type", "donation");
    if (!access.isPlatformAdmin) query = query.eq("tenant_id", access.tenantId as string);

    type Row = {
      id: string;
      tenant_id: string;
      method: string | null;
      card_brand: string | null;
      donation_amount: number | null;
      status: string;
      error_message: string | null;
      gateway_id: string | null;
      created_at: string;
      reference_id: string | null;
    };
    const { data: row, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Doação não encontrada.");
    const r = row as Row;

    let donorName: string | null = null;
    let donorEmail: string | null = null;
    let donorPhone: string | null = null;
    let grossAmountCents: number | null = null;
    let netAmountCents: number | null = r.donation_amount; // fallback quando não há donation
    let adminFeeCents: number | null = null;
    if (r.reference_id) {
      // ver nota em getDonationsList sobre a remoção da view donations_staff
      const { data: donation } = await supabaseAdmin
        .from("donations")
        .select("donor_name, donor_email, donor_phone, gross_amount, net_amount, admin_fee")
        .eq("id", r.reference_id)
        .maybeSingle();
      if (donation) {
        const d = donation as {
          donor_name: string | null;
          donor_email: string | null;
          donor_phone: string | null;
          gross_amount: number | null;
          net_amount: number | null;
          admin_fee: number | null;
        };
        donorName = d.donor_name;
        donorEmail = d.donor_email;
        donorPhone = d.donor_phone;
        grossAmountCents = d.gross_amount;
        netAmountCents = d.net_amount ?? netAmountCents;
        // NOTA: admin_fee no banco guarda só a parcela ADM G2 (3,52%), não a
        // taxa total (também inclui adquirente + taxa fixa Pagar.me). A taxa
        // real cobrada do doador é sempre bruto − líquido — mesmo cálculo já
        // usado em getDonationsReport(). Não usar d.admin_fee diretamente aqui.
        adminFeeCents =
          grossAmountCents != null && netAmountCents != null
            ? Math.max(grossAmountCents - netAmountCents, 0)
            : d.admin_fee;
      }
    }

    const billingAddress = null; // gateway_request está REVOKEd para o client

    let tenantName: string | null = null;
    if (access.isPlatformAdmin) {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("name")
        .eq("id", r.tenant_id)
        .maybeSingle();
      tenantName = (tenant as { name: string } | null)?.name ?? null;
    }

    const detail: DonationDetail = {
      id: r.id,
      donationId: r.reference_id,
      donorName,
      donorEmail,
      donorPhone,
      tenantId: r.tenant_id,
      tenantName,
      paymentMethod: r.method,
      cardBrand: r.card_brand,
      grossAmountCents: access.isPlatformAdmin ? grossAmountCents : null,
      netAmountCents,
      adminFeeCents: access.isPlatformAdmin ? adminFeeCents : null,
      status: r.status,
      errorMessage: access.isPlatformAdmin ? r.error_message : null,
      gatewayId: r.gateway_id,
      createdAt: r.created_at,
      updatedAt: null,
      billingAddress,
      isPlatformAdmin: access.isPlatformAdmin,
    };
    return detail;
  });

export type DonationReportItem = {
  id: string;
  donorName: string | null;
  donorDocument: string | null;
  donorPhone: string | null;
  donorEmail: string | null;
  paymentMethod: string | null;
  installments: number | null;
  cardBrand: string | null;
  donationAmountCents: number; // "Valor da doação" — sempre o valor puro (net_amount).
  // Como quem paga a taxa é o doador (who_pays='donor'), gross_amount = doação + taxa
  // somadas, e net_amount = só a doação. Usar net_amount aqui evita mostrar a taxa
  // embutida como se fosse parte do valor doado.
  adminFeeCents: number; // "Taxa de administração" (já consolidada)
  tenantName: string | null; // só preenchido para super admin
  createdAt: string;
};

/**
 * Relatório completo de doações (PDF). Traz todas as informações captadas
 * no momento do pagamento, e só dois valores monetários por doação:
 * valor da doação (bruto) e taxa de administração — já consolidada em
 * uma única taxa (soma de adquirente + operacional G2 + fixa por
 * transação), calculada em computeFees() no momento da cobrança.
 */
export const getDonationsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { periodStart: string; periodEnd: string; tenantId?: string }) =>
    z
      .object({
        periodStart: z.string().min(8),
        periodEnd: z.string().min(8),
        tenantId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const access = await resolveAccess(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Consulta a tabela base diretamente (a view donations_staff foi
    // removida e nunca recriada — ver nota em getDonationsList).
    let query = supabaseAdmin
      .from("donations")
      .select(
        "id, tenant_id, donor_name, donor_document, donor_phone, donor_email, payment_method, installments, card_brand, gross_amount, net_amount, admin_fee, created_at",
      )
      .is("deleted_at", null)
      .gte("created_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("created_at", `${data.periodEnd}T23:59:59.999Z`)
      .order("created_at", { ascending: false });

    if (!access.isPlatformAdmin) {
      query = query.eq("tenant_id", access.tenantId as string);
    } else if (data.tenantId) {
      query = query.eq("tenant_id", data.tenantId);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      tenant_id: string;
      donor_name: string | null;
      donor_document: string | null;
      donor_phone: string | null;
      donor_email: string | null;
      payment_method: string | null;
      installments: number | null;
      card_brand: string | null;
      gross_amount: number | null;
      net_amount: number | null;
      admin_fee: number | null;
      created_at: string;
    };
    const donations = (rows ?? []) as Row[];

    const tenantNameById = new Map<string, string>();
    if (access.isPlatformAdmin) {
      const tenantIds = [...new Set(donations.map((d) => d.tenant_id))];
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabaseAdmin
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds);
        for (const t of (tenants ?? []) as { id: string; name: string }[])
          tenantNameById.set(t.id, t.name);
      }
    }

    const items: DonationReportItem[] = donations.map((d) => {
      const net = d.net_amount ?? 0;
      const gross = d.gross_amount ?? net;
      // Taxa de administração real cobrada do doador = tudo que veio além da doação
      // (inclui ADM G2 + adquirente + taxa fixa Pagar.me). O campo admin_fee guarda
      // apenas a parcela ADM G2 (3,52%), por isso não pode ser usado como "taxa total".
      const totalFee = Math.max(gross - net, 0);
      return {
        id: d.id,
        donorName: d.donor_name,
        donorDocument: d.donor_document,
        donorPhone: d.donor_phone,
        donorEmail: d.donor_email,
        paymentMethod: d.payment_method,
        installments: d.installments,
        cardBrand: d.card_brand,
        donationAmountCents: net,
        adminFeeCents: totalFee,
        tenantName: access.isPlatformAdmin ? (tenantNameById.get(d.tenant_id) ?? null) : null,
        createdAt: d.created_at,
      };
    });

    return { items, isPlatformAdmin: access.isPlatformAdmin };
  });

export type TenantOption = { id: string; name: string };

/** Lista de instituições para o filtro do super admin. */
export const getTenantOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const access = await resolveAccess(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!access.isPlatformAdmin) return { items: [] as TenantOption[], isPlatformAdmin: false };

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as TenantOption[], isPlatformAdmin: true };
  });
