'use client';

/**
 * Tabular ledgers for the Reporting Engine — the printed-report layouts:
 *
 *   Daily   → A. Sales & Orders ledger (one row per transaction)
 *             B. Gallon Inventory Movement (per container size)
 *   Weekly  → one row per day (counter vs delivery, gallons, revenue,
 *             credit sales, unreturned gallons)
 *   Monthly → one row per week (+ top-selling container)
 *   Yearly  → one row per month (+ new containers & write-offs)
 */
import { peso, num, time, shortDate, customerTypeLabel } from '@/lib/format';
import { Card, State } from '@/components/ui';

const STATUS_TONE = {
  Delivered: 'success',
  Completed: 'neutral',
  Cancelled: 'danger',
  Refunded: 'warning',
};

/** Chip styling for the #ORD-### id column. */
const CODE_CHIP = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  background: 'var(--surface-3)',
  borderRadius: 6,
  padding: '2px 7px',
  color: 'var(--text-2)',
};

const TOTAL_ROW_STYLE = { background: 'var(--surface-2)', fontWeight: 800 };

export default function ReportLedgers({ data }) {
  const { period, ledgers } = data;
  if (!ledgers) return null;

  if (period === 'daily') {
    return (
      <>
        <TransactionsLedger ledgers={ledgers} />
        <MovementLedger ledgers={ledgers} />
      </>
    );
  }
  if (period === 'weekly') return <WeeklyLedger rows={ledgers.weekly} />;
  if (period === 'monthly') return <MonthlyLedger rows={ledgers.monthly} />;
  if (period === 'yearly') return <YearlyLedger rows={ledgers.yearly} />;
  return null;
}

/* -------------------------------------------------- A. daily transactions */

