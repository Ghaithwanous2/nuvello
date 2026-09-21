import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createPaymentRecord, getCurrentUser } from "@/lib/auth";
import { createInvoice, isCryptomusConfigured } from "@/lib/cryptomus";
import { CRYPTO_CURRENCY, CRYPTO_NETWORK, cryptoOfferFor, cryptoOffers } from "@/lib/plans";

// Cryptomus requires order_id to be 1-128 chars of alpha_dash only.
function createOrderId(userId) {
  const stamp = Date.now().toString(36);
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  return `nv-${stamp}-${suffix}`;
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل الدخول أولاً لإتمام الدفع." }, { status: 401 });
  }

  const offers = cryptoOffers();
  if (!offers.length) {
    return NextResponse.json({
      error: "الدفع بالكريبتو غير مفعّل. اضبط الأسعار في متغيرات البيئة.",
      code: "crypto_not_configured",
    }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const offer = cryptoOfferFor(body?.kind) || offers[0];
  if (!offer) {
    return NextResponse.json({ error: "عرض غير معروف." }, { status: 400 });
  }

  if (!isCryptomusConfigured()) {
    return NextResponse.json({
      error: "بوابة Cryptomus غير مهيأة. أضف معرّف التاجر ومفتاح API.",
      code: "cryptomus_not_configured",
    }, { status: 503 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const orderId = createOrderId(user.id);

  try {
    const invoice = await createInvoice({
      amount: offer.amountUsd,
      currency: CRYPTO_CURRENCY,
      network: CRYPTO_NETWORK,
      orderId,
      urlReturn: `${origin}/account?crypto=pending&order=${orderId}`,
      urlSuccess: `${origin}/account?crypto=pending&order=${orderId}`,
      urlCallback: `${origin}/api/billing/crypto/webhook`,
    });

    await createPaymentRecord({
      userId: user.id,
      kind: offer.kind,
      days: offer.days,
      amountUsd: offer.amountUsd,
      currency: invoice?.currency || CRYPTO_CURRENCY,
      network: invoice?.network || CRYPTO_NETWORK,
      orderId,
      providerUuid: invoice?.uuid || null,
      address: invoice?.address || null,
      expiresAt: invoice?.expired_at || null,
    });

    if (!invoice?.url) {
      return NextResponse.json({ error: "لم تُعد Cryptomus رابط الدفع." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      orderId,
      uuid: invoice.uuid || null,
      url: invoice.url,
      amount: invoice.amount || offer.amountUsd,
      currency: invoice.currency || CRYPTO_CURRENCY,
      network: invoice.network || CRYPTO_NETWORK,
      address: invoice.address || null,
      expiresAt: invoice.expired_at || null,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || "crypto_error" }, { status: 502 });
  }
}
