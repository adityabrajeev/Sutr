# SUTR — Wedding Operations OS (full-stack MVP)

Built from the *SUTR All Personas · Features · Workflows v1.0* bible. It covers all 21 modules, 7 personas and 5 cross-persona workflows.

- **Planner / Team web app.** A responsive PWA: sidebar on desktop, bottom tabs on phones, installable, with an offline write queue for wedding day.
- **No-login link apps.** Mobile-first pages for the **Host**, **Guest**, **Vendor / Driver / Photographer** and **Prospect**. Each one is reached through a secure one-purpose link and includes a simulated WhatsApp thread.
- **Backend.** Express + Node's built-in SQLite (no native builds). It includes role- and wedding-scoped permissions, an audit log, an event bus, an automation engine and a reminder scheduler.

## Run it

Requires Node 22.5+ (built and tested on Node 24).

```bash
npm install
npm run dev          # API on :4000, web on http://127.0.0.1:5173
```

The database is created and seeded automatically on first start (`server/data/`). Then:

- Open **http://127.0.0.1:5173/demo**, the demo hub. It has one-click staff sign-in plus every host, guest, vendor, driver, photographer and prospect link.
- Every seeded staff account uses the password **`sutr-demo-2026`** (`server/seedData.ts` → `DEMO_PASSWORD`).

| Account | Role | Sees |
|---|---|---|
| ananya@saffronstory.example | Owner | Everything, including proposals over 15% discount and permanent deletes |
| rohan@saffronstory.example | Planner | Full agency access |
| priya@saffronstory.example | Coordinator | Assigned weddings only; broadcasts, documents, analytics enabled |
| kabir@saffronstory.example | Coordinator | Assigned weddings; unavailable later this month (to test conflicts) |
| neha@saffronstory.example | Coordinator | Assigned weddings; budget permission |

Other scripts:

```bash
npm run seed         # wipe server/data and reseed
npm run typecheck
npm run build && npm start   # production: API serves the built client on :4000
npx tsx server/smoke.ts      # 109-check end-to-end API test (run against a fresh seed)
```

To run the smoke test without touching your demo data, point a second server at a throwaway folder: `SUTR_DATA_DIR=/tmp/sutr-smoke PORT=4100 npx tsx server/index.ts`, then `SUTR_URL=http://127.0.0.1:4100 npx tsx server/smoke.ts`.

## Seeded scenario

| Wedding | State | Good for trying |
|---|---|---|
| Meera & Aarav · Udaipur | 10 days out | Guest import/duplicates, RSVP reminders, OCR review queue, pickup clustering, rooming → host approval, vendor confirmations, budget variance, SOP tasks |
| Zoya & Kabir · Goa | **Live today** | Command Center: incidents, delayed caterer, live pickups, check-in, photographer uploads awaiting host approval |
| Ishita & Dev · Jaipur | Completed | Published gallery, case study and testimonial (portfolio) |
| Riya & Arjun · Delhi | Early planning | Empty-ish workspace |

There are also 3 leads: one with a proposal sent, one with a revision requested, and one new.

## Module map

| Bible module | Where |
|---|---|
| 1 Agency workspace + Morning Brief | `/` (`pages/agency.tsx`, `engines.ts → morningBrief`) |
| 2 Create wedding (scratch / SOP template / clone / proposal) | `/weddings/new` |
| 3 Wedding workspace + health + priority queue | `/w/:id` (`engines.ts → weddingHealth`) |
| 4 Guest ops (CSV import, mapping, validation, duplicates, households, bulk) | `/w/:id/guests` |
| 5 Communication center (broadcast, campaigns, scheduling, inbox, failure queue, templates) | `/w/:id/comms` |
| 6 RSVP (per function, household, dietary, reminders → follow-up task, freeze, walk-ins) | `/w/:id/rsvp`, guest link |
| 7 Travel (ticket OCR, review queue, clustering, vehicles, trip sheets, delays) | `/w/:id/travel`, guest + driver links |
| 8 Accommodation (inventory, suggestions, conflicts, drag-drop, host approval, check-in, room change) | `/w/:id/rooms`, host link |
| 9 Vendors (assign, double-booking, confirm, reminders, ETA/delay impact, backup, deliverables, performance) | `/w/:id/vendors`, `/vendors`, vendor link |
| 10 Budget (planned vs actual, FX, duplicates, variance → host decision; no payments) | `/w/:id/budget` |
| 11 Master calendar (agency + wedding, conflicts, drag-to-reschedule) | `/calendar`, `/w/:id/calendar` |
| 12 Tasks & SOPs (dependencies, checklist, proof → review, block, escalation) | `/tasks`, `/w/:id/tasks` |
| 13 Wedding Day Command Center (live function, incidents, broadcasts, offline queue) | `/w/:id/live` |
| 14 Media (photographer upload link, host per-photo approval, publish → guest gallery) | `/w/:id/media`, vendor + host + guest links |
| 15 Portfolio & testimonials (consent, publish, public page) | `/portfolio`, `/studio/:slug` |
| 16 Proposal builder / Make Your Own Wedding (catalogue, margin, versions, convert) | `/proposals`, prospect link |
| 17 Analytics (agency/wedding, exceptions → drill-down) | `/analytics` |
| 18 Team (invite, roles, permissions, availability, deactivate → reassign) | `/team`, `/invite/:token` |
| 19 Documents (versions, OCR text search, host visibility, expiring shares) | `/documents`, `/d/:token` |
| 20 Automation hub (trigger → conditions → delay/approval → actions, retries, loop guards) | `/automation` |
| 21 Settings & admin (profile, branding, messaging, defaults, integrations, security, audit, export, delete) | `/settings` |

## What is simulated (and where to plug in the real thing)

| Concern | MVP behaviour | Production swap |
|---|---|---|
| WhatsApp / email | `engines.ts → deliver()` marks messages delivered/failed with real failure classes (invalid number, opt-out, outage + retry). Messages show up in each recipient's link page; replies typed there go through `routeInbound()` exactly like a webhook would | Call the WhatsApp Cloud API in `deliver()`; point the provider webhook at `routeInbound()` |
| OCR | `extractTicket()` parses flight/train numbers, airports, dates and times from file names, text/PDF text and pasted messages, with a confidence score | Send the file to an OCR/LLM extractor and keep the same `Extraction` shape |
| Scheduler | `setInterval` tick every 60 s, plus a "Run reminder engine now" button that forces thresholds | A queue/cron worker |
| File storage | Local `server/data/uploads` served from `/files/` with unguessable names | Object storage with signed URLs |
| Auth | Email + scrypt password, server-side sessions, invite links | Add SSO/2FA; secure links already expire and can be revoked |

Payments are intentionally out of scope, per the bible: SUTR only tracks payment status.
