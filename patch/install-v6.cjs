#!/usr/bin/env node
/**
 * dsh-raw-html —— 万能安装器（任意状态 → v6 全量补丁）
 *
 * 面向「全新电脑 / 其他 agent 环境」的一键安装入口。
 * 无论目标 dsh-web-frontend 的 dist bundle 处于哪个历史状态
 * （原始未打补丁 / v1·v2 加速引擎 / v4·v5 中间态 / rc.8+ 重构形态），
 * 都能一步打到当前完整能力（v6）：
 *
 *   A. case"html" 分支 → 调 window.__vcpStable.render（流式稳定区固化：
 *      已闭合块缓存、只重渲染尾巴；图片 Markdown 转 <img> 与安全白名单
 *      由 v6 模块接管）
 *   B. vc()/Xu() 属性循环 → v6 最终形态：onclick="input('...')" 桥接 +
 *      style 危险属性剥离（content 词边界正则，防误伤 justify-content）+
 *      href/src URL 协议白名单 + style 文字属性 ref 回调 !important 锁定
 *      （防皮肤覆盖）；原始态额外补 script/iframe/object/embed 过滤
 *   C. vc()/Xu() 定义前注入 v6 稳定区模块（patch/v6-inject.js：扫描器 + 状态机 +
 *      KaTeX 数学公式 + Mermaid 查看器 + SVG 流式占位，挂 window.__vcpStable）
 *
 * 前端代际兼容（2026-08-24 适配）：
 *   - rc.5~rc.7（旧锚点组）：vc / hp，case 函数参数 (n,r,i)
 *   - rc.8 / 0.1.1-rc.x（新锚点组）：压缩器改名 Xu / jd（rc.8 为 Sd），
 *     case 函数参数 (n,i,l)；CASE_ORIG 字符串恰好未变，属性循环与注入点换新组，
 *     style 解析内联不依赖 jd/Sd 函数名；v6-inject.js 经 __vcpVc/__vcpHp
 *     运行时探测兼容两代
 *
 * 实现策略：区间替换 + 幂等 + 多级安全网
 *   - case"html" 分支：原始态精确替换；增强态（v1/v2/v4/v5 均形如
 *     `case"html":return function(){...return n.value}();`）按「起止锚点」
 *     区间替换，不依赖各版本完整文本 → 对未知中间态更鲁棒
 *   - vc/Xu 属性循环：同上（增强态形如 `for(const c of i.attributes){...s[c.name]=c.value}`）
 *   - 幂等：bundle 已含 window.__vcpStable → 跳过
 *   - 备份：index-*.js.bak-installv6-<时间戳>；每个锚点要求恰好命中，
 *     写回后 node --check + v6 特征校验，失败自动回滚
 *
 * 用法：
 *   node patch/install-v6.cjs [bundle路径]     # 省略路径时自动探测
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// ---- bundle 探测（与 patch-frontend.cjs 一致）-------------------------------
function findBundle() {
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null

  if (process.env.DSH_WEB_FRONTEND_DIST) {
    const p = process.env.DSH_WEB_FRONTEND_DIST
    if (fs.existsSync(p)) return p
  }

  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    try {
      const assets = path.join(d, 'dist', 'assets')
      if (!fs.existsSync(assets)) return
      for (const f of fs.readdirSync(assets)) {
        if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
      }
    } catch {}
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  // macOS / Linux（2026-09-11 本地补：原探测只认 Windows 的 APPDATA/USERPROFILE，
  // 导致 install-all.cjs 不带参数时在这台机器上「未自动找到 bundle」）
  const home = process.env.HOME || ''
  addDir(path.join(home, '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(home, '.dsh', 'runtime', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

// ---- 锚点常量（String.raw 保证正则字面量原样匹配）---------------------------
// 原始态
const CASE_ORIG = String.raw`case"html":return n.value;`
const VC_ORIG = String.raw`for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=hp(c.value):s[c.name]=c.value;`
// 原始态 · pp 变体（本地适配 2026-08-30）：部分 0.1.0-rc.x 前端压缩器把样式助手命名为 pp
// （如 rc.7 的 index-C-1AiF3k.js：function pp(n){...} 解析 style 字符串为驼峰对象，职责与 hp 相同）。
const VC_ORIG_PP = String.raw`for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=pp(c.value):s[c.name]=c.value;`

// 增强态起止锚点（v1/v2/v4/v5 通用）
const CASE_ENHANCED_START = String.raw`case"html":return function(){`
const CASE_ENHANCED_END = String.raw`return n.value}();`
const VC_ENHANCED_START = String.raw`for(const c of i.attributes){`
const VC_ENHANCED_END = String.raw`s[c.name]=c.value}`

// v6 最终形态（v6.35 三态化 · 先生定调 2026-08-29）：html 分支判定 !== "0"——
// 原 v6（==="1"）在新环境/清缓存后 dsh.rawHtml 为 undefined → 一切裸 HTML 显示源码
// （2026-08-29 上架申请书卡实测事故根因）；三态化：undefined=默认开、"1"=开、"0"=显式关闭。
const CASE_V6 = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){if(typeof console!=="undefined")console.warn("[vcp] html 渲染异常，已回退源码",e)}}else if(typeof console!=="undefined")console.warn("[vcp] html 渲染已关闭（dsh.rawHtml===\"0\"，</> 按钮可重新开启）");return n.value}();`

// 老 v6.0 形态（==="1"）——供「增量加固」检测升级（已打旧 v6 的用户跑本脚本自动升三态化）
const CASE_V6_LEGACY = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){}}return n.value}();`

const SCRIPT_FILTER = String.raw`if(i.localName==="script"||i.localName==="iframe"||i.localName==="object"||i.localName==="embed")return null;`

// v6 最终形态（含 onclick 桥 + style 过滤词边界 + href/src 白名单 + ref 锁定）
const VC_V6 = String.raw`for(const c of i.attributes){if(c.name==="onclick"){const m=/^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(c.value);if(m)s.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(/^on/i.test(c.name))continue;if(c.name==="style"){let sv=c.value;sv=sv.replace(/position\s*:\s*fixed\s*;?/gi,"").replace(/z-index\s*:\s*\d{4,}\s*;?/gi,"").replace(/(?<![\w-])content\s*:[^;]*;?/gi,"");s.style=hp(sv);s.ref=function(el){if(el)for(const d of sv.split(";")){const j=d.indexOf(":");if(j===-1)continue;const p=d.slice(0,j).trim(),v=d.slice(j+1).trim();if(v&&/^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)$/.test(p))el.style.setProperty(p,v,"important")}};continue}if(c.name==="class"){s.className=c.value;continue}if(c.name==="href"&&!/^(https?:|mailto:|\/|#)/i.test(c.value))continue;if(c.name==="src"&&!/^(https?:|data:image\/|\/|#)/i.test(c.value))continue;if((c.name==="action"||c.name==="formaction"||c.name==="xlink:href")&&!/^(https?:|mailto:|\/|#)/i.test(c.value))continue;s[c.name]=c.value}`
// 原始态 · pp 变体（本地适配 2026-08-30）对应替换体：仅把 hp 调用换成 pp
// （同一作用域内可解析，pp 职责与 hp 相同：style 字符串 → React 驼峰对象），其余逻辑与 VC_V6 完全一致。
const VC_V6_PP = VC_V6.replace('s.style=hp(sv);', 's.style=pp(sv);')

// 注入 v6 稳定区模块的锚点
const VC_DEF_BEFORE = String.raw`}function vc(n,r){`
const V6_MARK = 'window.__vcpStable'

// ---- 新前端锚点（dsh-web-frontend 0.1.0-rc.8+ / 0.1.1-rc.x · index-CA9Bpko5.js / index-ClqxG24t.js）----
// rc.8 起压缩器重构改名：vc→Xu、hp→jd（rc.8 为 Sd）、case 函数参数 (n,r,i)→(n,i,l)。
// CASE_ORIG 字符串恰好未变（仍恰好 1 处）；属性循环与注入点换新组；style 解析内联、不依赖 jd/Sd 函数名。
const VC_NEW_START = String.raw`for(const d of l.attributes)`
const VC_NEW_END = String.raw`u[d.name]=d.value;`
const VC_DEF_NEW_BEFORE = String.raw`}function Xu(n,i){`
const SCRIPT_FILTER_NEW = String.raw`if(l.localName==="script"||l.localName==="iframe"||l.localName==="object"||l.localName==="embed")return null;`

// case"html" → v6（新版：流式标记在 context 参数 l 上；v6.35 三态化 !== "0"）
const CASE_V6_NEW = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,l.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){if(typeof console!=="undefined")console.warn("[vcp] html 渲染异常，已回退源码",e)}}else if(typeof console!=="undefined")console.warn("[vcp] html 渲染已关闭（dsh.rawHtml===\"0\"，</> 按钮可重新开启）");return n.value}();`

// 老 v6.0 新版形态（==="1" · l.streaming）——增量加固检测用
const CASE_V6_NEW_LEGACY = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,l.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){}}return n.value}();`

// vc(Xu) 属性循环 → v6（新版变量名 d/l/u；style 解析内联，含 onclick 桥 / 词边界过滤 / URL 白名单 / ref 锁定）
const VC_V6_NEW = String.raw`for(const d of l.attributes){if(d.name==="onclick"){const m=/^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(d.value);if(m)u.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(/^on/i.test(d.name))continue;if(d.name==="style"){let sv=d.value;sv=sv.replace(/position\s*:\s*fixed\s*;?/gi,"").replace(/z-index\s*:\s*\d{4,}\s*;?/gi,"").replace(/(?<![\w-])content\s*:[^;]*;?/gi,"");let so={};for(const st of sv.split(";")){const ci=st.indexOf(":");if(ci===-1)continue;const k=st.slice(0,ci).trim().replace(/-([a-z])/g,(x,y)=>y.toUpperCase());so[k]=st.slice(ci+1).trim()}u.style=so;u.ref=function(el){if(el)for(const st2 of sv.split(";")){const j=st2.indexOf(":");if(j===-1)continue;const p=st2.slice(0,j).trim(),v=st2.slice(j+1).trim();if(v&&/^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)$/.test(p))el.style.setProperty(p,v,"important")}};continue}if(d.name==="class"){u.className=d.value;continue}if(d.name==="href"&&!/^(https?:|mailto:|\/|#)/i.test(d.value))continue;if(d.name==="src"&&!/^(https?:|data:image\/|\/|#)/i.test(d.value))continue;if((d.name==="action"||d.name==="formaction"||d.name==="xlink:href")&&!/^(https?:|mailto:|\/|#)/i.test(d.value))continue;u[d.name]=d.value}`

// ---- 第三代锚点（dsh-web-frontend 0.1.5-rc.2+ · index-BKQ_L1z6.js）----
// 压缩器第三次改名（2026-09-11 适配）：
//   case 函数参数 (n,r,i) → (t,r,i)；DOM→React 转换器 vc/Xu → c8；
//   style 解析助手 hp/pp/jd/Sd → wg；code 分支 wp(n,r,i) → Lg(t,r,i)。
// 属性循环变量名恰好与旧代相同（c/i/s），且 VC_V6_V3 改为内联解析 style
// （不依赖 wg 是否在注入点可见），跨代更稳。
const CASE_ORIG_V3 = String.raw`case"html":return t.value;`
const VC_ORIG_V3 = String.raw`for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=wg(c.value):s[c.name]=c.value;`
const VC_DEF_V3_BEFORE = String.raw`}function c8(t,r){`
const CASE_V6_V3 = CASE_V6.split('n.value').join('t.value')
const VC_V6_V3 = VC_V6.replace(
  's.style=hp(sv);',
  'let so={};for(const st of sv.split(";")){const ci=st.indexOf(":");if(ci===-1)continue;const k=st.slice(0,ci).trim().replace(/-([a-z])/g,(x,y)=>y.toUpperCase());so[k]=st.slice(ci+1).trim()}s.style=so;',
)
const CODE_CASE_RAW_V3 = String.raw`case"code":return Lg(t,r,i);`

// ---- case"code" 围栏兜底（v6.30 → v6.35 三态化 · 老版前端锚点）----
// 模型把卡片包进 ```html 围栏时 markdown 解析为 code 节点 → 显示源码；
// 兜底：代码块以 <div id="vcp-root" 开头 → 调 vcp render（vcp-root 白名单防误伤普通代码）。
// v6.35 三态化（!== "0"）：开关未设置（undefined）默认接管，显式关闭（"0"）才拒。
const CODE_CASE_RAW = String.raw`case"code":return wp(n,r,i);`
const CODE_CASE_V1 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){}return wp(n,r,i)}`
const CODE_CASE_V2 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"&&/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){}return wp(n,r,i)}`
const CODE_CASE_V3 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"&&/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){if(typeof console!=="undefined")console.warn("[vcp] code 围栏渲染异常，已回退代码块",_e)}return wp(n,r,i)}`
// 第三代（0.1.5-rc.2+）：参数改名 n→t、code 渲染器 wp→Lg
const CODE_CASE_V3_V3 = CODE_CASE_V3.split('n.value').join('t.value').replace('return wp(n,r,i)', 'return Lg(t,r,i)')

// ---- 工具 ------------------------------------------------------------------
function countOccurrences(text, needle) {
  return text.split(needle).length - 1
}

/** 精确替换：锚点必须恰好命中 1 次，否则返回 null。 */
function replaceOnce(text, from, to, label) {
  const n = countOccurrences(text, from)
  if (n !== 1) {
    console.error(`[install-v6] 锚点 "${label}" 命中 ${n} 次（需要恰好 1 次）。`)
    return null
  }
  return text.split(from).join(to)
}

