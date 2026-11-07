import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryUI, repositoryLocales } from '../src/repository-ui.ts';

function harness(skills) {
  let values = [], deps = [], effects = [], cleanup = [], cursor = 0, ui;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null && typeof x !== 'boolean') }),
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
    useEffect(fn, d) { const i = cursor++; if (!deps[i] || d.some((v,n) => v !== deps[i][n])) { deps[i] = d; effects.push({i,fn}); } }, Fragment: 'fragment'
  };
  const calls = [];
  let handler = async () => ({});
  const api = async (path, options) => { calls.push({path, body: options?.body && JSON.parse(options.body)}); if (path === '/repositories') return { repositories: [{id:'r',owner:'o',name:'repo',skills}], installRoots:[{key:'dsh',available:true,path:'/skills'}] }; if (path === '/workspaces') return {items:[]}; return handler(path, options); };
  const Input = Object.assign(function Input(){}, { TextArea: 'textarea' });
  const Button = 'host-button', Modal = 'modal', SourceSelect = 'select';
  const t = (key, args = {}) => Object.entries(args).reduce((s,[k,v]) => s.replaceAll(`{${k}}`,String(v)), repositoryLocales.en[key] || key);
  const useUI = createRepositoryUI({ react, Modal, Input, Button, SourceSelect, destination:{DestinationPicker:'picker',defaultDestination:()=>({scope:'user',location:'dsh'}),destinationPayload:()=>({root:'dsh'}),destinationReady:()=>true}, api, headers:{}, translateError: (t,e) => e?.code ? t(e.code) : e?.message });
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
async function selectAll(h) { h.find(n=>n.props['aria-label']==='Select all skills in o/repo').props.onChange(); await h.settle(); }

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
  h.find(n=>n.props['aria-label']==='Select skill alpha').props.onChange(); await h.settle();
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
  h.find(n=>n.props['aria-label']==='Select skill alpha').props.onChange(); await h.settle();
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
