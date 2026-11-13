import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Execute the actual grouping functions directly from source, without a bundle.
const source = await readFile(new URL('../src/client.ts', import.meta.url), 'utf8');
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null && typeof x !== 'boolean') });
const tCalls = [];
const t = (key, params) => {
  if (params) tCalls.push({ key, params });
  return key;
};
const brandStart = source.indexOf('    function resolveRepoBrand(');
const brandEnd = source.indexOf('    function GithubMark16()', brandStart);
assert.ok(brandStart >= 0 && brandEnd > brandStart, 'brand resolution functions are present');
const brandFns = stripTypeScriptTypes(source.slice(brandStart, brandEnd));
const { resolveRepoBrand, renderRepoBrandIconByUrl } = new Function('h', brandFns + '\nreturn { resolveRepoBrand, renderRepoBrandIconByUrl };')(h);

// 验证 resolveRepoBrand 矩阵与防误判
assert.equal(resolveRepoBrand('https://github.com/team/tool'), 'GitHub');
assert.equal(resolveRepoBrand('https://github.com/gitlab/runner'), 'GitHub', 'GitHub 上的 gitlab 组织不得误判为 GitLab');
assert.equal(resolveRepoBrand('https://example.com/gitlab/foo'), 'Git', '非 gitlab 域名的路径含 gitlab 不得误判为 GitLab');
assert.equal(resolveRepoBrand('https://gitlab.com/team/tool'), 'GitLab');
assert.equal(resolveRepoBrand('https://my-gitlab.corp.net/team/tool'), 'GitLab', '自建 GitLab 域名应识别为 GitLab');
assert.equal(resolveRepoBrand('git@gitlab.com:team/tool.git'), 'GitLab');
assert.equal(resolveRepoBrand('https://gitee.com/team/tool'), 'Gitee');
assert.equal(resolveRepoBrand('git@gitee.com:team/tool.git'), 'Gitee');
assert.equal(resolveRepoBrand('https://git.kernel.org/pub/scm/linux'), 'Git');
assert.equal(resolveRepoBrand('file:///local/path'), 'Git');
assert.equal(resolveRepoBrand(null, 'team/tool'), 'GitHub', '默认简写 repo 归为 GitHub');

const start = source.indexOf('      type ProvenanceRow =');
const end = source.indexOf('      function renderTrash()', start);
assert.ok(start >= 0 && end > start, 'provenance UI source is present');
const grouping = stripTypeScriptTypes(source.slice(start, end));
const make = new Function('filteredRows', 'h', 't', 'expanded', 'query', 'activeSource', 'filters', 'filterKey', 'renderSkill', 'foldChevron', 'sourceExtra', 'rootDisplayName', 'renderRootIcon', 'renderRepoBrandIconByUrl', 'countKey', 'setExpanded', 'strokeIcon', 'scope', 'selectedWorkspace', 'roots', 'renderRoot', 'workspaceList', 'workspaceRows', 'rows', 'selectedDetail', grouping + '\nreturn { collectProvenanceRoots, renderProvenanceRepo, renderProvenanceRoot, renderProvenanceList, renderList };');
const root = { key: 'dsh', path: '/skills', mutable: true, categories: [] };
const skill = (name, provenance) => ({ name, provenance });
const filteredRows = [
  skill('one', { repo: 'team/tool', identity: 'github:team/tool', url: 'https://github.com/team/tool', kind: 'install', category: 'docs' }),
  skill('two', { repo: 'team/tool', identity: 'gitlab:team/tool', url: 'https://gitlab.com/team/tool', kind: 'install', category: 'docs' }),
  skill('unknown', null),
].map(skill => ({ root, skill }));
const ui = make(filteredRows, h, t, {}, 'search', '', { group: 'repo' }, 'user', (root, skill) => h('skill', { name: skill.name }), () => null, () => null, () => 'DSH', () => null, renderRepoBrandIconByUrl, key => key, () => {}, () => h('svg', {}), 'user', undefined, [root], () => h('div', { className: 'dssm-dir-view' }), {}, [], filteredRows, null);
const projectExpanded = {};
const projectUI = make(filteredRows, h, t, projectExpanded, '', '', { group: 'repo' }, 'project', (root, skill) => h('skill', { name: skill.name }), () => null, () => null, () => 'DSH', () => null, renderRepoBrandIconByUrl, key => key, update => Object.assign(projectExpanded, update(projectExpanded)), () => h('svg', {}), 'project', 'D:/first', [root], () => h('div', { className: 'dssm-dir-view' }), {}, [], filteredRows, null);
const pg = projectUI.collectProvenanceRoots()[0];
flattenEarly(projectUI.renderProvenanceRoot(pg, 'D:/first')).find(node => node.type === 'button').props.onClick();
assert.equal(flattenEarly(projectUI.renderProvenanceRoot(pg, 'D:/second')).find(node => node.type === 'button').props['aria-expanded'], true, '项目来源折叠状态不能跨工作区串用');
function flattenEarly(node) { return node && typeof node === 'object' ? [node, ...(node.children || []).flatMap(flattenEarly)] : []; }
const groups = ui.collectProvenanceRoots();
const repoList = ui.renderProvenanceList();
assert.ok(repoList.props.className.split(/\s+/).includes('dssm-sources'), '仓库视图的来源卡片应复用目录视图的间距容器');
assert.match(source, /\.dssm-sources\{display:flex;flex-direction:column;gap:9px\}/, '两种视图使用同一来源间距规则');