/** 区间替换：start 锚点必须恰好 1 次，end 锚点取 start 后第一处；找不到返回 null。 */
function replaceRange(text, startMark, endMark, to, label) {
  const n = countOccurrences(text, startMark)
  if (n !== 1) {
    console.error(`[install-v6] 区间锚点 "${label}" 起点命中 ${n} 次（需要恰好 1 次）。`)
    return null
  }
  const s = text.indexOf(startMark)
  const e = text.indexOf(endMark, s)
  if (e === -1) {
    console.error(`[install-v6] 区间锚点 "${label}" 未找到终点 "${endMark}"。`)
    return null
  }
  const end = e + endMark.length
  return text.slice(0, s) + to + text.slice(end)
}

// ---- 主流程 -----------------------------------------------------------------
function main() {
  const file = findBundle()
  if (!file) {
    console.error('[install-v6] 未自动找到 dsh-web-frontend 的 dist bundle。')
    console.error('[install-v6] 用法: node patch/install-v6.cjs <bundle路径>')
    process.exit(1)
  }

  console.log('[install-v6] bundle:', file)
  let t = fs.readFileSync(file, 'utf8')

  // 前端代际探测（三套锚点组，幂等加固与主流程共用）：
  //   第三代 0.1.5-rc.2+：转换器 c8 / 样式助手 wg / case 参数 (t,r,i)
  //   rc.8+：转换器 Xu / 样式助手 jd|Sd / case 参数 (n,i,l)
  //   rc.5~rc.7：转换器 vc / 样式助手 hp|pp / case 参数 (n,r,i)
  const isV3Frontend = t.includes(VC_DEF_V3_BEFORE) && t.includes(VC_ORIG_V3)
  const isNewFrontend = !isV3Frontend && t.includes('function Xu(n,i){') && !t.includes('function vc(n,r){')
  if (isV3Frontend) console.log('[install-v6] 探测到第三代前端（0.1.5-rc.2+ · c8/wg 压缩形态），使用第三代锚点组')
  else if (isNewFrontend) console.log('[install-v6] 探测到新版前端（rc.8+ · Xu 压缩形态），使用新锚点组')

  // 已是 v6 → 增量加固：老 v6.0 形态（==="1"）升级三态化、补 case"code" 围栏兜底；
  // 无变更则跳过（幂等）。有变更时备份 + 写回 + node --check + 失败回滚。
  if (t.includes(V6_MARK)) {
    let hardened = t
    const done = []
    const legacyTarget = isNewFrontend ? CASE_V6_NEW_LEGACY : CASE_V6_LEGACY
    const newTarget = isNewFrontend ? CASE_V6_NEW : CASE_V6
    const nLegacy = countOccurrences(hardened, legacyTarget)
    if (nLegacy === 1) {
      hardened = hardened.split(legacyTarget).join(newTarget)
      done.push('case"html" 老逻辑(==="1") → v6.35 三态化')
    } else if (nLegacy > 1) {
      console.warn('[install-v6] 加固跳过：case"html" 老形态命中多次（异常），不自动修改')
    }
    if (!isNewFrontend && countOccurrences(hardened, CODE_CASE_V3) === 0) {
      for (const [label, from] of [['case"code"(原始)', CODE_CASE_RAW], ['case"code"(v6.30)', CODE_CASE_V1], ['case"code"(v6.32)', CODE_CASE_V2]]) {
        const nc = countOccurrences(hardened, from)
        if (nc === 1) { hardened = hardened.split(from).join(CODE_CASE_V3); done.push('case"code" 围栏兜底 → v6.35 三态化'); break }
        if (nc > 1) { console.warn(`[install-v6] 加固跳过：${label} 命中多次（异常）`); break }
      }
    }
    if (done.length === 0) {
      console.log('[install-v6] 该 bundle 已是 v6 最新形态，无需操作，跳过。')
      return
    }
    const stamp2 = new Date().toISOString().replace(/[:.]/g, '-')
    const bak2 = `${file}.bak-installv6-${stamp2}`
    fs.copyFileSync(file, bak2)
    console.log('[install-v6] 备份:', bak2)
    fs.writeFileSync(file, hardened, 'utf8')
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
      console.log('[install-v6] 健康检查通过：node --check OK')
    } catch (e) {
      fs.copyFileSync(bak2, file)
      console.error('[install-v6] 健康检查失败，已回滚到备份！')
      process.exit(1)
    }
    console.log(`[install-v6] ✓ 增量加固完成：${done.join('；')}`)
    return
  }

  // 备份
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bak = `${file}.bak-installv6-${stamp}`
  fs.copyFileSync(file, bak)
  console.log('[install-v6] 备份:', bak)

  const caseTarget = isV3Frontend ? CASE_V6_V3 : (isNewFrontend ? CASE_V6_NEW : CASE_V6)

  let next = t

  // 1) case"html" 分支 → v6
  if (isV3Frontend && countOccurrences(next, CASE_ORIG_V3) === 1) {
    next = replaceOnce(next, CASE_ORIG_V3, caseTarget, 'case"html"(第三代)')
  } else if (countOccurrences(next, CASE_ORIG) === 1) {
    next = replaceOnce(next, CASE_ORIG, caseTarget, 'case"html"(原始)')
  } else if (!isV3Frontend && !isNewFrontend && countOccurrences(next, CASE_ENHANCED_START) === 1 && countOccurrences(next, CASE_ENHANCED_END) >= 1) {
    next = replaceRange(next, CASE_ENHANCED_START, CASE_ENHANCED_END, caseTarget, 'case"html"(增强态)')
  } else {
    console.error('[install-v6] ✗ case"html" 分支：三代锚点均未命中，无法识别。')
    console.error('[install-v6]   可能是 dsh 版本过新导致压缩代码变化，已安全中止（备份已保留，未写入修改）。')
    process.exit(1)
  }
  if (next === null) {
    console.error('[install-v6] case"html" 替换失败，中止（备份已保留）。')
    process.exit(1)
  }
  console.log('[install-v6] ✓ case"html" 分支 → v6')

  // 1.5) case"code" 围栏兜底 → v6.35 三态化（增强能力：模型把卡片包进 ```html 围栏时仍渲染）
  // 新版前端（rc.8+）case"code" 形态未收录：跳过 + 警告，不阻塞安装（不影响基础渲染）。
  if (isV3Frontend) {
    if (countOccurrences(next, CODE_CASE_V3_V3) !== 0) {
      console.log('[install-v6] ✓ case"code" 围栏兜底已是 v6.35 三态化（第三代）')
    } else if (countOccurrences(next, CODE_CASE_RAW_V3) === 1) {
      next = replaceOnce(next, CODE_CASE_RAW_V3, CODE_CASE_V3_V3, 'case"code"(第三代)')
      console.log('[install-v6] ✓ case"code" 围栏兜底 → v6.35 三态化')
    } else {
      console.warn('[install-v6] case"code" 第三代锚点未命中，围栏兜底跳过（不影响基础渲染）')
    }
  } else if (isNewFrontend) {
    console.warn('[install-v6] 新版前端（rc.8+）case"code" 锚点未收录，围栏兜底跳过（不影响基础渲染）')
  } else if (countOccurrences(next, CODE_CASE_V3) !== 0) {
    console.log('[install-v6] ✓ case"code" 围栏兜底已是 v6.35 三态化')
  } else {
    let codeNext = null
    const codeChain = [
      ['case"code"(原始)', CODE_CASE_RAW],
      ['case"code"(v6.30 纯白名单)', CODE_CASE_V1],
      ['case"code"(v6.32 开关检查)', CODE_CASE_V2],
    ]
    for (const [label, from] of codeChain) {
      const n = countOccurrences(next, from)
      if (n === 1) { codeNext = replaceOnce(next, from, CODE_CASE_V3, label); break }
      if (n > 1) break // 异常多命中，放弃升级
    }
    if (codeNext !== null) {
      next = codeNext
      console.log('[install-v6] ✓ case"code" 围栏兜底 → v6.35 三态化')
    } else {
      console.warn('[install-v6] case"code" 分支形态未知/异常，围栏兜底跳过（不影响基础渲染）')
    }
  }

  // 2) vc(Xu) 属性循环 → v6
  if (isV3Frontend) {
    // 第三代：变量名与旧代一致（c/i/s），额外补 script/iframe/object/embed 过滤
    next = replaceOnce(next, VC_ORIG_V3, SCRIPT_FILTER + VC_V6_V3, 'vc 属性循环(第三代)')
  } else if (isNewFrontend) {
    // rc.8+：原始态区间替换（起点/终点不含 jd/Sd 函数名，两版通用），额外补 script 过滤
    next = replaceRange(next, VC_NEW_START, VC_NEW_END, SCRIPT_FILTER_NEW + VC_V6_NEW, 'Xu 属性循环(rc.8+ 原始态)')
  } else if (countOccurrences(next, VC_ORIG) === 1) {
    // 原始态：无 script 过滤，需补上（与 v1 补丁行为一致）
    next = replaceOnce(next, VC_ORIG, SCRIPT_FILTER + VC_V6, 'vc 属性循环(原始)')
  } else if (countOccurrences(next, VC_ORIG_PP) === 1) {
    // 原始态 · pp 变体（本地适配 2026-08-30）：样式助手名为 pp 的旧代前端
    next = replaceOnce(next, VC_ORIG_PP, SCRIPT_FILTER + VC_V6_PP, 'vc 属性循环(原始·pp 变体)')
  } else if (countOccurrences(next, VC_ENHANCED_START) === 1) {
    next = replaceRange(next, VC_ENHANCED_START, VC_ENHANCED_END, VC_V6, 'vc 属性循环(增强态)')
  } else {
    console.error('[install-v6] ✗ vc 属性循环：既非原始态也非已补丁增强态，无法识别。')
    console.error('[install-v6]   已安全中止（备份已保留，未写入修改）。')
    process.exit(1)
  }
  if (next === null) {
    console.error('[install-v6] vc 属性循环替换失败，中止（备份已保留）。')
    process.exit(1)
  }
  console.log('[install-v6] ✓ vc(Xu) 属性循环 → v6')

  // 3) 注入 v6 稳定区模块
  let v6Inject = ''
  try {
    v6Inject = fs.readFileSync(path.join(__dirname, 'v6-inject.js'), 'utf8')
  } catch (e) {
    console.error('[install-v6] 读取 patch/v6-inject.js 失败：', e.message)
    process.exit(1)
  }
  const defBefore = isV3Frontend ? VC_DEF_V3_BEFORE : (isNewFrontend ? VC_DEF_NEW_BEFORE : VC_DEF_BEFORE)
  const defAfter = isV3Frontend ? ';function c8(t,r){' : (isNewFrontend ? ';function Xu(n,i){' : ';function vc(n,r){')
  const defLabel = isV3Frontend ? 'c8 定义前注入 v6 模块' : (isNewFrontend ? 'Xu 定义前注入 v6 模块' : 'vc 定义前注入 v6 模块')
  next = replaceOnce(next, defBefore, '}' + v6Inject + defAfter, defLabel)
  if (next === null) {
    console.error('[install-v6] v6 模块注入失败，中止（备份已保留）。')
    process.exit(1)
  }
  console.log(`[install-v6] ✓ ${defLabel}`)

  // 4) 写回
  fs.writeFileSync(file, next, 'utf8')

  // 5) 健康检查：node --check + v6 特征
  let ok = true
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })
    console.log('[install-v6] 健康检查通过：node --check OK')
  } catch (e) {
    ok = false
    console.error('[install-v6] 健康检查失败：', String(e.stderr || e.message).split('\n')[0])
  }

  const written = fs.readFileSync(file, 'utf8')
  const onFilterMark = isNewFrontend ? 'if(/^on/i.test(d.name))continue;' : 'if(/^on/i.test(c.name))continue;'
  const features = [
    [V6_MARK, 'v6 标记 window.__vcpStable'],
    ['window.__dshInput', 'onclick 交互桥 __dshInput'],
    [String.raw`(?<![\w-])content`, 'content 词边界正则'],
    [onFilterMark, 'on* 属性安全过滤'],
    ['setProperty(p,v,"important")', '文字属性 !important 锁定'],
  ]
  for (const [mark, label] of features) {
    if (!written.includes(mark)) {
      ok = false
      console.error(`[install-v6] 特征缺失：${label}`)
      const idx = written.indexOf(isV3Frontend ? 'function c8(t,r){' : (isNewFrontend ? VC_NEW_START : VC_ENHANCED_START))
      if (idx !== -1) console.error('[install-v6] debug vc 循环附近 >>>', JSON.stringify(written.slice(idx, idx + 260)))
    }
  }
  if (countOccurrences(written, CASE_ORIG) !== 0) {
    ok = false
    console.error('[install-v6] 特征异常：仍存在原始 case"html" 分支')
  }
  if (isV3Frontend && countOccurrences(written, CASE_ORIG_V3) !== 0) {
    ok = false
    console.error('[install-v6] 特征异常：仍存在原始 case"html" 分支（第三代）')
  }
  if (isV3Frontend && countOccurrences(written, VC_ORIG_V3) !== 0) {
    ok = false
    console.error('[install-v6] 特征异常：仍存在原始属性循环（第三代）')
  }
  if (isNewFrontend && countOccurrences(written, String.raw`for(const d of l.attributes)d.name==="class"`) !== 0) {
    ok = false
    console.error('[install-v6] 特征异常：仍存在原始 Xu 属性循环')
  }

  if (!ok) {
    fs.copyFileSync(bak, file)
    console.error('[install-v6] 校验未通过，已回滚到备份，未留下损坏产物！')
    process.exit(1)
  }

  console.log('[install-v6] 完成：任意历史状态 → v6 全量补丁已写入')
  console.log('[install-v6] 下一步：重启 dsh 服务 → 浏览器强刷（Ctrl+F5）→ 点「</>」开关开启')
  console.log('[install-v6] 验证：任意 VCP 消息卡片正常渲染；DevTools console 可见 [vcp-stable] 日志')
}

main()
