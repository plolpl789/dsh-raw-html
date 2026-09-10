/**
 * dsh-raw-html 第三代前端（0.1.5-alpha.2+）宿主桥集成测试。
 *
 * 用「最小第三代 fixture」串起整条安装链，验证移植后的锚点确实能把
 * DSH 0.1.5 这套「markdown 管线无 HTML 解析器」的前端接回 VCP 渲染：
 *   1. install-all.cjs 第三代探测（u5/xg 形态）→ case"html" 钩子 + 宿主桥 + v6 模块
 *   2. 打补丁后的 fixture 在「模块作用域没有 vc/hp/f」的环境里加载
 *      （只靠 window.__vcpHost）→ window.__vcpStable 正常挂载
 *   3. 真实 case"html" 分支（Z2）渲染卡片 → 返回元素树而非字面文本
 *   4. 安全过滤：script 元素过滤、onclick 桥接、javascript: URL 白名单
 *   5. 幂等：重复 install-all 不重复注入、文件字节不变
 *
 * 依赖 jsdom（经 tests/load-jsdom.cjs 可移植解析：JSDOM_PATH 或本地安装）。
 * 运行：node tests/gen3-host.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.resolve(here, '..')

const { JSDOM } = require('./load-jsdom.cjs')()

// ---- 最小第三代 fixture：锚点形态与 DSH 0.1.5-alpha.2 bundle 完全一致 --------
// xg = style 字符串→对象；u5 = DOM→React（原始无过滤形态，由 install-v6 加固）；
// Z2 = markdown 渲染 switch（html 分支返回字面文本，由 install-v6 换成 v6 钩子）；
// I / a = 模块作用域的 React / jsx runtime（压缩名，与真实 bundle 相同）。
const FIXTURE = `var I = {
  Fragment: Symbol.for('react.fragment'),
  createElement: function (type, props) {
    var children = [].slice.call(arguments, 2)
    var p = {}
    for (var k in props) p[k] = props[k]
    if (children.length) p.children = children.length === 1 ? children[0] : children
    var el = { type: type, props: p }
    if (props && props.ref) { el.ref = props.ref; delete p.ref }
    if (props && props.key !== undefined) { el.key = props.key; delete p.key }
    return el
  },
}
var a = {
  jsx: function (type, props) { return { type: type, props: props || {} } },
  jsxs: function (type, props) { return { type: type, props: props || {} } },
}
function xg(t){const r={};for(const i of t.split(";")){const s=i.indexOf(":");if(s===-1)continue;const c=i.slice(0,s).trim().replace(/-([a-z])/g,(u,h)=>h.toUpperCase());r[c]=i.slice(s+1).trim()}return r}function u5(t,r){if(t.nodeType===Node.TEXT_NODE)return t.textContent;if(t.nodeType!==Node.ELEMENT_NODE)return null;const i=t,s={key:r};for(const u of i.attributes)u.name==="class"?s.className=u.value:u.name==="style"?s.style=xg(u.value):s[u.name]=u.value;const c=[...i.childNodes].map(u5);return c.length===0?I.createElement(i.localName,s):I.createElement(i.localName,s,...c)}
function Z2(t,r,i){switch(t.type){case"text":return t.value;case"code":return null;case"html":return t.value;default:return null}}
`

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

const tmp = path.join(here, 'tmp-gen3-bundle.js')
fs.rmSync(tmp, { force: true })
for (const stale of fs.existsSync(here) ? fs.readdirSync(here) : []) {
  if (stale.startsWith('tmp-gen3-bundle.js.bak-')) fs.rmSync(path.join(here, stale), { force: true })
}
fs.writeFileSync(tmp, FIXTURE, 'utf8')

try {
  console.log('== 1. install-all 第三代安装链 ==')
  const runInstall = () => execFileSync(process.execPath, [path.join(pluginDir, 'patch', 'install-all.cjs'), tmp], { encoding: 'utf8' })
  const log1 = runInstall()
  ok('install-all exit 0', () => assert.ok(log1.includes('全部补丁就位')))
  ok('探测到第三代前端', () => assert.ok(log1.includes('第三代前端')))
  ok('case"html" 第四代钩子写入', () => assert.ok(log1.includes('case"html"')))
  ok('宿主桥注入', () => assert.ok(log1.includes('宿主桥')))

  const patched = fs.readFileSync(tmp, 'utf8')
  ok('原始 html 分支已消失', () => assert.equal(patched.split('case"html":return t.value;').length - 1, 0))
  ok('v6 钩子调用 __vcpStable.render', () => assert.ok(patched.includes('__vcpStable.render(t.value,i.streaming)')))
  ok('u5 已加固（script 过滤）', () => assert.ok(patched.includes('i.localName==="script"') && !patched.includes('for(const u of i.attributes)u.name==="class"?s.className')))
  ok('可信模式条件放行已写入', () => assert.ok(patched.includes('window.__vcpTrusted==="function"')))
  ok('fixture 语法完整', () => execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }))

  console.log('== 2. 无 vc/hp/f 的第三代环境加载 ==')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const storage = new Map()
  const sandbox = {
    window: {},
    document: dom.window.document,
    Node: dom.window.Node,
    DOMParser: dom.window.DOMParser,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    console,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
  }
  sandbox.window = sandbox.window
  Object.assign(sandbox.window, {})
  // v6-inject 把状态挂在 window 上；让 sandbox.window 就是 sandbox 自身
  vm.createContext(sandbox)
  vm.runInContext('var window = this;', sandbox)
  vm.runInContext(patched, sandbox)
  const stable = sandbox.window.__vcpStable
  ok('window.__vcpStable 已挂载（未依赖模块作用域 vc/hp/f）', () => assert.equal(typeof stable.render, 'function'))
  ok('window.__vcpHost 已由宿主桥建立', () => assert.ok(sandbox.window.__vcpHost && typeof sandbox.window.__vcpHost.vc === 'function'))
  ok('vcp-fast 缓存挂载', () => assert.ok(sandbox.window.__vcpFast && sandbox.window.__vcpFast.c))

  console.log('== 3. 走真实 case"html" 分支渲染卡片 ==')
  const card = '<div id="vcp-root" style="background:#0a2540;color:#ffffff">'
    + '<h3 style="font-size:20px">标题</h3>'
    + '<p onclick="input(\'你好\')" style="font-size:16px">正文</p>'
    + '<script>window.__pwned=1</script>'
    + '<a href="javascript:alert(1)">危险链接</a>'
    + '</div>'
  const tree = vm.runInContext(`Z2(${JSON.stringify({ type: 'html', value: card })}, 0, { streaming: false })`, sandbox)
  ok('html 分支返回元素树（而非字面文本）', () => assert.equal(typeof tree, 'object'))
  ok('不是原始字符串', () => assert.notEqual(tree, card))

  // 遍历元素树，收集标签与 props
  const tags = []
  const propsList = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (typeof node === 'string' || typeof node === 'number') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node.type === 'function' || typeof node.type === 'symbol' || typeof node.type === 'string') {
      if (typeof node.type === 'string') tags.push(node.type)
      propsList.push(node.props || {})
    } else if (node.tag) {
      tags.push(node.tag)
      propsList.push(node.props || {})
    }
    const ch = node.props ? node.props.children : node.children
    if (Array.isArray(ch)) ch.forEach(walk)
    else if (ch !== undefined && ch !== null) walk(ch)
  }
  walk(tree)
  ok('卡片根容器渲染为 div', () => assert.ok(tags.includes('div')))
  ok('标题元素渲染', () => assert.ok(tags.includes('h3')))
  ok('正文元素渲染', () => assert.ok(tags.includes('p')))
  ok('script 元素被过滤（安全默认）', () => assert.ok(!tags.includes('script')))
  ok('onclick 未作为原生属性透传', () => assert.ok(!propsList.some(p => 'onclick' in p)))
  ok('onclick 桥接为 React onClick', () => assert.ok(propsList.some(p => typeof p.onClick === 'function')))
  ok('javascript: URL 被白名单拒绝', () => assert.ok(!propsList.some(p => typeof p.href === 'string' && /^javascript:/i.test(p.href))))
  ok('style 解析为对象', () => assert.ok(propsList.some(p => p.style && typeof p.style === 'object' && p.style.background === '#0a2540')))

  console.log('== 4. 可信模式放行（默认关闭 = 安全）==')
  ok('script 过滤在可信模式开启前保持', () => {
    assert.equal(tree === card, false)
    assert.ok(!tags.includes('script'))
  })

  console.log('== 5. 幂等：重复安装不改文件 ==')
  const before = fs.readFileSync(tmp)
  const log2 = runInstall()
  const after = fs.readFileSync(tmp)
  ok('二次安装 exit 0', () => assert.ok(log2.includes('全部补丁就位') || log2.includes('跳过')))
  ok('二次安装字节不变', () => assert.ok(before.equals(after)))
  ok('未重复注入 __vcpStable 模块', () => assert.equal(after.toString('utf8').split('__DSH_V6_INJECT_START__').length - 1, 1))
  ok('宿主桥未重复注入（模块级 1 处 + case 内兜底 1 处）', () => assert.equal(after.toString('utf8').split('window.__vcpHost={React:I').length - 1, 2))

  console.log(`\n全部通过：${passed} 项断言 ✓`)
} finally {
  fs.rmSync(tmp, { force: true })
  for (const stale of fs.existsSync(here) ? fs.readdirSync(here) : []) {
    if (stale.startsWith('tmp-gen3-bundle.js.bak-')) fs.rmSync(path.join(here, stale), { force: true })
  }
}
