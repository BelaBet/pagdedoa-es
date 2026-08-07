import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildSplitPayload, calculateBoletoAmounts, fetchSellerRecipientId, fetchCostCenter } from "./split.utils";
import { getPlatformFeeRow } from "./fee-config.server";
import { buildPagarmeCustomer, resolveCustomer, validateDocument } from "./payments-customer";

const InputSchema = z.object({
  tenantId: z.string().uuid(),
  donationAmount: z.number().int().positive().max(100_000_000),
  costCenterId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(120).optional(),
  customerEmail: z.string().email().optional(),
  customerDocument: z.string().min(8).max(20).optional(),
  customerPhone: z.string().min(10).max(20).optional(),
  // Endereço do pagador (preenchido no modal)
  customerAddressLine1: z.string().min(3).max(200),
  customerAddressZip: z.string().length(8),
  customerAddressCity: z.string().min(2).max(80),
  customerAddressState: z.string().length(2),
  customerAddressNeighborhood: z.string().max(100).optional(),
});

function addBusinessDays(date: Date, days: number) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export const createBoletoPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertFinancialActive } = await import("@/lib/compliance");
    await assertFinancialActive(data.tenantId);

    const secretKey = process.env.PAGARME_SECRET_KEY;
    if (!secretKey) throw new Error("PAGARME_SECRET_KEY não configurada");

    const sellerRecipientId = await fetchSellerRecipientId(data.tenantId);
    const costCenter = data.costCenterId ? await fetchCostCenter(data.costCenterId, data.tenantId) : null;
    const splitOverride = costCenter?.split_platform_percent ?? null;
    const feeRow = await getPlatformFeeRow("boleto", data.tenantId);
    const amounts = calculateBoletoAmounts(data.donationAmount, splitOverride, feeRow ?? undefined);
    if (process.env.NODE_ENV !== "production") {
      console.log("[boleto] amounts", amounts, { sellerRecipientId, costCenterId: data.costCenterId, splitOverride });
    }
    const platformRecipientId = process.env.PLATFORM_RECIPIENT_ID;
    const dueAt = addBusinessDays(new Date(), 3).toISOString();

    const resolved = await resolveCustomer(data);
    if (!resolved.name) throw new Error("Nome é obrigatório para boleto");
    if (!resolved.email) throw new Error("E-mail é obrigatório para boleto");
    if (!resolved.document) throw new Error("CPF ou CNPJ é obrigatório para boleto");
    if (!validateDocument(resolved.document)) throw new Error("CPF ou CNPJ inválido");

    const customer = {
      ...buildPagarmeCustomer(resolved),
      address: {
        line_1: data.customerAddressLine1.trim(),
        zip_code: data.customerAddressZip.replace(/\D/g, ""),
        city: data.customerAddressCity.trim(),
        state: data.customerAddressState.trim().toUpperCase(),
        country: "BR",
      },
    };

    const orderPayload = {
      items: [
        {
          amount: amounts.totalAmount,
          description: "Contribuição",
          quantity: 1,
          code: "CONTRIB",
        },
      ],
      customer,
      payments: [
        {
          payment_method: "boleto",
          boleto: {
            due_at: dueAt,
            instructions: "Obrigado pela sua contribuição!",
            document_number: `C${Date.now().toString(36).toUpperCase()}`.slice(0, 16),
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

    const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

    // Mesmo timeout aplicado nas chamadas de Pix/Cartão (payments.functions.ts)
    // — sem isso, uma instabilidade do Pagar.me deixava essa chamada
    // pendurada indefinidamente sem resposta amigável pro doador.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch("https://api.pagar.me/core/v5/orders", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
        signal: controller.signal,
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "AbortError";
      throw new Error(
        timedOut
          ? "Tempo esgotado ao conectar com o Pagar.me. Tente novamente."
          : `Falha de rede ao conectar com o Pagar.me: ${e instanceof Error ? e.message : String(e)}`,
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
      console.error("[boleto] pagar.me rejected", {
        status: res.status,
        errors: json?.errors,
        message: json?.message,
        sentPayload: orderPayload,
      });
      const msg =
        json?.message ||
        (json?.errors && JSON.stringify(json.errors)) ||
        `Erro ${res.status} ao criar boleto`;
      throw new Error(msg);
    }

    const charge = json?.charges?.[0];
    const tx = charge?.last_transaction;
    const line: string = tx?.line ?? "";
    const barcode: string = tx?.barcode ?? "";
    const pdfUrl: string = tx?.pdf ?? tx?.url ?? "";
    const gatewayId: string = json?.id ?? charge?.id ?? "";

    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .insert({
        tenant_id: data.tenantId,
        amount: amounts.totalAmount / 100,
        method: "boleto",
        status: "pending",
        gateway_id: gatewayId,
        reference_type: "donation",
        donation_amount: amounts.donationAmount,
        platform_fee: amounts.platformFee,
        pagarme_fee: amounts.pagarmeFee,
        tk2_op_fee: amounts.tk2OpFee,
        transacao_fee: amounts.transacaoFee,
        split_platform_amount: amounts.splitPlatformAmount,
        split_seller_amount: amounts.donationAmount,
        platform_recipient_id: platformRecipientId,
        seller_recipient_id: sellerRecipientId,
        cost_center_id: data.costCenterId ?? null,
      } as any)
      .select("id")
      .single();

    if (payErr || !payment) {
      throw new Error(payErr?.message ?? "Falha ao registrar pagamento");
    }

    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .insert({
        tenant_id: data.tenantId,
        cost_center_id: data.costCenterId ?? null,
        amount: amounts.donationAmount / 100,
        payment_id: payment.id,
        donor_name: resolved.name?.trim() ?? null,
        donor_email: resolved.email?.trim() ?? null,
        donor_document: resolved.document ? resolved.document.replace(/\D/g, "") : null,
        donor_phone: resolved.phone ? resolved.phone.replace(/\D/g, "") : null,
        gross_amount: amounts.totalAmount,
        admin_fee: amounts.platformFee,
        net_amount: amounts.donationAmount,
        payment_method: "boleto",
        installments: 1,
        gateway_id: gatewayId,
      } as any)
      .select("id")
      .single();

    if (donErr || !donation) {
      throw new Error(donErr?.message ?? "Falha ao registrar doação");
    }

    await supabaseAdmin
      .from("payments")
      .update({ reference_id: donation.id })
      .eq("id", payment.id);

    return {
      paymentId: payment.id as string,
      donationId: donation.id as string,
      line,
      barcode,
      pdfUrl,
      dueAt,
      gatewayId,
      donationAmount: amounts.donationAmount,
      platformFee: amounts.platformFee,
      totalAmount: amounts.totalAmount,
    };
  });
