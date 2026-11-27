const customerService = require('../services/customer.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent } = require('../utils/response');

/** GET /api/customers?type=&search=&isActive= */
const list = asyncHandler(async (req, res) =>
  ok(res, await customerService.list(req.validatedQuery || req.query)),
);

const getById = asyncHandler(async (req, res) =>
  ok(res, await customerService.getById(req.params.id)),
);

const create = asyncHandler(async (req, res) => created(res, await customerService.create(req.body)));

const update = asyncHandler(async (req, res) =>
  ok(res, await customerService.update(req.params.id, req.body)),
);

const remove = asyncHandler(async (req, res) => {
  await customerService.remove(req.params.id);
  return noContent(res);
});

/** POST /api/customers/:id/settle  { amount } — record a payment. */
const settle = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount)) throw ApiError.badRequest('A valid amount is required');
  return ok(res, await customerService.settleBalance(req.params.id, amount));
});

/** GET /api/customers/with-credit — list all customers who have outstanding credit */
const withCredit = asyncHandler(async (req, res) =>
  ok(res, await customerService.withCredit()),
);

module.exports = { list, getById, create, update, remove, settle, withCredit };
