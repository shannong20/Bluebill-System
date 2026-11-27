const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const Shift = require('../models/Shift');
const Counter = require('../models/Counter');
const inventoryService = require('./inventory.service');
const containerService = require('./container.service');
const ApiError = require('../utils/ApiError');
const { round2, percent, startOfDay } = require('../utils/helpers');
const {
  CONTAINER_HANDLING_MODE,
  PAYMENT_METHOD,
  ORDER_STATE,
  ORDER_LINE_SOURCE,
} = require('../config/constants');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter({ status, paymentMethod, customerType, staff, search, from, to } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (customerType) filter.customerType = customerType;
  if (staff) filter['staff._id'] = staff;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ orderId: rx }, { customerName: rx }, { staffName: rx }];
  }
  return filter;
}

async function list(query, { page = 1, limit = 20 } = {}) {
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name phone type')
      .populate('staff', 'name role')
      .lean(),
    Order.countDocuments(filter),
  ]);
  return {
    items: items.map((o) => ({ ...o, itemSummary: summariseItems(o) })),
    total,
    page,
    limit,
  };
}

async function getById(id) {
  const order = await Order.findById(id)
    .populate('customer')
    .populate('staff', 'name role')
    .populate('rider', 'name role');
  if (!order) throw ApiError.notFound('Order not found');
  return order;
}

const getByOrderId = async (orderId) => {
  const order = await Order.findOne({ orderId }).lean();
  if (!order) throw ApiError.notFound(`Order ${orderId} not found`);
  return { ...order, itemSummary: summariseItems(order) };
};

/** "2x 5-Gal Round Refill, 1x Delivery Fee" */
const summariseItems = (order) =>
  (order.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ');

const totalGallons = (items) =>
  round2(items.reduce((sum, i) => sum + (i.gallons || 0) * i.qty, 0));

/** "  maria   dela cruz " → "Maria Dela Cruz" — accounts opened at the POS
 *  are created from whatever the cashier typed, so tidy it up first. */
const titleCase = (name) =>
  name
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');

/**
 * Case- and spacing-insensitive *exact* match on a customer name. The POS
 * carries nothing but free text for a delivery stop, so "  maria   cruz " has
 * to find "Maria Cruz". Anything that is not an exact match returns null
 * rather than a near miss — posting a debt to the wrong ledger is far worse
 * than opening a second account.
 */
async function findByExactName(name, session) {
  const pattern = String(name)
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join('\\s+');
  if (!pattern) return null;
  return Customer.findOne({ name: { $regex: new RegExp(`^${pattern}$`, 'i') } }).session(
    session,
  );
}

/** True when the deployment can run multi-document transactions. */
async function transactionsSupported() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    return false;
  }
}

/**
 * Runs `work(session)` inside a transaction when the deployment supports
 * one, and plain sequentially otherwise (standalone mongod / in-memory dev
 * server). `session` is always passed down so the two paths share code.
 */
