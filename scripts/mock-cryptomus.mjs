// Local stand-in for the Cryptomus Merchant API, used to verify the integration
// without real money. It re-implements the documented signature check, so if the
// app's signing is wrong the mock rejects the request.
import { createServer } from "http";
import { createHash } from "crypto";
import { appendFileSync, readFileSync } from "fs";

const MERCHANT = process.env.MOCK_MERCHANT;
const API_KEY = process.env.MOCK_API_KEY;
const PORT = Number(process.env.MOCK_PORT || 4500);
const LOG = process.env.MOCK_LOG;
const STATUS_FILE = process.env.MOCK_STATUS_FILE;

const md5 = (value) => createHash("md5").update(value).digest("hex");
const sign = (body, key) => md5(Buffer.from(body, "utf8").toString("base64") + key);

function record(entry) {
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

function readStatus(orderId) {
  try {
    const map = JSON.parse(readFileSync(STATUS_FILE, "utf8"));
    return map[orderId] || "check";
  } catch {
    return "check";
  }
}

createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;

  const signOk = request.headers.sign === sign(raw, API_KEY);
  const merchantOk = request.headers.merchant === MERCHANT;
  record({ path: request.url, signOk, merchantOk, body: raw });

  const reply = (payload) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (!signOk || !merchantOk) return reply({ state: 1, message: "Invalid signature" });

  if (request.url === "/v1/payment") {
    const body = JSON.parse(raw);
    return reply({
      state: 0,
      result: {
        uuid: `mock-${Date.now()}`,
        order_id: body.order_id,
        amount: body.amount,
        currency: body.currency,
        network: body.network,
        address: "0xMOCK000000000000000000000000000000000000",
        expired_at: new Date(Date.now() + 3600_000).toISOString(),
        url: `https://pay.cryptomus.test/mock/${body.order_id}`,
      },
    });
  }

  if (request.url === "/v1/payment/info") {
    const body = JSON.parse(raw);
    return reply({
      state: 0,
      result: {
        uuid: body.uuid || "mock-uuid",
        order_id: body.order_id,
        status: readStatus(body.order_id),
        payment_amount: "7.00",
        txid: "0xmockedtxhash",
        is_final: true,
      },
    });
  }

  return reply({ state: 1, message: "Unknown path" });
}).listen(PORT, () => record({ listening: PORT }));
