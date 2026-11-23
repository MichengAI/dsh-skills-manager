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

test('webServer bridge strictly rejects non-segment-boundary and invalid prefix paths with 404', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  // 1. /evil_api/... 前一位是 _ 而非 /（非路径段边界），必须返回 404
  const nonBoundaryReq = mockReqRes({
    url: '/evil_api/michengai/dsh-skills-manager/state',
  });
  await handler(nonBoundaryReq.req, nonBoundaryReq.res);
  assert.equal(nonBoundaryReq.getStatus(), 404);
  const nonBoundaryData = JSON.parse(nonBoundaryReq.getBody());
  assert.equal(nonBoundaryData.code, 'error.proto.notFound');

  // 2. /evil-prefix-api/... 同样非标准路径段边界，必须返回 404
  const evilDashReq = mockReqRes({
    url: '/evil-prefix-api/michengai/dsh-skills-manager/state',
  });
  await handler(evilDashReq.req, evilDashReq.res);
  assert.equal(evilDashReq.getStatus(), 404);
  const evilDashData = JSON.parse(evilDashReq.getBody());
  assert.equal(evilDashData.code, 'error.proto.notFound');

  // 3. /api/michengai/dsh-skills-manager-extra/state 非法子路径，必须返回 404
  const invalidSubpathReq = mockReqRes({
    url: '/api/michengai/dsh-skills-manager-extra/state',
  });
  await handler(invalidSubpathReq.req, invalidSubpathReq.res);
  assert.equal(invalidSubpathReq.getStatus(), 404);
  const invalidData = JSON.parse(invalidSubpathReq.getBody());
  assert.equal(invalidData.code, 'error.proto.notFound');
});

test('webServer bridge immediately settles when client aborts in-flight request (no hang)', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const abortedReq = mockReqRes({
    method: 'POST',
    url: '/api/michengai/dsh-skills-manager/detail',
    headers: {
      'content-type': 'application/json',
      'x-dsh-skills-manager': '1',
    },
    deferEnd: true,
  });

  const handlerPromise = handler(abortedReq.req, abortedReq.res);

  // 模拟客户端中途断开连接
  abortedReq.req.emit('aborted');

  // 验证 handlerPromise 必须在 50ms 内完成 settle，绝不悬挂
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('HUNG: handler did not settle on abort')), 50));
  await Promise.race([handlerPromise, timeoutPromise]);
});

test('startup race: connection service arriving late unregisters fallback and takes over', async () => {
  // 模拟 Cordis 的响应式服务依赖机制
  const injectedCallbacks = {};
  let webServerDisposed = false;
  let connectionRoutesRegistered = 0;

  const mockCtx = {
    inject(deps, callback) {
      for (const dep of deps) {
        if (!injectedCallbacks[dep]) injectedCallbacks[dep] = [];
        injectedCallbacks[dep].push(callback);
      }
    },
    effect(setup) { return setup(); },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    webServer: {
      register(route) {
        return () => { webServerDisposed = true; };
      },
    },
    connection: undefined,
  };

  apply(mockCtx);

  // 1. 触发 webServer 注入（此时 connection 仍未到达，如 dsh-go 或 connection 较慢）
  if (injectedCallbacks['webServer']) {
    for (const cb of injectedCallbacks['webServer']) cb(mockCtx);
  }
  assert.equal(webServerDisposed, false, 'webServer fallback should be active initially');

  // 2. 模拟 connection 服务延迟就绪
  mockCtx.connection = {
    fetch: {
      register(route) {
        connectionRoutesRegistered++;
        return () => {};
      },
    },
  };

  // 触发 connection 注入
  if (injectedCallbacks['connection']) {
    for (const cb of injectedCallbacks['connection']) cb(mockCtx);
  }

  // 断言：webServer 回退路由被立即注销让位，connection 路由接管
  assert.equal(webServerDisposed, true, 'webServer route MUST be disposed when connection arrives');
  assert.ok(connectionRoutesRegistered > 0, 'connection.fetch routes MUST be registered');
});

