'use strict'
/**
 * 定位 jsdom（跨机器可移植的测试依赖）。
 *
 * 解析顺序：JSDOM_PATH 环境变量 → 本仓库 node_modules → 常见借用位置。
 * 历史原因各测试硬编码 Windows 作者机路径（G:/AI/...），换机即 MODULE_NOT_FOUND；
 * 统一走本模块后，任意机器 `npm i -D jsdom` 或设 JSDOM_PATH 即可跑全套测试。
 */
const os = require('node:os')
const path = require('node:path')

module.exports = function loadJsdom() {
  const candidates = [
    process.env.JSDOM_PATH,
    'jsdom',
    path.join(os.homedir(), '.hermes', 'hermes-agent', 'node_modules', 'jsdom'),
  ].filter(Boolean)
  const tried = []
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch (e) {
      tried.push(`${candidate} (${e.code || e.message})`)
    }
  }
  throw new Error(`找不到 jsdom。请在本仓库执行 npm i -D jsdom，或设 JSDOM_PATH 指向 jsdom 包目录。\n已尝试：\n  ${tried.join('\n  ')}`)
}
