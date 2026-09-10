#!/usr/bin/env node
/**
 * dsh-raw-html —— v6 模块更新脚本。
 *
 * 场景：bundle 已注入旧版 v6-inject.js（v6.15），本脚本把注入的模块
 * 【整段替换】为磁盘上 patch/v6-inject.js 的最新版（无需回滚重打）。
 *
 * 原理：bundle 中注入格式为 `}` + VC_INJECT + `;function vc(n,r){`。
 * 定位「v6 模块注释头」与「;function vc(n,r){」两个边界，夹取旧模块整段替换。
 *
 * 用法：
 *   node patch/update-v6-inject.cjs [bundle路径]
 * 备份：同目录 index-*.js.bak-v6u-<时间戳>；健康检查失败自动回滚。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function findBundle() {
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null
  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    const assets = path.join(d, 'dist', 'assets')
    if (!fs.existsSync(assets)) return
    for (const f of fs.readdirSync(assets)) {
      if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
    }
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  // POSIX（Linux/macOS）：$DSH_HOME 或 ~/.dsh
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  addDir(path.join(dshHome, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

const file = findBundle()
if (!file) {
  console.error('[v6u] 未找到 bundle')
  process.exit(1)
}

let t = fs.readFileSync(file, 'utf8')

// 新模块 = 磁盘 v6-inject.js 全文
let newInject = ''
try {
  newInject = fs.readFileSync(path.join(__dirname, 'v6-inject.js'), 'utf8')
} catch (e) {
  console.error('[v6u] 读取 v6-inject.js 失败：', e.message)
  process.exit(1)
}

// 定位旧模块边界（优先新格式 START/END 标记，兼容旧格式 dsh-raw-html v6 注释头）
const END_MARK = '/*__DSH_V6_INJECT_END__*/'
const marker = t.indexOf('/*__DSH_V6_INJECT_START__*/')
let modStart = -1
let vcDef = -1
if (marker !== -1) {
  modStart = marker
  const endIdx = t.indexOf(END_MARK, modStart)
  if (endIdx !== -1) {
    let end = endIdx + END_MARK.length
    // END 标记后的换行一并纳入替换区间：新模块自带结尾换行，若不吞掉旧换行，
    // 每次重跑都会多积一个换行（bundle 每次 +1 字节，幂等失效）。
    while (t[end] === '\n' || t[end] === '\r') end += 1
    vcDef = end
  }
} else {
  const legacy = t.indexOf('dsh-raw-html v6')
  if (legacy !== -1) {
    modStart = t.lastIndexOf('/**', legacy)
    vcDef = t.indexOf(';function vc(n,r){')
  }
}
if (modStart === -1 || vcDef === -1 || vcDef <= modStart) {
  console.error('[v6u] 边界定位失败（modStart=%d vcDef=%d），中止', modStart, vcDef)
  process.exit(1)
}

const oldLen = vcDef - modStart
const newT = t.slice(0, modStart) + newInject + t.slice(vcDef)

// 幂等保护：新模块已注入（内容相同）时跳过
if (newT === t) {
  console.log('[v6u] 模块已是最新，无需更新')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const bak = `${file}.bak-v6u-${stamp}`
fs.copyFileSync(file, bak)
fs.writeFileSync(file, newT, 'utf8')

console.log(`[v6u] 模块已更新：旧 ${oldLen} 字符 → 新 ${newInject.length} 字符`)
console.log(`[v6u] 文件: ${file}`)
console.log(`[v6u] 备份: ${bak}`)

try {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  console.log('[v6u] 健康检查通过：node --check OK')
} catch (e) {
  fs.copyFileSync(bak, file)
  console.error('[v6u] 健康检查失败，已回滚到备份！')
  process.exit(1)
}
console.log('[v6u] 刷新浏览器即可生效（Ctrl+F5）')
