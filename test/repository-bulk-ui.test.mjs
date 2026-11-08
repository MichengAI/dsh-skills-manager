import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryUI, repositoryLocales } from '../src/repository-ui.ts';

function harness(skills, { locale = 'en', owner = 'o', name = 'repo' } = {}) {
  let values = [], deps = [], effects = [], cleanup = [], cursor = 0, ui;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null && typeof x !== 'boolean') }),
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
    useEffect(fn, d) { const i = cursor++; if (!deps[i] || d.some((v,n) => v !== deps[i][n])) { deps[i] = d; effects.push({i,fn}); } }, Fragment: 'fragment'
  };
  const calls = [];
  let handler = async () => ({});
  const api = async (path, options) => { calls.push({path, body: options?.body && JSON.parse(options.body)}); if (path === '/repositories') return { repositories: [{id:'r',owner,name,skills}], installRoots:[{key:'dsh',available:true,path:'/skills'}] }; if (path === '/workspaces') return {items:[]}; return handler(path, options); };
  const Input = Object.assign(function Input(){}, { TextArea: 'textarea' });
  const Button = 'host-button', Modal = 'modal', SourceSelect = 'select', Checkbox = 'host-checkbox';
  const t = (key, args = {}) => Object.entries(args).reduce((s,[k,v]) => s.replaceAll(`{${k}}`,String(v)), repositoryLocales[locale][key] || key);
  const useUI = createRepositoryUI({ react, Modal, Input, Button, Checkbox, SourceSelect, destination:{DestinationPicker:'picker',defaultDestination:()=>({scope:'user',location:'dsh'}),destinationPayload:()=>({root:'dsh'}),destinationReady:()=>true}, api, headers:{}, translateError: (t,e) => e?.code ? t(e.code) : e?.message });
  let installed = async () => {};
  function render(){ cursor=0; ui=useUI({active:true,t,onInstalled:installed}); }
  async function settle(){ for(let j=0;j<5;j++){render(); for(const e of effects.splice(0)){cleanup[e.i]?.();cleanup[e.i]=e.fn();} await new Promise(setImmediate);} render(); }
  function nodes(n){ if(!n || typeof n !== 'object') return []; if(Array.isArray(n)) return n.flatMap(nodes); return [n,...nodes(n.children),...nodes(n.props?.footer)]; }
  const all=()=>nodes([ui.actions,ui.content]);
  const find = f => all().find(f);
  const byText = s => find(n => n.type===Button && n.children.includes(s));
  const search=()=>find(n=>n.type===Input && n.props['aria-label']===t('repo.search'));
  return {settle,render,find,all,byText,search,calls,t, setHandler:fn=>handler=fn, setInstalled:fn=>installed=fn, unmount:()=>cleanup.forEach(f=>f?.())};
}
const skill = name => ({path:name,name,description:name,status:'available',installedRoot:null});
const copySkill = name => ({...skill(name),status:'installed',installations:[{installedRoot:'dsh',tracked:true,canUninstall:true,canRollback:true}]});
async function selectAll(h) { h.find(n=>n.props.label===h.t('repo.bulk.selectRepoShort')).props.onChange(); await h.settle(); }

