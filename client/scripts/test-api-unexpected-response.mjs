import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Unit test for client/src/lib/api.js error handling.
 *
 * Covers the "server returned an unexpected response" path — when the server
 * comes back with a non-JSON body (e.g. a Next.js HTML 404 page, or a Vercel
 * gateway error page) instead of the app's usual { success, data, meta } JSON.
 *
 * api.js is ESM (`export`) but client/package.json has no "type": "module"
 * (check-jsx.js uses require), so we load the real api.js source as ESM via a
 * data URL, which Node always treats as ESM.
 *
 * Run with:
 *   cd client && node scripts/test-api-unexpected-response.mjs
 */

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8');
const { api, ApiError } = await import('data:text/javascript,' + encodeURIComponent(apiSource));

/* ---- browser stubs (api.js reads window.localStorage and calls fetch) ---- */
const storage = {};
globalThis.window = {
  localStorage: {
    getItem: () => storage['aquapure_token'] ?? null,
    setItem: (k, v) => { storage[k] = v; },
    removeItem: (k) => { delete storage[k]; },
  },
};

/* ---- per-test fetch mock ---- */
let mockFetch;
globalThis.fetch = async (...args) => mockFetch(...args);

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  OK  ${name}`); };

async function main() {

  /* ---- Test 1: non-JSON HTML body (e.g. Next.js 404 page) ---- */
  {
    mockFetch = async () =>
      new Response('<html><body>Not Found</body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    let caught = null;
    try {
      await api.get('/products');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ApiError, 'should throw ApiError');
    assert.strictEqual(caught.status, 404, 'status should be 404');
    assert.ok(/unexpected response/.test(caught.message), 'message mentions unexpected response');
    assert.ok(caught.message.includes('404'), 'message includes status');
    assert.ok(caught.message.includes('text/html'), 'message includes content-type');
    assert.strictEqual(
      caught.details.contentType,
      'text/html; charset=utf-8',
      'details.contentType',
    );
    assert.ok(
      caught.details.bodyPreview && caught.details.bodyPreview.includes('<html'),
      'details.bodyPreview contains body snippet',
    );
    ok('non-JSON HTML body throws ApiError with status + content-type + body preview');
  }

  /* ---- Test 2: 502 gateway with valid JSON body -> clear temporary-unavailable message ---- */
  {
    mockFetch = async () =>
      new Response(JSON.stringify({ success: false, message: 'upstream error' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });

    let caught = null;
    try {
      await api.get('/health');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ApiError);
    assert.strictEqual(caught.status, 502);
    assert.ok(
      /temporarily unavailable/.test(caught.message),
      '502 should say temporarily unavailable',
    );
    ok('502 gateway with JSON body returns clear temporary-unavailable message');
  }

  /* ---- Test 3: valid JSON success still returns the payload ---- */
  {
    mockFetch = async () =>
      new Response(JSON.stringify({ success: true, data: { ok: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const payload = await api.get('/health');
    assert.deepStrictEqual(payload, { success: true, data: { ok: 1 } });
    ok('valid JSON success still returns payload');
  }

  /* ---- Test 4: empty 204 body -> returns {}, not "unexpected response" ---- */
  {
    mockFetch = async () => new Response(null, { status: 204 });

    const payload = await api.delete('/inventory/x');
    assert.deepStrictEqual(payload, {});
    ok('empty 204 body returns {} without "unexpected response"');
  }

  console.log(`\n  ${passed} passed\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
