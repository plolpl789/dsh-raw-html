/**
 * 同名诱饵测试：验证 v6-inject 的别名探测是「行为验证」而不是「按名字顺序猜」。
 *
 * 背景（2026-09-11 实测根因）：0.1.5-rc.2 的 bundle 是扁平作用域，压缩器把无关模块的
 * 函数也压成了 vc（状态库浅比较）/ hp（SVG 图标组件）。旧探针按名字顺序取，抓到诱饵
 * → __vcpVc 返回布尔 false → 卡片渲染成空。
 *
 * 本测试同时喂「真函数 + 同名诱饵」，断言：
 *   A. 第三代绑定（c8/wg/d/I）+ 诱饵 → 真函数被选中，诱饵零调用，render 出卡片。
 *   B. 旧代绑定（只有 vc/hp）+ 第三代名字缺席 → 仍能选中 vc/hp（不回归）。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require('/tmp/vcp-test/node_modules/jsdom')

const INJECT = process.env.VCP_INJECT || new URL('../patch/v6-inject.js', import.meta.url).pathname
const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { Node, window: domWindow } = dom.window

let passed = 0
function ok(name, fn) { fn(); passed += 1; console.log(`  ✓ ${name}`) }

// ---- 真的 style 解析器（第三代名 wg / 旧代名 hp 共用同一实现） ----
function makeStyleParser(counter) {
  return function (sv) {
    counter.n += 1
    const r = {}
    for (const i of String(sv).split(';')) {
      const s = i.indexOf(':')
      if (s === -1) continue
      const k = i.slice(0, s).trim().replace(/-([a-z])/g, (h, p) => p.toUpperCase())
      r[k] = i.slice(s + 1).trim()
    }
    return r
  }
}

// ---- 真的 DOM→React 转换器（第三代名 c8 / 旧代名 vc 共用同一实现） ----
function makeConverter(styleFn, counter) {
  return function (n, r) {
    counter.n += 1
    if (n.nodeType === Node.TEXT_NODE) return n.textContent
    if (n.nodeType !== Node.ELEMENT_NODE) return null
    const s = { key: r }
    for (const c of n.attributes) {
      if (c.name === 'style') { s.style = styleFn(c.value); continue }
      if (c.name === 'class') { s.className = c.value; continue }
      s[c.name] = c.value
    }
    const kids = [...n.childNodes].map((c) => makeConverter(styleFn, counter)(c, 0)).filter((x) => x != null && x !== '')
    return { tag: n.localName, props: s, children: kids }
  }
}

// ---- 诱饵：与真实 bundle 里那两个撞名函数等价 ----
function decoyVc(t, r) {            // 状态库浅比较：只回布尔
  if (Object.is(t, r)) return true
  if (typeof t !== 'object' || t === null || typeof r !== 'object' || r === null) return false
  return false
}
function decoyHp(props) {           // SVG 图标组件：回一个 React 元素
  const size = (props && props.size) || 16
  return { $$typeof: Symbol.for('react.element'), type: 'svg', key: null, props: { width: size, height: size } }
}

function load(bindings) {
  const code = fs.readFileSync(INJECT, 'utf8')
  const sandbox = {
    window: {}, DOMParser: domWindow.DOMParser, Node,
    performance: { now: () => Date.now() }, console,
    setTimeout: (fn, ms) => domWindow.setTimeout(fn, ms),
    clearTimeout: (id) => domWindow.clearTimeout(id),
    ...bindings,
  }
  vm.runInNewContext(code, sandbox)
  return sandbox
}

console.log('== A. 第三代绑定 + 同名诱饵 ==')
{
  const styleCounter = { n: 0 }
  const convCounter = { n: 0 }
  const wg = makeStyleParser(styleCounter)
  const c8 = makeConverter(wg, convCounter)
  let vcCalls = 0
  let hpCalls = 0
  const bindings = {
    c8, wg,
    d: { jsx: (type, props, key) => ({ type, props, key }) },
    I: { Fragment: Symbol('gen3-fragment') },
    vc: function (t, r) { vcCalls += 1; return decoyVc(t, r) },
    hp: function (p) { hpCalls += 1; return decoyHp(p) },
  }
  const sb = load(bindings)
  const stable = sb.window.__vcpStable

  ok('__vcpStable 已挂载', () => {
    assert.ok(stable && typeof stable.render === 'function')
  })

  let r
  ok('render 返回卡片树（不是布尔 false）', () => {
    r = stable.render('<div id="vcp-root" style="background:#FAF7F2"><h3>标题</h3><p style="color:#333333">正文</p></div>', false)
    assert.ok(r && typeof r === 'object', `render 返回 ${JSON.stringify(r)}（诱饵被抓 → 卡片渲染成空）`)
    assert.match(r.props.id, /^vcp-msg-\d+$/)
  })

  ok('诱饵 vc 零调用（转换器靠形态识别，不靠名字顺序）', () => {
    assert.equal(vcCalls, 0, `诱饵 vc 被调用了 ${vcCalls} 次`)
    assert.ok(convCounter.n > 0, '真转换器 c8 没被调用')
  })

  ok('样式经真解析器 wg 生效，诱饵 hp 零调用', () => {
    assert.ok(styleCounter.n > 0, '真解析器 wg 没被调用')
    assert.equal(hpCalls, 0, `诱饵 hp 被调用了 ${hpCalls} 次`)
    const json = JSON.stringify(r)
    assert.ok(json.includes('#FAF7F2'), '卡片背景样式丢失：' + json.slice(0, 200))
    assert.ok(json.includes('#333333'), '正文颜色样式丢失')
  })

  ok('流式两帧不抛错且内容递增', () => {
    const s2 = load(bindings).window.__vcpStable
    const f1 = '<div id="vcp-root"><h3>甲</h3>'
    const f2 = f1 + '<p>乙</p>'
    const r1 = s2.render(f1, true)
    const r2 = s2.render(f2, true)
    assert.ok(r1 && r2)
    assert.ok(JSON.stringify(r2).includes('乙'))
  })
}

console.log('== B. 旧代绑定（无第三代名字）不回归 ==')
{
  const styleCounter = { n: 0 }
  const convCounter = { n: 0 }
  const hp = makeStyleParser(styleCounter)
  const vc = makeConverter(hp, convCounter)
  const sb = load({
    vc, hp,
    f: { jsx: (type, props, key) => ({ type, props, key }), Fragment: Symbol('gen1-fragment') },
  })
  const stable = sb.window.__vcpStable

  ok('旧代 vc/hp 仍被选中并渲染出卡片', () => {
    const r = stable.render('<div id="vcp-root" style="background:#FAF7F2"><p>正文</p></div>', false)
    assert.ok(r && typeof r === 'object', `render 返回 ${JSON.stringify(r)}`)
    assert.match(r.props.id, /^vcp-msg-\d+$/)
    assert.ok(styleCounter.n > 0, '旧代 hp 没被调用')
    assert.ok(JSON.stringify(r).includes('#FAF7F2'), '样式丢失')
  })
}

console.log(`\n全部通过：${passed} 项 ✓`)
