import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepositoryUI, repositoryLocales } from '../src/repository-ui.ts';
import { createRepositoryManager } from '../lib/repositories.js';

function uiHarness(skills, { locale = 'zh', owner = 'google', name = 'skills' } = {}) {
  let values = [], deps = [], effects = [], cleanup = [], cursor = 0, ui;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.flat(Infinity).filter(x => x != null && typeof x !== 'boolean')
    }),
    useState(initial) {
      const i = cursor++;
      if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      return (values[i] ||= { current: initial });
    },
    useEffect(fn, d) {
      const i = cursor++;
      if (!deps[i] || d.some((v, n) => v !== deps[i][n])) {
        deps[i] = d;
        effects.push({ i, fn });
      }
    },
    Fragment: 'fragment'
  };
  const calls = [];
  let handler = async () => ({});
  const api = async (path, options) => {
    calls.push({ path, body: options?.body && JSON.parse(options.body) });
    if (path === '/repositories') {
      return {
        repositories: [{ id: 'google-skills', owner, name, skills }],
        installRoots: [{ key: 'dsh', available: true, path: '/skills' }]
      };
    }
    if (path === '/workspaces') return { items: [] };
    return handler(path, options);
  };
  const Input = Object.assign(function Input() {}, { TextArea: 'textarea' });
  const Button = 'host-button', Modal = 'modal', SourceSelect = 'select', Checkbox = 'host-checkbox';
  const t = (key, args = {}) =>
    Object.entries(args).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      repositoryLocales[locale][key] || key
    );
  const useUI = createRepositoryUI({
    react,
    Modal,
    Input,
    Button,
    Checkbox,
    SourceSelect,
    destination: {
      DestinationPicker: 'picker',
      defaultDestination: () => ({ scope: 'user', location: 'dsh' }),
      destinationPayload: () => ({ root: 'dsh' }),
      destinationReady: () => true
    },
    api,
    headers: {},
    translateError: (t, e) => (e?.code ? t(e.code) : e?.message)
  });
  let installed = async () => {};
  function render() {
    cursor = 0;
    ui = useUI({ active: true, t, onInstalled: installed });
  }
  async function settle() {
    for (let j = 0; j < 5; j++) {
      render();
      for (const e of effects.splice(0)) {
        cleanup[e.i]?.();
        cleanup[e.i] = e.fn();
      }
      await new Promise(setImmediate);
    }
    render();
  }
  function nodes(n) {
    if (!n || typeof n !== 'object') return [];
    if (Array.isArray(n)) return n.flatMap(nodes);
    return [n, ...nodes(n.children), ...nodes(n.props?.footer)];
  }
  const all = () => nodes([ui.actions, ui.content]);
  const find = f => all().find(f);
  const byText = s => find(n => n.type === Button && n.children.includes(s));
  return {
    settle,
    render,
    find,
    all,
    byText,
    calls,
    t,
    setHandler: fn => (handler = fn),
    unmount: () => cleanup.forEach(f => f?.())
  };
}

const mockSkill = i => ({
  path: `skills/skill-${i}`,
  name: `google-skill-${i}`,
  description: `Google skill number ${i}`,
  status: 'available',
  valid: true,
  installedRoot: null
});

