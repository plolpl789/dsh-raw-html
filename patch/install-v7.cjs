#!/usr/bin/env node
/**
 * dsh-raw-html · 前端补丁（v7 代：dsh-web-frontend 0.1.5-rc.2 及以后）
 * =====================================================================
 * 背景
 * ----
 * `install-v6.cjs` 的两个锚点组覆盖到 `rc.8 / 0.1.1-rc.x`。dsh 0.1.5-rc.2 的前端把
 * markdown 渲染器换成了 react-markdown 风格实现，旧锚点 **全部 0 命中**，于是
 * `case"html"` 退化为 `return t.value;`（直接返回源码字符串）→ 消息里的 HTML 卡片
 * 在界面上一律显示为源码。
 *
 * 本脚本针对该结构落地同一套渲染能力：
 *   ① 注入 v6 稳定区模块（`patch/v6-inject.js`，与老代共用）
 *   ② `case"html"` → 三态化（localStorage `dsh.rawHtml` !== "0" 才渲染，异常回退）
 *   ③ DOM→React 属性循环适配（onclick 桥 / style 解析 / URL 白名单）
 *   ④ 解析器入口补回「卡内空行压缩」（v4.2/v4.3：非流式 `gg()` 与流式 `update()` 两处）
 *   ⑤ 孤片兜底（v6~v10）：markdown 把卡片按空行切成多个 html 片段时，
 *      纯闭合标签片段跳过、未闭合 vcp-root 片段改用解析前缓存的整卡文本渲染
 *
 * 设计取向（踩坑后固化）
 * --------------------
 *   - **确定性替换 + 逐处读回校验**：不依赖任何"是否已打过"的状态守卫（迭代补丁脚本
 *     的状态判断随版本演进会失真，本项目实测出现过"报已应用但钩子没进包"）。
 *   - **幂等**：已是最新态则按特征判定跳过；旧形态（含历史上的坏形态）会被清理。
 *   - **安全**：写前备份、`node --check` 语法门、特征门，任一失败自动回滚。
 *
 * 用法
 * ----
 *   node patch/install-v7.cjs [bundle路径]      # 打补丁（自动探测 bundle）
 *   node patch/install-v7.cjs [bundle路径] --verify   # 只校验，不写入
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const MARK_MODULE = '/*__VCP_V7_MODULE__*/'
const MARK_BLANK = 'fixVcpBlank'
const RE_ORPHAN_SRC = 'new RegExp("^<\\\\/[a-z]+>(\\\\s*<br\\\\s*\\\\/?>)?\\\\s*$","i")'
const RE_UNCLOSED_SRC = 'new RegExp("<div id=\\"vcp-root\\"[\\\\s\\\\S]*$")'

/** 探测 dsh-web-frontend 的 dist bundle（与上游 install-v6.cjs 一致） */
function findBundle() {
  const args = process.argv.slice(2).filter((a) => a !== '--verify')
  if (args[0]) return fs.existsSync(args[0]) ? args[0] : null
  const cands = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    try {
      const assets = path.join(d, 'dist', 'assets')
      if (!fs.existsSync(assets)) return
      for (const f of fs.readdirSync(assets)) if (/^index-[\w-]+\.js$/.test(f)) cands.push(path.join(assets, f))
    } catch { }
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return cands[0] || null
}

/** 锚点：本代前端的三处结构 */
const ANCHOR = {
  gg: 'function gg(t){return X5(t,{extensions:[J5(),o8(),mg(),pa()],mdastExtensions:[e6(),xa()]})}',
  stream: 'update(t){if(this.cached!==null&&t===this.prevText)return this.cached;',
  caseStart: 'case"html":return t.value;',
  caseRange: /case"html":return function\(\)\{[\s\S]*?\}\(\);(?=case"code")/,
  defAnchor: 'function c8(t,r){',
}

/** 卡内空行压缩 + 解析前文本缓存（两条解析入口共用同一段逻辑） */
function blankFix(withLeadingBlank) {
  const lead = withLeadingBlank
    ? 'var x=s.replace(/([^\\n])\\n(?= *<div id="vcp-root")/g,"$1\\n\\n");'
    : 'var x=s;'
  return (
    't=(function(s){if(typeof s!=="string")return s;' +
    'try{if(s.indexOf(\'<div id="vcp-root"\')!==-1)globalThis.__vcpCardText=s}catch(e){}' +
    'if(s.indexOf(\'<div id="vcp-root"\')===-1)return s;' + lead +
    'x=x.replace(/(<div id="vcp-root"[^>]*>)([\\s\\S]*)$/,function(m,open,rest){return open+rest.replace(/\\n[ \\t]*\\n+/g,"\\n")});' +
    'return x})(t);'
  )
}

