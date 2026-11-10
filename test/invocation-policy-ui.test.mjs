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

// 1. 验证多语言词条对齐
const requiredKeys = [
  'invocation.manualOnly',
  'invocation.modelOnly',
  'invocation.manualOnlyTip',
  'invocation.modelOnlyTip',
  'detail.invocation',
  'detail.policy.all',
  'detail.policy.manualOnly',
  'detail.policy.modelOnly',
  'detail.policy.blocked',
];

for (const key of requiredKeys) {
  assert.ok(DICT.zh[key], `DICT.zh 必须包含词条 ${key}`);
  assert.ok(DICT.en[key], `DICT.en 必须包含词条 ${key}`);
}

// 2. 验证调用方式判定函数导出与行为
const fnStart = source.indexOf('    function skillDeclaredInvocationKind(');
const fnEnd = source.indexOf('    function isSkillEnabled(', fnStart);
assert.ok(fnStart >= 0 && fnEnd > fnStart, '必须存在 skillDeclaredInvocationKind 与 skillEffectiveInvocationKind 辅助函数');

const fnBlock = stripTypeScriptTypes(source.slice(fnStart, fnEnd));
const { skillDeclaredInvocationKind, skillEffectiveInvocationKind } = new Function(
  fnBlock + '\nreturn { skillDeclaredInvocationKind, skillEffectiveInvocationKind };'
)();

// 默认全开
const defaultSkill = {
  modelInvocable: true,
  userInvocable: true,
  effectiveModelInvocable: true,
  effectiveUserInvocable: true,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(defaultSkill), 'all');
assert.equal(skillEffectiveInvocationKind(defaultSkill), 'all');

// 仅手动（disable-model-invocation: true）
const manualOnlySkill = {
  modelInvocable: false,
  userInvocable: true,
  effectiveModelInvocable: false,
  effectiveUserInvocable: true,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(manualOnlySkill), 'manual');
assert.equal(skillEffectiveInvocationKind(manualOnlySkill), 'manual');

// 仅模型（user-invocable: false）
const modelOnlySkill = {
  modelInvocable: true,
  userInvocable: false,
  effectiveModelInvocable: true,
  effectiveUserInvocable: false,
  managerEnabled: true
};
assert.equal(skillDeclaredInvocationKind(modelOnlySkill), 'model');
assert.equal(skillEffectiveInvocationKind(modelOnlySkill), 'model');

// 管理器停用后的阻断
const disabledManualSkill = {
  modelInvocable: false,
  userInvocable: true,
  effectiveModelInvocable: false,
  effectiveUserInvocable: false,
  managerEnabled: false
};
assert.equal(skillDeclaredInvocationKind(disabledManualSkill), 'manual', '源声明保持为仅手动');
assert.equal(skillEffectiveInvocationKind(disabledManualSkill), 'none', '实际生效为完全阻断');

// 3. 验证徽标渲染与防视觉冗余：默认技能绝不能渲染徽标
const badgeFnStart = source.indexOf('    function renderInvocationBadge(');
const badgeFnEnd = source.indexOf('    function renderSkillStatusIcon(', badgeFnStart);
assert.ok(badgeFnStart >= 0 && badgeFnEnd > badgeFnStart, '必须包含 renderInvocationBadge 函数');

const badgeFnBlock = stripTypeScriptTypes(source.slice(badgeFnStart, badgeFnEnd));
const { renderInvocationBadge } = new Function(
  'h', 't', 'skillDeclaredInvocationKind',
  badgeFnBlock + '\nreturn { renderInvocationBadge };'
)(h, tZh, skillDeclaredInvocationKind);

assert.equal(renderInvocationBadge(defaultSkill), null, '默认模型+手动技能绝不渲染徽标，保持列表清爽');

const manualBadgeZh = renderInvocationBadge(manualOnlySkill);
assert.ok(manualBadgeZh, '仅手动技能必须渲染徽标');
assert.equal(manualBadgeZh.props.className, 'dssm-invocation-badge');
assert.equal(manualBadgeZh.children[0], '仅手动');
assert.equal(manualBadgeZh.props.title, '模型不可自动感知；聊天框输入 / 可手动调用');

const { renderInvocationBadge: renderInvocationBadgeEn } = new Function(
  'h', 't', 'skillDeclaredInvocationKind',
  badgeFnBlock + '\nreturn { renderInvocationBadge };'
)(h, tEn, skillDeclaredInvocationKind);
const manualBadgeEn = renderInvocationBadgeEn(manualOnlySkill);
assert.equal(manualBadgeEn.children[0], 'Manual only');

// 4. 验证搜索匹配支持
const matchFnStart = source.indexOf('    function matchSkillQuery(');
const matchFnEnd = source.indexOf('    function filterSkills<', matchFnStart);
assert.ok(matchFnStart >= 0 && matchFnEnd > matchFnStart, 'matchSkillQuery 必须存在');

const matchFnBlock = stripTypeScriptTypes(source.slice(matchFnStart, matchFnEnd));
const { matchSkillQuery } = new Function(
  'skillDeclaredInvocationKind',
  'function normalizeSkillQuery(query) { return String(query == null ? "" : query).trim().toLowerCase(); }\n' +
  matchFnBlock + '\nreturn { matchSkillQuery };'
)(skillDeclaredInvocationKind);

assert.equal(matchSkillQuery(defaultSkill, '手动'), false, '默认技能搜手动不应命中');
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

// 递归抽取所有叶子文本
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

// 6. 验证 CSS 样式包含徽标定义
assert.match(source, /\.dssm-invocation-badge\{/, 'CSS 样式中必须定义 .dssm-invocation-badge');
assert.match(source, /\.dssm-detail-policy\{/, 'CSS 样式中必须定义 .dssm-detail-policy');

console.log('invocation-policy-ui 单元测试全部通过！');
