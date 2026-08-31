/**
 * dsh-raw-html P3-Mermaid 图表测试。
 *
 * 用 node:vm 加载 patch/v6-inject.js（与 math.test.mjs 同法），stub window.mermaid，
 * 验证：
 *   1. mermaidFixSmartChars：智能字符 —–－ → --
 *   2. renderMermaidInContent：
 *      - 检测 pre>code.language-mermaid → 替换为 div.mermaid → mermaid.run 调用
 *      - .mermaid 元素检测
 *      - 幂等（渲染成功标记后不重复）
 *      - mermaid 未就绪返回 false
 *      - 渲染失败回退为代码块（源码保留）
 *      - 空源码跳过
 *   3. processMath 集成：mermaid 就绪时一并调用 renderMermaidInContent
 *
 * 运行：node tests/mermaid.test.mjs
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

const code = fs.readFileSync(new URL('../patch/v6-inject.js', import.meta.url), 'utf8')

function freshSandbox() {
  const sb = {
    window: {},
    DOMParser: domWindow.DOMParser,
    Node,
    f,
    vc,
    hp,
    performance: { now: () => Date.now() },
    console: { debug: () => {}, log: () => {}, error: () => {} },
    setTimeout: (fn, ms) => domWindow.setTimeout(fn, ms),
    document,
  }
  vm.runInNewContext(code, sb)
  return sb
}

function freshMath() {
  return freshSandbox().window.__vcpMath
}

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// flush：等待 renderMermaidInContent 的 setTimeout(0) 布局让位 + run 完成
const flush = () => new Promise((r) => domWindow.setTimeout(r, 20))

console.log('== 0. mermaidBlockConvert 源码层转换 ==')
{
  const m = freshMath()
  ok('闭合 pre 转 div.mermaid', () => {
    const out = m.mermaidBlockConvert('<div id="vcp-root"><pre class="language-mermaid" style="background:#000;"><code class="language-mermaid">flowchart TD&#10;  A --&gt; B</code></pre></div>')
    assert.ok(out.includes('<div class="mermaid"'), '转成 div.mermaid')
    assert.ok(out.includes('flowchart TD'), '源码保留')
    assert.ok(!out.includes('<pre'), 'pre 已移除')
    assert.ok(out.includes('margin:14px 0'), '容器样式带间距')
  })
  ok('未闭合 pre 不转换（流式中）', () => {
    const out = m.mermaidBlockConvert('<div id="vcp-root"><pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  A --&gt;')
    assert.ok(out.includes('<pre'), '未闭合 pre 保持原样')
    assert.ok(!out.includes('<div class="mermaid"'), '不转 div')
  })
  ok('无 mermaid 内容原样', () => {
    const t = '<div id="vcp-root">普通内容</div>'
    assert.equal(m.mermaidBlockConvert(t), t)
  })
  ok('code 标签去除（含嵌套属性）', () => {
    const out = m.mermaidBlockConvert('<pre class="language-mermaid"><code class="language-mermaid" style="color:red">graph LR&#10;  A --&gt; B</code></pre>')
    assert.ok(!out.includes('<code'), 'code 标签已去除')
    assert.ok(out.includes('graph LR'), '内容保留')
  })
}

console.log('== 1. mermaidFixSmartChars 智能字符修复 ==')
{
  const m = freshMath()
  ok('长破折号 → --', () => assert.equal(m.mermaidFixSmartChars('A --|是| B'), 'A --|是| B'))
  ok('—（em dash）→ --', () => assert.equal(m.mermaidFixSmartChars('A — B'), 'A -- B'))
  ok('–（en dash）→ --', () => assert.equal(m.mermaidFixSmartChars('A – B'), 'A -- B'))
  ok('－（全角）→ --', () => assert.equal(m.mermaidFixSmartChars('A － B'), 'A -- B'))
  ok('混合智能字符', () => assert.equal(m.mermaidFixSmartChars('x — y – z － w'), 'x -- y -- z -- w'))
}

console.log('== 2. renderMermaidInContent：检测与渲染 ==')
{
  ok('pre>code.language-mermaid 检测并渲染', async () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = {
      initialize: () => {},
      run: ({ nodes }) => {
        runCalls += 1
        for (const n of nodes) n.innerHTML = '<svg class="mermaid-svg"><text>flowchart</text></svg>'
        return Promise.resolve()
      },
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<div>前文</div><pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  A --&gt; B</code></pre><div>后文</div>'
    document.body.appendChild(wrap)
    const ret = m.renderMermaidInContent(wrap)
    assert.equal(ret, true, '返回 true（有目标）')
    assert.equal(wrap.querySelectorAll('div.mermaid').length, 1, 'pre 被替换为 div.mermaid')
    assert.equal(wrap.querySelectorAll('pre.language-mermaid').length, 0, '原 pre 已移除')
    await flush()
    assert.equal(runCalls, 1, 'mermaid.run 调用一次（布局让位后）')
    const svg = wrap.querySelector('div.mermaid svg.mermaid-svg')
    assert.ok(svg, 'SVG 已渲染进 view')
    assert.equal(wrap.querySelector('div.mermaid .vcp-mermaid-view').dataset.vcpMermaidDone, 'true', 'done 标记已设（view 上）')
    wrap.remove()
  })

  ok('.mermaid 元素直接检测', async () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = {
      initialize: () => {},
      run: ({ nodes }) => { runCalls += 1; for (const n of nodes) n.innerHTML = '<svg></svg>'; return Promise.resolve() },
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<div class="mermaid">graph LR&#10;  A --&gt; B</div>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap)
    await flush()
    assert.equal(runCalls, 1, '.mermaid 元素被渲染')
    wrap.remove()
  })

  ok('幂等：渲染成功标记后不重复', async () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = {
      initialize: () => {},
      run: ({ nodes }) => { runCalls += 1; for (const n of nodes) n.innerHTML = '<svg></svg>'; return Promise.resolve() },
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  A --&gt; B</code></pre>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap)
    await flush() // 第一次渲染完成（done）
    m.renderMermaidInContent(wrap) // 第二次：div.mermaid 已 done
    await flush()
    assert.equal(runCalls, 1, '不重复渲染')
    wrap.remove()
  })

  ok('mermaid 未就绪返回 false', () => {
    const m = freshMath() // sandbox 无 window.mermaid
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD</code></pre>'
    document.body.appendChild(wrap)
    assert.equal(m.renderMermaidInContent(wrap), false, '未就绪不渲染')
    wrap.remove()
  })

  ok('空源码跳过', () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = { initialize: () => {}, run: () => { runCalls += 1; return Promise.resolve() } }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid"></code></pre>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap)
    assert.equal(runCalls, 0, '空源码不渲染')
    wrap.remove()
  })

  ok('渲染中（pending）不重复 run（防 SVG 叠加错位）', async () => {
    const sb = freshSandbox()
    let runCalls = 0
    let resolver = null
    sb.window.mermaid = {
      initialize: () => {},
      run: () => { runCalls += 1; return new Promise((r) => { resolver = r }) }, // 不 resolve，保持 pending
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD</code></pre>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap) // 第一次：pre → div.mermaid（pending 同步设置）
    m.renderMermaidInContent(wrap) // 第二次：pending → 跳过（run 未开始）
    assert.equal(runCalls, 0, 'pending 期间不重复 run（run 尚未启动）')
    await flush() // run 启动并 resolve → done
    assert.equal(runCalls, 1, '第一次 run 恰好一次')
    m.renderMermaidInContent(wrap) // 第三次：done → 跳过
    await flush()
    assert.equal(runCalls, 1, 'done 后不重复 run')
    wrap.remove()
  })

  ok('pre 已被移除（isConnected=false）跳过', () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = { initialize: () => {}, run: () => { runCalls += 1; return Promise.resolve() } }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD</code></pre>'
    document.body.appendChild(wrap)
    const pre = wrap.querySelector('pre')
    pre.remove() // 模拟 React 重建移除
    m.renderMermaidInContent(wrap)
    assert.equal(runCalls, 0, 'detached pre 不渲染')
    wrap.remove()
  })

  ok('SVG 缓存：重建后命中缓存不重复 run（免重解析，秒恢复）', async () => {
    const sb = freshSandbox()
    let runCalls = 0
    sb.window.mermaid = {
      initialize: () => {},
      run: ({ nodes }) => { runCalls += 1; for (const n of nodes) n.innerHTML = '<svg class="cached"><rect/></svg>'; return Promise.resolve() },
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD</code></pre>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap)
    await flush()
    assert.equal(runCalls, 1, '首次 run 一次')
    assert.ok(wrap.querySelector('div.mermaid svg.cached'), '首次渲染 SVG')
    // 模拟 React 重建：view 内容重置为源码（done 标记丢失）
    const view = wrap.querySelector('.vcp-mermaid-view')
    view.innerHTML = 'flowchart TD'
    delete view.dataset.vcpMermaidDone
    m.renderMermaidInContent(wrap)
    await flush()
    assert.equal(runCalls, 1, '缓存命中不重复 run')
    assert.ok(wrap.querySelector('div.mermaid svg.cached'), '缓存恢复 SVG')
    wrap.remove()
  })

  ok('渲染失败回退为代码块（源码保留）', async () => {
    const sb = freshSandbox()
    sb.window.mermaid = {
      initialize: () => {},
      run: () => Promise.reject(new Error('语法错误')),
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  A --&gt; B</code></pre>'
    document.body.appendChild(wrap)
    m.renderMermaidInContent(wrap)
    await flush()
    await flush()
    const pre = wrap.querySelector('pre.language-mermaid')
    assert.ok(pre, '失败后回退为 pre 代码块')
    assert.ok(pre.textContent.includes('flowchart TD'), '源码保留可读')
    wrap.remove()
  })

  ok('enhanceMermaid 工具栏：四按钮 + 缩放生效', () => {
    const sb = freshSandbox()
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    // 双层结构：外层 div.mermaid（控制条挂这层）+ 内层 view（滚动）
    wrap.innerHTML = '<div class="mermaid"><div class="vcp-mermaid-view"><svg width="400" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="200"/></svg></div></div>'
    document.body.appendChild(wrap)
    const view = wrap.querySelector('.vcp-mermaid-view')
    const outer = wrap.querySelector('div.mermaid')
    m.enhanceMermaid(view)
    const tb = wrap.querySelector('.vcp-mermaid-toolbar')
    const buttons = wrap.querySelectorAll('.vcp-mermaid-toolbar button')
    assert.equal(buttons.length, 4, '四个按钮：- / 100% / + / 适应')
    assert.equal(buttons[0].textContent, '−', '缩小按钮')
    assert.equal(buttons[1].textContent, '100%', '百分比按钮')
    assert.equal(buttons[2].textContent, '＋', '放大按钮')
    assert.equal(buttons[3].textContent, '适应', '适应按钮')
    assert.equal(tb.parentNode, outer, '控制条挂外层（不随内容滚动）')
    assert.equal(tb.style.position, 'absolute', '控制条绝对定位外层右上角')
    const svg = view.querySelector('svg')
    // 点 + → 布局宽度变大（真实尺寸缩放，容器可滚动）
    buttons[2].click()
    assert.ok(svg.style.width.includes('480'), `放大后宽=480px，实际: ${svg.style.width}`)
    assert.equal(buttons[1].textContent, '120%', '放大后百分比按钮显示 120%')
    // 点百分比按钮 → 还原 100%（width=400 + 文字 100%）
    buttons[1].click()
    assert.ok(svg.style.width.includes('400'), '还原 400px')
    assert.equal(buttons[1].textContent, '100%', '还原后百分比按钮显示 100%')
    // 点 - → 布局宽度变小 + 百分比更新
    buttons[0].click()
    assert.ok(svg.style.width.includes('320'), '缩小后宽=320px')
    assert.equal(buttons[1].textContent, '80%', '缩小后百分比按钮显示 80%')
    // 幂等：二次 enhance 不重复加工具栏
    m.enhanceMermaid(view)
    assert.equal(wrap.querySelectorAll('.vcp-mermaid-toolbar').length, 1, '工具栏不重复')
    wrap.remove()
  })
}

console.log('== 2.5 warmupMermaid 引擎预热 ==')
{
  ok('预热：mermaid 就绪时 initialize 提前执行', () => {
    const sb = freshSandbox()
    let initCalls = 0
    sb.window.mermaid = { initialize: () => { initCalls += 1 }, run: () => Promise.resolve() }
    const m = sb.window.__vcpMath
    m.warmupMermaid()
    assert.equal(initCalls, 1, 'initialize 被预热调用')
    assert.equal(sb.window.__mermaidInitialized, true, '初始化标记已设')
    m.warmupMermaid() // 幂等：已初始化不重复
    assert.equal(initCalls, 1, '预热幂等')
  })
  ok('mermaid 未就绪时预热静默跳过', () => {
    const m = freshMath() // sandbox 无 window.mermaid
    m.warmupMermaid() // 不抛错即可
  })
}

console.log('== 3. processMath 集成（mermaid 就绪时一并调用）==')
{
  ok('processMath 渲染 KaTeX + Mermaid 双通道', async () => {
    const sb = freshSandbox()
    let mmRun = 0
    sb.window.katex = {}
    sb.window.renderMathInElement = () => {}
    sb.window.mermaid = {
      initialize: () => {},
      run: ({ nodes }) => { mmRun += 1; for (const n of nodes) n.innerHTML = '<svg></svg>'; return Promise.resolve() },
    }
    const m = sb.window.__vcpMath
    const wrap = document.createElement('div')
    wrap.innerHTML = '<pre class="language-mermaid"><code class="language-mermaid">graph LR&#10;  A --&gt; B</code></pre>'
    document.body.appendChild(wrap)
    m.processMath(wrap)
    assert.equal(wrap.dataset.vcpMathDone, 'true', '幂等标记已设')
    assert.ok(wrap.querySelector('div.mermaid'), 'pre 已替换为 div.mermaid')
    await flush()
    assert.equal(mmRun, 1, 'mermaid.run 被 processMath 调用（布局让位后）')
    wrap.remove()
  })
}

console.log(`\nP3 Mermaid 测试：${passed} 项断言全绿`)
