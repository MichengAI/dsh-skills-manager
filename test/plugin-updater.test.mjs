import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { handlePluginUpdateEscape, manualPluginUpdateCommand } from '../src/plugin-update-model.ts'
import { isDshCliEntry, isNewerVersion, isTrustedUpdateRequest, mergeMinimumReleaseAgeExclude, recordReleaseAgeExclude, PLUGIN_UPDATE_HEADER, resolveUpdateRuntime, shouldNotifyParent } from '../src/plugin-updater.ts'

test('技能管理器独立更新只接受同源专用请求', () => {
  assert.equal(isNewerVersion('0.1.40', '0.1.41'), true)
  assert.equal(isNewerVersion('0.1.40', '0.1.40'), false)
  assert.equal(isNewerVersion('0.1.0-rc.2', '0.1.0-rc.10'), true)
  assert.equal(isNewerVersion('0.1.0-rc.10', '0.1.0-rc.2'), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', host: '127.0.0.1:19387' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '192.168.1.8' } }), false)
  assert.equal(manualPluginUpdateCommand('web', '@michengai/dsh-skills-manager', '0.1.41'), 'dsh plugin --profile web add @michengai/dsh-skills-manager@0.1.41 --registry=https://registry.npmjs.org/')
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), true)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/other.js' } }, 'C:/tools/dsh'), false)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: 'other-cli', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), false)
})

test('技能更新弹窗消费 ESC，避免继续关闭底层设置页', () => {
  const calls = []
  assert.equal(handlePluginUpdateEscape({
    key: 'Escape',
    preventDefault: () => calls.push('prevent'),
    stopPropagation: () => calls.push('stop'),
    stopImmediatePropagation: () => calls.push('stopImmediate'),
  }, () => calls.push('close')), true)
  assert.deepEqual(calls, ['prevent', 'stop', 'stopImmediate', 'close'])
})

test('技能客户端与 Host 绑定自身更新入口', async () => {
  const client = await readFile(new URL('../src/client.ts', import.meta.url), 'utf8')
  const updateUi = await readFile(new URL('../src/plugin-update-ui.ts', import.meta.url), 'utf8')
  const updateModel = await readFile(new URL('../src/plugin-update-model.ts', import.meta.url), 'utf8')
  const host = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(client, /packageName: "@michengai\/dsh-skills-manager"/)
  assert.match(client, /titleRowSelector: "\.dssm-title-row"/)
  assert.match(client, /createIcon: createPluginUpdateIcon/)
  assert.match(client, /UPDATE_ICON_PATHS/)
  assert.match(client, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/)
  assert.doesNotMatch(client, /react-dom\/client/)
  assert.match(updateUi, /data-mpi-label/)
  assert.match(updateUi, /document\.addEventListener\("keydown", onKey, true\)/)
  assert.match(updateUi, /keyboard: false/)
  assert.match(updateUi, /zIndex: 1200/)
  assert.doesNotMatch(updateUi, /centered:\s*true/)
  assert.match(updateUi, /overflow-wrap:anywhere/)
  assert.match(updateUi, /className: "mpi-dialog"/)
  assert.match(updateUi, /className: "mpi-status"/)
  assert.match(updateUi, /className: "mpi-manual"/)
  assert.match(updateModel, /loading: phase === "updating"/)
  assert.doesNotMatch(updateUi, /mpi-overlay/)
  assert.doesNotMatch(updateModel, /settings\.includes\("Settings"\)/)
  assert.match(updateUi, /if \(version\.textContent !== versionLabel\)/)
  assert.match(updateUi, /color: "#e8b15a"/)
  assert.match(updateModel, /payload\.latestCheckFailed/)
  assert.match(host, /endpoint: "\/api\/michengai\/dsh-skills-manager\/update"/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /const notifyParent = shouldNotifyParent\(target\)/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /isDshCliEntry/)
})

