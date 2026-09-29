/**
 * dsh-raw-html —— 前端渲染补丁的启动自检（自愈）
 *
 * 为什么由插件负责：本插件的渲染能力**不在插件里**，而在 dsh 前端 bundle
 * （`@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js`）——由 `patch/install-all.cjs`
 * 就地注入 `window.__vcpStable` 等标记。dsh 每次更新/重装都会整树覆盖前端目录，
 * 补丁随之消失，表现就是「消息里的 HTML 卡片退回源码」。补丁既然是本插件的运行前提，
 * 保证它在位就是插件自己的职责——所以本模块在插件挂载时做一次**只读检测**，
 * 缺失才补，并且**任何失败都只写日志、绝不影响插件本身加载**。
 *
 * 设计约束（实测踩出来的）：
 *   - 只读优先：bundle 里已有标记就立刻返回，不做任何写操作；
 *   - 不猜路径：候选目录按「运行中的 dsh 实际位置」推，命中多个就都补（每个都是合法前端产物）；
 *   - 不用 `process.execPath` 直接跑脚本：Electron 宿主下那会再拉起一个 App 实例，
 *     必须带 `ELECTRON_RUN_AS_NODE=1`；
 *   - 有超时：安装器卡住不能拖死宿主启动；
 *   - 可关闭：环境变量 `DSH_RAW_HTML_NO_AUTOPATCH=1`（或 0/false 之外的任意真值写法见下）。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** 插件根目录（本文件在 lib/ 下）。 */
const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
/** 插件自带的一键安装器。 */
const INSTALLER = path.join(PLUGIN_ROOT, 'patch', 'install-all.cjs')
/** 补丁存在的判据（install-v6 注入模块的固定标记）。 */
const PATCH_MARK = 'window.__vcpStable'
/** 前端 entry 文件名形态。 */
const INDEX_RE = /^index-[\w-]+\.js$/
/** 单次安装器超时（正常约 1~2 秒）。 */
const INSTALL_TIMEOUT_MS = 120_000
/** 关闭自愈的环境变量。 */
const OFF_ENV = 'DSH_RAW_HTML_NO_AUTOPATCH'

/** 环境变量是否显式关闭（1/true/yes/on 视为关闭）。 */
function disabledByEnv(env = process.env) {
  const raw = env[OFF_ENV]
  if (raw === undefined || raw === '') return false
  return !/^(0|false|no|off)$/i.test(String(raw).trim())
}

/**
 * 候选前端 assets 目录（按可能性排序，去重）。
 * 三个来源对应三种跑法：DSH Desktop 解包目录、CLI/npm 全局安装、profile 提升目录。
 * @param {NodeJS.ProcessEnv} env - 环境变量（测试可注入）。
 * @param {string} execPath - 宿主可执行文件（测试可注入）。
 * @returns {string[]} 目录列表（存在与否由调用方判断）。
 */
export function candidateAssetDirs(env = process.env, execPath = process.execPath) {
  const dirs = []
  const add = (value) => {
    if (typeof value === 'string' && value.length > 0 && !dirs.includes(value)) dirs.push(value)
  }
  const pkgTail = ['node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets']

  // 1) DSH Desktop：<exeDir>/resources/app/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets
  if (execPath) add(path.join(path.dirname(execPath), 'resources', 'app', ...pkgTail))

  // 2) CLI / npm 全局安装：从「运行中的 dsh 入口」解析包位置
  const entry = process.argv[1]
  if (entry) {
    try {
      const require = createRequire(entry)
      const pkg = require.resolve('@deepseek-ai/dsh-web-frontend/package.json')
      add(path.join(path.dirname(pkg), 'dist', 'assets'))
    } catch {
      // 解析不到就跳过（不是 CLI 跑法）。
    }
  }

  // 3) profile 目录（插件按 profile 注册，前端包可能提升到这里）
  const home = (env.HOME || env.USERPROFILE || os.homedir() || '').trim()
  if (home) {
    add(path.join(home, '.dsh', 'profiles', 'web', ...pkgTail))
    add(path.join(home, '.dsh', 'profiles', ...pkgTail))
  }
  return dirs
}

