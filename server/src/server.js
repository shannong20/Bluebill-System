const { createApp } = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB, isMemoryDb } = require('./config/db');
const { seedIfEmpty } = require('./seed');
const logger = require('./utils/logger');

/**
 * Starts the HTTP listener and turns a raw EADDRINUSE into something
 * actionable instead of a 20-line Node stack trace.
 */
function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);

    server.once('listening', () => resolve(server));

    server.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') return reject(err);

      const findCmd = process.platform === 'win32'
        ? `netstat -ano | findstr :${port}`
        : `lsof -ti :${port}`;

      logger.error(`\nPort ${port} is already in use — another server is already running.\n`);
      logger.info(`  1. Find the process:  ${findCmd}`);
      logger.info(`  2. Stop it:           kill -9 <PID>`);
      logger.info(`\n  Or use a different port:  set PORT=5001 in server/.env`);
      logger.info(`  (then update NEXT_PUBLIC_API_URL in client/.env.local to match)\n`);
      reject(err);
    });
  });
}

/** Boots the HTTP server. Called by `npm start` / `npm run dev`. */
async function start() {
  await connectDB();

  // A fresh clone (or a fresh in-memory database) should show the design's
  // data without any manual step.
  if (env.autoSeed && !env.isProduction) {
    await seedIfEmpty();
  }

  const app = createApp();
  const server = await listen(app, env.port);
  logger.section('AquaPure API');
  logger.info(`Environment   : ${env.nodeEnv}`);
  logger.info(`API           : http://localhost:${env.port}/api`);
  logger.info(`Health check  : http://localhost:${env.port}/api/health`);
  if (isMemoryDb()) {
    logger.warn('Using an in-memory MongoDB — data is discarded on shutdown.');
    logger.warn('Set MONGODB_URI in server/.env to use MongoDB Atlas or a local mongod.');
  }
  logger.info('─'.repeat(64));

  const shutdown = async (signal) => {
    logger.info(`\n${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      logger.success('Server closed.');
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  start().catch((err) => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { start };
