const reportService = require('../services/report.service');
const reportEngineService = require('../services/reportEngine.service');
const dashboardService = require('../services/dashboard.service');
const orderService = require('../services/order.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

/** GET /api/dashboard/summary?date= — everything the Overview screen needs. */
const summary = asyncHandler(async (req, res) => {
  const { date } = req.validatedQuery || req.query;
  return ok(res, await dashboardService.summary({ date: date ? new Date(date) : undefined }));
});

/** GET /api/dashboard/notifications — bell-badge counts. */
const notifications = asyncHandler(async (req, res) =>
  ok(res, await dashboardService.notificationCount()),
);

/** GET /api/reports/daily?date=&shiftId= — end-of-shift X-Read. */
const daily = asyncHandler(async (req, res) => {
  const { date, shiftId } = req.validatedQuery || req.query;
  return ok(
    res,
    await reportService.dailyReport({
      date: date ? new Date(date) : undefined,
      shiftId,
    }),
  );
});

/** GET /api/reports/shifts?status= */
const shifts = asyncHandler(async (req, res) =>
  ok(res, await reportService.listShifts(req.validatedQuery || req.query)),
);

/** GET /api/reports/summary?period=daily|weekly|monthly|yearly&date= — Reporting Engine. */
const engineSummary = asyncHandler(async (req, res) => {
  const { period, date } = req.validatedQuery || req.query;
  return ok(
    res,
    await reportEngineService.buildReport({ period, date: date ? new Date(date) : undefined }),
  );
});

/** GET /api/reports/shifts/active */
const activeShift = asyncHandler(async (req, res) => ok(res, await reportService.getActiveShift()));

/** POST /api/reports/shifts  { name, operator, openingFloat } */
const startShift = asyncHandler(async (req, res) => ok(res, await reportService.startShift(req.body)));

/** PATCH /api/reports/shifts/:id/reconcile  { actualCash, countedBy } */
const reconcile = asyncHandler(async (req, res) =>
  ok(res, await reportService.reconcileShift(req.params.id, req.body)),
);

/** GET /api/reports/export/orders.csv?date= */
const exportOrders = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const csv = await reportService.ordersCsv({ date: date ? new Date(date) : undefined });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="aquapure-orders.csv"');
  return res.send(csv);
});

/** GET /api/reports/export/employees.csv?date= */
const exportEmployees = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const csv = await reportService.employeesCsv({ date: date ? new Date(date) : undefined });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="aquapure-employees.csv"');
  return res.send(csv);
});

/** GET /api/reports/reconciliation?date= — cash drawer panel on its own. */
const reconciliation = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const day = date ? new Date(date) : undefined;
  const [metrics, shift] = await Promise.all([
    orderService.metrics({
      from: day ? new Date(new Date(day).setHours(0, 0, 0, 0)) : undefined,
      to: undefined,
    }),
    reportService.getActiveShift(),
  ]);
  return ok(res, await reportService.buildReconciliation(metrics, shift));
});

module.exports = {
  summary,
  notifications,
  daily,
  engineSummary,
  shifts,
  activeShift,
  startShift,
  reconcile,
  exportOrders,
  exportEmployees,
  reconciliation,
};
