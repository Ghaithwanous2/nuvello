import { NextResponse } from "next/server";
import { attachStripeCustomer, getCurrentUser, getStripeCustomerId } from "@/lib/auth";
import { createCheckoutSession, createCustomer, isStripeConfigured } from "@/lib/stripe";

function siteOrigin(request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل الدخول أولاً لترقية حسابك." }, { status: 401 });
  }
  if (user.plan === "pro") {
    return NextResponse.json({ error: "حسابك على خطة Pro بالفعل." }, { status: 409 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      error: "بوابة الدفع غير مهيأة بعد. أضف مفاتيح Stripe لتشغيل الاشتراكات.",
      code: "stripe_not_configured",
    }, { status: 503 });
  }

  try {
    let customerId = getStripeCustomerId(user.id);
    if (!customerId) {
      const customer = await createCustomer({ email: user.email, name: user.name, userId: user.id });
      customerId = attachStripeCustomer(user.id, customer.id);
    }

    const origin = siteOrigin(request);
    const session = await createCheckoutSession({
      customerId,
      priceId: process.env.STRIPE_PRICE_ID,
      userId: user.id,
      successUrl: `${origin}/account?checkout=success`,
      cancelUrl: `${origin}/account?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || "stripe_error" }, { status: 502 });
  }
}
