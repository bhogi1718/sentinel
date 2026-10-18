# Sentinel Product Audit

Date: 2026-10-17. Goal: assess readiness to become a commercial multi-tenant SaaS.
Method: read the Prisma schema, auth, socket namespaces, command/file/stream/settings services, rate limiting, the Rust agent (executor, config, process kill, file path safety, helper IPC), and the frontend token storage. Ran backend typecheck, eslint, vitest with coverage, `npm audit` (backend and frontend), and `cargo test`.

Not covered: the live Render/Vercel/Neon deployment, the frontend components and UX, `socket_client.rs` beyond a grep, the install scripts, and Neon/Render configuration. Findings below are from code, not from probing production.

## Verdict

The engineering fundamentals are good for a one-person project: clean layering, Zod validation, timeouts on every agent round trip, a canonicalizing path-safety check, a PID-reuse guard on process kill, graceful reconnect handling. It is **not** ready for SaaS. The whole system assumes one owner and one device, so the first customer to sign up would see the second customer's data. Several of the fixes are not features to add but assumptions to remove.

## Scorecard

| Area | Status |
| --- | --- |
| Code health (backend) | Good. `tsc` clean, eslint clean, 57 tests pass |
| Test coverage | Weak. Backend 22% line coverage, frontend has no tests, agent has 5 tests |
| CI/CD | Missing. No `.github/`, deploys are manual |
| Multi-tenancy | Absent. See Critical findings |
| Account system | Minimal. Login, refresh, logout, change password only |
| Billing, onboarding, email | Absent |
| Security posture | Reasonable for a private tool, insufficient for hostile multi-tenant use |
| Legal/abuse risk | High. See C6 |
| Observability | Basic. Winston to files, `/health` does not check the DB |

## Critical (blocks SaaS)

**C1. Single-tenant data model.** `User`, `Settings` and the device lookup are singletons. `Event`, `Command` and `Device` have no owner. There is no organization or account id on any table. Files: `backend/prisma/schema.prisma`.

**C2. Cross-tenant data leakage in realtime.** `broadcastEventToDashboards`, `broadcastDeviceStatus`, `broadcastCommandUpdate` and `broadcastStreamState` emit to the entire `/dashboard` namespace. Live-view frames go to one global `live-viewers` room. With two customers connected, each would receive the other's events, command updates and screen frames. File: `backend/src/realtime/socket.ts`.

**C3. Global singletons assume one device.** `deviceRepository.findFirst()` is how commands, files, metrics, processes, screenshots and streams pick their target (`command.service.ts`, `file.service.ts`, `stream.service.ts`). `stream.service.ts` keeps one module-level `state`, so a second user starting a live view joins the first user's session. Any dashboard user can start the stream with no authorization check (`dashboardNamespace.ts`).

**C4. State lives in process memory.** Pending-command, pending-file, pending-download and latest-socket maps, the stream state, the rate limiters and the socket server are all in-memory. This forces a single backend instance. A restart or deploy drops in-flight work, and horizontal scaling needs a Redis adapter and shared limiters.

**C5. No device enrollment.** A device token comes from `prisma/seed.ts` or `rotate-device-token.ts` and is pasted by hand into `agent.toml`. SaaS needs a pairing-code flow, per-device revocable tokens, and an installer. The agent is currently installed by a PowerShell script that builds from Rust source.

**C6. Covert surveillance risk.** The agent can stream the screen, take screenshots, browse files and kill processes, and `show_view_indicator = false` in `agent.toml` turns off the on-screen "being viewed" banner (`agent/src/config.rs`, `helper_main.rs`). Sold as SaaS, that is stalkerware-shaped. It also invites antivirus flagging, payment-processor refusal and app-store/host takedowns. The indicator must become mandatory, with visible install, consent and an uninstall path, plus Terms of Service that prohibit monitoring devices you do not own or have consent for. Get a lawyer's review before launch.

## High

**H1. Live sockets never re-authenticate.** `dashboardNamespace.ts` verifies the JWT only at handshake. A user who is removed, changes their password, or whose session was revoked keeps a live socket, and can keep watching the stream, indefinitely. Same for agents: revoking a device token does not disconnect it.

**H2. Refresh token in `localStorage`** (`frontend/src/api/tokenStorage.ts`), lifetime 30 days. Any XSS steals a long-lived session. Move to an httpOnly, SameSite cookie. There is also **no refresh-token reuse detection**: a replayed revoked token is simply rejected, so a thief and the user can silently rotate in parallel; reuse should revoke the whole token family.

**H3. Download auth puts a JWT in the URL.** `authGuardQuery` accepts the access token as `?token=` for file downloads, so a live token lands in Render/proxy logs and browser history. Replace with a short-lived single-use download ticket.

**H4. No audit trail of who did what.** *(Fixed: commands record who sent them, and screenshots, live views, file listings, downloads and commands are written to an append-only audit log that Owners and Admins can read, kept 90 days. See docs/architecture/audit-log.md.)* `Command` records the device and time but not the requesting user. Screenshots, live views, file listings and file downloads are not logged at all. Commercial customers (and any abuse investigation) need an append-only audit log.

**H5. Credential and secret handling.**
- Telegram bot token is stored as plaintext in the `settings` table.
- The device token sits in plaintext in `agent.toml`, and the agent runs as LocalSystem. Store it with DPAPI or the Windows credential store.
- `.env` secrets are shared between dev and prod per earlier notes; separate them.

