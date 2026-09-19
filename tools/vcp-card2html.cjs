#!/usr/bin/env node
/**
 * vcp-card2html —— 把 VCP 卡片 HTML 渲染成**独立 .html 文件**（方案B 通道）
 * ==========================================================================
 * 为什么需要它：dsh-web-frontend 0.1.5-rc.2 的前端目前无法在消息内渲染 HTML
 * （上游适配 PR 进行中：https://github.com/plolpl789/dsh-raw-html/pull/9）。
 * 本工具绕过"消息内渲染"，直接复用插件自己的渲染模块（patch/v6-inject.js）
 * 产出可独立打开的 HTML —— 视觉内容照常能够落地与验收。
 *
 * 用法：
 *   node tools/vcp-card2html.cjs <卡片.html或.txt> [输出.html]
 *   echo '<div id="vcp-root">…</div>' | node tools/vcp-card2html.cjs - out.html
 *   node tools/vcp-card2html.cjs <卡片> out.html --msg-id 7      # 指定 #vcp-msg-N
 *
 * 依赖：只能在本机（有 dsh 的 domino）环境运行 —— 与 tests/verify-v7.cjs 同源做法。
 * 字体：卡片里用到的 Lanxi-* 字体由 dsh-raw-html 的 /fonts 服务提供；独立文件若同机
 *       通过 dsh web 打开则可用，直接双击打开时会回退到系统字体（不影响结构验收）。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.join(__dirname, '..')
const MODULE = [
  path.join(ROOT, 'patch', 'v6-inject.js'),
  path.join(ROOT, 'v6-inject.js'),
  path.join(ROOT, '..', 'v6-inject.js'),
  path.join(ROOT, '..', '..', 'v6-inject.js'),
].find((p) => fs.existsSync(p))
if (!MODULE) { console.error('✗ 找不到 v6-inject.js'); process.exit(1) }

function loadDomino() {
  const cands = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@mixmark-io', 'domino'),
    path.join(process.cwd(), 'node_modules', '@mixmark-io', 'domino'),
  ]
  for (const c of cands) { try { if (fs.existsSync(c)) return require(c) } catch { } }
  return null
}

function readInput(arg) {
  if (arg === '-' || arg === undefined) {
    try { return fs.readFileSync(0, 'utf8') } catch { return '' }
  }
  return fs.readFileSync(arg, 'utf8')
}

function main() {
  const argv = process.argv.slice(2)
  const msgIdIdx = argv.indexOf('--msg-id')
  const msgId = msgIdIdx >= 0 ? argv[msgIdIdx + 1] : '1'
  const positional = msgIdIdx >= 0 ? argv.filter((a, i) => i !== msgIdIdx && i !== msgIdIdx + 1) : argv.slice()
  const inArg = positional[0]
  const outArg = positional[1]

  let raw = readInput(inArg)
  if (!raw.trim()) { console.error('✗ 输入为空（用法见文件头）'); process.exit(1) }
  const start = raw.indexOf('<div id="vcp-root"')
  if (start < 0) { console.error('✗ 输入里没有 <div id="vcp-root"> 卡片'); process.exit(1) }
  const title = (/<title>([^<]*)<\/title>/.exec(raw) || [, 'VCP 卡片'])[1]
  const card = raw.slice(start)

  const domino = loadDomino()
  if (!domino) { console.error('✗ 需要 @mixmark-io/domino（dsh 自带）。请在有 dsh 的机器上运行。'); process.exit(1) }

  /** 轻量 HTML 序列化器（把 React 元素树写成 HTML 字符串；不依赖 react-dom 安装） */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stylify = (st) => Array.isArray(st) ? st.filter(Boolean).map(stylify).join('') : (st && typeof st === 'object'
    ? Object.keys(st).map((k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + st[k]).join(';') : String(st || ''))
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])
  function serialize(node) {
    if (node === null || node === undefined || node === false || node === true) return ''
    if (typeof node === 'string' || typeof node === 'number') return esc(node)
    if (Array.isArray(node)) return node.map(serialize).join('')
    if (typeof node === 'function') return ''
    if (typeof node !== 'object') return esc(String(node))
    const { type, props = {}, kids = [] } = node
    const children = (kids && kids.length ? kids : (props.children !== undefined ? [].concat(props.children) : []))
      .map(serialize).join('')
    if (typeof type === 'function') return serialize({ __el: true, type: 'span', props, kids })   // 组件：降级为 span
    if (typeof type === 'symbol') return children                                              // Fragment
    const tag = String(type || 'div')
    const attrs = []
    for (const k of Object.keys(props)) {
      if (k === 'children' || k === 'key' || k === 'ref' || k === 'dangerouslySetInnerHTML') continue
      const v = props[k]
      if (v === undefined || v === null) continue
      if (k === 'style') { const s2 = stylify(v); if (s2) attrs.push('style="' + esc(s2) + '"'); continue }
      if (k === 'className') { attrs.push('class="' + esc(v) + '"'); continue }
      attrs.push(k + '="' + esc(v) + '"')
    }
    const inner = props.dangerouslySetInnerHTML ? String(props.dangerouslySetInnerHTML.__html || '')
      : (VOID.has(tag) ? '' : children)
    return '<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + inner + (VOID.has(tag) ? '' : '</' + tag + '>')
  }

  // 运行模块（jsx 用最小桩；渲染产物由 serialize 输出）
  const el = (type, props, kids) => ({ __el: true, type, props: props || {}, kids: kids || [] })
  const jsx = { Fragment: Symbol.for('Fragment'), jsx: (t, p) => el(t, p), jsxs: (t, p) => el(t, p), createElement: (t, p, ...k) => el(t, p, k) }
  const React = { createElement: (t, p, ...k) => el(t, p, k), Fragment: jsx.Fragment }

  const doc = domino.createDocument('<!doctype html><html><head></head><body></body></html>')
  const store = {}
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) }, removeItem: (k) => { delete store[k] } }
  const DOMParserStub = function () { this.parseFromString = (h) => domino.createDocument(h) }
  const win = {
    document: doc, DOMParser: DOMParserStub, localStorage, console: { warn() { }, log() { }, debug() { }, error() { } },
    navigator: { userAgent: 'card2html' }, location: { href: 'http://card2html/' }, performance: { now: () => Date.now() },
    setTimeout: () => 0, clearTimeout: () => { }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => { },
    MutationObserver: function () { this.observe = () => { }; this.disconnect = () => { } },
    ResizeObserver: function () { this.observe = () => { }; this.disconnect = () => { } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }),
  }
  win.window = win; win.globalThis = win; win.self = win

  const wg = (sv) => { const o = {}; for (const d of String(sv).split(';')) { const i = d.indexOf(':'); if (i < 0) continue; o[d.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = d.slice(i + 1).trim() } return o }
  const vc = (node, key) => {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1) return null
    const props = { key }
    for (const c of Array.from(node.attributes || [])) {
      if (/^on/i.test(c.name)) continue
      if (c.name === 'style') { props.style = wg(c.value); continue }
      if (c.name === 'class') { props.className = c.value; continue }
      props[c.name] = c.value
    }
    const kids = []
    for (const ch of Array.from(node.childNodes || [])) { const k = vc(ch, kids.length); if (k !== null) kids.push(k) }
    return React.createElement(node.localName, props, ...kids)
  }

  const mod = fs.readFileSync(MODULE, 'utf8').trim()
  const sandbox = {
    window: win, document: doc, DOMParser: DOMParserStub, localStorage, console: win.console,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame, MutationObserver: win.MutationObserver, ResizeObserver: win.ResizeObserver,
    navigator: win.navigator, location: win.location, performance: win.performance,
    getComputedStyle: win.getComputedStyle, matchMedia: win.matchMedia,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, COMMENT_NODE: 8 }, f: jsx, vc, wg,
  }
  sandbox.globalThis = sandbox; sandbox.self = sandbox
  vm.createContext(sandbox)
  vm.runInContext('(function(f, vc, wg, window, document, DOMParser, Node){\n' + mod + '\n})', sandbox, { filename: 'v6-inject.js' })(jsx, vc, wg, win, doc, DOMParserStub, sandbox.Node)
  const stable = win.__vcpStable || sandbox.__vcpStable
  if (!stable || typeof stable.render !== 'function') { console.error('✗ 渲染模块未就绪'); process.exit(1) }

  // 让 #vcp-msg-N 与我们指定的编号一致：临时替换 scope 前缀
  const tree = stable.render(card, false)
  if (tree === null) { console.error('✗ 模块返回 null（卡片结构不完整？）'); process.exit(1) }
  let body = serialize(tree)
  if (msgId !== '1') body = body.split('vcp-msg-1').join('vcp-msg-' + msgId)

  const out = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>
html,body{margin:0;background:#17181c}
body{padding:28px;font-family:system-ui,'Microsoft YaHei',sans-serif}
.vcp-file-note{color:#8b949e;font-size:12px;font-family:Consolas,monospace;margin-bottom:14px}
.vcp-file-note b{color:#00FFFF;font-weight:400}
</style></head><body>
<div class="vcp-file-note">VCP 卡片独立文件（方案B 通道）· 由 v6 渲染模块生成 · 同机可经 <b>dsh web</b> 打开以加载 Lanxi 字体</div>
${body}
</body></html>`
  const outPath = path.resolve(outArg || (path.basename(inArg || 'card', path.extname(inArg || 'card')) + '.html'))
  fs.writeFileSync(outPath, out, 'utf8')
  console.log('✓ 已生成: ' + outPath + '  (' + out.length + ' 字符)')
}

main()