/** case"html" 分支（三态化 + 孤片兜底 + 遥测 + 回退） */
function buildCase() {
  return [
    'case"html":return function(){',
    'var __on=!(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="0");',
    'var __ok=!!(typeof window!=="undefined"&&window.__vcpStable&&typeof window.__vcpStable.render==="function");',
    'var __v=String(t.value||"");',
    'var __vp=globalThis.__vcpCardText;',
    // ① 纯闭合标签孤片 → 跳过（避免同一张卡被渲染 N 次）
    'if(__on&&__ok&&__v.length<24&&' + RE_ORPHAN_SRC + '.test(__v)){console.warn("[vcp] 跳过孤立片段 "+JSON.stringify(__v));return null}',
    // ② 未闭合 vcp-root 片段（卡片被拆分后的首片）→ 用解析前的整卡文本渲染
    'if(__on&&__ok&&__v.indexOf(\'<div id="vcp-root"\')!==-1&&' + RE_UNCLOSED_SRC + '.test(__v)&&__vp&&__vp.length>__v.length){',
    'try{var __r2=window.__vcpStable.render(__vp,(i&&i.streaming));if(__r2!==null&&__r2!==undefined){console.warn("[vcp] 片段"+__v.length+" → 整卡"+__vp.length+" 渲染成功");return __r2}}',
    'catch(__e4){console.warn("[vcp] 整卡渲染失败："+(__e4&&__e4.message))}}',
    // ③ 正常渲染
    'if(__on&&__ok){try{var __vr=window.__vcpStable.render(__v,(i&&i.streaming));if(__vr!==null&&__vr!==undefined)return __vr}',
    'catch(__e2){console.warn("[vcp] html 渲染异常，已回退为纯文本",__e2)}}',
    // ④ 回退：剥标签纯文本（绝不把裸 HTML 串交给 React —— 会连累整条消息）
    'return __v.replace(/<[^>]*>/g,"").replace(/[ \\t]+\\n/g,"\\n").replace(/\\n{3,}/g,"\\n\\n").trim()}();',
  ].join('')
}

