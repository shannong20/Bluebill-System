/**
 * Live integration check against a RUNNING server.
 *
 *   node scripts/verify-live.js
 *
 * Unlike smoke.js (which boots its own app), this talks to
 * http://localhost:5000 so you can confirm the real server process,
 * CORS config and env are all wired correctly.
 */
const BASE = process.env.VERIFY_URL || 'http://localhost:5000/api';

let token = null;
const results = { passed: 0, failed: 0 };

const check = async (name, fn) => {
  try {
    await fn();
    results.passed += 1;
    console.log(`  \x1b[32mOK\x1b[0m   ${name}`);
  } catch (err) {
    results.failed += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}\n       ${err.message}`);
  }
};

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
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

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function main() {
  console.log(`\nAquaPure live check → ${BASE}\n`);

  let products = [];

  await check('GET /health', async () => {
    const r = await call('GET', '/health');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.body.data.status === 'ok', 'status not ok');
  });

  await check('POST /auth/login', async () => {
    const r = await call('POST', '/auth/login', {
      email: 'ana@aquapure.ph',
      password: 'password123',
    });
    assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    token = r.body.data.token;
    console.log(`       signed in as ${r.body.data.user.name} (${r.body.data.user.role})`);
  });

  await check('GET /dashboard/summary returns full payload', async () => {
    const r = await call('GET', '/dashboard/summary');
    assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body.data;
    assert(d.shift, 'no active shift');
    assert(d.quotaProgress.staff.length > 0, 'no quota rows');
    assert(Array.isArray(d.stockAlerts), 'no stock alerts array');
    console.log(
      `       revenue ${d.kpis.revenue.value} · ${d.quotaProgress.staff.length} staff · ` +
        `${d.stockAlerts.length} alerts · ${d.containers.total} containers`,
    );
  });

  await check('GET /products returns the POS grid', async () => {
    const r = await call('GET', '/products');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.body.data.length > 0, 'no products');
    assert(r.body.meta.categories.length === 3, 'expected 3 categories');
    products = r.body.data;
    console.log(
      `       ${products.length} products across ${r.body.meta.categories.length} categories`,
    );
  });

  await check('GET /inventory + summary', async () => {
    const r = await call('GET', '/inventory');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.body.data.length > 0, 'no inventory items');
    console.log(
      `       ${r.body.data.length} items · ${r.body.meta.summary.lowOrCritical} low/critical · ` +
        `value ${r.body.meta.summary.estimatedValue}`,
    );
  });

  await check('GET /containers/summary', async () => {
    const r = await call('GET', '/containers/summary');
    assert(r.status === 200, `status ${r.status}`);
    console.log(
      `       ${r.body.data.inStation} in station · ${r.body.data.withCustomer} out · ${r.body.data.damaged} damaged`,
    );
  });

  await check('GET /employees/performance', async () => {
    const r = await call('GET', '/employees/performance');
    assert(r.status === 200, `status ${r.status}`);
    assert(r.body.data.staff.length > 0, 'no staff');
    assert(r.body.data.staff.every((s) => s.initials), 'missing initials');
    console.log(
      `       ${r.body.data.staff.length} staff · quotas met ${r.body.data.kpis.quotasMet}`,
    );
  });

  await check('GET /reports/daily builds the X-Read', async () => {
    const r = await call('GET', '/reports/daily');
    assert(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const d = r.body.data;
    assert(d.headline, 'no headline');
    assert(d.reconciliation, 'no reconciliation');
    console.log(
      `       ${d.shift?.label || 'no shift'} · gross ${d.headline.grossRevenue} · ` +
        `expected drawer ${d.reconciliation.expectedCash}`,
    );
  });

  // A live write: completes a sale end-to-end through the real server.
  const refill = products.find((p) => p.name.includes('Round Refill'));
  await check('POST /orders completes a real sale', async () => {
    if (!refill) throw new Error('no refill product to sell');
    const before = await call('GET', '/inventory');
    const water = before.body.data.find((i) => i.name.includes('Purified Water'));

    const r = await call('POST', '/orders', {
      customerType: 'walk_in',
      items: [{ product: refill._id, qty: 2 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });
    assert(r.status === 201, `status ${r.status}: ${JSON.stringify(r.body)}`);
    const o = r.body.data;
    assert(o.total === 50, `expected total 50, got ${o.total}`);
    assert(o.change === 50, `expected change 50, got ${o.change}`);
    console.log(`       ${o.orderId} · total ${o.total} · change ${o.change}`);

    if (water) {
      const after = await call('GET', '/inventory');
      const now = after.body.data.find((i) => i._id === water._id);
      assert(
        now.stockLevel === water.stockLevel - 2,
        `stock not decremented: ${water.stockLevel} -> ${now.stockLevel}`,
      );
      console.log(`       stock decremented ${water.stockLevel} -> ${now.stockLevel}`);
    }
  });

  await check('unauthenticated request is rejected', async () => {
    const saved = token;
    token = null;
    const r = await call('GET', '/products');
    token = saved;
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  console.log(`\n  ${results.passed} passed, ${results.failed} failed\n`);
  process.exit(results.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nCould not reach the server:', err.message);
  console.error('Is it running?  cd server && npm run dev');
  process.exit(1);
});

