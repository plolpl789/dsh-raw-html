/**
 * dsh-raw-html 渲染链路 smoke 测试。
 *
 * 用 jsdom 模拟浏览器环境，按 bundle 中的真实逻辑执行：
 *   DOMParser 解析 vcp-root → vc() 转 React 元素描述 → 断言结构/安全/交互。
 *
 * 依赖：jsdom（借用 VCPChat 项目 node_modules，路径见下；如迁移请更新）。
 * 运行：node tests/smoke.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { document, Node, window } = dom.window

// ---- 与 bundle 一致的 vc() 转换器（等价实现）----
function filterStyle(sv) {
  return sv
    .replace(/position\s*:\s*fixed\s*;?/gi, '')
    .replace(/z-index\s*:\s*\d{4,}\s*;?/gi, '')
    .replace(/(?<![\w-])content\s*:[^;]*;?/gi, '')
}
function allowHref(v) { return /^(https?:|mailto:|\/|#)/i.test(v) }
function allowSrc(v) { return /^(https?:|data:image\/|\/|#)/i.test(v) }

function vc(n, r) {
  if (n.nodeType === Node.TEXT_NODE) return n.textContent
  if (n.nodeType !== Node.ELEMENT_NODE) return null
  const i = n
  const s = { key: r }
  if (i.localName === 'script' || i.localName === 'iframe' || i.localName === 'object' || i.localName === 'embed') return null
  for (const c of i.attributes) {
    if (c.name === 'onclick') {
      const m = /^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(c.value)
      if (m) s.onClick = function () { const fn = window.__dshInput; fn && fn(m[1]) }
      continue
    }
    if (c.name === 'style') { s.style = filterStyle(c.value); continue }
    if (c.name === 'class') { s.className = c.value; continue }
    if (c.name === 'href' && !allowHref(c.value)) continue
    if (c.name === 'src' && !allowSrc(c.value)) continue
    s[c.name] = c.value
  }
  const u = [...i.childNodes].map(vc)
  return u.length === 0 ? { tag: i.localName, props: s } : { tag: i.localName, props: s, children: u }
}

// ---- 与 bundle 一致的 case"html" 渲染入口 ----
function renderVcp(rawHtml) {
  const v = rawHtml.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, a, u) => {
    u = u.trim()
    if (!/^(https?:|data:image\/|\/)/i.test(u)) return m
    return `<img alt="${(a || '').replace(/"/g, '&quot;')}" src="${u.replace(/"/g, '&quot;')}">`
  })
  const b = new window.DOMParser().parseFromString(v, 'text/html').body
  const o = []
  for (let k = 0; k < b.childNodes.length; k++) o.push(vc(b.childNodes[k], k))
  return o
}

function findTag(node, tag) {
  const hits = []
  if (!node) return hits
  if (node.tag === tag) hits.push(node)
  if (node.children) for (const c of node.children) hits.push(...findTag(c, tag))
  return hits
}
function collectText(node, out = []) {
  if (typeof node === 'string') out.push(node)
  if (node && node.children) for (const c of node.children) collectText(c, out)
  return out
}

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('== 1. 折叠交互（details/summary 原生）==')
const foldHtml = `<div id="vcp-root"><details style="border:1px solid #333;border-radius:8px;padding:10px;"><summary style="cursor:pointer;">点击展开 · 渲染链路详情</summary><div style="padding:10px;">details 内容是原生的折叠交互，无需 JS。</div></details></div>`
const fold = renderVcp(foldHtml)
ok('details 元素渲染', () => assertTree(fold, 'details'))
ok('summary 元素渲染', () => assertTree(fold, 'summary'))
ok('summary 有交互属性', () => {
  const s = findTag(fold[0], 'summary')[0]
  // summary 的 cursor:pointer 保留（非危险样式）
  assert.ok(String(s.props.style).includes('pointer'))
})

console.log('== 2. 选项卡（CSS-only radio hack 的 input 支持）==')
const tabHtml = `<div id="vcp-root"><div><input type="radio" name="t" id="t1" checked><label for="t1">标签一</label><input type="radio" name="t" id="t2"><label for="t2">标签二</label></div></div>`
const tab = renderVcp(tabHtml)
ok('radio input 渲染', () => assertTree(tab, 'input'))
ok('radio 属性保留（type/name/checked/for）', () => {
  const inputs = findTag(tab[0], 'input')
  assert.ok(inputs.length >= 2)
  assert.equal(inputs[0].props.type, 'radio')
  assert.equal(inputs[0].props.name, 't')
  assert.equal(inputs[0].props.checked, '')
  const labels = findTag(tab[0], 'label')
  assert.equal(labels[0].props.for, 't1')
})

console.log('== 3. 图片转换 + URL 白名单 ==')
const imgHtml = `<div id="vcp-root">正文![开心.png](http://127.0.0.1:3080/emoji/开心.png)结尾</div>`
const img = renderVcp(imgHtml)
ok('![..](..) 转为 img 元素', () => assertTree(img, 'img'))
ok('危险图片协议原样保留（不生成 img）', () => {
  const bad = renderVcp(`<div id="vcp-root">![x](javascript:alert(1))</div>`)
  assert.equal(findTag(bad[0], 'img').length, 0)
})

console.log('== 4. 安全过滤 ==')
const evilHtml = `<div id="vcp-root"><script>alert(1)</script><iframe src="https://x"></iframe><a href="javascript:alert(2)" style="position:fixed;z-index:99999;content:\"钓鱼\";color:red">点我</a><img src="file:///etc/passwd"><img src="data:image/png;base64,xx"><a href="mailto:a@b.com">邮件</a></div>`
const evil = renderVcp(evilHtml)
ok('script 被过滤', () => assert.equal(findTag(evil[0], 'script').length, 0))
ok('iframe 被过滤', () => assert.equal(findTag(evil[0], 'iframe').length, 0))
ok('javascript: 链接被丢弃', () => {
  const a = findTag(evil[0], 'a')
  assert.equal(a[0].props.href, undefined)
})
ok('position:fixed 样式被剥离', () => {
  const a = findTag(evil[0], 'a')[0]
  assert.ok(!String(a.props.style).includes('fixed'))
  assert.ok(!String(a.props.style).includes('99999'))
  assert.ok(!String(a.props.style).includes('content'))
})
ok('file: 图片 src 被剥离（元素保留但无 src，无害）', () => {
  const imgs = findTag(evil[0], 'img')
  assert.equal(imgs.length, 2) // 两张元素都在
  const fileImg = imgs.find(i => i.props.src === undefined)
  assert.ok(fileImg, 'file: 图片的 src 应为 undefined（被剥离）')
  const dataImg = imgs.find(i => i.props.src !== undefined)
  assert.equal(dataImg.props.src, 'data:image/png;base64,xx')
})
ok('mailto: 链接放行', () => {
  const a = findTag(evil[0], 'a')
  assert.equal(a[1].props.href, 'mailto:a@b.com')
})

console.log('== 5. onclick → input 桥 ==')
const btnHtml = `<div id="vcp-root"><button onclick="input('你好，蓝汐')">打招呼</button></div>`
const btn = renderVcp(btnHtml)
ok('onclick 转成 React onClick 处理器', () => {
  const b = findTag(btn[0], 'button')[0]
  assert.equal(typeof b.props.onClick, 'function')
})

console.log('== 6. 表情（::标记:: 转写后的 markdown 图片）==')
const emojiHtml = `<div id="vcp-root">咕噜噜～![大成功.png](http://127.0.0.1:3080/emoji/%E5%A4%A7%E6%88%90%E5%8A%9F.png) 蓝汐来啦！</div>`
const emoji = renderVcp(emojiHtml)
ok('表情转 img 且 src 正确', () => {
  const imgs = findTag(emoji[0], 'img')
  assert.equal(imgs.length, 1)
  assert.ok(imgs[0].props.src.includes('/emoji/'))
})

function assertTree(root, tag) {
  const hits = []
  for (const r of root) hits.push(...findTag(r, tag))
  assert.ok(hits.length > 0, `期望找到 <${tag}>，实际: ${JSON.stringify(root).slice(0, 200)}`)
}

console.log(`\n全部通过：${passed} 项断言 ✓`)