for (const [locale, short, context] of [['en', 'Select all', 'Select all skills in '], ['zh', '全选', '全选 ']]) {
  test(`${locale} long repository name stays out of checkbox label while naming its group`, async () => {
    const owner = 'a'.repeat(80), name = 'b'.repeat(80);
    const h = harness([skill('alpha')], {locale, owner, name}); await h.settle();
    const group = h.find(n => n.props.role === 'group' && n.props['aria-label'] === h.t('repo.bulk.selectRepo', {name: `${owner}/${name}`}));
    assert.ok(group, 'named group provides repository context');
    assert.ok(group.props['aria-label'].startsWith(context));
    assert.equal(group.children.length, 1);
    const checkbox = group.children[0];
    assert.equal(checkbox.type, 'host-checkbox');
    assert.equal(checkbox.props.label, short, 'host accessible name is also the short visible label');
    assert.equal(checkbox.props['aria-label'], undefined, 'do not assume host forwards aria props');
    assert.notEqual(group.type, 'label', 'host label is not nested');
  });
  test(`${locale} skill, copy, and overwrite labels remain distinct`, async () => {
    const h = harness([copySkill('alpha')], {locale});
    h.setHandler(async path => path.endsWith('/previewMany') ? {results:[{ok:true,token:'x',changes:[{}],localModified:true}]} : {});
    await h.settle();
    h.find(n => n.type === 'button' && n.props['aria-expanded'] === false).props.onClick(); await h.settle();
    const labels = h.all().filter(n => n.type === 'host-checkbox').map(n => n.props.label);
    assert.ok(labels.includes(short));
    assert.ok(labels.includes(h.t('repo.bulk.selectSkill', {name:'alpha'})));
    assert.ok(labels.some(label => label !== short && label.includes('alpha') && label !== h.t('repo.bulk.selectSkill', {name:'alpha'})), 'copy has its own location label');
    await selectAll(h);
    h.byText(h.t('repo.bulk.update', {count:1})).props.onClick(); await h.settle();
    assert.ok(h.find(n => n.type === 'host-checkbox' && n.props.label === h.t('repo.bulk.policyLocalModified')));
  });
}

test('repository selection uses the host checkbox and toggles eligible skills', async () => {
  const h = harness([skill('alpha')]); await h.settle();
  const checkbox = () => h.find(n => n.type === 'host-checkbox' && n.props.label === 'Select all');
  assert.ok(checkbox(), 'repository checkbox uses the host primitive with a localized label');
  assert.equal(checkbox().props.disabled, false);
  assert.equal(checkbox().props.checked, false);
  checkbox().props.onChange(true); await h.settle();
  assert.equal(checkbox().props.checked, true);
  assert.ok(h.byText('Install 1'));
  checkbox().props.onChange(false); await h.settle();
  assert.equal(checkbox().props.checked, false);
});

test('skill and copy selections use labeled host checkboxes and honor unavailable targets', async () => {
  const unavailable = {...copySkill('offline'), installations:[{installedRoot:null, installedWorkspace:'/missing', tracked:true}]};
  const h = harness([copySkill('alpha'), unavailable]); await h.settle();
  h.find(n=>n.type==='button' && n.props['aria-expanded']===false).props.onClick(); await h.settle();
  const byLabel = label => h.find(n => n.type === 'host-checkbox' && n.props.label === label);
  const skillBox = () => byLabel('Select skill alpha');
  const copyBox = () => h.find(n => n.type === 'host-checkbox' && n.props.label?.startsWith('Select location ') && n.props.label.endsWith(' for alpha'));
  assert.ok(skillBox()); assert.ok(copyBox());
  assert.equal(skillBox().props.disabled, false); assert.equal(copyBox().props.disabled, false);
  copyBox().props.onChange(true); await h.settle();
  assert.equal(skillBox().props.checked, true); assert.equal(copyBox().props.checked, true);
  skillBox().props.onChange(false); await h.settle();
  assert.equal(copyBox().props.checked, false);
  assert.equal(byLabel('Select skill offline').props.disabled, true);
  assert.equal(h.find(n => n.type === 'host-checkbox' && n.props.label?.endsWith(' for offline')).props.disabled, true);
});

