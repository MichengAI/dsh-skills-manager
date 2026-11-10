import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../lib/index.js';

function context(connection) {
  const raw = [];
  const authenticated = [];
  const ctx = {
    connection,
    webServer: { register(route) { raw.push(route); return () => {}; } },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    logger: { warn() {} },
    effect(setup) { return setup(); },
  };
  return { ctx, raw, authenticated };
}

test('API never falls back to an unauthenticated raw web route', () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  assert.equal(raw.length, 0);
});

test('the supported connection.fetch path still owns API routes', () => {
  const routes = [];
  const { ctx, raw } = context({ fetch: { register(route) { routes.push(route); return () => {}; } } });
  apply(ctx);
  assert(routes.length > 1);
  assert(routes.some(route => route.path.endsWith('/state')));
  assert.equal(raw.length, 0);
});
