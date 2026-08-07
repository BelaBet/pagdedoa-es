import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const Input = z.object({
  tenant_slug: z.string().min(1).max(120),
  cost_center_id: z.string().uuid(),
  amount: z.number().int().positive().max(100_000_000), // centavos
  donor_name: z.string().min(2).max(120),
  donor_document: z.string().min(8).max(20),
  donor_phone: z.string().min(10).max(20),
  donor_email: z.string().email(),
  payment_method: z.enum([
    "pix",
    "credit_master_visa",
    "credit_ello_hiper_amex",
    "boleto",
    "installment_2x",
  ]),
  installments: z.union([z.literal(1), z.literal(2)]).default(1),
});

type Input = z.infer<typeof Input>;

interface FeeRule {
  payment_method: string;
  acquirer_fee_percent: number | null;
  adm_fee_percent: number | null;
  g2_op_fixed: number | null;
  g2_op_percent: number | null;
  transaction_fixed: number | null;
  anticipation_percent: number | null;
  who_pays: string;
  is_active: boolean | null;
}

function pickRuleKey(method: Input["payment_method"], installments: number) {
  if (method.startsWith("credit_") && installments === 2) return "installment_2x";
  return method;
}

function computeFees(rule: FeeRule, amountCents: number) {
  const pct =
    (Number(rule.adm_fee_percent ?? 0) +
      Number(rule.g2_op_percent ?? 0) +
      Number(rule.acquirer_fee_percent ?? 0)) /
    100;
  const fixed =
    Math.round(Number(rule.g2_op_fixed ?? 0) * 100) +
    Math.round(Number(rule.transaction_fixed ?? 0) * 100);
  const donorPays = rule.who_pays === "donor";

  if (donorPays) {
    // GROSS-UP: quando o doador absorve a taxa, o percentual incide sobre o
    // valor TOTAL cobrado (gross) — que já inclui a própria taxa — e não
    // sobre a doação base. É isso que a adquirente/Pagar.me de fato cobra
    // em cima da transação. Como gross = amountCents + (pct*gross + fixed),
    // resolvendo: gross = (amountCents + fixed) / (1 - pct).
    // Calcular "pct * amountCents" (a doação base) em vez de "pct * gross"
    // subestima a taxa sempre que pct > 0 — era exatamente esse o bug.
    const grossRaw = (amountCents + fixed) / (1 - pct);
    const grossAmount = Math.round(grossRaw);
    const adminFee = grossAmount - amountCents;
    const netAmount = amountCents;
    return { adminFee, grossAmount, netAmount };
  }

  // Instituição absorve a taxa: amountCents já É o valor total cobrado do
  // doador (não precisa de gross-up), a taxa percentual incide sobre ele
  // normalmente e é descontada do repasse para a igreja.
  const variable = Math.round(amountCents * pct);
  const adminFee = variable + fixed;
  const grossAmount = amountCents;
  const netAmount = amountCents - adminFee;
  return { adminFee, grossAmount, netAmount };
}

function digits(s: string) {
  return s.replace(/\D+/g, "");
}

function buildCustomer(input: Input) {
  const doc = digits(input.donor_document);
  const docType = doc.length === 11 ? "individual" : "company";
  const ph = digits(input.donor_phone);
  const ddd = ph.length >= 10 ? ph.slice(ph.length - 11, ph.length - 9) : ph.slice(0, 2);
  const number = ph.length >= 10 ? ph.slice(ph.length - 9) : ph.slice(2);
  return {
    name: input.donor_name,
    email: input.donor_email,
    document: doc,
    type: docType,
    phones: {
      mobile_phone: { country_code: "55", area_code: ddd, number },
    },
  };
}

async function callPagarme(body: unknown) {
  const key = process.env.PAGARME_SECRET_KEY;
  if (!key) throw new Error("PAGARME_SECRET_KEY não configurada");
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const res = await fetch("https://api.pagar.me/core/v5/orders", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, body: parsed, raw: text };
}

