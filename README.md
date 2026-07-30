# Sentinel

Personal remote laptop monitoring and control platform. Single-owner, not a SaaS product.

## Stack

- `backend/` — Node.js, Express, TypeScript, Prisma, Socket.IO
- `frontend/` — React, Vite, TypeScript, Tailwind CSS
- `agent/` — Rust Windows agent (not yet built)

Database is PostgreSQL running in Docker on the `sentinel-server` EC2 instance (not local, not RDS). Because Postgres is bound to `127.0.0.1` on that box only, every local `backend` command that touches the database requires an SSH tunnel running first.

---

## Prerequisites

- Node.js (LTS)
- The `sentinel-key.pem` SSH key for `sentinel-server`
- AWS Console access if you ever need to update the security group (e.g. after your IP changes)

---

## 1. Open the SSH tunnel to Postgres

Run this in its own terminal and leave it running for the entire dev session. It forwards `localhost:5432` on your machine to Postgres on the EC2 box:

```powershell
ssh -i sentinel-key.pem -N -L 5432:localhost:5432 ubuntu@3.91.172.118
```

`-N` means no remote shell is opened — the terminal will appear to hang with no output. That's correct; it means the tunnel is active.

**If the connection times out:** your public IP probably changed (common with residential ISPs). The EC2 security group (`sentinel-sg`) only allows SSH from your last known IP. Go to **AWS Console → EC2 → Security Groups → sentinel-sg → Edit inbound rules**, and update the source on the port 22 rule to **My IP**.

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

**"Can't reach database server at localhost:5432"**: the SSH tunnel from step 1 isn't running or has dropped. Restart it.

### Backend one-time setup (new machine / fresh database)

```powershell
cd backend
npx prisma generate
npx prisma migrate dev   # requires the SSH tunnel to be open
npm run seed              # creates the admin user + laptop agent device token
```

`npm run seed` prints the device token once — copy it somewhere safe, it's needed for the Rust agent later and cannot be retrieved again.

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

## Typecheck / build

```powershell
cd backend && npm run typecheck
cd frontend && npx tsc -b --noEmit
```

Both should report zero errors before committing.

---

## Order of operations, summarized

1. SSH tunnel (own terminal, leave running)
2. `cd backend && npm run dev` (own terminal, leave running)
3. `cd frontend && npm run dev` (own terminal, leave running)
4. Open `http://localhost:5173`

All three keep running simultaneously during development.
