# BlueBill System — AquaPure Refilling Station

A full-stack **water-refilling-station management system** built from the Figma design:
point of sale, inventory & stock, container-asset tracking, employee quotas and
end-of-shift reporting.

| Layer | Stack | Folder |
|-------|-------|--------|
| Frontend | Next.js 14 (App Router) + React 18 | [`client/`](./client) |
| Backend | Node.js + Express + Mongoose | [`server/`](./server) |
| Database | MongoDB (Atlas or local) | — |

---

## Quick start

Two terminals, from the repo root:

```bash
# 1) API  →  http://localhost:5000
cd server
npm install
npm run dev            # seeds automatically on first run

# 2) Web  →  http://localhost:3000
cd client
npm install
npm run dev
```

Then open **http://localhost:3000** and sign in:

```
ana@aquapure.ph / password123
```

> On boot the server checks whether the database has any transactions. If it
> is empty it loads the demo data from the Figma design automatically, so a
> fresh clone shows the finished screens with no extra steps. Set
> `AUTO_SEED=false` in `server/.env` to turn that off, and use `npm run seed`
> / `npm run seed:fresh` to control it manually.

### Verifying the backend

```bash
cd server

npm run smoke   # 102 end-to-end API tests on a throwaway in-memory MongoDB
npm run verify  # 10 checks against a server that is already running
```

`smoke` boots the app, seeds it, exercises every route the UI depends on, and
exits non-zero on failure — so it doubles as a CI gate. `verify` is the
quick confidence check: start the server, then run it to confirm auth, the
dashboard aggregates, a real sale and stock decrement all work.

---

## Connecting your real database

The server starts with **no database configuration** by falling back to an
in-memory MongoDB so you can run it immediately. Data is discarded on shutdown.

To use **MongoDB Atlas** (you already have a cluster created):

1. In Atlas → **Database Access** → add a user with *Read and write to any database*.
2. In Atlas → **Network Access** → allow your IP (or `0.0.0.0/0` for local dev).
3. Click **Connect** → copy the connection string.
4. Paste it into `server/.env`:

   ```ini
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority

---

## Repository layout

```
Bluebill-systen/
├── README.md
│
├── server/                        Node.js + Express + MongoDB API
│   ├── .env.example
│   ├── package.json
│   ├── scripts/
│   │   ├── seed.js                Demo data (mirrors the Figma numbers)
│   │   └── smoke.js               102 end-to-end API tests
│   └── src/
│       ├── server.js              HTTP bootstrap + graceful shutdown
│       ├── app.js                 Express app factory (helmet, cors, limits)
│       ├── config/
│       │   ├── env.js             Typed env access, read once
│       │   ├── db.js              Mongoose connection (+ in-memory fallback)
│       │   └── constants.js       Domain enums, status/quota rules
│       ├── models/                Mongoose schemas
│       │   ├── User.js            Login identity (JWT)
│       │   ├── Product.js         Sellable POS items
│       │   ├── InventoryItem.js   Stock levels, reorder points
│       │   ├── Container.js       Refillable container assets
│       │   ├── Customer.js        Accounts + on-account balances
│       │   ├── Employee.js        Staff, quotas, commission
│       │   ├── Order.js           Transactions
│       │   ├── Shift.js           Shift + cash-drawer reconciliation
│       │   └── Counter.js         Atomic TXN-#### / CNT-#### sequences
│       ├── services/              Business logic (no HTTP concerns)
│       │   ├── product.service.js
│       │   ├── inventory.service.js
│       │   ├── container.service.js
│       │   ├── customer.service.js
│       │   ├── employee.service.js
│       │   ├── order.service.js   The POS transaction
│       │   ├── dashboard.service.js
│       │   └── report.service.js  X-Read, cash drawer, CSV
│       ├── controllers/           Thin HTTP adapters
│       ├── routes/                URL map, one file per resource
│       ├── middleware/            auth · validate · errorHandler
│       ├── validators/            Zod schemas per resource
│       ├── utils/                 ApiError, asyncHandler, helpers, logger
│       └── seed/data.js           The design's numbers as data
│
└── client/                        Next.js 14 frontend
    ├── .env.example
    ├── next.config.mjs
    ├── jsconfig.json             `@/*` → `src/*` path alias
    └── src/
        ├── app/
        │   ├── layout.jsx        Providers + global CSS
        │   ├── page.jsx          → /dashboard
        │   ├── login/
        │   └── (dashboard)/      Authenticated route group
        │       ├── layout.jsx    Sidebar + topbar shell
        │       ├── dashboard/page.jsx
        │       ├── point-of-sale/page.jsx
        │       ├── inventory/page.jsx
        │       ├── employees/page.jsx
        │       └── reports/page.jsx
        ├── components/
        │   ├── layout/           Sidebar, Topbar
        │   └── ui/               Card, Kpi, Chip, Tabs, Modal, Icons, Charts
        ├── lib/                  api.js · endpoints.js · format.js
        ├── hooks/                useFetch · useDebounced
        └── providers/            AuthProvider · ToastProvider
