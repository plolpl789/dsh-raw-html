/**
 * dsh-raw-html bundle 完整性测试。
 *
 * 校验已 patch 的 dsh-web-frontend dist bundle：
 *   1. 语法完整（node --check）
 *   2. case"html" 分支关键特征（渲染开关 / 表情转换 / 流式渲染 / 动画防闪）
 *   3. vc() 增强特征（onclick 桥 / script 过滤 / style 过滤 / URL 白名单）
 *
 * 运行：node tests/bundle.test.mjs [bundle路径]
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

function findBundle() {
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null
  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    const assets = path.join(d, 'dist', 'assets')
    if (!fs.existsSync(assets)) return
    for (const f of fs.readdirSync(assets)) {
      if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
    }
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  // POSIX（Linux/macOS）：$DSH_HOME 或 ~/.dsh 下的 profile 解析路径
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  addDir(path.join(dshHome, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

const bundle = findBundle()
assert.ok(bundle, '未找到 dsh-web-frontend bundle')
console.log(`bundle: ${bundle}`)

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('== 1. 语法完整性 ==')
ok('node --check 通过', () => {
  execFileSync(process.execPath, ['--check', bundle], { stdio: 'pipe' })
})

const t = fs.readFileSync(bundle, 'utf8')

console.log('== 2. case"html" 分支特征 ==')
ok('渲染开关 dsh.rawHtml', () => assert.ok(t.includes('dsh.rawHtml')))
ok('稳定区模块 __vcpStable', () => assert.ok(t.includes('__vcpStable')))
ok('case"html" 调 __vcpStable.render', () => assert.ok(
  t.includes('__vcpStable.render(n.value,i.streaming)')
  || t.includes('__vcpStable.render(n.value,l.streaming)')
  || t.includes('__vcpStable.render(t.value,i.streaming)'),
))
ok('图片转换正则 ![..](..)', () => assert.ok(t.includes('!\\[([^\\]]*)\\]\\(([^)]+)\\)')))
ok('图片 URL 白名单 data:image', () => assert.ok(t.includes('data:image\\/')))
ok('流式动画剥离正则', () => assert.ok(t.includes('animation:([^;"\']*);?')))
ok('流式中保留 infinite', () => assert.ok(t.includes('/infinite/.test(x)')))

console.log('== 3. v6 稳定区模块（注入 vc 定义前）==')
ok('扫描器 inContainer 模式', () => assert.ok(t.includes('inContainer')))
ok('稳定区 tailStart 切点', () => assert.ok(t.includes('tailStart')))
ok('rawtext 处理（script/style）', () => assert.ok(t.includes('RAWTEXT')))
ok('void 标签表', () => assert.ok(t.includes('VOID_TAGS')))
ok('缓存键区分流式/非流式', () => assert.ok(t.includes("(streaming ? 's:' : 'f:')")))
ok('容器开标签 props 解析', () => assert.ok(t.includes('parseOpen')))

console.log('== 4. 属性循环安全特征（vc/Xu/u5 三代）==')
ok('onclick→input 桥', () => assert.ok(t.includes('__dshInput')))
ok('on* 属性安全过滤', () => assert.ok(
  t.includes('/^on/i.test(c.name)') || t.includes('/^on/i.test(d.name)') || t.includes('/^on/i.test(u.name)'),
))
ok('script 标签过滤', () => assert.ok(t.includes('i.localName==="script"') || t.includes('l.localName==="script"')))
ok('style 危险属性过滤', () => assert.ok(t.includes('position\\s*:\\s*fixed')))
ok('z-index 过滤', () => assert.ok(t.includes('z-index\\s*:\\s*\\d{4,}')))
ok('content: 过滤', () => assert.ok(t.includes('content\\s*:[^;]')))
ok('href URL 白名单 mailto', () => assert.ok(t.includes('mailto:')))
ok('src URL 白名单 data:image', () => assert.ok(t.includes('data:image\\/')))
if (t.includes('function u5(t,r)')) {
  ok('第三代宿主桥 window.__vcpHost', () => assert.ok(t.includes('window.__vcpHost={React:I')))
}

console.log('== 5. Mermaid 联动特征 ==')
ok('renderMermaidInContent 已注入', () => assert.ok(t.includes('renderMermaidInContent')))
ok('mermaidFixSmartChars 已注入', () => assert.ok(t.includes('mermaidFixSmartChars')))
ok('mermaid.run 调用', () => assert.ok(t.includes('mermaid.run')))
ok('渲染失败回退代码块', () => assert.ok(t.includes('vcp-mermaid')))

console.log('== 5. P3 数学公式（KaTeX）特征 ==')
ok('__vcpMath 模块挂载', () => assert.ok(t.includes('__vcpMath')))
ok('单美元安全判定', () => assert.ok(t.includes('looksLikeSafeSingleDollarMath')))
ok('价格/路径/模板排除正则', () => assert.ok(t.includes('isSimpleNumericMath')))
ok('KaTeX renderMathInElement', () => assert.ok(t.includes('renderMathInElement')))
ok('终帧挂载钩子 attachMathRef', () => assert.ok(t.includes('attachMathRef')))
ok('不注册宽松 $...$（防价格误配）', () => assert.ok(t.includes("left: '$$'") || t.includes('left:"$$"')))
ok('ignoredTags 排除 pre/code', () => assert.ok(t.includes("ignoredTags")))
ok('throwOnError:false', () => assert.ok(t.includes('throwOnError:!1') || t.includes('throwOnError:false')))
ok('字体锁定 lockKatexStyles（抗主题覆盖）', () => assert.ok(t.includes('lockKatexStyles')))
ok('KaTeX 字体映射 katexFontFor', () => assert.ok(t.includes('katexFontFor')))
ok('内联 !important 锁字体（setProperty important）', () => assert.ok(t.includes("setProperty('font-family'")))
ok('ref 顶层字段（React18 createElement 提取 ref，非 props.ref）', () => assert.ok(t.includes("'ref' in node")))
ok('流式防抖调度 scheduleMath', () => assert.ok(t.includes('scheduleMath')))

console.log(`\n全部通过：${passed} 项断言 ✓`)
