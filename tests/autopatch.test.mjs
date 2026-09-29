/**
 * 启动自检（自愈）自测 —— 无外部依赖：不装 jsdom、不需要真的 dsh bundle。
 *
 * 做法：造一份**第一代形态**的合成 bundle（`vc`/`hp` 那一套，这在仓库现有的任何安装器版本下
 * 都能被识别），把它当 `index-TEST.js` 放进临时目录，然后断言：
 *
 *   1. 检测：缺补丁的 entry 会被 findUnpatchedEntries 找出来；
 *   2. 自愈：ensureFrontendPatch 用插件自带的安装器把它补上，并落上判据标记；
 *   3. 只读：已打补丁时**不写任何东西**（第二次调用 patched 为空）；
 *   4. 可关：DSH_RAW_HTML_NO_AUTOPATCH 生效时直接跳过；
 *   5. 路径推理：DSH Desktop 的候选目录由 execPath 推出来。
 *
 * 运行：node tests/autopatch.test.mjs        （临时目录可用 VCP_TMP 覆盖）
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { candidateAssetDirs, ensureFrontendPatch, findUnpatchedEntries } from '../lib/autopatch.js'

const TMP = process.env.VCP_TMP || fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-autopatch-'))
fs.mkdirSync(TMP, { recursive: true })

/** 第一代压缩形态的最小合成 bundle（够安装器认出来即可）。 */
const GEN1_BUNDLE =
  '/* synthetic gen1 bundle */\n' +
  'function prev(){return 0}' +
  'function vc(n,r){if(n.nodeType===Node.TEXT_NODE)return n.textContent;' +
  'if(n.nodeType!==Node.ELEMENT_NODE)return null;const i=n,s={key:r};' +
  'for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=hp(c.value):s[c.name]=c.value;' +
  'const o=[...i.childNodes].map(vc);' +
  'return o.length===0?f.createElement(i.localName,s):f.createElement(i.localName,s,{children:o})}\n' +
  'function Z1(n,r,i){switch(n.type){case"text":return n.value;case"html":return n.value;case"code":return wp(n,r,i);}}\n'

let passed = 0
let failed = 0
async function ok(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  XX  ${name}\n      ${error.message}`)
  }
}

const bundle = path.join(TMP, 'index-TEST.js')
fs.writeFileSync(bundle, GEN1_BUNDLE, 'utf8')
console.log(`临时目录：${TMP}`)

await ok('检测：未打补丁的 entry 会被找出来', async () => {
  const targets = await findUnpatchedEntries([TMP])
  assert.deepEqual(targets, [bundle])
})

await ok('自愈：用插件自带安装器把补丁补上（exit 0 + 落上判据标记）', async () => {
  const result = await ensureFrontendPatch({ dirs: [TMP], log: () => {} })
  assert.equal(result.patched.length, 1, JSON.stringify(result))
  assert.equal(result.patched[0].ok, true, JSON.stringify(result.patched[0]))
  assert.ok(fs.readFileSync(bundle, 'utf8').includes('window.__vcpStable'), '补丁标记没落上')
})

await ok('只读：已打补丁时第二次调用不写任何东西', async () => {
  const before = fs.statSync(bundle).mtimeMs
  const beforeText = fs.readFileSync(bundle, 'utf8')
  const result = await ensureFrontendPatch({ dirs: [TMP], log: () => {} })
  assert.deepEqual(result.patched, [], JSON.stringify(result))
  assert.equal(fs.readFileSync(bundle, 'utf8'), beforeText, '文件被改动了')
  assert.equal(fs.statSync(bundle).mtimeMs, before, '文件 mtime 变了')
})

await ok('可关：DSH_RAW_HTML_NO_AUTOPATCH 生效时直接跳过', async () => {
  const other = path.join(TMP, 'index-OFF.js')
  fs.writeFileSync(other, GEN1_BUNDLE, 'utf8')
  const result = await ensureFrontendPatch({ dirs: [TMP], env: { DSH_RAW_HTML_NO_AUTOPATCH: '1' }, log: () => {} })
  assert.equal(result.skipped, 'env')
  assert.ok(!fs.readFileSync(other, 'utf8').includes('window.__vcpStable'), '关闭状态下仍写了补丁')
  fs.rmSync(other, { force: true })
})

await ok('路径推理：Desktop 候选目录从 execPath 推出', () => {
  const dirs = candidateAssetDirs({ HOME: 'C:\\Users\\demo', USERPROFILE: 'C:\\Users\\demo' }, 'C:\\Apps\\DSH Desktop\\DSH Desktop.exe')
  assert.ok(
    dirs.includes(path.join('C:\\Apps\\DSH Desktop', 'resources', 'app', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')),
    JSON.stringify(dirs),
  )
  assert.ok(dirs.some((d) => d.includes(path.join('.dsh', 'profiles', 'web'))), JSON.stringify(dirs))
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