```

   MONGODB_DB_NAME=aquapure
   ```

5. Re-seed and restart:

   ```bash
   cd server && npm run seed:fresh && npm run dev
   ```

A local `mongod` works too — use `mongodb://127.0.0.1:27017`.

> **Note:** `mongodb-memory-server` is a *development* convenience only. It is a
> `devDependency` and is never loaded when `MONGODB_URI` is set.

---

## API reference

Base URL `http://localhost:5000/api`.
Every response uses `{ success, data, meta? }`; errors use
`{ success: false, message, details? }`.

`GET /health` is public. `POST /auth/login` and `POST /auth/register` are public.
**Everything else needs `Authorization: Bearer <token>`.**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/health` | Liveness check |
| `POST` | `/auth/login` | Sign in → `{ token, user }` |
| `POST` | `/auth/register` | Create an account |
| `GET` | `/auth/me` | Current user |
| `GET` | `/dashboard/summary` | Every dashboard widget in one call |
| `GET` | `/dashboard/notifications` | Bell-badge counts |
| `GET` `POST` | `/products` | POS catalogue (`?category=&search=&isActive=`) |
| `GET` `PUT` `DELETE` | `/products/:id` | Single product |
| `GET` | `/inventory` | Stock levels + `meta.summary` KPIs (`?archived=true` = archived only) |
| `GET` | `/inventory/summary` | Inventory KPI row only |
| `GET` | `/inventory/alerts` | Low/critical items for the banner |
| `GET` | `/inventory/pos-supplies` | Stock flagged "Sell at POS" — the POS Supplies grid (`?search=&category=`) |
| `POST` | `/inventory/:id/restock` | Adjust stock (negative = write-off) |
| `POST` | `/inventory/:id/archive` | Soft delete — hidden from lists, KPIs and alerts |
| `POST` | `/inventory/:id/restore` | Undo an archive |
| `GET` `POST` | `/containers` | Container assets (`?status=&size=`) |
| `GET` | `/containers/summary` | In-station / out / damaged counts |
| `POST` | `/containers/return` | Receive empties `{ containerIds[] }` |
| `GET` `POST` | `/orders` | Transactions (paged, filterable) |
| `GET` | `/orders/code/:orderId` | Look up `TXN-2847` |
| `GET` | `/orders/recent?limit=` | Dashboard transaction table |
| `GET` | `/orders/metrics/summary` | Revenue by payment method & customer type |
| `PATCH` | `/orders/:id/status` | Cancel / refund |
| `GET` `POST` | `/customers` | Accounts + balances |
| `POST` | `/customers/:id/settle` | Record a payment |
| `GET` `POST` | `/employees` | Staff records |
| `GET` | `/employees/performance` | KPIs + quota table + ring data |
| `POST` | `/employees/targets` | Bulk quota update |
| `GET` | `/reports/daily` | End-of-shift X-Read |
| `GET` | `/reports/summary?period=daily\|weekly\|monthly\|yearly` | Reporting Engine — sales + receivables, order volume + delivery fulfillment, gallon balances |
| `GET` | `/reports/shifts` · `/reports/shifts/active` | Shift history |
| `POST` | `/reports/shifts` | Start a shift |
| `PATCH` | `/reports/shifts/:id/reconcile` | Record the cash count |
| `GET` | `/reports/export/orders.csv` | Order CSV |
| `GET` | `/reports/export/employees.csv` | Commission CSV |

---

## Domain rules

**Stock status** — `stockStatus()` in `server/src/config/constants.js`

| Status | Rule |
|--------|------|
| `Critical` | ≤ 2 units, or ≤ 25% of the reorder point |
| `Low Stock` | at or below the reorder point |
| `In Stock` | above the reorder point |
| `Out of Stock` | zero |

**Quota status** — `quotaStatus()`

| Status | Progress |
|--------|----------|
| `Quota Met` | 100% |
| `On Track` | ≥ 80% |
| `Almost There` | ≥ 50% |
| `Lagging` | < 50% |

**POS supplies come from Inventory & Stock** — anything in stock can be rung up
at the POS, and selling it reduces its `stockLevel`. An item is sellable unless
`isSellable` is set to `false`; the default is on, so a newly added item
appears in the POS **Supplies** grid immediately. There is no second product
record to keep in sync. `unitPrice` stays the *cost* used for the inventory
valuation, `sellPrice` is what the customer pays — and when no selling price
is set, the POS falls back to the unit cost so a card never shows ₱0.

The two **Finished Stock** items (*Purified Water (5-Gallon)*, *Refillable
Container Stock*) are seeded with `isSellable: false` on purpose: they are the
stock *behind* the Refills/Packages products, which already draw them down.
Listing them as supplies too would let the same water be sold twice.

A cart line references either a `product` or an `inventoryItem` — never both,
never neither. Both are priced server-side and **both draw their stock down**,
so selling 100 pcs of an item sitting at 300 leaves 200. Stock is checked
before anything is written, so a short order is refused whole rather than
partially applied. Archiving an item clears `isSellable`, retiring it from the
till.

> **Upgrading an existing database.** Mongoose applies schema defaults when
> *writing*, never when *reading*, so items stored before these fields existed
> have no `isSellable` at all and stay off the till until back-filled. Run
> `npm run pos:backfill` to preview, then `npm run pos:backfill -- --write`.
> It only touches the POS fields and is safe to re-run.

**Cash drawer**

```
expected = openingFloat + cashSales − cashRefunds
variance = actualCash − expected        // 0 = balanced
```

**Completing a sale** (`order.service.create`) resolves prices from the database —
never from the client — then, inside a transaction (when the deployment is a
replica set) it: decrements linked stock, issues a container for *New Container*
sales, increases the customer's balance for *On-Account*, updates the staff
member's units/revenue, and adds the amount to the shift's cash drawer.


---

## Scripts

**server/**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon |
| `npm start` | Start normally |
| `npm run seed` | Load demo data (warns if data already exists) |
| `npm run seed:fresh` | Wipe every collection, then seed |
| `npm run pos:backfill` | Add the POS fields to pre-existing inventory items (`-- --write` to apply) |
| `npm run smoke` | 102 end-to-end API tests (own in-memory DB) |
| `npm run verify` | 10 live checks against a running server |
| `npm run check:db` | Test the MongoDB connection and print a diagnosis |

**client/**

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run check:jsx` | Compile the edited pages with the Next.js SWC compiler |
| `npm run verify` | 7 route checks against a running client |

