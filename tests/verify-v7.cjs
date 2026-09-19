#!/usr/bin/env node
/**
 * dsh-raw-html · v7 补丁自检（对应 patch/install-v7.cjs）
 * =====================================================
 * 三层校验，全部可离线复跑：
 *   ① 结构层：把补丁打到 fixture bundle 副本上 → 必须 `node --check` 通过 + 六个特征齐备
 *   ② 行为层：从打好的 bundle 中取出注入的 v6 模块 → 在最小 DOM 里执行 → 用测试卡
 *              调 `render()` → 必须返回 React 元素（而不是 null / 字符串）
 *   ③ 幂等层：再次执行补丁 → 必须"已适配（跳过）"，且文件字节不再变化
 *
 * 用法：
 *   node tests/verify-v7.cjs                      # 用 fixtures/index-015rc2-source.js
 *   node tests/verify-v7.cjs <sourceBundle.js>    # 指定源 bundle
 *
 * 说明：①/③ 不需要任何第三方依赖；② 需要能解析 DOM —— 优先用 dsh 自带的 domino
 * （`@mixmark-io/domino`），取不到时自动跳过行为层并明确告知（不假装通过）。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const PATCHER = path.join(ROOT, 'patch', 'install-v7.cjs')
// 模块路径：上游仓库为 patch/v6-inject.js；归档布局可能在更上层
const MODULE = [
  path.join(ROOT, 'patch', 'v6-inject.js'),
  path.join(ROOT, 'v6-inject.js'),
  path.join(ROOT, '..', 'v6-inject.js'),
  path.join(ROOT, '..', '..', 'v6-inject.js'),
].find((p) => fs.existsSync(p)) || path.join(ROOT, 'patch', 'v6-inject.js')
const DEFAULT_SRC = path.join(ROOT, 'fixtures', 'index-015rc2-source.js')
const srcFixture = process.argv[2] || DEFAULT_SRC

let pass = 0, fail = 0
const ok = (name, cond, extra) => { cond ? (pass++, console.log('  ✓ ' + name + (extra ? ' — ' + extra : ''))) : (fail++, console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''))) }

/** 找一个可用的 DOM 实现 */
function loadDomino() {
  const cands = []
  const nm = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@mixmark-io', 'domino')
  cands.push(nm)
  cands.push(path.join(process.cwd(), 'node_modules', '@mixmark-io', 'domino'))
  for (const c of cands) { try { if (fs.existsSync(c)) return require(c) } catch { } }
  return null
}

/** 从打好的 bundle 里取出注入的 v6 模块源码（两个标记之间） */
function extractModule(bundleSrc) {
  const a = bundleSrc.indexOf('/*__VCP_V7_MODULE__*/')
  const b = bundleSrc.indexOf('/*__VCP_V7_MODULE_END__*/')
  if (a < 0 || b < 0) return null
  let seg = bundleSrc.slice(a, b)
  seg = seg.replace(/[\s\S]*?var f=__VCP_REACT__;\n/, '')   // 去掉引导头
  return seg.replace(/\n\s*;return true\}\)\([\s\S]*$/, '').trim()
}

