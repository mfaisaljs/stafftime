# Android POS end-to-end QA (ST028)

Use this checklist on a physical Android POS device or Shopify POS mobile app connected to your dev store.

## Prerequisites

1. App deployed or dev server reachable from the device (not `--use-localhost` alone).
2. ngrok tunnel running to your dev port (default **3458** from `shopify.web.toml`).
3. Start POS dev mode:

```bash
# Terminal 1 — tunnel (example)
ngrok http 3458

# Terminal 2 — app dev with tunnel URL
npm run dev:pos
```

4. Update `application_url` in `shopify.app.toml` if your ngrok subdomain changed, then redeploy or restart dev.

## Smart grid setup (one-time)

1. Shopify Admin → **Settings** → **Point of sale** → **Smart grid**
2. Add tile → **Apps** → **StaffTime** → **Clock in / out**
3. Save and sync POS device

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1 | Open POS home smart grid | StaffTime tile visible | ☐ |
| 2 | Tap StaffTime tile | Modal opens with PIN / QR tabs | ☐ |

## PIN verification

Demo PINs (seeded on first verify): John `1234`, Sarah `5678`.

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 3 | Enter John PIN `1234` → Continue | Greeting + status badge | ☐ |
| 4 | Wrong PIN `0000` | Error: Invalid PIN or QR code | ☐ |

## Clock in / timer

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 5 | Clock In | Badge shows **Working**, timer starts near **0h 0m 0s** | ☐ |
| 6 | Wait 10–15 seconds | Timer increments smoothly | ☐ |

## Breaks

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 7 | Start Break | Badge **On break**, timer continues | ☐ |
| 8 | End Break | Badge **Working** again | ☐ |

## Clock out

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 9 | Clock Out | Badge **Clocked out**, timer shows not clocked in | ☐ |
| 10 | Switch employee → Sarah `5678` | Sarah profile loads independently | ☐ |

## Admin dashboard sync

Open StaffTime in Shopify Admin (embedded app) in a browser.

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 11 | Clock in on POS | Dashboard **Working** count increases within ~10s | ☐ |
| 12 | Start break on POS | Dashboard shows staff on break within ~10s | ☐ |
| 13 | Clock out on POS | Working count returns to 0 within ~10s | ☐ |

## Unique PIN enforcement

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 14 | Admin → Staff → add duplicate PIN | Error about PIN already assigned | ☐ |
| 15 | POS verify with ambiguous PIN (if duplicated in DB) | Error about multiple employees | ☐ |

## Automated coverage

Run backend POS workflow tests (same logic the extension calls):

```bash
npm run qa:pos
```

All tests should pass before marking ST028 complete.

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Device | |
| Store | spaceraceplayground.myshopify.com |
| App version | |
| Tunnel URL | |
| Date | |
| Result | ☐ Pass / ☐ Fail |

Notes:
