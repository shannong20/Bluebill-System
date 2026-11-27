const InventoryItem = require('../models/InventoryItem');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { INVENTORY_STATUS, stockStatus } = require('../config/constants');
const { round2 } = require('../utils/helpers');

/**
 * Scope helpers for the soft delete. `{ archivedAt: null }` also matches
 * documents written before the field existed, so legacy rows stay active.
 */
const ACTIVE = { archivedAt: null };
const ARCHIVED = { archivedAt: { $ne: null } };

/**
 * Builds a Mongo filter object from the validated query params.
 * Archived items are hidden unless `archived=true` is passed.
 * @param {object} query  validated `?category=&status=&search=&lowOnly=&archived=`
 */
function buildFilter({ category, status, search, lowOnly, archived } = {}) {
  const filter = archived ? { ...ARCHIVED } : { ...ACTIVE };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { supplier: rx }, { notes: rx }];
  }
  if (lowOnly) {
    // "at or below reorder point" — expressed with $expr so the comparison
    // always uses the item's own reorder point.
    filter.$expr = { $lte: ['$stockLevel', '$reorderPoint'] };
  }
  return filter;
}

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function list(query) {
  const filter = buildFilter(query);
  const items = await InventoryItem.find(filter)
    .sort({ category: 1, name: 1 })
    .lean();

  // Computed explicitly so the table always has the derived columns,
  // independent of Mongoose's lean-virtual support.
  return items.map((i) => ({
    ...i,
    inventoryValue: round2(i.stockLevel * i.unitPrice),
    isLow: i.stockLevel <= i.reorderPoint,
    isArchived: Boolean(i.archivedAt),
  }));
}

async function getById(id) {
  const item = await InventoryItem.findById(id).lean();
  if (!item) throw ApiError.notFound('Inventory item not found');
  return {
    ...item,
    inventoryValue: round2(item.stockLevel * item.unitPrice),
    isLow: item.stockLevel <= item.reorderPoint,
    isArchived: Boolean(item.archivedAt),
  };
}

async function create(payload) {
  const item = new InventoryItem({
    ...payload,
    // A sellable item with no selling price would otherwise sit on the POS
    // grid at P0. Fall back to the unit cost so the card always shows a real
    // number; the Inventory page shows it so a markup can be added later.
    sellPrice:
      payload.isSellable && !payload.sellPrice ? payload.unitPrice : payload.sellPrice,
  });
  await item.save();
  return item.toJSON();
}

async function update(id, payload) {
  const item = await InventoryItem.findById(id);
  if (!item) throw ApiError.notFound('Inventory item not found');
  Object.assign(item, payload);
  await item.save();
  return item.toJSON();
}

async function remove(id) {
  const item = await InventoryItem.findByIdAndDelete(id);
  if (!item) throw ApiError.notFound('Inventory item not found');
  return { id };
}

/**
 * Soft-deletes an item: it disappears from the table, the KPI row and the
 * low-stock alerts, but its history and stock figure are preserved.
 *
 * Refuses when a product that tracks stock still points at this item —
 * archiving it would make every sale of that product fail on the decrement.
 */
async function archive(id) {
  const item = await InventoryItem.findById(id);
  if (!item) throw ApiError.notFound('Inventory item not found');
  if (item.archivedAt) return item.toJSON();

  const linked = await Product.countDocuments({ inventoryItem: id, trackStock: true });
  if (linked > 0) {
    throw ApiError.conflict(
      `"${item.name}" is used by ${linked} product${linked === 1 ? '' : 's'} that track stock. `
        + 'Unlink or deactivate those products before archiving it.',
    );
  }

  item.archivedAt = new Date();
  // A hidden item must not linger on the POS grid, otherwise the cashier
  // could ring up a SKU that `adjustStock` then refuses at sale time.
  item.isSellable = false;
  await item.save();
  return item.toJSON();
}

/** Undo of `archive` — the item returns to the active list immediately. */
async function restore(id) {
  const item = await InventoryItem.findById(id);
  if (!item) throw ApiError.notFound('Inventory item not found');
  if (!item.archivedAt) return item.toJSON();

  item.archivedAt = null;
  await item.save();
  return item.toJSON();
}

/**
 * Adds (or subtracts, with a negative qty) stock.
 * Uses an atomic `$inc` guarded by a non-negative result check so two
 * concurrent orders can never drive an item below zero. Archived items are
 * excluded so an archived SKU can never be silently sold or restocked.
 */
