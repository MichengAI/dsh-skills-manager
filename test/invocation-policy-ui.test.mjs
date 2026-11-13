import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// 从 src/client.ts 源码中提取目标函数，保持测试直接针对真实源码
const source = await readFile(new URL('../src/client.ts', import.meta.url), 'utf8');
const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter(x => x != null && typeof x !== 'boolean')
});

// 提取字典
const dictMatch = source.match(/var DICT\s*=\s*(\{[\s\S]*?\n {4}\});/);
assert.ok(dictMatch, 'DICT 定义必须存在');
const DICT = new Function(`return ${dictMatch[1]};`)();

const tZh = (key, params) => {
  let text = DICT.zh[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
};

const tEn = (key, params) => {
  let text = DICT.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
};

// 1. 验证多语言词条对齐（只保留业务真实需要的词条，清理死词条）
const requiredKeys = [
  'invocation.manualOnly',
  'invocation.manualOnlyTip',
  'detail.invocation',
  'detail.policy.all',
  'detail.policy.manualOnly',
  'detail.policy.blocked',
];

for (const key of requiredKeys) {
  assert.ok(DICT.zh[key], `DICT.zh 必须包含词条 ${key}`);
  assert.ok(DICT.en[key], `DICT.en 必须包含词条 ${key}`);
}

// 2. 验证调用方式判定函数导出与行为
const fnStart = source.indexOf('    function skillDeclaredInvocationKind(');
const fnEnd = source.indexOf('    function isSkillEnabled(', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, '必须存在 skillDeclaredInvocationKind 辅助函数');

// P3-1 验证死代码已清理：源码中不应再包含 skillEffectiveInvocationKind
assert.equal(source.includes('function skillEffectiveInvocationKind'), false, '必须清除生产死代码 skillEffectiveInvocationKind');

const fnBlock = stripTypeScriptTypes(source.slice(fnStart, fnEnd));
const { skillDeclaredInvocationKind } = new Function(
  fnBlock + '\nreturn { skillDeclaredInvocationKind };'
)();

// 默认全开
const defaultSkill = {
  modelInvocable: true,
  userInvocable: true,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(defaultSkill), 'all');

// 仅手动（disable-model-invocation: true）
const manualOnlySkill = {
  modelInvocable: false,
  userInvocable: true,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(manualOnlySkill), 'manual');

// 双关技能（两个开关都关）
const noneSkill = {
  modelInvocable: false,
  userInvocable: false,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(noneSkill), 'none');

// 3. 验证徽标渲染与防视觉冗余：
// P2-1 核心修复：只有 manual 才渲染徽标；all、none 绝不渲染徽标！
// P2-2 核心修复：必须使用宿主原语 Tag（tone="neutral"）而非手绘 span
const badgeFnStart = source.indexOf('      function renderInvocationBadge(');
const badgeFnEnd = source.indexOf('      function renderDetailPolicy(', badgeFnStart);
assert.ok(badgeFnStart >= 0 && badgeFnEnd > badgeFnStart, '必须包含 renderInvocationBadge 函数');

const HostTagMock = function HostTag(props) { return h('HostTag', props, props.children); };
const badgeFnBlock = stripTypeScriptTypes(source.slice(badgeFnStart, badgeFnEnd));
const { renderInvocationBadge } = new Function(
  'h', 't', 'skillDeclaredInvocationKind', 'HostTag',
  badgeFnBlock + '\nreturn { renderInvocationBadge };'
)(h, tZh, skillDeclaredInvocationKind, HostTagMock);

assert.equal(renderInvocationBadge(defaultSkill), null, '默认技能绝不渲染徽标');
assert.equal(renderInvocationBadge(noneSkill), null, 'P2-1 防护：双关技能绝不能误渲染徽标');

const manualBadgeZh = renderInvocationBadge(manualOnlySkill);
assert.ok(manualBadgeZh, '仅手动技能必须渲染徽标');
assert.equal(manualBadgeZh.props.className, 'dssm-invocation-badge');
assert.equal(manualBadgeZh.props.title, '模型不可自动感知；聊天框输入 / 可手动调用', 'P2-A 防护：外层 span 必须承载 title 以产生原生 Tooltip');
const innerTagZh = manualBadgeZh.children[0];
assert.equal(innerTagZh.props.tone, 'neutral', 'P2-2 防护：内层必须使用宿主 Tag 原语的 neutral tone');
assert.equal(innerTagZh.children[0], '仅手动');

const { renderInvocationBadge: renderInvocationBadgeEn } = new Function(
  'h', 't', 'skillDeclaredInvocationKind', 'HostTag',
  badgeFnBlock + '\nreturn { renderInvocationBadge };'
)(h, tEn, skillDeclaredInvocationKind, HostTagMock);
const manualBadgeEn = renderInvocationBadgeEn(manualOnlySkill);
assert.equal(manualBadgeEn.children[0].children[0], 'Manual only');

// 4. 验证搜索匹配支持
const matchFnStart = source.indexOf('    function matchSkillQuery(');
const matchFnEnd = source.indexOf('    function filterSkills<', matchFnStart);
assert.ok(matchFnStart >= 0 && matchFnEnd > matchFnStart, 'matchSkillQuery 必须存在');

const matchFnBlock = stripTypeScriptTypes(source.slice(matchFnStart, matchFnEnd));
const { matchSkillQuery } = new Function(
  'DICT', 'skillDeclaredInvocationKind',
  'function normalizeSkillQuery(query) { return String(query == null ? "" : query).trim().toLowerCase(); }\n' +
  matchFnBlock + '\nreturn { matchSkillQuery };'
)(DICT, skillDeclaredInvocationKind);

assert.equal(matchSkillQuery(defaultSkill, '手动'), false, '默认技能搜手动不应命中');
assert.equal(matchSkillQuery(noneSkill, '手动'), false, '双关技能搜手动不应命中');
assert.equal(matchSkillQuery(manualOnlySkill, '手动'), true, '仅手动技能搜手动必须命中');
assert.equal(matchSkillQuery(manualOnlySkill, '仅手动'), true, '仅手动技能搜仅手动必须命中');
assert.equal(matchSkillQuery(manualOnlySkill, 'manual'), true, '仅手动技能搜 manual 必须命中');

// 5. 验证详情弹窗调用策略单字段组件 renderDetailPolicy
const detailPolicyStart = source.indexOf('      function renderDetailPolicy(');
const detailPolicyEnd = source.indexOf('      function renderSkillStatusIcon(', detailPolicyStart);
assert.ok(detailPolicyStart >= 0 && detailPolicyEnd > detailPolicyStart, '必须包含 renderDetailPolicy 函数');

const detailPolicyBlock = stripTypeScriptTypes(source.slice(detailPolicyStart, detailPolicyEnd));
const { renderDetailPolicy } = new Function(
  'h', 't', 'skillDeclaredInvocationKind',
  detailPolicyBlock + '\nreturn { renderDetailPolicy };'
)(h, tZh, skillDeclaredInvocationKind);

assert.equal(renderDetailPolicy(null), null, '空技能对象返回 null');

const policyNodeZh = renderDetailPolicy(manualOnlySkill);
assert.ok(policyNodeZh, '仅手动技能必须渲染策略栏');
assert.equal(policyNodeZh.props.className, 'dssm-detail-policy');

function extractText(node) {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  return (node.children || []).flatMap(extractText);
}
const textsZh = extractText(policyNodeZh).join(' ');
assert.ok(textsZh.includes('调用方式： 仅手动调用（disable-model-invocation: true）'), '单字段调用方式必须准确反映 YAML 声明');
assert.equal(textsZh.includes('当前生效'), false, '必须清除冗余的当前生效字段');
assert.equal(textsZh.includes('源文件声明'), false, '必须清除多余的源文件声明对比标签');

const { renderDetailPolicy: renderDetailPolicyEn } = new Function(
  'h', 't', 'skillDeclaredInvocationKind',
  detailPolicyBlock + '\nreturn { renderDetailPolicy };'
)(h, tEn, skillDeclaredInvocationKind);
const textsEn = extractText(renderDetailPolicyEn(manualOnlySkill)).join(' ');
assert.ok(textsEn.includes('Invocation: Manual only (disable-model-invocation: true)'), '英文环境单字段调用方式正常本地化');

// 6. P3-3 装配层真实渲染覆盖（防变异穿透：防止行渲染漏挂徽标与 token 徽标）
const tokenBadgeStart = source.indexOf('      function renderTokenBadge(');
const tokenBadgeEnd = source.indexOf('      function renderDetailPolicy(', tokenBadgeStart);
assert.ok(tokenBadgeStart >= 0 && tokenBadgeEnd > tokenBadgeStart, 'renderTokenBadge 与 renderDetailTokens 必须存在');
const tokenBadgeBlock = stripTypeScriptTypes(source.slice(tokenBadgeStart, tokenBadgeEnd));
const makeTokenHelpers = new Function(
  'h', 't',
  tokenBadgeBlock + '\nreturn { renderTokenBadge, renderDetailTokens };'
);
const { renderTokenBadge: realRenderTokenBadge, renderDetailTokens: realRenderDetailTokens } = makeTokenHelpers(h, tZh);

const skillStart = source.indexOf('      function renderSkill(root:');
const skillEnd = source.indexOf('      var rows =', skillStart);
assert.ok(skillStart >= 0 && skillEnd > skillStart, 'renderSkill 必须存在');

const skillBlock = stripTypeScriptTypes(source.slice(skillStart, skillEnd));
const makeRenderSkill = new Function(
  'h', 't', 'isSkillEnabled', 'renderInvocationBadge', 'renderTokenBadge', 'renderSkillStatusIcon', 'enableSwitch', 'renderLinkedNote', 'renderFallback', 'SourceSelect', 'moreIcon', 'busy', 'filters', 'allRoots', 'draggingRef', 'post', 'openDetail', 'setSkillNoteText', 'setModal', 'rootDisplayName',
  skillBlock + '\nreturn renderSkill;'
);

const fakeRoot = { key: 'dsh', toggleable: true, mutable: true, enabled: true, categories: [] };
const renderSkillTested = makeRenderSkill(
  h, tZh, () => true, renderInvocationBadge, realRenderTokenBadge, () => null, () => h('switch'), () => null, () => null, function SourceSelect() {}, () => null, false, {}, [fakeRoot], { current: null }, () => Promise.resolve(), () => {}, () => {}, () => {}, () => 'DSH'
);

function findVNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findVNode(child, predicate);
    if (found) return found;
  }
  return null;
}