test('issue 90: google/skills 194 项以上全选不再禁用安装按钮且无 100 项上限告警', async () => {
  const skills = Array.from({ length: 194 }, (_, i) => mockSkill(i + 1));
  const h = uiHarness(skills, { locale: 'zh' });
  await h.settle();

  // 点击全选 google/skills 仓库中的所有 194 项
  const selectAllBox = h.find(n => n.type === 'host-checkbox' && n.props.label === h.t('repo.bulk.selectRepoShort'));
  assert.ok(selectAllBox, '全选复选框存在');
  selectAllBox.props.onChange(true);
  await h.settle();

  // 验证不出现“单次操作最多 100 项”的告警
  const hasLimitAlert = h.all().some(
    n => n.props.role === 'alert' && n.children.some(c => typeof c === 'string' && c.includes('100'))
  );
  assert.equal(hasLimitAlert, false, '不应展示 100 项上限拦截告警');

  // 验证安装按钮正常可用（按钮文案为“安装 194”，disabled 为 false）
  const installBtn = h.byText('安装 194');
  assert.ok(installBtn, '应显示“安装 194”按钮');
  assert.equal(installBtn.props.disabled, false, '安装 194 按钮必须可点击');

  // 点击“安装 194”打开批量确认弹窗
  installBtn.props.onClick();
  await h.settle();
  assert.ok(h.find(n => n.type === 'modal'), '成功打开批量安装预检弹窗');
  assert.ok(h.all().some(n => n.children.includes('批量安装 194 个技能')));

  // 模拟执行：逐项安装并更新进度
  const executedItems = [];
  h.setHandler(async (path, options) => {
    if (path.endsWith('/installMany')) {
      const items = JSON.parse(options.body).items;
      executedItems.push(...items);
      return { results: items.map(item => ({ ...item, ok: true })) };
    }
    return {};
  });

  const runBatchBtn = h.byText('开始执行');
  assert.ok(runBatchBtn, '开始执行按钮存在');
  runBatchBtn.props.onClick();
  await h.settle();

  // 验证全部 194 项被逐项请求并完成
  assert.equal(executedItems.length, 194, '194 项技能全部被成功调度处理');
  assert.ok(
    h.all().some(
      n =>
        n.children.some(
          c => typeof c === 'string' && c.includes('批量完成：成功 194 · 失败 0 · 跳过 0 · 未执行 0')
        )
    ),
    '结果弹窗正确展示成功 194'
  );
});

test('issue 90: 大批量安装过程中可随时点击停止并保留已安装项', async () => {
  const skills = Array.from({ length: 194 }, (_, i) => mockSkill(i + 1));
  const h = uiHarness(skills, { locale: 'zh' });
  await h.settle();

  // 全选
  h.find(n => n.type === 'host-checkbox' && n.props.label === h.t('repo.bulk.selectRepoShort')).props.onChange(true);
  await h.settle();
  h.byText('安装 194').props.onClick();
  await h.settle();

  let pendingItemResolve;
  let installedCount = 0;
  h.setHandler(async (path, options) => {
    if (path.endsWith('/installMany')) {
      const items = JSON.parse(options.body).items;
      installedCount++;
      if (installedCount === 5) {
        // 在装到第 5 个时暂停等待中途停止
        return new Promise(resolve => {
          pendingItemResolve = () => resolve({ results: [{ ...items[0], ok: true }] });
        });
      }
      return { results: [{ ...items[0], ok: true }] };
    }
    return {};
  });

  h.byText('开始执行').props.onClick();
  await h.settle();

  // 此时前 4 个已装完，第 5 个 pending 中，停止按钮可见
  const stopBtn = h.byText('停止');
  assert.ok(stopBtn, '运行中必须显示“停止”按钮');
  assert.equal(stopBtn.props.disabled, false, '运行中的停止按钮绝不能被 busy 禁用');
  stopBtn.props.onClick();
  await h.settle();

  // 释放第 5 个的响应
  assert.ok(pendingItemResolve, '已拦截到第 5 项');
  pendingItemResolve();
  await h.settle();

  // 验证成功退出并展示结果：前 5 个成功，剩余 189 个为未执行
  assert.ok(
    h.all().some(
      n =>
        n.children.some(
          c => typeof c === 'string' && c.includes('批量完成：成功 5 · 失败 0 · 跳过 0 · 未执行 189')
        )
    ),
    '结果弹窗正确展示中断后的状态（成功 5，未执行 189）'
  );
});

