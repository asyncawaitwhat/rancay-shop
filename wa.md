# WhatsApp Bot — Setup Steps (do these in order)

Follow this checklist to connect the WhatsApp AI sales bot. Deep reference:
[`docs/WHATSAPP_AI_BOT.md`](docs/WHATSAPP_AI_BOT.md).



---

## 0. What you need first
- A **Meta (Facebook) developer account** → <https://developers.facebook.com>
- A **WhatsApp Business** phone number (Meta gives you a free test number to start)
- An **OpenAI API key** → <https://platform.openai.com/api-keys>
- Your **Firebase service-account JSON** (same one used for seeding:
  Firebase Console → Project Settings → Service Accounts → *Generate new private key*)

---

## 1. Create the Meta app
1. <https://developers.facebook.com/apps> → **Create app** → type **Business**.
2. On the app dashboard → **Add product** → add **WhatsApp** → *Set up*.
3. In **WhatsApp → API Setup** note:
   - **Phone number ID**  → env `WHATSAPP_PHONE_NUMBER_ID`
   - **Temporary access token** → env `WHATSAPP_TOKEN`
     *(for production make a permanent token: Business Settings → System Users →
     create a user → Generate token with `whatsapp_business_messaging` +
     `whatsapp_business_management`.)*
4. **App Settings → Basic** → copy **App secret** → env `WHATSAPP_APP_SECRET`.

## 2. Choose a verify token
Pick any random string (e.g. a UUID). You'll put the **same** value in two places:
- env `WHATSAPP_VERIFY_TOKEN`
- Meta's webhook config (next step)

## 3. Set the environment variables
Put these where the app runs (Cloudflare Pages → **Settings → Variables and Secrets**,
as **encrypted/secret**; for local dev put them in `.env.local`). Never use
`NEXT_PUBLIC_` for these — they are server-only.

```
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...            # the random string from step 2
WHATSAPP_APP_SECRET=...
OPENAI_API_KEY=...

# Firebase service account (same JSON as seeding):
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...            # client_email from the JSON
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
#   (paste private_key verbatim, keep the \n, wrap in quotes)

# Optional — only if you front the app with a custom domain/CDN:
PUBLIC_BASE_URL=https://your-domain.com
```
> Tip: instead of the 3 separate `FIREBASE_*` fields you may set one
> `FIREBASE_SERVICE_ACCOUNT_JSON={...whole JSON...}`.

**Redeploy** after setting these so the running app picks them up.

## 4. Deploy Firestore rules
```
firebase deploy --only firestore:rules
```

## 5. Get a public webhook URL
- **Production:** your deployed site already serves it:
  `https://YOUR_DOMAIN/api/whatsapp/webhook`
- **Local testing:** run `npm run dev`, then expose port 3000:
  ```
  ngrok http 3000
  # or:  cloudflared tunnel --url http://localhost:3000
  ```
  Use the printed HTTPS URL + `/api/whatsapp/webhook`, and set
  `PUBLIC_BASE_URL` to that HTTPS origin so product image links work.

## 6. Configure the webhook in Meta
1. **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://YOUR_DOMAIN/api/whatsapp/webhook`
3. **Verify token:** the exact value of `WHATSAPP_VERIFY_TOKEN`.
4. Click **Verify and save** (Meta calls your GET endpoint; it should succeed).
5. Under **Webhook fields**, **Subscribe** to **`messages`**.

## 7. Turn the bot on (in the app)
1. Log in to the ERP → sidebar **Administration → WhatsApp Bot**.
2. Confirm the **Webhook URL** shown matches what you put in Meta.
3. Set **Bot enabled** ✓ and **AI auto-reply enabled** ✓.
4. Pick the **OpenAI model** (default `gpt-4o-mini`), default language, business
   name, optional welcome message, and human-handoff contacts. **Save**.

## 8. Test it
1. Make sure you have at least one **active product with stock** (and ideally an
   image) in the ERP.
2. From your own WhatsApp, message the business number (on the free test number
   you must first add your phone under **API Setup → To**).
3. Try: `مرحبا` → `بدي ...` (a product you have) → choose qty → `أكد الطلب` →
   `نعم أكد`.
4. The bot replies, shows products/images, builds a cart, and on confirmation
   creates a real invoice (**Sales** screen, source = WhatsApp) and deducts stock.

## 9. Verify / debug
- App route check: `npm run test:whatsapp` (offline logic tests).
- Webhook verify by hand:
  `GET https://YOUR_DOMAIN/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=123`
  → should return `123`.
- If something's off, check the deploy/function logs and the **Troubleshooting**
  table in `docs/WHATSAPP_AI_BOT.md`.

---

### Quick reference
| Thing | Value |
|---|---|
| Webhook URL | `https://YOUR_DOMAIN/api/whatsapp/webhook` |
| Webhook field to subscribe | `messages` |
| In-app screen | Administration → WhatsApp Bot |
| Offline tests | `npm run test:whatsapp` |
