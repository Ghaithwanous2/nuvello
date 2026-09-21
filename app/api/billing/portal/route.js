import { NextResponse } from "next/server";
import { getCurrentUser, getStripeCustomerId } from "@/lib/auth";
import { createPortalSession, isStripeConfigured } from "@/lib/stripe";

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({
      error: "بوابة الدفع غير مهيأة بعد.",
      code: "stripe_not_configured",
    }, { status: 503 });
  }

  const customerId = await getStripeCustomerId(user.id);
  if (!customerId) {
    return NextResponse.json({ error: "لا يوجد اشتراك Stripe مرتبط بهذا الحساب." }, { status: 409 });
  }

  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const session = await createPortalSession({ customerId, returnUrl: `${origin}/account` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error.message, code: error.code || "stripe_error" }, { status: 502 });
  }
}