// 验证 group.provenanceCount 统计参数：2 个来源仓库（GitHub、GitLab）· 1 个来源未知（unknown 技能）
const countEntry = tCalls.find(c => c.key === 'group.provenanceCount');
assert.ok(countEntry, '必须调用 group.provenanceCount 进行统计');
assert.deepEqual(countEntry.params, { repos: 2, unknown: 1 }, '准确统计来源仓库数与来源未知技能数');
const flatten = node => node && typeof node === 'object' ? [node, ...(node.children || []).flatMap(flatten)] : [];
const classes = node => String(node?.props?.className || '').split(/\s+/);

// 验证 renderList 真实切换分支 (P3-4 覆盖)
const defaultList = ui.renderList();
assert.ok(flatten(defaultList).some(node => classes(node).includes('dssm-provenance')), 'filters.group=repo 时 renderList 必须调用仓库视图');

const dirUI = make(filteredRows, h, t, {}, '', '', { group: '' }, 'user', (root, skill) => h('skill', { name: skill.name }), () => null, () => null, () => 'DSH', () => null, renderRepoBrandIconByUrl, key => key, () => {}, () => h('svg', {}), 'user', undefined, [root], () => h('div', { className: 'dssm-dir-view' }), {}, [], filteredRows, null);
const dirRendered = dirUI.renderList();
assert.ok(flatten(dirRendered).some(node => classes(node).includes('dssm-dir-view')), 'filters.group 为空时 renderList 渲染默认目录视图');
assert.equal(flatten(dirRendered).some(node => classes(node).includes('dssm-provenance')), false, '默认视图不应包含仓库视图');
assert.equal(groups[0].repos.length, 3, 'same display name on different hosts must remain distinct repositories');
const github = groups[0].repos.find(group => group.rows.some(row => row.skill.name === 'one'));
const gitlab = groups[0].repos.find(group => group.rows.some(row => row.skill.name === 'two'));
const githubRendered = ui.renderProvenanceRepo(groups[0], github);
assert.ok(classes(githubRendered).includes('dssm-cat'), '仓库组复用原有分类外框');
assert.ok(flatten(githubRendered).some(node => classes(node).includes('dssm-cat-head')), '仓库组复用分类标题行');
assert.ok(flatten(githubRendered).some(node => classes(node).includes('dssm-cat-main')), '仓库组复用分类折叠按钮');
assert.ok(flatten(githubRendered).some(node => classes(node).includes('dssm-cat-title')), '仓库组复用分类标题样式');
assert.ok(flatten(githubRendered).some(node => node.type === 'skill'), '展开后仍展示技能');
const nestedDirectory = flatten(githubRendered).find(node => classes(node).includes('dssm-prov-cat'));
assert.ok(classes(nestedDirectory).includes('dssm-cat'), '仓库内目录也复用分类外框');
assert.ok(flatten(nestedDirectory).some(node => classes(node).includes('dssm-cat-main')), '仓库内目录复用分类折叠按钮');
const githubLink = flatten(githubRendered).find(node => node.type === 'a');
assert.equal(githubLink?.props.href, 'https://github.com/team/tool');
assert.equal(githubLink.props.target, '_blank');
assert.ok(classes(githubLink).includes('dssm-icon-action'), '仓库外链复用分组操作按钮的外框样式');
assert.ok(flatten(githubLink).some(node => node.type === 'svg'), '仓库外链使用标准化矢量图标');
assert.equal(githubLink.props['aria-label'], 'group.openRepo', '图标链接保留可访问名称');
assert.match(githubLink.props.rel, /noopener/);
assert.ok(flatten(githubRendered).some(node => node.type === 'button' && node.props['aria-expanded'] === true), 'repository toggle is a keyboard-operable button');
assert.ok(flatten(githubRendered).filter(node => node.type === 'button').every(button => !flatten(button).some(node => node.type === 'a')), 'repository link is never inside a button');
assert.ok(flatten(ui.renderProvenanceRepo(groups[0], gitlab)).some(node => node.type === 'svg' && node.props.viewBox === '0 0 24 24'), 'GitLab 仓库使用 GitLab 品牌图标而非 GitHub 图标');
assert.ok(flatten(ui.renderProvenanceRepo(groups[0], github)).some(node => node.type === 'svg' && node.props.viewBox === '0 0 16 16'), 'GitHub 仓库保留 GitHub 图标');
for (const url of ['javascript:alert(1)', '//evil.test/x', 'https://', null]) {
  filteredRows[0].skill.provenance.url = url;
  const group = ui.collectProvenanceRoots()[0];
  const rendered = ui.renderProvenanceRepo(group, group.repos.find(repo => repo.rows.some(row => row.skill.name === 'one')));
  assert.equal(flatten(rendered).some(node => node.type === 'a'), false, `invalid URL must not link: ${url}`);
}
const skillStart = source.indexOf('      function renderSkill(root:');
const skillEnd = source.indexOf('      var rows =', skillStart);
const extraStart = source.indexOf('      function sourceExtra(');
const extraEnd = source.indexOf('      function AntdFolderClosed()', extraStart);
const skillFns = stripTypeScriptTypes(source.slice(skillStart, skillEnd) + source.slice(extraStart, extraEnd));
const makeSkill = new Function('env', `
  const { h, t, filters } = env;
  const isSkillEnabled = () => true, busy = false, allRoots = [], draggingRef = { current: null };
  const moreIcon = () => null, SourceSelect = function SourceSelect() {}, SkillSwitch = function SkillSwitch() {};
  const renderSkillStatusIcon = () => null, enableSwitch = () => h('switch', {}), renderLinkedNote = () => null, renderFallback = () => null, renderInvocationBadge = () => null, renderTokenBadge = () => null;
  const iconButton = (label) => h('button', { 'aria-label': label }), strokeIcon = () => null, canToggleSource = () => true;
  ${skillFns}
  return { renderSkill, sourceExtra };
`);
const repoUI = makeSkill({ h, t, filters: { group: 'repo' } });
const classifiedRoot = { ...root, categories: [{ id: 'work', name: 'Work' }] };
const row = repoUI.renderSkill(classifiedRoot, { name: 'one', categoryId: '', description: 'one' });
const menu = flatten(row).find(node => node.props.label === 'btn.more');
assert.ok(menu.props.options.some(option => option.value === 'detail'));
assert.ok(menu.props.options.some(option => option.value === 'note'));
assert.ok(menu.props.options.some(option => option.value === 'trash'));
assert.equal(menu.props.options.some(option => option.value.startsWith('category:')), false, 'repository view does not offer category assignment');
assert.equal(row.props.draggable, false, 'repository view cannot initiate drag');
assert.equal(row.props.onDrop, undefined, 'repository view cannot accept drops');
const extra = repoUI.sourceExtra(classifiedRoot, undefined, 'DSH');
assert.equal(flatten(extra).some(node => node.props['aria-label'] === 'category.create'), false, 'repository view cannot create categories');
assert.ok(flatten(extra).some(node => node.type?.name === 'SkillSwitch'), 'source toggle remains available');
const fallback = groups[0].repos.find(group => group.fallback);
const fallbackOnly = { ...groups[0], repos: [fallback], rows: fallback.rows, hasEvidence: false };
assert.ok(flatten(ui.renderProvenanceRoot(fallbackOnly)).some(node => node.children.includes('group.unknownSource')), '来源目录完全无证据时也应标注来源未知');
assert.ok(flatten(ui.renderProvenanceRepo(groups[0], fallback)).some(node => node.children.includes('group.unknownSource')), 'unknown provenance has its own label');
assert.match(source, /"group\.unknownSource": "来源未知"/);
assert.match(source, /"group\.unknownSource": "Unknown source"/);
const rootOnly = { ...github, categories: [''], rows: [{ root, skill: skill('root-skill', { category: '' }) }] };
assert.equal(flatten(ui.renderProvenanceRepo(groups[0], rootOnly)).some(node => classes(node).includes('dssm-prov-cat')), false, '只有根目录时不增加空目录层');
assert.ok(flatten(ui.renderProvenanceRepo(groups[0], rootOnly)).some(node => node.type === 'skill' && node.props.name === 'root-skill'));
assert.doesNotMatch(source.match(/"group\.hint": "([^"]+)"/)[1], /目录名后缀/, '来源说明不得把目录名后缀当作来源证据');
const sourceUI = makeSkill({ h, t, filters: { group: '' } });
const sourceRow = sourceUI.renderSkill(classifiedRoot, { name: 'one', description: 'one' });
assert.equal(sourceRow.props.draggable, true, 'directory mode still allows drag');
assert.equal(typeof sourceRow.props.onDrop, 'function');
assert.ok(flatten(sourceRow).find(node => node.props.label === 'btn.more').props.options.some(option => option.value === 'category:work'), 'directory mode retains assignment');
assert.ok(flatten(sourceUI.sourceExtra(classifiedRoot, undefined, 'DSH')).some(node => node.props['aria-label'] === 'category.create'), 'directory mode retains category creation');
filteredRows.push({ root, skill: skill('identity-only', { identity: 'git:internal', repo: null, url: 'https://example.test/repo', kind: 'install', category: '' }) });
const identityOnly = ui.collectProvenanceRoots()[0].repos.find(group => group.rows.some(row => row.skill.name === 'identity-only'));
assert.equal(identityOnly.fallback, false, 'identity alone is known provenance');

