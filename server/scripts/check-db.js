/**
 * Quick MongoDB connectivity check — no server, no data changes.
 *
 *   node scripts/check-db.js
 *
 * Prints whether the URI resolved, which database is targeted, whether
 * transactions are available, and the collection/document counts.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDB, disconnectDB, isMemoryDb } = require('../src/config/db');
const orderService = require('../src/services/order.service');

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

async function main() {
  console.log('\nMongoDB connection check\n');

  if (!env.mongoUri) {
    console.log('  MONGODB_URI is empty — the server would use an in-memory database.');
    console.log('  Add your Atlas URI to server/.env to use a real database.\n');
    await connectDB();
    await disconnectDB();
    return;
  }

  // Never print the password.
  line('URI host', env.mongoUri.split('@')[1]?.split('/')[0] || '?');
  line('Database name', env.dbName);

  const started = Date.now();
  await connectDB();
  line('Connected in', `${Date.now() - started} ms`);
  line('Using in-memory?', isMemoryDb() ? 'YES' : 'no — real MongoDB');

  const supportsTx = await orderService.transactionsSupported();
  line('Transactions', supportsTx ? 'yes (replica set)' : 'no (standalone)');

  const collections = await mongoose.connection.db.listCollections().toArray();
  line('Collections', collections.length);

  const counts = await Promise.all(
    ['orders', 'products', 'inventoryitems', 'employees', 'customers', 'containers', 'users', 'shifts']
      .map(async (name) => {
        if (!collections.some((c) => c.name === name)) return null;
        const n = await mongoose.connection.db.collection(name).countDocuments();
        return n > 0 ? `${name}=${n}` : null;
      }),
  );

  const present = counts.filter(Boolean);
  line('Documents', present.length ? present.join('  ') : 'none — run: npm run seed:fresh');

  console.log('\n  Connection OK\n');
}

main()
  .then(async () => {
    await disconnectDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n  CONNECTION FAILED\n');
    console.error(`  ${err.name}: ${err.message}\n`);

    if (/Authentication failed/i.test(err.message)) {
      console.error('  → Check the username and password in server/.env');
      console.error('  → Create the user in Atlas → Database Access with');
      console.error('    "Read and write to any database"\n');
    } else if (/ECONNREFUSED|Server selection|ENOTFOUND|querySrv/i.test(err.message)) {
      console.error('  → Your IP is probably not allowlisted.');
      console.error('  → Atlas → Network Access → add your IP, or 0.0.0.0/0\n');
    } else if (/not primary|no primary/i.test(err.message)) {
      console.error('  → The free-tier cluster may have gone to sleep.');
      console.error('  → Open cloud.mongodb.com once to wake it, then retry.\n');
    }
    await disconnectDB().catch(() => {});
    process.exit(1);
  });