const manualRow = renderSkillTested(fakeRoot, { name: 'my-manual-tool', ...manualOnlySkill });
const manualBadgeFound = findVNode(manualRow, n => n.props && n.props.className === 'dssm-invocation-badge');
assert.ok(manualBadgeFound, 'P3-3 变异防御：仅手动技能的列表行 DOM 中必须真实装配 dssm-invocation-badge 徽标');

const defaultRow = renderSkillTested(fakeRoot, { name: 'my-default-tool', ...defaultSkill });
const defaultBadgeFound = findVNode(defaultRow, n => n.props && n.props.className === 'dssm-invocation-badge');
assert.equal(defaultBadgeFound, null, 'P3-3 变异防御：默认技能的列表行 DOM 中绝不能装配徽标');

const noneRow = renderSkillTested(fakeRoot, { name: 'my-none-tool', ...noneSkill });
const noneBadgeFound = findVNode(noneRow, n => n.props && n.props.className === 'dssm-invocation-badge');
assert.equal(noneBadgeFound, null, 'P3-3 变异防御：双关技能的列表行 DOM 中绝不能装配徽标');

const tokenRow = renderSkillTested(fakeRoot, { name: 'my-token-tool', descriptionTokens: 42, bodyTokens: 88, ...defaultSkill });
const tokenBadgeFound = findVNode(tokenRow, n => n.props && n.props.className === 'dssm-token-badge');
assert.ok(tokenBadgeFound, 'P3-3 变异防御：带有 descriptionTokens 的技能列表行必须渲染 .dssm-token-badge 节点');
assert.ok(extractText(tokenBadgeFound).join('').includes('≈42'), 'P3-3 变异防御：徽标文本必须包含 ≈ 前缀与估算值');
assert.ok(tokenBadgeFound.props.title && tokenBadgeFound.props.title.includes('常驻系统提示词'), 'P3-3 变异防御：徽标悬浮提示必须包含完整拆分说明');

