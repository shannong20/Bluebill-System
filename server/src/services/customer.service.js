const Customer = require('../models/Customer');
const Container = require('../models/Container');
const ApiError = require('../utils/ApiError');
const { CONTAINER_STATUS } = require('../config/constants');
const { round2 } = require('../utils/helpers');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function markOrdersPaid(customer) {
  const Order = require('../models/Order');
  await Order.updateMany(
    {
      paymentMethod: 'on_account',
      status: { $nin: ['cancelled', 'refunded'] },
      $or: [
        { customer: customer._id },
        { customer: null, customerName: customer.name },
      ],
    },
    { $set: { paymentStatus: 'paid', customer: customer._id } },
  );
}

function buildFilter({ type, search, isActive } = {}) {
  const filter = {};
  if (type) filter.type = type;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { address: rx }];
  }
  return filter;
}

async function list(query) {
  const customers = await Customer.find(buildFilter(query))
    .sort({ name: 1 })
    .lean();

  // Attach the number of containers each customer still holds.
  const counts = await Container.aggregate([
    { $match: { status: CONTAINER_STATUS.WITH_CUSTOMER, customer: { $ne: null } } },
    { $group: { _id: '$customer', count: { $sum: 1 } } },
  ]);
  const byCustomer = new Map(counts.map((c) => [String(c._id), c.count]));

  return customers.map((c) => ({ ...c, containersOut: byCustomer.get(String(c._id)) || 0 }));
}

async function getById(id) {
  const customer = await Customer.findById(id).lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function create(payload) {
  return new Customer(payload).save();
}

async function update(id, payload) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');

  if (payload.balance !== undefined && payload.balance < customer.balance) {
    // Recording a payment against the account.
    const paid = round2(customer.balance - payload.balance);
    if (paid < 0) throw ApiError.badRequest('Balance cannot be negative');
  }

  Object.assign(customer, payload);
  await customer.save();
  if (payload.balance === 0) await markOrdersPaid(customer);
  return customer;
}

async function remove(id) {
  const customer = await Customer.findByIdAndDelete(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  return { id };
}

/** Records a payment against an on-account balance. */
async function settleBalance(id, amount) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  // Zero is a bookkeeping close-out (marked "paid in full").
  if (amount === 0) {
    customer.balance = 0;
    await customer.save();
    await markOrdersPaid(customer);
    return customer;
  }
  if (amount < 0) throw ApiError.badRequest('Payment amount must be greater than zero');
  customer.balance = Math.max(0, round2(customer.balance - amount));
  await customer.save();
  if (customer.balance === 0) await markOrdersPaid(customer);
  return customer;
}

/**
 * Returns all customers that currently have credit outstanding.
 * Covers two cases:
 *   1. Customer records with balance > 0 (properly linked orders)
 *   2. On-account orders whose customer name has no linked Customer doc
 *      ("walk-in" on-account orders typed at the POS)
 */
async function withCredit() {
  const Order = require('../models/Order');

  // Case 1: Customer docs with a positive balance
  const fromDocs = await Customer.find({ isActive: true, balance: { $gt: 0 } })
    .select('name balance')
    .lean();

  // Case 2: on-account orders grouped by customerName where no Customer _id exists
  const fromOrders = await Order.aggregate([
    {
      $match: {
        paymentMethod: 'on_account',
        status: { $nin: ['cancelled', 'refunded'] },
        paymentStatus: { $ne: 'paid' },
        customer: null, // unlinked — no Customer doc was matched
      },
    },
    {
      $group: {
        _id: '$customerName',
        totalOwed: { $sum: '$total' },
      },
    },
    { $match: { totalOwed: { $gt: 0 } } },
  ]);

  // Also cover linked orders where the balance increment may have failed:
  // find all unique linked customer _ids from on-account orders
  const linkedOrders = await Order.aggregate([
    {
      $match: {
        paymentMethod: 'on_account',
        status: { $nin: ['cancelled', 'refunded'] },
        paymentStatus: { $ne: 'paid' },
        customer: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$customer',
        totalOwed: { $sum: '$total' },
        customerName: { $first: '$customerName' },
      },
    },
    { $match: { totalOwed: { $gt: 0 } } },
  ]);

  // Build a merged, deduplicated list (prefer Customer doc data when available)
  const seen = new Map(); // key: lower-cased name

  // Priority 1: Customer docs with balance > 0
  for (const c of fromDocs) {
    const key = c.name.toLowerCase();
    seen.set(key, { _id: String(c._id), name: c.name, balance: round2(c.balance), source: 'doc' });
  }

  // Priority 2: Linked orders for customers whose balance field may be stale
  for (const o of linkedOrders) {
    const key = (o.customerName || '').toLowerCase();
    if (!seen.has(key)) {
      // Try to fetch the Customer doc for a proper _id
      // eslint-disable-next-line no-await-in-loop
      const doc = await Customer.findById(o._id).select('name balance').lean();
      // Customer balances are authoritative when the account exists. This
      // prevents settled legacy orders from reappearing as outstanding credit.
      if (doc && !(doc.balance > 0)) continue;
      seen.set(key, {
        _id: String(o._id),
        name: doc?.name || o.customerName,
        balance: round2(doc?.balance || o.totalOwed),
        source: 'linked-order',
      });
    }
  }

  // Priority 3: Unlinked on-account orders (no Customer doc)
  for (const o of fromOrders) {
    const key = (o._id || '').toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        _id: null, // no DB id — frontend will handle gracefully
        name: o._id,
        balance: round2(o.totalOwed),
        source: 'unlinked-order',
      });
    }
  }

  return [...seen.values()].sort((a, b) => b.balance - a.balance);
}

module.exports = { list, getById, create, update, remove, settleBalance, withCredit, buildFilter };
