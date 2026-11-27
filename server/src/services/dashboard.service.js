const orderService = require('./order.service');
const inventoryService = require('./inventory.service');
const containerService = require('./container.service');
const employeeService = require('./employee.service');
const Shift = require('../models/Shift');
const { startOfDay, endOfDay, daysAgo, round2, percent } = require('../utils/helpers');

/** Percentage change between two numbers, or null when there is no baseline. */
const delta = (current, previous) => {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
};

/**
 * Everything the Dashboard Overview screen needs, in one round trip:
 * stock alerts, KPI cards, employee quota progress, quick actions,
 * container assets and recent transactions.
 */
async function summary({ date } = {}) {
  const day = date ? startOfDay(date) : startOfDay();
  const yesterday = daysAgo(1);
  const range = { from: startOfDay(day), to: endOfDay(day) };
  const prevRange = { from: startOfDay(yesterday), to: endOfDay(yesterday) };

  const [today, prev, alerts, containers, staffPerf, recentOrders, activeShift] =
    await Promise.all([
      orderService.metrics(range),
      orderService.metrics(prevRange),
      inventoryService.alerts({ limit: 6 }),
      containerService.summary(),
      employeeService.performance({ date: day }),
      orderService.recent(8),
      Shift.findOne({ status: 'active' }).lean(),
    ]);

  // --- Revenue split (Walk-in / Regular / Delivery) --------------------
  const split = { walk_in: 0, regular: 0, delivery: 0 };
  today.byCustomerType.forEach((row) => {
    split[row.type] = row.amount;
  });

  // --- Unreturned containers, split regular vs new ---------------------
  const outRows = await containerService.outstandingBreakdown();

  // --- Top employee -----------------------------------------------------
  const topEmployee = staffPerf.staff
    .filter((e) => e.status === 'active')
    .sort((a, b) => b.revenue - a.revenue)[0];

  const activeStaff = staffPerf.staff.filter((e) => e.status === 'active');
  const totalQuota = activeStaff.reduce((s, e) => s + e.quotaTarget, 0);
  const totalAchieved = activeStaff.reduce((s, e) => s + e.achieved, 0);

  return {
    generatedAt: new Date().toISOString(),
    date: day,
    shift: activeShift
      ? {
          id: activeShift._id,
          name: activeShift.name,
          operatorName: activeShift.operatorName,
          startTime: activeShift.startTime,
          endTime: activeShift.endTime,
          window: `${activeShift.name} · 06:00 – 14:00`,
        }
      : null,

    stockAlerts: alerts,

    kpis: {
      revenue: {
        value: today.revenue,
        delta: delta(today.revenue, prev.revenue),
        deltaLabel: 'vs yesterday',
        walkIn: split.walk_in,
        regular: split.regular,
        delivery: split.delivery,
      },
      unitsRefilled: {
        value: today.unitsRefilled,
        delta: delta(today.unitsRefilled, prev.unitsRefilled),
        deltaLabel: 'vs yesterday',
        target: totalQuota || 500,
        targetPercent: percent(today.unitsRefilled, totalQuota || 500),
        transactions: today.transactions,
      },
      unreturned: {
        value: containers.withCustomer,
        newToday: outRows.newToday,
        regular: outRows.regular,
        newCustomers: outRows.newCustomers,
      },
      topEmployee: topEmployee
        ? {
            id: topEmployee._id,
            name: topEmployee.name,
            role: topEmployee.role,
            initials: topEmployee.initials,
            units: topEmployee.achieved,
            quotaTarget: topEmployee.quotaTarget,
            progress: topEmployee.progress,
            status: topEmployee.performanceStatus,
            revenue: topEmployee.revenue,
          }
        : null,
    },

    quotaProgress: {
      achieved: totalAchieved,
      target: totalQuota,
      percent: percent(totalAchieved, totalQuota),
      staff: activeStaff.map((e) => ({
        id: e._id,
        name: e.name,
        role: e.role,
        initials: e.initials,
        achieved: e.achieved,
        quotaTarget: e.quotaTarget,
        progress: e.progress,
        status: e.performanceStatus,
      })),
    },

    containers,

    recentOrders: recentOrders.map((o) => ({
      id: o._id,
      orderId: o.orderId,
      customerName: o.customerName,
      items: o.itemSummary,
      total: o.total,
      paymentMethod: o.paymentMethod,
      staffName: o.staffName,
      createdAt: o.createdAt,
    })),

    transactionCount: today.transactions,
  };
}

/** Counts needed for the notification bell badge. */
async function notificationCount() {
  const [low, out, transactionCount] = await Promise.all([
    inventoryService.alerts({ limit: 100 }),
    containerService.summary(),
    orderService.metrics({ from: startOfDay() }).then((m) => m.transactions),
  ]);
  return {
    stock: low.length,
    containers: out.withCustomer,
    transactions: transactionCount,
    total: low.length + out.withCustomer,
  };
}

module.exports = { summary, notificationCount, delta };
