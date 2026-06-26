# Deploying to Cloudflare Pages

This app runs on Cloudflare Pages using the official **`@cloudflare/next-on-pages`**
adapter (already configured in this project). Server-rendered routes run on the
Cloudflare Workers/Edge runtime; static assets are served directly.

> ⚠️ The adapter's build step does **not** run on Windows (it can't launch the
> Vercel build it depends on). That's fine — **Cloudflare builds your site on Linux**,
> so you deploy from the dashboard (Git) or from WSL/macOS/Linux. Don't try to run
> `npm run pages:build` on Windows.

---

## What's already set up for you

- `@cloudflare/next-on-pages` + `wrangler` in `package.json` (scripts: `pages:build`,
  `pages:preview`, `pages:deploy`).
- `export const runtime = "edge"` on `src/app/(app)/layout.tsx` so every
  authenticated/dynamic route is Edge-compatible.

> There is intentionally **no `wrangler.toml`**. If that file exists, Cloudflare
> locks the project into "config-as-code" mode and you can no longer add plain
> environment variables in the dashboard (you'd see: *"Environment variables for
> this project are being managed through wrangler.toml. Only Secrets can be managed
> via the Dashboard."*). Without it, you manage everything in the dashboard. The
> two things it used to provide — the `nodejs_compat` flag and the build output dir —
> are set in the dashboard (steps below).

---

## Method A — Deploy from GitHub (recommended, easiest)

### 1. Push the project to GitHub
Create a new GitHub repo and push this folder to it. Do **not** commit `.env.local`
(it's already in `.gitignore`).

### 2. Create the Pages project
1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Pick your repository.
3. Set the **build settings**:
   - **Framework preset:** `Next.js`
   - **Build command:** `npx @cloudflare/next-on-pages@1.13.12`
   - **Build output directory:** `.vercel/output/static`

### 3. Add environment variables
In the Pages project → **Settings → Variables and Secrets** (or **Environment
variables**), add these for the **Production** environment (and Preview if you want
preview deploys). They must be present at **build time** because `NEXT_PUBLIC_*`
values are baked into the bundle. (If the dashboard says variables are managed via
`wrangler.toml`, that file must NOT be in your repo — it has been removed from this
project for exactly this reason.)

```
NEXT_PUBLIC_FIREBASE_API_KEY            = (from Firebase)
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        = your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID         = your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID             = 1:...:web:...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID= 1234567890
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     = your-project.appspot.com
NODE_VERSION                            = 20
```

> Do **not** add `FIREBASE_SERVICE_ACCOUNT_PATH` — that's only for the local seed
> script and must never be deployed.

### 4. Enable the Node.js compatibility flag (REQUIRED)
`@cloudflare/next-on-pages` needs the Node.js compatibility flag at runtime. In the
dashboard: **Settings → Runtime → Compatibility flags** (older UI: Settings →
Functions) → add `nodejs_compat` to **both** Production and Preview, and set the
**Compatibility date** to `2024-09-23` or later. Redeploy after changing this.
If the site loads blank or Functions error after deploy, this flag is the usual cause.

### 5. Deploy
Click **Save and Deploy**. Cloudflare builds on Linux and publishes to
`https://<project>.pages.dev`. Every push to your main branch redeploys.

---

## Method B — Deploy directly with Wrangler (from WSL / macOS / Linux)

From a Linux-like shell (NOT Windows CMD/PowerShell):

```bash
# one-time: put your NEXT_PUBLIC_FIREBASE_* values in .env.local first
npm install
npx @cloudflare/next-on-pages@1.13.12      # builds to .vercel/output/static
npx wrangler login                          # opens browser once
npx wrangler pages deploy .vercel/output/static \
  --compatibility-flags=nodejs_compat --compatibility-date=2024-09-23
```
(The `pages:deploy` npm script already includes these flags.)

On Windows, run the same inside **WSL** (`wsl` then `cd /mnt/c/Users/.../rancay-shop`).

---

## 6. CRITICAL post-deploy step — authorize the domain in Firebase

Firebase Authentication blocks sign-in from unknown domains. After your first
deploy:

1. Firebase Console → **Authentication → Settings → Authorized domains → Add domain**.
2. Add your `*.pages.dev` URL (e.g. `rancay-shop.pages.dev`) and any custom domain.

Without this, login will fail with `auth/unauthorized-domain`.

Also deploy your Firestore rules and indexes once (from any machine with the
Firebase CLI):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

And seed the database once (locally, with a service-account key — see README §6):

```bash
npm run seed
```

---

## 7. Quick checklist

- [ ] Repo pushed to GitHub (no `.env.local` committed).
- [ ] Pages build command = `npx @cloudflare/next-on-pages@1.13.12`,
      output dir = `.vercel/output/static`.
- [ ] All six `NEXT_PUBLIC_FIREBASE_*` vars + `NODE_VERSION=20` set in Pages.
- [ ] `nodejs_compat` flag enabled in the dashboard (Production + Preview).
- [ ] No `wrangler.toml` in the repo (so the dashboard can manage variables).
- [ ] First deploy succeeded → site loads at `*.pages.dev`.
- [ ] `*.pages.dev` (and custom domain) added to Firebase **Authorized domains**.
- [ ] Firestore rules/indexes deployed; database seeded.
- [ ] Logged in with `admin@store.com` / `Admin@123456`.

---

## Troubleshooting

- **`auth/unauthorized-domain` on login** → add the domain in Firebase Authorized
  domains (step 6).
- **Blank "Firebase is not configured" screen** → the `NEXT_PUBLIC_FIREBASE_*` env
  vars weren't set at build time. Add them in Pages settings and redeploy.
- **Build error about Edge runtime / a route not configured for Edge** → ensure the
  `export const runtime = "edge"` line in `src/app/(app)/layout.tsx` is intact, and
  that any new server route you add also uses `export const runtime = "edge"`.
- **Node compatibility error at runtime** → confirm `nodejs_compat` is enabled for
  the environment you're hitting (Production vs Preview).
- **"Environment variables are being managed through wrangler.toml. Only Secrets can
  be managed via the Dashboard."** → there is a `wrangler.toml` in your repo. Delete
  it (`git rm wrangler.toml && git commit && git push`) and redeploy; the dashboard
  variable UI then unlocks. (It has already been removed from this project.)
- **Adapter fails locally on Windows or WSL (`spawn npx ENOENT`, plus a "you're on a
  Windows system" warning)** → your shell is using **Windows' Node** (even inside WSL,
  via `/mnt/c` on PATH). Don't build locally — deploy via Cloudflare's Git integration
  (Method A), which builds on Linux. To build locally anyway, install a native Linux
  Node in WSL (nvm) so `which node` is under your Linux home, then reinstall
  `node_modules` and rebuild.
