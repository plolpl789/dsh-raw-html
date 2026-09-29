/**
 * 跨代适配自测（无外部依赖：不装 jsdom、不需要真的 dsh bundle）。
 *
 * 做法：把五个已知压缩形态各写成一份**合成 bundle**（只保留结构指纹：DOM→React 转换器、
 * 属性循环、markdown switch 的 case"html"/case"code"），然后用**真安装器**
 * （patch/install-v6.cjs）逐份跑一遍，断言：
 *
 *   1. 形态抽取认出该代的真实标识符（vdom / 属性变量 / React 命名空间 / code 渲染器）；
 *   2. 安装成功（exit 0）、产物带齐特征、`node --check` 通过（安装器内部已做）；
 *   3. 幂等：再跑一次不重写文件（字节不变）；
 *   4. 认不出的形态**安全中止**（exit ≠ 0 且文件一字未改）——绝不猜。
 *
 * 运行：node tests/gen-shape.test.mjs        （临时目录可用 VCP_TMP 覆盖）
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { extractShape, buildAnchors } = require('../patch/gen-shape.cjs')

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const INSTALLER = path.join(ROOT, 'patch', 'install-v6.cjs')
const TMP = process.env.VCP_TMP || fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-gen-shape-'))

let passed = 0
let failed = 0
function ok(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  XX  ${name}\n      ${error.message}`)
  }
}

/**
 * 合成一份 bundle：只写安装器依赖的结构，其余用最小噪声补齐。
 * @param {object} g - 该代的标识符表。
 */
function synth(g) {
  const vdom =
    `function ${g.vdom}(${g.p1},${g.p2}){` +    `if(${g.p1}.nodeType===Node.TEXT_NODE)return ${g.p1}.textContent;` +
    `if(${g.p1}.nodeType!==Node.ELEMENT_NODE)return null;` +
    `const ${g.node}=${g.p1},${g.props}={key:${g.p2}};` +
    `for(const ${g.attr} of ${g.node}.attributes)` +
    `${g.attr}.name==="class"?${g.props}.className=${g.attr}.value:` +
    `${g.attr}.name==="style"?${g.props}.style=${g.style}(${g.attr}.value):` +
    `${g.props}[${g.attr}.name]=${g.attr}.value;` +
    `const ${g.kids}=[...${g.node}.childNodes].map(${g.vdom});` +
    `return ${g.kids}.length===0?${g.react}.createElement(${g.node}.localName,${g.props}):${g.react}.createElement(${g.node}.localName,${g.props},{children:${g.kids}})}`
  const sw =
    `function ${g.sw}(${g.a},${g.b},${g.c}){switch(${g.a}.type){` +
    `case"text":return ${g.a}.value;` +
    `case"html":return ${g.a}.value;` +
    `case"code":return ${g.code}(${g.a},${g.b},${g.c});}}`
  // 前缀一个普通函数：真 bundle 的注入锚点是「}function X(…){」——即紧跟在别的函数之后。
  return `/* synthetic ${g.label} bundle */\nfunction prev(){return 0}${vdom}\n${sw}\nconst noise="case\\"html\\":return x.value;";\n`
}

/** 五代的真实形态（名字取自各代实测 bundle）。 */
const GENS = [
  { label: 'rc.5~rc.7', vdom: 'vc', p1: 'n', p2: 'r', node: 'i', props: 's', attr: 'c', style: 'hp', react: 'f', kids: 'o', sw: 'Z1', a: 'n', b: 'r', c: 'i', code: 'wp', expect: { vdomFn: 'vc', attrVar: 'c', nodeVar: 'i', propsVar: 's', swNode: 'n', swC: 'i', codeFn: 'wp', reactNs: 'f' } },
  { label: 'rc.8~0.1.1', vdom: 'Xu', p1: 'n', p2: 'i', node: 'l', props: 'u', attr: 'd', style: 'jd', react: 'f', kids: 'o', sw: 'Z2', a: 'n', b: 'i', c: 'l', code: 'wp2', expect: { vdomFn: 'Xu', attrVar: 'd', nodeVar: 'l', propsVar: 'u', swNode: 'n', swC: 'l', codeFn: 'wp2', reactNs: 'f' } },
  { label: '0.1.5-alpha.2', vdom: 'u5', p1: 't', p2: 'r', node: 'i', props: 's', attr: 'u', style: 'xg', react: 'I', kids: 'a', sw: 'Z3', a: 't', b: 'r', c: 'i', code: 'Lg', expect: { vdomFn: 'u5', attrVar: 'u', nodeVar: 'i', propsVar: 's', swNode: 't', swC: 'i', codeFn: 'Lg', reactNs: 'I' } },
  { label: '0.1.5-rc.2', vdom: 'c8', p1: 't', p2: 'r', node: 'i', props: 's', attr: 'c', style: 'wg', react: 'I', kids: 'a', sw: 'B3', a: 't', b: 'r', c: 'i', code: 'Lg', expect: { vdomFn: 'c8', attrVar: 'c', nodeVar: 'i', propsVar: 's', swNode: 't', swC: 'i', codeFn: 'Lg', reactNs: 'I' } },
  { label: '0.1.7-rc.1', vdom: 'K6', p1: 'e', p2: 'n', node: 'o', props: 's', attr: 'u', style: 'Sj', react: 'S', kids: 'a', sw: 'Sa', a: 'e', b: 'n', c: 'o', code: 'Tj', expect: { vdomFn: 'K6', attrVar: 'u', nodeVar: 'o', propsVar: 's', swNode: 'e', swC: 'o', codeFn: 'Tj', reactNs: 'S' } },
  { label: '0.2.0-rc.1', vdom: 'k8', p1: 'e', p2: 'n', node: 'o', props: 's', attr: 'u', style: 'wg', react: 'j', kids: 'a', sw: 'Zb', a: 'e', b: 'n', c: 'o', code: 'jb', expect: { vdomFn: 'k8', attrVar: 'u', nodeVar: 'o', propsVar: 's', swNode: 'e', swC: 'o', codeFn: 'jb', reactNs: 'j' } },
]

