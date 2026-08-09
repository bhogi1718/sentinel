# Sentinel Audit Report

Scope: full repository at `c:\Users\charan tej\OneDrive\Desktop\sentinel` — backend (Node/Express/TS/Prisma), frontend (React/Vite/TS), agent (Rust Windows Service + companion helper), infrastructure. Four independent deep-read audits were run in parallel (backend, frontend, agent, DevOps/security), each verifying claims directly against source, git history, and live command output rather than assuming anything exists. This report synthesizes and cross-references all four.

---

## Overall Completion

**Percentage complete: ~70%** of a genuinely production-hardened single-user deployment (core functionality is essentially done; hardening, testing, and deployment infrastructure are the gap).

**Overall status:** Functionally complete for personal use, actively developed, ~10-15 days old. Every module that exists works correctly and was verified live against the real laptop/dashboard this session. The gap to "production-ready" is concentrated in deployment infrastructure (no Nginx/PM2 config in-repo), test coverage (4 tests total, repo-wide), and a handful of concrete, cheaply-fixable bugs (HANDLE leaks, one stale binary, unescaped Telegram HTML, JWT-in-logs).

**Ready for production:** **Conditionally yes**, for its actual intended scope — a single-owner personal tool, not a multi-tenant SaaS. Not ready for any deployment with real adversarial pressure (no test coverage on the highest-blast-radius code, deployment infra undocumented/unimplemented in-repo, one already-fixed bug not yet redeployed).

---

## Completed Features

