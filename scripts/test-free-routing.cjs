const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require(require.resolve('typescript', { paths: [resolve(__dirname, '../apps/web')] }));

function load(relativePath, globals = {}) {
  const source = readFileSync(resolve(__dirname, '../apps/web/src', relativePath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(transpiled, {
    exports,
    require: name => {
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`, globals);
      return require(name);
    },
    URLSearchParams,
    ...globals,
  });
  return exports;
}

test('Yandex integration is Tiles-only and uses Web Mercator', () => {
  const { yandexTileUrl } = load('lib/maps/yandex-tiles.ts');
  const url = new URL(yandexTileUrl('browser-key', { x: 10, y: 12, z: 5 }));
  assert.equal(url.origin, 'https://tiles.api-maps.yandex.ru');
  assert.equal(url.pathname, '/v1/tiles/');
  assert.equal(url.searchParams.get('projection'), 'web_mercator');
  assert.equal(url.searchParams.get('maptype'), 'driving');
  assert.equal(url.searchParams.get('apikey'), 'browser-key');
});

test('route viewport fits geometry and never emits unbounded tile counts', () => {
  const { buildRouteViewport } = load('lib/maps/yandex-tiles.ts');
  const route = {
    from: { id: 1, name: 'Москва', lat: 55.75, lon: 37.62 },
    to: { id: 2, name: 'Казань', lat: 55.79, lon: 49.12 },
    distance_km: 820,
    duration_seconds: 42000,
    geometry: [[37.62, 55.75], [42, 56], [49.12, 55.79]],
    routing_profile: 'truck',
    truck_profile_applied: false,
    traffic: { mode: 'baseline', live: false },
  };
  const viewport = buildRouteViewport(route, 900, 320);
  assert.ok(viewport);
  assert.ok(viewport.zoom >= 2 && viewport.zoom <= 13);
  assert.ok(viewport.tiles.length > 0 && viewport.tiles.length < 100);
  assert.match(viewport.path, /^M/);
});

test('web routing client uses only RohBar API endpoints', () => {
  const source = readFileSync(resolve(__dirname, '../apps/web/src/lib/routing.ts'), 'utf8');
  assert.match(source, /\/api\/v1\/geo\/search/);
  assert.match(source, /\/api\/v1\/routes\/preview/);
  assert.doesNotMatch(source, /api-maps\.yandex|routing\.yandex|suggest-maps\.yandex/);
});