test('modified overwrite policy uses host checkbox and disables during execution', async () => {
  const h = harness([copySkill('alpha')]); let finish;
  h.setHandler(path => path.endsWith('/previewMany') ? Promise.resolve({results:[{ok:true,token:'x',changes:[{}],localModified:true}]}) : path.endsWith('/updateMany') ? new Promise(r=>{finish=r;}) : Promise.resolve({}));
  await h.settle();
  const repo = () => h.find(n => n.type === 'host-checkbox' && n.props.label === 'Select all');
  repo().props.onChange(true); await h.settle(); h.byText('Check updates 1').props.onClick(); await h.settle();
  const policy = () => h.find(n => n.type === 'host-checkbox' && n.props.label === 'Locally modified items: back up and overwrite');
  assert.ok(policy()); assert.equal(policy().props.checked, false); assert.equal(policy().props.disabled, false);
  policy().props.onChange(true); await h.settle(); assert.equal(policy().props.checked, true);
  h.byText('Run batch').props.onClick(); await h.settle();
  assert.equal(policy().props.disabled, true); assert.equal(repo().props.disabled, true);
  finish({results:[{ok:true}]}); await h.settle();
});

test('more than 100 eligible items shows a limit and disables request', async () => {
  const h=harness(Array.from({length:101},(_,i)=>skill('s'+i))); await h.settle(); await selectAll(h);
  assert.ok(h.all().some(n=>n.props.role==='alert' && n.children.some(c=>typeof c==='string' && c.includes('100'))));
  assert.equal(h.byText('Install 101').props.disabled, true);
  assert.equal(h.calls.some(c=>c.path.endsWith('Many')),false);
});

test('update progress is indeterminate while request runs', async () => {
  const h=harness([copySkill('alpha')]); let finish;
  h.setHandler(async path => path.endsWith('/previewMany') ? {results:[{ok:true,token:'x',changes:[{}]}]} : path.endsWith('/updateMany') ? new Promise(r=>{finish=r;}) : {});
  await h.settle(); await selectAll(h); h.byText('Check updates 1').props.onClick(); await h.settle();
  h.byText('Run batch').props.onClick(); await h.settle();
  assert.ok(h.all().some(n=>n.children.includes('Replacing skill files…')));
  assert.equal(h.all().some(n=>n.props.className==='dssm-bulk-progress-bar'),false);
  assert.equal(h.all().some(n=>n.children.includes('Running 0/1…')),false);
  finish({results:[{ok:true}]}); await h.settle();
});

test('bulk results are not closable before refresh finishes and stay visible', async () => {
  const h=harness([skill('alpha')]); let finishRefresh;
  h.setHandler(async path => path.endsWith('/installMany') ? {results:[{id:'r',path:'alpha',ok:true}]} : {});
  h.setInstalled(()=>new Promise(r=>{finishRefresh=r;}));
  await h.settle(); await selectAll(h);
  h.byText('Install 1').props.onClick(); await h.settle();
  h.byText('Run batch').props.onClick(); await h.settle();
  h.find(n=>n.type==='modal').props.onClose(); await h.settle();
  try { assert.ok(h.find(n=>n.type==='modal'), 'cannot close while refresh is pending'); }
  finally { finishRefresh(); await h.settle(); }
  assert.ok(h.all().some(n=>n.children.some(c=>typeof c==='string' && c.includes('Batch finished:'))));
});

test('filtering preserves selection and actions include hidden selected items', async () => {
  const h=harness([skill('alpha'),skill('beta')]); await h.settle();
  h.find(n=>n.type==='button' && n.props['aria-expanded']===false).props.onClick(); await h.settle();
  h.find(n=>n.props.label==='Select skill alpha').props.onChange(); await h.settle();
  h.search().props.onChange({target:{value:'beta'}}); await h.settle();
  assert.ok(h.byText('Install 1'), 'hidden selection remains counted and actionable');
  h.byText('Install 1').props.onClick(); await h.settle();
  assert.ok(h.find(n=>n.type==='modal'));
  assert.ok(h.all().some(n=>n.children.includes('alpha')), 'preflight identifies the hidden target');
  h.setHandler(async (path, options)=>path.endsWith('/installMany') ? {results:JSON.parse(options.body).items.map(item=>({...item,ok:true}))} : {});
  h.byText('Run batch').props.onClick(); await h.settle();
  assert.deepEqual(h.calls.find(c=>c.path.endsWith('/installMany')).body.items, [{id:'r',path:'alpha'}]);
});

