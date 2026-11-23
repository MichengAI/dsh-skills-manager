import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { apply } from '../lib/index.js';

test('dsh-go environment end-to-end HTTP integration via webServer', async () => {
  let registeredRoute = null;

  // 模拟 dsh-go 宿主：无 connection 服务，仅提供 webServer
  const mockCtx = {
    webServer: {
      register(route) {
        registeredRoute = route;
        return () => {
          registeredRoute = null;
        };
      },
    },
    skills: { registerProvider() { return () => {}; } },
    tools: { register() { return () => {}; } },
    sessions: {},
    logger: { warn() {} },
    effect(setup) {
      return setup();
    },
  };

  const cleanup = apply(mockCtx);
  assert.ok(registeredRoute, 'should register route on webServer in dsh-go host');
  assert.equal(registeredRoute.kind, 'prefix');

  // 启动真实 Node.js HTTP Server 托管该路由
  const server = http.createServer(async (req, res) => {
    if (registeredRoute && req.url && req.url.includes(registeredRoute.path)) {
      await registeredRoute.handler(req, res);
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. 测试真实 HTTP GET /state
    const stateRes = await fetch(`${baseUrl}/api/michengai/dsh-skills-manager/state`);
    assert.equal(stateRes.status, 200);
    const stateJson = await stateRes.json();
    assert.equal(stateJson.ok, true);
    assert.ok(Array.isArray(stateJson.data.roots));

    // 2. 测试真实 HTTP 前缀部署
    const prefixRes = await fetch(`${baseUrl}/app/dsh/api/michengai/dsh-skills-manager/state`);
    assert.equal(prefixRes.status, 200);
    const prefixJson = await prefixRes.json();
    assert.equal(prefixJson.ok, true);

    // 3. 测试 DNS Rebinding 阻断（非 loopback Host 头，http.request 可传自定义 Host）
    const evilRes = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/api/michengai/dsh-skills-manager/state',
        method: 'GET',
        headers: { host: 'evil.attacker.com' },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: () => JSON.parse(data) }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(evilRes.status, 403);
    const evilJson = await evilRes.json();
    assert.equal(evilJson.code, 'error.proto.forbidden');

    // 4. 测试 POST 写接口缺少客户端标记（403 阻断）
    const unauthPost = await fetch(`${baseUrl}/api/michengai/dsh-skills-manager/enable`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    assert.equal(unauthPost.status, 403);
    const unauthJson = await unauthPost.json();
    assert.equal(unauthJson.code, 'error.proto.forbidden');

    // 5. 测试真实 POST 写入路由流式转发（带合法客户端标记头）
    const validPost = await fetch(`${baseUrl}/api/michengai/dsh-skills-manager/detail`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dsh-skills-manager': '1',
      },
      body: JSON.stringify({ name: '__non_existent_skill_for_test__' }),
    });
    assert.equal(validPost.status, 400); // 业务层校验未找到该技能
    const validJson = await validPost.json();
    assert.equal(validJson.code, 'error.skill.notFound');

    // 6. 测试未知端点 404 返回标准错误码
    const notFoundRes = await fetch(`${baseUrl}/api/michengai/dsh-skills-manager/non-existent-action`);
    assert.equal(notFoundRes.status, 404);
    const notFoundJson = await notFoundRes.json();
    assert.equal(notFoundJson.code, 'error.proto.notFound');
  } finally {
    // 关闭 HTTP 服务
    await new Promise((resolve) => server.close(resolve));
    if (typeof cleanup === 'function') cleanup();
  }
});
