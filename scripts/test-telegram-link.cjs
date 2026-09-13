const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require(require.resolve('typescript', { paths: [resolve(__dirname, '../apps/web')] }));
function load(path, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(resolve(__dirname, '../apps/web/src', path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, require: name => load(`${name.slice(2)}.ts`), ...globals });
  return exports;
}

test('leading zero code survives; expiry boundary and malformed responses hide codes', () => {
  const { activeLinkCode } = load('lib/telegram-link.ts');
  const value = { code: '000123', expires_at: '2026-09-13T12:10:00Z' };
  const expiry = Date.parse(value.expires_at);
  assert.equal(activeLinkCode(value, expiry - 1), value);
  assert.equal(activeLinkCode(value, expiry), null);
  assert.equal(activeLinkCode(value, expiry + 1), null);
  for (const code of ['12345', '1234567', '１２３４５６', '123 45']) assert.equal(activeLinkCode({ ...value, code }, expiry - 1), null);
  assert.equal(activeLinkCode({ ...value, expires_at: 'invalid' }, expiry - 1), null);
  assert.equal(activeLinkCode(null, expiry), null);
});

test('link API uses authenticated non-cacheable requests and code never enters URLs', async () => {
  const calls = [];
  const { api } = load('lib/api.ts', { process: { env: {} }, Headers, fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ data: { code: '000123', expires_at: '2026-09-13T12:10:00Z' } }) };
  }});
  await api.telegramLink.status();
  assert.equal((await api.telegramLink.issue()).data.code, '000123');
  await api.telegramLink.unlink();
  assert.deepEqual(calls.map(c => c.url), ['/api/v1/profile/telegram', '/api/v1/profile/telegram/link-code', '/api/v1/profile/telegram/unlink']);
  for (const { options } of calls) { assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); }
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].options.method, 'POST');
});

test('linking messages and canonical backend errors have RU/TG translations', () => {
  const { accountMessages } = load('lib/messages/account.ts');
  const { errorMessages } = load('lib/messages/errors.ts');
  for (const [key, value] of Object.entries(accountMessages).filter(([key]) => key.startsWith('telegram'))) {
    assert.ok(value.ru, key); assert.ok(value.tg, key);
  }
  for (const key of ['Telegram linking unavailable', 'Telegram link rate limit exceeded', 'Telegram account already linked', 'Alternative login required']) {
    assert.ok(errorMessages[key].ru); assert.ok(errorMessages[key].tg);
  }
});