test('bulk preflight does not offer unsupported stop policy', async () => {
  const h=harness([skill('alpha')]); await h.settle();
  h.find(n=>n.type==='button' && n.props['aria-expanded']===false).props.onClick(); await h.settle();
  h.find(n=>n.props.label==='Select skill alpha').props.onChange(); await h.settle();
  h.byText('Install 1').props.onClick(); await h.settle();
  assert.equal(h.all().some(n=>n.children.includes('Stop the batch on a name conflict or failure')), false);
});

for (const [op, button, endpoint] of [
  ['install', 'Install 1', '/installMany'],
  ['uninstall', 'Uninstall 1', '/uninstallMany'],
  ['update', 'Check updates 1', '/updateMany'],
  ['rollback', 'Restore previous 1', '/updateMany'],
]) test(`${op} uses indeterminate progress without requesting shared progress`, async () => {
  const originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  const intervals = new Set(); let finish;
  globalThis.setInterval = fn => { const handle={fn}; intervals.add(handle); return handle; };
  globalThis.clearInterval = handle => intervals.delete(handle);
  try {
    const h=harness([op === 'install' ? skill('alpha') : copySkill('alpha')]);
    h.setHandler(path => path.endsWith('/previewMany') ? Promise.resolve({results:[{ok:true,token:'x',changes:[{}]}]}) : path.endsWith(endpoint) ? new Promise(r=>{finish=r;}) : Promise.resolve({index:99}));
    await h.settle(); await selectAll(h); h.byText(button).props.onClick(); await h.settle();
    h.byText('Run batch').props.onClick(); await h.settle();
    assert.equal(typeof finish, 'function', 'batch request is pending');
    for (const timer of intervals) timer.fn();
    await h.settle();
    assert.equal(h.calls.some(c=>c.path.endsWith('/progress')), false, 'never read shared progress');
    assert.ok(h.all().some(n=>n.props.className==='dssm-bulk-progress' && n.props.role==='status'), 'running status remains visible');
    assert.ok(h.all().some(n=>n.props.className==='dssm-repo-spinner'), 'indeterminate spinner remains visible');
    assert.equal(h.all().some(n=>n.props.className==='dssm-bulk-progress-bar'), false, 'no determinate bar');
    assert.equal(h.all().some(n=>(n.props.role==='status' || n.props.className==='dssm-bulk-progress-text') && n.children.some(c=>typeof c==='string' && /\d+\s*\/\s*\d+|\d+%/.test(c))), false, 'no numerical progress');
    finish({results:[{id:'r',path:'alpha',root:'dsh',ok:true}]}); await h.settle();
    assert.ok(h.all().some(n=>n.children.some(c=>typeof c==='string' && c.includes('Batch finished:'))), 'result remains visible');
  } finally { finish?.({results:[]}); globalThis.setInterval=originalSet; globalThis.clearInterval=originalClear; }
});

test('update preflight failures are not reported as no updates', async () => {
  const h = harness([copySkill('alpha')]);
  h.setHandler(async path => path.endsWith('/previewMany') ? { results: [{ ok: false, code: 'error.repo.network', error: '网络错误' }] } : {});
  await h.settle(); await selectAll(h);
  h.byText('Check updates 1').props.onClick(); await h.settle();
  assert.ok(h.find(n => n.type === 'modal'), '预检失败必须展示详情，不能误报无更新');
  assert.equal(h.all().some(n => n.children.some(c => typeof c === 'string' && c.includes('No updates available'))), false);
});

test('batch error codes have localized messages', () => {
  for (const locale of [repositoryLocales.zh, repositoryLocales.en]) for (const code of ['error.repo.empty','error.repo.tooMany','error.repo.duplicate']) assert.ok(locale[code], code);
});
