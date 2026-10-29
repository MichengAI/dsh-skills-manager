import assert from "node:assert/strict";
import http from "node:http";
import { apply } from "../lib/index.js";

function createMockCordisContext(options = {}) {
  const {
    webStartup,
    allowWebRuntime = false,
  } = options;

  let routeHandler = null;

  const realTarget = {
    webServer: {
      register(config) {
        if (config && typeof config.handler === "function") {
          routeHandler = config.handler;
        }
        return () => {
          routeHandler = null;
        };
      },
    },
    skills: {
      registerProvider() {
        return () => {};
      },
    },
    tools: {
      register() {
        return () => {};
      },
    },
    effect(fn) {
      return fn();
    },
  };

  if (webStartup !== undefined) {
    realTarget.webStartup = webStartup;
  }

  // 模拟真实 Cordis Context Proxy 行为：未 inject/provide 的属性访问抛错
  const proxy = new Proxy(realTarget, {
    get(target, prop, receiver) {
      if (prop === "webRuntime" && !allowWebRuntime) {
        throw new Error('cannot get property "webRuntime" without inject');
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return {
    ctx: proxy,
    getHandler: () => routeHandler,
  };
}

async function requestRoute(handler, reqOptions = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handler(req, res);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/michengai/dsh-skills-manager/state",
          method: reqOptions.method || "GET",
          headers: reqOptions.headers || {},
        },
        (res) => {
          let rawData = "";
          res.on("data", (chunk) => {
            rawData += chunk;
          });
          res.on("end", () => {
            server.close();
            let parsed = null;
            try {
              parsed = JSON.parse(rawData);
            } catch {}
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed || rawData,
            });
          });
        },
      );
      request.on("error", (err) => {
        server.close();
        reject(err);
      });
      request.end();
    });
  });
}

// 用例 1: DSH 0.2.x 下 webRuntime 抛错时，webStartup.trustedHosts 必须正常生效
{
  const { ctx, getHandler } = createMockCordisContext({
    webStartup: {
      trustedHosts: ["192.168.31.116"],
      host: "192.168.31.116",
    },
  });
  apply(ctx);
  const handler = getHandler();
  assert.ok(handler, "route handler should be registered");

  const res = await requestRoute(handler, {
    headers: { host: "192.168.31.116:3080" },
  });
  assert.equal(
    res.statusCode,
    200,
    `expected 200 for trustedHost/bindHost, got ${res.statusCode}: ${JSON.stringify(res.body)}`,
  );
}

// 用例 2: webStartup.host 监听地址支持任意端口匹配
{
  const { ctx, getHandler } = createMockCordisContext({
    webStartup: {
      host: "10.0.0.8",
      trustedHosts: [],
    },
  });
  apply(ctx);
  const handler = getHandler();

  const res = await requestRoute(handler, {
    headers: { host: "10.0.0.8:9999" },
  });
  assert.equal(
    res.statusCode,
    200,
    `expected 200 for bindHost with arbitrary port, got ${res.statusCode}`,
  );
}

// 用例 3: webStartup.publicUrl 提取的 host 允许访问
{
  const { ctx, getHandler } = createMockCordisContext({
    webStartup: {
      publicUrl: "https://hub.example.com:8443/dsh",
      trustedHosts: [],
    },
  });
  apply(ctx);
  const handler = getHandler();

  const res = await requestRoute(handler, {
    headers: { host: "hub.example.com:8443" },
  });
  assert.equal(
    res.statusCode,
    200,
    `expected 200 for publicUrl authority, got ${res.statusCode}`,
  );
}

// 用例 4: 环境变量 DSH_SKILLS_MANAGER_TRUSTED_HOSTS 生效
{
  process.env.DSH_SKILLS_MANAGER_TRUSTED_HOSTS = "proxy.lan:8080, custom.local";
  const { ctx, getHandler } = createMockCordisContext({
    webStartup: { trustedHosts: [] },
  });
  apply(ctx);
  const handler = getHandler();

  const res1 = await requestRoute(handler, {
    headers: { host: "proxy.lan:8080" },
  });
  assert.equal(res1.statusCode, 200, "env exact host:port should be accepted");

  const res2 = await requestRoute(handler, {
    headers: { host: "custom.local:1234" },
  });
  assert.equal(res2.statusCode, 200, "env port-less host should accept any port");

  delete process.env.DSH_SKILLS_MANAGER_TRUSTED_HOSTS;
}

// 用例 5: 未知 host 依然严格拦截 403
{
  const { ctx, getHandler } = createMockCordisContext({
    webStartup: {
      trustedHosts: ["trusted.com"],
      host: "192.168.1.1",
    },
  });
  apply(ctx);
  const handler = getHandler();

  const res = await requestRoute(handler, {
    headers: { host: "attacker.com" },
  });
  assert.equal(res.statusCode, 403, "attacker host must be rejected with 403");
  assert.equal(res.body.code, "error.proto.forbiddenHost");
}

console.log("host-fence.test.mjs passed");