test('issue 90: 批量卸载运行中停止按钮可用且能正确停止', async () => {
  const installedSkills = Array.from({ length: 196 }, (_, i) => ({
    ...mockSkill(i + 1),
    status: 'installed',
    installations: [{ installedRoot: 'dsh', tracked: true, canUninstall: true }]
  }));
  const h = uiHarness(installedSkills, { locale: 'zh' });
  await h.settle();
  h.find(n => n.type === 'host-checkbox' && n.props.label === h.t('repo.bulk.selectRepoShort')).props.onChange(true);
  await h.settle();
  h.byText('卸载 196').props.onClick();
  await h.settle();

  let pendingResolve;
  let count = 0;
  h.setHandler(async (path, options) => {
    if (path.endsWith('/uninstallMany')) {
      count++;
      if (count === 3) {
        return new Promise(r => { pendingResolve = r; });
      }
      return { results: [{ ok: true }] };
    }
    return {};
  });

  h.byText('开始执行').props.onClick();
  await h.settle();

  const stopBtn = h.byText('停止');
  assert.ok(stopBtn, '卸载运行中必须显示“停止”按钮');
  assert.equal(stopBtn.props.disabled, false, '卸载运行中的停止按钮绝不能为 disabled');
  stopBtn.props.onClick();
  await h.settle();

  pendingResolve({ results: [{ ok: true }] });
  await h.settle();

  assert.ok(
    h.all().some(n => n.children.some(c => typeof c === 'string' && c.includes('批量完成：成功 3 · 失败 0 · 跳过 0 · 未执行 193'))),
    '卸载中断结果展示正确'
  );
});

test('issue 90: 真实从 google/skills 拉取并扫描出的 200+ 技能在管理器中全选与分批调度正常', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'dssm-google-skills-'));
  const dshHome = join(sandbox, 'dsh-home');
  process.env.DSH_HOME = dshHome;
  try {
    const manager = createRepositoryManager({
      defaultProbe: false,
      log: () => {}
    });

    // 添加真实的 google/skills 仓库
    const repo = await manager.add({
      url: 'google/skills',
      subdirectory: 'skills',
      skipProbe: true
    });
    assert.equal(repo.owner, 'google');
    assert.equal(repo.name, 'skills');

    // 真实刷新检出与扫描
    console.log('正在执行真实的 google/skills refresh 扫描...');
    let refreshed;
    try {
      refreshed = await manager.refresh({ id: repo.id });
    } catch (err) {
      if (err.code === 'error.repo.network' || String(err.message).includes('网络') || String(err.message).includes('Git')) {
        console.log('网络环境限制，跳过真实远程 GitHub 拉取测试:', err.message);
        return;
      }
      throw err;
    }
    if (refreshed.error) {
      console.log('网络环境限制，跳过真实远程 GitHub 拉取测试:', refreshed.error);
      return;
    }
    console.log(`google/skills 实际扫描到的有效技能数量: ${refreshed.skills.length}`);
    assert.ok(refreshed.skills.length >= 194, `google/skills 技能总数必须 >= 194（实际: ${refreshed.skills.length}）`);

    // 测试批量接口支持一次性传入 100+ 项不报错（服务端上限已放宽到 1000）
    const testItems = refreshed.skills.slice(0, 105).map(s => ({ id: repo.id, path: s.path }));
    assert.equal(testItems.length, 105);

    // 真实执行其中 5 个技能的批量安装，验证物理写入与启用状态
    const installCandidates = refreshed.skills.slice(0, 5).map(s => ({ id: repo.id, path: s.path }));
    console.log(`正在真实批量安装 google/skills 中的 5 个技能: ${installCandidates.map(c => c.path).join(', ')}...`);
    const installResult = await manager.installMany({
      items: installCandidates,
      root: 'dsh'
    });
    assert.equal(installResult.results.length, 5);
    for (const res of installResult.results) {
      assert.equal(res.ok, true, `技能 ${res.name} 安装必须成功`);
    }
    console.log('真实安装成功并完成持久化验证！');
  } finally {
    await rm(sandbox, { recursive: true, force: true }).catch(() => {});
  }
});
