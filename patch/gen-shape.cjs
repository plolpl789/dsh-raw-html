'use strict'
/**
 * dsh-raw-html —— 前端「压缩形态」按结构抽取（跨代适配的单一实现）
 *
 * 为什么不用「每代一张锚点表」：dsh-web-frontend 的局部名是**构建产物，不是接口**。
 * 每次构建压缩器都会重排它们，实测已改名四次：
 *
 * | 位置 | rc.5~rc.7 | rc.8~0.1.1 | 0.1.5-alpha.2 | 0.1.5-rc.2 | 0.1.7-rc.1 | 0.2.0-rc.1 |
 * |---|---|---|---|---|---|---|
 * | DOM→React 转换器 | `vc` | `Xu` | `u5` | `c8` | `K6` | `k8` |
 * | style 助手 | `hp`/`pp` | `jd`/`Sd` | `xg` | `wg` | `Sj` | `wg` |
 * | markdown switch 参数 | `(n,r,i)` | `(n,i,l)` | `(t,r,i)` | `(t,r,i)` | `(e,n,o)` | `(e,n,o)` |
 * | code 渲染器 | `wp` | — | `Lg` | `Lg` | `Tj` | `jb` |
 * | React / jsx 运行时 | `f` | `f` | `I` / `a` | `I` / `d` | `S` / `l` | `j` / `l` |
 *
 * 维护「每代一张表」等于每次构建都赌一次名字；本模块改为从 bundle 文本里**认出结构**，
 * 再把该代的真实标识符填进锚点模板：
 *
 *   - DOM→React 转换器：`function X(a,b){if(a.nodeType===Node.TEXT_NODE)…const N=a,P={key:b}`
 *   - 属性循环：`for(const A of N.attributes)…P[A.name]=A.value;`
 *   - markdown switch：`case"html":return S.value;` 与 `case"code":return F(S,K,C);`
 *   - React 命名空间：转换器体内最近的 `X.createElement(`
 *
 * **任何一步不能唯一命中就返回 null** —— 调用方据此安全中止（保留备份、不写坏文件），
 * 绝不猜。硬编码的老代锚点组仍然保留作兜底。
 */

