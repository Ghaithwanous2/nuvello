import { createHash, timingSafeEqual } from "crypto";

// Cryptomus Merchant API.
//   Auth:      merchant (uuid) + sign headers
//   Signature: md5( base64(json_body) + API_KEY )
//   Docs:      https://doc.cryptomus.com/merchant-api/request-format
const DEFAULT_API_URL = "https://api.cryptomus.com";
const INVOICE_LIFETIME_SECONDS = 3600;

export function isCryptomusConfigured() {
  return Boolean(process.env.CRYPTOMUS_MERCHANT_ID && process.env.CRYPTOMUS_API_KEY);
}

function apiUrl() {
  return (process.env.CRYPTOMUS_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function base64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

// The signature covers the exact JSON string that is sent as the body.
export function signBody(bodyString, apiKey) {
  return md5(base64(bodyString) + apiKey);
}

export function signPayload(payload, apiKey) {
  return signBody(JSON.stringify(payload), apiKey);
}

async function cryptomusRequest(path, payload) {
  const merchant = process.env.CRYPTOMUS_MERCHANT_ID;
  const apiKey = process.env.CRYPTOMUS_API_KEY;
  if (!merchant || !apiKey) {
    const error = new Error("بوابة الدفع بالكريبتو غير مهيأة.");
    error.code = "cryptomus_not_configured";
    throw error;
  }

  const body = JSON.stringify(payload);
  const response = await fetch(`${apiUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant,
      sign: signBody(body, apiKey),
    },
    body,
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || `فشل طلب Cryptomus (${response.status}).`);
    error.code = "cryptomus_request_failed";
    error.status = response.status;
    throw error;
  }
  // Cryptomus answers HTTP 200 with { state: 1 } for business errors.
  if (data && data.state !== undefined && String(data.state) !== "0") {
    const error = new Error(data.message || "رفضت Cryptomus الطلب.");
    error.code = "cryptomus_rejected";
    error.details = data.errors || null;
    throw error;
  }
  return data?.result ?? data;
}

export function createInvoice({ amount, currency, network, orderId, urlReturn, urlSuccess, urlCallback }) {
  return cryptomusRequest("/v1/payment", {
    amount: Number(amount).toFixed(2),
    currency,
    network,
    order_id: orderId,
    url_return: urlReturn,
    url_success: urlSuccess,
    url_callback: urlCallback,
    is_payment_multiple: true,
    lifetime: INVOICE_LIFETIME_SECONDS,
  });
}

export function fetchPaymentInfo({ uuid, orderId }) {
  return cryptomusRequest("/v1/payment/info", uuid ? { uuid } : { order_id: orderId });
}

export const PAID_STATUSES = ["paid", "paid_over"];
export const FAILED_STATUSES = ["fail", "cancel", "system_fail", "wrong_amount"];

export function paymentSucceeded(status) {
  return PAID_STATUSES.includes(String(status));
}

export function paymentFailed(status) {
  return FAILED_STATUSES.includes(String(status));
}

// PHP's json_encode escapes slashes and non-ASCII by default. Cryptomus signs
// webhooks with JSON_UNESCAPED_UNICODE (raw unicode, escaped slashes for the
// request half), so accept either encoding — both are keyed hashes.
function phpCompatJson(value) {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u0080-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

// Cryptomus puts the signature in the body for payment webhooks; a header
// fallback is accepted in case a delivery variant sends it that way.
export function verifyWebhookSignature(payload, apiKey, headerSignature = null) {
  if (!apiKey || !payload || typeof payload !== "object") return false;

  const provided = String(payload.sign || headerSignature || "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(provided)) return false;

  const { sign, ...rest } = payload;
  const candidates = [JSON.stringify(rest), phpCompatJson(rest)];

  return candidates.some((json) => {
    const expected = signBody(json, apiKey);
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"));
  });
}

// Webhooks report `status`, the payment-info endpoint reports `payment_status`.
export function statusOf(payload) {
  return payload?.status || payload?.payment_status || null;
}
