import { NextResponse } from "next/server";
import { applyCryptoPayment } from "@/lib/auth";
import { statusOf, verifyWebhookSignature } from "@/lib/cryptomus";

export const runtime = "nodejs";

export async function POST(request) {
  const apiKey = process.env.CRYPTOMUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "CRYPTOMUS_API_KEY غير مهيأ." }, { status: 503 });
  }

  const raw = await request.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "حمولة غير صالحة." }, { status: 400 });
  }

  // Never trust a webhook before the signature checks out.
  if (!verifyWebhookSignature(payload, apiKey, request.headers.get("sign"))) {
    return NextResponse.json({ error: "توقيع غير صالح." }, { status: 400 });
  }

  if (payload.type && payload.type !== "payment") {
    return NextResponse.json({ result: "success", received: true, applied: false });
  }

  const status = statusOf(payload);
  if (!payload.order_id || !status) {
    return NextResponse.json({ result: "success", received: true, applied: false });
  }

  try {
    const result = await applyCryptoPayment({
      orderId: payload.order_id,
      status,
      providerUuid: payload.uuid || null,
      txid: payload.txid || null,
      payerAmount: payload.payment_amount || null,
      isFinal: payload.is_final,
    });
    return NextResponse.json({ result: "success", received: true, applied: result.granted, status: result.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
