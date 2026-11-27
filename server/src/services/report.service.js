const orderService = require('./order.service');
const employeeService = require('./employee.service');
const containerService = require('./container.service');
const inventoryService = require('./inventory.service');
const Shift = require('../models/Shift');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { ORDER_STATE, PAYMENT_METHOD } = require('../config/constants');
const { startOfDay, endOfDay, round2, toCsv } = require('../utils/helpers');

/** "06:00 â€“ 14:00" for the shift banner. */
function shiftWindow(shift) {
  const fmt = (d) =>
    new Date(d).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  if (shift.startTime && shift.endTime) return `${fmt(shift.startTime)} â€“ ${fmt(shift.endTime)}`;
  return '06:00 â€“ 14:00';
}

/**
 * Cash drawer reconciliation:
 *   openingFloat + cashSales âˆ’ cashRefunds = expected in drawer,
 * compared against what was physically counted.
 */
async function buildReconciliation(metrics, shift) {
  const cash = metrics.byMethod.find((m) => m.method === PAYMENT_METHOD.CASH);
  const cashSales = cash?.amount || 0;
  const cashCount = cash?.count || 0;
  const cashRefunds = shift?.cashRefunds || 0;
  const openingFloat = shift?.openingFloat ?? 0;
  const expectedCash = round2(openingFloat + cashSales - cashRefunds);
  const actualCash = shift?.actualCash ?? 0;
  const variance = round2(actualCash - expectedCash);

  return {
    openingFloat,
    cashSales,
    cashCount,
    cashRefunds,
    expectedCash,
    actualCash,
    variance,
    balanced: shift?.reconciled ? Math.abs(variance) < 0.01 : null,
    reconciled: Boolean(shift?.reconciled),
    countedBy: shift?.countedBy || null,
  };
}

/** The "end-of-shift X-Read" screen: one object, fully rendered by the client. */
async function dailyReport({ date, shiftId } = {}) {
  const day = date ? startOfDay(date) : startOfDay();
  const from = startOfDay(day);
  const to = endOfDay(day);

  const [metrics, staff, containers, alerts, shift, orders] = await Promise.all([
    orderService.metrics({ from, to }),
    employeeService.performance({ date: day }),
    containerService.summary(),
    inventoryService.alerts({ limit: 8 }),
    shiftId
      ? Shift.findById(shiftId).lean()
      : // A shift is created at an arbitrary time on its calendar day, so
        // match the day as a range rather than an exact timestamp.
        Shift.findOne({ date: { $gte: from, $lte: to } })
          .sort({ createdAt: -1 })
          .lean(),
    Order.find({
      createdAt: { $gte: from, $lte: to },
      status: ORDER_STATE.COMPLETED,
    })
      .sort({ createdAt: -1 })
      .lean({ virtuals: true }),
  ]);

  const reconciliation = await buildReconciliation(metrics, shift);
  const activeStaff = staff.staff.filter((e) => e.status === 'active');

  return {
    date: day,
    shift: shift
      ? {
          id: shift._id,
          name: shift.name,
          label: shift.label || `${shift.name} Shift X-Read`,
          window: shiftWindow(shift),
          operator: shift.operatorName || 'â€”',
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
        }
      : null,
    headline: {
      grossRevenue: metrics.revenue,
      totalTransactions: metrics.transactions,
      unitsRefilled: metrics.unitsRefilled,
      containersReturned: containers.returnedToday,
    },
    reconciliation,
    paymentBreakdown: metrics.byMethod,
    customerMix: metrics.byCustomerType,
    perEmployee: activeStaff.map((e) => ({
      id: e._id,
      name: e.name,
      units: e.achieved,
      revenue: e.revenue,
      commission: e.commission,
      quotaTarget: e.quotaTarget,
      progress: e.progress,
      status: e.performanceStatus,
    })),
    totals: {
      units: activeStaff.reduce((s, e) => s + e.achieved, 0),
      revenue: round2(activeStaff.reduce((s, e) => s + e.revenue, 0)),
      commission: round2(activeStaff.reduce((s, e) => s + e.commission, 0)),
    },
    stockAlerts: alerts,
    orderCount: orders.length,
  };
}

/** Records the physical cash count against a shift. */
async function reconcileShift(shiftId, { actualCash, countedBy }) {
  const shift = await Shift.findById(shiftId);
  if (!shift) throw ApiError.notFound('Shift not found');

  const metrics = await orderService.metrics({
    from: startOfDay(shift.date),
    to: endOfDay(shift.date),
  });
  const drawer = await buildReconciliation(metrics, shift);

  shift.actualCash = round2(actualCash);
  shift.cashSales = drawer.cashSales;
  shift.cashRefunds = drawer.cashRefunds;
  shift.reconciled = true;
  shift.countedBy = countedBy;
  await shift.save(); // pre-save recomputes expectedCash + variance

  return shift;
}

/** Starts a shift, closing any other shift still marked active. */
async function startShift({ name, operator, openingFloat = 0 }) {
  const now = new Date();
  const endOfMorning = new Date(now);
  endOfMorning.setHours(14, 0, 0, 0);

  await Shift.updateMany({ status: 'active' }, { status: 'closed', endTime: now });

  return Shift.create({
    name,
    label: `${name} Shift`,
    date: now,
    startTime: now,
    endTime: endOfMorning,
    operator: operator?._id,
    operatorName: operator?.name,
    openingFloat,
    status: 'active',
  });
}

function listShifts(query = {}) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }
  return Shift.find(filter).sort({ date: -1, createdAt: -1 }).limit(30).lean();
}

const getActiveShift = () => Shift.findOne({ status: 'active' }).lean();

/* -------------------------------------------------------- CSV exports */

/** Full order rows for the "Export CSV" button on the Reports page. */
async function ordersCsv({ date } = {}) {
  const day = date ? startOfDay(date) : startOfDay();
  const orders = await Order.find({
    createdAt: { $gte: startOfDay(day), $lte: endOfDay(day) },
    status: ORDER_STATE.COMPLETED,
  })
    .sort({ createdAt: 1 })
    .lean();

  const summary = (o) => (o.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ');

  const header = [
    'Order ID',
    'Date',
    'Time',
    'Customer',
    'Items',
    'Subtotal',
    'Discount',
    'Total',
    'Payment Method',
    'Cash Received',
    'Change',
    'Staff',
  ];

  const rows = orders.map((o) => [
    o.orderId,
    new Date(o.createdAt).toLocaleDateString('en-CA'),
    new Date(o.createdAt).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    o.customerName,
    o.customerType,
    summary(o),
    o.subtotal,
    o.discount,
    o.total,
    o.paymentMethod,
    o.cashReceived,
    o.change,
    o.staffName || '',
  ]);

  return toCsv([header, ...rows]);
}

/** Per-employee performance rows for CSV export. */
async function employeesCsv({ date } = {}) {
  const { staff } = await employeeService.performance({ date });
  const header = [
    'Employee',
    'Role',
    'Target (gal)',
    'Achieved (gal)',
    'Progress %',
    'Revenue',
    'Commission',
    'Status',
  ];
  const rows = staff.map((e) => [
    e.name,
    e.role,
    e.quotaTarget,
    Math.round(e.achieved),
    e.progress,
    e.revenue,
    e.commission,
    e.performanceStatus,
  ]);
  return toCsv([header, ...rows]);
}

module.exports = {
  dailyReport,
  reconcileShift,
  startShift,
  listShifts,
  getActiveShift,
  ordersCsv,
  employeesCsv,
  buildReconciliation,
};

