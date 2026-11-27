/* eslint-disable no-console */
/**
 * CLI wrapper around the reusable seeder in `src/seed`.
 *
 *   npm run seed              add demo data (warns if data already exists)
 *   npm run seed:fresh        wipe everything, then seed
 *   npm run seed -- --force   seed on top of existing data
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB, isMemoryDb } = require('../src/config/db');
const logger = require('../src/utils/logger');
const { seedDatabase, hasData } = require('../src/seed');

const fresh = process.argv.includes('--fresh');
const force = process.argv.includes('--force');

async function main() {
  await connectDB();

  if (!fresh && !force && (await hasData())) {
    logger.warn('The database already contains orders.');
    logger.warn('Use  npm run seed:fresh  to wipe everything and reseed from scratch.');
    logger.warn('Passing --force will add the demo data on top of what is there.');
    await disconnectDB();
    process.exit(0);
  }

  logger.section('Seeding AquaPure demo data');
  await seedDatabase({ fresh });

  logger.section('Done');
  logger.info('Sign in with:  ana@aquapure.ph  /  password123');
  logger.info(
    `Database:     ${isMemoryDb() ? 'in-memory (discarded on shutdown)' : mongoose.connection.name}`,
  );
  if (isMemoryDb()) {
    logger.warn(
      'The in-memory database is empty again on the next start — set MONGODB_URI in .env to persist.',
    );
  }
  logger.info('─'.repeat(64));

  await disconnectDB();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seeding failed:', err);
    process.exit(1);
  });
