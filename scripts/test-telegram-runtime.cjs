const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require(require.resolve("typescript", { paths: [resolve(__dirname, "../apps/web")] }));
const source = ts.transpileModule(
  readFileSync(resolve(__dirname, "../apps/web/src/lib/telegram.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function runtime(window, telegram) {
  const exports = {};
  runInNewContext(source, {
    exports,
    window,
    require: name => name === "@/lib/api" ? { api: { auth: { telegram } } } : {},
  });
  return exports;
}

test("ordinary browser and empty SDK initData never authenticate", () => {
  for (const window of [{}, { Telegram: { WebApp: { initData: "", initDataUnsafe: { user: { id: 42 } } } } }]) {
    const app = runtime(window, () => assert.fail("unexpected Telegram auth"));
    assert.equal(app.getTelegram(), null);
    assert.equal(app.authenticateTelegramOnce(), null);
  }
});

test("effect replay shares one request with exact raw initData and server role", async () => {
  const initData = "user=%7B%22id%22%3A42%7D&query_id=a%2Bb&hash=test";
  const window = { Telegram: { WebApp: { initData, initDataUnsafe: { user: { id: 999, role: "admin" } } } } };
  let calls = 0;
  let complete;
  const response = new Promise(resolve => { complete = resolve; });
  const app = runtime(window, raw => {
    calls += 1;
    assert.equal(raw, initData);
    return response;
  });
  const first = app.authenticateTelegramOnce();
  assert.equal(first, app.authenticateTelegramOnce());
  complete({ data: { id: "server-user", role: "driver" }, error: null });
  assert.equal((await first).data.role, "driver");
  assert.equal(app.authenticateTelegramOnce(), first);
  assert.equal(calls, 1);
});

test("failed auth is not silently retried on effects or navigation", async () => {
  let calls = 0;
  const app = runtime({ Telegram: { WebApp: { initData: "invalid" } } }, async () => {
    calls += 1;
    return { data: null, error: { code: "UNAUTHORIZED" } };
  });
  assert.ok((await app.authenticateTelegramOnce()).error);
  assert.ok((await app.authenticateTelegramOnce()).error);
  assert.equal(calls, 1);
});
