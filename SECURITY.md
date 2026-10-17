# Security policy

## Reporting a vulnerability

Please don't open a public issue for a security problem. Use GitHub's private
vulnerability reporting on this repository (**Security → Report a
vulnerability**). You'll get a response within a few days.

Useful details: the affected component (backend, dashboard, or the Windows
agent), steps to reproduce, and what an attacker could do with it.

## Scope

In scope: the backend API and realtime server, the dashboard, and the Windows
agent. Particularly interesting are anything that lets one organization see
or control another's devices, bypasses a role check, or lets a non-agent
reach the agent's pipes.

## Known open items

These are tracked in [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md) and not yet fixed:

- The agent's helper pipe is created without its intended restricted access
  control list (audit H8), so other interactive users on the laptop may be
  able to reach it.
- Dependency advisories in the backend's install-time tooling (audit M1).
- Refresh tokens are stored in browser local storage (audit H2).

Reports about these are still welcome; they just won't be news.