test('官方 Desktop 在线更新指向 desktop profile，且不通知父进程', () => {
  const runtime = resolveUpdateRuntime({
    get(name) {
      if (name === 'profileContext') return {
        name: 'desktop',
        dir: 'D:\\profile\\desktop',
        packageManager: { command: 'D:\\Tools\\DeepSeek Harness\\DeepSeek Harness.exe', args: ['--expose-internals', 'D:\\runtime\\pnpm.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } },
      }
      return undefined
    },
  }, {
    argv: ['node', 'D:\\app\\dsh\\node_modules\\@deepseek-ai\\dsh-desktop-host\\lib\\index.js'],
    env: {},
    cwd: 'D:\\profile\\desktop',
    homeDir: 'C:\\Users\\YUJIYU',
  })
  assert.equal(runtime.profileName, 'desktop')
  assert.equal(runtime.canAutoUpdate, true)
  assert.equal(runtime.officialDesktop, true)
  assert.equal(shouldNotifyParent(runtime, () => {}), false)
})

test('自更新把刚安装的版本并进已有发布年龄白名单，不另起一行', () => {
  const created = mergeMinimumReleaseAgeExclude('packages:\n  - .\n', '@michengai/dsh-skills-manager@1.2.0')
  assert.match(created, /minimumReleaseAgeExclude:\n  - '@michengai\/dsh-skills-manager@1\.2\.0'\n/)
  assert.doesNotMatch(created, /minimumReleaseAgeExclude:\n  - '@michengai\/dsh-skills-manager'\n/)

  const merged = mergeMinimumReleaseAgeExclude(
    "minimumReleaseAgeExclude:\n  - '@michengai/dsh-skills-manager@1.1.19 || 1.1.21 || 1.1.22'\n  - keep@1.0.0\n",
    '@michengai/dsh-skills-manager@1.2.0',
  )
  assert.match(merged, /'@michengai\/dsh-skills-manager@1\.1\.19 \|\| 1\.1\.21 \|\| 1\.1\.22 \|\| 1\.2\.0'/)
  assert.match(merged, /keep@1\.0\.0/)
  assert.equal(merged.split('@michengai/dsh-skills-manager').length - 1, 1)
})

test('同名白名单多行先并进第一条，读不懂的块则停止更新', () => {
  const merged = mergeMinimumReleaseAgeExclude(
    "minimumReleaseAgeExclude:\n  - '@michengai/dsh-skills-manager@1.1.19'\n  - keep@1.0.0\n  - '@michengai/dsh-skills-manager@1.1.22'\n",
    '@michengai/dsh-skills-manager@1.2.0',
  )
  assert.match(merged, /'@michengai\/dsh-skills-manager@1\.1\.19 \|\| 1\.1\.22 \|\| 1\.2\.0'/)
  assert.equal(merged.split('@michengai/dsh-skills-manager').length - 1, 1)
  assert.match(merged, /keep@1\.0\.0/)
  assert.throws(() => mergeMinimumReleaseAgeExclude('minimumReleaseAgeExclude: [keep@1.0.0]\n', '@michengai/dsh-skills-manager@1.2.0'), /无法安全合并/)
})

test('合并白名单保留行内注释、CRLF 和文件结尾换行', () => {
  const merged = mergeMinimumReleaseAgeExclude(
    "minimumReleaseAgeExclude:\r\n  - '@michengai/dsh-skills-manager@1.1.19' # 保留\r\n  - keep@1.0.0\r\n",
    '@michengai/dsh-skills-manager@1.2.0',
  )
  assert.match(merged, /'@michengai\/dsh-skills-manager@1\.1\.19 \|\| 1\.2\.0' # 保留/)
  assert.ok(merged.includes('\r\n'))
  assert.equal(merged.at(-1), '\n')
  const noEol = mergeMinimumReleaseAgeExclude('packages:\n  - .', '@michengai/dsh-skills-manager@1.2.0')
  assert.equal(noEol.endsWith('\n'), true)
  assert.match(noEol, /'@michengai\/dsh-skills-manager@1\.2\.0'\n$/)
})

test('pluginManager 安装前先检查白名单，成功后才写入', async () => {
  const source = await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8')
  const start = source.indexOf('if (target.pluginManager !== void 0)')
  const branch = source.slice(start, source.indexOf('await runCliInstall', start))
  assert.match(branch, /await guardReleaseAgeExclude[\s\S]*installBundle[\s\S]*await recordReleaseAgeExclude/)
})

test('白名单先写临时文件再替换，不留下临时文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-age-'))
  try {
    await writeFile(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - .\nminimumReleaseAgeExclude:\n  - '@michengai/dsh-skills-manager@1.1.19' # 保留\n", 'utf8')
    await recordReleaseAgeExclude(dir, '@michengai/dsh-skills-manager@1.2.0')
    const text = await readFile(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(text, /1\.1\.19 \|\| 1\.2\.0' # 保留/)
    assert.deepEqual(await readdir(dir), ['pnpm-workspace.yaml'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
