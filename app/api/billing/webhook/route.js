import { NextResponse } from "next/server";
import { applySubscription, findUserByStripeCustomer } from "@/lib/auth";
import { verifyWebhookSignature } from "@/lib/stripe";

export const runtime = "nodejs";

function resolveUserId(subscription) {
  const fromMetadata = subscription?.metadata?.userId;
  if (fromMetadata) return fromMetadata;
  return findUserByStripeCustomer(subscription?.customer)?.id || null;
}

async function handleEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      if (!userId || !session.subscription) return false;
      // Subscription details (period end, real status) arrive with
      // customer.subscription.* — mark it active here so access is immediate.
      applySubscription({
        userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        status: "active",
      });
      return true;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const userId = resolveUserId(subscription);
      if (!userId) return false;
      applySubscription({
        userId,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
        priceId: subscription.items?.data?.[0]?.price?.id,
        currentPeriodEnd: subscription.current_period_end,
      });
      return true;
    }

    default:
      return false;
  }
}

export async function POST(request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET غير مهيأ." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyWebhookSignature({ payload, header: signature, secret })) {
    return NextResponse.json({ error: "توقيع غير صالح." }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "حمولة غير صالحة." }, { status: 400 });
  }

  try {
    return NextResponse.json({ received: true, handled: await handleEvent(event) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
