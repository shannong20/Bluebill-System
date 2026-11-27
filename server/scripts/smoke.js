/**
 * End-to-end API smoke test.
 *
 * Boots the app against an in-memory MongoDB, seeds it, then exercises
 * every route the Next.js client depends on. Run with:  npm run smoke
 *
 * Exits non-zero if any check fails, so it doubles as a CI gate.
 */
process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret';
process.env.RATE_LIMIT_MAX = '10000';

const assert = require('assert');
const { connectDB, disconnectDB } = require('../src/config/db');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Employee = require('../src/models/Employee');
const Product = require('../src/models/Product');
const InventoryItem = require('../src/models/InventoryItem');
const Customer = require('../src/models/Customer');
const Container = require('../src/models/Container');
const Order = require('../src/models/Order');
const Shift = require('../src/models/Shift');
const Counter = require('../src/models/Counter');
const data = require('../src/seed/data');
const { stockStatus } = require('../src/config/constants');
const { round2 } = require('../src/utils/helpers');

let baseUrl;
let server;
let token;

/* ------------------------------------------------------------- harness */

const results = { passed: 0, failed: 0, failures: [] };

async function test(name, fn) {
  try {
    await fn();
    results.passed += 1;
    process.stdout.write(`  [32m✔[0m ${name}\n`);
  } catch (err) {
    results.failed += 1;
    results.failures.push({ name, message: err.message });
    process.stdout.write(`  [31m✖[0m ${name}\n    [31m${err.message}[0m\n`);
  }
}

function section(title) {
  process.stdout.write(`\n[36m${title}[0m\n`);
}

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

/* ------------------------------------------------------------------ seed */

async function seedMinimal() {
  await new User(data.users[0]).save();

  const employees = await Employee.insertMany(data.employees);
  const customers = await Customer.insertMany(data.customers);
  const items = await InventoryItem.insertMany(
    data.inventory.map((i) => ({
      ...i,
      status: stockStatus(i.stockLevel, i.reorderPoint),
      // Mirrors seed/index.js — insertMany never applies schema defaults.
      isSellable: i.isSellable !== false,
    })),
  );
  const byName = new Map(items.map((i) => [i.name, i]));
  const products = await Product.insertMany(
    data.products.map(({ inventoryKey, ...p }) => ({
      ...p,
      inventoryItem: inventoryKey ? byName.get(inventoryKey)?._id : undefined,
      trackStock: p.trackStock !== false,
    })),
  );

  const containerDocs = [];
  for (let i = 0; i < 40; i += 1) {
    containerDocs.push({
      code: `CNT-${String(i + 1).padStart(4, '0')}`,
      size: i % 2 ? '5-Gallon Slim' : '5-Gallon Round',
      status: 'in_station',
    });
  }
  for (let i = 0; i < 12; i += 1) {
    const c = customers[i % customers.length];
    containerDocs.push({
      code: `CNT-${String(500 + i).padStart(4, '0')}`,
      size: '5-Gallon Round',
      status: 'with_customer',
      customer: c._id,
      customerName: c.name,
      issuedAt: new Date(Date.now() - 86400000),
    });
  }
  for (let i = 0; i < 3; i += 1) {
    containerDocs.push({ code: `CNT-${String(900 + i).padStart(4, '0')}`, status: 'damaged' });
  }
  await Container.insertMany(containerDocs);

  await Counter.create({ key: 'order', seq: 2847 });
  await Counter.create({ key: 'container', seq: 999 });

  const start = new Date();
  start.setHours(6, 0, 0, 0);
  await Shift.create({
    name: 'Morning',
    label: 'Morning Shift X-Read',
    date: new Date(),
    startTime: start,
    operator: employees[0]._id,
    operatorName: 'Ana Cruz',
    openingFloat: 2000,
    status: 'active',
  });

  return { employees, customers, items, products };
}

/* ----------------------------------------------------------------- tests */

