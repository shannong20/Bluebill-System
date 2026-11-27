/**
 * Centralized environment configuration.
 * Everything the app needs is read here exactly once, validated, and exported.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5000),

  // Mongo
  mongoUri: process.env.MONGODB_URI || '',
  // When true (or when MONGODB_URI is missing) the app boots an ephemeral
  // in-memory MongoDB so the system is runnable without a local mongod.
  useMemoryDb: toBool(process.env.USE_MEMORY_DB, false),
  dbName: process.env.MONGODB_DB_NAME || 'aquapure',
  memoryDbPort: toInt(process.env.MEMORY_DB_PORT, 27018),

  // Seed the demo data automatically when the database is empty on boot.
  autoSeed: toBool(process.env.AUTO_SEED, true),

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'aquapure-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 10),

  // HTTP
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 1000),

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  isTest: (process.env.NODE_ENV || 'development') === 'test',
};

module.exports = env;