async function adjustStock(id, quantity, { allowNegative = false, session } = {}) {
  const opts = session ? { session } : {};
  const filter = {
    _id: id,
    ...ACTIVE,
    ...(allowNegative ? {} : { stockLevel: { $gte: -quantity } }),
  };

  const item = await InventoryItem.findOneAndUpdate(
    filter,
    { $inc: { stockLevel: quantity }, $set: { lastRestockedAt: new Date() } },
    { new: true, ...opts },
  );

  if (!item) {
    const exists = await InventoryItem.findById(id).session(session).lean();
    if (!exists) throw ApiError.notFound('Inventory item not found');
    if (exists.archivedAt) {
      throw ApiError.conflict(
        `"${exists.name}" is archived. Restore it before adjusting its stock.`,
      );
    }
    throw ApiError.conflict('Insufficient stock for this operation');
  }

  // Persist the derived status (findOneAndUpdate skips document middleware).
  item.status = stockStatus(item.stockLevel, item.reorderPoint);
  await item.save(opts);
  return item.toJSON();
}

/**
 * Restock endpoint. A positive quantity adds stock; a negative one records
 * a write-off. The sign is preserved on purpose — taking `Math.abs` here
 * would turn an accidental -50 into a +50 delivery.
 */
const restock = (id, quantity, opts) => adjustStock(id, quantity, opts);

/** Aggregate numbers for the Inventory KPI row. Archived items are excluded. */
async function summary() {
  const [totals, containers, lowItems, criticalCount, archivedCount] = await Promise.all([
    InventoryItem.aggregate([
      { $match: ACTIVE },
      {
        $group: {
          _id: null,
          totalSkus: { $sum: 1 },
          categories: { $addToSet: '$category' },
          estimatedValue: {
            $sum: { $round: [{ $multiply: ['$stockLevel', '$unitPrice'] }, 2] },
          },
        },
      },
    ]),
    InventoryItem.aggregate([
      { $match: { ...ACTIVE, category: 'Container Assets' } },
      { $group: { _id: null, total: { $sum: '$stockLevel' } } },
    ]),
    InventoryItem.countDocuments({
      ...ACTIVE,
      $expr: { $lte: ['$stockLevel', '$reorderPoint'] },
    }),
    InventoryItem.countDocuments({ ...ACTIVE, status: INVENTORY_STATUS.CRITICAL }),
    InventoryItem.countDocuments(ARCHIVED),
  ]);

  const t = totals[0] || { totalSkus: 0, categories: [], estimatedValue: 0 };
  return {
    totalSkus: t.totalSkus,
    categoryCount: t.categories.length,
    categories: t.categories,
    lowOrCritical: lowItems,
    criticalCount,
    containerInStation: containers[0]?.total ?? 0,
    estimatedValue: round2(t.estimatedValue),
    // Powers the "Show archived items" badge.
    archivedCount,
  };
}

/** Stock alerts for the dashboard banner, worst first. Archived items are skipped. */
async function alerts({ limit = 10 } = {}) {
  const lowItems = await InventoryItem.find({
    ...ACTIVE,
    $expr: { $lte: ['$stockLevel', '$reorderPoint'] },
  })
    .sort({ stockLevel: 1 })
    .limit(limit)
    .lean();

  return lowItems.map((item) => ({
    id: item._id,
    name: item.name,
    category: item.category,
    stockLevel: item.stockLevel,
    reorderPoint: item.reorderPoint,
    status: item.status,
    // Days of cover at the current reorder point (null = never reorder).
    daysRemaining:
      item.reorderPoint > 0
        ? Math.max(0, Math.floor(item.stockLevel / Math.max(1, item.reorderPoint / 30)))
        : null,
  }));
}

/**
 * The POS Supplies grid, sourced from this table.
 *
 * Every active item flagged `isSellable` becomes a card the cashier can ring
 * up, priced from `sellPrice` and stamped with its live `stockLevel`. Adding
 * an item under Inventory & Stock and ticking "Sell at POS" is therefore all
 * it takes for it to appear in the till — there is no second product record
 * to keep in sync. Selling one decrements its stock via `adjustStock`.
 */
async function posSupplies({ search, category } = {}) {
  const filter = { ...ACTIVE, isSellable: true };
  if (category) filter.category = category;
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');

  const items = await InventoryItem.find(filter).sort({ name: 1 }).lean();

  return items.map((i) => ({
    _id: i._id,
    // Mirrors the shape the POS grid already builds for catalog products.
    source: 'inventory',
    name: i.name,
    category: 'supply',
    // Older documents predate `sellPrice`; fall back to the unit cost so the
    // grid never advertises a free item.
    price: i.sellPrice > 0 ? i.sellPrice : i.unitPrice,
    icon: i.icon,
    unit: i.unit,
    stockLevel: i.stockLevel,
    reorderPoint: i.reorderPoint,
    status: i.status,
    inventoryItem: i._id,
  }));
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  archive,
  restore,
  adjustStock,
  restock,
  summary,
  alerts,
  posSupplies,
};
