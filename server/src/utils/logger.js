/* eslint-disable no-console */

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const stamp = () => new Date().toISOString().slice(11, 19);

const logger = {
  info: (...args) => console.log(`${COLORS.dim}[${stamp()}]${COLORS.reset}`, ...args),
  success: (...args) => console.log(`${COLORS.green}✔${COLORS.reset}`, ...args),
  warn: (...args) => console.warn(`${COLORS.yellow}!${COLORS.reset}`, ...args),
  error: (...args) => console.error(`${COLORS.red}✖${COLORS.reset}`, ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${COLORS.magenta}·${COLORS.reset}`, ...args);
    }
  },
  section: (title) =>
    console.log(`\n${COLORS.cyan}${'─'.repeat(4)} ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}${COLORS.reset}`),
};

module.exports = logger;
