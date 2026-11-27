/**
 * Reusable seeding routine.
 *
 * Called by `scripts/seed.js` (CLI) and by the server on boot when
 * `AUTO_SEED=true`, so an empty dev database fills itself with the demo
 * data from the Figma design.
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { stockStatus } = require('../config/constants');
const { round2 } = require('../utils/helpers');

const User = require('../models/User');
const Employee = require('../models/Employee');
const Product = require('../models/Product');
const InventoryItem = require('../models/InventoryItem');
const Customer = require('../models/Customer');
const Container = require('../models/Container');
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const Counter = require('../models/Counter');
const data = require('./data');

/** Minutes before "now" — spreads the demo transactions across the shift. */
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);

const MODELS = [User, Employee, Product, InventoryItem, Customer, Container, Order, Shift, Counter];

async function clearAll() {
  await Promise.all(MODELS.map((M) => M.deleteMany({})));
}

/** True when the database already has transactions. */
async function hasData() {
  return (await Order.estimatedDocumentCount()) > 0;
}

async function seedUsers() {
  // `save()` (not insertMany) so the password hashing hook runs.
  for (const u of data.users) {
    // eslint-disable-next-line no-await-in-loop
    await new User(u).save();
  }
}

async function seedInventory() {
  // insertMany skips save() middleware and never applies schema defaults, so
  // derive `status` and the POS flag up front with the same helpers the model
  // uses. Every seeded item is sellable at the POS by default.
  const docs = data.inventory.map((item) => ({
    ...item,
    status: stockStatus(item.stockLevel, item.reorderPoint),
    isSellable: item.isSellable !== false,
  }));
  return InventoryItem.insertMany(docs);
}

async function seedProducts(inventory) {
  const byName = new Map(inventory.map((i) => [i.name, i]));
  return Product.insertMany(
    data.products.map(({ inventoryKey, ...p }) => ({
      ...p,
      sku: p.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24),
      inventoryItem: inventoryKey ? byName.get(inventoryKey)?._id : undefined,
      trackStock: p.trackStock !== false,
    })),
  );
}

async function seedContainers(customers) {
  const mix = data.containerMix;
  const docs = [];
  let counter = 1;

  const push = (status, size, customer) => {
    counter += 1;
    docs.push({
      code: `CNT-${String(counter).padStart(4, '0')}`,
      size,
      status,
      customer: customer?._id,
      customerName: customer?.name,
      issuedAt: status === 'with_customer' ? minutesAgo(60 + counter * 7) : undefined,
      returnedAt: status === 'in_station' ? minutesAgo(counter * 3) : undefined,
    });
  };

  for (let i = 0; i < mix.inStation; i += 1) {
    push('in_station', i % 3 === 0 ? '5-Gallon Slim' : '5-Gallon Round');
  }
  for (let i = 0; i < mix.withCustomer; i += 1) {
    push(
      'with_customer',
      i % 3 === 0 ? '5-Gallon Slim' : '5-Gallon Round',
      customers[i % customers.length],
    );
  }
  for (let i = 0; i < mix.damaged; i += 1) {
    push('damaged', '5-Gallon Round');
  }
  return Container.insertMany(docs);
}

/** The transactions shown in the design's "Recent Transactions" table. */
const SAMPLE_ORDERS = [
  { mins: 37, customer: null, customerType: 'walk_in', staff: 0, method: 'cash', items: [['5-Gal Round Refill', 2]], cash: 50 },
  { mins: 50, customer: 0, customerType: 'regular', staff: 1, method: 'gcash', items: [['5-Gal Round Refill', 4]], cash: 100 },
  { mins: 65, customer: null, customerType: 'walk_in', staff: 2, method: 'cash', items: [['New Container + Water', 1]], cash: 500 },
  { mins: 80, customer: 1, customerType: 'delivery', staff: 5, method: 'on_account', items: [['5-Gal Round Refill', 10]], cash: 250 },
  { mins: 92, customer: null, customerType: 'walk_in', staff: 0, method: 'cash', items: [['LPG Tank Refill (11kg)', 1]], cash: 700 },
  { mins: 105, customer: 2, customerType: 'regular', staff: 3, method: 'cash', items: [['5-Gal Slim Refill', 3]], cash: 75 },
  { mins: 118, customer: null, customerType: 'walk_in', staff: 2, method: 'gcash', items: [['1L Bottle Pack (6s)', 2]], cash: 160 },
  { mins: 132, customer: 3, customerType: 'regular', staff: 1, method: 'cash', items: [['Slim New Container + Water', 1]], cash: 500 },
  { mins: 150, customer: 4, customerType: 'delivery', staff: 5, method: 'gcash', items: [['5-Gal Round Refill', 10]], cash: 250 },
  { mins: 168, customer: null, customerType: 'walk_in', staff: 0, method: 'cash', items: [['Purified Water Pouch 500mL', 10]], cash: 50 },
];

