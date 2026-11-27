const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let memoryServer = null;

/**
 * Connects mongoose to MongoDB.
 *
 * Resolution order:
 *  1. `MONGODB_URI` from .env (use your MongoDB Atlas string for real usage)
 *  2. `USE_MEMORY_DB=true` -> ephemeral in-memory MongoDB (dev/demo/testing)
 *  3. nothing configured -> fall back to in-memory so the API still boots
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  const wantsMemory = env.useMemoryDb || !env.mongoUri;

  if (wantsMemory) {
    if (!env.mongoUri) {
      logger.warn(
        'MONGODB_URI is not set — starting an in-memory MongoDB. ' +
          'Data will NOT persist. Add a connection string to server/.env for real usage.'
      );
    }
    // Loaded lazily so production installs that always have a URI
    // never pay the (large) mongodb-memory-server dependency cost.
    // eslint-disable-next-line global-require
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({
      instance: { port: env.memoryDbPort, dbName: env.dbName },
    });
    const uri = memoryServer.getUri();
    await mongoose.connect(uri, { dbName: env.dbName });
    logger.success(`MongoDB connected (in-memory) → ${uri}`);
    return mongoose.connection;
  }

  await mongoose.connect(env.mongoUri, {
    dbName: env.dbName,
    serverSelectionTimeoutMS: 10_000,
  });
  logger.success(`MongoDB connected → ${redact(env.mongoUri)}`);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  logger.info('MongoDB disconnected.');
}

/** True when running against the ephemeral dev database. */
const isMemoryDb = () => Boolean(memoryServer);

function redact(uri) {
  if (!uri) return '(none)';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

module.exports = { connectDB, disconnectDB, isMemoryDb, mongoose };
