# Sentinel

Personal remote laptop monitoring and control platform. Single-owner, not a SaaS product.

**Live dashboard:** your Vercel deployment URL (e.g. `https://sentinel.vercel.app`) — this is the real, deployed instance the laptop agent actually reports to. Use this to check on or control the laptop day-to-day.

`http://localhost:5173` (started via `npm run dev` in `frontend/`) is a separate local dev environment, proxied to a **local** backend on port 5000 — it has no connection to the real agent and will show "Device is not currently connected" unless you're specifically working on frontend code against a local backend. For anything device-related, use the live dashboard link above instead.

## Stack

- `backend/` — Node.js, Express, TypeScript, Prisma, Socket.IO — deployed on **Render** (web service)
- `frontend/` — React, Vite, TypeScript, Tailwind CSS — deployed on **Vercel**
- `agent/` — Rust Windows agent, runs as a Windows Service (`SentinelAgent`)
- Database — PostgreSQL on **Neon** (serverless, reachable directly over TLS — no SSH tunnel needed, locally or in production)

See [Deployment](#deployment) for how the hosted pieces are set up.

---

## Prerequisites

- Node.js (LTS)
- Rust toolchain (`rustup`, MSVC target) — only needed to build/modify the agent
- A Neon account + connection string (free tier — see [Deployment](#deployment))
- A Telegram bot token + chat ID (optional — see [Telegram notifications](#telegram-notifications))

---

## 1. Start the backend

In a second terminal:

```powershell
cd backend
npm install        # first time only
npm run dev
```

Runs on `http://localhost:5000`. Confirm it's up:

```powershell
curl http://localhost:5000/health
```

**"Port 5000 already in use"**: something is already listening (often an orphaned process from a previous session). Find and stop it:

```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
Stop-Process -Id <PID> -Force
```

**Can't reach the database**: check `DATABASE_URL` in `backend/.env` against your Neon connection string (Neon dashboard → your project → Connection Details), and that it ends in `?sslmode=require`.

### Backend one-time setup (new machine / fresh database)

```powershell
cd backend
npx prisma generate
npx prisma migrate dev
npm run seed              # creates the admin user + laptop agent device token
```

`npm run seed` prints the device token once — copy it somewhere safe, it's needed for the Rust agent (`agent/agent.toml`) and cannot be retrieved again. If lost, rotate it instead of re-seeding:

```powershell
npx tsx prisma/rotate-device-token.ts
```

---

## 2. Start the frontend

In a third terminal:

```powershell
cd frontend
npm install        # first time only
npm run dev
```

Runs on `http://localhost:5173`. Vite proxies `/api` and `/socket.io` to the backend on port 5000 automatically (see `frontend/vite.config.ts`), so no CORS setup is needed locally.

Open `http://localhost:5173` in a browser and log in with the admin email/password from `backend/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

---

## 3. The Rust agent

The agent reports system events (boot, lock/unlock, sleep/wake, network, battery) to the backend. It runs as a **Windows Service** (`SentinelAgent`) so it doesn't need a terminal open, auto-starts on boot, and auto-reconnects if the backend drops.

### One-time setup

1. Copy `agent/agent.toml.example` to `agent/agent.toml`
2. Fill in `server_url` (`http://localhost:5000` for local dev, or your Render backend's `https://...onrender.com` URL for production) and `device_token` (from the seed/rotate script above)

### Install as a service (recommended)

From an **elevated (Administrator)** PowerShell:

```powershell
cd agent
.\scripts\install-service.ps1
```

Builds the release binary, registers the service with auto-start and auto-restart-on-failure, and starts it immediately. Re-running this script is safe — it stops, reconfigures, and restarts the existing service.

Logs go to `agent/target/release/sentinel-agent.log.<date>` (the service has no console).

To remove it:

```powershell
cd agent
.\scripts\uninstall-service.ps1
```

### Run interactively instead (development)

```powershell
cd agent
cargo run
```

Same binary, same logic — it detects it wasn't launched by the Windows Service Control Manager and falls back to console mode automatically. Useful when iterating on agent code, since you get live logs and Ctrl+C to stop. Logs go to stdout instead of a file in this mode.

---

## Deployment

Three free, indefinite (not time-boxed trial) tiers: **Neon** (database), **Render** (backend), **Vercel** (frontend). All dashboard-driven — no CLI provisioning.

### 1. Database — Neon

1. Create an account at [neon.tech](https://neon.tech), create a project (any region close to your Render region).
2. **Dashboard → Connection Details** → copy the connection string (toggle **Pooled connection** off — a single always-running backend doesn't need PgBouncer). It looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.
3. Keep this for the backend's `DATABASE_URL` in the next step.

### 2. Backend — Render

1. Create an account at [render.com](https://render.com), connect your GitHub account, **New → Web Service**, pick this repo.
2. **Root Directory:** `backend`. **Runtime:** Node. **Build Command:** `npm ci && npm run build` (`npm ci` installs exactly what's in `package-lock.json` — no surprise version drift on a fresh install; `build` already runs `prisma generate` internally). **Start Command:** `npm run prisma:deploy && npm run start`.
3. **Instance type:** Free.
4. Add environment variables (**Environment** tab) — same keys as `backend/.env.example`: `DATABASE_URL` (from Neon above), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` (your Vercel URL — you'll add this after step 3, can update later), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEVICE_NAME`, `NODE_ENV=production`.
5. Deploy. Once live, note the assigned URL (`https://<something>.onrender.com`) — this is your `server_url` for the agent and the base for `RENDER_BACKEND_URL` below.
6. Run the one-time seed against the new database: from your machine, temporarily point `backend/.env`'s `DATABASE_URL` at the same Neon connection string and run `cd backend && npm run seed` (prints the device token once — save it for the agent).

### 3. Frontend — Vercel

1. Create an account at [vercel.com](https://vercel.com), connect GitHub, **Add New → Project**, pick this repo.
2. **Root Directory:** `frontend`. Framework preset: Vite (auto-detected).
3. Add environment variables: `VITE_API_BASE_URL` and `VITE_SOCKET_URL`, both set to your Render backend URL from step 2.5 (no trailing slash).
4. Deploy. Note the assigned URL (`https://<something>.vercel.app`).
5. Back on Render: update `CORS_ORIGIN` to include this Vercel URL (comma-separated if you keep `http://localhost:5173` too for local dev against prod), e.g. `https://sentinel.vercel.app,http://localhost:5173`. Redeploy the backend for it to take effect.

### 4. Keep the backend awake (free tier)

Render's free web service sleeps after ~15 minutes idle, which would drop the agent's persistent connection. `.github/workflows/keep-alive.yml` pings `/health` every 10 minutes to prevent that.

1. **GitHub repo → Settings → Secrets and variables → Actions → Variables → New repository variable**
2. Name: `RENDER_BACKEND_URL`, Value: your Render URL from step 2.5 (no trailing slash)
3. Confirm it's running: **Actions tab → Keep Render backend awake → Run workflow** (manual trigger), should succeed immediately.

**Gotcha:** GitHub disables scheduled workflows after 60 days of repo inactivity. If the agent suddenly starts showing long "offline" stretches after a quiet period, check **Actions** and re-enable the workflow before assuming something broke.

### 5. Point the agent at production

Update `agent/agent.toml`'s `server_url` to the Render URL from step 2.5, then reinstall the service (`cd agent && .\scripts\install-service.ps1`, elevated).

---

## Telegram notifications

Optional. If configured, every event also sends a message to your Telegram chat. Configured entirely in-app now (Settings → Integrations → Connect) — no `.env` edit or redeploy needed, and it can be disconnected the same way.

1. Create a bot via [@BotFather](https://t.me/BotFather) (`/newbot`) — **never share the resulting token**, treat it like a password
2. Message your new bot once (e.g. `/start`)
3. Fetch your chat ID:
   ```powershell
   Invoke-RestMethod -Uri "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates" | ConvertTo-Json -Depth 10
   ```
   Look for `"chat": { "id": ... }` in the response.
4. On the dashboard's Settings page, click **Connect** under Telegram Alerts and paste in the bot token and chat ID. The backend sends a real test message before saving, so a wrong chat ID fails immediately instead of silently sitting broken.

The bot token and chat ID are stored in the database (`Settings` table), not `.env` — connecting is optional, the app runs fine without it, notifications are just silently skipped until connected.

---

## Typecheck / build

```powershell
cd backend && npm run typecheck
cd frontend && npx tsc -b --noEmit
cd agent && cargo build
```

All three should report zero errors before committing.

---

## Order of operations, summarized

1. `cd backend && npm run dev` (own terminal, leave running)
2. `cd frontend && npm run dev` (own terminal, leave running)
3. Agent: either already running as the `SentinelAgent` Windows Service (nothing to start), or `cd agent && cargo run` in its own terminal for development
4. Open `http://localhost:5173`

These two terminals are local-dev-only conveniences; once deployed, Render and Vercel run the backend and frontend permanently and none of this local juggling is needed. The agent's Windows Service already works this way today — no terminal required on your laptop.
