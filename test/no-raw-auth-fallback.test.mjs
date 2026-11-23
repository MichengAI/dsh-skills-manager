import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../lib/index.js';

function context(connection, webServer = undefined) {
  const raw = [];
  let disposed = false;
  const defaultWebServer = webServer === undefined ? {
    register(route) {
      raw.push(route);
      return () => {
        disposed = true;
      };
    },
  } : webServer;

  const ctx = {
    connection,
    webServer: defaultWebServer,
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    logger: {
      warns: [],
      warn(msg) { this.warns.push(msg); },
    },
    effect(setup) { return setup(); },
  };
  return { ctx, raw, isDisposed: () => disposed };
}

function mockReqRes(options = {}) {
  const reqListeners = {};
  const resListeners = {};
  const req = {
    method: options.method ?? 'GET',
    url: options.url ?? '/api/michengai/dsh-skills-manager/state',
    headers: Object.assign({ host: '127.0.0.1:5173' }, options.headers ?? {}),
    socket: { remoteAddress: 'remoteAddress' in options ? options.remoteAddress : '127.0.0.1' },
    destroyed: false,
    destroy() {
      this.destroyed = true;
      if (reqListeners['close']) reqListeners['close']();
    },
    on(event, handler) {
      reqListeners[event] = handler;
      if (event === 'end' && !options.deferEnd) {
        setImmediate(() => {
          if (options.bodyChunks) {
            for (const chunk of options.bodyChunks) {
              if (reqListeners['data']) reqListeners['data'](Buffer.from(chunk));
            }
          }
          handler();
        });
      }
      return this;
    },
    emit(event, ...args) {
      if (reqListeners[event]) reqListeners[event](...args);
    },
  };
  let statusCode = 200;
  const headers = {};
  let body = '';
  const res = {
    headersSent: false,
    writeHead(code, hdrs) {
      this.headersSent = true;
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
      return this;
    },
    end(chunk) {
      if (chunk) body += chunk.toString();
      if (resListeners['close']) resListeners['close']();
    },
    on(event, handler) {
      resListeners[event] = handler;
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => body, getHeaders: () => headers };
}

test('the supported connection.fetch path still owns API routes with highest priority', () => {
  const routes = [];
  const { ctx, raw } = context({ fetch: { register(route) { routes.push(route); return () => {}; } } });
  apply(ctx);
  assert(routes.length > 1);
  assert(routes.some(route => route.path.endsWith('/state')));
  assert.equal(raw.length, 0, 'should not register raw webServer route when connection.fetch exists');
});

test('gracefully falls back to webServer when connection.fetch is absent', () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  assert.equal(raw.length, 1, 'should register exactly one prefix route on webServer');
  assert.equal(raw[0].kind, 'prefix');
  assert.equal(raw[0].path, '/api/michengai/dsh-skills-manager');
});

test('only warns when neither connection.fetch nor webServer is available', () => {
  const { ctx, raw } = context(undefined, null);
  apply(ctx);
  assert.equal(raw.length, 0);
  assert(ctx.logger.warns.some(msg => msg.includes('require authenticated connection.fetch or webServer')));
});

test('webServer bridge rejects malicious host header (DNS rebinding guard)', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const rebindingReq = mockReqRes({
    headers: { host: 'attacker.example.com' },
    remoteAddress: '127.0.0.1',
  });
  await handler(rebindingReq.req, rebindingReq.res);
  assert.equal(rebindingReq.getStatus(), 403);
  const data = JSON.parse(rebindingReq.getBody());
  assert.equal(data.code, 'error.proto.forbidden');
  assert.match(data.error, /forbidden host header/);
});

test('webServer bridge rejects remote non-loopback requests (fail-closed)', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  // 外部 IP 请求
  const remote = mockReqRes({ remoteAddress: '192.168.1.100' });
  await handler(remote.req, remote.res);
  assert.equal(remote.getStatus(), 403);
  const data = JSON.parse(remote.getBody());
  assert.equal(data.code, 'error.proto.forbidden');
  assert.match(data.error, /forbidden remote access/);

  // 缺少 remoteAddress 同样应 fail-closed
  const noRemote = mockReqRes({ remoteAddress: null });
  await handler(noRemote.req, noRemote.res);
  assert.equal(noRemote.getStatus(), 403);
});

