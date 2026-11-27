/**
 * Reporting Engine.
 *
 * Produces the data behind the Daily / Weekly / Monthly / Yearly visual
 * reports for:
 *   1. Sales Revenue & Unpaid Receivables
 *   2. Order Volume & Delivery Fulfillment
 *   3. Gallon Inventory Balances (In Store, Delivered, Returned, Damaged)
 *
 * Every window is split into chart-sized buckets (hours for a day, days for
 * a week/month, months for a year) and the raw documents are folded into
 * those buckets in local time — the same boundaries the X-Read and the
 * dashboard already use. Data volumes for a single station are small, so
 * bucketing in JS keeps the maths identical to `startOfDay`/`endOfDay`
 * instead of fighting MongoDB's UTC-only date truncation.
 */
const Order = require('../models/Order');
const Container = require('../models/Container');
const Customer = require('../models/Customer');
const {
  CUSTOMER_TYPES,
  PAYMENT_METHOD,
  ORDER_STATE,
  CONTAINER_STATUS,
} = require('../config/constants');
const { round2, percent, startOfDay, endOfDay } = require('../utils/helpers');

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];
const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Resolves the [from, to] window for a period plus the chart buckets that
 * cover it. `anchor` picks the day / week / month / year being reported on.
 */
function resolveWindow(period = 'daily', anchor = new Date()) {
  const day = startOfDay(anchor);
  const buckets = [];
  let from;
  let to;

  if (period === 'weekly') {
    // The 7 days ending on the anchor date — matches how the dashboard
    // frames "the last 7 days".
    from = new Date(day);
    from.setDate(from.getDate() - 6);
    to = endOfDay(day);
    for (let i = 0; i < 7; i += 1) {
      const start = new Date(from);
      start.setDate(start.getDate() + i);
      buckets.push({
        label: start.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
        start,
        end: endOfDay(start),
      });
    }
  } else if (period === 'monthly') {
    from = new Date(day.getFullYear(), day.getMonth(), 1);
    to = endOfDay(new Date(day.getFullYear(), day.getMonth() + 1, 0));
    for (let d = 1; d <= to.getDate(); d += 1) {
      const start = new Date(day.getFullYear(), day.getMonth(), d);
      buckets.push({ label: String(d), start, end: endOfDay(start) });
    }
  } else if (period === 'yearly') {
    from = new Date(day.getFullYear(), 0, 1);
    to = endOfDay(new Date(day.getFullYear(), 11, 31));
    for (let m = 0; m < 12; m += 1) {
      buckets.push({
        label: MONTH_LABELS[m],
        start: new Date(day.getFullYear(), m, 1),
        end: endOfDay(new Date(day.getFullYear(), m + 1, 0)),
      });
    }
  } else {
    // Daily → 24 hourly buckets, labelled in 24-hour time like the shift
    // window banner ("06:00 – 14:00").
    from = startOfDay(day);
    to = endOfDay(day);
    for (let h = 0; h < 24; h += 1) {
      const start = new Date(day);
      start.setHours(h, 0, 0, 0);
      const end = new Date(day);
      end.setHours(h, 59, 59, 999);
      buckets.push({ label: `${String(h).padStart(2, '0')}:00`, start, end });
    }
  }

  return { from, to, buckets };
}

/** Index of the bucket a timestamp falls into, or -1 when outside. */
function bucketIndexFor(value, buckets) {
  const t = new Date(value).getTime();
  for (let i = 0; i < buckets.length; i += 1) {
    if (t >= buckets[i].start.getTime() && t <= buckets[i].end.getTime()) return i;
  }
  return -1;
}

/** Gallons represented by an order's line items (gallons × qty). */
const orderGallons = (items) =>
  round2((items || []).reduce((s, i) => s + (Number(i.gallons) || 0) * (Number(i.qty) || 0), 0));

/** Ledger wording — matches the printed report design. */
const PAYMENT_DISPLAY = { cash: 'Cash', gcash: 'GCash', on_account: 'Unpaid (Credit)' };

/** Completed deliveries read as "Delivered" in the sales ledger. */
function statusDisplay(order) {
  if (order.status === ORDER_STATE.COMPLETED) {
    return order.customerType === 'delivery' ? 'Delivered' : 'Completed';
  }
  if (order.status === ORDER_STATE.CANCELLED) return 'Cancelled';
  if (order.status === ORDER_STATE.REFUNDED) return 'Refunded';
  return order.status;
}

