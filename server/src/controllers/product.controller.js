const productService = require('../services/product.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');

/** GET /api/products?category=&search=&isActive= */
const list = asyncHandler(async (req, res) => {
  const { items, categories } = await productService.list(req.validatedQuery || req.query);
  return ok(res, items, { categories });
});

const getById = asyncHandler(async (req, res) =>
  ok(res, await productService.getById(req.params.id)),
);

const create = asyncHandler(async (req, res) => created(res, await productService.create(req.body)));

const update = asyncHandler(async (req, res) =>
  ok(res, await productService.update(req.params.id, req.body)),
);

const remove = asyncHandler(async (req, res) => {
  await productService.remove(req.params.id);
  return noContent(res);
});

module.exports = { list, getById, create, update, remove };
