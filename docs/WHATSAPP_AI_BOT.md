# WhatsApp AI Sales Bot

A production WhatsApp sales assistant built **inside** the existing ERP. Customers
message your WhatsApp Business number; GPT understands them, searches **real ERP
products**, shows info/images, builds a cart, and — only after the customer
confirms — creates a **normal ERP sales invoice** and deducts stock.

> Backend is always the source of truth. GPT is a sales assistant only: it can
> **never** invent prices, stock, totals, discounts, taxes, delivery fees, invoice
> numbers, products, or images. Those always come from Firestore via approved tools.

---

## 1. Architecture

```
WhatsApp ──▶ POST /api/whatsapp/webhook (edge)
                 │  1. verify X-Hub-Signature-256
                 │  2. parse message, dedup by WhatsApp message id
                 │  3. load bot settings + session (language, status)
                 │  4. handler → OpenAI orchestrator (function calling)
                 │         GPT may ONLY call approved ERP tools:
                 │           searchProducts · getProductDetails · getProductImage
                 │           createOrFindCustomer · addToCart · removeFromCart
                 │           getCart · calculateCart · createInvoice · handoffToHuman
                 │  5. tools run server-side against Firestore (service account)
                 │  6. send text + product images back to the customer
                 ▼
        Firestore (products, clients, salesInvoices, stockMovements,
                   whatsappSessions, whatsappMessages, whatsappCarts,
                   whatsappSettings, sequences, auditLogs)
```

### Why a service-account REST client?

The ERP front-end uses the Firebase **Web SDK** (gated by `firestore.rules`, an
authenticated staff user). The webhook has **no user session** and the app deploys
to **Cloudflare Pages (edge runtime)**, where `firebase-admin` (Node) cannot run.

`src/lib/server/firestore-rest.ts` solves this: it signs a service-account JWT with
**Web Crypto (RS256)**, exchanges it for a Google OAuth token, and calls the
**Firestore REST API** directly. This runs on the edge, keeps credentials
server-side, has trusted admin access (bypasses rules), and supports transactions
for atomic invoice + stock writes.

### Files

| File | Purpose |
|---|---|
| `src/lib/server/env.ts` | Server env loading + validation |
| `src/lib/server/firestore-rest.ts` | Edge Firestore admin client (JWT auth, query, transaction, `nextNumberTx`) |
| `src/lib/server/whatsapp/client.ts` | WhatsApp Cloud API: send text/image/buttons, signature verify, parse |
| `src/lib/server/bot/settings.ts` | Server-side bot config reader |
| `src/lib/server/bot/messages.ts` | Message logging + duplicate detection + sanitisation |
| `src/lib/server/bot/sessions.ts` | Session create/update, language detection, handoff |
| `src/lib/server/bot/products.ts` | `searchProducts`, `getProductDetails`, image URL |
| `src/lib/server/bot/customers.ts` | `createOrFindCustomer` (reuses ERP `clients`) |
| `src/lib/server/bot/cart.ts` | Cart CRUD + backend total computation |
| `src/lib/server/bot/invoice.ts` | `createInvoiceFromCart` (ERP-faithful, transactional) |
| `src/lib/server/bot/tools.ts` | OpenAI tool schemas + server dispatcher |
| `src/lib/server/bot/orchestrator.ts` | OpenAI function-calling loop + system prompt |
| `src/lib/server/bot/handler.ts` | Top-level inbound flow (dedup → AI → send → log) |
| `src/app/api/whatsapp/webhook/route.ts` | GET verify + POST receive (edge) |
| `src/app/api/whatsapp/media/[productId]/route.ts` | Serves Base64 product images as public binary for WhatsApp |
| `src/lib/firebase/services/whatsapp.ts` | Client-side admin service (Web SDK) |
| `src/app/(app)/whatsapp/page.tsx` | In-app settings + conversation monitor screen |

---

