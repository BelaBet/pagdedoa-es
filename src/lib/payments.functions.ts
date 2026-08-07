import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPlatformFeeRow } from "./fee-config.server";
import {
  buildSplitPayload,
  calculatePixAmounts,
  calculateCardAmounts,
  fetchSellerRecipientId,
  fetchCostCenter,
  type CardBrand,
  type SplitAmounts,
} from "./split.utils";
import { buildPagarmeCustomer, resolveCustomer, validateDocument } from "./payments-customer";

const OptionalCustomerSchema = {
  customerName: z.string().min(2).max(120).optional(),
  customerEmail: z.string().email().optional(),
  customerDocument: z.string().min(8).max(20).optional(),
  customerPhone: z.string().min(10).max(20).optional(),
};

function buildItems(amountCents: number) {
  return [
    {
      amount: amountCents,
      description: "Contribuição",
      quantity: 1,
      code: "CONTRIB",
    },
  ];
}

// donationAmount sempre em CENTAVOS (integer)
const DonationAmount = z.number().int().positive().max(100_000_000);

const PixInput = z.object({
  tenantId: z.string().uuid(),
  donationAmount: DonationAmount,
  costCenterId: z.string().uuid().optional().nullable(),
  ...OptionalCustomerSchema,
});

const CardInput = z.object({
  tenantId: z.string().uuid(),
  donationAmount: DonationAmount,
  installments: z.number().int().min(1).max(12).default(1),
  brand: z.enum(["master_visa", "ello_hiper_amex"]).default("master_visa"),
  costCenterId: z.string().uuid().optional().nullable(),
  card: z.object({
    number: z.string().min(13).max(19),
    holderName: z.string().min(2).max(120),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(2024).max(2100),
    cvv: z.string().min(3).max(4),
  }),
  billingAddress: z.object({
    line1: z.string().min(3).max(200),
    zipCode: z.string().min(8).max(9),
    city: z.string().min(2).max(80),
    state: z.string().length(2),
    country: z.string().length(2).default("BR"),
  }),
  ...OptionalCustomerSchema,
});
// Redacta campos sensíveis antes de gravar no banco (PCI / LGPD).
function redactRequest(body: any): any {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body));
  try {
    for (const p of clone.payments ?? []) {
      if (p?.credit_card?.card) {
        const c = p.credit_card.card;
        if (typeof c.number === "string") c.number = `****${c.number.slice(-4)}`;
        if (c.cvv) c.cvv = "***";
      }
    }
    if (clone.customer?.document) {
      const d = String(clone.customer.document);
      clone.customer.document = d.length > 4 ? `***${d.slice(-4)}` : "***";
    }
  } catch {}
  return clone;
}

const PAGARME_TIMEOUT_MS = 20_000;

