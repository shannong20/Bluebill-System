const mongoose = require('mongoose');

/**
 * Atomic sequence generator for human-readable ids (e.g. TXN-2847).
 * `findOneAndUpdate` with `$inc` guarantees uniqueness under concurrency.
 */
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Returns the next value for `key`. New counters start at `start`.
 * Implemented as an aggregation-pipeline update (MongoDB 4.2+) so the
 * initialise-and-increment happens in a single atomic operation.
 */
async function nextValue(key, start = 1000) {
  const doc = await Counter.findOneAndUpdate(
    { key },
    [{ $set: { seq: { $add: [{ $ifNull: ['$seq', start - 1] }, 1] } } }],
    { new: true, upsert: true },
  );
  return doc.seq;
}

const nextOrderId = () => nextValue('order', 2847).then((n) => `TXN-${n}`);
const nextContainerId = () => nextValue('container', 1).then((n) => `CNT-${String(n).padStart(4, '0')}`);

module.exports = Counter;
module.exports.nextValue = nextValue;
module.exports.nextOrderId = nextOrderId;
module.exports.nextContainerId = nextContainerId;
