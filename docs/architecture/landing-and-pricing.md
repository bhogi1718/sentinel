# Landing page, pricing and error pages

Status: proposed, awaiting approval. Nothing here is implemented yet.

## Goal

Give the project a public front door that reads like a real product: what
Sentinel is, why it's safe, what it costs, and a one-click way in (the live
demo). Today the site opens straight onto a login form.

## Routes

| URL | Who | Page |
| --- | --- | --- |
| `/` | Everyone | **Landing page** (new). Signed-in users see "Open console" instead of "Sign in". |
| `/pricing` | Everyone | **Pricing page** (new) |
| `/login` | Signed out | Existing login page (with "Try the demo") |
| `/app` | Signed in | Sends you to your last organization - what `/` does today |
| `/o/:orgId/...` | Signed in | The console, unchanged |
| anything else | Everyone | **404 page** (new), instead of silently redirecting |

After login, and from the console's logo, users go to `/app`. Old bookmarks
of `/` still work - they just land on the public page with a clear way in.

## Landing page sections

1. **Header:** logo, Features, Security, Pricing, GitHub, and Sign in / Open console.
2. **Hero:** one-line promise ("Monitor and control your team's Windows laptops from anywhere"), a short subline, and two calls to action: **Try the live demo** and **Sign in**. Beside it, a product preview (see below).
3. **Features:** six cards - live status and metrics, live screen view, remote commands, file access, alerts, organizations and roles.
4. **How it works:** three steps - add a device, install the agent with its token, watch it come online.
5. **Security:** what actually protects customers, stated plainly - per-organization isolation proven by tests, role-based permissions, the on-screen "being viewed" banner, hashed device tokens, view-only live screen.
6. **Pricing teaser:** the three plans in brief, linking to `/pricing`.
7. **FAQ:** six short answers (is it free to try, which OS, what does a viewer see on the laptop, how is data isolated, can I self-host, what's not built yet).
8. **Footer:** product links, GitHub, architecture docs, and a one-line note that this is a portfolio project.

## Pricing page

Three plans in a comparison table plus FAQ:

| | Free | Team | Business |
| --- | --- | --- | --- |
| Price | $0 | $6 / device / month | Contact |
| Devices | Up to 2 | Unlimited | Unlimited |
| Members and roles | 1 owner | Owner, Admin, Viewer | Same, plus SSO (planned) |
| Live view, files, commands | Yes | Yes | Yes |
| Telegram alerts | Yes | Yes | Yes |
| Command history | 7 days | 90 days | Custom |

The calls to action are **Try the demo** (Free and Team) and a mailto link
(Business). No payment is taken: the page says plainly that pricing is
illustrative and billing isn't built yet, so the page looks real without
claiming anything false.

## Product preview in the hero

A static, non-interactive mock of the console built from the existing UI
kit (device card, status pills, a metrics strip, a few events) with sample
data. It stays sharp at any size, follows dark and light themes, and can
never show real customer data. No screenshots to keep up to date.

## Error pages

- **404:** for unknown URLs, with links home and to the console.
- **Something went wrong:** a top-level error boundary, so a rendering
  error shows a recoverable page with a reload button instead of a blank
  screen.

## Design and quality

- Same design system as the console (colours, type, cards, buttons), so
  marketing and product feel like one thing.
- Responsive down to phone width, dark and light themes, keyboard
  navigable, semantic headings, `alt` text and visible focus states.
- Page title and description meta tags per page, plus an Open Graph
  description for link previews.
- No new dependencies; plain React and the existing styling.

## Decisions for you

1. **Prices:** the plans and numbers above, or different ones? They're
   illustrative either way.
2. **Stripe test-mode checkout:** leave it out for now (recommended).
   It needs a Stripe account, a webhook endpoint and a billing model in
   the database, which is a module of its own. The pricing page works
   without it.
3. **Portfolio note:** keep the small "portfolio project" line in the
   footer and on the pricing page (recommended), or leave it out.

## Testing

- Build and typecheck; every new page checked in the browser at desktop and
  phone width, in both themes.
- Routing: `/` and `/pricing` work signed out, `/app` sends signed-in users
  to their organization, unknown URLs show the 404 page, and login lands in
  the console.