async function withTransaction(work) {
  if (!(await transactionsSupported())) return work(undefined);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Completes a Point-of-Sale transaction.
 *
 * A cart is a mix of two kinds of line: catalog `Product`s (refills, packages,
 * supplies) and raw `InventoryItem`s flagged for sale on the POS Supplies
 * grid. Both are priced from the database — the client is never trusted to
 * supply prices — and both draw their stock down, so a sale of 100 units off
 * an item sitting at 300 leaves exactly 200 behind.
 *
 * Stock, containers, employee stats, the customer's balance and the shift
 * cash drawer are all updated together so they can never drift apart.
 */
async function create(payload) {
  return withTransaction(async (session) => {
    const opts = session ? { session } : {};

    // --- 1. Resolve the sellable items ---------------------------------
    const productLines = payload.items.filter((i) => i.product);
    const inventoryLines = payload.items.filter((i) => i.inventoryItem);

    const productIds = [...new Set(productLines.map((i) => i.product))];
    const inventoryIds = [...new Set(inventoryLines.map((i) => i.inventoryItem))];

    const [products, stockItems] = await Promise.all([
      Product.find({ _id: { $in: productIds }, isActive: true })
        .session(session)
        .lean(),
      // `isSellable` + `archivedAt: null` mirror the POS grid exactly, so a
      // crafted request cannot ring up something the cashier never saw.
      InventoryItem.find({
        _id: { $in: inventoryIds },
        isSellable: true,
        archivedAt: null,
      })
        .session(session)
        .lean(),
    ]);

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const inventoryMap = new Map(stockItems.map((i) => [String(i._id), i]));

    const missing = productIds.filter((id) => !productMap.has(String(id)));
    if (missing.length) {
      throw ApiError.badRequest('Unknown or inactive product(s) in the order');
    }

    const unavailable = inventoryIds.filter((id) => !inventoryMap.has(String(id)));
    if (unavailable.length) {
      throw ApiError.badRequest(
        'One or more stock items are not available for sale. '
          + 'Tick "Sell at POS" on the item under Inventory & Stock.',
      );
    }

    // --- 2. Build line items + total the stock each one consumes --------
    // `stockDraws` aggregates every unit an order takes out of each SKU, so
    // a cart holding two lines of the same item is checked and decremented
    // once, as a single demand.
    const items = [];
    const stockDraws = new Map();
    const drawStock = (id, qty) => {
      const key = String(id);
      stockDraws.set(key, (stockDraws.get(key) || 0) + qty);
    };

    productLines.forEach(({ product, qty }) => {
      const p = productMap.get(String(product));
      items.push({
        product: p._id,
        source: ORDER_LINE_SOURCE.PRODUCT,
        name: p.name,
        price: p.price,
        qty,
        gallons: p.gallons || 0,
        lineTotal: round2(p.price * qty),
      });
      if (p.trackStock && p.inventoryItem) drawStock(p.inventoryItem, qty);
    });

    inventoryLines.forEach(({ inventoryItem, qty }) => {
      const inv = inventoryMap.get(String(inventoryItem));
      items.push({
        inventoryItem: inv._id,
        source: ORDER_LINE_SOURCE.INVENTORY,
        name: inv.name,
        price: inv.sellPrice,
        qty,
        gallons: 0,
        unit: inv.unit,
        lineTotal: round2(inv.sellPrice * qty),
      });
      drawStock(inv._id, qty);
    });

    // --- 3. Refuse the sale before anything is written ------------------
    // Checked up front so a short order never leaves a half-applied cart
    // behind on deployments without transaction support.
    if (stockDraws.size) {
      // eslint-disable-next-line no-await-in-loop
      const onHand = await InventoryItem.find({ _id: { $in: [...stockDraws.keys()] } })
        .session(session)
        .select('name stockLevel')
        .lean();

      const short = onHand
        .filter((i) => i.stockLevel < stockDraws.get(String(i._id)))
        .map(
          (i) =>
            `"${i.name}" — only ${i.stockLevel} left, ${stockDraws.get(String(i._id))} requested`,
        );
      if (short.length) throw ApiError.badRequest(`Not enough stock: ${short.join('; ')}`);
    }

    // --- 4. Customer / staff -------------------------------------------
    let customer = payload.customer
      ? await Customer.findById(payload.customer).session(session)
      : null;
    if (payload.customer && !customer) throw ApiError.notFound('Customer not found');

    // A pay-later (on-account) sale has to sit on somebody's ledger, and the
    // rider usually arrives with nothing but a typed delivery name. An exact
    // match reuses the saved account; anything else opens one here, inside the
    // same transaction — otherwise a first-time customer could never be put
    // on debt at the door.
    if (!customer && payload.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT) {
      const typed = String(payload.customerName || '').trim().replace(/\s+/g, ' ');
      if (!typed) {
        throw ApiError.badRequest(
          'Pay-later sales need a customer name to charge the balance to',
        );
      }
      customer = await findByExactName(typed, session);
      if (!customer) {
        const [opened] = await Customer.create(
          [
            {
              name: titleCase(typed),
              type: payload.customerType === 'walk_in' ? 'regular' : payload.customerType,
              notes: 'Account opened at the Point of Sale for pay-later sales.',
            },
          ],
          opts,
        );
        customer = opened;
      }
    }

    const staff = payload.staff
      ? await Employee.findById(payload.staff).session(session)
      : null;
    if (payload.staff && !staff) throw ApiError.notFound('Assigned staff not found');

    const customerName =
      customer?.name ||
      payload.customerName ||
      (payload.customerType === 'walk_in' ? 'Walk-In' : 'Guest');

    // --- 5. Money --------------------------------------------------------
    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const discount = round2(Math.min(payload.discount || 0, subtotal));
    const total = round2(subtotal - discount);

    if (payload.paymentMethod === PAYMENT_METHOD.CASH && round2(payload.cashReceived) < total) {
      throw ApiError.badRequest(
        `Cash received (₱${round2(payload.cashReceived)}) is less than the total (₱${total})`,
      );
    }

    if (payload.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT) {
      if (!customer) {
        throw ApiError.badRequest(
          'Pay-later sales require a customer account or a name to open one for',
        );
      }
      const projected = round2(customer.balance + total);
      if (customer.creditLimit > 0 && projected > customer.creditLimit) {
        throw ApiError.badRequest(
          `Credit limit exceeded — limit ₱${customer.creditLimit}, this sale would reach ₱${projected}.`,
        );
      }
    }

    // --- 6. Persist the order -------------------------------------------
    // Pay-later sales collect nothing at the counter, so `cashReceived` stays
    // at zero — the receipt and the cash drawer must never claim money that
    // has not arrived yet.
    let paidNow = total;
    if (payload.paymentMethod === PAYMENT_METHOD.CASH) {
      paidNow = round2(payload.cashReceived);
    } else if (payload.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT) {
      paidNow = 0;
    }

    const orderId = await Counter.nextOrderId();
    const shift = await Shift.findOne({ status: 'active' }).session(session);

    const [order] = await Order.create(
      [
        {
          orderId,
          customerType: payload.customerType,
          customer: customer?._id,
          customerName,
          staff: staff?._id,
          staffName: staff?.name,
          rider: payload.rider || undefined,
          items,
          containerHandling: payload.containerHandling,
          subtotal,
          discount,
          total,
          paymentMethod: payload.paymentMethod,
          paymentStatus:
            payload.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT ? 'unpaid' : undefined,
          cashReceived: paidNow,
          change: payload.paymentMethod === PAYMENT_METHOD.CASH ? round2(payload.cashReceived - total) : 0,
          status: ORDER_STATE.COMPLETED,
          shift: shift?._id,
          note: payload.note,
        },
      ],
      opts,
    );

    // --- 7. Side effects -------------------------------------------------
    // Draw down every SKU the sale consumed, catalog products and raw stock
    // items alike. `adjustStock` re-checks the balance atomically, so a
    // concurrent sale can never drive an item below zero.
    for (const [inventoryId, qty] of stockDraws) {
      // eslint-disable-next-line no-await-in-loop
      await inventoryService.adjustStock(inventoryId, -qty, { session });
    }

    if (payload.containerHandling === CONTAINER_HANDLING_MODE.NEW_CONTAINER) {
      await containerService.issueContainers(1, customer, order._id, { session });
    }

    if (payload.paymentMethod === PAYMENT_METHOD.ON_ACCOUNT && customer) {
      customer.balance = round2(customer.balance + total);
      await customer.save(opts);
    }

    if (staff) {
      staff.achieved = round2((staff.achieved || 0) + totalGallons(items));
      staff.revenue = round2((staff.revenue || 0) + total);
      staff.orderCount = (staff.orderCount || 0) + 1;
      await staff.save(opts);
    }

    if (shift && payload.paymentMethod === PAYMENT_METHOD.CASH) {
      shift.cashSales = round2(shift.cashSales + total);
      await shift.save(opts);
    }

    return order;
  });
}

/** Changes an order's status (completed → cancelled / refunded). */
async function updateStatus(id, status) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== status) {
    order.status = status;
    await order.save();
  }
  return order;
}

