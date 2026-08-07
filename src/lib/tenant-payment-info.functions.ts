import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PAGARME_BASE = "https://api.pagar.me/core/v5";

function authHeader() {
  const key = process.env.PAGARME_SECRET_KEY;
  if (!key) throw new Error("PAGARME_SECRET_KEY não configurado");
  const token =
    typeof btoa === "function" ? btoa(`${key}:`) : Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

export type PublicPaymentInfo = {
  tenantId: string;
  tenantName: string;
  slug: string;
  pixKey: string | null;
  recipient: {
    legalName: string | null;
    tradingName: string | null;
    document: string | null;
    documentType: "cnpj" | "cpf" | null;
    email: string | null;
    phone: string | null;
    address: {
      street: string | null;
      number: string | null;
      complement: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
    } | null;
    bankAccount: {
      bank: string | null;
      branch: string | null;
      account: string | null;
      accountDigit: string | null;
      holderName: string | null;
      type: string | null;
    } | null;
  } | null;
};

function formatDoc(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

function formatZip(z: string | null | undefined): string | null {
  if (!z) return null;
  const d = z.replace(/\D/g, "");
  if (d.length === 8) return d.replace(/^(\d{5})(\d{3})$/, "$1-$2");
  return z;
}

const BANK_NAMES: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "104": "Caixa Econômica Federal",
  "237": "Bradesco",
  "260": "Nubank",
  "341": "Itaú",
  "356": "Banco Real",
  "422": "Banco Safra",
  "748": "Sicredi",
  "756": "Sicoob",
};

// TTL do cache server-side por tenant. Ajustável via env.
const CACHE_TTL_MS = Number(process.env.PAYMENT_INFO_CACHE_TTL_MS ?? 60 * 60 * 1000); // 1h padrão

async function fetchRecipientFromPagarme(
  recipientId: string,
): Promise<PublicPaymentInfo["recipient"]> {
  const res = await fetch(`${PAGARME_BASE}/recipients/${recipientId}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    console.error("[payment-info] Pagar.me error", res.status, await res.text());
    return null;
  }
  const r = (await res.json()) as any;
  const reg = r.register_information ?? {};
  const addr = reg.main_address ?? null;
  const phone = reg.phone_numbers?.[0] ?? null;
  const ba = r.default_bank_account ?? null;
  const bankCode = ba?.bank ?? null;
  const bankName = bankCode ? `${bankCode} – ${BANK_NAMES[bankCode] ?? "Banco"}` : null;
  const rawDoc = (reg.document ?? r.document ?? "").replace(/\D/g, "");
  return {
    legalName: reg.company_name ?? r.name ?? null,
    tradingName: reg.trading_name ?? null,
    document: formatDoc(reg.document ?? r.document),
    documentType: rawDoc.length === 14 ? "cnpj" : rawDoc.length === 11 ? "cpf" : null,
    email: reg.email ?? r.email ?? null,
    phone: phone ? `(${phone.ddd}) ${phone.number}` : null,
    address: addr
      ? {
          street: addr.street ?? null,
          number: addr.street_number ?? null,
          complement: addr.complementary ?? null,
          neighborhood: addr.neighborhood ?? null,
          city: addr.city ?? null,
          state: addr.state ?? null,
          zipCode: formatZip(addr.zip_code),
        }
      : null,
    bankAccount: ba
      ? {
          bank: bankName,
          branch: ba.branch_number ?? null,
          account: ba.account_number ?? null,
          accountDigit: ba.account_check_digit ?? null,
          holderName: ba.holder_name ?? null,
          type: ba.type ?? null,
        }
      : null,
  };
}

export const getPublicPaymentInfo = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; forceRefresh?: boolean }) =>
    z.object({ slug: z.string().min(1).max(80), forceRefresh: z.boolean().optional() }).parse(d),
  )
  .handler(
    async ({ data }): Promise<PublicPaymentInfo & { cached: boolean; fetchedAt: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: tenant, error: tErr } = await supabaseAdmin
        .from("tenants")
        .select("id,name,slug,active")
        .eq("slug", data.slug)
        .eq("active", true)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!tenant) throw new Error("Instituição não encontrada");

      // 1) Tenta servir do cache server-side
      if (!data.forceRefresh) {
        const { data: cached } = await supabaseAdmin
          .from("tenant_payment_info_cache" as any)
          .select("payload, fetched_at")
          .eq("tenant_id", tenant.id)
          .maybeSingle();
        const row = cached as { payload: PublicPaymentInfo; fetched_at: string } | null;
        if (row) {
          const age = Date.now() - new Date(row.fetched_at).getTime();
          if (age < CACHE_TTL_MS) {
            return { ...row.payload, cached: true, fetchedAt: row.fetched_at };
          }
        }
      }

      // 2) Cache MISS ou expirado → busca dados frescos
      const { data: tps } = await supabaseAdmin
        .from("tenant_payment_settings")
        .select("pix_key, pagarme_recipient_id")
        .eq("tenant_id", tenant.id)
        .maybeSingle();
      const recipientId = (tps as { pagarme_recipient_id?: string | null } | null)
        ?.pagarme_recipient_id;

      let recipient: PublicPaymentInfo["recipient"] = null;
      if (recipientId) {
        try {
          recipient = await fetchRecipientFromPagarme(recipientId);
        } catch (err) {
          console.error("[payment-info] fetch failed", err);
        }
      }

      const payload: PublicPaymentInfo = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        slug: tenant.slug,
        pixKey: (tps as { pix_key?: string | null } | null)?.pix_key ?? null,
        recipient,
      };

      // 3) Só grava no cache se conseguimos buscar o recipient (ou se não há recipient configurado).
      //    Evita "envenenar" o cache com falha temporária da Pagar.me.
      if (!recipientId || recipient !== null) {
        const fetchedAt = new Date().toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("tenant_payment_info_cache" as any)
          .upsert({ tenant_id: tenant.id, payload: payload as any, fetched_at: fetchedAt });
        if (upErr) console.error("[payment-info] cache upsert failed", upErr);
        return { ...payload, cached: false, fetchedAt };
      }

      // 4) Pagar.me falhou e cache estava expirado → devolve dados crus sem persistir
      return { ...payload, cached: false, fetchedAt: new Date().toISOString() };
    },
  );

/** Invalida o cache de payment-info de um tenant. Use após editar recipient na Pagar.me. */
export const invalidatePaymentInfoCache = createServerFn({ method: "POST" })
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenant_payment_info_cache" as any)
      .delete()
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
