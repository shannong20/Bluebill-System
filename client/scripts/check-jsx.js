/**
 * Parses/transforms the JSX files touched by the POS-supplies work with the
 * exact compiler Next.js uses, so a syntax error surfaces without waiting for
 * a full (and slow, on Windows) `next build`.
 *
 *   node scripts/check-jsx.js
 */
const path = require('path');
const fs = require('fs');

const swc = require('next/dist/build/swc');

const FILES = [
  'src/app/(dashboard)/point-of-sale/page.jsx',
  'src/app/(dashboard)/inventory/page.jsx',
  'src/app/(dashboard)/reports/page.jsx',
  'src/app/(dashboard)/reports/analytics.jsx',
  'src/app/(dashboard)/reports/ledgers.jsx',
  'src/components/ui/Charts.jsx',
  'src/lib/endpoints.js',
];

(async () => {
  let failed = 0;
  for (const rel of FILES) {
    const file = path.join(__dirname, '..', rel);
    try {
      const code = fs.readFileSync(file, 'utf8');
      const out = await swc.transform(code, {
        filename: file,
        jsc: {
          parser: { syntax: 'ecmascript', jsx: true },
          target: 'es2020',
        },
      });
      console.log(`  OK  ${rel} (${out.code.length} bytes compiled)`);
    } catch (err) {
      failed += 1;
      console.log(`  ERR ${rel}\n      ${err.message}`);
    }
  }
  console.log(failed ? `\n${failed} file(s) failed to compile.` : '\nAll files compiled cleanly.');
  process.exit(failed ? 1 : 0);
})();