**H6. No lockout and weak abuse controls.** Rate limiting is per-IP and in-memory (10 auth attempts per 15 minutes). There is no per-account lockout, no 2FA, no email verification, no password reset (a deliberate single-admin choice that does not survive SaaS). Login returns early when the email is unknown but runs bcrypt when it is known, so response time reveals which emails are registered (`auth.service.ts`).

**H7. No authorization model.** One role. SaaS needs organization owner/admin/member/viewer, and per-command permissions (a viewer should not be able to shut down a machine).

**H8. Helper pipe is reachable by any interactive user.** *(Fixed: the pipe now grants access only to SYSTEM and the helper's own user.)* `PIPE_SECURITY_DESCRIPTOR_SDDL = D:(A;;GA;;;SY)(A;;GA;;;IU)` grants Generic All to the INTERACTIVE group, so any local interactive user or process can connect and request screenshots, stream frames or annotation overlays, not only the agent service (`agent/src/helper_ipc.rs`). Restrict to SYSTEM plus the specific logged-in user's SID, or add a handshake.

**H9. No CI and thin tests.** Backend coverage is 22% overall. No frontend tests. No integration tests against a real database, no end-to-end test, and the socket namespaces (the riskiest code) are untested. Nothing prevents a broken deploy.

## Medium

- **M1. Dependency vulnerabilities.** Backend `npm audit --omit=dev`: 8 (2 critical, 3 high, 3 moderate), all through `bcrypt` to `@mapbox/node-pre-gyp` to `tar`; install-time rather than runtime-reachable, and `npm audit fix` reports a fix. Frontend: 3 high (axios, react-router-dom). Run the fixes and turn on Dependabot.
- **M2. One 50 MB message cap for everyone.** `maxHttpBufferSize` is 50 MB on all connections, including dashboards. In a multi-tenant system a malicious or buggy client can force large allocations; give agents and dashboards separate limits and per-tenant quotas.
- **M3. Request IDs are not bound to a device.** Responses are matched by `requestId` alone (`resolveResponse`, `handleDownloadChunk`). Any connected agent that learned a UUID could answer another tenant's request. Bind each pending request to the device (and tenant) that was asked.
- **M4. Download cleanup.** `fileController.download` does not stop the agent when the browser disconnects early (no `req.on("close")`), so the pending entry waits for its timeout. `Content-Disposition` wraps `encodeURIComponent` output in `filename="..."`, which gives wrong names for non-ASCII; use `filename*=UTF-8''...`.
- **M5. `/health` only returns "ok"**; it does not check the database, so Render will route traffic to an instance that cannot reach Neon.
- **M6. Logging.** Winston writes to files on a host with an ephemeral disk. Log structured JSON to stdout and ship to a log service; add request IDs and error tracking (Sentry).
- **M7. Agent distribution.** No code signing, no MSI installer, no auto-update, Windows only. A signed installer and update channel are table stakes; an unsigned binary that does remote control will be flagged by SmartScreen and antivirus.
- **M8. Data lifecycle.** Events are kept forever. No retention policy, no export, no account/device deletion cascade story, no GDPR/CCPA tooling. (Positive: screenshots and frames are relayed, not stored, which is a good privacy default to keep.)
- **M9. Telegram is the only notification channel**, configured globally. Per-user/per-org channels, email, push and quiet hours are needed.

## Low

- Settings page and README still describe a "single admin"; `README.md` says "not a SaaS product".
- `vitest.config.ts` triggers a Vite warning about CJS/ESM config.
- Command history has no pagination or filtering on the API.
- Event types are a fixed enum, so adding one needs a migration.
- JWT is HS256 with a shared secret; fine now, but move to rotating keys (or asymmetric) when more services appear.

## What is already good (keep it)

- Layered modules with Zod validation on inputs and agent payloads.
- Agent never trusts the backend for file paths (`resolve_within_root` canonicalizes and rejects traversal).
- Kill-process re-checks the name against the PID and refuses Sentinel's own processes.
- Every agent request has a timeout, and the agent bounds helper-pipe calls with `run_with_timeout`.
- Refresh tokens are hashed at rest and single-use rotated; bcrypt cost 12; helmet and CORS configured.
- Persist-before-broadcast event design; stale-disconnect handling.
- Per-endpoint rate limits on the expensive actions.

## Recommended order

1. **Multi-tenant foundation:** `Organization` and `Membership`, `orgId` on `Device`/`Event`/`Command`/`Settings`, repository-level scoping, Socket.IO rooms per org and device, remove `findFirst()`, per-device stream state, bind pending requests to devices. (C1 to C3, M3.) Add a cross-tenant isolation test suite first.
2. **Accounts:** sign-up, email verification, password reset, 2FA, roles, cookie sessions with reuse detection, socket re-auth and forced disconnect. (H1, H2, H6, H7.)
3. **Device enrollment and agent packaging:** pairing code, per-device tokens, signed MSI, auto-update, mandatory consent indicator, DPAPI token storage, pipe ACL fix. (C5, C6, H5, H8, M7.)
4. **Audit log, download tickets, secret encryption, dependency fixes.** (H3, H4, H5, M1.)
5. **CI/CD and tests:** GitHub Actions, integration and end-to-end tests, coverage gates, staging environment. (H9.)
6. **Scale and ops:** Redis (socket adapter, rate limits, pending requests), health checks, logging and error tracking, backups. (C4, M2, M5, M6.)
7. **Billing and product:** Stripe per-device plans, onboarding, notification channels, retention and export, legal pages. (M8, M9, C6.)
