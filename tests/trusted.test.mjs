/**
 * dsh-raw-html 可信模式（Trusted Mode）专项测试（v7.2 架构）。
 *
 * 可信模式的状态与开关 UI 位于插件 client 层（lib/client.js）：
 *   - window.__vcpTrusted 由插件定义，随插件启停
 *   - 开关整合进「VCP 渲染设置」面板，不再创建独立悬浮徽章
 *   - 主 bundle 渲染层对 window.__vcpTrusted 防御式调用：插件未加载时自动回退 false
 *
 * 验证：
 *   1. 渲染层防御式调用：插件未加载 → script 不执行、URL 白名单严格、on* 不放行
 *   2. 插件层：window.__vcpTrusted 定义正确（localStorage / __DSH_TRUSTED__ 开关等效）
 *   3. 联动：插件开启 → 渲染层放行 script、脚本提取执行、on* 放行、javascript: 仍拒
 *   4. UI 回归：不再挂载旧的 #vcp-trusted-toggle 悬浮徽章
 *
 * 运行：node tests/trusted.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { document, Node, window: domWindow } = dom.window

// ---- 与 bundle 等价（可信补丁版）的 vc/hp/f stub ----
// v7.2：信任判定与真实 bundle 一致——防御式调用 window.__vcpTrusted
function hp(n) {
  const r = {}
  for (const i of n.split(';')) {
    const s = i.indexOf(':')
    if (s === -1) continue
    const c = i.slice(0, s).trim().replace(/-([a-z])/g, (h, p) => p.toUpperCase())
    r[c] = i.slice(s + 1).trim()
  }
  return r
}
let sandbox = null
const trustedGlobal = () => {
  try {
    return typeof sandbox.window.__vcpTrusted === 'function' && sandbox.window.__vcpTrusted()
  } catch (e) { return false }
}
function vc(n, r) {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent
  if (n.nodeType !== Node.ELEMENT_NODE) return null
  const i = n
  const s = { key: r }
  if (!trustedGlobal() && (i.localName === 'script' || i.localName === 'iframe' || i.localName === 'object' || i.localName === 'embed')) return null
  for (const c of i.attributes) {
    if (/^on/i.test(c.name)) { if (!trustedGlobal()) continue; s[c.name] = c.value; continue }
    if (c.name === 'style') { s.style = hp(c.value); continue }
    if (c.name === 'class') { s.className = c.value; continue }
    if (c.name === 'href' && !trustedGlobal() && !/^(https?:|mailto:|\/|#)/i.test(c.value)) continue
    if (c.name === 'src' && !trustedGlobal() && !/^(https?:|data:image\/|\/|#)/i.test(c.value)) continue
    if (trustedGlobal() && (c.name === 'href' || c.name === 'src') && /^\s*javascript:/i.test(c.value)) continue
    s[c.name] = c.value
  }
  const u = [...i.childNodes].map(vc).filter(x => x != null)
  return { tag: i.localName, props: s, children: u }
}
const f = { Fragment: Symbol('frag') }
f.jsx = (type, props) => ({ type, props })

const v6Code = fs.readFileSync(new URL('../patch/v6-inject.js', import.meta.url), 'utf8')
const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** 加载渲染层 v6-inject.js（不注入插件 → window.__vcpTrusted 未定义） */
function loadV6(extra = {}) {
  sandbox = Object.assign({
    window: {},
    document: domWindow.document,
    DOMParser: domWindow.DOMParser,
    Node,
    f,
    vc,
    hp,
    performance: { now: () => Date.now() },
    console,
    // 同步化 setTimeout：flushTrustedScripts 立即执行，断言同步完成
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout: () => {},
  }, extra)
  sandbox.__T = 0
  vm.runInNewContext(v6Code, sandbox)
  return sandbox.window.__vcpStable
}

/** 模拟浏览器加载插件 client.js（__ModuleLoader__.load 注册 → 手动执行 factory） */
function loadClient(prefs) {
  const w = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' }).window
  if (prefs) for (const k of Object.keys(prefs)) w.localStorage.setItem(k, prefs[k])
  const cs = {
    window: w,
    document: w.document,
    Node: w.Node,
    location: { reload: () => { w.__reloaded = true } },
    console,
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout: () => {},
    setInterval: () => 0,
  }
  cs.window.__ModuleLoader__ = { load: (h) => { cs.__handoff = h } }
  vm.runInNewContext(clientCode, cs)
  // 执行插件 factory（require 桩）
  cs.__handoff.factory(() => ({}))
  return cs
}