### Tests and checks

| Command | What it proves |
|---------|----------------|
| `server: npm run smoke` | 102 API tests — auth, validation, every CRUD route, the sale transaction, cash reconciliation, the Reporting Engine + ledgers, CSV export, error handling |
| `server: npm run verify` | 10 live checks — login, dashboard aggregates, a real sale, stock decrement, 401 handling |
| `client: npm run verify` | 7 routes serve real HTML |
| `client: npm run build` | Compiles, lints and prerenders all 10 pages |

---

## Design notes

- **No UI library.** Cards, tabs, tables, modals, toasts and the donut/ring
  charts are hand-built in `client/src/components/ui` — CSS only, plus inline
  SVG. This keeps the bundle small and the visuals exactly on-spec.
- **Icons** are inline SVG in `components/ui/Icons.jsx`, inheriting `currentColor`.
- **No chart library.** `components/ui/Charts.jsx` renders the donuts, progress
  rings, and the Reporting Engine's period bar/line charts directly.
- The client talks to the API through a single `lib/api.js` fetch wrapper; the
  endpoint map lives in `lib/endpoints.js`.

---

## Troubleshooting

**"Cannot reach the server" on the login screen** — the API isn't running.
Start it with `cd server && npm run dev` and confirm
`http://localhost:5000/api/health` returns JSON.

**401 immediately after login** — the browser has a stale token in
`localStorage` (`aquapure_token`). Clear site data, or the `AuthProvider` will
drop it on the next load once `/auth/me` fails.

**Dashboard shows zeros** — the database is empty. Run
`cd server && npm run seed` (in-memory) or `npm run seed:fresh` (Atlas).

**CORS error in the browser console** — add your frontend origin to
`CORS_ORIGINS` in `server/.env` (default is `http://localhost:3000`).

**Atlas connection refused** — your IP isn't in the cluster's Network Access
list, or the password in the URI contains characters that need URL-encoding.

Diagnose it in one command:

```bash
cd server && npm run check:db
```

That prints the resolved host, the database name, whether transactions are
available, and the document counts — and on failure it tells you which of the
three common problems it is (bad password, IP not allowlisted, or a sleeping
free-tier cluster).

To fix the most common one, in Atlas go to **Network Access → IP Address List →
Add My Current IP Address**. The free tier detects your IP automatically; you can
also enter `0.0.0.0/0` to allow any address while developing locally.