test('webServer bridge rejects cross-origin requests', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const crossSite = mockReqRes({
    remoteAddress: '127.0.0.1',
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  await handler(crossSite.req, crossSite.res);
  assert.equal(crossSite.getStatus(), 403);
  const data = JSON.parse(crossSite.getBody());
  assert.equal(data.code, 'error.proto.forbidden');
});

test('webServer bridge accepts IPv4-mapped hexadecimal loopback (::ffff:7f00:1)', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const hexLoopback = mockReqRes({
    remoteAddress: '::ffff:7f00:1',
    url: '/api/michengai/dsh-skills-manager/state',
  });
  await handler(hexLoopback.req, hexLoopback.res);
  assert.equal(hexLoopback.getStatus(), 200);
});

test('webServer bridge supports prefixed deployment (/app/dsh/api/...) and strip action', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const prefixed = mockReqRes({
    url: '/app/dsh/api/michengai/dsh-skills-manager/state',
  });
  await handler(prefixed.req, prefixed.res);
  assert.equal(prefixed.getStatus(), 200);
  const data = JSON.parse(prefixed.getBody());
  assert.equal(data.ok, true);
});

test('webServer bridge forwards POST streaming body chunks correctly', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  // 模拟带自定义头和多块 chunk 的 POST 请求
  const postReq = mockReqRes({
    method: 'POST',
    url: '/api/michengai/dsh-skills-manager/detail',
    headers: {
      'content-type': 'application/json',
      'x-dsh-skills-manager': '1',
    },
    bodyChunks: [
      '{"name":"',
      'test-non-existing-skill',
      '"}',
    ],
  });
  await handler(postReq.req, postReq.res);
  assert.equal(postReq.getStatus(), 400); // 业务层校验发现该技能不存在
  const data = JSON.parse(postReq.getBody());
  assert.equal(data.code, 'error.skill.notFound');
});

test('webServer bridge returns 413 when body exceeds maximum threshold', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const hugeReq = mockReqRes({
    method: 'POST',
    url: '/api/michengai/dsh-skills-manager/detail',
    headers: {
      'content-length': String(100 << 20), // 100 MiB
    },
  });
  await handler(hugeReq.req, hugeReq.res);
  assert.equal(hugeReq.getStatus(), 413);
  const data = JSON.parse(hugeReq.getBody());
  assert.equal(data.code, 'error.proto.bodyTooLarge');
});

test('webServer bridge returns structured 404 and 405 error responses with code', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  // 404 未知动作
  const notFound = mockReqRes({
    url: '/api/michengai/dsh-skills-manager/non-existent-action',
  });
  await handler(notFound.req, notFound.res);
  assert.equal(notFound.getStatus(), 404);
  const nfData = JSON.parse(notFound.getBody());
  assert.equal(nfData.code, 'error.proto.notFound');

  // 405 不支持的方法
  const methodNotAllowed = mockReqRes({
    method: 'PUT',
    url: '/api/michengai/dsh-skills-manager/state',
  });
  await handler(methodNotAllowed.req, methodNotAllowed.res);
  assert.equal(methodNotAllowed.getStatus(), 405);
  const maData = JSON.parse(methodNotAllowed.getBody());
  assert.equal(maData.code, 'error.proto.methodNotAllowed');
});

test('webServer bridge handles loopback request and respects lifecycle disposer', async () => {
  const { ctx, raw, isDisposed } = context(undefined);
  let cleanup;
  ctx.effect = (setup) => {
    cleanup = setup();
    return cleanup;
  };
  apply(ctx);
  assert.equal(raw.length, 1);
  const handler = raw[0].handler;

  // 本机回环真实 /state 端点调用
  const stateReq = mockReqRes({
    remoteAddress: '127.0.0.1',
    url: '/api/michengai/dsh-skills-manager/state',
  });
  await handler(stateReq.req, stateReq.res);
  assert.equal(stateReq.getStatus(), 200);
  const stateData = JSON.parse(stateReq.getBody());
  assert.equal(stateData.ok, true);
  assert.ok(stateData.data !== undefined);

  // 本机回环写接口缺少安全标识应被 validateMutationRequest 拦截 (403)
  const writeReq = mockReqRes({
    remoteAddress: '127.0.0.1',
    method: 'POST',
    url: '/api/michengai/dsh-skills-manager/enable',
  });
  await handler(writeReq.req, writeReq.res);
  assert.equal(writeReq.getStatus(), 403);

  // 验证生命周期清理函数（无条件断言，杜绝假绿）
  assert.equal(typeof cleanup, 'function', 'effect must return a disposer cleanup function');
  cleanup();
  assert.equal(isDisposed(), true, 'disposer must invoke webServer route dispose');
});