console.log(`临时目录：${TMP}`)
fs.mkdirSync(TMP, { recursive: true })

for (const g of GENS) {
  const text = synth(g)
  const file = path.join(TMP, `synth-${g.vdom}.js`)

  ok(`[${g.label}] 形态抽取认出真实标识符`, () => {
    const s = extractShape(text)
    assert.ok(s, 'extractShape 返回 null')
    for (const [k, v] of Object.entries(g.expect)) {
      assert.equal(s[k], v, `${k}: 期望 ${v}，实得 ${s[k]}`)
    }
    const a = buildAnchors(s)
    assert.equal(a.defBefore, `}function ${g.vdom}(${g.p1},${g.p2}){`)
    assert.ok(a.hostAlias.includes(`__vcpHostVdom=${g.vdom}`), 'hostAlias 未带上 vdom 名')
    assert.ok(a.hostAlias.includes(`__vcpHostReact=${g.react}`), 'hostAlias 未带上 React 命名空间')
    assert.ok(a.vcLoop.includes(`for(const ${g.attr} of ${g.node}.attributes)`), '加固循环未用真实变量名')
  })

  ok(`[${g.label}] 安装器端到端打得上（含 node --check 与特征自检）`, () => {
    fs.writeFileSync(file, text, 'utf8')
    const before = fs.statSync(file).size
    const out = execFileSync(process.execPath, [INSTALLER, file], { encoding: 'utf8' })
    assert.match(out, /按结构抽取锚点/, '安装器没走形状抽取')
    const after = fs.readFileSync(file, 'utf8')
    assert.ok(after.length > before, '文件没变长')
    for (const mark of ['window.__vcpStable', 'var __vcpHostVdom=', 'window.__dshInput', 'setProperty(p,v,"important")']) {
      assert.ok(after.includes(mark), `产物缺特征：${mark}`)
    }
    assert.ok(!after.includes(`case"html":return ${g.a}.value;`), '原始 case"html" 仍在')
  })

  ok(`[${g.label}] 幂等：复跑不改写`, () => {
    const first = fs.readFileSync(file)
    const out = execFileSync(process.execPath, [INSTALLER, file], { encoding: 'utf8' })
    assert.match(out, /已是 v6 最新形态|已是 .* 无需操作/, `复跑未跳过：${out.slice(0, 200)}`)
    assert.ok(first.equals(fs.readFileSync(file)), '复跑改动了文件')
  })
}

console.log('\n== 认不出的形态：必须安全中止、一字不改 ==')
{
  const file = path.join(TMP, 'unknown-shape.js')
  const text = 'function totallyDifferent(a,b){return a+b}\nconst x="case\\"html\\":return 1;"\n'
  fs.writeFileSync(file, text, 'utf8')
  ok('未知形态 exit≠0 且文件未改', () => {
    let code = 0
    try {
      execFileSync(process.execPath, [INSTALLER, file], { encoding: 'utf8', stdio: 'pipe' })
    } catch (error) {
      code = error.status
    }
    assert.notEqual(code, 0, '应当中止（非 0 退出）')
    assert.equal(fs.readFileSync(file, 'utf8'), text, '中止却改动了文件')
  })
  ok('extractShape 对未知形态返回 null', () => {
    assert.equal(extractShape(text), null)
  })
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
