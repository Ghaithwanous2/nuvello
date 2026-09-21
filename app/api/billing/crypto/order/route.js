import { NextResponse } from "next/server";
import { applyCryptoPayment, getCurrentUser, getPaymentByOrderId } from "@/lib/auth";
import { fetchPaymentInfo, isCryptomusConfigured, paymentSucceeded, statusOf } from "@/lib/cryptomus";

// Reconciliation path: if the webhook is delayed (or localhost so Cryptomus
// cannot reach us at all), the returning user still gets their plan.
export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  }

  const orderId = new URL(request.url).searchParams.get("order");
  const payment = await getPaymentByOrderId(orderId);
  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ error: "لم يتم العثور على الطلب." }, { status: 404 });
  }

  let current = payment;
  if (!payment.grantedAt && isCryptomusConfigured()) {
    try {
      // Always reconcile by our own order id: it can never be ambiguous.
      const info = await fetchPaymentInfo({ orderId: payment.orderId });
      const status = statusOf(info);
      if (status && status !== payment.status) {
        await applyCryptoPayment({
          orderId: payment.orderId,
          status,
          providerUuid: info.uuid || null,
          txid: info.txid || null,
          payerAmount: info.payment_amount || null,
          isFinal: info.is_final,
        });
        current = await getPaymentByOrderId(orderId) || payment;
      }
    } catch {
      // Provider unreachable: report the last known state.
    }
  }

  return NextResponse.json({
    ok: true,
    order: {
      orderId: current.orderId,
      kind: current.kind,
      days: current.days,
      amountUsd: current.amountUsd,
      currency: current.currency,
      network: current.network,
      status: current.status,
      paid: Boolean(current.grantedAt) || paymentSucceeded(current.status),
      txid: current.txid,
      createdAt: current.createdAt,
    },
  });
}
