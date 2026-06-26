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
- `wrangler.toml` with the required `nodejs_compat` flag and the build output dir.

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

### 3. Add environment variables (Build + Runtime)
In the Pages project → **Settings → Environment variables**, add these for the
**Production** environment (and Preview if you want preview deploys). They must be
present at **build time** because `NEXT_PUBLIC_*` values are baked into the bundle:

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

### 4. Enable the Node.js compatibility flag
The included `wrangler.toml` already sets `nodejs_compat`. If a build/runtime error
mentions Node compatibility, also set it in the dashboard:
**Settings → Functions → Compatibility flags** → add `nodejs_compat` to **both**
Production and Preview, with a **Compatibility date** of `2024-09-23` or later.

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
npx wrangler pages deploy                   # uses wrangler.toml output dir
```

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
- [ ] `nodejs_compat` flag enabled (wrangler.toml covers it; dashboard as fallback).
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
- **Adapter fails locally on Windows (`spawn npx ENOENT`)** → expected; build on
  Cloudflare (Method A) or in WSL (Method B).