function main() {
  const verifyOnly = process.argv.includes('--verify')
  const bundle = findBundle()
  if (!bundle) { console.error('[v7] ✗ 未找到 dsh-web-frontend bundle（可传路径）'); process.exit(1) }
  console.log('[v7] bundle: ' + bundle)

  // v6-inject.js：上游仓库放在同目录 patch/ 下；本机验证时也可能在更上层（archive 布局）
  const modulePath = [
    path.join(__dirname, 'v6-inject.js'),
    path.join(__dirname, '..', 'v6-inject.js'),
    path.join(__dirname, '..', '..', 'v6-inject.js'),
  ].find((p) => fs.existsSync(p))
  if (!modulePath) { console.error('[v7] ✗ 缺少 v6-inject.js（应与本脚本同目录）'); process.exit(1) }
  const moduleSrc = fs.readFileSync(modulePath, 'utf8').trim()
  if (!moduleSrc.includes('window.__vcpStable')) { console.error('[v7] ✗ v6-inject.js 版本不符'); process.exit(1) }
  console.log('[v7] 模块: ' + modulePath)

  let src = fs.readFileSync(bundle, 'utf8')

  const features = [
    ['v6 稳定区模块', src.includes(MARK_MODULE) && src.includes('window.__vcpStable')],
    ['html 分支三态化', src.includes('dsh.rawHtml') || src.includes('__vcpOn') || src.includes('if(__on&&__ok)')],
    ['属性循环适配', src.includes('__vcpHpGlobal') || src.includes('__vcpVc(')],
    ['解析器空行修复（gg）', src.includes('function gg(t){t=(function(s)')],
    ['解析器空行修复（流式 update）', src.includes('update(t){t=(function(s)')],
    ['孤片兜底（整卡文本）', src.includes('__vcpCardText')],
  ]
  if (verifyOnly) {
    for (const [k, v] of features) console.log('  ' + (v ? '✓' : '✗') + ' ' + k)
    const all = features.every(([, v]) => v)
    console.log('[v7] ' + (all ? '已适配（无需重打）' : '未适配 → 需执行本脚本'))
    process.exit(all ? 0 : 2)
  }

  if (features.every(([, v]) => v)) { console.log('[v7] ✓ 已是适配态（幂等跳过）'); process.exit(0) }
  const original = src
  const applied = []

  /** 只替换一次的最小工具（确定性；失败即中止） */
  const replaceOnce = (from, to, label) => {
    const i = src.indexOf(from)
    if (i === -1) throw new Error('锚点未命中: ' + label)
    if (src.indexOf(from, i + 1) !== -1) throw new Error('锚点不唯一: ' + label)
    src = src.slice(0, i) + to + src.slice(i + from.length)
    applied.push(label)
  }

  // ① 注入 v6 模块（React 命名空间 `d` 可见处；模块把 fixVcpBlank 挂到 window.__vcpStable）
  if (!src.includes(MARK_MODULE)) {
    const boot =
      '\n' + MARK_MODULE + '\n;(function(){\n' +
      'try{var __VCP_V7__=(function(__VCP_REACT__){var window=globalThis;var self=globalThis;var document=globalThis.document;var global=globalThis;var f=__VCP_REACT__;\n' +
      moduleSrc +
      '\n;return true})(typeof d!=="undefined"?d:(typeof __vcpReact!=="undefined"?__vcpReact:null))}' +
      'catch(e){if(typeof console!=="undefined")console.warn("[vcp] v6 模块注入失败（不影响 markdown 渲染）",e)}\n})();\n/*__VCP_V7_MODULE_END__*/\n'
    replaceOnce(ANCHOR.defAnchor, boot + ANCHOR.defAnchor, '① v6 模块注入')
  }

  // ② case"html"：原始态 → 三态化；历史补丁态（任意函数体形态）→ 替换为最新
  if (src.includes(ANCHOR.caseStart)) {
    replaceOnce(ANCHOR.caseStart, buildCase(), '② case"html" 三态化')
  } else if (ANCHOR.caseRange.test(src)) {
    src = src.replace(ANCHOR.caseRange, buildCase())
    applied.push('② case"html" 升级到最新形态')
  }

  // ③ 属性循环：class/style/onclick/URL 白名单
  const attrOld = 'for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=wg(c.value):s[c.name]=c.value;'
  if (src.includes(attrOld)) {
    const attrNew = [
      'for(const c of i.attributes){',
      'if(/^on/i.test(c.name)){if(c.name==="onclick"){const m=/^input\\s*\\(\\s*[\'"]([\\s\\S]*?)[\'"]\\s*\\)\\s*;?\\s*$/.exec(c.value);',
      'if(m)s[c.name]=function(){const fn=window.__dshInput;if(fn)fn(m[1])}}continue}',
      'if(c.name==="style"){s.style=(window.__vcpHpGlobal||wg)(c.value);continue}',
      'if(c.name==="class"){s.className=c.value;continue}',
      'if(c.name==="href"&&!/^(https?:|mailto:|\\/|#)/i.test(c.value))continue;',
      'if(c.name==="src"&&!/^(https?:|data:image\\/|\\/|#)/i.test(c.value))continue;',
      's[c.name]=c.value}',
    ].join('')
    replaceOnce(attrOld, attrNew, '③ 属性循环适配')
  }

  // ④ 解析器入口：补回卡内空行压缩（两条路径）
  if (!src.includes('function gg(t){t=(function(s)')) {
    replaceOnce(ANCHOR.gg, 'function gg(t){' + blankFix(true) + 'return X5(t,{extensions:[J5(),o8(),mg(),pa()],mdastExtensions:[e6(),xa()]})}', '④ 解析器空行修复（gg）')
  }
  if (!src.includes('update(t){t=(function(s)')) {
    replaceOnce(ANCHOR.stream, 'update(t){' + blankFix(false) + 'if(this.cached!==null&&t===this.prevText)return this.cached;', '④ 解析器空行修复（流式 update）')
  }

  // 备份 → 写入 → 语法门 → 特征门 → 失败回滚
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bak = bundle + '.bak-installv7-' + stamp
  fs.writeFileSync(bak, original, 'utf8')
  fs.writeFileSync(bundle, src, 'utf8')
  console.log('[v7] 已应用: ' + applied.join(' + '))
  console.log('[v7] 备份: ' + path.basename(bak))
  try {
    execFileSync(process.execPath, ['--check', bundle], { stdio: 'inherit' })
  } catch (e) {
    fs.writeFileSync(bundle, original, 'utf8')
    console.error('[v7] ✗ 语法检查失败 → 已回滚'); process.exit(1)
  }
  const out = fs.readFileSync(bundle, 'utf8')
  const missing = ['window.__vcpStable', '__vcpCardText', 'dsh.rawHtml'].filter((m) => !out.includes(m) && !out.includes('if(__on&&__ok)'))
  if (missing.length) {
    fs.writeFileSync(bundle, original, 'utf8')
    console.error('[v7] ✗ 特征校验缺失: ' + missing.join(', ') + ' → 已回滚'); process.exit(1)
  }
  console.log('[v7] ✓ 语法与特征校验通过')
  console.log('[v7] 下一步：重启 dsh 服务 → 浏览器 Ctrl+F5')
}

main()
