const containerService = require('../services/container.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/response');

/** GET /api/containers?status=&size=&customer=&search= */
const list = asyncHandler(async (req, res) => {
  const [items, summary] = await Promise.all([
    containerService.list(req.validatedQuery || req.query),
    containerService.summary(),
  ]);
  return ok(res, items, { summary });
});

/** GET /api/containers/summary — the Container Asset Tracker cards. */
const summary = asyncHandler(async (req, res) => ok(res, await containerService.summary()));

const getById = asyncHandler(async (req, res) =>
  ok(res, await containerService.getById(req.params.id)),
);

const create = asyncHandler(async (req, res) => created(res, await containerService.create(req.body)));

const update = asyncHandler(async (req, res) =>
  ok(res, await containerService.update(req.params.id, req.body)),
);

const remove = asyncHandler(async (req, res) => {
  await containerService.remove(req.params.id);
  return noContent(res);
});

/**
 * POST /api/containers/return  { containerIds, condition? }
 * Quick action: "Receive Empty Containers".
 */
const returnMany = asyncHandler(async (req, res) =>
  ok(
    res,
    await containerService.returnContainers(req.body.containerIds, {
      condition: req.body.condition,
      asDamaged: req.query.asDamaged === 'true',
    }),
  ),
);

/** PATCH /api/containers/:id/return — single-container quick return. */
const returnOne = asyncHandler(async (req, res) =>
  ok(res, await containerService.returnContainers([req.params.id], { condition: req.query.condition })),
);

module.exports = { list, summary, getById, create, update, remove, returnMany, returnOne };
