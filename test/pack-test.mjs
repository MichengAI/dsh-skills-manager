// 在没有 lib 的独立目录打包，防止忽略产物后发布缺少可运行代码。
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const sandbox = await mkdtemp(join(tmpdir(), 'dsh-skills-clean-pack-'));
const npm = process.env.npm_execpath;
assert.ok(npm, '请通过 npm run verify 运行，以使用当前 npm 入口');

try {
  for (const name of ['package.json', 'tsconfig.json', 'src', 'scripts', 'test/types', 'assets', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
    await cp(join(root, name), join(sandbox, name), { recursive: true });
  }
  // 仅复用已安装依赖，既不下载依赖，也不复制或读取工作区 lib。
  await symlink(join(root, 'node_modules'), join(sandbox, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(access(join(sandbox, 'lib')), { code: 'ENOENT' });
  const { stdout } = await run(process.execPath, [npm, 'pack', '--json'], {
    cwd: sandbox, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
  // npm 会把 prepack 的构建日志写到 JSON 前面，仅解析独立数组起始行。
  const jsonStart = stdout.search(/^\[\s*$/m);
  assert.ok(jsonStart >= 0, 'npm pack 必须返回文件清单');
  const [pack] = JSON.parse(stdout.slice(jsonStart));
  const files = new Set(pack.files.map(file => file.path));
  const manifest = JSON.parse(await readFile(join(sandbox, 'package.json'), 'utf8'));
  assert.equal(pack.version, manifest.version);
  for (const name of ['index', 'client', 'core', 'readonly-discovery', 'plugin-updater', 'repositories', 'repository-updates', 'skills-sh-catalog', 'catalog-skill', 'clawhub-catalog']) {
    assert.ok(files.has(`lib/${name}.js`), `发布包必须包含 ${name} 产物`);
  }
  assert.ok(files.has('cordis.patch.yml'), '发布包必须包含宿主注册补丁');
  assert.ok(![...files].some(file => /^(?:src|test|scripts)\//.test(file) || file.endsWith('.ts') || file === 'tsconfig.json'), '发布包不含源码、测试和开发配置');
  await run(process.execPath, ['--input-type=module', '-e', "await import('./lib/index.js')"], { cwd: sandbox, windowsHide: true });
  console.log('干净目录打包通过：自动生成全部十项产物，发布入口可加载，无开发文件。');
} finally {
  // 先移除依赖链接，清理临时目录绝不递归进入真实 node_modules。
  await rm(join(sandbox, 'node_modules'), { force: true, recursive: process.platform === 'win32' });
  await rm(sandbox, { recursive: true, force: true });
}