/** "Sep 01" — used by the monthly report's week ranges. */
const shortStamp = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

/** Builds the full Reporting Engine payload for one period + anchor date. */
async function buildReport({ period = 'daily', date } = {}) {
  const key = PERIODS.includes(period) ? period : 'daily';
  const anchor = date ? startOfDay(date) : startOfDay();
  const { from, to, buckets } = resolveWindow(key, anchor);

  const rows = buckets.map(() => ({
    // 1. sales
    revenue: 0,
    onAccount: 0,
    refunds: 0,
    // 2. volume
    orders: 0,
    counterOrders: 0,
    deliveries: 0,
    deliveryFulfilled: 0,
    // 3. gallons
    gallonsSold: 0,
    delivered: 0,
    returned: 0,
    damaged: 0,
    inStore: 0,
  }));

  // Containers refilled per size, per bucket — drives the "Refilled" column
  // of the gallon-movement ledger and the monthly top-seller lookup.
  const sizeQtyByBucket = buckets.map(() => new Map());

  const [orders, containers, receivableAgg, topDebtors] = await Promise.all([
    Order.find({ createdAt: { $gte: from, $lte: to } })
      .select(
        'createdAt orderId customer customerName customerType total status paymentMethod paymentStatus ' +
          'items.name items.qty items.gallons items.product',
      )
      .populate('customer', 'balance')
      .populate('items.product', 'containerSize name')
      .lean(),
    // All containers — the in-store trend is reconstructed from the latest
    // movement stamps, which reach back before the window.
    Container.find({}).select('status size issuedAt returnedAt createdAt').lean(),
    Customer.aggregate([
      { $match: { isActive: true, balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' }, customers: { $sum: 1 } } },
    ]),
    Customer.find({ isActive: true, balance: { $gt: 0 } })
      .select('name type balance')
      .sort({ balance: -1 })
      .limit(5)
      .lean(),
  ]);

  const salesTotals = { revenue: 0, collected: 0, onAccount: 0, refunds: 0 };
  const statusCounts = { completed: 0, cancelled: 0, refunded: 0 };
  const byCustomerType = new Map(
    CUSTOMER_TYPES.map((type) => [type, { type, count: 0, amount: 0 }]),
  );

  orders.forEach((o) => {
    const i = bucketIndexFor(o.createdAt, buckets);
    if (i < 0) return;
    const total = Number(o.total) || 0;

    /* --------------------------------------------- 2. volume rows */
    rows[i].orders += 1;
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    if (o.customerType === 'delivery') {
      rows[i].deliveries += 1;
      if (o.status === ORDER_STATE.COMPLETED) rows[i].deliveryFulfilled += 1;
    } else {
      rows[i].counterOrders += 1;
    }

    // Gallons per line = product gallons × qty. Only completed sales count.
    const lineGallons = orderGallons(o.items);
    (o.items || []).forEach((line) => {
      const size = line.product?.containerSize;
      if (!size) return;
      const map = sizeQtyByBucket[i];
      map.set(size, (map.get(size) || 0) + (Number(line.qty) || 0));
    });

    /* --------------------------------------------- 1. revenue rows */
    if (o.status === ORDER_STATE.COMPLETED) {
      rows[i].gallonsSold = round2(rows[i].gallonsSold + lineGallons);
      rows[i].revenue = round2(rows[i].revenue + total);
      salesTotals.revenue = round2(salesTotals.revenue + total);
      if (o.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT) {
        // On-account credit is revenue earned but not yet collected —
        // it lands in receivables until the customer settles up.
        rows[i].onAccount = round2(rows[i].onAccount + total);
        salesTotals.onAccount = round2(salesTotals.onAccount + total);
      } else {
        salesTotals.collected = round2(salesTotals.collected + total);
      }
      const split = byCustomerType.get(o.customerType) || {
        type: o.customerType,
        count: 0,
        amount: 0,
      };
      split.count += 1;
      split.amount = round2(split.amount + total);
      byCustomerType.set(o.customerType, split);
    } else if (o.status === ORDER_STATE.REFUNDED) {
      rows[i].refunds = round2(rows[i].refunds + total);
      salesTotals.refunds = round2(salesTotals.refunds + total);
    }
  });

  const receivable = receivableAgg[0] || { total: 0, customers: 0 };

  /* ------------------------------------------------ 3. gallon balance */

  const balances = {
    inStore: containers.filter((c) => c.status === CONTAINER_STATUS.IN_STATION).length,
    delivered: containers.filter((c) => c.status === CONTAINER_STATUS.WITH_CUSTOMER).length,
    damaged: containers.filter((c) => c.status === CONTAINER_STATUS.DAMAGED).length,
  };
  balances.total = balances.inStore + balances.delivered + balances.damaged;

  containers.forEach((c) => {
    if (c.issuedAt) {
      const i = bucketIndexFor(c.issuedAt, buckets);
      if (i >= 0) rows[i].delivered += 1;
    }
    if (c.returnedAt) {
      const i = bucketIndexFor(c.returnedAt, buckets);
      if (i >= 0) {
        // A return that was written off lands in Damaged, not back in store.
        if (c.status === CONTAINER_STATUS.DAMAGED) rows[i].damaged += 1;
        else rows[i].returned += 1;
      }
    }
  });

  // Reconstruct the "in store" level at the end of each bucket from the
  // live count: anything issued after that point used to be on the shelf,
  // and anything returned (healthy) after it used to be out. Container
  // timestamps only ever hold the latest movement, so this is an
  // approximation — good enough for a trend line, and clamped at zero.
  const issuedAfter = (t) =>
    containers.filter((c) => c.issuedAt && new Date(c.issuedAt).getTime() > t).length;
  const returnedToStoreAfter = (t) =>
    containers.filter(
      (c) =>
        c.status === CONTAINER_STATUS.IN_STATION &&
        c.returnedAt &&
        new Date(c.returnedAt).getTime() > t,
    ).length;

  buckets.forEach((bucket, i) => {
    const t = bucket.end.getTime();
    rows[i].inStore = Math.max(0, balances.inStore + issuedAfter(t) - returnedToStoreAfter(t));
  });

  /* --------------------------------------------------------- totals */

  const ordersTotals = {
    orders: rows.reduce((s, r) => s + r.orders, 0),
    completed: statusCounts.completed || 0,
    cancelled: statusCounts.cancelled || 0,
    refunded: statusCounts.refunded || 0,
    deliveryOrders: rows.reduce((s, r) => s + r.deliveries, 0),
    deliveryFulfilled: rows.reduce((s, r) => s + r.deliveryFulfilled, 0),
  };
  ordersTotals.deliveryMissed = ordersTotals.deliveryOrders - ordersTotals.deliveryFulfilled;
  ordersTotals.fulfillmentRate = percent(
    ordersTotals.deliveryFulfilled,
    ordersTotals.deliveryOrders,
  );
  ordersTotals.fillRate = percent(ordersTotals.completed, ordersTotals.orders);
  ordersTotals.avgOrderValue = ordersTotals.completed
    ? round2(salesTotals.revenue / ordersTotals.completed)
    : 0;

  const gallonTotals = {
    delivered: rows.reduce((s, r) => s + r.delivered, 0),
    returned: rows.reduce((s, r) => s + r.returned, 0),
    damaged: rows.reduce((s, r) => s + r.damaged, 0),
  };

  /* ---------------------------------------------------------- ledgers */

  const inWindow = (value) => {
    if (!value) return false;
    const t = new Date(value).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };
  const inWindowPoint = (value, bucket) => {
    if (!value) return false;
    const t = new Date(value).getTime();
    return t >= bucket.start.getTime() && t <= bucket.end.getTime();
  };

  // 1. Transaction ledger — one row per order (time, id, customer, type,
  //    items, payment, status, amount). Capped so a yearly window cannot
  //    ship thousands of rows to the browser.
  const LEDGER_CAP = 300;
  const transactions = orders
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, LEDGER_CAP)
    .map((o) => {
      const paymentStatus =
        o.paymentStatus === 'paid' ||
        (o.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT &&
          o.customer &&
          !(Number(o.customer.balance) > 0))
          ? 'paid'
          : o.paymentStatus;
      return {
        time: o.createdAt,
        orderId: o.orderId,
        customerName: o.customerName || 'Walk-In',
        orderType: o.customerType,
        items: (o.items || []).map((line) => `${line.qty}x ${line.name}`).join(', '),
        gallons: orderGallons(o.items),
        paymentMethod: o.paymentMethod,
        paymentStatus,
        paymentLabel:
          paymentStatus === 'paid'
            ? 'Paid'
            : PAYMENT_DISPLAY[o.paymentMethod] || o.paymentMethod,
        status: o.status,
        statusLabel: statusDisplay(o),
        amount: round2(o.total),
        countable: o.status === ORDER_STATE.COMPLETED,
      };
    });

  const transactionTotals = {
    orders: orders.length,
    truncated: orders.length > LEDGER_CAP,
    gallons: round2(transactions.filter((t) => t.countable).reduce((s, t) => s + t.gallons, 0)),
    revenue: salesTotals.revenue,
    delivered: transactions.filter((t) => t.statusLabel === 'Delivered').length,
    pending: transactions.filter(
      (t) =>
        t.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT &&
        t.paymentStatus !== 'paid' &&
        t.countable,
    ).length,
  };

  // 2. Gallon movement per container size — starting stock, refilled,
  //    sent out, empty returned, damaged/lost, ending stock. The in-store
  //    levels use the same reconstruction as the trend line above.
  const inStoreAt = (t, size) => {
    const match = (c) => !size || c.size === size;
    return Math.max(
      0,
      containers.filter((c) => match(c) && c.status === CONTAINER_STATUS.IN_STATION).length +
        containers.filter((c) => match(c) && c.issuedAt && new Date(c.issuedAt).getTime() > t)
          .length -
        containers.filter(
          (c) =>
            match(c) &&
            c.status === CONTAINER_STATUS.IN_STATION &&
            c.returnedAt &&
            new Date(c.returnedAt).getTime() > t,
        ).length,
    );
  };

  const soldSizes = new Set();
  sizeQtyByBucket.forEach((m) => m.forEach((_, size) => soldSizes.add(size)));
  const sizes = [
    ...new Set([...containers.map((c) => c.size).filter(Boolean), ...soldSizes]),
  ].sort();

  const movement = sizes.map((size) => {
    const match = (c) => c.size === size;
    return {
      size,
      starting: inStoreAt(from.getTime(), size),
      refilled: sizeQtyByBucket.reduce((s, m) => s + (m.get(size) || 0), 0),
      sentOut: containers.filter((c) => match(c) && inWindow(c.issuedAt)).length,
      returned: containers.filter(
        (c) => match(c) && inWindow(c.returnedAt) && c.status !== CONTAINER_STATUS.DAMAGED,
      ).length,
      damaged: containers.filter(
        (c) => match(c) && inWindow(c.returnedAt) && c.status === CONTAINER_STATUS.DAMAGED,
      ).length,
      ending: inStoreAt(to.getTime(), size),
    };
  });

  const movementTotals = movement.reduce(
    (acc, r) => ({
      starting: acc.starting + r.starting,
      refilled: acc.refilled + r.refilled,
      sentOut: acc.sentOut + r.sentOut,
      returned: acc.returned + r.returned,
      damaged: acc.damaged + r.damaged,
      ending: acc.ending + r.ending,
    }),
    { starting: 0, refilled: 0, sentOut: 0, returned: 0, damaged: 0, ending: 0 },
  );

  // Containers sent out on a given day that are still with a customer.
  const unreturnedOn = (bucket) =>
    containers.filter(
      (c) =>
        c.status === CONTAINER_STATUS.WITH_CUSTOMER &&
        c.issuedAt &&
        inWindowPoint(c.issuedAt, bucket),
    ).length;

  // 3. Weekly ledger — one row per day (counter vs delivery orders,
  //    gallons sold, revenue, credit sales, unreturned gallons).
  const weekly =
    key === 'weekly'
      ? buckets.map((bucket, i) => ({
          date: bucket.start,
          day: bucket.start.toLocaleDateString('en-US', { weekday: 'long' }),
          counterOrders: rows[i].counterOrders,
          deliveryOrders: rows[i].deliveries,
          gallonsSold: rows[i].gallonsSold,
          revenue: rows[i].revenue,
          receivables: rows[i].onAccount,
          unreturned: unreturnedOn(bucket),
        }))
      : [];

  // 4. Monthly ledger — one row per week (days 1-7, 8-14, …) with the
  //    top-selling container size per week.
  const topSizeFor = (fromIdx, toIdx) => {
    const totalsBySize = new Map();
    for (let i = fromIdx; i <= toIdx; i += 1) {
      sizeQtyByBucket[i].forEach((qty, size) => {
        totalsBySize.set(size, (totalsBySize.get(size) || 0) + qty);
      });
    }
    let best = null;
    totalsBySize.forEach((qty, size) => {
      if (!best || qty > best.qty) best = { size, qty };
    });
    return best && best.qty > 0 ? best.size : '—';
  };

  const monthly = [];
  if (key === 'monthly') {
    for (let startDay = 1, week = 1; startDay <= buckets.length; startDay += 7, week += 1) {
      const fromIdx = startDay - 1;
      const toIdx = Math.min(buckets.length - 1, startDay + 5);
      const slice = rows.slice(fromIdx, toIdx + 1);
      monthly.push({
        week: `Week ${week}`,
        range: `${shortStamp(buckets[fromIdx].start)} - ${shortStamp(buckets[toIdx].end)}`,
        orders: slice.reduce((s, r) => s + r.orders, 0),
        gallonsSold: round2(slice.reduce((s, r) => s + r.gallonsSold, 0)),
        topSeller: topSizeFor(fromIdx, toIdx),
        revenue: round2(slice.reduce((s, r) => s + r.revenue, 0)),
      });
    }
  }

  // 5. Yearly ledger — one row per month. "New containers" counts the
  //    container assets registered that month.
  const yearly = [];
  if (key === 'yearly') {
    buckets.forEach((bucket, i) => {
      yearly.push({
        month: bucket.label,
        orders: rows[i].orders,
        gallonsSold: rows[i].gallonsSold,
        newContainers: containers.filter(
          (c) => c.createdAt && inWindowPoint(c.createdAt, bucket),
        ).length,
        damaged: rows[i].damaged,
        revenue: rows[i].revenue,
      });
    });
  }

  return {
    period: key,
    periodLabel: PERIOD_LABELS[key],
    anchor,
    from,
    to,
    labels: buckets.map((b) => b.label),
    sales: {
      series: buckets.map((b, i) => ({
        label: b.label,
        revenue: rows[i].revenue,
        onAccount: rows[i].onAccount,
        refunds: rows[i].refunds,
      })),
      totals: {
        ...salesTotals,
        collectionRate: percent(salesTotals.collected, salesTotals.revenue),
        avgOrderValue: ordersTotals.avgOrderValue,
      },
      receivables: {
        outstanding: round2(receivable.total),
        customersWithBalance: receivable.customers,
        onAccountInPeriod: salesTotals.onAccount,
        topDebtors: topDebtors.map((c) => ({
          id: c._id,
          name: c.name,
          type: c.type,
          balance: round2(c.balance),
        })),
      },
    },
    orders: {
      series: buckets.map((b, i) => ({
        label: b.label,
        orders: rows[i].orders,
        deliveries: rows[i].deliveries,
        deliveryFulfilled: rows[i].deliveryFulfilled,
      })),
      totals: ordersTotals,
      byCustomerType: [...byCustomerType.values()].map((c) => ({
        ...c,
        percent: percent(c.amount, salesTotals.revenue),
      })),
    },
    gallons: {
      series: buckets.map((b, i) => ({
        label: b.label,
        delivered: rows[i].delivered,
        returned: rows[i].returned,
        damaged: rows[i].damaged,
        inStore: rows[i].inStore,
      })),
      balances,
      totals: gallonTotals,
    },
    /**
     * Tabular ledgers behind the charts — the printed-report layouts:
     * daily transactions + gallon movement, weekly day rows, monthly week
     * rows, yearly month rows. Only the rows for the active period are
     * populated.
     */
    ledgers: {
      transactions,
      transactionTotals,
      movement,
      movementTotals,
      weekly,
      monthly,
      yearly,
    },
  };
}

module.exports = { buildReport, resolveWindow, bucketIndexFor, PERIODS, PERIOD_LABELS };