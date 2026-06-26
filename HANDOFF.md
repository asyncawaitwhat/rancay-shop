# Project Handoff — Clothes Store Management System

> Read this first if you are a new session continuing this project.
> Status as of the initial build: **complete and passing build + lint + typecheck.**

---

## 1. What this project is

A complete, production-ready, **bilingual (Arabic/English, RTL/LTR)** admin system
for an online clothing store. Backend is **Firebase Authentication + Cloud Firestore**.
All images are stored as **Base64 strings inside Firestore documents** — there is no
Firebase Storage / S3 / Cloudinary anywhere (verified).

### Tech stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui-style components
(hand-written, no CLI) · Firebase Web SDK v11 · Zod · react-hook-form · Recharts ·
lucide-react · firebase-admin (seed script only). PDFs = client-side branded HTML
printed via a popup window (`window.print()`).

---

## 2. Current status — DONE and verified

| Check | Result |
|---|---|
| `npm install` | ✅ |
| `npm run typecheck` (`tsc --noEmit`) | ✅ clean |
| `npm run lint` | ✅ no warnings/errors |
| `npm run build` | ✅ 23 routes compile |
| `scripts/seed.ts` compiles | ✅ |
| No Firebase Storage usage | ✅ |

Everything in the original spec is implemented. There are **no TODOs, no fake
buttons, no mock business data** (except the intentional seed dataset).

---

## 3. How to run / test

```bash
# 1. Configure Firebase (one time)
cp .env.example .env.local          # then fill in NEXT_PUBLIC_FIREBASE_* values
#    In Firebase console: enable Auth > Email/Password, create Firestore DB

# 2. Run the app
npm install
npm run dev                          # http://localhost:3000

# 3. Deploy security rules + indexes
firebase deploy --only firestore:rules,firestore:indexes

# 4. Seed starter data (creates the admin login + sample data)
#    Set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local (path to a service-account JSON)
npm run seed
```

**Default login:** `admin@store.com` / `Admin@123456`

Other commands: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`.

---

## 4. Architecture map (where everything lives)

```
src/
├─ app/
│  ├─ layout.tsx                 Root layout → wraps everything in <Providers>
│  ├─ page.tsx                   Root: redirects to /dashboard or /login
│  ├─ globals.css                Tailwind + CSS vars + print + RTL styles
│  ├─ login/page.tsx             Login screen (Firebase email/password)
│  └─ (app)/                     ROUTE GROUP for all authenticated screens
│     ├─ layout.tsx              Renders <AppShell> (auth guard + sidebar + header)
│     ├─ dashboard/page.tsx      Stats cards + Recharts (getDashboardStats)
│     ├─ clients/page.tsx        List + create/edit dialog
│     ├─ clients/[id]/page.tsx   Profile: tabs (invoices/returns/receipts/products) + statement PDF
│     ├─ products/page.tsx       List + dialog (Base64 image, auto-SKU)
│     ├─ products/[id]/page.tsx  Profile: stock + movements/sales/returns tabs
│     ├─ categories/page.tsx
│     ├─ inventory/page.tsx      Adjust stock + movement ledger + low stock (tabs)
│     ├─ sales/page.tsx          Invoice list
│     ├─ sales/new/page.tsx      Invoice EDITOR (also edits draft via ?id=)
│     ├─ sales/[id]/page.tsx     Invoice view (post draft / cancel posted / PDF)
│     ├─ returns/{page,new,[id]} Same pattern as sales
│     ├─ vaults/{page,[id]}      List + create/edit + transfer dialog; profile w/ txns
│     ├─ transactions/page.tsx   Finance ledger (read-only)
│     ├─ expenses/page.tsx       List + create dialog + PDF + delete
│     ├─ receipts/page.tsx       List + create dialog + PDF + delete
│     ├─ reports/page.tsx        12 reports, date filters, PDF + CSV
│     ├─ brand/page.tsx          Brand settings form (logo Base64)
│     ├─ users/page.tsx          User CRUD (creates real Auth users)
│     ├─ roles/page.tsx          Role CRUD + permission matrix
│     └─ audit/page.tsx          Audit log viewer
│
├─ components/
│  ├─ providers/
│  │  ├─ language-provider.tsx   useLang(): t(), name(en,ar), lang, dir, toggleLang
│  │  ├─ auth-provider.tsx       useAuth(): user, role, actor, loading, profileError, signOut
│  │  ├─ permission-provider.tsx usePermissions(): can(screen,action), canView, level
│  │  └─ providers.tsx           Composes the three + <Toaster/>
│  ├─ layout/                    app-shell, sidebar (perm-filtered nav), header, language-switcher
│  ├─ shared/                    page-header, states (Loading/Empty/Error/NoAccess),
│  │                             screen-guard, field, money, pagination, confirm-dialog,
│  │                             image-upload (Base64), entity-combobox (searchable select)
│  ├─ invoices/line-items-editor.tsx   Shared add/edit invoice & return lines
│  └─ ui/                        shadcn-style primitives (button, input, dialog, select,
│                                table, tabs, card, badge, dropdown-menu, checkbox, avatar,
│                                popover, textarea, label, toaster/use-toast)
│
├─ hooks/use-brand.ts            Cached brand settings loader (invalidateBrandCache())
│
└─ lib/
   ├─ firebase/
   │  ├─ client.ts               initApp, getDb(), getFirebaseAuth(), isFirebaseConfigured
   │  ├─ auth.ts                  signIn/out, watchAuth, loadUserProfile, authErrorMessage
   │  ├─ firestore.ts            generic helpers + nextNumber() (transactional sequences)
   │  └─ services/               clients, products, categories, invoices, returns, finance,
   │                             vaults, reports, users, roles, settings, auditLogs
   ├─ types.ts                   All entity TypeScript interfaces
   ├─ schemas.ts                 All Zod schemas + inferred Form types
   ├─ permissions.ts             SCREENS list, levels, can/levelAllows helpers
   ├─ invoice-math.ts            computeLine/computeTotals/paymentStatusOf (shared by UI+services)
   ├─ nav.ts                     Sidebar nav groups (screen → href → icon)
   ├─ i18n/dictionary.ts         Full en + ar flat dictionaries
   ├─ pdf.ts                     printInvoice/Return/Receipt/Expense/ClientStatement/Report
   └─ utils.ts                   cn, date/money format, fileToBase64, validateImageFile, csv

