# Demo mode

Status: implemented. Enabled per deployment with `DEMO_MODE=true`.

Decisions taken: the demo visitor is an ADMIN of one shared demo organization, and the simulator runs inside the backend process. Demo visitors can try commands, files, screenshots and the live view, but cannot add devices, change settings or members, or change the shared account's password (`common/permissions.ts`, `auth.service.ts`).

## Goal

Anyone who opens the public link can click **Try the demo** and explore a
working dashboard: a device that reports events, shows live metrics, answers
commands and streams a screen, without a Windows laptop, an install, or an
account. The demo keeps working when the owner's laptop is off.

## What is simulated, and what is not

The simulated device speaks the **same Socket.IO protocol as the real agent**
on the `/agent` namespace, so the backend code path under test is the real
one. Only the device's data is fake.

| Capability | Demo behaviour |
| --- | --- |
| Events (boot, lock, unlock, network, battery) | Generated on a schedule, persisted and broadcast like real ones |
| Metrics (CPU, memory, disk, network) | Generated from smooth random walks |
| Processes | A fixed, plausible list with changing CPU figures |
| Files | A fixed fake folder tree; downloads return generated text |
| Screenshot and live view | A generated image, with a "Demo" watermark, at the requested frame rate |
| Remote commands | Acknowledged after a short delay; the simulated state changes (e.g. "locked") and an event is recorded |

Nothing touches a real machine, and no real device token is ever involved.

## Design

### Backend

- **Demo organization:** one organization flagged `isDemo = true`, with one
  simulated device. Added to the schema with a migration (default `false`).
- **Simulator:** `backend/src/demo/simulator.ts`. Started at boot only when
  `DEMO_MODE=true`. It connects to its own server's `/agent` namespace with
  `socket.io-client`, authenticating with a token generated at boot (never
  stored, so nothing sensitive persists). This means it cannot be used to
  impersonate a real device, and it exercises the real agent handlers.
- **Demo sessions:** `POST /api/demo/session` (rate-limited, no body) returns
  access and refresh tokens for a single shared demo viewer account that is a
  member of the demo organization only. It is refused unless `DEMO_MODE=true`.
- **Isolation:** the demo account has no membership anywhere else, so every
  existing tenant check applies unchanged. A test asserts that a demo session
  cannot read any non-demo organization.
- **Safety:** the simulator's commands and screenshots are answered only by
  the simulator. Demo traffic is rate-limited, and demo event history is
  pruned to a fixed window so the free database stays small.

### Frontend

- Landing page button calls `/api/demo/session`, stores the tokens the same
  way login does, and opens the demo organization.
- A persistent banner in the app shell: "You're viewing a demo with simulated
  data." Visible only in the demo organization.
- Demo sessions are read-write for the simulated device (so reviewers can try
  Lock or the live view), but the banner makes clear nothing real is affected.

## Decisions for you

1. **Demo role:** ADMIN (reviewers can try commands and the live view), or
   VIEWER (read-only, safer)? My recommendation is ADMIN, since the commands
   and live view are the point of the demo.
2. **Shared or per-visitor demo?** One shared demo organization is simplest
   and cheap; all visitors see the same simulated laptop. Per-visitor
   sandboxes cost more database rows and are not needed for a showcase.
   Recommendation: shared.
3. **Where it runs:** in the same backend process, enabled by an environment
   variable. Free hosting tiers do not allow a second always-on worker, so a
   separate simulator service is not an option.

## Testing

- Unit: the simulator emits the expected event types and metric ranges.
- Integration (real database): demo session creation is refused when
  `DEMO_MODE` is off; a demo session sees only the demo organization.
- End to end (manual, once): open the live site, click **Try the demo**,
  see events and metrics update, send a Lock command and see it complete.

## Out of scope

Per-visitor sandboxes, resetting demo data on a schedule, and anything that
lets a visitor reach a real device.
