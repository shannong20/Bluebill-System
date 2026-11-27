const inventoryService = require('../services/inventory.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');

/** GET /api/inventory?category=&status=&search=&lowOnly= */
const list = asyncHandler(async (req, res) => {
  const [items, summary] = await Promise.all([
    inventoryService.list(req.validatedQuery || req.query),
    inventoryService.summary(),
  ]);
  return ok(res, items, { summary });
});

/** GET /api/inventory/summary — KPI row only. */
const summary = asyncHandler(async (req, res) => ok(res, await inventoryService.summary()));

/** GET /api/inventory/alerts — low/critical stock for the dashboard banner. */
const alerts = asyncHandler(async (req, res) => ok(res, await inventoryService.alerts()));

/** GET /api/inventory/pos-supplies — sellable stock items for the POS grid. */
const posSupplies = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.posSupplies(req.validatedQuery || {})),
);

const getById = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.getById(req.params.id)),
);

const create = asyncHandler(async (req, res) => created(res, await inventoryService.create(req.body)));

const update = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.update(req.params.id, req.body)),
);

const remove = asyncHandler(async (req, res) => {
  await inventoryService.remove(req.params.id);
  return noContent(res);
});

/** POST /api/inventory/:id/archive — soft delete; hides the item from the UI. */
const archive = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.archive(req.params.id)),
);

/** POST /api/inventory/:id/restore — un-archive and bring the item back. */
const restore = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.restore(req.params.id)),
);

/** POST /api/inventory/:id/restock  { quantity, note? } */
const restock = asyncHandler(async (req, res) =>
  ok(res, await inventoryService.restock(req.params.id, req.body.quantity, { note: req.body.note })),
);

module.exports = { list, summary, alerts, posSupplies, getById, create, update, remove, archive, restore, restock };
