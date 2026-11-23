# NutriTrace — prototype (pitch demo)

The production web app running on a simulated state programme **inside the browser**. No
server, no database. After the first load it works without internet (except map tiles).

```bash
pnpm install
pnpm build && pnpm preview        # http://localhost:4173   (or: pnpm dev → :5174)
```
Deploy `dist/` to any static host (Netlify, S3, an internal server). Serve with an SPA fallback
to `index.html`; `mockServiceWorker.js` must stay at the site root.

## What is simulated
- **Tamil Nadu** — 6 districts, 12 blocks, 72 schools, state and district warehouses,
  6 suppliers, 3 weeks of procurement, receipts, QC, FEFO distribution, cooking and meal
  service (~22,800 hash-chained custody events). Seeded, so every run is identical.
- **Karnataka** and **Uttar Pradesh** — smaller, to show other hierarchies and languages.
- Scenarios: 20 kg short on rice lot 1, aflatoxin moong recall, failed toor QC on hold,
  delayed truck, children not fed, high leftovers, delivery in transit to the headmaster's school,
  PO and stock adjustment awaiting a second officer, near-expiry rava.

## Using it
Open the site to see the landing page; *Sign in* leads to the sign-in page, where **Choose a role** opens every demo person grouped by state and function. Or sign in by choosing a person (password, if typed: `demo-pitch-2026`). The amber bar has the
**Pitch guide** (see `../docs/PITCH-SCRIPT.md`), **Switch person**, and **Reset**. Everything you
do is real within the demo — stock moves, ledger events, exceptions — and survives a page reload
(the session keeps a journal of your actions). **Reset** returns to the starting data.

## New in v2
- **Admin Console** — sign in as Dr. Aruna Krishnan and use *Admin Console*, or as **V. Anand (District data administrator)** who works only there.
- **Indents** — as **M. Babu (Warehouse operator)**, *My work* shows the headmaster's indent: approve, then *Fulfil with a shipment*.
- **Last mile** — as **Raja (driver)** on a phone: open today's trip and record arrivals and hand-overs. The board updates for the district.

## Administration in the demo
Sign in as **Dr. Aruna Krishnan (State admin)** to add a block (Locations), add or import schools
(Facilities → Import from spreadsheet — the template downloads from the dialog), register a
supplier (Suppliers), add a food item or vehicle, or edit users. As **Dr. G. Padmini
(Nutritionist)**, create a recipe, approve it and put it on the weekly menu.

## How it is built
`src/mocks/seed/simulate.ts` runs the programme day by day with the same domain functions the
backend uses; `src/mocks/routes/*` implement the REST contract; MSW (`src/mocks/browser.ts`)
intercepts `/api/v1/*`. The rest of `src/` is the production web app. See
`../docs/ARCHITECTURE.md` § 7 to bring production UI changes across.
