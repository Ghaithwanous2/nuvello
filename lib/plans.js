// Single source of truth for what each plan allows.
// Guests are capped too, otherwise the free plan is bypassed by logging out.

export const GUEST_DAILY_LIMIT = 5;
export const FREE_DAILY_LIMIT = 25;

export const PLANS = {
  guest: { id: "guest", label: "زائر", dailyLimit: GUEST_DAILY_LIMIT, pro: false },
  free: { id: "free", label: "Free", dailyLimit: FREE_DAILY_LIMIT, pro: false },
  pro: { id: "pro", label: "Pro", dailyLimit: null, pro: true },
};

const DAY_MS = 1000 * 60 * 60 * 24;

// A prepaid Pro period ends by itself. Stripe plans stay webhook-authoritative,
// because Stripe sends an update when a subscription lapses.
export function isPrepaidExpired(user, now = Date.now()) {
  if (!user || user.plan !== "pro" || user.planLifetime) return false;
  if (user.planSource !== "crypto") return false;
  if (!user.planRenewsAt) return false;
  return new Date(user.planRenewsAt).getTime() <= now;
}

export function planIdForUser(user) {
  if (!user) return "guest";
  if (user.plan === "pro" && !isPrepaidExpired(user)) return "pro";
  return "free";
}

export function planForId(planId) {
  return PLANS[planId] || PLANS.free;
}

export function dailyLimitForPlan(planId) {
  return planForId(planId).dailyLimit;
}

// Shared shape returned by the quota endpoints so the client can render
// "remaining today" without knowing how plans are defined.
export function quotaSnapshot(planId, usage) {
  const plan = planForId(planId);
  const used = Math.max(0, Number(usage) || 0);
  const limit = plan.dailyLimit;
  return {
    plan: plan.id,
    planLabel: plan.label,
    isPro: plan.pro,
    unlimited: limit === null,
    usage: used,
    dailyLimit: limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

// ---------------------------------------------------------------------------
// Crypto checkout (Cryptomus). Prices and durations come from the environment
// so pricing can change without a deploy:
//   CRYPTO_PERIOD_PRICE_USD + CRYPTO_PERIOD_DAYS  -> a prepaid period offer
//   CRYPTO_LIFETIME_PRICE_USD                     -> a one-time lifetime offer
// Setting both offers both. Setting CRYPTO_PERIOD_DAYS=0 disables the period
// offer. With no prices at all the crypto checkout stays disabled.
// ---------------------------------------------------------------------------

export const CRYPTO_CURRENCY = process.env.CRYPTO_CURRENCY || "USDT";
export const CRYPTO_NETWORK = process.env.CRYPTO_NETWORK || "bsc"; // BEP20
export const CRYPTO_NETWORK_LABEL = process.env.CRYPTO_NETWORK_LABEL || "BEP20";

function positiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function cryptoOffers() {
  const periodDays = process.env.CRYPTO_PERIOD_DAYS === undefined ? 30 : Math.floor(Number(process.env.CRYPTO_PERIOD_DAYS) || 0);
  const periodPrice = positiveNumber(process.env.CRYPTO_PERIOD_PRICE_USD, 7);
  const lifetimePrice = positiveNumber(process.env.CRYPTO_LIFETIME_PRICE_USD, 0);

  const offers = [];
  if (periodDays > 0 && periodPrice > 0) {
    offers.push({
      kind: "period",
      days: periodDays,
      amountUsd: periodPrice,
      title: `${periodDays} يوماً من Pro`,
      priceLabel: `${periodPrice}$`,
      note: "دفعة واحدة مقابل مدة محددة، ويمكنك التجديد بالدفع مرة أخرى.",
    });
  }
  if (lifetimePrice > 0) {
    offers.push({
      kind: "lifetime",
      days: 0,
      amountUsd: lifetimePrice,
      title: "Pro مدى الحياة",
      priceLabel: `${lifetimePrice}$`,
      note: "دفعة واحدة، بدون انتهاء أو تجديد.",
    });
  }
  return offers;
}

export function cryptoOfferFor(kind) {
  return cryptoOffers().find((offer) => offer.kind === kind) || null;
}

export function isCryptoCheckoutEnabled() {
  return cryptoOffers().length > 0;
}

export function periodEndFrom(baseMs, days) {
  return new Date(baseMs + Math.max(1, Math.floor(Number(days) || 0)) * DAY_MS).toISOString();
}
