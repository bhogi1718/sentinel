# Device pairing

Status: implemented.

## Goal

Adding a laptop shouldn't mean copying a 96-character token out of a browser window into a config file. An Owner or Admin gets a short code instead; the agent exchanges it for its own token, which goes straight from the backend into `agent.toml`. This was audit finding C5 (no device enrollment).

## Flow

1. **Devices > Add device**: the member names the laptop and gets a code like `K7QM-3XRP`, valid for 15 minutes, plus the install command.
2. On the laptop, `install-service.ps1 -PairingCode K7QM-3XRP -ServerUrl https://...` builds the agent and runs `sentinel-agent.exe pair <CODE> --server <URL> --config agent\agent.toml`.
3. The agent calls `POST /api/agent/pair`. The backend creates the device and returns its token once; the agent writes `server_url` and `device_token` into `agent.toml`, keeping every other setting and comment (creating the file, with `browse_root` set to the user's profile, if there is none).
4. The backend broadcasts `device:added` (with the code's id) to the organization's consoles. The dialog showing that code moves to "paired"; device lists refresh.
5. The installer installs the service as usual.

## API

| Endpoint | Who | What |
| --- | --- | --- |
| `POST /api/orgs/:orgId/devices/pairing-codes` `{ name }` | `devices:manage` (Owners, Admins; never the demo) | Returns `{ id, code, deviceName, expiresAt }`. The code is shown only here. |
| `DELETE /api/orgs/:orgId/devices/pairing-codes/:id` | `devices:manage` | Cancels an unused code. The dialog does this when closed unused. |
| `POST /api/agent/pair` `{ code }` | anyone holding a code; rate-limited | Returns `{ deviceId, deviceName, token }`, `404` for any code that can't be used, `400` for one that can't exist. |

Adding a device directly (`POST /api/orgs/:orgId/devices`, which returned a token to the browser) is gone. Existing devices keep their tokens; `prisma/rotate-device-token.ts` remains for recovery.

## Design

- **Table:** `pairing_codes` (`PairingCode`): organization, device name, creator, expiry, `usedAt`, and the id of the device it made (a plain id, like `Invitation.acceptedById`).
- **Codes:** 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L), about 40 bits, shown as `XXXX-XXXX`. Typed codes are normalized (case, dashes, spaces) on both the agent and the backend.
- **Stored as a hash:** SHA-256 via `hashToken`, like device tokens and invite links. A plain hash is enough here because a code is only worth anything for 15 minutes and works once.
- **Guessing:** 31^8 codes, at most 20 unused per organization, 15-minute lifetime, single use, and claims capped at 10 per 15 minutes per address in production (`pairingRateLimiter`).
- **Single use:** the claim runs in one transaction: find the usable code, create the device, then mark the code used with a conditional update (`usedAt IS NULL AND expiresAt > now`). Of two simultaneous claims, exactly one changes the row; the other rolls back, so a code never makes two devices or gets used up without one.
- **Same answer for every failure:** unknown, expired, used and cancelled codes all get the same `404`.
- **Audit:** pairing writes `DEVICE_ADDED`, attributed to whoever created the code. A code whose creator's account has since been deleted is refused, since there'd be no one to attribute it to.
- **Housekeeping:** creating a code deletes that organization's codes that were used or expired more than a day ago.

## Agent side

- `src/pairing.rs`: the `pair` subcommand (argument parsing, the HTTPS call via `reqwest`, and the `agent.toml` rewrite via `toml_edit`, both already in the dependency tree). `main.rs` dispatches to it before the service/console logic. The request timeout is 90 seconds, because a free-tier backend can take most of a minute to wake.
- If pairing succeeds but `agent.toml` can't be written, the code is spent; the message says to create a new one.
- `install-service.ps1` builds, pairs, and only then replaces the running install, so a failed build or pairing leaves the current one untouched.

## Not covered

- The token is still stored in plaintext in `agent.toml` (audit H5: DPAPI).
- There is no signed installer or prebuilt binary yet, so pairing still requires building the agent from source.