test('webServer bridge accepts arbitrary proxy prefixes on path segment boundaries', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  // 1. /dsh/api/... 单段反向代理前缀，必须返回 200
  const dshPrefixReq = mockReqRes({
    url: '/dsh/api/michengai/dsh-skills-manager/state',
  });
  await handler(dshPrefixReq.req, dshPrefixReq.res);
  assert.equal(dshPrefixReq.getStatus(), 200, '/dsh/api/... 应当返回 200');

  // 2. /custom-prefix/sub/api/... 多级合法路径段前缀，必须返回 200
  const customPrefixReq = mockReqRes({
    url: '/custom-prefix/sub/api/michengai/dsh-skills-manager/state',
  });
  await handler(customPrefixReq.req, customPrefixReq.res);
  assert.equal(customPrefixReq.getStatus(), 200, '/custom-prefix/sub/api/... 应当返回 200');

  // 3. /app/dsh/api/... 经典前缀依然保持返回 200
  const appDshReq = mockReqRes({
    url: '/app/dsh/api/michengai/dsh-skills-manager/state',
  });
  await handler(appDshReq.req, appDshReq.res);
  assert.equal(appDshReq.getStatus(), 200, '/app/dsh/api/... 应当返回 200');
});

test('webServer bridge still registers fallback when connection object exists but has no fetch.register', async () => {
  let fallbackRegistered = false;
  const mockCtx = {
    inject(deps, callback) {
      if (deps.includes('webServer')) callback(this);
    },
    effect(setup) { return setup(); },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    webServer: {
      register(route) {
        fallbackRegistered = true;
        return () => {};
      },
    },
    // connection 壳存在，但没有 fetch.register（如特定宿主或测试桩）
    connection: {},
  };

  apply(mockCtx);
  assert.equal(fallbackRegistered, true, 'connection 壳无 fetch 时，webServer 回退路由依然必须正常注册，不得静默短路');
});

test('webServer bridge lazy handover returns 503 and disposes fallback route if connection becomes available during request', async () => {
  let fallbackDisposed = false;
  let webServerHandler;

  const mockCtx = {
    inject(deps, callback) {
      if (deps.includes('webServer')) callback(this);
    },
    effect(setup) { return setup(); },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    webServer: {
      register(route) {
        webServerHandler = route.handler;
        return () => { fallbackDisposed = true; };
      },
    },
    connection: undefined,
  };

  apply(mockCtx);
  assert.ok(webServerHandler, 'webServer handler 必须已注册');

  // 模拟在请求处理瞬间 connection 变为就绪（带 fetch.register）
  mockCtx.connection = {
    fetch: {
      register() { return () => {}; },
    },
  };

  const reqRes = mockReqRes({
    url: '/api/michengai/dsh-skills-manager/state',
  });
  await webServerHandler(reqRes.req, reqRes.res);

  assert.equal(reqRes.getStatus(), 503, '惰性让位必须响应 503');
  const data = JSON.parse(reqRes.getBody());
  assert.equal(data.code, 'error.proto.serviceUnavailable');
  assert.equal(fallbackDisposed, true, '惰性让位必须立即触发注销回退路由');
});

test('webServer bridge returns 413 when incremental chunks exceed 2MB body limit', async () => {
  const { ctx, raw } = context(undefined);
  apply(ctx);
  const handler = raw[0].handler;

  const reqRes = mockReqRes({
    method: 'POST',
    url: '/api/michengai/dsh-skills-manager/detail',
    headers: {
      'content-type': 'application/json',
      'x-dsh-skills-manager': '1',
    },
    deferEnd: true,
  });

  const handlerPromise = handler(reqRes.req, reqRes.res);

  // 发送 2.5MB 分块数据（分 3 次发送，每次 1MB / 1MB / 512KB）
  const chunk1 = Buffer.alloc(1024 * 1024, 'a');
  const chunk2 = Buffer.alloc(1024 * 1024, 'b');
  const chunk3 = Buffer.alloc(512 * 1024, 'c');

  reqRes.req.emit('data', chunk1);
  reqRes.req.emit('data', chunk2);
  reqRes.req.emit('data', chunk3);
  reqRes.req.emit('end');

  await handlerPromise;

  assert.equal(reqRes.getStatus(), 413, '增量分块超出限制必须返回 413');
  const data = JSON.parse(reqRes.getBody());
  assert.equal(data.code, 'error.proto.bodyTooLarge');
});
