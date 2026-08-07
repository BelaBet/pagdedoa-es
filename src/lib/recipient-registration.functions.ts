import { BRAND } from "@/lib/brand";
// Server functions para o painel SuperAdmin gerenciar recebedores Pagar.me dos tenants.
// Apenas usuários com platform_role = 'super_admin' podem executar estas funções.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGARME_BASE = "https://api.pagar.me/core/v5";

function authHeader(): string {
  const key = process.env.PAGARME_SECRET_KEY;
  if (!key) throw new Error("PAGARME_SECRET_KEY não configurado");
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

const BankingSchema = z.object({
  tenantId: z.string().uuid(),
  bankCode: z.string().regex(/^\d{3}$/, "Código do banco deve ter 3 dígitos"),
  bankAgency: z.string().min(1).max(10),
  bankAccount: z.string().min(1).max(20),
  bankAccountDv: z.string().min(1).max(2),
  accountType: z.enum(["checking", "savings"]),
  legalName: z.string().min(3).max(255),
  holderName: z.string().min(3).max(255),
  holderDocument: z.string().min(11).max(14),
});

export type RecipientStatus =
  "not_configured" | "registration" | "affiliation" | "active" | "refused" | "error";

export type TenantRecipientRow = {
  id: string;
  name: string;
  document: string | null;
  document_type: string | null;
  recipient_id: string | null;
  recipient_status: RecipientStatus | null;
  recipient_error: string | null;
  bank_code: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_dv: string | null;
  account_type: string | null;
  legal_name: string | null;
  holder_name: string | null;
  holder_document: string | null;
  active: boolean;
  created_at: string;
};

// ── Criar recebedor na Pagar.me ───────────────────────────────────────────
export const registerTenantRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof BankingSchema>) => BankingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, name, document, document_type, recipient_id")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (tErr) throw new Error(`Tenant não encontrado: ${tErr.message}`);
    if (!tenant) throw new Error("Tenant não encontrado");

    const t = tenant as {
      id: string;
      name: string;
      document: string | null;
      document_type: string | null;
      recipient_id: string | null;
    };

    if (t.recipient_id) {
      return {
        recipientId: t.recipient_id,
        alreadyExists: true,
        message: "Recebedor já configurado",
      };
    }

    const documentClean = data.holderDocument.replace(/\D/g, "");
    const tenantDoc = (t.document ?? "").replace(/\D/g, "") || documentClean;
    const docType: "individual" | "company" = tenantDoc.length === 11 ? "individual" : "company";
    const holderType: "individual" | "company" =
      documentClean.length === 11 ? "individual" : "company";

    const payload = {
      name: data.legalName,
      email: `tenant-${data.tenantId}@${BRAND.pagarme.recipientEmailDomain}`,
      description: `Tenant: ${t.name}`,
      type: docType,
      document: tenantDoc,
      default_bank_account: {
        holder_name: data.holderName,
        holder_type: holderType,
        holder_document: documentClean,
        bank: data.bankCode,
        branch_number: data.bankAgency,
        account_number: data.bankAccount,
        account_check_digit: data.bankAccountDv,
        type: data.accountType,
      },
      transfer_settings: {
        transfer_enabled: true,
        transfer_interval: "weekly",
        transfer_day: 1,
      },
    };

    let result: { id?: string; status?: string };
    try {
      result = await pagarme<{ id: string; status: string }>("/recipients", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("tenants")
        .update({ recipient_status: "error", recipient_error: msg })
        .eq("id", data.tenantId);
      throw new Error(msg);
    }

    await supabaseAdmin
      .from("tenants")
      .update({
        recipient_id: result.id ?? null,
        recipient_status: result.status ?? "registration",
        recipient_error: null,
        legal_name: data.legalName,
      })
      .eq("id", data.tenantId);

    await supabaseAdmin.from("tenant_bank_account").upsert(
      {
        tenant_id: data.tenantId,
        bank_code: data.bankCode,
        branch: data.bankAgency,
        account: data.bankAccount,
        account_digit: data.bankAccountDv,
        account_type: data.accountType === "savings" ? "savings" : "checking",
        holder_name: data.holderName,
        holder_document: documentClean,
      },
      { onConflict: "tenant_id" },
    );

    return {
      recipientId: result.id,
      status: result.status,
      alreadyExists: false,
      message: "Recebedor criado com sucesso",
    };
  });

// ── Sincronizar status do recebedor ───────────────────────────────────────
export const syncRecipientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenantId: string }) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("tenants")
      .select("recipient_id, recipient_status")
      .eq("id", data.tenantId)
      .maybeSingle();
    const tenant = row as { recipient_id: string | null; recipient_status: string | null } | null;
    if (!tenant?.recipient_id) {
      return { status: "not_configured" as const, recipientId: null };
    }

    try {
      const result = await pagarme<{ id: string; status: string }>(
        `/recipients/${tenant.recipient_id}`,
      );
      await supabaseAdmin
        .from("tenants")
        .update({ recipient_status: result.status })
        .eq("id", data.tenantId);
      return { status: result.status, recipientId: tenant.recipient_id };
    } catch {
      return { status: tenant.recipient_status, recipientId: tenant.recipient_id };
    }
  });

// ── Listar tenants com status do recebedor ────────────────────────────────
export const listTenantsWithRecipientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, document, document_type, recipient_id, recipient_status, recipient_error, legal_name, active, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const tenants = (data ?? []) as Array<Record<string, unknown>>;
    const ids = tenants.map((t) => t.id as string);

    let bankByTenant: Record<string, Record<string, unknown>> = {};
    if (ids.length > 0) {
      const { data: banks } = await supabaseAdmin
        .from("tenant_bank_account")
        .select(
          "tenant_id, bank_code, branch, account, account_digit, account_type, holder_name, holder_document",
        )
        .in("tenant_id", ids);
      bankByTenant = Object.fromEntries(
        ((banks ?? []) as Array<Record<string, unknown>>).map((b) => [b.tenant_id as string, b]),
      );
    }

    return tenants.map((t) => {
      const b = bankByTenant[t.id as string] ?? {};
      return {
        ...t,
        bank_code: (b.bank_code as string | undefined) ?? null,
        bank_agency: (b.branch as string | undefined) ?? null,
        bank_account: (b.account as string | undefined) ?? null,
        bank_account_dv: (b.account_digit as string | undefined) ?? null,
        account_type: (b.account_type as string | undefined) ?? null,
        holder_name: (b.holder_name as string | undefined) ?? null,
        holder_document: (b.holder_document as string | undefined) ?? null,
      };
    }) as unknown as TenantRecipientRow[];
  });
