# StaffTime — Workforce OS for Shopify POS

StaffTime is a Shopify POS-first workforce management app for clock in/out, breaks, scheduling, attendance, payroll export, and missed punch approvals.

Positioning: **Workforce OS for Shopify POS**, not just a time clock.

## Stack

- Shopify React Router app (embedded admin)
- POS UI Extension (`pos.home.tile.render`, `pos.home.modal.render`)
- Prisma + SQLite for local development (PostgreSQL recommended for production)
- Session-token authenticated POS APIs via `authenticate.pos`

## Features (MVP)

- PIN and QR employee verification from POS
- Clock in / clock out / break start / break end
- Live shift timer and today's schedule in POS modal
- Attendance dashboard (working, on break, late, absent)
- Shift scheduling from admin
- CSV payroll export with paid hours, overtime, and labor cost
- Missed punch approval workflow with audit logging
- Task tracking JSON files in `task/`

## Getting started

### Prerequisites

- Node.js 20+
- Shopify CLI 3.94+
- Shopify Partner account and development store with POS enabled

### Install

```bash
npm install
npm run setup
```

### Configure Shopify app

Link the app to your Partner Dashboard app:

```bash
npm run config:link
```

Start development (localhost mode — no external tunnel required):

```bash
npm run dev
```

This uses `shopify.app.local.toml`, which omits webhook subscriptions because Shopify cannot deliver webhooks to `localhost`. Webhook routes still exist in code and are registered via `shopify.app.toml` on deploy.

Then press **`p`** in the CLI terminal to open the app in Shopify Admin.

**Do not** open `trycloudflare.com` URLs directly — always use the Admin preview (`p`).

For production deploy (includes webhooks):

```bash
npm run deploy
```

Install the app on your development store and add staff under **Staff** in admin.

## POS staff login

New Shopify staff start **Inactive** until they verify on POS (or Web Portal) for the first time. After first successful PIN or QR verify, they become **Active** and can clock in/out.

1. Add staff in admin with a unique 4-digit PIN.
2. On POS, open the **StaffTime** tile and enter that PIN.
3. First verify activates the staff member; then use Clock in / out as normal.

### Android POS testing

Physical POS devices cannot reach `localhost`. Use a tunnel:

```bash
# Terminal 1 — forward to the port in shopify.web.toml (3458)
ngrok http 3458

# Terminal 2 — dev with tunnel (update URL in package.json dev:pos if ngrok subdomain changed)
npm run dev:pos
```

Add the **StaffTime** tile manually: **Settings → Point of sale → Smart grid → Apps → StaffTime**.

Full QA checklist: [`task/QA-POS-ANDROID.md`](task/QA-POS-ANDROID.md).

Run automated POS workflow tests:

```bash
npm run qa:pos
```

## POS extension

The workforce clock extension lives in `extensions/workforce-clock/`:

- **Tile**: StaffTime entry point on POS home smart grid
- **Modal**: PIN/QR verification, clock actions, live timer, schedule

POS routes:

- `GET /api/pos/summary`
- `POST /api/pos/verify`
- `POST /api/pos/clock-in`
- `POST /api/pos/clock-out`
- `POST /api/pos/break-start`
- `POST /api/pos/break-end`

## Admin pages

- `/app` — live dashboard
- `/app/attendance` — late/absent views
- `/app/schedules` — create and review shifts
- `/app/payroll` — timesheets and CSV export
- `/app/reports` — overview, daily activity report, and staff activity log
- `/app/missed-punches` — approval queue
- `/app/staff` — staff management
- `/app/staff/new` — add Shopify staff form

## Task tracking

Progress is tracked in:

- `task/tasks.json` — epics and status
- `task/subtasks.json` — implementation subtasks
- `task/status.json` — current phase and milestones

## Tests

```bash
npm test
```

## Architecture

```text
POS UI Extension
      │
      ▼
React Router App (Remix-style routes)
      │
      ├── authenticate.pos → clock APIs
      ├── authenticate.admin → dashboard
      ▼
Prisma ORM
      ▼
SQLite / PostgreSQL
```

## Roadmap

Enterprise features planned next:

- Multi-store RBAC
- GPS geofence and photo verification
- Full offline sync queue
- QuickBooks, Gusto, ADP, Paychex integrations
- Notifications (email, SMS, push)
- Labor analytics and AI forecasting

## Competitive context

StaffTime targets the same category as apps like [Zon Staff Management](https://apps.shopify.com/zon-staff-management), with differentiation around enterprise reliability, POS-native UX, and workforce analytics.

## License

See [LICENSE.md](./LICENSE.md).