/** DOM→React 转换器的结构指纹：入参即 DOM 节点，体内按 nodeType 分流。 */
const VDOM_RE = /function ([\w$]+)\(([\w$]+),([\w$]+)\)\{if\(\2\.nodeType===Node\.TEXT_NODE\)[\s\S]{0,200}?const ([\w$]+)=\2,([\w$]+)=\{key:/

/** markdown 渲染分支：`case"html":return <node>.value;` */
const CASE_HTML_RE = /case"html":return ([\w$]+)\.value;/

/** `case"code":return <fn>(<a>,<b>,<c>);` */
const CASE_CODE_RE = (a, b, c) => new RegExp('case"code":return ([\\w$]+)\\(' + a + ',' + b + ',' + c + '\\);')

/** 已注入的 script/iframe/object/embed 硬过滤（变量名随代际变，故按形状找）。 */
const SCRIPT_FILTER_RE = /if\(([\w$]+)\.localName==="script"\|\|\1\.localName==="iframe"\|\|\1\.localName==="object"\|\|\1\.localName==="embed"\)return null;/

/** 已注入的可信模式条件放行（用于幂等判定）。 */
const TRUSTED_FILTER_RE = /typeof window\.__vcpTrusted==="function"&&window\.__vcpTrusted\(\)\)&&\(([\w$]+)\.localName==="script"/

function countOccurrences(text, needle) {
  return text.split(needle).length - 1
}

/**
 * 从 bundle 文本抽取 markdown 渲染族的形态。
 * @param {string} text - bundle 全文。
 * @returns {null | {vdomFn, vp1, vp2, nodeVar, propsVar, attrVar, vcOrig, swNode, swK, swC, codeFn, reactNs, caseOrig, codeOrig}}
 */
function extractShape(text) {
  const vdom = VDOM_RE.exec(text)
  if (!vdom) return null
  const [, vdomFn, vp1, vp2, nodeVar, propsVar] = vdom
  if (countOccurrences(text, 'function ' + vdomFn + '(' + vp1 + ',' + vp2 + '){') !== 1) return null

  const loopRe = new RegExp('for\\(const ([\\w$]+) of ' + nodeVar + '\\.attributes\\)([^;]{0,420}?;)')
  const loop = loopRe.exec(text)
  if (!loop) return null
  const attrVar = loop[1]
  const vcOrig = loop[0]
  if (countOccurrences(text, vcOrig) !== 1) return null
  if (!vcOrig.endsWith(propsVar + '[' + attrVar + '.name]=' + attrVar + '.value;')) return null

  const caseHtml = CASE_HTML_RE.exec(text)
  if (!caseHtml) return null
  if (countOccurrences(text, caseHtml[0]) !== 1) return null
  const swNode = caseHtml[1]

  // markdown switch 所在函数：(a,b,c){switch( —— 第三个参数就是流式上下文。
  const head = text.slice(Math.max(0, caseHtml.index - 8000), caseHtml.index)
  const fns = [...head.matchAll(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{switch\(/g)]
  if (fns.length === 0) return null
  const fn = fns[fns.length - 1]
  const swK = fn[3]
  const swC = fn[4]
  if (fn[2] !== swNode) return null

  const caseCode = CASE_CODE_RE(fn[2], swK, swC).exec(text)
  if (!caseCode) return null
  if (countOccurrences(text, caseCode[0]) !== 1) return null
  const codeFn = caseCode[1]

  // React 命名空间：属性循环之后最近的 X.createElement(
  const tail = text.slice(loop.index + vcOrig.length, loop.index + vcOrig.length + 600)
  const react = /([\w$]+)\.createElement\(/.exec(tail)
  if (!react) return null
  const reactNs = react[1]

  return {
    vdomFn, vp1, vp2, nodeVar, propsVar, attrVar, vcOrig,
    swNode, swK, swC, codeFn, reactNs,
    caseOrig: caseHtml[0], codeOrig: caseCode[0],
  }
}

// ---------------------------------------------------------------------------
// 锚点模板：`@A` 属性变量 / `@L` 循环里的节点变量 / `@P` props 对象 /
// `@N` markdown 节点 / `@K` 渲染 key / `@C` 流式上下文 / `@F` code 渲染器。
// ---------------------------------------------------------------------------

/** `case"html"` → v6（三态化：undefined=默认开、"1"=开、"0"=显式关闭）。 */
const CASE_V6_TPL = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"){try{var vr=window.__vcpStable&&window.__vcpStable.render(@N.value,@C.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){if(typeof console!=="undefined")console.warn("[vcp] html 渲染异常，已回退源码",e)}}else if(typeof console!=="undefined")console.warn("[vcp] html 渲染已关闭（dsh.rawHtml===\"0\"，</> 按钮可重新开启）");return @N.value}();`

/** `case"code"` 围栏兜底 → v6.35 三态化（卡片被模型包进 ```html 时仍渲染）。 */
const CODE_V3_TPL = String.raw`case"code":{try{const _v=(@N.value||"").trim();if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"&&/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(@N.value,@C.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){if(typeof console!=="undefined")console.warn("[vcp] code 围栏渲染异常，已回退代码块",_e)}return @F(@N,@K,@C)}`

/**
 * 属性循环 → v6 加固形态。style 解析**内联**（不依赖当代的 style 助手名），
 * 含 onclick 桥 / on* 拒收 / href|src|action 协议白名单 / 文字属性 ref 锁定。
 */
const VC_V6_TPL = String.raw`for(const @A of @L.attributes){if(@A.name==="onclick"){const m=/^input\s*\(\s*['"]{1}([\s\S]*?)['"]{1}\s*\)\s*;?\s*$/.exec(@A.value);if(m)@P.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(/^on/i.test(@A.name))continue;if(@A.name==="style"){let sv=@A.value;sv=sv.replace(/position\s*:\s*fixed\s*;?/gi,"").replace(/z-index\s*:\s*\d{4,}\s*;?/gi,"").replace(/(?<![\w-])content\s*:[^;]*;?/gi,"");let so={};for(const st of sv.split(";")){const ci=st.indexOf(":");if(ci===-1)continue;const k=st.slice(0,ci).trim().replace(/-([a-z])/g,(x,y)=>y.toUpperCase());so[k]=st.slice(ci+1).trim()}@P.style=so;@P.ref=function(el){if(el)for(const st2 of sv.split(";")){const j=st2.indexOf(":");if(j===-1)continue;const p=st2.slice(0,j).trim(),v=st2.slice(j+1).trim();if(v&&/^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)$/.test(p))el.style.setProperty(p,v,"important")}};continue}if(@A.name==="class"){@P.className=@A.value;continue}if(@A.name==="href"&&!/^(https?:|mailto:|\/|#)/i.test(@A.value))continue;if(@A.name==="src"&&!/^(https?:|data:image\/|\/|#)/i.test(@A.value))continue;if((@A.name==="action"||@A.name==="formaction"||@A.name==="xlink:href")&&!/^(https?:|mailto:|\/|#)/i.test(@A.value))continue;@P[@A.name]=@A.value}`

function fillCase(tpl, s) {
  return tpl.split('@N').join(s.swNode).split('@K').join(s.swK).split('@C').join(s.swC).split('@F').join(s.codeFn)
}
function fillLoop(tpl, s) {
  return tpl.split('@A').join(s.attrVar).split('@L').join(s.nodeVar).split('@P').join(s.propsVar)
}

/**
 * 把抽取到的形态编译成本代锚点。
 * @param {ReturnType<typeof extractShape>} s - extractShape 的结果。
 */
function buildAnchors(s) {
  return {
    caseOrig: s.caseOrig,
    caseV6: fillCase(CASE_V6_TPL, s),
    codeOrig: s.codeOrig,
    codeV3: fillCase(CODE_V3_TPL, s),
    vcOrig: s.vcOrig,
    vcStart: 'for(const ' + s.attrVar + ' of ' + s.nodeVar + '.attributes)',
    vcEnd: s.propsVar + '[' + s.attrVar + '.name]=' + s.attrVar + '.value;',
    vcLoop: fillLoop(VC_V6_TPL, s),
    scriptFilter: 'if(' + s.nodeVar + '.localName==="script"||' + s.nodeVar + '.localName==="iframe"||' + s.nodeVar + '.localName==="object"||' + s.nodeVar + '.localName==="embed")return null;',
    defBefore: '}function ' + s.vdomFn + '(' + s.vp1 + ',' + s.vp2 + '){',
    defAfter: ';function ' + s.vdomFn + '(' + s.vp1 + ',' + s.vp2 + '){',
    /** on* 过滤特征串（收尾自检用；变量名随代际变，不能写死）。 */
    onFilter: 'if(/^on/i.test(' + s.attrVar + '.name))continue;',
    /**
     * 宿主别名：把本代真实标识符钉在注入模块前面。
     * v6-inject 的别名探测从此不必按名字猜——名字由这里给出（精确），
     * 探测链只作老补丁/测试 stub 的兜底。
     */
    hostAlias: 'var __vcpHostVdom=' + s.vdomFn + ',__vcpHostReact=' + s.reactNs + ';',
  }
}

/** 找已注入的 script 硬过滤；未命中/不唯一时返回 null。 */
function matchScriptFilter(text) {
  const m = new RegExp(SCRIPT_FILTER_RE.source, 'g').exec(text)
  if (!m) return null
  if (countOccurrences(text, m[0]) !== 1) return null
  return { raw: m[0], nodeVar: m[1] }
}

/** 该 bundle 是否已打上可信模式放行。 */
function hasTrustedFilter(text) {
  return TRUSTED_FILTER_RE.test(text)
}

/** 可信模式放行体（与 matchScriptFilter 同一变量名）。 */
function trustedFilter(nodeVar) {
  return `if(!(typeof window!=="undefined"&&typeof window.__vcpTrusted==="function"&&window.__vcpTrusted())&&(${nodeVar}.localName==="script"||${nodeVar}.localName==="iframe"||${nodeVar}.localName==="object"||${nodeVar}.localName==="embed"))return null;`
}

module.exports = {
  extractShape,
  buildAnchors,
  matchScriptFilter,
  hasTrustedFilter,
  trustedFilter,
  countOccurrences,
}