/**
 * 找出「存在但未打补丁」的前端 entry。
 * @param {string[]} dirs - 候选目录。
 * @returns {Promise<string[]>} 需要补丁的文件路径。
 */
export async function findUnpatchedEntries(dirs) {
  const targets = []
  for (const dir of dirs) {
    let names = []
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const entry of names.filter((n) => INDEX_RE.test(n))) {
      const file = path.join(dir, entry)
      try {
        const text = await fs.readFile(file, 'utf8')
        if (!text.includes(PATCH_MARK)) targets.push(file)
      } catch {
        // 读不到就跳过（权限/竞态），不视为需要补丁。
      }
    }
  }
  return targets
}

/**
 * 用插件自带的安装器补一个 bundle。
 * @param {string} file - bundle 路径。
 * @param {number} timeoutMs - 超时。
 * @returns {Promise<{ok: boolean, code?: number|null, reason?: string, out?: string}>}
 */
function runInstaller(file, timeoutMs = INSTALL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!existsSync(INSTALLER)) {
      resolve({ ok: false, reason: 'installer-missing' })
      return
    }
    const env = { ...process.env }
    // Electron 宿主：同一个可执行文件必须以「纯 Node」模式运行，否则会再拉起一个 App 实例。
    if (process.versions && process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
    let child
    try {
      child = spawn(process.execPath, [INSTALLER, file], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      resolve({ ok: false, reason: 'spawn-failed', out: String(error && error.message) })
      return
    }
    let out = ''
    const capture = (chunk) => { out += chunk.toString('utf8') }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 已退出 */ }
      resolve({ ok: false, reason: 'timeout', out: out.trim().slice(-400) })
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: 'spawn-failed', out: String(error && error.message) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, code, out: out.trim().slice(-400) })
    })
  })
}

/**
 * 启动自检：前端补丁缺失就补上。永不抛出、永远不影响插件加载。
 * @param {{dirs?: string[], timeoutMs?: number, env?: NodeJS.ProcessEnv, execPath?: string, log?: (line: string) => void}} [options]
 * @returns {Promise<{skipped?: string, checked?: number, patched?: Array<{file: string, ok: boolean, reason?: string, out?: string}>}>}
 */
export async function ensureFrontendPatch(options = {}) {
  const { dirs, timeoutMs = INSTALL_TIMEOUT_MS, env = process.env, execPath = process.execPath } = options
  const log = options.log || ((line) => console.log(line))
  const warn = options.log || ((line) => console.warn(line))
  if (disabledByEnv(env)) return { skipped: 'env' }
  try {
    const targetDirs = dirs || candidateAssetDirs(env, execPath)
    const targets = await findUnpatchedEntries(targetDirs)
    if (targets.length === 0) return { checked: targetDirs.length, patched: [] }
    const patched = []
    for (const file of targets) {
      const result = await runInstaller(file, timeoutMs)
      patched.push({ file, ok: result.ok, reason: result.reason, out: result.out })
      if (result.ok) {
        log(`[raw-html] 前端渲染补丁缺失，已自动补上：${file}（页面若已打开，请 Ctrl+F5 刷新）`)
      } else {
        warn(`[raw-html] 前端渲染补丁缺失且自动补丁失败（${result.reason || 'exit ' + result.code}）：${file}`)
        warn(`[raw-html] 可手动执行：node "${INSTALLER}" "${file}"`)
      }
    }
    return { checked: targetDirs.length, patched }
  } catch (error) {
    warn(`[raw-html] 启动自检异常（不影响插件）：${error && error.message}`)
    return { checked: 0, patched: [], error: String(error && error.message) }
  }
}
