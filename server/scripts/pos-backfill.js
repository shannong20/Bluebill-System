/**
 * Back-fills the Point-of-Sale fields onto inventory documents that predate
 * them.
 *
 * Mongoose applies schema defaults when *writing* a document, never when
 * reading one, so an item created before `isSellable` existed simply has no
 * such field and never appears at the till. This fills the gap in place.
 *
 * Only the POS fields are touched — names, stock levels, prices and history
 * are left exactly as they are. Safe to run more than once.
 *
 *   npm run pos:backfill        # report only
 *   npm run pos:backfill -- --write
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const InventoryItem = require('../src/models/InventoryItem');
const logger = require('../src/utils/logger');

const write = process.argv.includes('--write');

async function backfill() {
  // Only documents where the field is genuinely absent, so anything already
  // configured in the UI is never overwritten.
  const stale = await InventoryItem.find({ isSellable: { $exists: false } })
    .select('name category unitPrice isSellable sellPrice')
    .lean();

  const unpriced = await InventoryItem.find({
    $or: [{ sellPrice: { $exists: false } }, { sellPrice: 0 }],
  })
    .select('name unitPrice')
    .lean();

  logger.info(`Found ${stale.length} item(s) with no isSellable flag.`);
  logger.info(`Found ${unpriced.length} item(s) with no selling price.`);

  if (!write) {
    logger.warn('Dry run — nothing was written. Re-run with -- --write to apply.');
    return;
  }

  if (stale.length) {
    // eslint-disable-next-line no-await-in-loop
    const res = await InventoryItem.updateMany(
      { isSellable: { $exists: false } },
      { $set: { isSellable: true } },
    );
    logger.success(`Flagged ${res.modifiedCount} item(s) as sellable.`);
  }

  // Seed the retail price from the unit cost so no card shows P0 at the till.
  for (const item of unpriced) {
    if (item.unitPrice > 0) {
      // eslint-disable-next-line no-await-in-loop
      await InventoryItem.updateOne({ _id: item._id }, { $set: { sellPrice: item.unitPrice } });
    }
  }
  logger.success(`Priced ${unpriced.length} item(s) from their unit cost.`);
}

(async () => {
  try {
    await connectDB();
    await backfill();
    const sellable = await InventoryItem.countDocuments({ isSellable: true });
    logger.success(`Done. ${sellable} item(s) are now sellable at the POS.`);
  } catch (err) {
    logger.error(`Back-fill failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState) await disconnectDB();
  }
})();