## 2. Meta WhatsApp Cloud API setup

1. Create a Meta app at <https://developers.facebook.com> → **Business** type.
2. Add the **WhatsApp** product. Note the **Phone number ID** and the temporary
   **access token** (for production, create a System User token that doesn't expire).
3. **App Settings → Basic** → copy the **App secret**.
4. **WhatsApp → Configuration → Webhook**:
   - **Callback URL:** `https://YOUR_DOMAIN/api/whatsapp/webhook`
   - **Verify token:** the same random string you set in `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save** (Meta calls `GET` with `hub.challenge`).
   - **Subscribe** to the **`messages`** field.

### Webhook URL

```
https://YOUR_DOMAIN/api/whatsapp/webhook
```

---

## 3. Environment variables

Set these as **server-side / encrypted** variables (Cloudflare Pages → Settings →
Variables and Secrets), never as `NEXT_PUBLIC_*`. See `.env.example`.

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from the API setup |
| `WHATSAPP_VERIFY_TOKEN` | Random string; must match Meta's webhook config |
| `WHATSAPP_APP_SECRET` | App secret; verifies `X-Hub-Signature-256` |
| `OPENAI_API_KEY` | OpenAI API key (needed if provider = OpenAI) |
| `GEMINI_API_KEY` | Google Gemini API key (needed if provider = Gemini) |
| `FIREBASE_PROJECT_ID` | Firebase project id (falls back to `NEXT_PUBLIC_FIREBASE_PROJECT_ID`) |
| `FIREBASE_CLIENT_EMAIL` | Service-account email |
| `FIREBASE_PRIVATE_KEY` | Service-account private key (keep `\n` escapes, wrap in quotes) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(alt)* whole service-account JSON instead of the 3 fields above |
| `PUBLIC_BASE_URL` | *(optional)* public origin for product image links |

The service account is the **same** JSON used for seeding
(Firebase Console → Project Settings → Service Accounts → Generate new private key).

---

## 4. Firestore collections

Reuses existing ERP collections and adds bot-specific ones:

| Collection | Role |
|---|---|
| `products` | Source of all product data, prices, stock (existing) |
| `clients` | WhatsApp customers are normal ERP clients (existing) |
| `salesInvoices` | WhatsApp orders become real ERP invoices (existing) |
| `stockMovements` | Stock deductions logged here (existing) |
| `sequences` | Invoice/client numbering (existing) |
| `auditLogs` | Bot actions audited as `whatsapp-bot` (existing) |
| `whatsappSessions` | One per phone: language, status, active cart, history |
| `whatsappMessages` | Every inbound/outbound message (dedup by id) |
| `whatsappCarts` | Active/pending/invoiced/cancelled carts |
| `whatsappLogs` | Durable event/error trail (webhook + bot), shown on the WhatsApp screen |
| `whatsappSettings` | Bot config doc (`main`) |

Deploy the updated rules:

```bash
firebase deploy --only firestore:rules
```

---

## 5. How the AI tool system works

1. The customer message + short history + a strict system prompt go to OpenAI with
   the tool schemas (`TOOL_DEFINITIONS`).
2. GPT responds with **tool calls** (never with raw DB writes).
3. The server **executes each tool** (`executeTool`), validating inputs and reading
   live ERP data, then feeds the JSON result back to GPT.
4. GPT produces a short WhatsApp reply using only tool-returned facts.
5. `createInvoice` is the only state-changing sale; it runs a Firestore transaction
   that deducts stock and writes the invoice atomically — stock is **never** deducted
   unless the invoice write succeeds.

Settings let you toggle the bot, toggle AI auto-reply, pick the OpenAI model, set
the default language, business name, welcome message, human-handoff contacts, and
(optional) tax rate / delivery fee.

> **Tax / delivery note:** the ERP invoice model has no tax/delivery fields, so
> invoice totals are derived purely from product lines (ERP-faithful). `taxRate` and
> `deliveryFee` default to `0`; they are recorded on the cart and as invoice
> provenance fields. Enabling them changes what the customer is *quoted*, not the
> ERP invoice line math — wire them into your ERP invoice model first if you need
> them on the printed invoice.

---

## 6. Local development

```bash
npm install
npm run dev            # http://localhost:3000
```

Expose the webhook publicly so Meta can reach it:

```bash
# ngrok
ngrok http 3000
# or Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

Use the printed HTTPS URL as `https://<tunnel>/api/whatsapp/webhook` in Meta's
webhook config, and set `PUBLIC_BASE_URL=https://<tunnel>` so image links resolve.

Put all server env vars in `.env.local` (Next loads them for `npm run dev`).

Run the logic tests:

```bash
npm run test:whatsapp
```

---

## 7. Deploy (Cloudflare Pages)

1. Add all server env vars (section 3) as **encrypted** Pages variables (Production
   **and** Preview).
2. Keep the existing `NEXT_PUBLIC_FIREBASE_*` build-time vars.
3. Build/deploy as today (`@cloudflare/next-on-pages`, output `.vercel/output/static`).
   The new routes already `export const runtime = "edge"`.
4. Set Meta's webhook to `https://YOUR_PAGES_DOMAIN/api/whatsapp/webhook`.
5. `firebase deploy --only firestore:rules`.

---

## 8. Example conversation

```
Customer: مرحبا
Bot:      أهلاً وسهلاً 👋 كيف بقدر أساعدك اليوم؟ شو المنتج اللي بتدور عليه؟

Customer: بدي خبز شوفان
Bot:      لقيتلك:
          1) خبز شوفان وسط — 1.50
          2) خبز شوفان كبير — 2.00
          الاثنين متوفرين ✅ بتحب أبعثلك صورة؟

Customer: بدي 3 من الأول
Bot:      تمام، ضفت 3 × خبز شوفان وسط.
          السلة: 3 × 1.50 = 4.50
          بتحب تضيف شي ثاني؟

Customer: أكد الطلب
Bot:      طلبك: 3 × خبز شوفان وسط — الإجمالي 4.50
          أأكد الطلب؟ (نعم/لا)

Customer: نعم أكد
Bot:      تم إنشاء فاتورتك ✅
          رقم الفاتورة: INV-000123
          الإجمالي: 4.50 — شكراً لطلبك! 🙏
```

---

## 9. Testing checklist

| Test | How |
|---|---|
| Webhook verification | `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=123` → returns `123` |
| Signature check | Invalid `X-Hub-Signature-256` → `403` |
| Message parsing | `npm run test:whatsapp` (parseIncoming) |
| Product search | `npm run test:whatsapp` |
| Add to cart / totals | `npm run test:whatsapp` |
| Invoice math | `npm run test:whatsapp` |
| Duplicate message | Re-send same `messages[].id`; second is ignored |
| Human handoff | Ask "بدي حدا من الفريق" → session becomes `human_handoff`, AI stops |

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Webhook "verify" fails in Meta | `WHATSAPP_VERIFY_TOKEN` mismatch |
| `403` on POST | Bad/missing `WHATSAPP_APP_SECRET`, or signature header missing |
| No reply sent | `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` wrong; check function logs |
| "missing env vars" in logs | One of the required server vars is unset (see logs for the list) |
| Firestore 403/`PERMISSION_DENIED` | Service-account fields wrong; check `FIREBASE_PRIVATE_KEY` `\n` escaping |
| Images not delivered | `PUBLIC_BASE_URL` not public/HTTPS, or product has no `imageBase64` |
| Bot silent for one customer | They're in `human_handoff`; resume from the WhatsApp screen |
| GPT gives wrong price | Should be impossible — prices come from tools; check the product doc |
| Order placed twice | Cart is marked `invoiced` + message dedup; verify the same cart id was reused |