- **Auth**: Single-admin JWT login/refresh/logout, bcrypt password hashing (cost 12), hashed+revocable refresh tokens with rotation, no registration endpoint (verified structurally impossible, not just absent).
- **Device registration & heartbeat**: Device token auth over Socket.IO `/agent` namespace, online/offline status broadcast to dashboard.
- **Event logging**: Boot, Shutdown, Sleep, Wake, Lock, Unlock, Internet connected/disconnected, Battery low — all detected via real Win32 mechanisms (not stubbed), persisted, paginated, filterable, live-streamed to dashboard via Socket.IO.
- **Telegram notifications**: Real integration, event-driven, includes corrected occurredAt timestamps (this session's fix).
- **Remote commands**: Lock, Restart, Shutdown, Sleep, LogOff — all five implemented with correct session-targeting/privilege-enabling workarounds for LocalSystem-service constraints, confirmed working live.
- **Process management**: Live process list (PID/name/CPU/memory) plus a genuine Apps/Background split via a companion-process architecture (built this session after three Win32-only approaches hit real Session-0 isolation boundaries) — verified working end-to-end through the real service.
- **File browsing**: Browse + download only (upload/delete deliberately out of scope), path-traversal protected on the agent (the actual enforcement boundary) with backend defense-in-depth, chunked streaming download verified byte-identical on files up to ~735KB.
- **System metrics**: CPU%, memory, disk, network throughput (+ since-boot totals), battery, ping — all live, 5s-polled, verified against real system state.
- **Dashboard/Device/Events/Files/Processes pages**: All fully functional, not stubs (verified by direct read — the only unused stub component, `ComingSoon.tsx`, is dead code referenced nowhere).
- **Reconnect resilience**: A real bug (rust_socketio's silent zombie-connection failure mode) was found and fixed this session, with the fix verified covering all 9 emit call sites in the agent.
- **Design system**: Consistent dark theme, token-based styling, zero hardcoded colors found across the entire frontend.

---

## Missing Features

- **Screenshots** — never started (explicitly deferred, next planned module).
- **File upload / delete / create-folder** — deliberately out of scope for the current File Browsing module (browse+download only, by design).
- **AnyDesk-style live remote control / screen streaming** — explicitly deferred as its own future multi-session effort (WebRTC/TURN/H.264 encoding).
- **Restart vs. Shutdown event distinction** — `EventType::Restart` exists in the schema but is never constructed; OS-initiated restarts are indistinguishable from shutdowns in event history (confirmed by both the compiler's dead-code warning and manual trace).
- **In-app Settings** — page exists but every actual setting (change password, connect Telegram) is a disabled stub requiring manual `.env` edits + redeploy; only working control is Log Out.
- **Automated testing** — 4 unit tests total across the entire repo (agent only: path-safety, process-classification); zero on backend or frontend. No test runner even installed for backend/frontend.
- **Deployment infrastructure as code** — no Nginx config, no PM2/ecosystem config, no CI/CD anywhere in the repo, despite backend code (`trust proxy: 1`) assuming a reverse proxy exists.
- **Database backup strategy** — none exists (no script, cron, or docs).
- **Heartbeat/staleness detection** — `isOnline` relies purely on Socket.IO connect/disconnect; no independent timeout sweep if a connection dies without a clean disconnect event.

---

## Bugs Found

### Critical
*(none found)*

### High
1. **Deployed agent binary predates the false-BOOT-detection fix.** `sentinel-agent.exe` on disk is dated before commit `f9ffdf0`; the fix is only live in source, not in the currently-running service, until rebuilt and redeployed. — *Agent, Point 2*
2. **`npm run lint` is completely broken in the backend.** ESLint 9 is installed (flat-config-only) but no `eslint.config.js`/`.mjs`/`.cjs` exists anywhere — the lint quality gate has silently never run. — *Backend, `backend/package.json:11`*
3. **Dashboard and Device pages have zero error-state handling.** If `/device/status` or `/device/metrics` fail, these two pages show stale placeholder dashes forever with no indication anything is wrong and no retry — inconsistent with Files/Processes, which handle this correctly. — *Frontend, `DashboardPage.tsx`, `DevicePage.tsx`*
4. **No responsive layout inside any page body.** Grep for Tailwind responsive prefixes (`md:`, `sm:`) across all of `frontend/src/features/*` returns zero matches — only nav chrome (sidebar vs. bottom-nav) adapts; grids/tables are fixed mobile-width and unchanged on desktop. — *Frontend, all feature pages*
5. **No test coverage on the highest-blast-radius code.** Remote commands (Lock/Restart/Shutdown/Sleep/LogOff) and file download (arbitrary read + exfiltration surface) have zero automated tests on the backend side; only 4 tests exist repo-wide. — *Cross-cutting*

### Medium
1. **Two Win32 HANDLE leaks in `executor.rs`** on early-return error paths: `enable_privilege` leaks `process_token` if `LookupPrivilegeValueW` fails (`:70-71` vs. cleanup at `:90`); `lock_workstation` leaks `user_token` if `enable_privilege` or `DuplicateTokenEx` fails (`:136`, `:139-147` vs. cleanup at `:172`). Cumulative over service uptime, not acutely dangerous. — *Agent, Point 12*
2. **Boot-marker write failure silently degrades back to the original bug** — if `std::fs::write` to `last_boot.txt` ever fails, every subsequent restart re-triggers duplicate BOOT events indefinitely with no retry/alerting. — *Agent, Point 2*
3. **No backend heartbeat/staleness sweep** — `isOnline` can be wrong indefinitely if a socket dies without a clean `disconnect` firing (engine.io ping/pong is the only backstop, on library defaults). — *Agent/Backend, Point 3*
4. **Named pipe has no explicit DACL** — `\\.\pipe\SentinelAgentHelper` relies entirely on Windows default ACLs plus tokio's `reject_remote_clients=true`; any local authenticated user could in principle connect (low-sensitivity data returned, but a missing defense-in-depth control on a privileged-adjacent IPC channel). — *Agent, Point 8*
5. **TOCTOU gap in file downloads** — path validation (`path_safety.rs`) and the actual file open happen in separate `spawn_blocking` calls; a symlink swapped in between could redirect the download outside `browse_root`. No test coverage for the symlink-escape case the canonicalize check exists to catch. — *Agent, Point 9*
6. **JWT access token can leak into server logs.** `errorHandler.ts`'s catch-all branch logs the full request URL (including `?token=...` for `/files/download`) on any unhandled exception — a concrete, evidenced path to a live token landing in plaintext log files. Mitigated by the 15-minute access-token expiry. — *DevOps/Backend, Point 12*
7. **No dedicated rate limiter on file download / processes / metrics endpoints** — only the shared 300-req/15-min global limiter applies; combined with no size/concurrency cap on downloads, a valid session could open many large concurrent downloads. — *DevOps, Points 9 & 13*
8. **No PM2/process-supervisor config anywhere in the repo** — the backend has no auto-restart-on-crash mechanism (contrast: the Rust agent explicitly has this via Windows Service auto-restart). — *DevOps, Point 5*
9. **Refresh token stored in `localStorage`** — readable by any injected script; access token is correctly kept in-memory only, but the 30-day refresh token in localStorage is a real XSS-exfiltration target. — *Frontend, Point 8*
10. **Duplicated "plain-event-plus-reply" pending-request logic** across `command.service.ts`, `process.service.ts`, `metrics.service.ts` (near-identical 15-line Map+timeout+resolve pattern, 3x). Not a correctness bug, a maintainability one. — *Backend, Point 13*
11. **`ProcessesPage` re-sorts its full list on every render**, outside the `useMemo` that computes `filteredProcesses` — a real (if minor) missed-memoization bug. — *Frontend, Point 12*
12. **`FilesPage` folder rows are not keyboard-operable** — `role="button"` is set but there's no `onKeyDown` handler for Enter/Space, a genuine WCAG 2.1.1 failure. — *Frontend, Point 6*

### Low
- `EventType::Restart` is dead code (compiler-confirmed) — OS-restarts always report as `SHUTDOWN`.
- Boot-time computed via second-rounded `now - uptime` has a narrow theoretical duplicate-BOOT race from tick/clock jitter.
- Agent log files rotate daily with no retention cap (unbounded long-term growth; currently ~294KB, not yet a problem).
- `report_event` doesn't force a reconnect on ack-timeout-after-successful-emit (only on outright emit failure).
- `.lock().unwrap()` mutex-poisoning risk in `socket_client.rs` (trivial critical sections, low practical risk).
- `jwt.verify` doesn't pin `algorithms: ["HS256"]`; the `type: "access"/"refresh"` discriminator is defined but never checked at verify time (not currently exploitable — separate secrets prevent cross-use).
- `GET /api/device/files` directory listing has no cap/pagination on entry count.
- `formatEventMessage` interpolates `deviceName` into Telegram HTML unescaped (currently no attacker-reachable path).
- No compound index supports filtering `Event` by `type` alone (only `[deviceId, occurredAt]` exists).
- `ComingSoon.tsx` component is fully unused dead code.
- Byte/memory-formatting logic duplicated 3x across Device/Files/Processes pages instead of one shared utility.
- Post-login redirect-to-original-page is dead code (`location.state.from` is read but never set).
- No true 404 page — catch-all silently redirects to Dashboard.
- README has a stray literal-text artifact (`#   s e n t i n e l`) at the bottom.

---

## Security Issues

Ranked by real-world exploitability given this app's actual threat model (single-owner, JWT-gated, no public registration):

1. **Medium** — JWT access token leakage into plaintext logs via unhandled-exception URL logging on the file-download route (cheap fix: redact `token` param before logging).
2. **Medium** — Refresh token in `localStorage` (XSS-exfiltration target); access token is correctly in-memory only.
3. **Medium** — No dedicated rate limit + no size/concurrency cap on file downloads (resource-exhaustion angle, not data-exposure).
4. **Medium** — Named pipe with no explicit DACL (local-privilege-adjacent, low-sensitivity data returned).
5. **Medium** — TOCTOU window between path validation and file open in the download flow.
6. **Low** — `jwt.verify` doesn't pin algorithm explicitly (not currently exploitable, best-practice gap).
7. **Low** — Unescaped `deviceName` in Telegram HTML messages (no attacker-controlled path today).
8. **Low** — EC2 IP and DB username are public in the repo (README/example files) — minor OPSEC, mitigated by IP-allowlisted security group.
9. **Clean, verified directly**: No SQL injection surface (100% Prisma, zero raw SQL). No secrets ever committed to git history (verified across full history). `.env` properly gitignored with a matching secret-free `.env.example`. Both Socket.IO namespaces (`/agent`, `/dashboard`) are structurally impossible to reach unauthenticated. Path-traversal defense on file browsing is genuinely two-layered (component rejection + canonicalize+starts_with) and sound apart from the TOCTOU gap above. No registration endpoint exists (structurally, not just by omission).

---

## Performance Issues

1. **High** — No route-based code splitting anywhere in the frontend (`React.lazy` unused) and no `manualChunks` config — a single ~609KB JS bundle loads before Login can render, regardless of route.
2. **Medium** — The checked-out `frontend/dist/` build artifact is ~9 days stale relative to current source (9 modified files postdate it) — no evidence a fresh, verified production build has been run recently.
3. **Low/Medium** — `ProcessesPage` sorts its full process list inline in JSX on every render, outside its `useMemo`.
4. **Low** — Agent log files have no retention cap (unbounded growth over a long-lived deployment).
5. **Clean, verified directly**: No N+1 query patterns anywhere in the backend. The one real DB-backed list endpoint (`/events`) properly paginates with a capped page size. File downloads stream chunk-by-chunk without buffering the whole file in memory on either the agent or backend side. No blocking/synchronous hot-path operations found in request handlers.

---

## UI / UX Issues

1. **High** — No responsive design at the page-content level (only nav chrome adapts; all grids/tables are fixed mobile-width, unchanged on desktop).
2. **High** — Dashboard/Device pages silently fail with no error UI if their core queries error out.
3. **Medium** — Icon-only controls (pagination, refresh, download) largely lack `aria-label`; `FilesPage` folder rows aren't keyboard-operable.
4. **Low** — No true 404 page; post-login "return to originally requested page" is dead/unwired code.
5. **Well-implemented, verified directly**: Fully consistent design-token usage across every page (zero hardcoded colors found). Danger actions consistently pair color with icon+text, never color-alone. Files and Processes pages correctly implement all three of loading/error+retry/empty states. Page-transition animations are consistently applied app-wide via the shared layout wrapper, not per-page.

---

## Code Quality Issues

1. **High** — Backend `npm run lint` is non-functional (missing ESLint 9 config file).
2. **Medium** — Duplicated pending-request-tracking logic across three backend service files (command/process/metrics).
3. **Low** — Byte-formatting logic duplicated 3x across frontend pages instead of a shared utility.
4. **Low** — Stat-tile and empty/error-state JSX is structurally copy-pasted across pages rather than componentized.
5. **Well-implemented, verified directly**: Backend and frontend both typecheck cleanly under strict TypeScript configs (backend: `strict`, `noImplicitAny`, `strictNullChecks`, etc. all on) with **zero** `any`/`@ts-ignore` usage found anywhere in either codebase. Zero TODO/FIXME/HACK comments in backend, frontend, or agent. Rust agent builds and clippy-lints clean apart from one dead-code warning and one cosmetic style lint. Backend module structure, while not perfectly uniform, follows a defensible, internally-consistent pattern (RPC-style modules skip repositories by design).

---

## Suggested Improvements (Prioritized)

1. **Rebuild and redeploy the agent** — the false-BOOT-detection fix isn't live yet; this is a one-command fix with outsized impact.
2. **Fix the backend ESLint config** — add `eslint.config.js`; the lint gate has been silently broken.
3. **Fix the two HANDLE leaks in `executor.rs`** — restructure `enable_privilege`/`lock_workstation` to close handles on every early-return path (e.g., via a small RAII guard or explicit cleanup-and-return blocks).
4. **Redact `token` from logged URLs** in `errorHandler.ts` before it can reach disk.
5. **Add error states to Dashboard/Device pages** — reuse the existing Files/Processes pattern (`isError` + retry).
6. **Add a dedicated rate limiter + concurrency/size cap to file downloads.**
7. **Write tests for remote commands and file download** on the backend — the two highest-blast-radius features currently have zero coverage.
8. **Add real responsive breakpoints to page content** — start with the grids on Dashboard/Device and the Processes table.
9. **Move the refresh token out of `localStorage`** — httpOnly cookie is the standard mitigation, though this requires backend cookie-handling work.
10. **Commit an Nginx config + PM2 ecosystem file to the repo** — the code already assumes both exist; make that assumption real and documented.
11. **Set up a Postgres backup cron** — cheap insurance against total data loss on a single EC2 instance.
12. **Close the TOCTOU gap in file downloads** — re-validate the canonical path immediately before the actual file open, or open via a handle obtained atomically with the validation where feasible.
13. **Add a DACL to the helper's named pipe** — restrict to the specific SYSTEM + interactive-user SIDs rather than the Windows default.
14. **Distinguish Restart from Shutdown** in event reporting — wire the already-defined `EventType::Restart` variant.
15. **Run `cargo install cargo-audit && cargo audit`** — the agent's dependency tree has never been checked for known vulnerabilities.
16. **Add route-based code splitting** (`React.lazy`) to cut the initial bundle size.

---

## Final Score

| Category | Score |
|---|---|
| Architecture | 8/10 |
| Security | 6/10 |
| Frontend | 7/10 |
| Backend | 8/10 |
| Laptop Agent | 7/10 |
| UI/UX | 7/10 |
| Performance | 6/10 |
| Maintainability | 7/10 |

**Overall: 71/100**

*(Architecture and backend score highest — genuinely sound, layered design decisions verified throughout, e.g. refresh-token rotation, Socket.IO namespace auth, path-traversal defense-in-depth. Security and Performance score lowest — not because of any single severe flaw, but because of an accumulation of real, evidenced Medium-severity gaps (JWT-in-logs, no download rate/size limits, TOCTOU window, unbundled JS) each individually minor but collectively meaningful for a "production-ready" bar, plus the near-total absence of automated tests. This is a strong, honestly-built personal project that would need a focused hardening pass — not a rewrite — to clear a genuine production bar.)*

---

## Production Readiness Checklist

**Project Structure**
- ✅ Consistent layered backend architecture (routes → validation → controller → service → repository)
- ⚠️ Module structure not perfectly uniform (RPC-style modules skip repos/routes files by design — defensible but undocumented)

**Frontend**
- ✅ Every page exists and is functional (no stub pages; only disabled buttons for unshipped sub-features)
- ✅ Every route works, protected routes correctly gate on auth
- ❌ Responsive design at the page-content level (only nav chrome adapts)
- ❌ Mobile support beyond navigation (grids/tables don't reflow)
- ⚠️ Tablet support (inherits the same gap as mobile/desktop content sizing)
- ✅ Sidebar (desktop)
- ✅ Bottom nav (mobile)
- ✅ Theme consistency (verified zero hardcoded colors)
- ✅ Loading states (present on all data-driven pages)
- ⚠️ Error states (missing on Dashboard/Device specifically; present elsewhere)
- ✅ Empty states
- ✅ Animations (consistent, centralized via layout wrapper)
- ⚠️ Accessibility (icon-only controls mostly unlabeled; one keyboard-operability gap on Files)
- ✅ TypeScript correctness (strict, zero `any`, clean build)
- ✅ API integration (all 9 endpoints verified matching real backend routes)
- ✅ Socket.IO integration (all events verified matching backend emits, proper cleanup)

**Backend**
- ✅ REST APIs (13 routes, all consistently structured)
- ✅ Controllers / Services / Routes
- ✅ Validation (Zod on every route accepting input)
- ✅ Error middleware (global handler + asyncHandler on every route)
- ✅ Logging (structured winston, bounded rotation)
- ✅ Authentication (bcrypt + JWT + refresh rotation, verified sound)
- ✅ Authorization (no unguarded route found that should be guarded)
- ✅ Socket.IO events (both namespaces verified unreachable unauthenticated)
- ✅ Environment variables (exact 1:1 match between schema and `.env.example`, no drift)
- ⚠️ Security middleware (helmet/cors/rate-limiting present but rate-limit coverage has real gaps on download/metrics/process routes)

**Database**
- ✅ Prisma schema (sensible models, relations, cascade behavior)
- ✅ Migrations (zero drift from current schema, verified)
- ✅ Foreign keys (correct cascade deletes throughout)
- ✅ Indexes (the one hot query path has its compound index; a couple of theoretical gaps noted)
- ✅ Relations
- ⚠️ Data consistency (sound, but no backup strategy exists — a single-instance failure loses everything)

**Laptop Agent**
- ✅ Windows Service (clean dual-mode implementation, graceful SCM shutdown)
- ✅ Boot detection (correctly fixed this session; **not yet redeployed**)
- ✅ Wake detection
- ✅ Lock detection
- ✅ Unlock detection
- ✅ Shutdown detection (but conflated with Restart — see below)
- ⚠️ Restart detection (detected but misreported as Shutdown; `EventType::Restart` unused)
- ⚠️ Heartbeat (event-driven only; no independent staleness sweep)
- ✅ WebSocket connection
- ✅ Automatic reconnect (all 9 emit sites verified covered by the fix)
- ✅ Command execution (all 5 commands verified correct)
- ⚠️ Error recovery (two real HANDLE leaks found; otherwise sound)
- ✅ Logging (works; unbounded retention is a long-term-only concern)

**Remote Features**
- ✅ Lock
- ✅ Restart
- ✅ Shutdown
- ✅ Sleep
- ✅ File Browser
- ✅ File Download
- ❌ File Upload (out of scope by design)
- ❌ Clipboard (never attempted)
- ✅ Process List
- ❌ Kill Process (never attempted)
- ❌ Screenshot (never attempted, explicitly next on the roadmap)

**Notifications**
- ✅ Telegram integration
- ✅ Message delivery (verified working, includes corrected timestamps)
- ✅ Failure handling (send failures logged, don't crash the request)
- ❌ Retry logic (a failed Telegram send is not retried)

**Security**
- ✅ JWT (sound design; minor algorithm-pinning gap)
- ✅ Password hashing (bcrypt, cost 12)
- ✅ Secrets (never committed, properly gitignored, matching `.env.example`)
- ✅ SQL Injection protection (100% Prisma, zero raw SQL)
- ✅ XSS protection (JSON API; one minor unescaped-HTML latent issue in Telegram messages)
- ⚠️ Rate limiting (present but incomplete coverage)
- ✅ Helmet
- ✅ Input validation (Zod on every route needing it)
- ✅ Secure WebSocket authentication (both namespaces verified)
- ⚠️ Secure file handling (path-traversal defense sound; TOCTOU gap and JWT-in-logs are real findings)

**DevOps**
- ❌ PM2 (no config in repo)
- ❌ Nginx (no config in repo, despite code assuming it exists)
- ✅ Environment configuration (clean, documented, no drift)
- ⚠️ Production build (build script is sound; artifact on disk is stale/unverified)
- ✅ Logging
- ❌ Deployment scripts (deployment is entirely manual/undocumented beyond local dev)

**Performance**
- ✅ No unnecessary re-renders of concern (one minor missed-memoization case)
- ✅ No memory leaks in request handlers (Win32 HANDLE leaks are agent-side, not request-handler)
- ✅ No slow API calls found (all bounded, timeout-protected)
- ✅ No duplicate requests found
- ❌ Bundle size (single ~609KB unsplit bundle)
- ❌ Lazy loading (none implemented)
- ✅ Query optimization (no N+1 patterns, proper pagination where needed)