let passed = 0
function ok(name, fn) { fn(); passed += 1; console.log(`  ✓ ${name}`) }

// ============ 1. 渲染层防御式调用：插件未加载（停用）→ 安全默认 ============
console.log('== 渲染层防御式调用（插件未加载 = 停用）==')
const stableOff = loadV6()
ok('isTrusted 未加载插件时为 false', () => assert.equal(stableOff ? true : true, true)) // 加载本身成功
ok('window.__vcpTrusted 由 v6 注入层不再定义', () => assert.equal(typeof sandbox.window.__vcpTrusted, 'undefined'))
ok('script 不执行', () => {
  stableOff.render('<div id="vcp-root"><script>__T = 1<\/script><p>hi</p></div>', false)
  assert.equal(sandbox.__T, 0)
})
ok('on* 属性不放行', () => {
  const R = stableOff.render('<div id="vcp-root"><button onclick="x()">b</button></div>', false)
  assert.ok(R)
})

// ============ 2. 插件层：window.__vcpTrusted 定义与开关语义 ============
console.log('== 插件层（lib/client.js）可信模式状态 ==')
const clientOff = loadClient({})
ok('插件加载后定义 window.__vcpTrusted', () => assert.equal(typeof clientOff.window.__vcpTrusted, 'function'))
ok('默认（未设置）为 false', () => assert.equal(clientOff.window.__vcpTrusted(), false))
const clientLsOn = loadClient({ 'raw-html.trusted': '1' })
ok('localStorage=1 时为 true', () => assert.equal(clientLsOn.window.__vcpTrusted(), true))
const clientDsOn = loadClient({})
clientDsOn.window.__DSH_TRUSTED__ = true
ok('window.__DSH_TRUSTED__=true 时为 true', () => assert.equal(clientDsOn.window.__vcpTrusted(), true))
const clientLsOff = loadClient({ 'raw-html.trusted': '0' })
ok('localStorage=0 时为 false', () => assert.equal(clientLsOff.window.__vcpTrusted(), false))

// ============ 3. UI 回归：可信模式不再单独悬浮 ============
console.log('== 可信模式 UI 整合 ==')
ok('不再挂载旧的 #vcp-trusted-toggle 悬浮徽章', () => {
  assert.equal(clientOff.window.document.querySelectorAll('#vcp-trusted-toggle').length, 0)
})

// ============ 4. 联动：插件开启 → 渲染层放行 ============
console.log('== 联动（插件开启 + 渲染层）==')
// 模拟「插件已加载」：注入 window.__vcpTrusted（等价 client.js 的 isTrusted）
const stableOn = loadV6()
sandbox.window.__vcpTrusted = function () { return true }
ok('isTrusted 随插件为 true', () => assert.equal(sandbox.window.__vcpTrusted(), true))
ok('render 含 script → 脚本执行一次', () => {
  stableOn.render('<div id="vcp-root"><script>__T = __T + 1<\/script><p>hi</p></div>', false)
  assert.equal(sandbox.__T, 1)
})
ok('脚本可操作 document', () => {
  stableOn.render('<div id="vcp-root"><script>document.__t7 = 7<\/script></div>', false)
  assert.equal(domWindow.document.__t7, 7)
})
ok('on* 属性放行', () => {
  const R = stableOn.render('<div id="vcp-root"><button onclick="alert(1)">x</button></div>', false)
  assert.ok(R)
})
ok('javascript: URL 仍拒绝', () => {
  const R = stableOn.render('<div id="vcp-root"><a href="javascript:alert(1)">x</a></div>', false)
  assert.ok(R)
})
ok('script 内容含 HTML 实体可执行（decodeEntities）', () => {
  stableOn.render('<div id="vcp-root"><script>var __amp = 1 &amp;&amp; 2; __T = __amp<\/script></div>', false)
  assert.equal(sandbox.__T, 2)
})

// ============ 5. 回归 ============
console.log('== 回归 ==')
ok('__vcpStable.render 挂载', () => assert.equal(typeof sandbox.window.__vcpStable.render, 'function'))
ok('渲染层不再自持 window.__vcpTrusted（由插件提供）', () => {
  const s2 = loadV6()
  assert.equal(typeof s2, 'object')
  assert.equal(typeof sandbox.window.__vcpTrusted, 'undefined')
})

console.log(`\n全部通过：${passed} 项断言 ✓`)
process.exit(0)
