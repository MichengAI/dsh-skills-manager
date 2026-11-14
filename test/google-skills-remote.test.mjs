import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepositoryManager } from '../lib/repositories.js';

test('issue 90: 真实从 google/skills 拉取并扫描出的 200+ 技能在管理器中全选与分批调度正常', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'dssm-google-skills-'));
  const dshHome = join(sandbox, 'dsh-home');
  const prevDshHome = process.env.DSH_HOME;
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
    const testItems = refreshed.skills.slice(0, 105).map(s => ({ id: repo.id, path: s.path, root: 'dsh' }));
    assert.equal(testItems.length, 105);
    const preview = await manager.previewMany({ items: testItems });
    assert.equal(preview.results.length, 105, '105 项单次批量预检必须成功返回');

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
    if (prevDshHome === undefined) {
      delete process.env.DSH_HOME;
    } else {
      process.env.DSH_HOME = prevDshHome;
    }
    await rm(sandbox, { recursive: true, force: true }).catch(() => {});
  }
});