function TransactionsLedger({ ledgers }) {
  const { transactions: rows, transactionTotals: t } = ledgers;

  return (
    <Card
      title="A. Daily Sales & Orders Report"
      sub="Tracks individual transactions, payment methods, delivery channels, and total revenue."
      flush
    >
      {rows.length === 0 ? (
        <State title="No transactions" message="Orders placed on this day appear here." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Order Type</th>
                <th>Items / Gallons</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th className="num">Amount (₱)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId}>
                  <td style={{ fontWeight: 700 }}>{time(r.time)}</td>
                  <td>
                    <span style={CODE_CHIP}>{r.orderId}</span>
                  </td>
                  <td>{r.customerName}</td>
                  <td>{customerTypeLabel(r.orderType)}</td>
                  <td>
                    {r.items || '—'}
                    {r.gallons > 0 && <span className="table__muted"> · {num(r.gallons)} gal</span>}
                  </td>
                  <td>{r.paymentLabel}</td>
                  <td>
                    <span className={`chip chip--${STATUS_TONE[r.statusLabel] || 'neutral'}`}>
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="num">{peso(r.amount)}</td>
                </tr>
              ))}
              <tr style={TOTAL_ROW_STYLE}>
                <td>TOTAL</td>
                <td>{num(t.orders)} Orders</td>
                <td>—</td>
                <td>—</td>
                <td>{num(t.gallons)} Gallons</td>
                <td>—</td>
                <td>
                  {num(t.delivered)} Delivered / {num(t.pending)} Credit
                </td>
                <td className="num">{peso(t.revenue)}</td>
              </tr>
            </tbody>
          </table>
          {t.truncated && (
            <div className="ledger-note">
              Showing the 300 most recent transactions of {num(t.orders)}.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------- B. gallon movement */

function MovementLedger({ ledgers }) {
  const { movement: rows, movementTotals: t } = ledgers;

  return (
    <Card
      title="B. Gallon Inventory Movement"
      sub="Tracks container balances to avoid missing or unreturned gallons."
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Container Type</th>
              <th className="num">Starting Stock (In Store)</th>
              <th className="num">Refilled</th>
              <th className="num">Sent Out (Sold/Delivered)</th>
              <th className="num">Empty Returned</th>
              <th className="num">Damaged / Lost</th>
              <th className="num">Ending Stock (In Store)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <State
                    title="No containers yet"
                    message="Container assets appear here once registered."
                  />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.size}>
                  <td style={{ fontWeight: 700 }}>{r.size}</td>
                  <td className="num">{num(r.starting)}</td>
                  <td className="num">{num(r.refilled)}</td>
                  <td className="num">{num(r.sentOut)}</td>
                  <td className="num">{num(r.returned)}</td>
                  <td
                    className="num"
                    style={r.damaged > 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}
                  >
                    {num(r.damaged)}
                  </td>
                  <td className="num">{num(r.ending)}</td>
                </tr>
              ))
            )}
            <tr style={TOTAL_ROW_STYLE}>
              <td>TOTAL</td>
              <td className="num">{num(t.starting)}</td>
              <td className="num">{num(t.refilled)}</td>
              <td className="num">{num(t.sentOut)}</td>
              <td className="num">{num(t.returned)}</td>
              <td className="num">{num(t.damaged)}</td>
              <td className="num">{num(t.ending)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- C. weekly rows */

function WeeklyLedger({ rows }) {
  const t = rows.reduce(
    (acc, r) => ({
      counterOrders: acc.counterOrders + r.counterOrders,
      deliveryOrders: acc.deliveryOrders + r.deliveryOrders,
      gallonsSold: acc.gallonsSold + r.gallonsSold,
      revenue: acc.revenue + r.revenue,
      receivables: acc.receivables + r.receivables,
      unreturned: acc.unreturned + r.unreturned,
    }),
    { counterOrders: 0, deliveryOrders: 0, gallonsSold: 0, revenue: 0, receivables: 0, unreturned: 0 },
  );

  return (
    <Card
      title="Weekly Report"
      sub="Summarizes daily performance to identify high-volume sales days and operational bottlenecks."
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th className="num">Counter Orders</th>
              <th className="num">Delivery Orders</th>
              <th className="num">Total Gallons Sold</th>
              <th className="num">Revenue (₱)</th>
              <th className="num">Receivables / Credit (₱)</th>
              <th className="num">Unreturned Gallons</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td style={{ fontWeight: 700 }}>{shortDate(r.date)}</td>
                <td>{r.day}</td>
                <td className="num">{num(r.counterOrders)}</td>
                <td className="num">{num(r.deliveryOrders)}</td>
                <td className="num">{num(r.gallonsSold)}</td>
                <td className="num">{peso(r.revenue)}</td>
                <td className="num" style={r.receivables > 0 ? { color: 'var(--warning, #b45309)' } : undefined}>
                  {peso(r.receivables)}
                </td>
                <td className="num" style={r.unreturned > 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                  {num(r.unreturned)}
                </td>
              </tr>
            ))}
            <tr style={TOTAL_ROW_STYLE}>
              <td>TOTAL</td>
              <td>{rows.length} Days</td>
              <td className="num">{num(t.counterOrders)}</td>
              <td className="num">{num(t.deliveryOrders)}</td>
              <td className="num">{num(t.gallonsSold)}</td>
              <td className="num">{peso(t.revenue)}</td>
              <td className="num">{peso(t.receivables)}</td>
              <td className="num">{num(t.unreturned)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------ D. monthly rows */

function MonthlyLedger({ rows }) {
  const t = rows.reduce(
    (acc, r) => ({
      orders: acc.orders + r.orders,
      gallonsSold: acc.gallonsSold + r.gallonsSold,
      revenue: acc.revenue + r.revenue,
    }),
    { orders: 0, gallonsSold: 0, revenue: 0 },
  );
  // Top seller across the whole month = the week leader that sold most;
  // computed here from week rows would need per-size totals, so the engine
  // sends the per-week leader and we show the most frequent one.
  const topOfMonth = rows.reduce((best, r) => {
    if (r.topSeller === '—') return best;
    const count = rows.filter((x) => x.topSeller === r.topSeller).length;
    return !best || count > best.count ? { size: r.topSeller, count } : best;
  }, null);

  return (
    <Card
      title="Monthly Report"
      sub="Provides high-level operational insights, peak container demand, and overall monthly earnings."
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Date Range</th>
              <th className="num">Total Orders</th>
              <th className="num">Refilled Gallons</th>
              <th>Top Selling Container</th>
              <th className="num">Gross Revenue (₱)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week}>
                <td style={{ fontWeight: 700 }}>{r.week}</td>
                <td>{r.range}</td>
                <td className="num">{num(r.orders)}</td>
                <td className="num">{num(r.gallonsSold)}</td>
                <td>{r.topSeller}</td>
                <td className="num">{peso(r.revenue)}</td>
              </tr>
            ))}
            <tr style={TOTAL_ROW_STYLE}>
              <td>TOTAL</td>
              <td>Full Month</td>
              <td className="num">{num(t.orders)}</td>
              <td className="num">{num(t.gallonsSold)}</td>
              <td>{topOfMonth ? topOfMonth.size : '—'}</td>
              <td className="num">{peso(t.revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- E. yearly rows */

function YearlyLedger({ rows }) {
  const t = rows.reduce(
    (acc, r) => ({
      orders: acc.orders + r.orders,
      gallonsSold: acc.gallonsSold + r.gallonsSold,
      newContainers: acc.newContainers + r.newContainers,
      damaged: acc.damaged + r.damaged,
      revenue: acc.revenue + r.revenue,
    }),
    { orders: 0, gallonsSold: 0, newContainers: 0, damaged: 0, revenue: 0 },
  );

  return (
    <Card
      title="Yearly Report"
      sub="Used for business growth analysis, annual capacity planning, and tracking missing container write-offs."
      flush
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Total Orders</th>
              <th className="num">Gallons Sold</th>
              <th className="num">New Gallons Registered</th>
              <th className="num">Lost / Damaged Gallons</th>
              <th className="num">Gross Sales (₱)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td style={{ fontWeight: 700 }}>{r.month}</td>
                <td className="num">{num(r.orders)}</td>
                <td className="num">{num(r.gallonsSold)}</td>
                <td className="num">{num(r.newContainers)}</td>
                <td
                  className="num"
                  style={r.damaged > 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}
                >
                  {num(r.damaged)}
                </td>
                <td className="num">{peso(r.revenue)}</td>
              </tr>
            ))}
            <tr style={TOTAL_ROW_STYLE}>
              <td>ANNUAL TOTAL</td>
              <td className="num">{num(t.orders)}</td>
              <td className="num">{num(t.gallonsSold)}</td>
              <td className="num">{num(t.newContainers)} Units</td>
              <td className="num">{num(t.damaged)} Units</td>
              <td className="num">{peso(t.revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}