// 7. P3-3 详情弹窗装配层验证（防变异穿透：真实装配 DOM 树断言，防止返回值丢弃或假绿）
const detailModalStart = source.indexOf('      if (modal === "detail") {');
const detailModalEnd = source.indexOf('      if (modal && typeof modal === "object" && modal.type === "trash-confirm")', detailModalStart);
assert.ok(detailModalStart >= 0 && detailModalEnd > detailModalStart, '必须存在详情弹窗渲染代码块');

const detailModalBlock = stripTypeScriptTypes(source.slice(detailModalStart, detailModalEnd));
const makeDetailModal = new Function(
  'h', 't', 'Modal', 'PrimitiveButton', 'Input', 'renderDetailPolicy', 'renderDetailTokens',
  `return function renderDetailModal(modal, detail, detailSkill) {
     const content = [];
     const copyState = 'idle', setCopyState = () => {}, setDetailSkill = () => {}, setModal = () => {}, copyText = () => {};
     ${detailModalBlock}
     return content[0];
   };`
)(h, tZh, function Modal(props) { return h('Modal', props, props.children); }, function PrimitiveButton(props) { return h('Button', props, props.children); }, { TextArea: function TextArea(props) { return h('textarea', props); } }, renderDetailPolicy, realRenderDetailTokens);

