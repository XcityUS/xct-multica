# Deploying Multica to Railway

Deploy Multica as **two services** in one Railway project:

| Service  | Dockerfile        | Config-as-code path     | Public domain | Required add-on |
| -------- | ----------------- | ----------------------- | ------------- | --------------- |
| backend  | `Dockerfile`      | `railway.backend.json`  | yes (for WS)  | PostgreSQL      |
| web      | `Dockerfile.web`  | `railway.web.json`      | yes           | —               |

The two `railway.*.json` files at the repo root pin each service to its Dockerfile so Railway does **not** fall back to nixpacks. (Nixpacks is what produced the original `pnpm could not be found` failure: nixpacks built the app but its runtime image has no pnpm to run the start command.)

---

## 1. Provision PostgreSQL

In your Railway project: **+ New → Database → PostgreSQL**.

Railway will auto-create the env var `DATABASE_URL`. We will reference it from the backend service.

> The image is `pgvector/pgvector:pg17` in local dev; Railway's stock Postgres works for everything except `pgvector` extensions. Multica does not currently require pgvector at runtime, so the stock add-on is fine.

---

## 2. Create the **backend** service

1. **+ New → GitHub Repo → multica repo**.
2. **Settings → Source → Root Directory**: leave blank (`/`).
3. **Settings → Build → Config-as-code Path**: `railway.backend.json`.
4. **Settings → Networking → Public Networking → Generate Domain**. Note this domain — it becomes `BACKEND_PUBLIC_DOMAIN` below.
5. **Variables** → add (Reference the Postgres add-on for DATABASE_URL):

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_ENV=production
   JWT_SECRET=<generate a long random string>
   MULTICA_APP_URL=https://<web public domain>
   ALLOWED_ORIGINS=https://<web public domain>
   COOKIE_DOMAIN=                         # leave empty unless web+backend share a parent domain
   ALLOW_SIGNUP=true                      # or false to lock the instance down
   ```

   Optional but recommended:
   ```
   RESEND_API_KEY=<your resend key>       # otherwise verification codes go to logs
   RESEND_FROM_EMAIL=noreply@your-domain
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<web public domain>/auth/callback
   ```

   Optional (S3 uploads — without these, Multica falls back to local disk which is **ephemeral** on Railway):
   ```
   S3_BUCKET=...
   S3_REGION=...
   CLOUDFRONT_KEY_PAIR_ID=...
   CLOUDFRONT_PRIVATE_KEY=...
   CLOUDFRONT_DOMAIN=...
   ```

   Do **not** set `PORT` — Railway injects it and the Go server reads it from env.

6. **Deploy**. The container's `entrypoint.sh` runs migrations (`./migrate up`) before starting the server. Healthcheck path is `/health`.

---

## 3. Create the **web** service

1. **+ New → GitHub Repo → same multica repo** (yes, two services on one repo is the supported pattern).
2. **Settings → Build → Config-as-code Path**: `railway.web.json`.
3. **Settings → Networking → Public Networking → Generate Domain**. Note this — it is `<web public domain>` referenced by the backend's env vars above.
4. **Variables** → add:

   ```
   REMOTE_API_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
   NEXT_PUBLIC_WS_URL=wss://<backend public domain>/ws
   NEXT_PUBLIC_APP_VERSION=v0.2.x
   ```

   - `REMOTE_API_URL` — server-side API proxy. Uses Railway's IPv6 private network → free, low-latency, never leaves the Railway VPC. The variable name `backend` must match the **service name** of the backend service.
   - `NEXT_PUBLIC_WS_URL` — browser-side WebSocket. Must be **public + wss** because it runs in the user's browser, not in the Railway VPC.
   - `NEXT_PUBLIC_APP_VERSION` — any string; appears in error reports.

   Railway passes service variables as Docker `--build-arg` automatically, so these values are baked into the Next.js build (Next.js evaluates `next.config.ts` at build time).

5. **Deploy**.

---

## 4. Wire the two services together

After both services have public domains:

| Variable                                     | Set on   | Value                                            |
| -------------------------------------------- | -------- | ------------------------------------------------ |
| `MULTICA_APP_URL`                            | backend  | `https://<web public domain>`                    |
| `ALLOWED_ORIGINS`                            | backend  | `https://<web public domain>`                    |
| `GOOGLE_REDIRECT_URI` (if using Google OAuth) | backend  | `https://<web public domain>/auth/callback`      |
| `REMOTE_API_URL`                             | web      | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| `NEXT_PUBLIC_WS_URL`                         | web      | `wss://<backend public domain>/ws`               |

Updating any of these on the web service triggers a **rebuild** (because they go in via build args). On the backend they only restart the container.

---

## 5. Smoke test

```bash
curl https://<backend public domain>/health
# expect: {"status":"ok"}

curl https://<web public domain>/
# expect: 200, Multica landing page HTML
```

Then open `https://<web public domain>/login` in a browser and try the email-code flow. Without `RESEND_API_KEY` the code is printed to the backend's Railway logs — grab it from there for the first login.

---

## Troubleshooting

**`pnpm could not be found` during Create container**
You hit nixpacks. Make sure **Settings → Build → Config-as-code Path** is set on the service. If empty, Railway ignores `railway.web.json` / `railway.backend.json` and falls back to nixpacks.

**`could not connect to database`**
Backend can't reach Postgres. Confirm `DATABASE_URL=${{Postgres.DATABASE_URL}}` (with the `${{...}}` reference syntax) — a literal copy-pasted URL won't be updated when Postgres rotates credentials.

**Web reaches backend but WebSocket fails**
You set `NEXT_PUBLIC_WS_URL` to the private domain. Browsers can't reach `*.railway.internal`. Use the **public** backend domain with `wss://`.

**Web can't reach backend (`fetch failed` in logs)**
`REMOTE_API_URL` is wrong. The service-name reference is **case-sensitive** (`${{backend.RAILWAY_PRIVATE_DOMAIN}}` only works if the backend service is literally named `backend`).

**`websocket: bad handshake` from browser**
`ALLOWED_ORIGINS` on backend doesn't include the web's public domain. Comma-separate multiple origins; no trailing slashes.

**Local file uploads disappear after redeploy**
Railway containers have ephemeral disks. Configure S3 + CloudFront variables on backend, or mount a Railway Volume at `/app/data` if you only need to survive redeploys (not multi-instance).
