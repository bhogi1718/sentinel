# Accounts: sign-up, invites and members

Status: proposed, waiting for approval.

## Goal

A visitor can create an account and their own organization from the website, invite teammates with a link, and manage who has which role, all without the seed script or any paid service. The public demo is unchanged.

## What exists today

- Accounts are created only by `prisma/seed.ts`. There is no sign-up.
- A member can be listed (`GET /api/orgs/:orgId/members`), but there is no way to add, change or remove one.
- Sessions: a 15-minute access token, plus a refresh token that is rotated (single-use) on every refresh. The refresh token is stored hashed in `refresh_tokens` and kept in the browser's `localStorage`.
- A signed-in user with no organization sees "Ask an organization owner to add you", which they can't act on.

## Constraints

- **No email.** Free sending services (Resend, Brevo, …) need a domain you own to send to anyone. So invites are **links the owner copies and shares**, the way Discord, Figma and Notion invite links work. This also rules out email verification and password reset for now (see "Not in this module").
- **Free-tier database (Neon, 0.5 GB):** sign-ups are rate-limited so a script can't fill it.
- **No paid plans:** the plan limits on the pricing page (for example "Free: 2 devices") stay illustrative and are not enforced.

## User flows

### 1. Sign up

`/signup`: name, email, password (at least 10 characters), and an organization name (defaults to "<Name>'s organization").

1. The account and the organization are created in one database transaction, and the new user becomes its **Owner**.
2. They're signed in and land on their empty Overview, which shows the existing "Add device" path.
3. The landing page's main button becomes **Get started free** (→ `/signup`). **Try the demo** stays next to it.

The email isn't verified (there's no email to verify it with). It's used only as the login name.

### 2. Invite a teammate

In **Settings → Members**, an Owner clicks **Invite**:
1. They pick a role (**Admin** or **Viewer**) and an optional note ("Sam from finance").
2. They get a link, `https://…/invite/<token>`, to copy and share.

Each link:
- is **single-use**, **expires after 7 days**, and can be **revoked**;
- is random: 32 bytes, stored only as a SHA-256 hash, like device and refresh tokens. A database leak doesn't reveal working links;
- has its role fixed when it's created. The person accepting can't change it.

Pending invites are listed under Members with their role, note, creator and expiry, each with a **Revoke** button.

Owners can't be invited directly. An existing member is promoted instead, which keeps "who is an owner" a deliberate action.

### 3. Accept an invite

`/invite/<token>` shows "Join **Acme** as **Viewer**" (organization name and role only, nothing else about the organization).
- **Signed in:** a **Join** button.
- **Signed out:** **Create account** or **Log in**. Either one brings the person back and joins them in the same step. Someone who signs up through an invite gets no organization of their own.
- **Expired, used or revoked link:** "This invite is no longer valid", with no hint as to which.
- **Already a member:** the invite is left unused and they're taken to the organization.

### 4. Manage members (Owners)

In Settings → Members, each row gets a role menu (Owner / Admin / Viewer) and **Remove**. Admins and Viewers see the list read-only, as today.

Guards:
- An organization always keeps at least **one Owner**. The last Owner can't be demoted, removed, or leave.
- Anyone can **Leave** an organization (except its last Owner).
- A change takes effect at once. The member's next request is checked against the new role (that already happens per request), and their open console is resynced immediately through the existing `resyncDashboardSockets(userId)`. A demoted Admin's live view ends there and then.

### 5. Create another organization

Both the organization switcher and the no-organization page get **New organization**. That turns the dead-end page into something the user can act on.

## Database changes (one migration)

```prisma
model Invitation {
  id           String    @id @default(uuid())
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  role         OrgRole   // ADMIN or VIEWER, checked in the service
  tokenHash    String    @unique
  note         String?
  createdById  String?   // SetNull if that user is deleted
  createdAt    DateTime  @default(now())
  expiresAt    DateTime
  acceptedAt   DateTime?
  acceptedById String?
  revokedAt    DateTime?

  @@index([orgId])
  @@map("invitations")
}
```

