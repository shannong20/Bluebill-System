/** Standard success envelope so the client always has a predictable shape. */
const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });

const created = (res, data) => res.status(201).json({ success: true, data });

const noContent = (res) => res.status(204).send();

/** Wraps an async route handler (kept here for convenience, see asyncHandler.js). */
const paginated = (res, { items, total, page, limit }) => {
  const safeLimit = limit > 0 ? limit : items.length;
  return res.json({
    success: true,
    data: items,
    meta: {
      total,
      page,
      limit: safeLimit,
      totalPages: safeLimit > 0 ? Math.ceil(total / safeLimit) : 0,
    },
  });
};

module.exports = { ok, created, noContent, paginated };