export const Route = createFileRoute("/api/public/create-donation")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        let payload: Input;
        try {
          const raw = await request.json();
          payload = Input.parse(raw);
        } catch (e: any) {
          return json({ error: "Payload inválido", detail: e?.message ?? String(e) }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Tenant
        const { data: tenant, error: tErr } = await supabaseAdmin
          .from("tenants")
          .select("id, slug, active, name, financial_active, compliance_status")
          .eq("slug", payload.tenant_slug)
          .maybeSingle();
        if (tErr) return json({ error: "Erro ao buscar igreja" }, 500);
        if (!tenant) return json({ error: "Igreja não encontrada" }, 404);
        if (!tenant.active) return json({ error: "Igreja inativa" }, 403);
        if (!(tenant as { financial_active?: boolean }).financial_active) {
          return json({ error: "Recebimentos indisponíveis: cadastro da igreja pendente." }, 403);
        }

        // 2. Cost center
        const { data: cc, error: ccErr } = await supabaseAdmin
          .from("cost_centers")
          .select(
            "id, tenant_id, is_active, allows_installments, max_installments, name, split_seller_percent",
          )
          .eq("id", payload.cost_center_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle();
        if (ccErr) return json({ error: "Erro ao buscar centro de custo" }, 500);
        if (!cc) return json({ error: "Centro de custo não encontrado" }, 404);
        if (!cc.is_active) return json({ error: "Centro de custo inativo" }, 403);
        if (payload.installments === 2 && !cc.allows_installments) {
          return json({ error: "Parcelamento não permitido para este centro" }, 422);
        }
        if (payload.installments > (cc.max_installments ?? 1)) {
          return json({ error: "Quantidade de parcelas acima do permitido" }, 422);
        }

        // 3. Recipient
        const { data: tfc, error: tfcErr } = await supabaseAdmin
          .from("tenant_financial_config")
          .select("pagarme_recipient_id, use_pagarme, split_platform_percent")
          .eq("tenant_id", tenant.id)
          .maybeSingle();
        if (tfcErr) return json({ error: "Erro ao buscar dados de pagamento" }, 500);
        const sellerRecipientId = tfc?.pagarme_recipient_id;
        if (!sellerRecipientId || !tfc?.use_pagarme) {
          return json({ error: "Igreja não habilitada para receber pagamentos" }, 412);
        }
        const platformRecipientId = process.env.PLATFORM_RECIPIENT_ID;
        if (!platformRecipientId) {
          return json({ error: "Plataforma não configurada" }, 500);
        }

        // 4. Fee rules
        const ruleKey = pickRuleKey(payload.payment_method, payload.installments);
        const { data: rules } = await supabaseAdmin
          .from("fee_rules")
          .select(
            "payment_method, acquirer_fee_percent, adm_fee_percent, g2_op_fixed, g2_op_percent, transaction_fixed, anticipation_percent, who_pays, is_active, tenant_id",
          )
          .eq("payment_method", ruleKey)
          .eq("is_active", true)
          .in("tenant_id", [tenant.id]);
        const rule = (rules?.[0] as FeeRule | undefined) ?? null;
        if (!rule) {
          return json({ error: `Sem regra de taxa para ${ruleKey}` }, 412);
        }

        const { adminFee, grossAmount, netAmount } = computeFees(rule, payload.amount);

        // 5. Build Pagar.me order
        const metadata = {
          tenant_id: tenant.id,
          cost_center_id: cc.id,
          gross_amount: grossAmount,
          admin_fee: adminFee,
          net_amount: netAmount,
        };

        const split = [
          {
            amount: netAmount,
            recipient_id: sellerRecipientId,
            type: "flat",
            options: {
              liable: false,
              charge_processing_fee: false,
            },
          },
          {
            amount: grossAmount - netAmount,
            recipient_id: platformRecipientId,
            type: "flat",
            options: {
              liable: true,
              charge_processing_fee: true,
            },
          },
        ].filter((s) => s.amount > 0);

        const items = [
          {
            amount: grossAmount,
            description: `Doação - ${cc.name}`,
            quantity: 1,
            code: "DOACAO",
          },
        ];

        let paymentBlock: any;
        if (payload.payment_method === "pix") {
          paymentBlock = {
            payment_method: "pix",
            pix: { expires_in: 3600 },
            split,
          };
        } else if (payload.payment_method === "boleto") {
          paymentBlock = {
            payment_method: "boleto",
            boleto: {
              instructions: "Pagar até o vencimento",
              due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
            },
            split,
          };
        } else {
          // credit_card flows não são suportados via link público sem dados do cartão
          return json(
            {
              error:
                "Este endpoint público suporta apenas pix e boleto. Use o checkout para cartão.",
            },
            422,
          );
        }

        const orderBody = {
          items,
          customer: buildCustomer(payload),
          payments: [paymentBlock],
          metadata,
        };

        const call = await callPagarme(orderBody);
        if (!call.ok) {
          return json(
            {
              error: "Falha ao criar transação na Pagar.me",
              status: call.status,
              detail:
                call.body?.message ||
                (call.body?.errors && JSON.stringify(call.body.errors)) ||
                call.raw?.slice(0, 500),
            },
            502,
          );
        }

        const order = call.body;
        const charge = order?.charges?.[0];
        const tx = charge?.last_transaction;

        const response: Record<string, unknown> = {
          gateway_id: order?.id ?? charge?.id ?? null,
          status: order?.status ?? charge?.status ?? null,
          payment_method: payload.payment_method,
          metadata,
        };

        if (payload.payment_method === "pix") {
          response.pix = {
            qr_code: tx?.qr_code ?? null,
            qr_code_url: tx?.qr_code_url ?? null,
            expires_at: tx?.expires_at ?? null,
          };
        } else if (payload.payment_method === "boleto") {
          response.boleto = {
            url: tx?.url ?? tx?.pdf ?? null,
            barcode: tx?.barcode ?? null,
            line: tx?.line ?? null,
            due_at: tx?.due_at ?? null,
          };
        }

        return json(response, 200);
      },
    },
  },
});
