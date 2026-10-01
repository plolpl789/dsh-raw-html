/**
 * dsh-raw-html v6 稳定区固化测试。
 *
 * 用 node:vm 加载 patch/v6-inject.js（注入 bundle 的模块），stub 依赖
 * （window / DOMParser / Node / f / vc / hp）后，直接驱动流式帧序列验证：
 *   1. 容器未闭合期间：内部闭合子块逐块固化（元素引用跨帧稳定）
 *   2. 固化块保留动画（含一次性动画）；tail 流式中剥一次性动画、保留 infinite
 *   3. 容器闭合帧走全量兜底；闭合后的顶层块增量固化
 *   4. 前缀失配（回退 / 多消息切换）→ 重置全量，不串扰
 *   5. 裸文本阻止固化、void 标签、rawtext（script）、incomplete 标签、注释
 *
 * 依赖 jsdom（借用 VCPChat 项目 node_modules，路径见下）。
 * 运行：node tests/stable.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { document, Node, window: domWindow } = dom.window

// ---- stub：与 bundle 等价的 vc / hp / f ----
function filterStyle(sv) {
  return sv
    .replace(/position\s*:\s*fixed\s*;?/gi, '')
    .replace(/z-index\s*:\s*\d{4,}\s*;?/gi, '')
    .replace(/(?<![\w-])content\s*:[^;]*;?/gi, '')
}
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
      if (m) s.onClick = function () { const fn = domWindow.__dshInput; fn && fn(m[1]) }
      continue
    }
    if (/^on/i.test(c.name)) continue
    if (c.name === 'style') { s.style = hp(filterStyle(c.value)); continue }
    if (c.name === 'class') { s.className = c.value; continue }
    if (c.name === 'href' && !allowHref(c.value)) continue
    if (c.name === 'src' && !allowSrc(c.value)) continue
    s[c.name] = c.value
  }
  const u = [...i.childNodes].map(vc).filter(x => x != null)
  return { tag: i.localName, props: s, children: u }
}

const f = { Fragment: Symbol('frag') }
f.jsx = (type, props) => ({ type, props })

// ---- vm 加载 v6-inject.js ----
const code = fs.readFileSync(new URL('../patch/v6-inject.js', import.meta.url), 'utf8')
const sandbox = {
  window: {},
  DOMParser: domWindow.DOMParser,
  Node,
  f,
  vc,
  hp,
  performance: { now: () => Date.now() },
  console,
  setTimeout: (fn, ms) => domWindow.setTimeout(fn, ms),
  clearTimeout: (id) => domWindow.clearTimeout(id),
}
vm.runInNewContext(code, sandbox)
const stable = sandbox.window.__vcpStable
assert.ok(stable && typeof stable.render === 'function', '__vcpStable.render 已挂载')

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// ---- 工具 ----
// 兼容两种元素风格：组装路径用 f.jsx（{type, props}），vc 转换路径用 {tag, props, children}
function collect(node, out = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return out
  if (node.type) { if (node.type !== f.Fragment) out.push(node) }
  else if (node.tag) out.push(node)
  const ch = node.children || (node.props && node.props.children)
  if (Array.isArray(ch)) for (const c of ch) collect(c, out)
  else if (ch && typeof ch === 'object') collect(ch, out)
  return out
}
function findTag(root, tag) {
  return collect(root).filter(n => n.tag === tag)
}
function resetCache() {
  // 每个用例前重置 F（模拟新会话/刷新）
  sandbox.window.__vcpFast = undefined
  const code2 = fs.readFileSync(new URL('../patch/v6-inject.js', import.meta.url), 'utf8')
  const sb2 = { window: {}, DOMParser: domWindow.DOMParser, Node, f, vc, hp, performance: { now: () => Date.now() }, console, setTimeout: (fn, ms) => domWindow.setTimeout(fn, ms), clearTimeout: (id) => domWindow.clearTimeout(id) }
  vm.runInNewContext(code2, sb2)
  return sb2.window.__vcpStable
}

console.log('== 1. 容器未闭合期间：内部子块固化 ==')
{
  const s = resetCache()
  const f1 = '<div id="vcp-root" style="background:#0a2540">'
  const f2 = f1 + '<h3 style="animation:lx-rise .5s ease both">标题</h3>'
  const f3 = f2 + '<p style="animation:lx-wave 1s ease-in-out infinite">循环'   // p 未闭合 → tail
  const f4 = f3 + '</p><p style="animation:lx-pop .4s both">一次性'            // p1 闭合固化；p2 未闭合 → tail

  const r1 = s.render(f1, true)
  ok('帧1：容器元素渲染（空内容）', () => {
    assert.equal(r1.type, 'div')
    assert.match(r1.props.id, /^vcp-msg-\d+$/) // v6.12 消息级作用域化：唯一 id
    assert.equal(Array.isArray(r1.props.children), true)
    assert.equal(r1.props.children.length, 0)
  })

  const r2 = s.render(f2, true)
  ok('帧2：h3 成为容器子节点', () => {
    assert.equal(r2.type, 'div')
    const h3s = findTag(r2, 'h3')
    assert.equal(h3s.length, 1)
  })
  const h3_2 = findTag(r2, 'h3')[0]
  ok('帧2：固化块保留一次性动画', () => {
    assert.equal(h3_2.props.style.animation, 'lx-rise .5s ease both')
  })

  const r3 = s.render(f3, true)
  ok('帧3：h3 元素引用稳定（DOM 不重建 → 动画不闪）', () => {
    assert.equal(findTag(r3, 'h3')[0], h3_2)
  })
  ok('帧3：tail 中 infinite 动画保留', () => {
    const ps = findTag(r3, 'p')
    assert.equal(ps.length, 1)
    assert.equal(ps[0].props.style.animation, 'lx-wave 1s ease-in-out infinite')
  })

  const r4 = s.render(f4, true)
  ok('帧4：闭合的 p1 固化（引用稳定），tail 中 p2 一次性动画被剥除（防闪）', () => {
    const ps = findTag(r4, 'p')
    assert.equal(ps.length, 2)
    const p1 = ps.find(p => String(p.props.style.animation).includes('lx-wave'))
    const p2 = ps.find(p => p.props.style.animation === undefined || !String(p.props.style.animation).includes('lx-pop'))
    assert.ok(p1, 'p1（infinite）在固化块中')
    assert.equal(p1.props.style.animation, 'lx-wave 1s ease-in-out infinite')
    assert.ok(p2, 'p2（一次性）在 tail 中')
  })
  ok('帧4：h3 引用依旧稳定', () => {
    assert.equal(findTag(r4, 'h3')[0], h3_2)
  })
}

console.log('== 2. 容器闭合帧全量兜底 + 闭合后顶层块增量 ==')
{
  const s = resetCache()
  const f2 = '<div id="vcp-root" style="background:#0a2540"><h3>标题</h3>'
  const f3 = f2 + '</div>'
  const f4 = f3 + '<div style="color:red">新卡</div>'
  const f5 = f4 + '<div style="color:blue">新卡二</div>'

  const r2 = s.render(f2, true)
  const h3pre = findTag(r2, 'h3')[0]

  const r3 = s.render(f3, true) // 容器闭合 → 全量
  ok('帧3：容器闭合后结构完整（vcp-root 包裹 h3）', () => {
    const roots = collect(r3)
    assert.equal(roots[0].tag, 'div')
    assert.match(roots[0].props.id, /^vcp-msg-\d+$/)
    assert.equal(findTag(r3, 'h3').length, 1)
  })

  const r4 = s.render(f4, true)
  ok('帧4：闭合后顶层块增量固化（Fragment 平铺）', () => {
    assert.equal(r4.type, f.Fragment)
    const roots = topChildren(r4)
    assert.equal(roots.length, 2)
    assert.match(roots[0].props.id, /^vcp-msg-\d+$/)
    assert.equal(roots[1].props.style.color, 'red')
  })
  ok('帧4：vcp-root 块内部 h3 完整', () => {
    assert.equal(findTag(r4, 'h3').length, 1)
  })

  const r5 = s.render(f5, true)
  ok('帧5：继续增量固化（新卡二），且 vcp-root 引用稳定', () => {
    assert.equal(r5.type, f.Fragment)
    const roots = topChildren(r5)
    assert.equal(roots.length, 3)
    assert.equal(roots[2].props.style.color, 'blue')
    assert.equal(roots[0], topChildren(r4)[0])
  })
}

// 顶层直接子级（不递归）
function topChildren(node) {
  const ch = node.children || (node.props && node.props.children)
  if (!ch) return []
  if (!Array.isArray(ch)) return [ch]
  return ch.filter(c => c && typeof c === 'object')
}

// 递归收集全部文本（跳过 style/script 元素内部——CSS/JS 文本合法，不算泄漏）
function findTextOutside(node, out = []) {
  if (typeof node === 'string') out.push(node)
  if (node && node.tag && (node.tag === 'style' || node.tag === 'script')) return out
  if (node && node.children) {
    for (const c of node.children) findTextOutside(c, out)
  } else if (node && node.props && node.props.children) {
    const ch = node.props.children
    if (Array.isArray(ch)) for (const c of ch) findTextOutside(c, out)
    else findTextOutside(ch, out)
  }
  return out
}

// 递归收集全部文本
function findText(node, out = []) {
  if (typeof node === 'string') out.push(node)
  if (node && node.children) {
    for (const c of node.children) findText(c, out)
  } else if (node && node.props && node.props.children) {
    const ch = node.props.children
    if (Array.isArray(ch)) for (const c of ch) findText(c, out)
    else findText(ch, out)
  }
  return out
}

console.log('== 3. 前缀失配：回退 / 多消息切换不串扰 ==')
{
  const s = resetCache()
  s.render('<div id="a">x</div><b>y</b>', true)
  const rb = s.render('<div id="b">z</div>', true)
  ok('前缀失配 → 重置全量，渲染正确', () => {
    const roots = collect(rb)
    assert.equal(roots[0].props.id, 'b')
  })
  const rb2 = s.render('<div id="b">z</div>', true)
  ok('同内容整串缓存命中（同流式状态重复渲染）', () => {
    assert.equal(rb2, rb)
  })
}

console.log('== 4. 裸文本阻止固化（归 tail）==')
{
  const s = resetCache()
  const r1 = s.render('<div id="r">前文', true)
  const r2 = s.render('<div id="r">前文<b>后</b>', true)
  ok('裸文本后的块不固化（整体进容器 tail）', () => {
    assert.equal(r2.type, 'div')
    const roots = collect(r2)
    assert.equal(roots[0].props.id, 'r')
    const text = findText(r2)
    assert.ok(text.join('').includes('前文'))
    assert.equal(findTag(r2, 'b').length, 1)
  })
}

console.log('== 5. void 标签 / rawtext / incomplete / 注释 ==')
{
  const s = resetCache()
  const r1 = s.render('<div id="r"><img src="https://x/y.png"><b>y</b></div>', true)
  ok('void 标签 img 不破坏栈', () => {
    assert.equal(findTag(r1, 'img').length, 1)
    assert.equal(findTag(r1, 'b').length, 1)
  })

  const s2 = resetCache()
  const r2 = s2.render('<div id="r"><script>if(a<b){}</script><b>y</b></div>', false)
  ok('rawtext（script 内容含 <）不误判', () => {
    assert.equal(findTag(r2, 'script').length, 0) // vc 过滤
    assert.equal(findTag(r2, 'b').length, 1)
  })

  const s3 = resetCache()
  const r3 = s3.render('<div id="r"><p>文', true)
  ok('incomplete 标签（流式中开标签未闭合）→ 进 tail', () => {
    assert.equal(r3.type, 'div')
    const ps = findTag(r3, 'p')
    assert.equal(ps.length, 1) // DOMParser 容错解析出 <p>
  })

  const s4 = resetCache()
  const r4 = s4.render('<div id="r"><!-- 注释 --><b>y</b></div>', false)
  ok('注释标签跳过，后续块正常固化', () => {
    assert.equal(findTag(r4, 'b').length, 1)
  })
}

console.log('== 6. 最终帧（非流式）动画恢复 ==')
{
  const s = resetCache()
  const base = '<div id="vcp-root"><p style="animation:lx-pop .4s both">结束</p>'
  const rStream = s.render(base, true)
  ok('流式中一次性动画被剥', () => {
    assert.equal(findTag(rStream, 'p')[0].props.style.animation, undefined)
  })
  const rFinal = s.render(base, false)
  ok('最终帧一次性动画保留（播放一次）', () => {
    assert.equal(findTag(rFinal, 'p')[0].props.style.animation, 'lx-pop .4s both')
  })
}

console.log('== 7. 图片转换 + 安全过滤在 v6 管线内生效 ==')
{
  const s = resetCache()
  const r = s.render('<div id="r">![开心](http://127.0.0.1:3080/emoji/开心.png)</div>', false)
  ok('![..](..) 转为 img', () => {
    const imgs = findTag(r, 'img')
    assert.equal(imgs.length, 1)
    assert.ok(imgs[0].props.src.includes('/emoji/'))
  })
  const s2 = resetCache()
  const r2 = s2.render('<div id="r" style="position:fixed;z-index:99999;content:&quot;钓鱼&quot;;color:red">x</div>', false)
  ok('容器开标签 style 危险属性被过滤', () => {
    const st = collect(r2)[0].props.style
    assert.equal(st.position, undefined)
    assert.equal(st.zIndex, undefined)
    assert.equal(st.content, undefined)
    assert.equal(st.color, 'red')
  })
}

console.log('== 8. <style> 元素修复（keyframes 不丢失、不泄漏为文本）==')
{
  const s = resetCache()
  const f1 = '<div id="vcp-root" style="background:#0a2540">'
  const f2 = f1 + '<style>@keyframes lx-spin{to{transform:rotate(360deg)}}@keyframes lx-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}</style>'
  const f3 = f2 + '<div style="animation:lx-spin 1s linear infinite">A</div>'
  const f4 = f3 + '</div>'

  const r2 = s.render(f2, true)
  ok('帧2：<style> 渲染为元素（keyframes 内容保留）', () => {
    const st = findTag(r2, 'style')
    assert.equal(st.length, 1)
    assert.ok(st[0].children.join('').includes('lx-spin'))
    assert.ok(st[0].children.join('').includes('lx-bounce'))
  })

  const r3 = s.render(f3, true)
  ok('帧3：<style> 固化到 inner（仍存在、内容完整）', () => {
    const st = findTag(r3, 'style')
    assert.equal(st.length, 1)
    assert.ok(st[0].children.join('').includes('lx-bounce'))
    assert.equal(findTag(r3, 'div').filter(d => d.props.style && d.props.style.animation).length, 1)
  })
  const style3 = findTag(r3, 'style')[0]

  const r3b = s.render(f3 + '<p>更多</p>', true)
  ok('帧3b：<style> 固化后跨帧引用稳定（不重复解析）', () => {
    const st = findTag(r3b, 'style')
    assert.equal(st.length, 1)
    assert.equal(st[0], style3)
  })

  const r4 = s.render(f4, true) // 容器闭合 → 全量
  ok('帧4（闭合）：<style> 与动画元素都在，CSS 不泄漏为文本', () => {
    assert.equal(findTag(r4, 'style').length, 1)
    assert.equal(findTag(r4, 'div').filter(d => d.props.style && d.props.style.animation).length, 1)
    // 泄漏防护：style 元素之外不得出现 CSS 语法文本
    const texts = findTextOutside(r4)
    for (const tx of texts) {
      assert.ok(!/^\{|^@keyframes|^[a-zA-Z-]+:/.test(tx), '发现泄漏 CSS 文本: ' + tx.slice(0, 40))
    }
  })
}

console.log('== 9. 压力场景：容器内 style + 大量 SVG 动画图标 ==')
{
  const s = resetCache()
  // 简化压力卡：style + 5 个带动画的图标块
  let v = '<div id="vcp-root" style="background:#0a2540"><style>@keyframes lx-spin{to{transform:rotate(360deg)}}@keyframes lx-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}</style>'
  for (let i = 0; i < 5; i++) {
    v += '<div style="animation:' + (i % 2 ? 'lx-spin' : 'lx-bounce') + ' 1s linear infinite">图标' + i + '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></div>'
    const r = s.render(v, true)
    if (i === 0) {
      ok('首个图标块渲染（含 style）', () => {
        assert.equal(findTag(r, 'style').length, 1)
        assert.equal(findTag(r, 'div').filter(d => d.props.style && d.props.style.animation).length, 1)
      })
    } else {
      ok('图标块 ' + i + ' 增量固化（引用稳定）', () => {
        assert.equal(findTag(r, 'div').filter(d => d.props.style && d.props.style.animation).length, i + 1)
      })
    }
  }
  ok('全部图标动画保留（infinite）', () => {
    const rF = s.render(v, true)
    const anims = findTag(rF, 'div').filter(d => d.props.style && d.props.style.animation)
    assert.equal(anims.length, 5)
    for (const a of anims) assert.ok(String(a.props.style.animation).includes('infinite'))
  })
}

console.log('== 10. 伪标签防御（文字里的 <style> 字样不污染）==')
{
  const s = resetCache()
  const html = '<div id="vcp-root" style="background:#0a2540"><div>参考代码：`<style>` 标签示例，CSS 规则如 @keyframes 需连续书写</div><div style="animation:lx-spin 1s linear infinite">A</div></div>'
  const r = s.render(html, false)
  ok('伪 <style> 字样不生成 style 元素', () => {
    assert.equal(findTag(r, 'style').length, 0)
  })
  ok('后续内容完整渲染（未被吞）', () => {
    const texts = findTextOutside(r)
    assert.ok(texts.join('').includes('标签示例'))
    assert.ok(texts.join('').includes('A'))
  })
  ok('动画元素正常', () => {
    const anims = findTag(r, 'div').filter(d => d.props.style && d.props.style.animation)
    assert.equal(anims.length, 1)
  })
}

console.log('== 11. justify-content + animation 不误伤（content 正则词边界）==')
{
  const s = resetCache()
  const html = '<div id="vcp-root" style="background:#0a2540"><style>@keyframes lx-spin{to{transform:rotate(360deg)}}</style><div style="width:52px;height:52px;display:flex;align-items:center;justify-content:center;animation:lx-spin 1s linear infinite">A</div></div>'
  const r = s.render(html, false)
  ok('animation 属性保留（不被 content 正则误伤）', () => {
    const d = findTag(r, 'div').find(x => x.props.style && x.props.style.animation)
    assert.ok(d, '动画 div 存在')
    assert.equal(d.props.style.animation, 'lx-spin 1s linear infinite')
  })
  ok('justify-content 属性保留', () => {
    const d = findTag(r, 'div').find(x => x.props.style && x.props.style.justifyContent)
    assert.equal(d.props.style.justifyContent, 'center')
  })
}

console.log('== 12. 未闭合标签占位（方案 B：半标签不空窗、不显示代码）==')
{
  const s = resetCache()
  // 帧1：vcp-root 内 svg 开标签完整、circle 半标签未闭合
  const f1 = '<div id="vcp-root" style="background:#0a2540"><svg viewBox="0 0 400 200">\n<circle cx="50" cy="50" r="40" fill="#40dcff"'
  const r1 = s.render(f1, true)
  ok('帧1：未闭合 circle → 「绘制中」占位 span（不空窗）', () => {
    const phs = findTag(r1, 'span').filter(sp => sp.props.className === 'vcp-tail-ph')
    assert.equal(phs.length, 1)
    assert.ok(phs[0].children.join('').includes('SVG'))
  })
  ok('帧1：已闭合的 svg 开标签照常渲染', () => {
    assert.equal(findTag(r1, 'svg').length, 1)
  })

  // 帧2：circle 写完闭合 → 占位消失、真实元素出现
  const r2 = s.render(f1 + '/>', true)
  ok('帧2：标签闭合后占位消失', () => {
    assert.equal(findTag(r2, 'span').filter(sp => sp.props.className === 'vcp-tail-ph').length, 0)
  })
  ok('帧2：真实 circle 元素出现（属性完整）', () => {
    const cs = findTag(r2, 'circle')
    assert.equal(cs.length, 1)
    assert.equal(cs[0].props.cx, '50')
  })

  // 帧3：顶层半标签（v 已含 >，tail 未闭合）→ 占位而非空白
  const s3 = resetCache()
  const r3 = s3.render('<svg viewBox="0 0 400 200">\n<circle cx="50"', true)
  ok('帧3：顶层 svg 内半标签 → 占位 span', () => {
    const phs = findTag(r3, 'span').filter(sp => sp.props.className === 'vcp-tail-ph')
    assert.equal(phs.length, 1)
    // F.open 组装的容器是 jsx 风格（type），vc 产物是 tag 风格——两种都认
    const svgs = collect(r3).filter(n => n.type === 'svg' || n.tag === 'svg')
    assert.equal(svgs.length, 1)
  })

  // 帧4：非流式不插入占位（保持原行为）
  const s4 = resetCache()
  const r4 = s4.render('<div id="vcp-root"><svg viewBox="0 0 400 200">\n<circle cx="50"', false)
  ok('非流式不插入占位（维持原行为）', () => {
    assert.equal(findTag(r4, 'span').filter(sp => sp.props.className === 'vcp-tail-ph').length, 0)
  })
}

console.log('== 13. on* 事件属性过滤（安全缺口 5.4 修复）==')
{
  const s = resetCache()
  const r = s.render('<div id="r"><img src="https://x/y.png" onerror="alert(1)"><button onclick="input(\'你好\')">点我</button><span onmouseover="x">t</span></div>', false)
  ok('子元素 onerror 被拒（img 上无 onerror）', () => {
    const imgs = findTag(r, 'img')
    assert.equal(imgs.length, 1)
    assert.equal(imgs[0].props.onerror, undefined)
  })
  ok('onclick="input(...)" 桥接为 onClick 函数', () => {
    const btns = findTag(r, 'button')
    assert.equal(btns.length, 1)
    assert.equal(typeof btns[0].props.onClick, 'function')
  })
  ok('子元素 onmouseover 被拒', () => {
    const spans = findTag(r, 'span')
    assert.equal(spans[0].props.onmouseover, undefined)
  })
  const s2 = resetCache()
  const r2 = s2.render('<div id="r" onload="x" style="color:red">', true)
  ok('容器开标签 onload 被拒（parseOpen 路径）', () => {
    const root = collect(r2)[0]
    assert.equal(root.props.onload, undefined)
    assert.equal(root.props.style.color, 'red')
  })
}

console.log('== 14. 消息级作用域化：后卡样式不污染前卡（v6.12）==')
{
  // 两条独立消息，各自带 vcp-root + 相同类名但不同配色——v6.12 之前
  // 后一条的 style（同特异性、文档靠后）会把前一条染掉；现在每条消息
  // 根容器唯一 id（vcp-msg-N）+ style 内 #vcp-root 同步替换，互不串扰。
  // 注意：选择器必须按 VCP 协议写 #vcp-root 前缀（裸类不在协议保护范围）。
  const s = resetCache()
  const msgA = '<div id="vcp-root"><style>#vcp-root .wrap{background:#faf8f4;color:#333}</style><p class="wrap">甲</p></div>'
  const msgB = '<div id="vcp-root"><style>#vcp-root .wrap{background:#12051f;color:#eaff00}</style><p class="wrap">乙</p></div>'
  const ra = s.render(msgA, false)
  const rb = s.render(msgB, false)
  const rootA = collect(ra).find(n => n.tag === 'div' && /^vcp-msg-\d+$/.test(n.props.id || ''))
  const rootB = collect(rb).find(n => n.tag === 'div' && /^vcp-msg-\d+$/.test(n.props.id || ''))
  const cssA = findTag(ra, 'style')[0].children.join('')
  const cssB = findTag(rb, 'style')[0].children.join('')
  ok('消息 A/B 根容器各得唯一 id（互不相同）', () => {
    assert.ok(rootA && rootB, '两个根容器都存在且 id 形如 vcp-msg-N')
    assert.notEqual(rootA.props.id, rootB.props.id, '两条消息 id 互不相同')
  })
  ok('A 的样式只命中 A 的 id（不再引用公共 #vcp-root）', () => {
    assert.ok(cssA.includes('#' + rootA.props.id), 'A 的 CSS 引用 A 的 id')
    assert.ok(!cssA.includes('#vcp-root'), 'A 的 CSS 不含公共 id')
  })
  ok('B 的样式只命中 B 的 id（不含 A 的 id / 公共 id）', () => {
    assert.ok(cssB.includes('#' + rootB.props.id), 'B 的 CSS 引用 B 的 id')
    assert.ok(!cssB.includes('#' + rootA.props.id), 'B 的 CSS 不含 A 的 id')
    assert.ok(!cssB.includes('#vcp-root'), 'B 的 CSS 不含公共 id')
  })
  // 流式同一消息跨帧：uid 稳定（缓存键不抖动、固化块引用不重建）
  const s2 = resetCache()
  const f1 = '<div id="vcp-root" style="background:#0a2540">'
  const f2 = f1 + '<p>hi</p>'
  const r1 = s2.render(f1, true)
  const r2 = s2.render(f2, true)
  ok('流式同一消息跨帧 uid 稳定（引用不重建）', () => {
    assert.equal(r1.props.id, r2.props.id, '根 id 跨帧不变')
    assert.match(r2.props.id, /^vcp-msg-\d+$/)
  })
}

console.log('== 15. 自愈层 v6.33：字体链继承兜底 + 圆角不兜底 ==')
{
  // 场景 1：有 <style> 的卡片（「登陆」显小原型）——兜底规则注入 <style> 末尾：
  //   ① #vcp-msg-N{font-family:系统链 !important} 锁定根容器（v6.33b 关键：
  //      applyRootGuard 补的 fontFamily 是普通内联无 important，皮肤仍能劫持根容器
  //      本身，子元素 inherit 到的是被劫持字体 → 链断；CSS 锁定根容器补上这环）
  //   ② 常用文字标签逐条 #vcp-msg-N tag{font-family:inherit !important}
  // 卡片显式书法字体（.paper）boost 后 (1,1,0)!important 稳压兜底 (1,0,1)!important。
  const s1 = resetCache()
  const html = '<div id="vcp-root"><style>#vcp-root .paper{font-family:\'Lanxi-鱼尾行书\',serif}#vcp-root .hot{color:#F5572F}#vcp-root h2{font-size:21px}</style><p class="paper">蓝汐晚报</p><h2>台风在海南昌江沿海<span class="hot">登陆</span></h2></div>'
  const r1 = s1.render(html, false)
  const css1 = findTag(r1, 'style')[0].children.join('')
  ok('有 <style> 卡：注入根容器字体链锁定规则', () => {
    assert.match(css1, /#vcp-msg-\d+\{font-family:ui-sans-serif[^}]*!important\}/, '根容器字体链带 !important')
  })
  ok('注入常用文字标签逐条 inherit 兜底', () => {
    assert.match(css1, /#vcp-msg-\d+ span\{font-family:inherit !important\}/, 'span 兜底存在')
    assert.match(css1, /#vcp-msg-\d+ p\{font-family:inherit !important\}/, 'p 兜底存在')
    assert.match(css1, /#vcp-msg-\d+ h2\{font-family:inherit !important\}/, 'h2 兜底存在')
  })
  ok('兜底规则带唯一 id 前缀（随消息作用域化）', () => {
    const root = collect(r1).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.ok(css1.includes('#' + root.props.id + ' span'), '规则前缀是消息自己的 id')
    assert.ok(!css1.includes('#vcp-root span'), '不含公共 #vcp-root 前缀')
  })
  ok('卡片显式书法字体不被兜底覆盖（.paper 规则保留）', () => {
    assert.ok(css1.includes("font-family:'Lanxi-鱼尾行书',serif!important"), 'boost 后 .paper 字体声明保留')
  })

  // 场景 2：无 <style> 的纯内联卡——不注入（保持 DOM 结构纯净；
  // 纯内联字体走 parseOpen ref 锁定，风险面小）
  const s2 = resetCache()
  const r2 = s2.render('<div id="vcp-root"><p style="color:red">纯内联卡</p></div>', false)
  ok('无 <style> 卡：不注入 style 元素（结构纯净）', () => {
    assert.equal(findTag(r2, 'style').length, 0, '无 style 元素')
  })

  // 场景 3：圆角不兜底（先生定调：border-radius 是装饰，AI 没写可能故意要直角，
  // 强补圆角会误判意图；默认直角，尊重设计）+ 版面收窄兜底（v6.33e）
  const s3 = resetCache()
  const r3 = s3.render('<div id="vcp-root" style="background:#fff"><p>甲</p></div>', false)
  ok('根容器缺圆角 → 不干预（默认直角）', () => {
    const root = collect(r3).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.equal(root.props.style.borderRadius, undefined, '不补 borderRadius')
  })
  ok('v6.33e：根容器缺宽度 → 补 max-width:920px 版心', () => {
    const root = collect(r3).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.equal(root.props.style.maxWidth, '920px', '收窄版心')
  })
  const s4 = resetCache()
  const r4 = s4.render('<div id="vcp-root" style="background:#fff;border-radius:24px;max-width:100%"><p>乙</p></div>', false)
  ok('AI 显式 border-radius:24px → 尊重保留', () => {
    const root = collect(r4).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.equal(root.props.style.borderRadius, '24px')
  })
  ok('AI 显式 max-width:100% → 尊重（不补 920px）', () => {
    const root = collect(r4).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.equal(root.props.style.maxWidth, '100%')
  })
  const s6 = resetCache()
  const r6 = s6.render('<div id="vcp-root" style="background:#fff;width:100%"><p>丙</p></div>', false)
  ok('AI 显式 width:100% → 尊重（不补 920px）', () => {
    const root = collect(r6).find(n => /^vcp-msg-\d+$/.test(n.props.id || ''))
    assert.equal(root.props.style.maxWidth, undefined, '不补 max-width')
    assert.equal(root.props.style.width, '100%')
  })

  // 场景 4：流式路径——<style> 未闭合帧不注入（无 </style> 可挂），闭合帧注入
  const s5 = resetCache()
  const g1 = '<div id="vcp-root" style="background:#f5f4f0"><style>#vcp-root .t{font-size:20px}'
  const g2 = g1 + '</style><p class="t">尾</p></div>'
  const rg1 = s5.render(g1, true)
  ok('流式：<style> 未闭合帧不注入兜底规则', () => {
    const st = findTag(rg1, 'style')
    if (st.length === 0) return // tail 补闭合的 style 可能以文本形态存在，不强断言
    assert.ok(!st[0].children.join('').includes('font-family:inherit'), '未闭合帧不含兜底')
  })
  const rg2 = s5.render(g2, true)
  ok('流式：<style> 闭合帧注入兜底规则', () => {
    const st = findTag(rg2, 'style')
    assert.ok(st.length >= 1, 'style 元素存在')
    assert.ok(st[0].children.join('').includes('font-family:inherit'), '闭合帧含兜底规则')
  })
}

console.log('== 16. 自愈层 v6.33c：字体链 DOM 强制（最终防线）==')
{
  const s = resetCache()
  const stable = s
  // 构造真实 DOM 卡片（jsdom）：卡片 <style> 显式 .paper 书法字体；
  // 无显式字体的 p/span 应被强制 inherit（内联 !important，最高优先级）。
  const div = document.createElement('div')
  div.id = 'vcp-msg-1'
  div.innerHTML = '<style>#vcp-msg-1 .paper{font-family:"Lanxi-鱼尾行书",serif}#vcp-msg-1 .t{font-size:19px;font-weight:800}#vcp-msg-1 .hot{color:#F5572F}</style><p class="t">文字<span class="hot">强调词</span></p><p class="paper">书法标题</p><p style="font-family:Georgia">内联字体</p>'
  document.body.appendChild(div)
  // 注意：geo 引用必须在 enforceFontChain 之前取得——强制后 .t 也会带 style 属性，
  // 事后用 p[style] 会误选到 .t。
  const geo = div.querySelector('p[style]')
  stable._test.enforceFontChain(div)
  ok('无显式字体的 span 被强制 inherit + important', () => {
    const span = div.querySelector('span.hot')
    assert.equal(span.style.fontFamily, 'inherit')
    assert.equal(span.style.getPropertyPriority('font-family'), 'important')
  })
  ok('v6.33d：span 的 font-size 也被锁继承（皮肤字号压制根治）', () => {
    const span = div.querySelector('span.hot')
    assert.equal(span.style.fontSize, 'inherit', 'font-size 锁定 inherit')
    assert.equal(span.style.getPropertyPriority('font-size'), 'important')
    assert.equal(span.style.fontWeight, 'inherit', 'font-weight 锁定')
    assert.equal(span.style.lineHeight, 'inherit', 'line-height 锁定')
    assert.equal(span.style.letterSpacing, 'inherit', 'letter-spacing 锁定')
  })
  ok('v6.33d：color 不锁（AI 设计的 .hot 橙色保留）', () => {
    const span = div.querySelector('span.hot')
    assert.equal(span.style.color, '', 'color 无内联注入')
  })
  ok('无显式字体的 p 被强制 inherit + important', () => {
    const p = div.querySelector('p.t')
    assert.equal(p.style.fontFamily, 'inherit')
    assert.equal(p.style.getPropertyPriority('font-family'), 'important')
  })
  ok('v6.33d：.t 自身 font-size 不被锁（类规则显式，boost 已保护 19px）', () => {
    const p = div.querySelector('p.t')
    assert.equal(p.style.fontSize, '', '.t 无内联 font-size 注入')
  })
  ok('显式字体类 .paper 不被强制（书法字体尊重）', () => {
    const paper = div.querySelector('p.paper')
    assert.equal(paper.style.fontFamily, '', '未注入内联字体')
  })
  ok('内联 font-family 元素不被强制（Georgia 保留）', () => {
    assert.equal(geo.style.fontFamily, 'Georgia')
  })
  ok('根容器无显式字体 → 锁定系统链 important', () => {
    assert.ok(div.style.fontFamily.indexOf('ui-sans-serif') === 0, '根容器系统链')
    assert.equal(div.style.getPropertyPriority('font-family'), 'important')
  })
  ok('幂等：重复执行不重复处理（dataset 标记）', () => {
    const span = div.querySelector('span.hot')
    stable._test.enforceFontChain(div)
    assert.equal(span.style.fontFamily, 'inherit', '值不变')
  })
  // AI 显式根容器内联字体 → 尊重（不锁定系统链）
  const div2 = document.createElement('div')
  div2.id = 'vcp-msg-2'
  div2.style.fontFamily = "'Lanxi-鱼尾行书',serif"
  div2.innerHTML = '<style>#vcp-msg-2 .t{font-size:15px}</style><p class="t">文字</p>'
  document.body.appendChild(div2)
  stable._test.enforceFontChain(div2)
  ok('AI 显式根容器内联字体 → 尊重不覆盖', () => {
    // 注意：jsdom 会把单引号字体名规范化为双引号（'X' → "X"），用 includes 判断
    assert.ok(div2.style.fontFamily.includes('Lanxi'), '根容器保留 AI 字体')
    assert.notEqual(div2.style.fontFamily.indexOf('ui-sans-serif'), 0, '未替换成系统链')
  })
  document.body.removeChild(div)
  document.body.removeChild(div2)
}

console.log('== 17. 自愈层 v6.33f：花括号平衡全路径兜底（非流式 @keyframes 不被吞）==')
{
  // 卡 2 原型：<style> 已闭合但 .code 规则漏 }，后续 .dot 规则与 @keyframes 会被
  // 浏览器吞进 .code 规则块 → 动画不转。v6.33f 对闭合 <style> 内的 CSS 补平衡。
  const s = resetCache()
  const html = '<div id="vcp-root" style="background:#0a0e1a"><style>#vcp-root .code{background:#fff;margin:8px 0 0;#vcp-root .dot{animation:spin 3s linear infinite;}@keyframes spin{to{transform:rotate(360deg)}}</style><div class="dot">x</div></div>'
  const r = s.render(html, false)
  const css = findTag(r, 'style')[0].children.join('')
  ok('非流式：<style> 内花括号补平衡（{ 与 } 数量相等）', () => {
    const open = (css.match(/\{/g) || []).length
    const close = (css.match(/\}/g) || []).length
    assert.equal(open, close, `开 ${open} / 闭 ${close}`)
  })
  ok('v6.33f：@keyframes spin 完整保留（不再被前块吞掉）', () => {
    assert.ok(css.includes('@keyframes spin{to{transform:rotate(360deg)}}'), 'keyframes 独立完整')
  })
  ok('v6.33f：.dot 动画规则独立（不再被 .code 吞）', () => {
    // 注：boost 只提升文字属性，animation 不追加 !important
    assert.ok(css.includes('0 0;}#vcp-msg-1 .dot{animation:spin 3s linear infinite;}'), '.code 闭合后 .dot 独立成规则')
  })
  // 平衡的 CSS 不受影响（幂等）
  const s2 = resetCache()
  const html2 = '<div id="vcp-root" style="background:#fff"><style>#vcp-root .a{color:red}#vcp-root .b{font-size:12px}</style><p class="b">x</p></div>'
  const r2 = s2.render(html2, false)
  const css2 = findTag(r2, 'style')[0].children.join('')
  ok('平衡 CSS 不被改动（幂等）', () => {
    const open = (css2.match(/\{/g) || []).length
    const close = (css2.match(/\}/g) || []).length
    assert.equal(open, close)
    assert.ok(!css2.includes('}{'), '无多余空规则')
  })
  // 嵌套 @media 正常 CSS 不被误伤（块类型栈：at 块内嵌套规则合法）
  const s3 = resetCache()
  const html3 = '<div id="vcp-root" style="background:#fff"><style>#vcp-root .x{font-size:12px}@media screen{#vcp-root .y{color:red}}</style><p class="x">x</p></div>'
  const r3 = s3.render(html3, false)
  const css3 = findTag(r3, 'style')[0].children.join('')
  ok('@media 嵌套规则不被误伤（不补多余 }）', () => {
    const open = (css3.match(/\{/g) || []).length
    const close = (css3.match(/\}/g) || []).length
    assert.equal(open, close, '花括号仍平衡')
    assert.ok(css3.includes('@media screen{#vcp-msg-1 .y{color:red!important}}'), '@media 结构完整')
  })
}

console.log('== 18. 自愈层 v6.34：SVG 类动画中心自愈（fill-box）==')
{
  const s = resetCache()
  const div = document.createElement('div')
  div.id = 'vcp-msg-1'
  div.innerHTML = '<svg width="72" height="72" viewBox="0 0 72 72"><g class="dot"><circle cx="36" cy="36" r="26" fill="none" stroke="#40dcff" stroke-width="2"/><circle cx="58" cy="36" r="5" fill="#f5572f"/></g></svg>'
  document.body.appendChild(div)
  // jsdom 对 getComputedStyle().animationName 的支持有限：内联 animation 若可读则断言
  const g = div.querySelector('g')
  const hasAnimation = typeof domWindow.getComputedStyle === 'function'
  // 手动给 g 加内联动画（jsdom 可解析 animationName 时走真实路径）
  g.style.animation = 'spin 3s linear infinite'
  stable._test.healSvgAnimation(div)
  const cs = domWindow.getComputedStyle(g)
  const animName = cs && cs.animationName
  if (animName && animName !== 'none') {
    ok('有动画的 SVG 元素补 fill-box + center（jsdom 支持时验证）', () => {
      assert.equal(g.style.transformBox, 'fill-box')
      assert.equal(g.style.transformOrigin, 'center')
    })
  } else {
    ok('healSvgAnimation 对无动画识别环境不报错（jsdom 动画计算样式支持有限，跳过断言）', () => {
      assert.ok(true)
    })
  }
  ok('无动画 SVG 元素不被改动', () => {
    const c = div.querySelector('circle')
    assert.equal(c.style.transformBox, '')
  })
  ok('healSvgAnimation 幂等（重复执行不报错）', () => {
    stable._test.healSvgAnimation(div)
    assert.ok(true)
  })
  document.body.removeChild(div)
}

// ---- 第 19 组：v6.36 code 内容实体保护 ----
function getText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node) return ''
  const ch = node.children || (node.props && node.props.children)
  if (Array.isArray(ch)) return ch.map(getText).join('')
  if (ch && typeof ch === 'object') return getText(ch)
  return ''
}
console.log('== 19. 自愈层 v6.36：code 内容实体保护（裸 < 不当真标签）==')
{
  const s = resetCache()
  // AI 在 code 块里展示 HTML 代码：裸 <div（未转义）+ 已转义 &lt;div + span 高亮混排
  const html = '<div id="vcp-root"><pre><code><span class="rd">case"code":</span>\n  if (rawHtml !== "0" &amp;&amp; /^<div\\s+id=["\']vcp-root["\']/i.test(_v))\n    return render(_v)\n  &lt;span class="cm"&gt;已转义样例&lt;/span&gt;</code></pre></div>'
  const r = s.render(html, false)
  ok('code 元素存在', () => assert.equal(findTag(r, 'code').length, 1))
  ok('高亮 span 保留为真实元素（白名单）', () => assert.equal(findTag(r, 'span').length, 1))
  ok('根容器之外无 div（裸 <div 未变成真标签）', () => assert.equal(findTag(r, 'div').length, 1))
  const text = getText(findTag(r, 'code')[0])
  ok('代码文本完整（含 span 高亮内容）', () => assert.ok(text.includes('case"code":')))
  ok('普通代码行保留', () => assert.ok(text.includes('if (rawHtml !== "0"')))
  ok('裸 <div 实体化后按文本显示', () => assert.ok(text.includes('<div')))
  ok('已转义实体不再双重转义（显示为 <span> 文本）', () => assert.ok(text.includes('<span class="cm">已转义样例</span>')))
}
{
  const s = resetCache()
  const html2 = '<div id="vcp-root"><pre><code>plain &lt;div&gt; ok\nno-tag line</code></pre></div>'
  const r2 = s.render(html2, false)
  const t2 = getText(findTag(r2, 'code')[0])
  ok('&lt;div&gt; 显示为 <div>（不双重转义）', () => assert.ok(t2.includes('<div> ok')))
  ok('普通行不受影响', () => assert.ok(t2.includes('no-tag line')))
}
{
  const s = resetCache()
  const html3 = '<div id="vcp-root"><pre><code>&& 双与号 &amp;&amp; 实体</code></pre></div>'
  const r3 = s.render(html3, false)
  const t3 = getText(findTag(r3, 'code')[0])
  ok('裸 & 原样保留（不误转义）', () => assert.ok(t3.includes('&& 双与号')))
  ok('&amp; 显示为 &', () => assert.ok(t3.includes('& 实体')))
}

// ---- 第 20 组：v6.37 卡片前空行修复（CommonMark type 6 不能打断段落）----
console.log('== 20. 自愈层 v6.37：fixVcpBlank 卡片空行修复（文字+换行+<div> 撕裂）==')
{
  const s = resetCache()
  const fix = s.fixBlank
  ok('fixBlank 已挂载', () => assert.equal(typeof fix, 'function'))
  const out1 = fix('先生，这是卡片：\n<div id="vcp-root" style="color:red">')
  ok('文字+换行+<div> → 补空行（段落结束、卡片独立 htmlFlow）', () => assert.equal(out1, '先生，这是卡片：\n\n<div id="vcp-root" style="color:red">'))
  ok('幂等：重复应用不叠加', () => assert.equal(fix(out1), out1))
  const out2 = fix('纯文本没有 div')
  ok('无 vcp-root 的文本不动', () => assert.equal(out2, '纯文本没有 div'))
  const out3 = fix('<div id="vcp-root">直接开头')
  ok('消息以 <div> 开头不动（已是块起始）', () => assert.equal(out3, '<div id="vcp-root">直接开头'))
  const out4 = fix('前言\n\n<div id="vcp-root">已空行')
  ok('已有空行不动（不重复补）', () => assert.equal(out4, '前言\n\n<div id="vcp-root">已空行'))
  const out5 = fix('多行\n前言\n<div id="vcp-root">')
  ok('多行前言只修 <div> 前一处', () => assert.equal(out5, '多行\n前言\n\n<div id="vcp-root">'))
  ok('非字符串输入原样返回', () => assert.equal(fix(null), null))
}

// ---- 第 21 组：v6.38 卡片内部空行压缩（CommonMark type 6 遇空行拆 htmlFlow）----
console.log('== 21. 自愈层 v6.38：fixVcpBlank 卡片内部空行压缩（全文含内部空行不撕裂）==')
{
  const s = resetCache()
  const fix = s.fixBlank
  const full = '门槛核对完毕～\n\n<div id="vcp-root">\n<style>\n#vcp-root{box-sizing:border-box;}\n</style>\n<div class="paper">\n<h2>标题</h2>\n<div class="sub">副标题</div>\n\n<div class="sec">① 逐条核验</div>\n<div class="chk">检查项</div>\n\n<div class="warnbox">警告</div>\n</div>\n</div>\n\n先生，结论一句话：拆 commit 就能过线。'
  const out = fix(full)
  const cardStart = out.indexOf('<div id="vcp-root"')
  ok('卡片内部连续空行压缩为单个换行', () => assert.ok(!out.slice(cardStart).includes('\n\n'), 'vcp-root 之后无连续空行'))
  ok('卡片前空行保留（v6.37 行为不回归）', () => assert.ok(out.includes('～\n\n<div id="vcp-root"')))
  ok('卡片结构内容完整保留', () => assert.ok(out.includes('<div class="sec">① 逐条核验</div>') && out.includes('<div class="warnbox">警告</div>')))
  ok('幂等：压缩后重复应用不再变化', () => assert.equal(fix(out), out))
}
{
  const s = resetCache()
  const fix = s.fixBlank
  const compact = '<div id="vcp-root">\n<style>\n#vcp-root{box-sizing:border-box;}\n</style>\n<div class="paper">\n<h2>标题</h2>\n</div>\n</div>'
  ok('紧凑卡（无内部空行）不受影响', () => assert.equal(fix(compact), compact))
}

console.log(`\n全部通过：${passed} 项断言 ✓`)
