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

Install the app on your development store, then open the embedded admin to seed demo data.

## Demo credentials

On first admin visit, StaffTime seeds demo employees:

| Employee | PIN  | Role       |
|----------|------|------------|
| John Rivera | 1234 | Employee   |
| Sarah Chen  | 5678 | Supervisor |

Use these PINs in the POS **StaffTime** smart grid tile.

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
- `/app/missed-punches` — approval queue
- `/app/employees` — team management

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
