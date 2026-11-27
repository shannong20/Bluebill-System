const orderService = require('../services/order.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated } = require('../utils/response');
const { parsePaging } = require('../utils/helpers');

/** GET /api/orders?status=&paymentMethod=&staff=&search=&from=&to=&page=&limit= */
const list = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const { page, limit } = parsePaging(query);
  const result = await orderService.list(query, { page, limit });
  return paginated(res, { ...result, items: result.items });
});

const getById = asyncHandler(async (req, res) => ok(res, await orderService.getById(req.params.id)));

/** GET /api/orders/code/:orderId — look up by the human id (TXN-2847). */
const getByCode = asyncHandler(async (req, res) =>
  ok(res, await orderService.getByOrderId(req.params.orderId)),
);

/** POST /api/orders — completes a Point-of-Sale transaction. */
const create = asyncHandler(async (req, res) => created(res, await orderService.create(req.body)));

/** PATCH /api/orders/:id/status  { status } */
const updateStatus = asyncHandler(async (req, res) =>
  ok(res, await orderService.updateStatus(req.params.id, req.body.status)),
);

/** GET /api/orders/metrics/summary?from=&to= */
const metrics = asyncHandler(async (req, res) => {
  const { from, to } = req.validatedQuery || req.query;
  return ok(res, await orderService.metrics({ from, to }));
});

/** GET /api/orders/recent?limit=8 — the dashboard transaction table. */
const recent = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Number.parseInt(req.query.limit, 10) || 8);
  return ok(res, await orderService.recent(limit));
});

module.exports = { list, getById, getByCode, create, updateStatus, metrics, recent };