async function run() {
  process.stdout.write('\n[1mAquaPure API - end-to-end smoke test[0m\n');

  await connectDB();
  const seeded = await seedMinimal();
  const { employees, customers, items: inv, products } = seeded;
  const refill = products.find((p) => p.name === '5-Gal Round Refill');
  const pouch = products.find((p) => p.name === 'Purified Water Pouch 500mL');
  const clerk = employees[0];
  const regularCustomer = customers[0];

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  /* ------------------------------------------------------ health & auth */
  section('Health & auth');

  await test('GET /health responds without a token', async () => {
    const res = await api('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.status, 'ok');
  });

  await test('protected route rejects a missing token (401)', async () => {
    const res = await api('GET', '/products');
    assert.strictEqual(res.status, 401);
  });

  await test('protected route rejects a garbage token (401)', async () => {
    const saved = token;
    token = 'not.a.jwt';
    const res = await api('GET', '/products');
    token = saved;
    assert.strictEqual(res.status, 401);
  });

  await test('POST /auth/login issues a JWT', async () => {
    const res = await api('POST', '/auth/login', {
      email: 'ana@aquapure.ph',
      password: 'password123',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.token, 'token missing');
    assert.strictEqual(res.body.data.user.name, 'Ana Cruz');
    assert.strictEqual(res.body.data.user.initials, 'AC');
    token = res.body.data.token;
  });

  await test('POST /auth/login rejects a bad password (401)', async () => {
    const res = await api('POST', '/auth/login', {
      email: 'ana@aquapure.ph',
      password: 'wrongpassword',
    });
    assert.strictEqual(res.status, 401);
  });

  await test('POST /auth/login validates the email format (422)', async () => {
    const res = await api('POST', '/auth/login', { email: 'nope', password: 'secret123' });
    assert.strictEqual(res.status, 422);
  });

  await test('GET /auth/me returns the signed-in user', async () => {
    const res = await api('GET', '/auth/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.email, 'ana@aquapure.ph');
  });

  /* --------------------------------------------------------- products */
  section('Products (Point of Sale grid)');

  await test('GET /products returns the 7 POS products + 3 categories', async () => {
    const res = await api('GET', '/products');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 7, `got ${res.body.data.length}`);
    assert.strictEqual(res.body.meta.categories.length, 3);
  });

  await test('GET /products?category=refill filters correctly', async () => {
    const res = await api('GET', '/products?category=refill');
    assert.ok(res.body.data.every((p) => p.category === 'refill'));
    assert.strictEqual(res.body.data.length, 3);
  });

  await test('GET /products?search=slim matches by name', async () => {
    const res = await api('GET', '/products?search=slim');
    assert.ok(res.body.data.length >= 2, `got ${res.body.data.length}`);
  });

  await test('POST /products creates an item', async () => {
    const res = await api('POST', '/products', {
      name: 'Test Pouch Pack',
      category: 'supply',
      price: 12,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.price, 12);
  });

  await test('POST /products rejects a negative price (422)', async () => {
    const res = await api('POST', '/products', { name: 'Bad', price: -5 });
    assert.strictEqual(res.status, 422);
    assert.ok(res.body.details.price);
  });

  await test('POST /products rejects an unknown category (422)', async () => {
    const res = await api('POST', '/products', { name: 'Bad', price: 10, category: 'weapons' });
    assert.strictEqual(res.status, 422);
  });

  await test('GET /products/:id returns 404 for a valid-format unknown id', async () => {
    const res = await api('GET', '/products/000000000000000000000000');
    assert.strictEqual(res.status, 404);
  });

  await test('GET /products/:id rejects a malformed id (422)', async () => {
    const res = await api('GET', '/products/abc');
    assert.strictEqual(res.status, 422);
  });

  /* -------------------------------------------------------- inventory */
  section('Inventory & stock');

  await test('GET /inventory returns items + KPI summary', async () => {
    const res = await api('GET', '/inventory');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 12);
    assert.strictEqual(res.body.meta.summary.totalSkus, 12);
    // Only the RO membrane (2 of 3) trips the "critical" threshold.
    assert.strictEqual(res.body.meta.summary.criticalCount, 1);
  });

  await test('GET /inventory?category=Equipment filters correctly', async () => {
    const res = await api('GET', '/inventory?category=Equipment');
    assert.strictEqual(res.body.data.length, 4);
  });

  await test('GET /inventory?lowOnly=true returns only at/below reorder point', async () => {
    const res = await api('GET', '/inventory?lowOnly=true');
    res.body.data.forEach((i) => {
      assert.ok(i.stockLevel <= i.reorderPoint, `${i.name}: ${i.stockLevel} > ${i.reorderPoint}`);
    });
    // Bottle Caps 120/200, Sediment 3/5, RO 2/3, UV 4/4
    assert.strictEqual(res.body.data.length, 4);
  });

  await test('GET /inventory/alerts surfaces the low-stock banner items', async () => {
    const res = await api('GET', '/inventory/alerts');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.length >= 4);
    assert.ok(res.body.data[0].name);
  });

  await test('POST /inventory creates an item and derives status', async () => {
    const res = await api('POST', '/inventory', {
      name: 'Test Caps',
      category: 'Raw Supplies',
      stockLevel: 2,
      reorderPoint: 10,
      unitPrice: 1.5,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    // 2 units is "effectively out" -> Critical, per the design's thresholds.
    assert.strictEqual(res.body.data.status, 'Critical');
    assert.strictEqual(res.body.data.inventoryValue, 3);
  });

  await test('POST /inventory/:id/restock increments stock', async () => {
    const before = await InventoryItem.findById(inv[0]._id).lean();
    const res = await api('POST', `/inventory/${inv[0]._id}/restock`, { quantity: 25 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.stockLevel, before.stockLevel + 25);
  });

  await test('POST /inventory/:id/restock rejects a zero quantity (422)', async () => {
    const res = await api('POST', `/inventory/${inv[0]._id}/restock`, { quantity: 0 });
    assert.strictEqual(res.status, 422);
  });

  await test('POST /inventory/:id/restock cannot drive stock negative (409)', async () => {
    const res = await api('POST', `/inventory/${inv[0]._id}/restock`, { quantity: -99999 });
    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /Insufficient stock/);
  });

  await test('PUT /inventory/:id updates a reorder point', async () => {
    const res = await api('PUT', `/inventory/${inv[0]._id}`, { reorderPoint: 40 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.reorderPoint, 40);
  });

  /* ------------------------------------------- inventory archive (soft delete) */

  await test('POST /inventory/:id/archive hides the item and its KPI contribution', async () => {
    // 'UV Lamp Bulb' is seeded but not linked to any product.
    const target = inv.find((i) => i.name === 'UV Lamp Bulb');
    const before = await api('GET', '/inventory');

    const res = await api('POST', `/inventory/${target._id}/archive`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.archivedAt, 'archivedAt was not stamped');

    const after = await api('GET', '/inventory');
    assert.ok(
      !after.body.data.some((i) => i._id === String(target._id)),
      'archived item is still listed',
    );
    assert.strictEqual(after.body.meta.summary.totalSkus, before.body.meta.summary.totalSkus - 1);
    assert.strictEqual(after.body.meta.summary.archivedCount, 1);
  });

  await test('Archived items drop out of the low-stock alerts', async () => {
    const res = await api('GET', '/inventory/alerts');
    assert.ok(
      !res.body.data.some((a) => a.name === 'UV Lamp Bulb'),
      'archived item still appears in alerts',
    );
  });

  await test('GET /inventory?archived=true returns only the archived items', async () => {
    const res = await api('GET', '/inventory?archived=true');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].name, 'UV Lamp Bulb');
    assert.strictEqual(res.body.data[0].isArchived, true);
  });

  await test('POST /inventory/:id/restore brings the item back', async () => {
    const target = inv.find((i) => i.name === 'UV Lamp Bulb');

    const res = await api('POST', `/inventory/${target._id}/restore`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.archivedAt, null);

    const list = await api('GET', '/inventory');
    assert.ok(list.body.data.some((i) => i.name === 'UV Lamp Bulb'), 'restored item is missing');
    assert.strictEqual(list.body.meta.summary.archivedCount, 0);
  });

  await test('POST /inventory/:id/archive refuses an item a stock-tracked product uses (409)', async () => {
    const linked = inv.find((i) => i.name === 'Purified Water (5-Gallon)');
    const res = await api('POST', `/inventory/${linked._id}/archive`);
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /track stock/);
  });

  await test('Restocking an archived item is refused (409)', async () => {
    const target = inv.find((i) => i.name === 'Carbon Block Filter');
    await api('POST', `/inventory/${target._id}/archive`);

    const res = await api('POST', `/inventory/${target._id}/restock`, { quantity: 5 });
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /archived/i);

    await api('POST', `/inventory/${target._id}/restore`);
  });

  await test('DELETE /inventory/:id permanently removes an archived item', async () => {
    const created = await api('POST', '/inventory', {
      name: 'Scratch Item',
      category: 'Equipment',
      stockLevel: 1,
      reorderPoint: 0,
      unitPrice: 1,
    });
    const id = created.body.data._id;

    await api('POST', `/inventory/${id}/archive`);
    const del = await api('DELETE', `/inventory/${id}`);
    assert.strictEqual(del.status, 204);

    const gone = await api('GET', `/inventory/${id}`);
    assert.strictEqual(gone.status, 404);
  });

  /* ------------------------------------------ POS supplies from stock */
  section('POS supplies (Inventory & Stock at the till)');

  await test('GET /inventory/pos-supplies lists the stock flagged for sale', async () => {
    const res = await api('GET', '/inventory/pos-supplies');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const names = res.body.data.map((s) => s.name);
    // Everything in stock is sellable by default, across every category.
    assert.ok(names.includes('Bottle Caps (Pcs)'), 'raw supplies are missing from the till');
    assert.ok(names.includes('Shrink Wrap (Roll)'), 'raw supplies are missing from the till');
    assert.ok(names.includes('Membrane RO Filter'), 'equipment should be sellable too');
    assert.ok(names.includes('5-Gallon Round Container'), 'container assets should be sellable');
    // These two are the stock *behind* the refill products, so they stay off
    // the grid — a refill and a direct sale would drain the same gallons.
    assert.ok(!names.includes('Purified Water (5-Gallon)'), 'refill stock leaked into the grid');
    assert.ok(!names.includes('Refillable Container Stock'), 'refill stock leaked into the grid');

    // Shaped for the POS grid and priced from `sellPrice`, not `unitPrice`.
    const caps = res.body.data.find((s) => s.name === 'Bottle Caps (Pcs)');
    assert.strictEqual(caps.source, 'inventory');
    assert.strictEqual(caps.category, 'supply');
    assert.strictEqual(caps.price, 2);
    assert.strictEqual(caps.stockLevel, 120);

    // No card may ever advertise a free item — cost is the fallback price.
    res.body.data.forEach((s) => {
      assert.ok(s.price > 0, `${s.name} is on the grid at P${s.price}`);
    });
  });

  await test('GET /inventory/pos-supplies?search= narrows the grid', async () => {
    const res = await api('GET', '/inventory/pos-supplies?search=Alkaline');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].name, 'Alkaline Mineral Balls');
  });

  await test('PUT /inventory/:id reprices an item straight on the POS grid', async () => {
    const target = inv.find((i) => i.name === 'Membrane RO Filter');
    const res = await api('PUT', `/inventory/${target._id}`, { sellPrice: 1200 });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.sellPrice, 1200);

    const grid = await api('GET', '/inventory/pos-supplies');
    assert.strictEqual(grid.body.data.find((s) => s.name === 'Membrane RO Filter').price, 1200);
  });

  await test('PUT /inventory/:id can take an item off the till', async () => {
    const target = inv.find((i) => i.name === 'Carbon Block Filter');
    const off = await api('PUT', `/inventory/${target._id}`, { isSellable: false });
    assert.strictEqual(off.status, 200, JSON.stringify(off.body));
    assert.strictEqual(off.body.data.isSellable, false);

    const grid = await api('GET', '/inventory/pos-supplies');
    assert.ok(!grid.body.data.some((s) => s.name === 'Carbon Block Filter'));

    // Back on for the remaining fixtures.
    await api('PUT', `/inventory/${target._id}`, { isSellable: true });
  });

  /* ------------------------------------------------------- containers */
  section('Container assets');

  await test('GET /containers/summary returns the asset tracker counts', async () => {
    const res = await api('GET', '/containers/summary');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.inStation, 40);
    assert.strictEqual(res.body.data.withCustomer, 12);
    assert.strictEqual(res.body.data.damaged, 3);
    assert.strictEqual(res.body.data.total, 55);
  });

  await test('GET /containers?status=with_customer filters correctly', async () => {
    const res = await api('GET', '/containers?status=with_customer');
    assert.strictEqual(res.body.data.length, 12);
  });

  await test('POST /containers creates with an auto-generated code', async () => {
    const res = await api('POST', '/containers', { size: '5-Gallon Round' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.code, /^CNT-\d{4}$/);
  });

  await test('POST /containers rejects a duplicate code (409)', async () => {
    const res = await api('POST', '/containers', { code: 'CNT-0001' });
    assert.strictEqual(res.status, 409);
  });

  await test('POST /containers/return brings containers back to the station', async () => {
    const out = await Container.find({ status: 'with_customer' }).limit(3).lean();
    const res = await api('POST', '/containers/return', {
      containerIds: out.map((c) => String(c._id)),
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.returned, 3);
    const after = await Container.find({ _id: { $in: out.map((c) => c._id) } }).lean();
    assert.ok(after.every((c) => c.status === 'in_station' && c.customer === null));
  });

  await test('POST /containers/return requires at least one id (422)', async () => {
    const res = await api('POST', '/containers/return', { containerIds: [] });
    assert.strictEqual(res.status, 422);
  });

  /* --------------------------------------------------------- customers */
  section('Customers');

  await test('GET /customers returns accounts with containers-out', async () => {
    const res = await api('GET', '/customers');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 5);
    assert.ok(res.body.data.every((c) => typeof c.containersOut === 'number'));
  });

  await test('GET /customers?type=delivery filters correctly', async () => {
    const res = await api('GET', '/customers?type=delivery');
    assert.strictEqual(res.body.data.length, 2);
  });

  await test('POST /customers creates an account', async () => {
    const res = await api('POST', '/customers', {
      name: 'Smoke Test Buyer',
      type: 'regular',
      creditLimit: 1000,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  /* ------------------------------------------------------------ orders */
  section('Orders / Point of Sale');

  let createdOrder;

  await test('POST /orders completes a cash walk-in sale', async () => {
    const before = await InventoryItem.findById(refill.inventoryItem).lean();
    const clerkBefore = await Employee.findById(clerk._id).lean();

    const res = await api('POST', '/orders', {
      customerType: 'walk_in',
      staff: String(clerk._id),
      items: [{ product: String(refill._id), qty: 4 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const order = res.body.data;
    createdOrder = order;

    // 4 x P25 = P100, P100 tendered -> P0 change
    assert.strictEqual(order.subtotal, 100);
    assert.strictEqual(order.total, 100);
    assert.strictEqual(order.change, 0);
    assert.strictEqual(order.orderId, 'TXN-2848');

    // Stock is decremented...
    const after = await InventoryItem.findById(refill.inventoryItem).lean();
    assert.strictEqual(after.stockLevel, before.stockLevel - 4);

    // ...and the clerk's revenue/units roll up.
    const clerkAfter = await Employee.findById(clerk._id).lean();
    assert.strictEqual(round2(clerkAfter.revenue), round2(clerkBefore.revenue + 100));
    assert.strictEqual(round2(clerkAfter.achieved), round2(clerkBefore.achieved + 4));
  });

  await test('POST /orders computes change for over-tendered cash', async () => {
    const res = await api('POST', '/orders', {
      customerType: 'walk_in',
      staff: String(clerk._id),
      items: [{ product: String(pouch._id), qty: 3 }],
      paymentMethod: 'cash',
      cashReceived: 50,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.subtotal, 15);
    assert.strictEqual(res.body.data.change, 35);
  });

  await test('POST /orders applies a discount', async () => {
    const res = await api('POST', '/orders', {
      customerType: 'walk_in',
      items: [{ product: String(refill._id), qty: 4 }],
      discount: 10,
      paymentMethod: 'gcash',
    });
    assert.strictEqual(res.body.data.subtotal, 100);
    assert.strictEqual(res.body.data.discount, 10);
    assert.strictEqual(res.body.data.total, 90);
  });

  await test('POST /orders rejects under-tendered cash (400)', async () => {
    const res = await api('POST', '/orders', {
      items: [{ product: String(refill._id), qty: 4 }],
      paymentMethod: 'cash',
      cashReceived: 10,
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /less than the total/);
  });

  await test('POST /orders rejects an empty cart (422)', async () => {
    const res = await api('POST', '/orders', { items: [], paymentMethod: 'cash' });
    assert.strictEqual(res.status, 422);
  });

  await test('POST /orders rejects an unknown product (400)', async () => {
    const res = await api('POST', '/orders', {
      items: [{ product: '000000000000000000000000', qty: 1 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Unknown or inactive product/);
  });

  /* --------------------------------- selling straight from the stock */
  await test('POST /orders sells a stock item and drops the level (300 → 200)', async () => {
    // The exact scenario from the brief: 300 in stock, 100 sold.
    const created = await api('POST', '/inventory', {
      name: 'Bulk Caps',
      category: 'Raw Supplies',
      stockLevel: 300,
      reorderPoint: 50,
      unitPrice: 0.5,
      sellPrice: 2,
      isSellable: true,
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data._id;

    const res = await api('POST', '/orders', {
      customerType: 'walk_in',
      items: [{ inventoryItem: id, qty: 100 }],
      paymentMethod: 'cash',
      cashReceived: 500,
    });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    // Priced from the item's sellPrice, never from the cost or the client.
    assert.strictEqual(res.body.data.total, 200);

    const line = res.body.data.items[0];
    assert.strictEqual(line.source, 'inventory');
    assert.strictEqual(line.qty, 100);
    assert.strictEqual(line.lineTotal, 200);

    const after = await InventoryItem.findById(id).lean();
    assert.strictEqual(after.stockLevel, 200, 'stock should drop from 300 to 200');

    // The new level is what the POS grid now advertises.
    const grid = await api('GET', '/inventory/pos-supplies');
    assert.strictEqual(grid.body.data.find((s) => s._id === id).stockLevel, 200);

    await api('DELETE', `/inventory/${id}`);
  });

  await test('POST /orders mixes a catalog product and a stock item in one ticket', async () => {
    const caps = inv.find((i) => i.name === 'Bottle Caps (Pcs)');
    const before = await InventoryItem.findById(caps._id).lean();

    const res = await api('POST', '/orders', {
      customerType: 'walk_in',
      items: [
        { product: String(refill._id), qty: 2 }, // 2 x P25
        { inventoryItem: String(caps._id), qty: 10 }, // 10 x P2
      ],
      paymentMethod: 'gcash',
    });

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.subtotal, 70);
    assert.strictEqual(res.body.data.items.length, 2);

    const after = await InventoryItem.findById(caps._id).lean();
    assert.strictEqual(after.stockLevel, before.stockLevel - 10);
  });

  await test('POST /orders refuses to oversell a stock item (400)', async () => {
    const caps = inv.find((i) => i.name === 'Bottle Caps (Pcs)');
    const before = await InventoryItem.findById(caps._id).lean();

    const res = await api('POST', '/orders', {
      items: [{ inventoryItem: String(caps._id), qty: before.stockLevel + 1 }],
      paymentMethod: 'cash',
      cashReceived: 9999,
    });

    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /Not enough stock/);

    // The refused sale must not have moved the stock at all.
    const after = await InventoryItem.findById(caps._id).lean();
    assert.strictEqual(after.stockLevel, before.stockLevel);
  });

  await test('POST /orders refuses a stock item that is not flagged for sale (400)', async () => {
    const target = inv.find((i) => i.name === 'Membrane RO Filter');
    // Sellable is now the default, so take it off the till explicitly.
    await api('PUT', `/inventory/${target._id}`, { isSellable: false });
    const before = await InventoryItem.findById(target._id).lean();

    const res = await api('POST', '/orders', {
      items: [{ inventoryItem: String(target._id), qty: 1 }],
      paymentMethod: 'cash',
      cashReceived: 1000,
    });

    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /not available for sale/i);

    const after = await InventoryItem.findById(target._id).lean();
    assert.strictEqual(after.stockLevel, before.stockLevel);

    // Back on for the remaining fixtures.
    await api('PUT', `/inventory/${target._id}`, { isSellable: true });
  });

  await test('A sellable item with no price falls back to its unit cost', async () => {
    const created = await api('POST', '/inventory', {
      name: 'Unpriced Item',
      category: 'Raw Supplies',
      stockLevel: 5,
      reorderPoint: 1,
      unitPrice: 25,
      isSellable: true,
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    // Saved at cost, so the till never shows a free card.
    assert.strictEqual(created.body.data.sellPrice, 25);

    const grid = await api('GET', '/inventory/pos-supplies');
    assert.strictEqual(grid.body.data.find((s) => s._id === created.body.data._id).price, 25);

    await api('DELETE', `/inventory/${created.body.data._id}`);
  });

  await test('POST /orders rejects a line with neither a product nor a stock item (422)', async () => {
    const res = await api('POST', '/orders', {
      items: [{ qty: 1 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });
    assert.strictEqual(res.status, 422, JSON.stringify(res.body));
  });

  await test('POST /orders rejects a line carrying both ids (422)', async () => {
    const caps = inv.find((i) => i.name === 'Bottle Caps (Pcs)');
    const res = await api('POST', '/orders', {
      items: [{ product: String(refill._id), inventoryItem: String(caps._id), qty: 1 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });
    assert.strictEqual(res.status, 422, JSON.stringify(res.body));
  });

  await test('Archiving a stock item takes it off the POS grid', async () => {
    const created = await api('POST', '/inventory', {
      name: 'Temp POS Item',
      category: 'Raw Supplies',
      stockLevel: 10,
      reorderPoint: 1,
      unitPrice: 1,
      sellPrice: 5,
      isSellable: true,
    });
    const id = created.body.data._id;

    const before = await api('GET', '/inventory/pos-supplies');
    assert.ok(before.body.data.some((s) => s._id === id));

    await api('POST', `/inventory/${id}/archive`);

    const after = await api('GET', '/inventory/pos-supplies');
    assert.ok(!after.body.data.some((s) => s._id === id), 'archived item still on the POS grid');

    await api('DELETE', `/inventory/${id}`);
  });

  await test('POST /orders on-account increases the customer balance', async () => {
    const before = await Customer.findById(regularCustomer._id).lean();
    const res = await api('POST', '/orders', {
      customerType: 'regular',
      customer: String(regularCustomer._id),
      items: [{ product: String(refill._id), qty: 8 }],
      paymentMethod: 'on_account',
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const after = await Customer.findById(regularCustomer._id).lean();
    assert.strictEqual(round2(after.balance), round2(before.balance + 200));
  });

  await test('POST /orders on-account without a customer is rejected (400)', async () => {
    const res = await api('POST', '/orders', {
      items: [{ product: String(refill._id), qty: 1 }],
      paymentMethod: 'on_account',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /require a customer account/);
  });

  await test('POST /orders with new_container issues a container', async () => {
    const newContainer = products.find((p) => p.name === 'New Container + Water');
    const before = await Container.countDocuments({ status: 'in_station' });
    const res = await api('POST', '/orders', {
      customerType: 'regular',
      customer: String(regularCustomer._id),
      items: [{ product: String(newContainer._id), qty: 1 }],
      containerHandling: 'new_container',
      paymentMethod: 'cash',
      cashReceived: 500,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const after = await Container.countDocuments({ status: 'in_station' });
    assert.strictEqual(after, before - 1, 'a container should have left the station');
  });

  await test('GET /orders paginates and returns meta', async () => {
    const res = await api('GET', '/orders?page=1&limit=3');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 3);
    assert.strictEqual(res.body.meta.page, 1);
    assert.strictEqual(res.body.meta.limit, 3);
    assert.ok(res.body.meta.total >= 5);
  });

  await test('GET /orders?paymentMethod=cash filters correctly', async () => {
    const res = await api('GET', '/orders?paymentMethod=cash');
    assert.ok(res.body.data.every((o) => o.paymentMethod === 'cash'));
  });

  await test('GET /orders/code/:orderId looks up by human id', async () => {
    const res = await api('GET', '/orders/code/TXN-2848');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.total, 100);
  });

  await test('GET /orders/recent returns the dashboard table', async () => {
    const res = await api('GET', '/orders/recent?limit=5');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.length <= 5);
    assert.ok(res.body.data[0].orderId);
  });

  await test('PATCH /orders/:id/status cancels an order', async () => {
    const res = await api('PATCH', `/orders/${createdOrder._id}/status`, { status: 'cancelled' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.status, 'cancelled');
  });

  await test('PATCH /orders/:id/status rejects an unknown status (422)', async () => {
    const res = await api('PATCH', `/orders/${createdOrder._id}/status`, { status: 'banana' });
    assert.strictEqual(res.status, 422);
  });

  /* -------------------------------------------------------- employees */
  section('Employees & quotas');

  await test('GET /employees returns 6 staff with derived progress', async () => {
    const res = await api('GET', '/employees');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 6);
    res.body.data.forEach((e) => {
      assert.ok(typeof e.progress === 'number', `${e.name} has no progress`);
      assert.ok(typeof e.commission === 'number');
    });
  });

  await test('GET /employees?role=driver returns 3 drivers', async () => {
    const res = await api('GET', '/employees?role=driver');
    assert.strictEqual(res.body.data.length, 3);
  });

  await test('GET /employees/performance returns KPIs + quota table', async () => {
    const res = await api('GET', '/employees/performance');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.kpis.activeStaff, 6);
    assert.strictEqual(res.body.data.kpis.byRole.clerk, 2);
    assert.strictEqual(res.body.data.kpis.byRole.driver, 3);
    assert.strictEqual(res.body.data.kpis.byRole.operator, 1);
    assert.ok(res.body.data.staff.every((e) => e.initials && e.initials.length === 2));
  });

  await test('quota status thresholds map to the design labels', async () => {
    const res = await api('GET', '/employees/performance');
    const valid = ['Quota Met', 'On Track', 'Almost There', 'Lagging'];
    res.body.data.staff.forEach((e) => {
      assert.ok(valid.includes(e.performanceStatus), `${e.name}: ${e.performanceStatus}`);
    });
  });

  await test('POST /employees/targets bulk-updates quotas', async () => {
    const res = await api('POST', '/employees/targets', {
      targets: [{ employee: String(clerk._id), quotaTarget: 12 }],
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const found = res.body.data.find((e) => String(e._id) === String(clerk._id));
    assert.strictEqual(found.quotaTarget, 12);
  });

  await test('POST /employees/targets requires at least one entry (422)', async () => {
    const res = await api('POST', '/employees/targets', { targets: [] });
    assert.strictEqual(res.status, 422);
  });

  await test('POST /employees creates a staff record', async () => {
    const res = await api('POST', '/employees', {
      name: 'Smoke Tester',
      role: 'clerk',
      quotaTarget: 40,
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  /* ---------------------------------------- employee archive (soft delete) */

  let temp = null;

  await test('POST /employees/:id/archive hides the employee and their KPIs', async () => {
    const created = await api('POST', '/employees', {
      name: 'Temp Clerk',
      role: 'clerk',
      quotaTarget: 15,
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    temp = created.body.data;

    const before = await api('GET', '/employees/performance');
    const res = await api('POST', `/employees/${temp._id}/archive`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.archivedAt, 'archivedAt was not stamped');

    // Gone from the active roster...
    const list = await api('GET', '/employees');
    assert.ok(
      !list.body.data.some((e) => e._id === temp._id),
      'archived employee is still in the active list',
    );

    // ...and from the KPI row, with the archived count bumped.
    const after = await api('GET', '/employees/performance');
    assert.ok(
      !after.body.data.staff.some((e) => e._id === temp._id),
      'archived employee is still in the performance table',
    );
    assert.strictEqual(
      after.body.data.kpis.activeStaff,
      before.body.data.kpis.activeStaff - 1,
      'activeStaff did not drop',
    );
    assert.strictEqual(after.body.data.kpis.archivedCount, 1);
  });

  await test('GET /employees?archived=true returns only the archived staff', async () => {
    const res = await api('GET', '/employees?archived=true');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0]._id, temp._id);
    assert.strictEqual(res.body.data[0].isArchived, true);
  });

  await test('Set targets refuses an archived employee (404)', async () => {
    const res = await api('POST', '/employees/targets', {
      targets: [{ employee: String(temp._id), quotaTarget: 5 }],
    });
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
  });

  await test('POST /employees/:id/restore brings the employee back', async () => {
    const res = await api('POST', `/employees/${temp._id}/restore`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.archivedAt, null);

    const list = await api('GET', '/employees');
    assert.ok(
      list.body.data.some((e) => e._id === temp._id),
      'restored employee is missing from the active list',
    );
    const perf = await api('GET', '/employees/performance');
    assert.strictEqual(perf.body.data.kpis.archivedCount, 0);
  });

  await test('DELETE /employees/:id permanently removes an archived employee', async () => {
    await api('POST', `/employees/${temp._id}/archive`);
    const res = await api('DELETE', `/employees/${temp._id}`);
    assert.strictEqual(res.status, 204, JSON.stringify(res.body));

    const missing = await api('GET', `/employees/${temp._id}`);
    assert.strictEqual(missing.status, 404);
    temp = null;
  });

  await test('Archiving an unknown employee is a 404', async () => {
    const res = await api('POST', '/employees/64b7f9c1e2b3c4d5e6f7a8b9/archive');
    assert.strictEqual(res.status, 404);
  });

  /* --------------------------------------------------------- dashboard */
  section('Dashboard overview');

  await test('GET /dashboard/summary returns every widget payload', async () => {
    const res = await api('GET', '/dashboard/summary');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;

    assert.ok(d.kpis.revenue, 'revenue kpi missing');
    assert.ok('walkIn' in d.kpis.revenue);
    assert.ok(d.kpis.unitsRefilled);
    assert.ok(d.kpis.unreturned);
    assert.ok(Array.isArray(d.stockAlerts));
    assert.ok(d.quotaProgress.staff.length > 0);
    assert.ok(d.quotaProgress.staff[0].initials);
    assert.ok(d.containers);
    assert.ok(Array.isArray(d.recentOrders));
    assert.ok(d.shift, 'active shift missing');
  });

  await test('dashboard revenue equals the sum of the payment breakdown', async () => {
    const dash = await api('GET', '/dashboard/summary');
    const metrics = await api('GET', '/orders/metrics/summary');
    const sum = metrics.body.data.byMethod.reduce((s, m) => s + m.amount, 0);
    assert.strictEqual(round2(dash.body.data.kpis.revenue.value), round2(sum));
  });

  await test('GET /dashboard/notifications returns bell-badge counts', async () => {
    const res = await api('GET', '/dashboard/notifications');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body.data.total === 'number');
  });

  /* ----------------------------------------------------------- reports */
  section('Reports & X-Read');

  await test('GET /reports/daily returns the full X-Read payload', async () => {
    const res = await api('GET', '/reports/daily');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.ok(d.shift.label.includes('X-Read'));
    assert.ok('grossRevenue' in d.headline);
    assert.ok('totalTransactions' in d.headline);
    assert.ok(Array.isArray(d.perEmployee));
    assert.ok('totals' in d);
    assert.ok(Array.isArray(d.paymentBreakdown));
  });

  await test('cash drawer maths: expected = float + cash - refunds', async () => {
    const res = await api('GET', '/reports/daily');
    const r = res.body.data.reconciliation;
    assert.strictEqual(
      r.expectedCash,
      round2(r.openingFloat + r.cashSales - r.cashRefunds),
    );
    assert.strictEqual(r.openingFloat, 2000);
  });

  await test('GET /reports/shifts/active returns the open shift', async () => {
    const res = await api('GET', '/reports/shifts/active');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.name, 'Morning');
    assert.strictEqual(res.body.data.status, 'active');
  });

  await test('GET /reports/shifts lists shifts', async () => {
    const res = await api('GET', '/reports/shifts');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.length >= 1);
  });

  await test('PATCH /reports/shifts/:id/reconcile balances the drawer', async () => {
    const active = await api('GET', '/reports/shifts/active');
    const shiftId = active.body.data._id;
    const expected = (await api('GET', '/reports/daily')).body.data.reconciliation.expectedCash;

    const res = await api('PATCH', `/reports/shifts/${shiftId}/reconcile`, {
      actualCash: expected,
      countedBy: 'Ana Cruz',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.variance, 0);
    assert.strictEqual(res.body.data.reconciled, true);
  });

  await test('reconciling with a short count surfaces a negative variance', async () => {
    const active = await api('GET', '/reports/shifts/active');
    const res = await api('PATCH', `/reports/shifts/${active.body.data._id}/reconcile`, {
      actualCash: 100,
      countedBy: 'Ana Cruz',
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.variance < 0);
  });

  await test('GET /reports/export/orders.csv streams a CSV', async () => {
    const res = await fetch(`${baseUrl}/reports/export/orders.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const text = await res.text();
    assert.ok(text.startsWith('Order ID,Date,Time,Customer'), `bad header: ${text.slice(0, 40)}`);
    // Completed orders only — TXN-2848 was cancelled by the previous test.
    assert.ok(/TXN-284[89]/.test(text), `no order rows in:\n${text}`);
  });

  await test('GET /reports/export/employees.csv streams a CSV', async () => {
    const res = await fetch(`${baseUrl}/reports/export/employees.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.startsWith('Employee,Role,Target (gal)'));
    assert.ok(text.includes('Maria Santos'));
  });

  /* ------------------------------------------------- reporting engine */

  await test('GET /reports/summary builds the daily Reporting Engine payload', async () => {
    const res = await api('GET', '/reports/summary?period=daily');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;

    assert.strictEqual(d.period, 'daily');
    assert.strictEqual(d.labels.length, 24, 'daily reports bucket by hour');
    assert.strictEqual(d.sales.series.length, 24);
    assert.ok(d.sales.totals.revenue >= 0);
    assert.ok('collectionRate' in d.sales.totals);
    assert.ok('outstanding' in d.sales.receivables);
    assert.ok(Array.isArray(d.sales.receivables.topDebtors));
    assert.ok('fulfillmentRate' in d.orders.totals);
    assert.ok(Array.isArray(d.orders.byCustomerType));

    const b = d.gallons.balances;
    assert.strictEqual(
      b.total,
      b.inStore + b.delivered + b.damaged,
      'gallon balances must add up',
    );
    assert.ok(d.gallons.series.every((row) => row.inStore >= 0));
  });

  await test('weekly report series sums to the reported revenue total', async () => {
    const res = await api('GET', '/reports/summary?period=weekly');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.strictEqual(d.period, 'weekly');
    assert.strictEqual(d.labels.length, 7, 'weekly reports bucket by day');

    const sum = d.sales.series.reduce((s, row) => s + row.revenue, 0);
    assert.ok(
      Math.abs(sum - d.sales.totals.revenue) < 0.05,
      `series ${sum} != total ${d.sales.totals.revenue}`,
    );

    const ordersSum = d.orders.series.reduce((s, row) => s + row.orders, 0);
    assert.strictEqual(ordersSum, d.orders.totals.orders);
  });

  await test('monthly and yearly reports bucket by day and by month', async () => {
    const now = new Date();
    const monthly = await api('GET', '/reports/summary?period=monthly');
    assert.strictEqual(monthly.status, 200, JSON.stringify(monthly.body));
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    assert.strictEqual(monthly.body.data.labels.length, daysInMonth);

    const yearly = await api('GET', '/reports/summary?period=yearly');
    assert.strictEqual(yearly.status, 200, JSON.stringify(yearly.body));
    assert.strictEqual(yearly.body.data.labels.length, 12);
    assert.strictEqual(yearly.body.data.labels[0], 'Jan');
  });

  await test('delivery fulfillment tracks fulfilled vs missed deliveries', async () => {
    const res = await api('GET', '/reports/summary?period=weekly');
    const t = res.body.data.orders.totals;
    assert.strictEqual(
      t.deliveryMissed,
      t.deliveryOrders - t.deliveryFulfilled,
      'missed = ordered - fulfilled',
    );
    if (t.deliveryOrders === 0) {
      assert.strictEqual(t.fulfillmentRate, 0);
    } else {
      assert.ok(t.fulfillmentRate >= 0 && t.fulfillmentRate <= 100);
    }
  });

  await test('an unknown report period is rejected', async () => {
    const res = await api('GET', '/reports/summary?period=decade');
    assert.strictEqual(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.details.period, 'period field error expected');
  });

  await test('daily ledgers expose the transaction + gallon-movement tables', async () => {
    const res = await api('GET', '/reports/summary?period=daily');
    const L = res.body.data.ledgers;
    assert.ok(Array.isArray(L.transactions), 'transaction rows missing');
    assert.ok(Array.isArray(L.movement), 'movement rows missing');
    assert.ok('orders' in L.transactionTotals);
    assert.ok('starting' in L.movementTotals && 'ending' in L.movementTotals);
    if (L.transactions.length > 0) {
      const row = L.transactions[0];
      assert.ok(row.orderId && row.customerName && row.statusLabel, 'ledger row incomplete');
      assert.ok('amount' in row && 'gallons' in row);
    }
    // Movement ledger: starting + refilled - sentOut + returned ≈ ending
    // (damaged returns do not go back on the shelf).
    L.movement.forEach((r) => {
      assert.ok(r.starting >= 0 && r.ending >= 0, 'negative stock in movement ledger');
    });
  });

  await test('weekly ledger has one row per day with totals that add up', async () => {
    const res = await api('GET', '/reports/summary?period=weekly');
    const rows = res.body.data.ledgers.weekly;
    assert.strictEqual(rows.length, 7);
    assert.ok(rows.every((r) => r.day && 'revenue' in r && 'unreturned' in r));
    const revenueSum = rows.reduce((s, r) => s + r.revenue, 0);
    assert.ok(Math.abs(revenueSum - res.body.data.sales.totals.revenue) < 0.05);
  });

  await test('monthly ledger has one row per week with a top seller', async () => {
    const res = await api('GET', '/reports/summary?period=monthly');
    const rows = res.body.data.ledgers.monthly;
    const now = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    assert.strictEqual(rows.length, Math.ceil(days / 7));
    assert.ok(rows.every((r) => r.week && r.range && 'topSeller' in r));
  });

  await test('yearly ledger has one row per month with an annual total basis', async () => {
    const res = await api('GET', '/reports/summary?period=yearly');
    const rows = res.body.data.ledgers.yearly;
    assert.strictEqual(rows.length, 12);
    assert.ok(rows.every((r) => r.month && 'newContainers' in r && 'damaged' in r));
    const orderSum = rows.reduce((s, r) => s + r.orders, 0);
    assert.strictEqual(orderSum, res.body.data.orders.totals.orders);
  });

  /* ------------------------------------------------------------ errors */
  section('Error handling');

  await test('unknown route returns 404', async () => {
    const res = await api('GET', '/does-not-exist');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
  });

  await test('non-/api route returns 404', async () => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/nope`);
    assert.strictEqual(res.status, 404);
  });

  /* ------------------------------------------------------------ report */
  section('Result');
  process.stdout.write(
    `  ${results.passed} passed, ${results.failed} failed  (${results.passed + results.failed} total)\n`,
  );
  if (results.failures.length) {
    results.failures.forEach((f) => process.stdout.write(`  - ${f.name}: ${f.message}\n`));
  }
  process.stdout.write('\n');
}

run()
  .then(async () => {
    if (server) await new Promise((r) => server.close(r));
    await disconnectDB();
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('\nSmoke test crashed:', err);
    if (server) await new Promise((r) => server.close(r));
    await disconnectDB();
    process.exit(1);
  });
