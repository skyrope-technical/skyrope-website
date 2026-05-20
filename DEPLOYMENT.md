# Sky Rope — Cloudflare deployment notes

Backend stack: **Cloudflare Pages Functions** + **Cloudflare D1** (database) + **Resend** (transactional email). No external DB, no third-party form service.

## Files in this repo

```
index.html                  ← the website
uploads/                    ← image assets referenced by index.html
functions/api/contact.js    ← Cloudflare Pages Function (POST /api/contact)
schema.sql                  ← D1 table definition (run once)
```

When deploying to Cloudflare Pages, point the project at this directory. Cloudflare auto-detects the `functions/` folder and routes `/api/contact` to `functions/api/contact.js`.

---

## 1. Create the D1 database

In Cloudflare dashboard: **Workers & Pages → D1 → Create database** (e.g. name it `skyrope`).

Open the new database, go to the **Console** tab, paste the entire contents of `schema.sql`, and run it. You should see the `leads` table appear in the **Tables** view.

## 2. Get a Resend API key

1. Sign up at https://resend.com
2. Verify your sending domain (`skyropetechnical.com`) — add the DNS records they provide.
3. Create an API key (Dashboard → API Keys → Create).
4. Copy it — you'll paste it in step 4.

## 3. Deploy Pages project

If using git: connect your repo to **Workers & Pages → Pages → Connect to Git**. Build command: *(none)* — Output directory: `/`.

If uploading directly: **Pages → Create application → Upload assets**, drag the project folder.

## 4. Bind the database + Resend key

In your Pages project → **Settings → Functions**:

- **D1 database bindings** → Add binding
  - Variable name: `DB`
  - D1 database: select `skyrope` (the one you created in step 1)

In your Pages project → **Settings → Environment variables → Production**:

- Add variable `RESEND_API_KEY` → paste the Resend key from step 2 → click **Encrypt**.

Redeploy the project so the bindings take effect (Deployments → Retry deployment, or push a commit).

## 5. Custom domains

- **Settings → Custom domains → Set up a custom domain** → `skyropetechnical.com` (and `www.skyropetechnical.com`).
- For the Qatar site, create a second Pages project pointing at the same repo with custom domain `qa.skyropetechnical.com`, or set up a worker route — either works.

---

## How submissions flow

1. User submits the form in `index.html`.
2. JS in `index.html` POSTs JSON to `/api/contact`.
3. `functions/api/contact.js` validates the payload server-side.
4. The lead is inserted into the `leads` table in D1.
5. A formatted notification email is sent via Resend to `sales@skyropetechnical.com` with `reply_to` set to the customer's email.
6. The function returns `{ success: true }` and the site shows the success panel.

If Resend fails, the **lead is still saved in D1** — you won't lose enquiries. Errors are logged to the Pages → Functions log.

## Reading leads

In the Cloudflare dashboard: **D1 → skyrope → Console**, run:

```sql
SELECT id, name, email, service, status, created_at
FROM leads
ORDER BY created_at DESC
LIMIT 50;
```

To mark one as contacted:

```sql
UPDATE leads SET status = 'contacted' WHERE id = 12;
```

## Local testing

You can run the function locally with [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/):

```bash
npx wrangler pages dev . --d1=DB --binding RESEND_API_KEY=re_xxx
```

Then open http://localhost:8788 and submit the form. D1 in dev uses a local SQLite file; run the `schema.sql` against it once with `wrangler d1 execute DB --local --file=./schema.sql`.
