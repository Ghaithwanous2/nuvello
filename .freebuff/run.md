# Run doc — Nuvello (`imageCompress`)

Next.js 15 (App Router) + React 19. No git repo in this checkout.

## 1. Reproduce the artifacts a fresh checkout needs

1. **Install dependencies** with npm (the lockfile is `package-lock.json`; do not use yarn/pnpm):
   ```
   npm install
   ```
2. **Environment files**: none are required to run. There is no `.env.local` in the main checkout to copy.
   `.env.example` documents the optional variables:
   - `AUTH_SECRET` — without it the app falls back to a dev-only signing secret.
   - `NEXT_PUBLIC_SITE_URL` — defaults to the request origin; used for payment redirect URLs, the sitemap and canonical links.
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` — optional; without them `/api/billing/checkout` returns `stripe_not_configured` (503).
   - `CRYPTOMUS_MERCHANT_ID`, `CRYPTOMUS_API_KEY` — optional; without them the crypto section shows a "not configured" note and the pay button is disabled.
   - `CRYPTO_CURRENCY`, `CRYPTO_NETWORK`, `CRYPTO_NETWORK_LABEL` — what the customer pays with (default `USDT` on `bsc` = BEP20).
   - `CRYPTO_PERIOD_DAYS`, `CRYPTO_PERIOD_PRICE_USD`, `CRYPTO_LIFETIME_PRICE_USD` — which crypto offers appear and at what price (defaults: 30 days for 7). Setting `CRYPTO_PERIOD_DAYS=0` hides the period offer.
   - `CRYPTOMUS_API_URL` — overrides the provider base URL (only used to point at the local mock below).
   - There is no local plan toggle: Pro changes only through Cryptomus, Stripe or the admin panel.
3. **Data store**: `data/db.json` (gitignored) is created automatically on the first write. It holds `users`, `sessions`, `usage`, `subscriptions` and `payments`. Older files missing the newer arrays are normalised in memory on read and written back on the next mutation, so no migration step is needed. Copy the file from the main checkout if you want existing accounts.
4. **Native SWC is broken on this machine** (`@next/swc-win32-x64-msvc ... is not a valid Win32 application`). Next transparently falls back to the WASM compiler: the warning is expected, the first compile just takes ~10–15s.

## 2. Run the server

Dev server on the project's default port 3000, detached so it outlives the conversation (Windows / PowerShell):

```
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','-p','3000' -WorkingDirectory 'C:\Users\gaiet\OneDrive\Desktop\imageCompress' -RedirectStandardOutput 'C:\Users\gaiet\OneDrive\Desktop\imageCompress\.freebuff\preview.log' -RedirectStandardError 'C:\Users\gaiet\OneDrive\Desktop\imageCompress\.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id"
```

Notes:
- Name the executable exactly (`npm.cmd`) — `Start-Process` does not resolve shell shims. stdout and stderr must go to **different** files.
- If port 3000 is taken, `next dev` silently picks a random free port; always pass `-- -p <port>` to keep the URL predictable (the project README uses 3000).
- The `Start-Process` wrapper returns the launcher pid; the actual listener is a grandchild. Use the listening pid for preview registration:
  `netstat -ano | grep LISTENING | grep ":3000 " | awk '{print $5}'`
- Verify before registering: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`, and `curl -s http://localhost:3000/api/auth/me` → guest quota JSON (`"dailyLimit":5`).
- Env vars for the detached process must be set inside the PowerShell command (`$env:NAME='value';` before `Start-Process`), not in the calling shell.

Production build check (optional): `npm run build`, then `node node_modules/next/dist/bin/next start -p <port>`. Running `next dev` afterwards overwrites `.next`, so rebuild before starting the production server again.

## 3. Test crypto payments locally (no real money)

`scripts/mock-cryptomus.mjs` stands in for the Cryptomus API. It re-implements the documented signature check, so a signing bug in the app shows up as a rejected request, and it logs every call as JSON.

1. Start the mock (any free port; it needs the status file to answer `/v1/payment/info`):
   ```
   echo '{}' > .freebuff/mock-status.json
   MOCK_MERCHANT=merchant-test-uuid MOCK_API_KEY=mock-api-key MOCK_PORT=4500 \
   MOCK_LOG=.freebuff/mock-cryptomus.log MOCK_STATUS_FILE=.freebuff/mock-status.json \
   node scripts/mock-cryptomus.mjs
   ```
2. Start the app against it by setting, in the server process:
   `CRYPTOMUS_MERCHANT_ID=merchant-test-uuid`, `CRYPTOMUS_API_KEY=mock-api-key`, `CRYPTOMUS_API_URL=http://localhost:4500`, plus optional `CRYPTO_PERIOD_DAYS` / `CRYPTO_PERIOD_PRICE_USD` / `CRYPTO_LIFETIME_PRICE_USD`.
3. Create an invoice (`POST /api/billing/crypto/invoice` or the button in `/account`) and check the mock log: `signOk: true` proves request signing matches `md5(base64(json_body) + API_KEY)`.
4. Simulate payment by POSTing a signed webhook body to `/api/billing/crypto/webhook`. The signature goes **inside the body**:
   `sign = md5(base64(JSON.stringify(payload_without_sign)) + API_KEY)`.
   `status: "paid"` (or `paid_over`) activates Pro; anything else is ignored. Replaying the same body must not extend the plan twice.
5. To test the reconciliation path instead (webhook never arrives), put `{"<orderId>":"paid"}` into the status file and open `/account?crypto=pending&order=<orderId>`: the page polls `/api/billing/crypto/order`, and that endpoint reads the invoice back from the provider.
6. Restore `data/db.json` afterwards — these flows write a test user, usage rows and payment records into it.
7. Real deliveries only reach `url_callback` when `NEXT_PUBLIC_SITE_URL` is a public HTTPS address; locally the polling path in step 5 is what activates the plan.
