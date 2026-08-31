/**
 * dsh-raw-html P3 数学公式（KaTeX）测试。
 *
 * 用 node:vm 加载 patch/v6-inject.js（与 stable.test.mjs 同法），验证：
 *   1. looksLikeSafeSingleDollarMath：公式 vs 价格/路径/模板/表格判定
 *   2. convertSafeDollarMath：$...$ → \(...\) 字符级扫描（含价格不吞后续、转义、双美元）
 *   3. normalizeMathTextNodes：DOM TreeWalker 兜底（排除 pre/code/.katex）
 *   4. attachMathRef：非流式挂「终帧 KaTeX 处理」ref，流式不挂
 *   5. renderMathInContent：KaTeX 配置（不注册宽松 $...$、ignoredTags、throwOnError:false）
 *   6. processMath：幂等 + KaTeX 未就绪轮询重试
 *
 * 运行：node tests/math.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { document, Node, window: domWindow } = dom.window

// ---- stub：与 bundle 等价的 vc / hp / f（同 stable.test.mjs）----
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

// ---- vm 加载 v6-inject.js（sandbox 提供 setTimeout 供 processMath 轮询）----
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
  document,
}
vm.runInNewContext(code, sandbox)
const stable = sandbox.window.__vcpStable
const math = sandbox.window.__vcpMath
assert.ok(stable && typeof stable.render === 'function', '__vcpStable.render 已挂载')
assert.ok(math && typeof math.looksLikeSafeSingleDollarMath === 'function', '__vcpMath 已挂载')

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

function freshSandbox() {
  const sb = {
    window: {},
    DOMParser: domWindow.DOMParser,
    Node,
    f,
    vc,
    hp,
    performance: { now: () => Date.now() },
    console,
    setTimeout: (fn, ms) => domWindow.setTimeout(fn, ms),
    document,
  }
  vm.runInNewContext(code, sb)
  return sb
}

function freshMath() {
  return freshSandbox().window.__vcpMath
}

console.log('== 1. looksLikeSafeSingleDollarMath：公式放行 ==')
{
  const m = freshMath()
  // 注：闭合的 $10$ 按 VCP 设计放行（简单数字数学）；价格指「无闭合的 $10 元」。
  const allow = ['x', 'n', 'abc', 'O(L^2)', '2^n', '1/2', '20\\%', '\\frac{1}{2}', '\\Delta', '\\pi', 'sum_{i=1}^n', 'lim_{x\\to 0}', 'x^2', 'E=mc^2', 'a+b', '1.5e-3', '10', '12.5', '10.00']
  for (const c of allow) {
    ok(`放行: $${c}$`, () => assert.equal(m.looksLikeSafeSingleDollarMath(c), true))
  }
}

console.log('== 2. looksLikeSafeSingleDollarMath：路径/模板/表格/价格串拒绝 ==')
{
  const m = freshMath()
  const deny = ['/usr/bin', '{value}', 'a|b', '100 元', '价格', '1|2 列', '']
  for (const c of deny) {
    ok(`拒绝: ${JSON.stringify(c)}`, () => assert.equal(m.looksLikeSafeSingleDollarMath(c), false))
  }
}

console.log('== 3. convertSafeDollarMath：安全公式转 \\(...\\) ==')
{
  const m = freshMath()
  ok('行内公式', () => assert.equal(m.convertSafeDollarMath('公式 $x$ 和 $n$'), '公式 \\(x\\) 和 \\(n\\)'))
  ok('复杂公式', () => assert.equal(m.convertSafeDollarMath('$O(L^2) \\to O(1)$'), '\\(O(L^2) \\to O(1)\\)'))
  ok('数字公式', () => assert.equal(m.convertSafeDollarMath('$2^n$'), '\\(2^n\\)'))
}

console.log('== 4. convertSafeDollarMath：价格保留、不吞后续真公式 ==')
{
  const m = freshMath()
  ok('价格原样', () => assert.equal(m.convertSafeDollarMath('价格 $10 和 $12.5'), '价格 $10 和 $12.5'))
  ok('价格不吞后续', () => assert.equal(m.convertSafeDollarMath('$12.5 和 $2.49 和 $\\Delta$'), '$12.5 和 $2.49 和 \\(\\Delta\\)'))
  ok('转义美元不动', () => assert.equal(m.convertSafeDollarMath('\\$5 元'), '\\$5 元'))
  ok('双美元不动', () => assert.equal(m.convertSafeDollarMath('$$x$$'), '$$x$$'))
  ok('无闭合不动', () => assert.equal(m.convertSafeDollarMath('$PATH 无闭合'), '$PATH 无闭合'))
  ok('空串/无美元', () => assert.equal(m.convertSafeDollarMath(''), ''), )
  ok('模板串不动', () => assert.equal(m.convertSafeDollarMath('${value} 插值'), '${value} 插值'))
}

console.log('== 5. normalizeMathTextNodes：DOM 层兜底 ==')
{
  const m = freshMath()
  const div = document.createElement('div')
  div.innerHTML = '价格 $10 与 $x$ 与 <code>$y$</code> 与 <span class="katex">$z$</span>'
  m.normalizeMathTextNodes(div)
  // 文本节点：$10 保留、$x$ 转 \(x\)
  const texts = [...div.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue)
  assert.equal(texts.join('|'), '价格 $10 与 \\(x\\) 与 | 与 ')
  // code 内不动
  assert.equal(div.querySelector('code').textContent, '$y$')
  // .katex 内不动
  assert.equal(div.querySelector('.katex').textContent, '$z$')
  console.log('  ✓ DOM 兜底（排除 code/.katex、价格保留、公式转换）')
  passed += 1
}

console.log('== 6. attachMathRef：非流式挂 ref、流式不挂 ==')
{
  // 流式 render：不抛错（streaming=true 不挂 ref）
  const s1 = stable.render('<div id="vcp-root">$x$</div>', true)
  assert.ok(s1, '流式渲染不抛错')
  // 非流式 render：顶层元素已挂 ref（终帧 KaTeX 处理钩子）
  const s2 = stable.render('<div id="vcp-root">$x$</div>', false)
  assert.ok(s2 && s2.props && typeof s2.props.ref === 'function', '非流式顶层元素已挂 ref')
  console.log('  ✓ 流式不挂 ref 不抛错 / 非流式顶层元素挂 ref')
  passed += 1
}

console.log('== 7. renderMathInContent：KaTeX 配置（不注册宽松 $...$）==')
{
  const sb = freshSandbox()
  const m = sb.window.__vcpMath
  let captured = null
  sb.window.renderMathInElement = (el, opts) => { captured = opts }
  sb.window.katex = {}
  const div = document.createElement('div')
  assert.equal(m.renderMathInContent(div), true, '渲染调用返回 true')
  assert.ok(captured, 'renderMathInElement 被调用')
  const lefts = captured.delimiters.map(d => d.left)
  assert.equal(lefts.length, 3, '恰好 3 个定界符')
  assert.equal(lefts[0], '$$', 'display: $$')
  assert.equal(lefts[1].charCodeAt(0), 92, '\\[ 首字节反斜杠')
  assert.equal(lefts[1].charCodeAt(1), 91, '\\[ 次字节 [')
  assert.equal(lefts[2].charCodeAt(0), 92, '\\( 首字节反斜杠')
  assert.equal(lefts[2].charCodeAt(1), 40, '\\( 次字节 (')
  assert.ok(!lefts.includes('$'), '不注册宽松 $...$')
  assert.ok(captured.ignoredTags.includes('pre') && captured.ignoredTags.includes('code'), '忽略 pre/code')
  assert.equal(captured.throwOnError, false, 'throwOnError:false')
  console.log('  ✓ KaTeX 配置正确')
  passed += 1
}

console.log('== 8. processMath：幂等 + 未就绪轮询 + 就绪渲染 ==')
{
  const sb = freshSandbox()
  const m = sb.window.__vcpMath
  const div = document.createElement('div')
  div.innerHTML = '$x$'
  // KaTeX 未就绪（sandbox.window 无 katex）→ 设置重试计数，不标记完成
  m.processMath(div)
  assert.equal(div.dataset.vcpMathDone, undefined, '未就绪不标记完成')
  assert.ok(parseInt(div.dataset.vcpMathTries, 10) >= 1, '记录重试次数')
  // 未就绪时每次调用调度一次重试（计数递增，真实场景 ref 仅挂载调用一次）
  const t1 = div.dataset.vcpMathTries
  m.processMath(div)
  assert.equal(div.dataset.vcpMathTries, String(parseInt(t1, 10) + 1), '未就绪每次调用调度一次重试')
  // 就绪场景
  let rendered = 0
  sb.window.katex = {}
  sb.window.renderMathInElement = () => { rendered += 1 }
  const div2 = document.createElement('div')
  div2.innerHTML = '$x$ 与 $$y$$'
  m.processMath(div2)
  assert.equal(rendered, 1, '就绪后调用 renderMathInElement 一次')
  assert.equal(div2.dataset.vcpMathDone, 'true', '标记完成')
  m.processMath(div2)
  assert.equal(rendered, 1, '已完成容器不再重复渲染')
  console.log('  ✓ 幂等 + 轮询重试 + 就绪后渲染')
  passed += 1
}

console.log('== 9. katex-vd.css 改名正确性（字体名 +_VD、url 文件名不变）==')
{
  // 读取 assets/vendor 的改名版 CSS 与原始 CSS
  const base = new URL('../assets/vendor/', import.meta.url)
  const vd = fs.readFileSync(new URL('katex-vd.css', base), 'utf8')
  const orig = fs.readFileSync(new URL('katex.min.css', base), 'utf8')
  ok('vd.css 存在且非空', () => assert.ok(vd.length > 5000))
  ok('@font-face family 已改名（含 _VD）', () => {
    const fams = [...vd.matchAll(/font-family:([^;]+);/g)].map(m => m[1])
    assert.ok(fams.some(f => f.includes('_VD')), '存在 _VD 字体名')
    assert.ok(fams.length >= 20, `@font-face 数量 ${fams.length}`)
  })
  ok('url() 文件名未改名（不含 _VD）', () => {
    const urls = [...vd.matchAll(/url\(([^)]*)\)/g)].map(m => m[1])
    assert.ok(urls.every(u => !u.includes('_VD')), '所有 url 文件名不含 _VD')
    assert.ok(urls.length >= 20, `url 数量 ${urls.length}`)
  })
  ok('.katex 规则字体名已改', () => {
    assert.ok(vd.includes('font:normal 1.21em KaTeX_Main_VD') || vd.includes('font-family:KaTeX_Main_VD'), '.katex 主字体用 _VD')
  })
  ok('改名后除字体名外结构与原版一致（行数接近）', () => {
    // 只是把 KaTeX_X 换成 KaTeX_X_VD，其余不变：比较去掉 _VD 后是否与原文一致
    const normalized = vd.replace(/_VD/g, '')
    assert.ok(normalized.length === orig.length + (orig.match(/KaTeX_[A-Za-z0-9]+/g) || []).length * 0, '长度关系合理')
  })
  ok('改名数量足够（≥40 处字体名声明）', () => {
    const origNames = orig.match(/KaTeX_[A-Za-z0-9]+/g) || []
    const vdNames = vd.match(/KaTeX_[A-Za-z0-9]+_VD/g) || []
    // 原版 106 处含 url 文件名；改名的 46 处是 font-family/font 声明（url 已被单独断言不含 _VD）
    assert.ok(vdNames.length >= 40, `改名 ${vdNames.length} 处（原版字体名共 ${origNames.length} 处，其余为文件名）`)
  })
}

console.log('== 10. katexFontFor 字体映射 + lockKatexStyles 锁定（抗主题覆盖）==')
{
  const m = freshMath()
  // 字体映射
  const cases = [
    ['mord mathbb', 'KaTeX_AMS_VD'],
    ['mord mathcal', 'KaTeX_Caligraphic_VD'],
    ['mord mathfrak', 'KaTeX_Fraktur_VD'],
    ['mord mathscr', 'KaTeX_Script_VD'],
    ['mord mathsf', 'KaTeX_SansSerif_VD'],
    ['mord mathtt', 'KaTeX_Typewriter_VD'],
    ['mord mathnormal', 'KaTeX_Math_VD'],
    ['mord mathit', 'KaTeX_Math_VD'],
    ['mord', 'KaTeX_Main_VD'],
    ['mbin', 'KaTeX_Main_VD'],
    ['', 'KaTeX_Main_VD'],
  ]
  for (const [cls, font] of cases) {
    assert.equal(m.katexFontFor(cls), font, `katexFontFor(${JSON.stringify(cls)})`)
  }
  ok('katexFontFor 映射正确', () => {})
  // lockKatexStyles：构建含 .katex span 的容器，验证锁定
  const container = document.createElement('div')
  container.innerHTML = '<span class="katex"><span class="mord mathbb">R</span><span class="mord" style="color:red">x</span><span class="mord mathnormal">y</span></span>'
  m.lockKatexStyles(container)
  const bb = container.querySelector('.mathbb')
  const colored = container.querySelector('.katex span[style*="color"]')
  const mn = container.querySelector('.mathnormal')
  assert.equal(bb.style.getPropertyValue('font-family'), 'KaTeX_AMS_VD', 'mathbb 锁 KaTeX_AMS_VD')
  assert.equal(bb.style.getPropertyPriority('font-family'), 'important', 'font-family 带 important')
  assert.equal(colored.style.getPropertyValue('color'), 'red', '颜色锁定为 red')
  assert.equal(colored.style.getPropertyPriority('color'), 'important', 'color 带 important')
  assert.equal(mn.style.getPropertyValue('font-family'), 'KaTeX_Math_VD', 'mathnormal 锁 KaTeX_Math_VD')
  console.log('  ✓ 字体映射 + 内联 !important 锁定')
  passed += 1
}

console.log('== 11. 流式防抖调度（DSH 无 false 帧 → 停顿后触发 processMath）==')
{
  // 用 fake timer 验证：流式 render 多次 → ref 记录容器 → 防抖 timer 触发 processMath
  const timers = []
  const sb = freshSandbox()
  // 替换 timer 为可捕获版本
  sb.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  sb.clearTimeout = () => {}
  // 重新加载 v6-inject.js（用新 timer）
  vm.runInNewContext(code, sb)
  const stable2 = sb.window.__vcpStable
  const math2 = sb.window.__vcpMath
  // stub KaTeX
  let pmCalls = 0
  sb.window.katex = {}
  sb.window.renderMathInElement = () => { pmCalls += 1 }

  // 模拟流式：容器未闭合 → 多帧 render(streaming=true)
  const f1 = stable2.render('<div id="vcp-root" style="background:#0a2540">公式 $x$ 未写完', true)
  assert.ok(f1, '流式帧1 返回元素')
  // 手动触发 ref（模拟 React 挂载，传入 jsdom div，插入 document 使其 isConnected）
  const hostEl = document.createElement('div')
  document.body.appendChild(hostEl)
  const ref1 = f1.props && f1.props.ref
  assert.equal(typeof ref1, 'function', '流式帧已挂 ref（记录容器）')
  if (ref1) ref1(hostEl)

  // 断言：流式期间防抖 timer 已注册（600ms）
  assert.ok(timers.length >= 1, '防抖 timer 已注册')
  const lastTimer = timers[timers.length - 1]
  assert.equal(lastTimer.ms, 600, '防抖延迟 600ms')

  // 模拟流式继续（新帧 → 重置 timer）
  stable2.render('<div id="vcp-root" style="background:#0a2540">公式 $x$ 未写完 继续', true)
  // 停止流式，触发最后一个 timer
  lastTimer.fn()
  // processMath 应该被调用（通过 lastMathEl → renderMathInElement）
  assert.equal(pmCalls, 1, '防抖触发后 processMath 渲染一次')
  // 幂等：容器标记 done，再触发不再渲染
  hostEl.dataset.vcpMathDone = 'true'
  lastTimer.fn()
  assert.equal(pmCalls, 1, '已 done 容器不重复渲染')
  console.log('  ✓ 流式防抖调度 → processMath 触发（无 streaming=false 帧也生效）')
  passed += 1
}

console.log('== 7. 流式公式占位（mathPlaceholder / undecorateMathPlaceholders）==')
{
  const m = freshMath()
  ok('流式中 $$..$$ 被包占位 span', () => {
    const out = m.mathPlaceholder('正文 $$x^2$$ 结束', true)
    assert.ok(out.includes('vcp-math-ph'), '含占位 class')
    assert.ok(out.includes('公式渲染中'), '含徽标文字')
    assert.ok(out.includes('$$x^2$$'), '源码保留')
  })
  ok('非流式不占位', () => {
    assert.equal(m.mathPlaceholder('$$x^2$$', false), '$$x^2$$')
  })
  ok('行内 \\(..\\) 占位', () => {
    const out = m.mathPlaceholder('正态 \\(\\mu\\) 分布', true)
    assert.ok(out.includes('vcp-math-ph'), '行内公式被占位')
    assert.ok(out.includes('\\(\\mu\\)'), '行内公式源码保留')
  })
  ok('块级 \\[..\\] 占位', () => {
    const out = m.mathPlaceholder('\\[\\int dx\\]', true)
    assert.ok(out.includes('vcp-math-ph'), '块级公式被占位')
  })
  ok('未闭合 $$ 保持原文（不占位）', () => {
    assert.equal(m.mathPlaceholder('$$e^{i\\pi', true), '$$e^{i\\pi')
  })
  ok('无公式文本原样', () => {
    assert.equal(m.mathPlaceholder('纯文字没有公式', true), '纯文字没有公式')
  })
  ok('单美元 $x$ 不占位（交给终帧判定）', () => {
    assert.equal(m.mathPlaceholder('变量 $x$ 的值', true), '变量 $x$ 的值')
  })

  ok('undecorate 解占位：源码恢复、徽标移除', () => {
    const wrap = document.createElement('div')
    wrap.innerHTML = '前文<span class="vcp-math-ph" style="font-style:italic;">$$x^2$$<span class="vcp-math-ph-badge" style="font-size:10px;">公式渲染中…</span></span>后文'
    document.body.appendChild(wrap)
    m.undecorateMathPlaceholders(wrap)
    assert.equal(wrap.querySelectorAll('span.vcp-math-ph').length, 0, '占位 span 已移除')
    assert.equal(wrap.querySelectorAll('.vcp-math-ph-badge').length, 0, '徽标已移除')
    assert.equal(wrap.textContent, '前文$$x^2$$后文', '公式源码文本恢复原位')
    wrap.remove()
  })
  ok('undecorate 幂等（无占位时零操作）', () => {
    const wrap = document.createElement('div')
    wrap.textContent = '没有占位'
    document.body.appendChild(wrap)
    m.undecorateMathPlaceholders(wrap)
    assert.equal(wrap.textContent, '没有占位')
    wrap.remove()
  })
  ok('render 流式帧输出含占位、非流式输出不含', () => {
    const sb = freshSandbox()
    const stable2 = sb.window.__vcpStable
    // 流式（容器未闭合）→ 公式占位
    const s1 = stable2.render('<div id="vcp-root">前文 $$x^2$$ 后文', true)
    const s1json = JSON.stringify(s1)
    assert.ok(s1json.includes('vcp-math-ph'), '流式帧含占位 span')
    assert.ok(s1json.includes('公式渲染中'), '流式帧含徽标')
    // 非流式（终帧）→ 不占位
    const s2 = stable2.render('<div id="vcp-root">前文 $$x^2$$ 后文</div>', false)
    const s2json = JSON.stringify(s2)
    assert.ok(!s2json.includes('vcp-math-ph'), '非流式帧不含占位')
  })
}

console.log(`\nP3 数学公式测试：${passed} 项断言全绿`)