function main() {
  console.log('=== verify-v7 ===')
  console.log('源 fixture: ' + srcFixture)
  if (!fs.existsSync(srcFixture)) { console.error('✗ 源 bundle 不存在'); process.exit(1) }
  if (!fs.existsSync(PATCHER)) { console.error('✗ 找不到 patch/install-v7.cjs'); process.exit(1) }
  if (!fs.existsSync(MODULE)) { console.error('✗ 找不到 patch/v6-inject.js'); process.exit(1) }

  // ---- ① 结构层：打补丁 + 语法 + 特征 ----
  console.log('\n[① 结构层]')
  const work = path.join(os.tmpdir(), 'vcp-verify-v7-' + Date.now() + '.js')
  fs.copyFileSync(srcFixture, work)

  let out = ''
  try { out = execFileSync(process.execPath, [PATCHER, work], { encoding: 'utf8' }) } catch (e) { out = (e.stdout || '') + (e.stderr || '') }
  ok('补丁执行未抛错', !/✗/.test(out), out.trim().split('\n').pop())
  try { execFileSync(process.execPath, ['--check', work], { stdio: 'pipe' }); ok('node --check 通过', true) }
  catch (e) { ok('node --check 通过', false, String(e.stderr || e.message).slice(0, 120)) }

  const src0 = fs.readFileSync(srcFixture, 'utf8')
  const src1 = fs.readFileSync(work, 'utf8')
  ok('源 bundle 未含渲染能力（前置条件）', !src0.includes('window.__vcpStable'))
  const feats = [
    ['v6 稳定区模块注入', '__VCP_V7_MODULE__'],
    ['html 分支三态化', 'case"html":return function(){'],
    ['属性循环适配', '__vcpHpGlobal'],
    ['解析器空行修复（gg）', 'function gg(t){t=(function(s)'],
    ['解析器空行修复（流式 update）', 'update(t){t=(function(s)'],
    ['孤片兜底（整卡文本缓存）', '__vcpCardText'],
  ]
  for (const [name, token] of feats) ok(name, src1.includes(token))
  ok('文件确实被修改', src1 !== src0, src0.length + ' → ' + src1.length + ' bytes')

  // ---- ③ 幂等层 ----
  console.log('\n[③ 幂等层]')
  let out2 = ''
  try { out2 = execFileSync(process.execPath, [PATCHER, work], { encoding: 'utf8' }) } catch (e) { out2 = (e.stdout || '') + (e.stderr || '') }
  const src2 = fs.readFileSync(work, 'utf8')
  ok('二次执行报告"已是适配态"', /已是适配态|无需重打/.test(out2), out2.trim().split('\n').pop())
  ok('二次执行未改动字节', src2 === src1)

  // ---- ② 行为层：执行注入模块 + 渲染测试卡 ----
  console.log('\n[② 行为层]')
  const domino = loadDomino()
  if (!domino) {
    console.log('  ⚠ 未找到 @mixmark-io/domino —— 跳过行为层（不算通过，请在有 dsh 环境处复跑）')
  } else {
    const mod = extractModule(src1)
    ok('能取出注入的 v6 模块', !!mod && mod.length > 1000, mod ? mod.length + ' 字符' : '未取到')
    if (mod) {
      const doc = domino.createDocument('<!doctype html><html><body></body></html>')
      const store = {}
      const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) }, removeItem: (k) => { delete store[k] } }
      const DOMParserStub = function () { this.parseFromString = (h) => domino.createDocument(h) }
      const win = {
        document: doc, DOMParser: DOMParserStub, localStorage, console, navigator: { userAgent: 'verify' },
        location: { href: 'http://verify/' }, performance: { now: () => Date.now() },
        setTimeout: () => 0, clearTimeout: () => { }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => { },
        MutationObserver: function () { this.observe = () => { }; this.disconnect = () => { } },
        ResizeObserver: function () { this.observe = () => { }; this.disconnect = () => { } },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }),
      }
      win.window = win; win.globalThis = win; win.self = win
      // 最小 React 桩（只用于判定"是否返回元素"，不判视觉）
      const el = (type, props, kids) => ({ __el: true, type, props: props || {}, kids: kids || [] })
      const jsx = { Fragment: Symbol.for('Fragment'), jsx: (t, p) => el(t, p), jsxs: (t, p) => el(t, p), createElement: (t, p, ...k) => el(t, p, k) }
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
        return el(node.localName, props, kids)
      }
      const sandbox = {
        window: win, document: doc, DOMParser: DOMParserStub, localStorage, console,
        setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, requestAnimationFrame: win.requestAnimationFrame,
        cancelAnimationFrame: win.cancelAnimationFrame, MutationObserver: win.MutationObserver, ResizeObserver: win.ResizeObserver,
        navigator: win.navigator, location: win.location, performance: win.performance,
        getComputedStyle: win.getComputedStyle, matchMedia: win.matchMedia,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, COMMENT_NODE: 8 }, f: jsx, vc, wg,
      }
      sandbox.globalThis = sandbox; sandbox.self = sandbox
      vm.createContext(sandbox)
      let renderErr = null
      try {
        vm.runInContext('(function(f, vc, wg, window, document, DOMParser, Node){\n' + mod + '\n})', sandbox, { filename: 'v6-inject.js' })(jsx, vc, wg, win, doc, DOMParserStub, sandbox.Node)
      } catch (e) { renderErr = e }
      ok('模块在最小 DOM 中可执行', !renderErr, renderErr && renderErr.message)
      const stable = win.__vcpStable || sandbox.__vcpStable
      ok('window.__vcpStable.render 已挂载', !!(stable && typeof stable.render === 'function'))

      const CARD = '<div id="vcp-root" style="background:#0D0D0D;color:#E6EDF3;padding:18px;box-sizing:border-box">' +
        '<div style="font-weight:700">标题</div><div>正文内容</div></div>'
      if (stable && typeof stable.render === 'function') {
        for (const streaming of [false, true]) {
          try {
            const r = stable.render(CARD, streaming)
            ok('render(streaming=' + streaming + ') 返回元素', !!(r && r.__el))
          } catch (e) { ok('render(streaming=' + streaming + ') 返回元素', false, e.message) }
        }
        try { const r0 = stable.render('</div>', false); ok('孤立闭合片段不误渲染（返回 null/空）', r0 === null) }
        catch (e) { ok('孤立闭合片段不误渲染（返回 null/空）', false, e.message) }
      }
    }
  }

  try { fs.unlinkSync(work) } catch { }
  console.log('\n=== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ===')
  process.exit(fail ? 1 : 0)
}

main()