async function pagarmeOrderCall(body: unknown): Promise<{
  ok: boolean;
  status: number;
  request: any;
  response: any;
  errorMessage: string | null;
}> {
  const secretKey = process.env.PAGARME_SECRET_KEY;
  if (!secretKey) {
    return {
      ok: false,
      status: 0,
      request: redactRequest(body),
      response: null,
      errorMessage: "PAGARME_SECRET_KEY não configurada",
    };
  }
  const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

  // Sem timeout aqui, uma instabilidade na API do Pagar.me deixava essa
  // chamada pendurada indefinidamente (até o limite da própria plataforma
  // de hospedagem), sem nenhuma resposta amigável pro doador. O fetch
  // também não estava protegido por try/catch — qualquer falha de rede
  // quebrava a função inteira em vez de retornar um erro tratável.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGARME_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://api.pagar.me/core/v5/orders`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      request: redactRequest(body),
      response: null,
      errorMessage: timedOut
        ? "Tempo esgotado ao conectar com o Pagar.me. Tente novamente."
        : `Falha de rede ao conectar com o Pagar.me: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    return {
      ok: false,
      status: res.status,
      request: redactRequest(body),
      response: { raw: raw.slice(0, 2000) },
      errorMessage: `Resposta inválida da Pagar.me: ${raw.slice(0, 200)}`,
    };
  }
  const ok = res.ok;
  const errorMessage = ok
    ? null
    : json?.message || (json?.errors && JSON.stringify(json.errors)) || `Erro ${res.status}`;
  return {
    ok,
    status: res.status,
    request: redactRequest(body),
    response: json,
    errorMessage,
  };
}

async function persistPayment(args: {
  tenantId: string;
  amounts: SplitAmounts;
  sellerRecipientId: string;
  method: "pix" | "credit_card" | "boleto";
  status: "pending" | "confirmed" | "failed";
  gatewayId: string;
  installments?: number;
  cardBrand?: CardBrand | null;
  costCenterId?: string | null;
  gatewayRequest?: any;
  gatewayResponse?: any;
  errorMessage?: string | null;
  donor?: {
    name?: string | null;
    email?: string | null;
    document?: string | null;
    phone?: string | null;
  };
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const platformRecipientId = process.env.PLATFORM_RECIPIENT_ID;
  const a = args.amounts;
  const donor = args.donor ?? {};
  const cleanDoc = donor.document ? donor.document.replace(/\D/g, "") : null;
  const cleanPhone = donor.phone ? donor.phone.replace(/\D/g, "") : null;

  const { data: payment, error: payErr } = await supabaseAdmin
    .from("payments")
    .insert({
      tenant_id: args.tenantId,
      amount: a.totalAmount / 100,
      method: args.method,
      status: args.status,
      gateway_id: args.gatewayId || `failed_${Date.now()}`,
      reference_type: "donation",
      donation_amount: a.donationAmount,
      platform_fee: a.platformFee,
      pagarme_fee: a.pagarmeFee,
      tk2_op_fee: a.g2OpFee,
      transacao_fee: a.transacaoFee,
      split_platform_amount: a.splitPlatformAmount,
      split_seller_amount: a.donationAmount,
      platform_recipient_id: platformRecipientId,
      seller_recipient_id: args.sellerRecipientId,
      card_brand: args.cardBrand ?? null,
      cost_center_id: args.costCenterId ?? null,
      gateway_request: args.gatewayRequest ?? null,
      gateway_response: args.gatewayResponse ?? null,
      error_message: args.errorMessage ?? null,
    } as any)
    .select("id")
    .single();
  if (payErr || !payment) throw new Error(payErr?.message ?? "Falha ao registrar pagamento");

  if (args.status !== "failed") {
    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .insert({
        tenant_id: args.tenantId,
        cost_center_id: args.costCenterId ?? null,
        amount: a.donationAmount / 100,
        payment_id: payment.id,
        donor_name: donor.name?.trim() ?? null,
        donor_email: donor.email?.trim() ?? null,
        donor_document: cleanDoc,
        donor_phone: cleanPhone,
        gross_amount: a.totalAmount,
        admin_fee: a.platformFee,
        net_amount: a.donationAmount,
        payment_method: args.method,
        installments: args.installments ?? 1,
        gateway_id: args.gatewayId,
        card_brand: args.cardBrand ?? null,
      } as any)
      .select("id")
      .single();
    if (donErr || !donation) throw new Error(donErr?.message ?? "Falha ao registrar doação");

    await supabaseAdmin.from("payments").update({ reference_id: donation.id }).eq("id", payment.id);

    return { paymentId: payment.id as string, donationId: donation.id as string };
  }

  return { paymentId: payment.id as string, donationId: "" };
}

export const createPixPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PixInput.parse(data))
  .handler(async ({ data }) => {
    const { assertFinancialActive } = await import("@/lib/compliance");
    await assertFinancialActive(data.tenantId);
    const sellerRecipientId = await fetchSellerRecipientId(data.tenantId);
    const costCenter = data.costCenterId
      ? await fetchCostCenter(data.costCenterId, data.tenantId)
      : null;
    const splitOverride = costCenter?.split_platform_percent ?? null;
    const feeRow = await getPlatformFeeRow("pix", data.tenantId);
    const amounts = calculatePixAmounts(data.donationAmount, splitOverride, feeRow ?? undefined);
    if (process.env.NODE_ENV !== "production") {
      console.log("[pix] amounts", amounts, {
        sellerRecipientId,
        costCenterId: data.costCenterId,
        splitOverride,
      });
    }
    const expiresIn = 60 * 60;

    const resolved = await resolveCustomer(data);
    if (!resolved.document) throw new Error("CPF ou CNPJ é obrigatório");
    if (!validateDocument(resolved.document)) throw new Error("CPF ou CNPJ inválido");
    if (!resolved.phone || resolved.phone.length < 10) {
      throw new Error("Celular é obrigatório");
    }
    const customer = buildPagarmeCustomer(resolved);

    const requestBody = {
      items: buildItems(amounts.totalAmount),
      customer,
      payments: [
        {
          payment_method: "pix",
          pix: {
            expires_in: expiresIn,
            additional_information: [{ name: "Contribuição", value: resolved.name ?? "Anônimo" }],
          },
          split: buildSplitPayload(amounts, sellerRecipientId),
        },
      ],
      metadata: {
        tenant_id: data.tenantId,
        cost_center_id: data.costCenterId ?? null,
        gross_amount: amounts.totalAmount,
        admin_fee: amounts.platformFee,
        net_amount: amounts.donationAmount,
        installments: 1,
      },
    };

    const call = await pagarmeOrderCall(requestBody);

    if (!call.ok) {
      await persistPayment({
        tenantId: data.tenantId,
        amounts,
        sellerRecipientId,
        method: "pix",
        status: "failed",
        gatewayId: "",
        costCenterId: data.costCenterId ?? null,
        gatewayRequest: call.request,
        gatewayResponse: call.response,
        errorMessage: call.errorMessage,
      });
      throw new Error(call.errorMessage ?? "Falha ao criar PIX");
    }

    const json = call.response;
    const charge = json?.charges?.[0];
    const tx = charge?.last_transaction;
    const qrCode: string = tx?.qr_code ?? "";
    const qrCodeUrl: string = tx?.qr_code_url ?? "";
    const expiresAt: string =
      tx?.expires_at ?? new Date(Date.now() + expiresIn * 1000).toISOString();
    const gatewayId: string = json?.id ?? charge?.id ?? "";

    if (!gatewayId) {
      await persistPayment({
        tenantId: data.tenantId,
        amounts,
        sellerRecipientId,
        method: "pix",
        status: "failed",
        gatewayId: "",
        costCenterId: data.costCenterId ?? null,
        gatewayRequest: call.request,
        gatewayResponse: call.response,
        errorMessage: `Pagar.me não retornou identificador. Status: ${json?.status ?? "?"}`,
      });
      throw new Error(
        `Pagar.me não retornou identificador do pedido. Status: ${json?.status ?? "?"}.`,
      );
    }

    const ids = await persistPayment({
      tenantId: data.tenantId,
      amounts,
      sellerRecipientId,
      method: "pix",
      status: "pending",
      gatewayId,
      costCenterId: data.costCenterId ?? null,
      gatewayRequest: call.request,
      gatewayResponse: call.response,
      errorMessage: null,
      donor: {
        name: resolved.name ?? null,
        email: resolved.email ?? null,
        document: resolved.document ?? null,
        phone: resolved.phone ?? null,
      },
    });

    return {
      ...ids,
      qrCode,
      qrCodeUrl,
      expiresAt,
      gatewayId,
      donationAmount: amounts.donationAmount,
      platformFee: amounts.platformFee,
      totalAmount: amounts.totalAmount,
      pending: !qrCode,
    };
  });

const PollInput = z.object({
  gatewayId: z.string().min(3).max(64),
});

export const pollPixCharge = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PollInput.parse(data))
  .handler(async ({ data }) => {
    const secretKey = process.env.PAGARME_SECRET_KEY;
    if (!secretKey) throw new Error("PAGARME_SECRET_KEY não configurada");
    const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

    // Essa função é chamada em loop (polling) enquanto o doador espera a
    // confirmação do Pix — sem timeout, uma instabilidade do Pagar.me
    // travava cada tentativa até o limite da plataforma, tornando o polling
    // inteiro muito mais lento (ou parecendo travado) do ponto de vista do
    // doador.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGARME_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `https://api.pagar.me/core/v5/orders/${encodeURIComponent(data.gatewayId)}`,
        {
          method: "GET",
          headers: { Authorization: auth },
          signal: controller.signal,
        },
      );
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "AbortError";
      throw new Error(
        timedOut
          ? "Tempo esgotado ao consultar o status do Pix no Pagar.me."
          : `Falha de rede ao consultar o Pagar.me: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    const raw = await res.text();
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Resposta inválida da Pagar.me: ${raw.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(json?.message || `Erro ${res.status} ao consultar pedido`);
    }

    const charge = json?.charges?.[0];
    const tx = charge?.last_transaction;
    const qrCode: string = tx?.qr_code ?? "";
    const qrCodeUrl: string = tx?.qr_code_url ?? "";
    const expiresAt: string = tx?.expires_at ?? "";
    const orderStatus: string = json?.status ?? "";
    const chargeStatus: string = charge?.status ?? "";

    // Mesmo problema do webhook: o enum public.payment_status não tem
    // 'paid', só 'confirmed'. Gravar 'paid' fazia essa atualização falhar
    // silenciosamente no banco, deixando o pagamento preso em 'pending'
    // mesmo já confirmado no Pagar.me.
    const mapped: "confirmed" | "failed" | null =
      chargeStatus === "paid"
        ? "confirmed"
        : chargeStatus === "failed" || chargeStatus === "refused"
          ? "failed"
          : null;

    if (mapped) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("payments")
        .update({ status: mapped })
        .eq("gateway_id", data.gatewayId);
    }

    return { qrCode, qrCodeUrl, expiresAt, orderStatus, chargeStatus };
  });

export const createCreditCardPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CardInput.parse(data))
  .handler(async ({ data }) => {
    const { assertFinancialActive } = await import("@/lib/compliance");
    await assertFinancialActive(data.tenantId);
    const sellerRecipientId = await fetchSellerRecipientId(data.tenantId);
    const costCenter = data.costCenterId
      ? await fetchCostCenter(data.costCenterId, data.tenantId)
      : null;
    if (costCenter) {
      if (!costCenter.allows_installments && data.installments > 1) {
        throw new Error("Este centro de custo não permite parcelamento.");
      }
      if (data.installments > costCenter.max_installments) {
        throw new Error(`Este centro permite no máximo ${costCenter.max_installments}x.`);
      }
    }
    const splitOverride = costCenter?.split_platform_percent ?? null;
    const feeRow = await getPlatformFeeRow(
      data.brand === "master_visa" ? "cartao_master_visa" : "cartao_ello_hiper_amex",
      data.tenantId,
    );
    const amounts = calculateCardAmounts(
      data.donationAmount,
      data.installments,
      data.brand,
      splitOverride,
      feeRow ?? undefined,
    );
    if (process.env.NODE_ENV !== "production") {
      console.log("[card] amounts", amounts, {
        sellerRecipientId,
        installments: data.installments,
        brand: data.brand,
        costCenterId: data.costCenterId,
        splitOverride,
      });
    }

    const resolved = await resolveCustomer(data);
    if (!resolved.name) throw new Error("Nome do titular é obrigatório");
    if (!resolved.email) throw new Error("E-mail é obrigatório");
    if (!resolved.document) throw new Error("CPF ou CNPJ é obrigatório");
    if (!validateDocument(resolved.document)) throw new Error("CPF ou CNPJ inválido");
    if (!data.billingAddress) throw new Error("Endereço de cobrança é obrigatório");
    const customer = buildPagarmeCustomer(resolved);

    const requestBody = {
      items: buildItems(amounts.totalAmount),
      customer,
      payments: [
        {
          payment_method: "credit_card",
          credit_card: {
            installments: data.installments,
            statement_descriptor: "CONTRIB",
            capture: true,
            card: {
              number: data.card.number.replace(/\s/g, ""),
              holder_name: data.card.holderName,
              exp_month: data.card.expMonth,
              exp_year: data.card.expYear,
              cvv: data.card.cvv,
              billing_address: {
                line_1: data.billingAddress.line1,
                zip_code: data.billingAddress.zipCode.replace(/\D/g, ""),
                city: data.billingAddress.city,
                state: data.billingAddress.state.toUpperCase(),
                country: data.billingAddress.country.toUpperCase(),
              },
            },
          },
          split: buildSplitPayload(amounts, sellerRecipientId),
        },
      ],
      metadata: {
        tenant_id: data.tenantId,
        cost_center_id: data.costCenterId ?? null,
        gross_amount: amounts.totalAmount,
        admin_fee: amounts.platformFee,
        net_amount: amounts.donationAmount,
        installments: data.installments ?? 1,
      },
    };

    const call = await pagarmeOrderCall(requestBody);

    if (!call.ok) {
      await persistPayment({
        tenantId: data.tenantId,
        amounts,
        sellerRecipientId,
        method: "credit_card",
        cardBrand: data.brand,
        costCenterId: data.costCenterId ?? null,
        status: "failed",
        gatewayId: "",
        gatewayRequest: call.request,
        gatewayResponse: call.response,
        errorMessage: call.errorMessage,
      });
      throw new Error(call.errorMessage ?? "Falha ao processar cartão");
    }

    const json = call.response;
    const charge = json?.charges?.[0];
    const status: string = charge?.status ?? "pending";
    const gatewayId: string = json?.id ?? charge?.id ?? "";

    const mapped: "pending" | "confirmed" | "failed" =
      status === "paid"
        ? "confirmed"
        : status === "failed" || status === "refused"
          ? "failed"
          : "pending";

    const ids = await persistPayment({
      tenantId: data.tenantId,
      amounts,
      sellerRecipientId,
      method: "credit_card",
      cardBrand: data.brand,
      costCenterId: data.costCenterId ?? null,
      installments: data.installments ?? 1,
      status: mapped,
      gatewayId,
      gatewayRequest: call.request,
      gatewayResponse: call.response,
      errorMessage:
        mapped === "failed" ? (charge?.last_transaction?.acquirer_message ?? null) : null,
      donor: {
        name: resolved.name ?? null,
        email: resolved.email ?? null,
        document: resolved.document ?? null,
        phone: resolved.phone ?? null,
      },
    });

    return {
      ...ids,
      status: mapped,
      gatewayId,
      donationAmount: amounts.donationAmount,
      platformFee: amounts.platformFee,
      totalAmount: amounts.totalAmount,
      acquirerMessage: charge?.last_transaction?.acquirer_message ?? null,
    };
  });
