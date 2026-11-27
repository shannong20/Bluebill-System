const employeeService = require('../services/employee.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');
const { startOfDay } = require('../utils/helpers');

/**
 * GET /api/employees?role=&status=&search=&date=&archived=
 *
 * `date` picks which day's figures to roll up; it deliberately does not narrow
 * the roster, so staff stay listed even if their record is stamped with an
 * older day.
 */
const list = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  return ok(res, await employeeService.list(query));
});

/** GET /api/employees/performance?date= — KPIs + quota table + rings. */
const performance = asyncHandler(async (req, res) => {
  const { date } = req.validatedQuery || req.query;
  return ok(res, await employeeService.performance({ date: date ? new Date(date) : undefined }));
});

const getById = asyncHandler(async (req, res) =>
  ok(res, await employeeService.getById(req.params.id)),
);

const create = asyncHandler(async (req, res) => created(res, await employeeService.create(req.body)));

const update = asyncHandler(async (req, res) =>
  ok(res, await employeeService.update(req.params.id, req.body)),
);

const remove = asyncHandler(async (req, res) => {
  await employeeService.remove(req.params.id);
  return noContent(res);
});

/** POST /api/employees/targets  { targets: [{ employee, quotaTarget }] } */
const setTargets = asyncHandler(async (req, res) =>
  ok(res, await employeeService.setTargets(req.body.targets)),
);

/** POST /api/employees/reset-metrics  { date? } — roll the day over. */
const resetMetrics = asyncHandler(async (req, res) => {
  const { date } = req.body || {};
  return ok(res, await employeeService.resetDailyMetrics(date ? new Date(date) : startOfDay()));
});

/** POST /api/employees/:id/archive — soft delete, keeps sales history. */
const archive = asyncHandler(async (req, res) =>
  ok(res, await employeeService.archive(req.params.id)),
);

/** POST /api/employees/:id/restore — put an archived employee back. */
const restore = asyncHandler(async (req, res) =>
  ok(res, await employeeService.restore(req.params.id)),
);

module.exports = {
  list,
  performance,
  getById,
  create,
  update,
  remove,
  setTargets,
  resetMetrics,
  archive,
  restore,
};
