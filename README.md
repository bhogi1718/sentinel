# Sentinel

Personal remote laptop monitoring and control platform. Single-owner, not a SaaS product.

**Live dashboard:** [http://54.83.231.177](http://54.83.231.177) — this is the real, deployed instance the laptop agent actually reports to. Use this to check on or control the laptop day-to-day.

`http://localhost:5173` (started via `npm run dev` in `frontend/`) is a separate local dev environment, proxied to a **local** backend on port 5000 — it has no connection to the real agent and will show "Device is not currently connected" unless you're specifically working on frontend code against a local backend. For anything device-related, use the live dashboard link above instead.

## Stack

- `backend/` — Node.js, Express, TypeScript, Prisma, Socket.IO
- `frontend/` — React, Vite, TypeScript, Tailwind CSS
- `agent/` — Rust Windows agent, runs as a Windows Service (`SentinelAgent`)

Database is PostgreSQL running in Docker on the `sentinel-server` EC2 instance (not local, not RDS). Because Postgres is bound to `127.0.0.1` on that box only, every local `backend` command that touches the database requires an SSH tunnel running first.

---

## Prerequisites

- Node.js (LTS)
- Rust toolchain (`rustup`, MSVC target) — only needed to build/modify the agent
- The `sentinel-key.pem` SSH key for `sentinel-server`
- AWS Console access if you ever need to update the security group (e.g. after your IP changes)
- A Telegram bot token + chat ID (optional — see [Telegram notifications](#telegram-notifications))

---

## 1. Open the SSH tunnel to Postgres

Run this in its own terminal and leave it running for the entire dev session. It forwards `localhost:5432` on your machine to Postgres on the EC2 box:

```powershell
ssh -i sentinel-key.pem -N -L 5432:localhost:5432 ubuntu@54.83.231.177
```

`-N` means no remote shell is opened — the terminal will appear to hang with no output. That's correct; it means the tunnel is active.

**If the connection times out:** the `sentinel-sg` security group's port 22 rule is open to `0.0.0.0/0` (SSH access is still gated by `sentinel-key.pem`, not by IP), so a changed public IP shouldn't be the cause anymore. Check instead whether the instance is running (**AWS Console → EC2 → Instances**) and whether `sentinel-key.pem` is the correct key for `sentinel-server`.

---

## 2. Start the backend

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

**"Can't reach database server at localhost:5432"**: the SSH tunnel from step 1 isn't running or has dropped. Restart it. This is the single most common failure in local dev — if the agent or backend suddenly can't connect to anything, check the tunnel first.

### Backend one-time setup (new machine / fresh database)

```powershell
cd backend
npx prisma generate
npx prisma migrate dev   # requires the SSH tunnel to be open
npm run seed              # creates the admin user + laptop agent device token
```

`npm run seed` prints the device token once — copy it somewhere safe, it's needed for the Rust agent (`agent/agent.toml`) and cannot be retrieved again. If lost, rotate it instead of re-seeding:

```powershell
npx tsx prisma/rotate-device-token.ts
```

---

## 3. Start the frontend

In a third terminal:

```powershell
cd frontend
npm install        # first time only
npm run dev
```

Runs on `http://localhost:5173`. Vite proxies `/api` and `/socket.io` to the backend on port 5000 automatically (see `frontend/vite.config.ts`), so no CORS setup is needed locally.

Open `http://localhost:5173` in a browser and log in with the admin email/password from `backend/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

---

## 4. The Rust agent

The agent reports system events (boot, lock/unlock, sleep/wake, network, battery) to the backend. It runs as a **Windows Service** (`SentinelAgent`) so it doesn't need a terminal open, auto-starts on boot, and auto-reconnects if the backend or tunnel drops.

### One-time setup

1. Copy `agent/agent.toml.example` to `agent/agent.toml`
2. Fill in `server_url` (e.g. `http://localhost:5000` for local dev) and `device_token` (from the seed/rotate script above)

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

1. SSH tunnel (own terminal, leave running)
2. `cd backend && npm run dev` (own terminal, leave running)
3. `cd frontend && npm run dev` (own terminal, leave running)
4. Agent: either already running as the `SentinelAgent` Windows Service (nothing to start), or `cd agent && cargo run` in its own terminal for development
5. Open `http://localhost:5173`

Terminals 1–3 are local-dev-only conveniences; once the backend and frontend are deployed to the EC2 instance, they run there permanently and none of this local juggling is needed. The agent's Windows Service already works this way today — no terminal required on your laptop.