const fakeDetailData = { name: 'my-manual-tool', declaredName: 'My Manual Tool', path: 'D:/skills/my-manual-tool/SKILL.md', body: 'steps', descriptionTokens: 50, bodyTokens: 120, diagnostics: [] };
const renderedModalVNode = makeDetailModal('detail', fakeDetailData, manualOnlySkill);
const detailPolicyVNode = findVNode(renderedModalVNode, n => n.props && n.props.className === 'dssm-detail-policy');
assert.ok(detailPolicyVNode, 'P3-3 变异防御：详情弹窗真实渲染 DOM 树中必须存在 .dssm-detail-policy 结构节点');
const modalPolicyTexts = extractText(detailPolicyVNode).join(' ');
assert.ok(modalPolicyTexts.includes(DICT.zh['detail.policy.manualOnly']), 'P3-3 变异防御：详情弹窗真实装配必须传入 detailSkill 并渲染对应策略文案，防止误传 detail 导致文案错误');

const detailTokensVNode = findVNode(renderedModalVNode, n => n.props && n.props.className === 'dssm-detail-tokens');
assert.ok(detailTokensVNode, 'P3-3 变异防御：详情弹窗必须真实装配 .dssm-detail-tokens');
const detailTokenTexts = extractText(detailTokensVNode).join(' ');
assert.ok(detailTokenTexts.includes('简介 ≈50 token') && detailTokenTexts.includes('正文 ≈120 token'), 'P3-3 变异防御：详情弹窗必须准确展示简介与正文 token 拆分');

// 8. 验证 CSS 样式包含徽标定义与详情策略定义
assert.match(source, /\.dssm-invocation-badge\{/, 'CSS 样式中必须定义 .dssm-invocation-badge');
assert.match(source, /\.dssm-detail-policy\{/, 'CSS 样式中必须定义 .dssm-detail-policy');

console.log('invocation-policy-ui 全部 8 项单元测试（含双端装配层与防伪防御）全部通过！');