/** Revenue/units breakdown for a window, used by Dashboard + Reports. */
async function metrics({ from, to } = {}) {
  const match = {
    createdAt: { $gte: from || startOfDay(), $lte: to || new Date() },
    status: ORDER_STATE.COMPLETED,
  };

  const [totals, byMethod, byCustomerType] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          transactions: { $sum: 1 },
          // Sum of (gallons × qty) across every line item.
          unitsRefilled: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', { $multiply: ['$$this.gallons', '$$this.qty'] }] },
              },
            },
          },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$paymentMethod', amount: { $sum: '$total' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$customerType', amount: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
  ]);

  const t = totals[0] || { revenue: 0, transactions: 0, unitsRefilled: 0 };
  const revenue = round2(t.revenue);

  return {
    revenue,
    transactions: t.transactions,
    unitsRefilled: Math.round(t.unitsRefilled),
    avgTicket: t.transactions ? round2(revenue / t.transactions) : 0,
    byMethod: byMethod.map((m) => ({
      method: m._id,
      amount: round2(m.amount),
      count: m.count,
      percent: percent(round2(m.amount), revenue),
    })),
    byCustomerType: byCustomerType.map((c) => ({
      type: c._id,
      amount: round2(c.amount),
      count: c.count,
      percent: percent(round2(c.amount), revenue),
    })),
  };
}

/** Most recent orders for the dashboard table. */
async function recent(limit = 8) {
  const orders = await Order.find({ status: ORDER_STATE.COMPLETED })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('orderId customerName items total paymentMethod staffName createdAt')
    .lean();

  // `itemSummary` is built here (not via a virtual) so it is present
  // regardless of how the document was loaded.
  return orders.map((o) => ({
    ...o,
    itemSummary: (o.items || []).map((i) => `${i.qty}x ${i.name}`).join(', '),
    totalGallons: (o.items || []).reduce((s, i) => s + (i.gallons || 0) * i.qty, 0),
  }));
}

module.exports = {
  list,
  getById,
  getByOrderId,
  create,
  updateStatus,
  metrics,
  recent,
  transactionsSupported,
  withTransaction,
  totalGallons,
  buildFilter,
};
