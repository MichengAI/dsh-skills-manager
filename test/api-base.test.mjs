// dsh-skills-manager API 基址解析测试（零第三方依赖）
// 背景：页面可能挂在带路径前缀的反向代理下（如 https://host/app/dsh/）。
// 根绝对路径 "/api/..." 会被浏览器解析到站点根、丢掉代理前缀，网关返回 HTML 404，
// 面板因此报「服务端返回非 JSON 响应」。本测试锁定 resolveApiUrl 的解析约定。
// 运行：node test/api-base.test.mjs

import react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import { readFile } from "node:fs/promises";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error("✗ " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(
    actual === expected,
    msg + " (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")",
  );
}

const bundleSource = await readFile(
  process.env.DSH_CLIENT_TEST_BUNDLE || new URL("../lib/client.js", import.meta.url),
  "utf8",
);
const clientSource = await readFile(new URL("../src/client.ts", import.meta.url), "utf8");
const updateUiSource = await readFile(new URL("../src/plugin-update-ui.ts", import.meta.url), "utf8");

// 模拟宿主 AMD 加载器：执行 bundle，捕获 load 定义，再调用 factory 读取导出。
let loaded = null;
new Function("window", bundleSource)({
  __ModuleLoader__: {
    load(definition) {
      loaded = definition;
    },
  },
});
ok(loaded !== null && typeof loaded.factory === "function", "client bundle registers via __ModuleLoader__.load");

const bundle = loaded.factory((id) => {
  if (id === "react") return react;
  if (id === "react/jsx-runtime") return { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment };
  if (id === "react-dom") return reactDom;
  if (id === "react-dom/client") return reactDomClient;
  if (id === "@deepseek-ai/dsh-client-ui-primitives") {
    return {
      Button: (props) => react.createElement("button", props, props.children),
      Input: (props) => react.createElement("span", props, react.createElement("input", props)),
      Modal: (props) => (props.open ? react.createElement("div", props, props.children) : null),
      SegmentedTabs: (props) => react.createElement("div", props),
    };
  }
  throw new Error("unexpected require: " + id);
});

const resolveApiUrl = bundle.resolveApiUrl;
ok(typeof resolveApiUrl === "function", "factory exports resolveApiUrl");

/** 在指定页面基址下解析一次，用完恢复，避免污染其它断言。 */
function withBase(baseURI, run) {
  const previous = Object.prototype.hasOwnProperty.call(globalThis, "document") ? globalThis.document : undefined;
  globalThis.document = baseURI === undefined ? undefined : { baseURI };
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

if (typeof resolveApiUrl === "function") {
  // 1. 直连部署：站点根，解析结果与旧的根绝对路径完全一致（无行为变化）。
  withBase("http://127.0.0.1:28000/", () => {
    eq(
      resolveApiUrl("/api/dsh-skills-manager/state"),
      "http://127.0.0.1:28000/api/dsh-skills-manager/state",
      "root deployment keeps the original absolute URL",
    );
  });

  // 2. 带前缀的反向代理：必须保留 /app/dsh 前缀。
  withBase("https://nas.example.com/app/dsh/", () => {
    eq(
      resolveApiUrl("/api/dsh-skills-manager/state"),
      "https://nas.example.com/app/dsh/api/dsh-skills-manager/state",
      "prefix proxy keeps the path prefix",
    );
  });

  // 3. 页面地址不带结尾斜杠时也要保留完整前缀（否则会退到上一级目录）。
  withBase("https://nas.example.com/app/dsh", () => {
    eq(
      resolveApiUrl("/api/dsh-skills-manager/state"),
      "https://nas.example.com/app/dsh/api/dsh-skills-manager/state",
      "prefix without trailing slash keeps the full prefix",
    );
  });

  // 4. 更新检查端点同样走该解析。
  withBase("https://nas.example.com/app/dsh/", () => {
    eq(
      resolveApiUrl("/api/michengai/dsh-skills-manager/update"),
      "https://nas.example.com/app/dsh/api/michengai/dsh-skills-manager/update",
      "update endpoint resolves against the same base",
    );
  });

  // 5. 非根绝对路径原样返回：相对路径、完整 URL、协议相对 URL。
  withBase("https://nas.example.com/app/dsh/", () => {
    eq(resolveApiUrl("state"), "state", "relative path is untouched");
    eq(
      resolveApiUrl("https://registry.npmjs.org/x"),
      "https://registry.npmjs.org/x",
      "absolute URL is untouched",
    );
    eq(resolveApiUrl("//cdn.example.com/x"), "//cdn.example.com/x", "protocol-relative URL is untouched");
  });

  // 6. 无 document（Node/测试环境）时保持旧行为，避免把端点解析成非法值。
  withBase(undefined, () => {
    eq(
      resolveApiUrl("/api/dsh-skills-manager/state"),
      "/api/dsh-skills-manager/state",
      "no document falls back to the literal path",
    );
  });

  // 7. base 非法时也回退原路径，不抛异常。
  withBase("not a url", () => {
    eq(
      resolveApiUrl("/api/dsh-skills-manager/state"),
      "/api/dsh-skills-manager/state",
      "invalid base falls back to the literal path",
    );
  });
}

// 8. 出口级回归：两处 fetch 出口都必须经过 resolveApiUrl，避免以后新增端点又写回根绝对路径。
ok(
  clientSource.includes("fetch(resolveApiUrl("),
  "client.ts resolves the single API exit through resolveApiUrl",
);
ok(
  !/fetch\(\s*["'`]\/api\//.test(clientSource),
  "client.ts has no raw root-absolute fetch left",
);
// 更新检查：解析收在模块唯一入口，模块内部只消费已解析的 URL（而不是靠注释提醒）。
ok(
  updateUiSource.includes("const endpoint = resolveApiUrl(options.endpoint)"),
  "plugin-update-ui.ts resolves the update endpoint once at the module entry",
);
ok(
  !/fetch\(\s*(?:options\.)?endpoint\b/.test(updateUiSource) &&
    !/requestStatus\(\s*options\.endpoint/.test(updateUiSource),
  "plugin-update-ui.ts never feeds the raw root-absolute endpoint downstream",
);

if (failed > 0) {
  console.error("\n" + failed + " 项失败，" + passed + " 项通过");
  process.exit(1);
}
console.log("api-base: " + passed + " 项断言通过");