scripts/seed.ts                  firebase-admin seed (excluded from tsconfig build)
firestore.rules, firestore.indexes.json, firebase.json
.env.example, .env.local.example, components.json, README.md
```

---

## 5. Key design decisions (so you don't undo them)

1. **Doc IDs are human-readable where it helps:** clients use `CL-000001` as the doc
   id; invoices/returns/receipts/expenses use their number (`INV-000001`, etc.) as id.
   Products, categories, vaults, users(=uid), roles use generated/known ids.
2. **Numbering** is via the `sequences` collection + Firestore transactions
   (`nextNumber()` in `lib/firebase/firestore.ts`). It accepts an optional `tx` so it
   can run inside a larger transaction (required: all reads before writes).
3. **Posting flow (sales/returns)** runs in ONE Firestore transaction: read all
   products (+ vault + client) FIRST, then write invoice, stock movements, product
   qty, client balances, vault balance, finance transaction. See
   `services/invoices.ts::postInvoice` and `services/returns.ts::postReturn`.
4. **Cancel** reverses all of the above and writes reversing stock movements.
5. **Client running balances** (`totalSales/totalReturns/totalPaid/balance`) are
   stored on the client doc and updated by invoices/returns/receipts.
6. **Vault balances** are stored and updated by transactions (not recomputed).
7. **Returns** lower the client's balance (the finance effect) + restock. They do NOT
   auto-withdraw cash from a vault (business-correct for receivables). Documented.
8. **User creation** uses a SECONDARY Firebase app instance so creating a new Auth
   user doesn't sign out the current admin (`services/users.ts::createUser`).
9. **Permissions:** 4 levels (no_access/view_only/edit/full). `can(screen, action)`
   maps action→minimum level. Super Admin (`role.isSuperAdmin`) always full. UI hides
   no-access screens; `firestore.rules` enforce auth + protect users/roles/brand.
   Per-action UX is primarily client-side (documented limitation).
10. **PDF** = `lib/pdf.ts` opens a popup, writes branded HTML, calls `window.print()`.
    User picks "Save as PDF". No heavy dependency.
11. **App never crashes without env:** `isFirebaseConfigured` gates Firebase; a setup
    screen shows instead (`app-shell.tsx` / `login/page.tsx`).
12. **Currency** comes from Brand Settings (`currencyEnglish/currencyArabic`), with
    `common.currency` dictionary as fallback. The seed currently seeds **QAR (ر.ق.)**.

---

## 6. Firestore collections

`users, roles, clients, categories, products, stockMovements, salesInvoices,
returnInvoices, vaults, financeTransactions, expenseSlips, receiptSlips,
brandSettings (doc id "main"), auditLogs, sequences`

(`permissions` is modeled as the `permissions` map field inside each `roles` doc, not
a separate collection.)

---

## 7. Known minor items / possible next steps

- **Lint warnings:** none currently. Two `react-hooks/exhaustive-deps` were resolved
  with inline disables on the `load()` effects in sales/returns `[id]` pages.
- **Indexes:** `firestore.indexes.json` covers the composite queries used
  (client invoices/returns/receipts, product movements, vault transactions). If you
  add a new `where + orderBy` query, Firestore will print a "create index" link —
  add it there and redeploy.
- **Security hardening (optional):** to fully enforce per-action permissions
  server-side, move write operations behind Cloud Functions. Current rules are
  appropriate for a trusted internal team.
- **Seed is idempotent-ish:** it overwrites fixed-id docs and resets the admin
  password, but it does NOT clear old auto-id docs (stockMovements, financeTransactions
  use `.add()`). Re-running adds duplicates of those. Wipe the collections first if
  you re-seed, or only seed once.
- **Editing a posted invoice** is intentionally blocked — cancel + recreate instead.
  Only drafts are editable/deletable.

---

## 8. How to extend (common tasks)

- **Add a field to an entity:** update `lib/types.ts` → `lib/schemas.ts` →
  the service file (build payload) → the form dialog/page → dictionary labels in
  `lib/i18n/dictionary.ts` (both `en` and `ar`).
- **Add a new screen:** add the `ScreenKey` in `types.ts`, an entry in
  `permissions.ts` SCREENS, a nav item in `nav.ts`, a folder under `app/(app)/`, and
  wrap its content in `<ScreenGuard screen="...">`. Update `firestore.rules` if it
  needs a new collection.
- **Add a translation:** add the key to BOTH `en` and `ar` in
  `lib/i18n/dictionary.ts`; use `t("your.key")`.
- **Add a report:** extend the `ReportKey` union and the `buildReport()` switch in
  `app/(app)/reports/page.tsx`.

---

## 8b. Deployment — Cloudflare Pages (configured)

The project is set up to deploy to **Cloudflare Pages** via the
`@cloudflare/next-on-pages` adapter. See **`DEPLOY.md`** for full step-by-step.

Key facts:
- Adapter pinned to `@cloudflare/next-on-pages@1.13.12` (newer versions require
  Next ≥14.3; we're on 14.2).
- `src/app/(app)/layout.tsx` has `export const runtime = "edge"` so all dynamic
  routes are Edge-compatible. Any NEW server route must also be edge.
- **No `wrangler.toml` on purpose** — if present, Cloudflare locks the project into
  config-as-code mode and the dashboard won't let you add plain env vars. So
  `nodejs_compat` + compatibility date are set in the dashboard
  (Settings → Runtime → Compatibility flags, Production + Preview), and the build
  output dir (`.vercel/output/static`) is set in the dashboard build config.
- Pages build command: `npx @cloudflare/next-on-pages@1.13.12`, output `.vercel/output/static`.
- `NEXT_PUBLIC_FIREBASE_*` must be set as **build-time** env vars in the Pages project
  dashboard (Variables and Secrets).
- The adapter build does NOT run on Windows (`spawn npx ENOENT`) — build on Cloudflare
  (Git integration) or in WSL/Linux. Plain `next build` works on Windows for verification.
- **After deploy:** add the `*.pages.dev` domain to Firebase → Authentication →
  Authorized domains, or login fails with `auth/unauthorized-domain`.

## 9. Re-verify before shipping changes

```bash
npm run typecheck && npm run lint && npm run build
```
All three must pass (they currently do).
