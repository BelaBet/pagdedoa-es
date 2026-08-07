import { supabase } from "@/integrations/supabase/client";

/**
 * STUB payment flow.
 * Creates a pending payment, simulates gateway processing, marks confirmed.
 * Replace with real Stripe / Mercado Pago / Asaas integration later.
 */
export async function createStubPayment(args: {
  tenantId: string;
  profileId: string;
  amount: number;
  method: "pix" | "credit_card" | "debit_card";
  referenceType: "ticket" | "donation";
  referenceId?: string | null;
}) {
  const safeCols =
    "id, tenant_id, profile_id, amount, method, status, reference_type, reference_id, gateway_id, created_at";
  const { data, error } = await supabase
    .from("payments")
    .insert({
      tenant_id: args.tenantId,
      profile_id: args.profileId,
      amount: args.amount,
      method: args.method,
      status: "pending",
      reference_type: args.referenceType,
      reference_id: args.referenceId ?? null,
      gateway_id: `stub_${Date.now()}`,
    })
    .select(safeCols)
    .single();
  if (error) throw error;

  // Simulate async confirmation
  await new Promise((r) => setTimeout(r, 1200));

  // Update the payment status to confirmed in the database
  const { data: updatedData, error: updateError } = await supabase
    .from("payments")
    .update({ status: "confirmed" })
    .eq("id", (data as { id: string }).id)
    .select(safeCols)
    .single();

  if (updateError) throw updateError;

  return updatedData;
}
