# Clothes Store Management System

A complete, bilingual (Arabic / English) admin system for running an online clothing
store. It manages clients, inventory, sales invoices, return invoices, vaults,
expenses, receipts, finance, reports, brand settings, users, roles and permissions —
all backed by **Firebase Authentication** and **Cloud Firestore**.

Images (product photos, company logo, user avatars) are stored as **Base64 strings
directly inside Firestore documents**. No Firebase Storage, S3, or Cloudinary is used.

---

## 1. What you need

- A free Google account (for Firebase).
- [Node.js 18+](https://nodejs.org) installed on your computer.
- About 15 minutes.

You do **not** need to know how to code to set this up — just follow the steps.

---

## 2. Create your Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Give it a name (e.g. `my-clothes-store`) and finish the wizard.
3. In the left menu open **Build → Authentication → Get started**, choose
   **Email/Password**, and **Enable** it.
4. In the left menu open **Build → Firestore Database → Create database**.
   Start in **production mode** and pick a location close to you.

### Get your configuration values

1. Click the gear icon → **Project settings**.
2. Scroll to **Your apps** and click the **Web** icon (`</>`). Register an app
   (any nickname). Firebase shows a `firebaseConfig` object — keep this open.

---

## 3. Configure the app

1. In the project folder, make a copy of `.env.example` and name it **`.env.local`**.
2. Fill it in using the values from `firebaseConfig`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=my-clothes-store.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=my-clothes-store
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=my-clothes-store.appspot.com
```

> The storage bucket value is part of the standard Firebase config, but the app
> never uses Firebase Storage. All images are saved as Base64 in Firestore.

If these values are missing, the app will not crash — it shows a friendly setup
screen instead.

---

## 4. Install and run

Open a terminal in the project folder and run:

```bash
npm install
npm run dev
```

Then open <http://localhost:3000> in your browser.

To build the production version:

```bash
npm run build
npm start
```

---

## 5. Deploy the database rules and indexes

The project includes security rules (`firestore.rules`) and indexes
(`firestore.indexes.json`). Deploy them with the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick your project
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 6. Seed the starter data (creates your admin login)

The seed script creates the first admin user, default roles, brand settings,
vaults, sample clients, categories, products, and example invoices/receipts/expenses
so the dashboard shows real numbers immediately.

1. In the Firebase console: **Project settings → Service accounts →
   Generate new private key**. Save the downloaded JSON file somewhere safe.
2. In `.env.local`, set the path to that file:

   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=C:/Users/you/keys/serviceAccount.json
   ```

3. Run:

   ```bash
   npm run seed
   ```

### Default login

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@store.com` |
| Password | `Admin@123456`    |

> Change this password from **Users** after your first login, or in the Firebase
> Authentication console.

If you prefer not to use the service account, you can instead create the first
user manually: add an Email/Password user in **Firebase Authentication**, then add
a document in the Firestore `users` collection with that user's UID as the document
ID and fields `name`, `email`, `role` (`role_super_admin`), `status: active`,
`language: en`. (Running the seed is much easier.)

---

## 7. The modules

| Module            | What it does |
| ----------------- | ------------ |
| **Dashboard**     | Live totals, charts and recent activity pulled from Firestore. |
| **Clients**       | Client CRUD, profile with sales/returns/receipts, balances, statement PDF. |
| **Products**      | Product CRUD with Base64 images, SKU auto-numbering, stock, profile. |
| **Categories**    | Category CRUD (English + Arabic names). |
| **Inventory**     | Manual stock adjustments, stock movement ledger, low-stock list. |
| **Sales Invoices**| Create/draft/post invoices; posting deducts stock atomically and records payment. |
| **Return Invoices**| Create/post returns; posting adds stock back and credits the client. |
| **Vaults**        | Cash/bank/custom vaults with balances and per-vault transactions; transfers. |
| **Transactions**  | Full finance ledger across all vaults. |
| **Expenses**      | Expense slips that deduct from a vault and create a transaction; PDF. |
| **Receipts**      | Receipt slips that add to a vault, credit the client; PDF. |
| **Reports**       | 12 reports with date filters, summary cards, PDF + CSV export. |
| **Brand Settings**| Company names, logo (Base64), contact info, invoice footer, currency. |
| **Users**         | Staff user CRUD with avatar, role assignment. |
| **Roles**         | Role CRUD with a per-screen permission matrix. |
| **Audit Logs**    | Record of important actions with filters. |

---

## 8. Users, roles and permissions

Every screen and action is controlled by permissions. Each role has a permission
level per screen:

- **No Access** — the screen is hidden completely.
- **View Only** — can open and read, but cannot create/edit/delete.
- **Edit** — can view, create and edit, but not delete.
- **Full** — can view, create, edit, delete and export.

The **Super Admin** role always has full access and cannot be locked out.

To add a staff member: go to **Users → New User**, set their email, a password,
and a role. They can then log in with those credentials. To change what a role can
do, go to **Roles**, edit the role, and adjust the matrix.

> **Security note:** Firestore rules (`firestore.rules`) require authentication for
> everything and protect sensitive collections (users, roles, brand settings) so
> that only users with full access can change them. The rich per-action experience
> (view/edit/full) is enforced primarily in the app. For an internal trusted team
> this is appropriate; for stricter hardening, move write operations behind Cloud
> Functions.

---

## 9. How image upload works (Base64)

When you choose an image, the app validates the type (JPG, PNG, WEBP) and size,
converts it to a Base64 text string in your browser, and stores that string inside
the Firestore document (`product.imageBase64`, `brandSettings.logoBase64`,
`user.avatarBase64`).

> ⚠️ **Keep images small.** Base64 increases size by ~33%, and Firestore documents
> are limited to ~1 MB. The uploader rejects files larger than 800 KB. Compress or
> resize photos before uploading for best performance.

---

## 10. Language (Arabic / English)

Use the language switcher in the top bar. Arabic switches the whole interface to a
right-to-left (RTL) layout; English uses left-to-right (LTR). Every business entity
has both an English and an Arabic name, and the app shows the right one for the
current language.

---

## 11. Numbering

Firestore has no auto-increment, so the app uses a `sequences` collection with
Firestore transactions to safely generate document numbers:

`CL-000001` clients · `PRD-000001` products · `INV-000001` sales invoices ·
`RET-000001` returns · `REC-000001` receipts · `EXP-000001` expenses ·
`TRX-000001` finance transactions.

---

## 12. Commands

| Command         | What it does |
| --------------- | ------------ |
| `npm run dev`   | Run locally for development. |
| `npm run build` | Build the production version. |
| `npm start`     | Run the built production version. |
| `npm run lint`  | Check code style. |
| `npm run typecheck` | Check TypeScript types. |
| `npm run seed`  | Seed the database (needs the service account key). |

---

## 13. Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui-style components ·
Firebase Authentication · Cloud Firestore · Zod · react-hook-form · Recharts ·
lucide-react. PDFs are generated client-side from branded HTML (print to PDF).
