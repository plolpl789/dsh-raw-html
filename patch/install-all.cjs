#!/usr/bin/env node
/**
 * dsh-raw-html —— 一键安装器（v7.2 · agent 友好）
 *
 * 依次执行三步补丁，把「HTML 渲染 + SVG/图表/公式 + 可信模式」全部装进 dsh 前端：
 *
 *   1. install-v6.cjs     —— 渲染能力 v6 全量补丁（case"html" 三态化 + case"code" 围栏兜底
 *                            + vc/Xu 属性循环 + v6-inject 稳定区模块：SVG 卡片 / Mermaid 图表 /
 *                            KaTeX 公式 / 流式固化），新旧前端（vc / Xu）代际自动适配
 *   2. update-v6-inject.cjs—— v6 渲染模块就地更新至最新（已装旧版 v6 的用户自动升级；
 *                            全新安装时内容相同自动跳过）
 *   3. trusted-patch.cjs  —— 可信模式 vc/Xu 层条件放行（script/iframe/object/embed 按
 *                            window.__vcpTrusted 放行，默认关闭 = 安全），新旧前端双锚点
 *   4. install-v7.cjs     —— 【代际兼容 · best-effort】dsh-web-frontend 0.1.5-rc.2+ 使用
 *                            react-markdown 风格渲染器（B3/c8/wg 锚点组），v6 锚点在该前端上
 *                            0 命中；v7 负责这一代（三态化 + 属性循环 + 两条解析入口的卡内
 *                            空行压缩 + 孤片兜底）。目标不是该代时安全跳过，不影响 v6 结果。
 *
 * 幂等安全：两个子脚本各自幂等（已打补丁自动跳过）；锚点不匹配时子脚本安全中止、
 * 不写入任何修改，本脚本随之中止并提示。每一步都带备份 + node --check 健康检查。
 *
 * 用法（人 & agent 通用）：
 *   node patch/install-all.cjs                     # 自动探测 dist bundle
 *   node patch/install-all.cjs <bundle路径>         # 指定 bundle（多环境/多 profile）
 *
 * 完成后：重启 dsh 服务 → 浏览器强刷（Ctrl+F5）→ 打开「</>」开关即可使用。
 */
'use strict'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const STEPS = [
  { name: '渲染能力（v6 全量补丁 · HTML/SVG/图表/公式）', script: 'install-v6.cjs' },
  { name: '渲染模块升级（v6-inject 就地更新至最新，幂等）', script: 'update-v6-inject.cjs' },
  { name: '可信模式（vc/Xu 层条件放行 · 默认关闭保安全）', script: 'trusted-patch.cjs' },
]

/**
 * 代际兼容步骤（best-effort）：
 *   ① install-v7.cjs —— dsh-web-frontend 0.1.5-rc.2+ 的渲染器换成 react-markdown 风格
 *      （`B3` / `c8` / `wg` 锚点组），v6 锚点在该前端上 0 命中。v7 负责这一代：
 *      case"html" 三态化 + 属性循环适配 + 两条解析入口的卡内空行压缩 + 孤片兜底。
 *   ② 若目标 bundle 不是该代结构，v7 会安全中止（脚本自身不写入、本步骤跳过），
 *      因此在 v6 已成功的旧前端上不会造成任何影响。
 */
const OPTIONAL_STEPS = [
  { name: 'v7 代适配（dsh-web-frontend 0.1.5-rc.2+ · 不匹配时自动跳过）', script: 'install-v7.cjs' },
]

const bundleArg = process.argv[2] || ''
const scriptDir = __dirname

const has = (f) => {
  try { return require('node:fs').existsSync(path.join(scriptDir, f)) } catch { return false }
}

console.log('==============================================')
console.log(' dsh-raw-html 一键安装器（v7.2）')
console.log('==============================================')
if (bundleArg) console.log(` 目标 bundle: ${bundleArg}`)

for (let i = 0; i < STEPS.length; i++) {
  const step = STEPS[i]
  console.log(`\n[install-all] 步骤 ${i + 1}/${STEPS.length}：${step.name}`)
  const args = [path.join(scriptDir, step.script)]
  if (bundleArg) args.push(bundleArg)
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (r.error) {
    console.error(`[install-all] ✗ 步骤 ${i + 1} 执行异常：${r.error.message}`)
    console.error('[install-all] 请确认已安装 Node.js（node -v 可运行）。')
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`[install-all] ✗ 步骤 ${i + 1} 失败（退出码 ${r.status}）。`)
    console.error('[install-all]   子脚本已安全中止、未写入损坏产物；请按上面日志排查后重试。')
    process.exit(r.status || 1)
  }
  console.log(`[install-all] ✓ 步骤 ${i + 1} 完成`)
}

for (let i = 0; i < OPTIONAL_STEPS.length; i++) {
  const step = OPTIONAL_STEPS[i]
  if (!has(step.script)) continue
  console.log(`\n[install-all] 可选步骤 ${i + 1}/${OPTIONAL_STEPS.length}：${step.name}`)
  const args = [path.join(scriptDir, step.script)]
  if (bundleArg) args.push(bundleArg)
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (r.status === 0) { console.log(`[install-all] ✓ 可选步骤 ${i + 1} 完成`); continue }
  console.warn(`[install-all] ⚠ 可选步骤 ${i + 1} 未应用（退出码 ${r.status}）——目标前端不属于该代，已跳过，不影响前面的补丁。`)
}

console.log('\n==============================================')
console.log(' [install-all] ✓ 全部补丁就位！')
console.log(' 下一步：')
console.log('   1. 重启 dsh 服务')
console.log('   2. 浏览器强刷（Ctrl+F5）')
console.log('   3. 打开「</>」开关（渲染/美学）')
console.log('   4. 需要脚本能力时，点右下角「可信模式」徽章')
console.log(' 验证：DevTools console 可见 [vcp-stable] 日志；VCP 卡片正常渲染。')
console.log('==============================================')
