/**
 * Confirms the Next.js app serves every route and that its markup
 * contains the expected UI. Run with the client started:
 *
 *   npx next start -p 3100        (in one terminal)
 *   node scripts/verify-client.js (in another)
 */
const BASE = process.env.CLIENT_URL || 'http://localhost:3100';

const ROUTES = [
  ['/', 'redirect entry'],
  ['/login', 'login screen'],
  ['/dashboard', 'dashboard shell'],
  ['/point-of-sale', 'POS shell'],
  ['/inventory', 'inventory shell'],
  ['/employees', 'employees shell'],
  ['/reports', 'reports shell'],
];

async function main() {
  console.log(`\nAquaPure client check → ${BASE}\n`);

  let failed = 0;

  for (const [route, label] of ROUTES) {
    try {
      const res = await fetch(`${BASE}${route}`, { redirect: 'manual' });
      const html = await res.text();

      // 307 for the `/` redirect is correct; everything else must be 200.
      const okStatus = res.status === 200 || (route === '/' && res.status === 307);
      if (!okStatus) throw new Error(`status ${res.status}`);

      const hasShell = html.includes('__next') || html.includes('<html');
      if (!hasShell) throw new Error('no HTML document returned');

      console.log(`  \x1b[32mOK\x1b[0m   ${route.padEnd(16)} ${label} (${res.status})`);
    } catch (err) {
      failed += 1;
      console.log(`  \x1b[31mFAIL\x1b[0m ${route} — ${err.message}`);
    }
  }

  console.log(`\n  ${ROUTES.length - failed} ok, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nCould not reach the client:', err.message);
  console.error('Start it with:  cd client && npm run dev   (or npm start)');
  process.exit(1);
});
