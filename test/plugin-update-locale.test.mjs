// 使用最小 DOM 验证保留节点切换语言、打开弹窗及更新中的状态，不访问真实更新服务。
import assert from "node:assert/strict";
import { observePluginUpdate } from "../src/plugin-update-ui.js";

class Element {
  constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.classList = { add() {} }; this.fields = new Map(); }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.children.length ? this.children.map((node) => node.textContent).join("") : this.text || ""; }
  append(...nodes) { nodes.forEach((node) => { node.parent = this; this.children.push(node); }); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) { this.events[type] = fn; }
  focus() {}
  querySelector(selector) {
    if (selector === "[data-mpi-label]") return this.children.find((node) => "mpiLabel" in node.dataset) || null;
    if (selector.startsWith("[data-mpi-check=")) return this.children.find((node) => node.dataset.mpiCheck) || null;
    if (selector.startsWith(".mpi-version")) return this.children.find((node) => node.className === "mpi-version") || null;
    return this.fields.get(selector) || null;
  }
  querySelectorAll(selector) { return selector === "dt" ? this.terms : []; }
  set innerHTML(value) {
    this.terms = [new Element(), new Element(), new Element()];
    for (const key of ["h2", ".mpi-intro", ".mpi-manual h3", ".mpi-manual p", ".mpi-status", ".mpi-progress", ".mpi-command code", ...["current", "latest", "profile"].map((role) => `[data-role=${role}]`), ...["close", "check", "update", "copy"].map((action) => `[data-action=${action}]`)]) this.fields.set(key, new Element());
  }
}
const body = new Element(), root = new Element(), row = new Element(), links = new Element();
root.lang = "zh-CN";
row.fields.set("h1,h2", new Element()); row.fields.set(".links", links);
let notify, observed, frame, resolveUpdate, posts = 0;
const payload = { packageName: "test-plugin", currentVersion: "1.0.0", latestVersion: "1.0.1", updateAvailable: true, profileName: "web", canAutoUpdate: true, latestCheckFailed: false };
globalThis.document = {
  body, documentElement: root, head: new Element(), createElement: () => new Element(), getElementById: () => null,
  querySelector: (selector) => selector === ".row" ? row : { textContent: "Settings" },
  querySelectorAll: () => [],
};
globalThis.window = { requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame() {} };
globalThis.MutationObserver = class { constructor(fn) { notify = fn; } observe(target, options) { observed = { target, options }; } disconnect() {} };
globalThis.fetch = async (_, options) => {
  if (options.method === "POST") { posts++; await new Promise((resolve) => { resolveUpdate = resolve; }); }
  return { ok: true, json: async () => payload };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const switchLanguage = (lang) => { root.lang = lang; notify(); frame(); };
const dispose = observePluginUpdate({ packageName: "test-plugin", endpoint: "/update", titleRowSelector: ".row", linksSelector: ".links", zhName: "技能", enName: "Skills", createIcon: () => new Element() });
try {
  await flush();
  const button = links.children[0];
  assert.equal(button.textContent, "检查更新", "页面文字不能覆盖宿主明确选择的中文");
  assert.equal(observed.target, root);
  assert.ok(observed.options.attributes && observed.options.attributeFilter.includes("lang"));
  button.events.click(); await flush();
  const overlay = body.children[0], dialog = overlay.children[0];
  const field = (selector) => dialog.querySelector(selector);
  assert.equal(field("h2").textContent, "技能 更新");
  switchLanguage("en-US");
  assert.equal(links.children[0], button, "切换语言保留按钮节点");
  assert.equal(body.children[0], overlay, "切换语言保留弹窗和进行中的操作");
  assert.equal(button.textContent, "Check for updates");
  assert.equal(field("h2").textContent, "Skills Update");
  assert.equal(field("[data-action=close]").attributes["aria-label"], "Close");
  assert.match(field(".mpi-status").textContent, /New version available/);
  field("[data-action=update]").events.click();
  switchLanguage("zh-CN");
  assert.equal(field("[data-action=update]").textContent, "正在更新…");
  assert.equal(field(".mpi-status").textContent, "正在更新…");
  assert.equal(field("[data-action=update]").disabled, true);
  assert.equal(posts, 1, "语言切换不会重新提交更新");
  resolveUpdate(); await flush();
  assert.equal(field(".mpi-status").textContent, "更新完成，请重启 DSH Web。");
  switchLanguage("en");
  assert.equal(field(".mpi-status").textContent, "Update complete. Restart DSH Web.");
  assert.equal(field("[data-action=update]").textContent, "Update automatically");
  console.log("plugin update locale regression passed");
} finally { dispose(); }
