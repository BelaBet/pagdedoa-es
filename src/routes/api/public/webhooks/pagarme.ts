import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Database } from '@/integrations/supabase/types';

type PaymentStatus = Database['public']['Enums']['payment_status'];

// Map Pagar.me event types -> our payments.status enum.
// IMPORTANTE: o enum public.payment_status só tem 'pending', 'confirmed',
// 'failed', 'refunded' — não existe 'paid' nem 'expired'. Antes disso mapear
// para esses valores fazia a gravação falhar silenciosamente no banco
// (Postgres rejeita valor de enum inválido), deixando o pagamento preso em
// 'pending' pra sempre mesmo já confirmado no Pagar.me.
function mapEventToStatus(eventType: string): PaymentStatus | null {
  switch (eventType) {
    case 'order.paid':
    case 'charge.paid':
      return 'confirmed';
    case 'order.payment_failed':
    case 'charge.payment_failed':
      return 'failed';
    case 'charge.refunded':
    case 'order.refunded':
      return 'refunded';
    case 'charge.canceled':
    case 'order.canceled':
    case 'charge.expired':
    case 'order.expired':
      // Não existe status 'expired' no banco — o mais próximo
      // semanticamente disponível é 'failed'.
      return 'failed';
    case 'charge.pending':
    case 'order.pending':
    case 'charge.processing':
      return 'pending';
    default:
      return null;
  }
}

function extractGatewayIds(payload: any): string[] {
  const ids = new Set<string>();
  const data = payload?.data ?? payload;
  if (!data) return [];

  // Order-level id
  if (typeof data.id === 'string') ids.add(data.id);

  // Charges array (order events)
  if (Array.isArray(data.charges)) {
    for (const c of data.charges) {
      if (c?.id) ids.add(c.id);
      if (c?.order_id) ids.add(c.order_id);
      if (c?.last_transaction?.id) ids.add(c.last_transaction.id);
    }
  }

  // Single charge event
  if (data.order_id) ids.add(data.order_id);
  if (data.last_transaction?.id) ids.add(data.last_transaction.id);

  return Array.from(ids);
}

function verifyBasicAuth(request: Request): boolean {
  const user = process.env.PAGARME_WEBHOOK_USER;
  const pass = process.env.PAGARME_WEBHOOK_PASSWORD;
  if (!user || !pass) return false;

  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('basic ')) return false;

  try {
    const decoded = atob(header.slice(6).trim());
    const expected = `${user}:${pass}`;
    if (decoded.length !== expected.length) return false;
    // constant-time compare
    let diff = 0;
    for (let i = 0; i < decoded.length; i++) {
      diff |= decoded.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export const Route = createFileRoute('/api/public/webhooks/pagarme')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyBasicAuth(request)) {
          return new Response('Unauthorized', { status: 401 });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }

        const eventType: string = payload?.type ?? '';
        const newStatus = mapEventToStatus(eventType);

        if (!newStatus) {
          // Acknowledge ignored events with 200 so Pagar.me doesn't retry
          return Response.json({ ok: true, ignored: eventType });
        }

        const gatewayIds = extractGatewayIds(payload);
        if (gatewayIds.length === 0) {
          return Response.json({ ok: true, ignored: 'no_gateway_id' });
        }

        const { data: updated, error } = await supabaseAdmin
          .from('payments')
          .update({ status: newStatus })
          .in('gateway_id', gatewayIds)
          .select('id, tenant_id, gateway_id, status');

        if (error) {
          console.error('[pagarme-webhook] update error', error, { eventType, gatewayIds });
          return new Response('DB error', { status: 500 });
        }

        // For order.paid, also persist a donation record from the order metadata.
        let donationInserted = false;
        if (eventType === 'order.paid') {
          const order = payload?.data ?? {};
          const meta = order?.metadata ?? {};
          const charge = order?.charges?.[0];
          const tx = charge?.last_transaction;
          const gatewayId: string | null = order?.id ?? charge?.id ?? null;
          const tenantId: string | null = meta.tenant_id ?? null;

          if (!gatewayId || !tenantId) {
            console.warn('[pagarme-webhook] order.paid missing tenant_id/gateway_id', { gatewayId, tenantId });
          } else {
            // Idempotency: skip if already inserted for this gateway_id.
            const { data: existing } = await supabaseAdmin
              .from('donations')
              .select('id')
              .eq('gateway_id', gatewayId)
              .maybeSingle();

            if (!existing) {
              const grossAmount = Number(meta.gross_amount ?? 0);
              const adminFee = Number(meta.admin_fee ?? 0);
              const netAmount = Number(meta.net_amount ?? 0);
              const installments = Number(meta.installments ?? 1);
              const paymentMethod: string =
                charge?.payment_method ?? order?.payment_method ?? null;

              const donationRecord = {
                tenant_id: tenantId,
                cost_center_id: meta.cost_center_id ?? null,
                amount: netAmount / 100, // numeric(10,2) em reais
                gross_amount: grossAmount,
                admin_fee: adminFee,
                net_amount: netAmount,
                payment_method: paymentMethod,
                installments,
                card_brand: tx?.card?.brand ?? null,
                card_last_four: tx?.card?.last_four_digits ?? null,
                gateway_id: gatewayId,
                donor_name: order?.customer?.name ?? null,
                donor_document: order?.customer?.document ?? null,
                donor_phone: order?.customer?.phones?.mobile_phone?.number ?? null,
                donor_email: order?.customer?.email ?? null,
                created_at: order?.created_at ?? new Date().toISOString(),
              };

              const { error: insErr } = await supabaseAdmin
                .from('donations')
                .insert(donationRecord as any);

              if (insErr) {
                console.error('[pagarme-webhook] donation insert error', insErr, { gatewayId });
                return new Response('Donation insert error', { status: 500 });
              }
              donationInserted = true;
            }
          }
        }

        return Response.json({
          ok: true,
          event: eventType,
          status: newStatus,
          updated: updated?.length ?? 0,
          donationInserted,
        });
      },
    },
  },
});
