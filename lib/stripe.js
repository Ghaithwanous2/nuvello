import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-06-20";
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

async function stripeRequest(path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const error = new Error("Stripe secret key is not configured.");
    error.code = "stripe_not_configured";
    throw error;
  }

  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    body.append(name, String(value));
  }

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
    },
    body,
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe request failed (${response.status}).`);
    error.code = data?.error?.code || "stripe_request_failed";
    error.status = response.status;
    throw error;
  }
  return data;
}

export function createCustomer({ email, name, userId }) {
  return stripeRequest("/customers", {
    email,
    name,
    "metadata[userId]": userId,
  });
}

export function createCheckoutSession({ customerId, priceId, userId, successUrl, cancelUrl }) {
  return stripeRequest("/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    client_reference_id: userId,
    "subscription_data[metadata][userId]": userId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });
}

export function createPortalSession({ customerId, returnUrl }) {
  return stripeRequest("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

export function retrieveSubscription(subscriptionId) {
  return stripeRequest(`/subscriptions/${subscriptionId}`, {}).catch(() => null);
}

// Stripe signs `${timestamp}.${rawBody}` with the endpoint secret; compare in
// constant time and reject stale deliveries.
export function verifyWebhookSignature({ payload, header, secret, toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS, now = Date.now() }) {
  if (!secret || !header || typeof payload !== "string") return false;

  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }

  if (!timestamp || !Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"));
  return signatures.some((signature) => {
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

export function planFromSubscriptionStatus(status) {
  return ["active", "trialing"].includes(String(status)) ? "pro" : "free";
}