// 验证 matchSkillQuery / filterSkills 包含仓库名与仓库内目录 (P3-5 覆盖)
const dictMatch = source.match(/var DICT\s*=\s*(\{[\s\S]*?\n    \});/);
assert.ok(dictMatch, 'DICT 定义必须存在');
const DICT = new Function(`return ${dictMatch[1]};`)();
const fnStart = source.indexOf('    function skillDeclaredInvocationKind(');
const fnEnd = source.indexOf('    function isSkillEnabled(', fnStart);
const skillDeclaredInvocationKind = new Function(stripTypeScriptTypes(source.slice(fnStart, fnEnd)) + '\nreturn skillDeclaredInvocationKind;')();

const searchMatchStart = source.indexOf('    function normalizeSkillQuery(');
const searchMatchEnd = source.indexOf('    function visibleSkillRoots<', searchMatchStart);
const searchFns = stripTypeScriptTypes(source.slice(searchMatchStart, searchMatchEnd));
const { matchSkillQuery, filterSkills } = new Function('DICT', 'skillDeclaredInvocationKind', searchFns + '\nreturn { matchSkillQuery, filterSkills };')(DICT, skillDeclaredInvocationKind);
const testRow = { name: 'my-tool', provenance: { repo: 'acme/super-repo', category: 'devops', path: 'skills/devops/my-tool' } };
assert.ok(matchSkillQuery(testRow, 'super-repo'), '可根据来源仓库名搜索到技能');
assert.ok(matchSkillQuery(testRow, 'devops'), '可根据来源仓库内分类目录搜索到技能');
assert.ok(matchSkillQuery(testRow, 'my-tool'), '可根据技能名称搜索');
assert.equal(matchSkillQuery(testRow, 'unrelated-query'), false, '无关关键词不匹配');

console.log('provenance UI identity, links and interaction tests passed');