async function seedOrders(products, employees, customers) {
  const productMap = new Map(products.map((p) => [p.name, p]));
  const docs = [];
  let seq = 2847 - SAMPLE_ORDERS.length;

  for (const o of SAMPLE_ORDERS) {
    seq += 1;
    const staff = employees[o.staff];
    const customer = o.customer === null ? null : customers[o.customer];

    const items = o.items.map(([name, qty]) => {
      const p = productMap.get(name);
      return {
        product: p._id,
        name: p.name,
        price: p.price,
        qty,
        gallons: p.gallons || 0,
        lineTotal: round2(p.price * qty),
      };
    });

    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const createdAt = minutesAgo(o.mins);

    docs.push({
      orderId: `TXN-${seq}`,
      customerType: o.customerType,
      customer: customer?._id,
      customerName: customer?.name || 'Walk-In',
      staff: staff._id,
      staffName: staff.name,
      items,
      containerHandling: 'exchange_1to1',
      subtotal,
      discount: 0,
      total: subtotal,
      paymentMethod: o.method,
      cashReceived: o.method === 'cash' ? o.cash : subtotal,
      change: o.method === 'cash' ? round2(o.cash - subtotal) : 0,
      status: 'completed',
      createdAt,
      updatedAt: createdAt,
    });
  }

  return Order.insertMany(docs);
}

async function seedShift(employees) {
  const operator = employees.find((e) => e.name === 'Liza Mendoza') || employees[0];
  const start = new Date();
  start.setHours(6, 0, 0, 0);
  const end = new Date();
  end.setHours(14, 0, 0, 0);

  return Shift.create({
    name: 'Morning',
    label: 'Morning Shift X-Read',
    date: new Date(),
    startTime: start,
    endTime: end,
    operator: operator._id,
    operatorName: 'Ana Cruz',
    openingFloat: 2000,
    status: 'active',
  });
}

/** Primes the id sequences so the next real order is TXN-2848. */
async function seedCounters(orders) {
  const max = orders.reduce((acc, o) => {
    const n = Number.parseInt(o.orderId.split('-')[1], 10);
    return n > acc ? n : acc;
  }, 2846);
  await Counter.create({ key: 'order', seq: max });
  await Counter.create({ key: 'container', seq: 249 });
  return max;
}

/**
 * Seeds the whole dataset.
 * @param {{ fresh?: boolean, quiet?: boolean }} options
 *        fresh – wipe every collection first
 *        quiet – suppress the per-step logging (used by the boot seeder)
 */
async function seedDatabase({ fresh = false, quiet = false } = {}) {
  const log = quiet ? () => {} : (msg) => logger.success(msg);
  const info = quiet ? () => {} : (msg) => logger.info(msg);

  if (fresh) {
    if (!quiet) logger.info('Clearing existing collections…');
    await clearAll();
  }

  await seedUsers();
  log(`Seeded ${data.users.length} users (password: "password123")`);

  const employees = await Employee.insertMany(data.employees);
  log(`Seeded ${employees.length} employees`);

  const customers = await Customer.insertMany(data.customers);
  log(`Seeded ${customers.length} customers`);

  const inventory = await seedInventory();
  log(`Seeded ${inventory.length} inventory items`);

  const products = await seedProducts(inventory);
  log(`Seeded ${products.length} POS products`);

  const mix = data.containerMix;
  const containers = await seedContainers(customers);
  log(
    `Seeded ${containers.length} containers (${mix.inStation} in station / ${mix.withCustomer} out / ${mix.damaged} damaged)`,
  );

  const orders = await seedOrders(products, employees, customers);
  log(`Seeded ${orders.length} transactions (TXN-2843 → TXN-2847+)`);

  const shift = await seedShift(employees);
  log(`Seeded active shift: ${shift.name} (operator ${shift.operatorName})`);

  const max = await seedCounters(orders);
  info(`Order counter primed — next order will be TXN-${max + 1}`);

  return { employees, customers, inventory, products, containers, orders, shift };
}

/**
 * Boot-time seeder: fills an empty database so a fresh clone shows the
 * design's data immediately. Never wipes anything.
 */
async function seedIfEmpty() {
  if (await hasData()) return false;
  if (!mongoose.connection.readyState) return false;
  logger.warn('Database is empty — loading the AquaPure demo data…');
  await seedDatabase({ quiet: true });
  logger.success('Demo data loaded. Sign in with ana@aquapure.ph / password123');
  return true;
}

module.exports = {
  seedDatabase,
  seedIfEmpty,
  hasData,
  clearAll,
  MODELS,
};