`RefreshToken` gains `familyId String` (all tokens descended from one login share it), for reuse detection below. Existing rows get their own id as their family.

`AuditAction` gains `MEMBER_INVITED`, `INVITE_REVOKED`, `MEMBER_JOINED`, `MEMBER_ROLE_CHANGED`, `MEMBER_REMOVED` and `MEMBER_LEFT`, so membership changes appear in the audit log next to device actions. These entries have no device: the device fields are already optional in the table, and the service type gains a member variant whose detail is `{ member, fromRole?, toRole? }`.

## API

| Route | Permission | Notes |
| --- | --- | --- |
| `POST /api/auth/signup` | public | Rate-limited: 5 per hour per IP. Returns a session like login. |
| `POST /api/orgs` | signed in | Creates an organization with the caller as Owner. At most 10 per user. |
| `GET /api/invites/:token` | public | Returns organization name and role only. |
| `POST /api/invites/:token/accept` | signed in | Single-use, in a transaction: the invite is marked used and the membership created together, so two clicks can't both succeed. |
| `GET/POST /api/orgs/:orgId/invites` | `members:manage` | List pending invites, or create one. The link is returned once, at creation. |
| `DELETE /api/orgs/:orgId/invites/:id` | `members:manage` | Revoke. |
| `PATCH /api/orgs/:orgId/members/:userId` | `members:manage` | Change role. Last-owner guard. |
| `DELETE /api/orgs/:orgId/members/:userId` | `members:manage`, or yourself | Remove, or leave. Last-owner guard. |

All of these are refused in the demo organization (`members:manage` is already demo-restricted), and the shared demo user can't sign up or accept invites. The public invite lookup answers an unknown, expired, used and revoked token identically.

## Session hardening (in this module)

- **Refresh-token reuse detection.** If an already-rotated refresh token is presented again, someone has a copy of it. Every token in that login's family is then revoked, which signs out the thief and the owner, and the owner logs in again. Today such a token is only rejected.
- **Realtime cut-off.** On password change and on detected reuse, the user's open dashboard sockets are disconnected at once, instead of when their access token expires (up to 15 minutes later).

## Not in this module

- **Password reset and email verification** need outbound email, which needs a domain. They'll be added if a domain is bought, and the README's "Production roadmap" will list them.
- **Refresh token in an httpOnly cookie.** The console (vercel.app) and the API (onrender.com) are different sites. A cookie set by the API would be a third-party cookie, which Safari blocks and Chrome is restricting. The proper fix is to serve the API under the console's own origin through a Vercel rewrite. That's free, but it changes how every request and file download is routed (WebSockets would still go to Render directly), so it deserves its own small module after this one. Until then the refresh token stays in `localStorage`, protected by rotation and the reuse detection above.
- SSO, two-factor authentication and account deletion are listed as roadmap items.

## Build order and tests

1. **Sign-up and new organizations:** backend, then the `/signup` page, landing button and no-organization page. Tests:
   - sign-up creates exactly one user, organization and Owner membership;
   - a duplicate email fails cleanly;
   - the rate limit applies;
   - the demo email is refused.
2. **Invites:** backend, then the invite dialog, pending list and `/invite/:token` page. Tests:
   - a link works once;
   - an expired, revoked or used link fails the same way;
   - two simultaneous accepts produce one membership;
   - the role can't be changed by the person accepting;
   - another organization's Owner can't see or revoke the invite;
   - Admins and Viewers can't invite.
3. **Members management:** role changes, remove, leave and audit entries. Tests:
   - the last-owner guard;
   - a downgraded member loses access on their next request, and their live view ends;
   - every change writes one audit entry.
4. **Session hardening:** reuse detection and socket cut-off. Tests:
   - reusing a rotated token revokes its whole family and nothing else;
   - sockets close on password change.

Each step runs against the real-database (PGlite) suite, is checked in the browser against the sandbox, and gets your OK before the next one starts. The architecture doc becomes the "how it works" link in the README.
