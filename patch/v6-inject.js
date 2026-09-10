/*__DSH_V6_INJECT_START__*/
/**
 * dsh-raw-html v7.0 —— 稳定区固化模块（注入 dsh-web-frontend bundle 用）。
 *
 * v7.0（自 v6.18 的一次大迭代 · 渲染器「自愈层」体系建立，先生实测驱动）：
 *   - 流式样式即时生效：未闭合 <style> 补闭合 + closeBraces 花括号平衡 +
 *     style 前置规范（背景/字体随流式逐步长出，不再最后才闪现）
 *   - 消息级作用域化（#vcp-root → #vcp-msg-N）+ 文字声明 !important 保险
 *   - 资源收敛：img max-width（大图不撑版）· svg 块级化限宽 · transform 动画
 *     自动补 transform-box:fill-box（旋转/缩放不飘走）
 *   - 自愈层全树覆盖：根/子容器 box-sizing · table/pre 溢出防护 · 表格防撑破
 *     组合拳（width:100% + nowrap 单元格裁剪）· 缺背景补纸色底
 *   - v6.33 自愈层再添：字体链继承兜底（未声明字体的元素强制继承根容器字体——
 *     防皮肤劫持导致字符级 fallback 字面率不一，如「登陆」显小；根容器字体链
 *     CSS 锁定 + 常用文字标签逐条 inherit，双保险，不依赖 :where()）
 *   - v6.33b 圆角不兜底（先生定调）：border-radius 是装饰不是结构，AI 没写可能
 *     是「要直角」（报纸/极简风故意省略容器装饰）——强补圆角会误判意图；结构
 *     兜底照做、圆角默认直角，审美仍由 AI 决定
 *   - v6.33c DOM 层最终强制（先生实测 CSS 注入仍显小后升级）：React 挂载后对
 *     「无内联字体且未被显式字体选择器命中」的文字元素直接 setProperty
 *     ('font-family','inherit','important')——内联 !important 是最高优先级，
 *     任何选择器规则（含皮肤）都压不住；AI 显式书法/等宽字体（内联或类规则）
 *     一律尊重；根容器兜底链被皮肤压住时同步锁定系统链
 *   - v6.33d 根因落网（先生三连问换来的认知）：「强调词小」不是字面率差异，
 *     是 font-size 被皮肤 textRule 压制——类规则 boost 能保住 .t 自己的字号，
 *     但「没写 font-size 的强调词 span」只有继承值，输给皮肤直接作用的
 *     font-size !important。v6.33d 把 font-family / font-size / font-weight /
 *     font-style / line-height / letter-spacing 全部锁成 inherit（仅覆盖未显式
 *     声明的属性；color/text-align 不锁——颜色是 AI 设计、对齐是布局）
 *   - v6.33e 版面收窄兜底（先生实测 5 张测试卡后定调）：AI 没写任何宽度时根容器
 *     默认 max-width:920px（报纸版心，不再拉满屏幕成整条色板）；AI 显式写了
 *     width/max-width（全宽或自定义宽度）→ 尊重不补
 *   - v6.33f 花括号平衡全路径兜底（先生实测卡 2 SVG 动画不转）：流式 tail 的
 *     closeBraces 只覆盖「<style> 未闭合」；非流式（历史消息）<style> 已闭合但
 *     漏 } 时，浏览器把后续规则与 @keyframes 吞进前块 → 动画失效。现对每个闭合
 *     <style> 内的 CSS 也补平衡（只补净缺口数量的 }，多余 } 忽略，字符串内
 *     花括号配对抵消，误伤面极小）
 *   - v6.34 SVG 类动画中心自愈（先生实测卡 2 橙点不转）：CSS 类动画不经过
 *     guardChildren 的内联检查，<g> 的 transform-origin 走浏览器默认 → 整组绕
 *     画面原点转、非对称元素轨道不协调。DOM 层 getComputedStyle 判定「有动画且
 *     origin 是默认值」→ 补 transform-box:fill-box + transform-origin:center，
 *     动画围绕元素自身包围盒中心旋转；AI 显式 origin 尊重
 *   - v6.35 渲染开关三态化（先生定调 2026-08-29 · 上架申请书卡实测）：
 *     启动自检：dsh.rawHtml 从未设置（undefined）→ 自动落盘 "1" 默认开启；
 *     html/code 两分支判定改 !== "0"（见 patch-frontend.cjs 锚点 A/E）——
 *     undefined 不再等于关闭，只有「</>」按钮显式设 "0" 才关闭。
 *     只补「从未设置」，绝不覆盖用户显式选择；回退路径带 console.warn 诊断
 *   - code 对比度三级阶梯模型（大背景→code→字逐级对比）+ 半透明叠加判定
 *   - 代码围栏兜底（```html 包卡片自动剥离渲染，带渲染开关检查）
 *   - 非流式（历史消息/终帧）路径同样执行 finalizeRoot 兜底
 *
 * 版本说明：v6.19~v6.32 的逐级迭代已归纳为本版本（详见 git 提交历史）。
 *
 * 本文件无 import/export，直接以文本形式注入到 bundle 的 vc()/Xu() 定义之前：
 * 依赖 bundle 模块作用域内的 vc / hp / f（React）与全局 window/DOMParser。
 * rc.8+ 前端压缩器改名（vc→Xu、hp→jd/Sd），经 __vcpVc/__vcpHp 别名探测兼容两代。
 * 注入方式见 patch-frontend.cjs 的锚点 C。
 *
 * 核心：VCPChat 式增量渲染的 vdom 轻量版——
 *   - 每帧用轻量 HTML 扫描器把流式内容切成「已闭合块 + 尾巴」
 *   - 已闭合块解析一次并缓存（元素引用跨帧不变 → React 跳过 diff → DOM 不重建 → 动画真循环）
 *   - vcp-root 未闭合期间：内部闭合子块照样固化，容器开标签单独解析并包裹组装
 *   - 每帧只解析新增段；前缀失配（回退/多消息切换）与容器闭合帧走全量兜底
 *
 * 测试：tests/stable.test.mjs 用 node:vm 加载本文件并 stub 依赖后驱动流式帧序列。
 */
;(function () {
  // 无障碍：系统开启「减少动态效果」时，关闭卡片内所有动画/过渡（纯 CSS 降级，不动渲染逻辑）。
  try {
    if (typeof document !== 'undefined' && document.head && !document.getElementById('vcp-reduced-motion')) {
      var _rm = document.createElement('style')
      _rm.id = 'vcp-reduced-motion'
      _rm.textContent = '@media (prefers-reduced-motion: reduce){#vcp-root,[id^="vcp-msg-"],#vcp-root *,[id^="vcp-msg-"] *{animation:none !important;transition:none !important}}'
      document.head.appendChild(_rm)
    }
  } catch (e) {}
  // v6.35 渲染器兜底（先生定调 2026-08-29）：开关三态化自检——
  // dsh.rawHtml 从未被「</>」按钮写入（undefined）时，自动默认开启并落盘 "1"，
  // 消除「新环境/清缓存后一切 VCP 卡显示源码」的陷阱；用户显式设 "0"（</> 关闭）
  // 才真正关闭。只补「从未设置」，绝不覆盖用户已有的显式选择。
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('dsh.rawHtml') === null) {
      localStorage.setItem('dsh.rawHtml', '1')
      if (typeof console !== 'undefined') console.debug('[vcp] dsh.rawHtml 未设置，渲染器自动默认开启（</> 按钮可关闭）')
    }
  } catch (e) {}
  // 宿主函数别名（跨前端代际兼容）：rc.5~rc.7 为 vc/hp；rc.8+ 压缩器改名 Xu/jd（rc.8 为 Sd）；
  // 0.1.5-alpha.2+（第三代）模块作用域没有这些名字——由 install-v6.cjs 注入的
  // window.__vcpHost 提供 React / jsx runtime / u5 属性转换 / xg style 解析。
  // 全部在调用时惰性解析：旧代际直连原符号，测试 stub 亦不受影响。
  function __vcpHostRef() {
    return (typeof window !== 'undefined' && window.__vcpHost) ? window.__vcpHost : null
  }
  function __vcpF() {
    var h = __vcpHostRef()
    if (h && h.jsx) return { jsx: h.jsx, jsxs: h.jsxs, Fragment: h.Fragment, createElement: h.createElement }
    return (typeof f !== 'undefined') ? f : null
  }
  function __vcpJsx(type, props) {
    return __vcpF().jsx(type, props)
  }
  function __vcpFrag() {
    return __vcpF().Fragment
  }
  function __vcpVc() {
    var h = __vcpHostRef()
    var fn = (h && h.vc) || (typeof vc === 'function' ? vc : (typeof Xu === 'function' ? Xu : null))
    return fn && fn.apply(null, arguments)
  }
  function __vcpHp(s) {
    var h = __vcpHostRef()
    var fn = (h && h.hp) || (typeof hp === 'function' ? hp : (typeof jd === 'function' ? jd : (typeof Sd === 'function' ? Sd : null)))
    return fn ? fn(s) : {}
  }
  // ---- 可信模式（Trusted Mode）v7.1 · 先生定调 2026-08-29 ----
  // 双人私密会话内容双方可信 → 正文可放行 script（WebGL/Shader/fetch 由此解锁）。
  // v7.2（先生定调）：可信模式的「状态与开关 UI」迁入插件 client 层（lib/client.js）——
  //   window.__vcpTrusted 由插件定义并随插件启停；插件未加载（停用）时本函数返回 false，
  //   行为与旧版完全一致（script 截断、URL 白名单严格、on* 不放行）＝安全默认。
  // 机制：闭合 <script> 在 parseFrag 阶段被提取出 vdom，消息渲染完成后统一 eval 执行
  // （不依赖 React 对 script 元素的执行行为，确定性一次执行）。
  function isTrusted() {
    try {
      return typeof window.__vcpTrusted === 'function' && window.__vcpTrusted()
    } catch (e) {}
    return false
  }
  var _trustedQueue = []
  var _trustedSeq = 0
  function extractTrustedScripts(html) {
    if (!isTrusted() || html.indexOf('<script') === -1) return html
    return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, function (m, code) {
      _trustedQueue.push({ id: 's' + (++_trustedSeq), code: code })
      return ''
    })
  }
  function decodeEntities(s) {
    if (!s || s.indexOf('&') === -1) return s
    if (typeof document === 'undefined') return s
    var ta = document.createElement('textarea')
    ta.innerHTML = s
    return ta.value
  }
  // 多时机执行 + 幂等：setTimeout(0) 可能在 React 挂载前（历史重渲染尤甚），
  // rAF 两帧 + 500ms 兜底保证至少一次在 DOM 就绪后执行；window.__vcpTrustedRan
  // 记录已执行 id，重复调用自动跳过（先生 2026-08-29 实测：黑洞脚本在历史
  // 重渲染时静默退出，根因即 DOM 未挂载 + 单次执行时机过早）
  function flushTrustedScripts() {
    if (!_trustedQueue.length) return
    var q = _trustedQueue
    _trustedQueue = []
    var w = window.__vcpTrustedRan || (window.__vcpTrustedRan = [])
    function exec() {
      for (var i = 0; i < q.length; i++) {
        var id = q[i].id
        if (w.indexOf(id) !== -1) continue
        w.push(id)
        try { (0, eval)(decodeEntities(q[i].code)) } catch (e) { if (typeof console !== 'undefined') console.error('[vcp-trusted] script 执行失败:', e) }
      }
    }
    if (typeof setTimeout === 'function') setTimeout(exec, 0)
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { setTimeout(exec, 0) })
      requestAnimationFrame(function () { setTimeout(exec, 20) })
    }
    if (typeof setTimeout === 'function') setTimeout(exec, 500)
  }
  // 页面右下角可信模式开关徽章（v7.2 起由插件 client 层提供，见 lib/client.js）

  var F = window.__vcpFast || (window.__vcpFast = {
    c: new Map(),           // 整串缓存（v → 元素）
    open: null,             // 当前未闭合容器 { raw, end, props, tag }
    openRaw: '',            // 上帧容器开标签源码（props 缓存判据）
    inner: [],              // 容器内已固化块 [{ s, el }]
    outer: [],              // 容器外已固化块 [{ s, el }]
    src: '',                // 全部固化块源码拼接（inner 在前 outer 在后）
    colored: typeof WeakSet !== 'undefined' ? new WeakSet() : null, // 色彩注入幂等（自 B 移植）
    hits: 0, builds: 0, ms: 0, lastLog: 0, last: '', el: null
  })

  var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 }
  var RAWTEXT = { script: 1, style: 1 }
  var IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
  var ANIM_RE = /animation:([^;"']*);?/g

  // ---- 具名常量（魔数收拢 · 克莉丝 3.4）----
  var CACHE_MAX = 200                // 整串缓存上限（F.c）
  var LOG_THROTTLE_MS = 2000         // [vcp-stable] 日志节流间隔
  var MERMAID_CACHE_MAX = 30         // mermaid SVG 渲染缓存上限
  var MERMAID_MAX_HEIGHT = '520px'   // mermaid 视图封顶高度
  var MERMAID_RETRY_MS = 200         // mermaid 未生成 SVG 重试间隔
  var KATEX_RETRY_MAX = 30           // KaTeX 未就绪轮询次数上限
  var KATEX_RETRY_MS = 200           // KaTeX 轮询间隔
  var MATH_DEBOUNCE_MS = 600         // 流式公式防抖停顿

  // ---- 工具 ----
  function imgConvert(text) {
    if (text.indexOf('![') === -1) return text
    return text.replace(IMG_RE, function (m, a, u) {
      u = u.trim()
      if (!/^(https?:|data:image\/|\/)/i.test(u)) return m
      return '<img alt="' + (a || '').replace(/"/g, '&quot;') + '" src="' + u.replace(/"/g, '&quot;') + '">'
    })
  }

  // ---- 图片收敛（v6.20）：流式期间 <img> 不超容器、不撑爆版面 ----
  // 现象：卡片 <style> 沉卡尾，流式期间 img 的 width:100% 规则尚未写出，
  // 图片以固有尺寸（原图可能巨大）直接撑爆版面，直到流式结束样式生效才回归。
  // 解法：给所有 <img> 内联注入 max-width:100%;height:auto 兜底——第一帧就
  // 生效、不依赖卡尾 <style>；与 <style> 的 width:100% 叠加结果一致，无冲突。
  // 模型显式设宽（width / max-width）的图片不注入，尊重其意图。
  var IMG_TAG_RE = /<img\b([^>]*?)\s*\/?>/gi
  function constrainImg(text) {
    if (!text || text.indexOf('<img') === -1) return text
    return text.replace(IMG_TAG_RE, function (m, attrs) {
      var sm = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)
      var sv = sm ? sm[2] : ''
      if (/(?:^|[;{])\s*(?:max-width|width)\s*:/i.test(sv)) return m
      var inject = 'max-width:100%;height:auto'
      if (sm) {
        var q = sm[1]
        var ns = sv ? sv + ';' + inject : inject
        return '<img' + attrs.slice(0, sm.index) + 'style=' + q + ns + q + attrs.slice(sm.index + sm[0].length) + '>'
      }
      return '<img' + attrs + ' style="' + inject + '">'
    })
  }

  function stripOneShotAnim(text) {
    return text.replace(ANIM_RE, function (m, x) { return /infinite/.test(x) ? m : '' })
  }

  // ---- 流式尾巴占位（v6.5 · 方案 B）----
  // DOMParser 会把「未闭合标签」（半标签，如 <circle cx="50"）整体丢弃，
  // 流式中 tail 出现半标签时页面会空窗或泄漏属性文本（观感像卡住/显示代码）。
  // 解决：把 tail 末尾的未闭合标签替换为「绘制中」占位 span；已闭合内容照常
  // 渲染；下一帧标签写完，占位自然消失、真实元素出现。零成本、零闪烁。
  var TAIL_INCOMPLETE_RE = /<[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^>]*)?$/
  var TAIL_PH_TAGS = /^(svg|path|circle|rect|line|polygon|polyline|g|defs|text|animate|animateTransform|animateMotion|use|filter|mask|linearGradient|radialGradient|stop|clipPath|ellipse)$/i
  function tailPlaceholder(text) {
    if (!text || text.indexOf('<') === -1) return text
    var m = TAIL_INCOMPLETE_RE.exec(text)
    if (!m) return text
    var tag = (/^<([a-zA-Z0-9:-]+)/.exec(m[0]) || [])[1] || ''
    var label = TAIL_PH_TAGS.test(tag) ? 'SVG 绘制中…' : '元素绘制中…'
    var ph = '<span class="vcp-tail-ph" style="display:inline-block;background:rgba(64,180,255,.09);border:1px dashed rgba(64,180,255,.45);border-radius:6px;padding:2px 12px;margin:2px;color:rgba(191,233,255,.75);font-size:12px;letter-spacing:1px;vertical-align:middle;">' + label + '</span>'
    return text.slice(0, m.index) + ph
  }

  // 防御：移除 <style> 内容里的空行（CSS 语法不需要空行；避免残留空行引发
  // 解析层面的截断类问题）。仅对「完整闭合的 style」生效。
  function sanitizeStyle(text) {
    if (text.indexOf('<style') === -1) return text
    return text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, function (m) {
      return m.replace(/\n\s*\n/g, '\n')
    })
  }

  // ---- 文字声明优先级提升（v6.19）：抵御字体/主题插件的全局覆盖 ----
  // 现象：卡片 <style> 内的 font-family/font-size/color 等声明无 important，
  // 被其他字体/主题插件注入的全局规则（如 *{font-family:...} 或 body 级
  // !important）覆盖——先生实测主标题「华文行楷→楷体回落」56 号朱红大字
  // 未能渲染出卡片声明的字体。KaTeX 走 lockKatexStyles、容器开标签内联
  // style 走 parseOpen 的 ref 锁定，唯独 <style> 内声明缺一道优先级保险。
  // 解法：源码层给 <style> 内的【文字类声明】追加 !important——配合 #vcp-msg-N
  // 的高特异性选择器，压过插件的低特异性全局字体规则；只提升文字类
  // （color/font-*/line-height/letter-spacing/text-align/text-shadow），
  // 不动背景/布局/动画，卡内层叠关系不变；已有 important 跳过（幂等）。
  // 值里不会出现 `;` / `!` / `}`（CSS 声明分隔符），故用 [^;!}] 安全取全值。
  var BOOST_TEXT_DECL_RE = /(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)\s*:\s*([^;!}]+?)(!important)?\s*(;|})/gi
  // @font-face 块保护（先生 · 2026-08-28 · 字库增刊实测）：@font-face 描述符
  // 不允许 !important——一旦注入（font-family:'X' → font-family:'X'!important），
  // 整个 @font-face 规则作废、字体加载失败（先生下载的鱼尾行书/狂派手书等
  // 全部回落系统字体）。解法：boost 前把 @font-face 块整体替换为占位符
  // （\u0001F<序号>\u0001，不含 ;!} 故不会被 DECL_RE 命中），boost 后再还原。
  var FACE_PLACEHOLDER_RE = /@font-face\s*\{[^}]*\}/gi
  function boostTextImportant(css) {
    if (!css) return css
    var faces = []
    css = css.replace(FACE_PLACEHOLDER_RE, function (m) {
      faces.push(m)
      return '\u0001F' + (faces.length - 1) + '\u0001'
    })
    css = css.replace(BOOST_TEXT_DECL_RE, function (m, prop, val, imp, term) {
      if (imp) return m
      return prop + ':' + val + '!important' + term
    })
    if (faces.length) {
      css = css.replace(/\u0001F(\d+)\u0001/g, function (m, i) { return faces[+i] })
    }
    return css
  }
  function boostStyle(text) {
    if (!text || text.indexOf('<style') === -1) return text
    return text.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, function (m, open, css, close) {
      return open + boostTextImportant(css) + close
    })
  }

  // ---- 字体链继承兜底（v6.33）：未显式声明字体的元素强制继承根容器字体 ----
  // 现象：皮肤/主题插件注入带 !important 的全局 font-family 规则（特异性约 (0,2,0)），
  // 卡片里「没写字体」的元素（如标题里仅染色的强调 span）被劫持成皮肤字体；不同字符
  // 命中的 fallback 字面率不一 → 同字号却显小（先生实测「登陆」比「海南昌江沿海」小）。
  // v6.33 首版用 #uid :where(*) 单条规则，先生实测仍小——根因：applyRootGuard 补的
  // 根容器 fontFamily 是普通内联（ref 锁定只认源码写了的内联属性），皮肤规则仍能劫持
  // 根容器本身；子元素 inherit 继承的是「被劫持的根容器」→ 链断。v6.33b 双保险：
  //   ① #uid{font-family:<系统链> !important} —— 锁定根容器（AI 内联/类显式字体
  //      分别被 ref 锁定 (内联!important) 与 boost 后 (1,1,0)!important 稳压，尊重）
  //   ② 常用文字标签逐条 #uid tag{font-family:inherit !important} —— 不依赖 :where()
  //      （规避选择器引擎兼容面），特异性 (1,0,1)!important 稳压皮肤 (0,2,0)!important
  // 只兜「没写字体」的元素：AI 显式书法/等宽字体（类规则 boost 后 (1,1,0)!important）
  // 稳压本规则；内联 font-family 走 parseOpen ref 锁定（内联 !important）不受影响。
  // 仅对「有 <style> 的卡」注入（挂最后一个 </style> 前）——不改变无 style 卡的
  // DOM 结构（纯内联卡字体走 ref 锁定，风险面小）；流式中 <style> 未闭合帧不注入、
  // 闭合帧自动注入。
  var FONT_INHERIT_TAGS = 'div,p,span,h1,h2,h3,h4,h5,h6,li,td,th,a,strong,b,em,i,blockquote,pre,code,small,label,figcaption,summary,button'
  var FONT_SYSTEM_CHAIN = "ui-sans-serif,system-ui,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"
  var FONT_INHERIT_RULE = function (uid) {
    var out = '\n  /* v6.33 渲染器注入：字体链兜底（根容器锁定 + 未声明字体元素继承）*/\n  #' + uid + '{font-family:' + FONT_SYSTEM_CHAIN + ' !important}\n  '
    var tags = FONT_INHERIT_TAGS.split(',')
    for (var i = 0; i < tags.length; i++) {
      out += '#' + uid + ' ' + tags[i] + '{font-family:inherit !important}\n  '
    }
    return out
  }
  function injectFontInherit(html, uid) {
    if (!html) return html
    var li = html.lastIndexOf('</style>')
    if (li === -1) return html
    return html.slice(0, li) + FONT_INHERIT_RULE(uid) + html.slice(li)
  }

  // ---- 消息级作用域化（v6.12）：根治「后卡样式污染前卡」----
  // 现象：历史消息的 <style> 永不移除 + 所有消息共用 id="vcp-root" + CSS
  // 层叠「同特异性后写覆盖先写」→ 后一条消息的样式会把前面所有消息染掉。
  // 解法：每条消息的根容器分配唯一 id（vcp-msg-N），并把该消息全文里的
  // #vcp-root 选择器同步替换为 #vcp-msg-N——样式只命中自己的容器，互不串扰。
  // v6.19：改为全文全局替换（不再限定「完整闭合的 <style>」）——流式期间
  // <style> 尚未闭合时（卡尾样式正在输出），其内的 #vcp-root 也要随帧替换，
  // 否则补闭合渲染的活样式选择器仍指向 #vcp-root，匹配不到已改名的容器，
  // 背景/字体在流式中不生效。
  // 流式稳定性：同一消息跨帧复用同一 uid（前缀匹配判定），缓存键 v 不抖动，
  // v6 增量缓存/固化块引用不受影响；多消息切换（前缀失配）自动换 uid。
  var scopeLast = null
  var scopeSeq = 0
  function scopeVcp(raw) {
    if (!raw || raw.indexOf('vcp-root') === -1) return raw
    var hasRoot = /<div[^>]*\bid=["']vcp-root["']/i.test(raw)
    if (!hasRoot && raw.indexOf('#vcp-root') === -1) return raw
    var uid
    if (scopeLast && raw.indexOf(scopeLast.raw) === 0) {
      uid = scopeLast.uid
    } else {
      uid = 'vcp-msg-' + (++scopeSeq)
    }
    scopeLast = { raw: raw, uid: uid }
    var out = raw.replace(/(<div[^>]*\bid=)["']vcp-root["']/i, '$1"' + uid + '"')
    // 全文全局替换：正文里的 #vcp-root 字样也一并改（概率极低，无害），
    // 关键是让「未闭合 <style>」里正在输出的选择器也随帧指向唯一 id。
    out = out.replace(/#vcp-root/g, '#' + uid)
    out = injectFontInherit(out, uid) // v6.33：字体链继承兜底注入
    return out
  }

  function resetF() {
    F.open = null; F.openRaw = ''; F.inner = []; F.outer = []; F.src = ''; F.c.clear()
  }

  // ---- 轻量 HTML 标签扫描 ----
  function tagEndAt(str, lt) {
    var q = null, i = lt + 1
    for (; i < str.length; i++) {
      var c = str[i]
      if (q) { if (c === q) q = null; continue }
      if (c === '"' || c === "'") { q = c; continue }
      if (c === '>') return i
    }
    return -1
  }

  // 从 from 起找下一个标签 token；返回 {type,name,start,end} 或 null
  // type: open | close | self | comment | decl | unknown | incomplete
  function nextTag(str, from) {
    var lt = str.indexOf('<', from)
    if (lt === -1) return null
    if (str.slice(lt, lt + 4) === '<!--') {
      var ce = str.indexOf('-->', lt + 4)
      return { type: 'comment', start: lt, end: ce === -1 ? str.length : ce + 3 }
    }
    var c1 = str[lt + 1]
    if (c1 === '!' || c1 === '?') {
      var de = tagEndAt(str, lt)
      return { type: 'decl', start: lt, end: de === -1 ? str.length : de + 1 }
    }
    var te = tagEndAt(str, lt)
    if (te === -1) return { type: 'incomplete', start: lt, end: str.length }
    var raw = str.slice(lt + 1, te)
    var m = /^\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw)
    if (!m) return { type: 'unknown', start: lt, end: te + 1 }
    var isClose = raw.trim().charCodeAt(0) === 47 // '/'
    return {
      type: isClose ? 'close' : (/\/\s*$/.test(raw) ? 'self' : 'open'),
      name: m[1].toLowerCase(),
      start: lt,
      end: te + 1
    }
  }

  /**
   * 从 start 扫描 str，切出已闭合块与未闭合容器。
   * 两种模式：
   *   inContainer=false（顶层）：只切「顶层完整闭合块」到 outer；
   *     未闭合的最外层结构作为「容器候选」输出到 open（其内部子块留待
   *     状态机以 inContainer 模式固化）；块间出现任何非空内容（文本/注释/
   *     声明/孤儿闭标签）→ 从该处起归 tail（阻止后续固化，保源码顺序）。
   *   inContainer=true（状态机已知容器内部）：只切「容器内闭合子块」到
   *     inner；遇到闭合状态机容器的闭标签 → closed=true；子块间裸文本 → tail。
   * 返回 { open, inner, innerTail, outer, tailStart, closed }
   * 规则：script/style 内容按 rawtext 跳过；void 标签视为自闭合。
   */
  function scan(str, start, inContainer) {
    var out = { open: null, inner: [], innerTail: -1, outer: [], tailStart: start, closed: false }
    var stack = []        // 未闭合 open 标签
    var curStart = -1     // 当前累积块起点（顶层/容器）
    var subStart = -1     // 容器内当前子块起点（仅 inContainer）
    var i = start

    while (i < str.length) {
      var tok = nextTag(str, i)
      if (!tok) break

      // token 之前的裸文本
      if (tok.start > i) {
        if (inContainer) {
          if (subStart === -1) { out.innerTail = i; return out }
        } else {
          if (stack.length === 0) { out.tailStart = i; return out }
        }
        // 块内文本：属于当前块内容，正常继续
      }

      if (tok.type === 'comment' || tok.type === 'decl' || tok.type === 'unknown') {
        // 块间注释/声明 → 归 tail（保顺序）；块内跳过
        if (inContainer) { if (subStart === -1) { out.innerTail = tok.start; return out } }
        else if (stack.length === 0) { out.tailStart = tok.start; return out }
        i = tok.end
        continue
      }
      if (tok.type === 'incomplete') {
        // 流式中开标签未闭合：起点后的内容都算 tail；未闭合容器候选交给循环结束输出
        if (inContainer) { if (subStart === -1) out.innerTail = tok.start; return out }
        if (stack.length === 0) { out.tailStart = tok.start; return out }
        out.innerTail = tok.start
        break
      }

      if (tok.type === 'open' && RAWTEXT[tok.name]) {
        // script/style 原始文本：完整闭合时整个块直接固化。
        // 未闭合（流式中正在输出）时：从开标签起归 tail，绝不「跳过继续扫描」——
        //   style → parseFrag 补闭合渲染活样式（背景/字体随流式逐步生效）；
        //   script → parseFrag 转 \u0000 截断丢弃（绝不把 JS 当元素渲染）。
        // 文字里的伪 <style> 字样在非流式 fullRender 走 escapeUnclosedRawtext 转义
        // 不受影响；流式中被误判归 tail 的最坏结果只是该帧多渲染一丁点样式，终帧自愈。
        var closeIdx = str.toLowerCase().indexOf('</' + tok.name, tok.end)
        if (closeIdx === -1) {
          if (inContainer) { if (subStart === -1) out.innerTail = tok.start; return out }
          if (stack.length === 0) { out.tailStart = tok.start; return out }
          out.innerTail = tok.start
          break
        }
        var ct = nextTag(str, closeIdx)
        var rawEnd = ct ? ct.end : str.length
        if (inContainer) {
          if (subStart === -1) out.inner.push(str.slice(tok.start, rawEnd))
        } else if (stack.length === 0 && curStart === -1) {
          out.outer.push(str.slice(tok.start, rawEnd))
        }
        i = rawEnd
        continue
      }

      if (tok.type === 'open' && VOID_TAGS[tok.name]) { tok.type = 'self' }

      if (tok.type === 'open') {
        if (stack.length === 0) {
          if (curStart === -1) curStart = tok.start
          if (inContainer && subStart === -1) subStart = tok.start
        } else if (inContainer && stack.length === 1 && subStart === -1) {
          subStart = tok.start
        }
        stack.push(tok)
        i = tok.end
        continue
      }

      if (tok.type === 'close') {
        var found = -1
        for (var k = stack.length - 1; k >= 0; k--) if (stack[k].name === tok.name) { found = k; break }
        if (found === -1) {
          // 闭合扫描起点之前的内容（状态机容器收尾 / 顶层孤儿闭标签）→ 剩余全归 tail
          out.closed = inContainer
          out.innerTail = tok.start
          return out
        }
        stack.splice(found)
        if (stack.length === 0) {
          if (inContainer) {
            if (subStart >= 0) { out.inner.push(str.slice(subStart, tok.end)); subStart = -1 }
          } else if (curStart >= 0) {
            out.outer.push(str.slice(curStart, tok.end))
            curStart = -1
          }
        }
        i = tok.end
        continue
      }

      if (tok.type === 'self') {
        if (inContainer) {
          if (stack.length === 0 && subStart === -1) out.inner.push(str.slice(tok.start, tok.end))
        } else if (stack.length === 0 && curStart === -1) {
          out.outer.push(str.slice(tok.start, tok.end))
        }
        i = tok.end
        continue
      }
    }

    if (inContainer) {
      out.open = null
      out.innerTail = subStart >= 0 ? subStart : str.length
    } else if (stack.length > 0) {
      var first = stack[0]
      out.open = { raw: str.slice(first.start, first.end), end: first.end }
      if (out.innerTail === -1) out.innerTail = subStart >= 0 ? subStart : str.length
    } else {
      out.tailStart = curStart >= 0 ? curStart : str.length
    }
    return out
  }

  // ---- 解析 ----
  // 注意：DOMParser 解析「片段」时，<style>/<link> 会被 HTML 解析器放入 head
  // （head 是样式容器，规范行为），body 里取不到——必须把 head 里的样式元素也收集。
  // 顺序：head 样式在前、body 内容在后（与源码顺序一致）。
  // 防御：把「其后没有闭合标签」的 <style>/<script> 开标签转义为文本——
  // 文字里的伪标签字样（反引号示例等）不应被 DOMParser 当真标签吞掉后续内容；
  // 完整闭合的标签（真样式块）不受影响。
  function escapeUnclosedRawtext(html, isTail) {
    return html.replace(/<(style|script)(\s[^>]*)?>/gi, function (m, name) {
      var after = html.slice(html.indexOf(m) + m.length).toLowerCase()
      if (after.indexOf('</' + name.toLowerCase() + '>') === -1) {
        // 未闭合：tail 场景 → 截断（丢弃未闭合标签及其后内容，避免泄漏）；
        // 块场景 → 转义为文本（文字里的伪标签字样原样显示）。
        // v6.19 例外：tail 中未闭合的 <style> 保留开标签——parseFrag 补闭合后
        // 作为「活样式」随流式渲染，让背景/字体从第一帧起逐步生效（不再最后
        // 一帧才闪现）；未闭合的 script 仍截断（绝不把 JS 当元素渲染）。
        if (isTail && name.toLowerCase() === 'style') return m
        return isTail ? '\u0000' : '&lt;' + m.slice(1)
      }
      return m
    })
  }

  // 平衡花括号：流式期间 <style> 内容「{」已开、「}」未写时，补足「}」让已写出的
  // 声明形成完整规则块、立即生效（否则浏览器丢弃不完整规则块，背景仍最后才闪现）。
  function closeBraces(css) {
    var depth = 0
    for (var i = 0; i < css.length; i++) {
      var ch = css.charCodeAt(i)
      if (ch === 123) depth++                          // {
      else if (ch === 125) { if (depth > 0) depth-- }  // }
    }
    var out = css
    while (depth-- > 0) out += '}'
    return out
  }

  // 位置感知的花括号修复（v6.33f）：closeBraces 只在末尾补 }，救不回被吞的规则。
  // 现象：`.code{...;` 漏 }，后续 `.dot` 规则与 @keyframes 被浏览器吞进 .code
  // 声明块（先生实测卡 2：SVG 动画不转）。
  // 启发式（块类型栈 + 选择器挪位）：CSS 里「普通规则块（选择器{...}）只能含声明、
  // 不能嵌套规则」——遇到 `{` 且当前块是 rule 块 → 前一个规则漏了 }：
  //   · 把「新 { 前刚输出的选择器文本」从 out 尾部截出，挪到补的 } 之后——
  //     让新规则独立成块（`#vcp-root .dot` 不再被当作前块声明）
  //   · at-rule 块（@media/@supports/@keyframes 等，以 @ 开头）允许嵌套规则，
  //     栈顶是 at 时不补 —— 正常嵌套零误伤
  //   · 正常 CSS 的规则块都有配对 }，栈不残留 rule → 幂等
  // 选择器文本边界：只认 ; { } 为块边界（选择器可含空格/[]，不截断）。
  function closeBracesSmart(css) {
    var depth = 0, out = ''
    var stack = [] // 每层块类型：'at' | 'rule'
    for (var i = 0; i < css.length; i++) {
      var ch = css[i]
      if (ch === '{') {
        // 取新 { 前的选择器/@规则名文本（从上一个块边界 ; { } 到 out 末尾）
        var cut = out.length
        while (cut > 0 && out[cut - 1] !== ';' && out[cut - 1] !== '{' && out[cut - 1] !== '}') cut--
        var sel = out.slice(cut).trim()
        var isAt = sel.charAt(0) === '@'
        var topIsRule = stack.length > 0 && stack[stack.length - 1] === 'rule'
        if (topIsRule) {
          // 前块漏 }：选择器文本挪到 } 之后 → 新规则独立
          out = out.slice(0, cut) + '}' + sel
          stack.pop()
          depth--
        }
        stack.push(isAt ? 'at' : 'rule')
        depth++
        out += ch
      } else if (ch === '}') {
        if (depth > 0) { depth--; if (stack.length) stack.pop() }
        out += ch
      } else {
        out += ch
      }
    }
    while (depth-- > 0) out += '}'
    return out
  }

  function parseFrag(html, isTail) {
    if (!html) return null
    html = escapeUnclosedRawtext(html, isTail)
    html = extractTrustedScripts(html)
    if (isTail) {
      // 流式 tail：未闭合的 <style> 补闭合 + 平衡花括号——CSS 规则块（#id{...}）
      // 在流式中「{」已开「}」未写时被浏览器整体丢弃，背景/字体仍要等整块写完才
      // 一次性出现；补足「}」让已写出的声明立即生效，背景随流式逐步长出。
      var sm = /<style([^>]*)>/i.exec(html)
      if (sm && !/<\/style>/i.test(html)) {
        var before = html.slice(0, sm.index)
        var css = html.slice(sm.index + sm[0].length)
        html = before + sm[0] + closeBraces(css) + '</style>'
      }
      var cut = html.indexOf('\u0000')
      if (cut !== -1) html = html.slice(0, cut)
    }
    // 花括号平衡兜底（v6.33f）：流式 tail 的 closeBraces 只覆盖「<style> 未闭合」，
    // 且只在末尾补 }——非流式（历史消息/终帧）里 <style> 已闭合但漏 } 时，浏览器
    // 会把后续规则与 @keyframes 吞进前一个规则块 → 动画失效、样式错乱（先生实测：
    // 卡 2 漏 } + @keyframes 被吞 → SVG 动画不转）。此处对每个闭合 <style> 内的
    // CSS 做位置感知修复（closeBracesSmart：在新规则起始处就地补缺失的 }），
    // 只在真的不平衡时改动（平衡 CSS 原样返回）。
    html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function (m, css) {
      var fixed = closeBracesSmart(css)
      return fixed === css ? m : m.replace(css, fixed)
    })
    // 文字声明优先级提升：给已闭合 <style> 内的 font-family/color 等加 !important
    // （流式 tail 补闭合后同样走到这里 → 流式期间字体亦获最高优先级）。
    html = boostStyle(html)
    // 防认领：给「闭合的 <style>」打 data-plugin 标记——DSH 插件系统会
    // 把页面里「未标记的 style」认领（claimStyles）并在插件热更新时移除
    // （removeOwnedStyles）；用永不冲突的假 id 标记消息自己的 style，避免被误删。
    html = html.replace(/<style(\s[^>]*)?>/gi, '<style$1 data-plugin="vcp-message">')
    var doc = new DOMParser().parseFromString(html, 'text/html')
    var o = []
    var h = doc.head
    if (h) {
      for (var k = 0; k < h.childNodes.length; k++) {
        var hn = h.childNodes[k]
        if (hn.nodeType === 1 && (hn.localName === 'style' || hn.localName === 'link')) o.push(__vcpVc(hn, o.length))
      }
    }
    var b = doc.body
    for (var j = 0; j < b.childNodes.length; j++) o.push(__vcpVc(b.childNodes[j], o.length))
    if (!o.length) return null
    var res = o.length === 1 ? o[0] : __vcpJsx(__vcpFrag(), { children: o })
    guardChildren(res) // v6.23：子容器布局防崩递归兜底（新增块粒度，微秒级）
    return res
  }

  // 解析容器开标签 → { tag, props }（复用 vc 的安全过滤，不含 children）
  function parseOpen(raw) {
    try {
      var el = new DOMParser().parseFromString(raw, 'text/html').body.firstChild
      if (!el || el.nodeType !== 1) return null
      var props = {}
      for (var ci = 0; ci < el.attributes.length; ci++) {
        var c = el.attributes[ci]
        if (/^on/i.test(c.name)) { if (!isTrusted()) continue; props[c.name] = c.value; continue }
        if (c.name === 'style') {
          var sv = c.value
            .replace(/position\s*:\s*fixed\s*;?/gi, '')
            .replace(/z-index\s*:\s*\d{4,}\s*;?/gi, '')
            .replace(/(?<![\w-])content\s*:[^;]*;?/gi, '')
          props.style = __vcpHp(sv)
          // 锁定文字属性优先级：容器开标签里的文字样式不被其他字体/主题插件覆盖
          props.ref = function (el) {
            if (!el) return
            for (var di = 0; di < sv.split(';').length; di++) {
              var decl = sv.split(';')[di]
              var j = decl.indexOf(':')
              if (j === -1) continue
              var p = decl.slice(0, j).trim()
              var val = decl.slice(j + 1).trim()
              if (val && /^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)$/.test(p)) el.style.setProperty(p, val, 'important')
            }
          }
          continue
        }
        if (c.name === 'class') { props.className = c.value; continue }
        if (c.name === 'href' && !isTrusted() && !/^(https?:|mailto:|\/|#)/i.test(c.value)) continue
        if (c.name === 'src' && !isTrusted() && !/^(https?:|data:image\/|\/|#)/i.test(c.value)) continue
        if ((c.name === 'action' || c.name === 'formaction' || c.name === 'xlink:href') && !isTrusted() && !/^(https?:|mailto:|\/|#)/i.test(c.value)) continue
        if (isTrusted() && (c.name === 'href' || c.name === 'src' || c.name === 'action' || c.name === 'formaction' || c.name === 'xlink:href') && /^\s*javascript:/i.test(c.value)) continue
        props[c.name] = c.value
      }
      return { tag: el.localName, props: props }
    } catch (e) { return null }
  }

  // ---- 根容器布局防崩兜底（v6.22）：自愈层 · 结构永不崩 ----
  // 不管 AI 怎么写，以下结构属性缺失时自动补默认（不覆盖显式意图）：
  //   box-sizing:border-box  → width:100% + padding 不再出框
  //   max-width:920px        → 缺宽度上限时默认收窄到报纸版心（v6.33e：AI 没写
  //                            任何宽度就拉满屏幕成整条色板；920px 版心形成
  //                            「卡片」边界感——先生实测 5 张测试卡后定调）
  //   overflow-wrap:break-word → 长 URL / 长英文词不撑破版面
  //   font-family            → 缺省字体时用系统无衬线链（防裸奔默认字体）
  // 宽度判断：AI 显式写了 width 或 max-width（全宽/自定义宽度意图）→ 尊重不补。
  // 圆角不兜底（先生定调 · v6.33b）：border-radius 是装饰不是结构——AI 没写圆角
  //   ≠ 忘记，可能是报纸/极简风「要直角」而故意省略容器装饰；强补 24px 会误判
  //   AI 意图。结构兜底（背景/盒子/字体链）照兜，圆角默认直角（0），尊重设计。
  // 纯属性操作，每帧微秒级、零 token 消耗；与渲染器既有的 img 收敛 /
  // 文字 important / 花括号平衡同属「自愈层」，审美仍由 AI 决定、结构由程序兜底。
  function applyRootGuard(props) {
    var id = props.id || ''
    if (!/^vcp-(msg-)?\d+$/.test(id)) return
    var st = props.style || (props.style = {})
    if (!st.boxSizing) st.boxSizing = 'border-box'
    if (!st.maxWidth && !st.width) st.maxWidth = '920px' // v6.33e：缺宽度 → 收窄版心
    if (!st.overflowWrap) st.overflowWrap = 'break-word'
    if (!st.fontFamily) st.fontFamily = FONT_SYSTEM_CHAIN
  }

  // ---- 子容器布局防崩（v6.23）：递归补 box-sizing + 表格/代码块溢出防护 ----
  // 递归遍历新增块 vdom，只对「块级/容器标签 + 设了宽类样式」的元素补
  // box-sizing:border-box（width:100% + padding 不再出框）；table 块级化 +
  // 横向滚动（防表格撑破版面）；pre 代码块限宽 + 横向滚动（防长代码撑破）。
  // 缺失才补、不覆盖显式意图；只作用于新增块，每帧微秒级。
  var GUARD_TAGS = { div:1, section:1, article:1, header:1, footer:1, main:1, aside:1, nav:1, ul:1, ol:1, li:1, table:1, tr:1, td:1, th:1, form:1, figure:1, figcaption:1, blockquote:1, pre:1, p:1 }
  // SVG 自愈（v6.24）：svg 根限宽等比（防超大图撑破版面）；带 transform 动画的
  // SVG 元素补 transform-box:fill-box + transform-origin:center——缺 fill-box 时
  // transform-origin 按 viewport 原点计算，旋转/缩放错位甚至不可见（最常见故障）。
  var SVG_TAGS = { svg:1, rect:1, circle:1, path:1, g:1, line:1, polygon:1, polyline:1, ellipse:1, text:1, defs:1, use:1, filter:1, mask:1, linearGradient:1, radialGradient:1, stop:1, clipPath:1, animate:1, animateTransform:1, animateMotion:1 }
  function guardChildren(node) {
    if (!node || typeof node !== 'object') return
    var props = node.props
    if (!props) return
    var tag = node.tag || (typeof node.type === 'string' ? node.type : '')
    var st = props.style
    if (SVG_TAGS[tag]) {
      // svg 根即使无 style 也补：块级化 + 限宽——svg 默认 inline，inline 替换元素
      // 的宽度计算有浏览器差异（width 属性与 viewBox 比例不一致时内容会整体偏右/出框）；
      // display:block 让宽度确定收敛为容器宽，viewBox 内容 meet 居中。不动 height
      // （保留 AI 的 height 属性，消除 height:auto 的浏览器差异）。
      if (tag === 'svg') {
        if (!st) st = props.style = {}
        if (!st.display) st.display = 'block'
        if (!st.maxWidth) st.maxWidth = '100%'
      }
      // 带 transform 动画的元素补 fill-box（无动画不创建空 style）
      if (st && (st.animation || st.transform) && !st.transformBox) {
        st.transformBox = 'fill-box'
        if (!st.transformOrigin) st.transformOrigin = 'center'
      }
    }
    if (GUARD_TAGS[tag]) {
      if (tag === 'table') {
        // 表格防撑破组合拳（v6.29）：display:block 块级化 + width:100% 强制表格宽
        // = 容器宽（不再由内容决定）+ max-width 上限 + overflow-x 滚动。
        // 只加 display:block/overflow 不够——nowrap 单元格会把表格布局撑宽溢出。
        if (!st) st = props.style = {}
        if (!st.display) st.display = 'block'
        if (!st.width) st.width = '100%'
        if (!st.maxWidth) st.maxWidth = '100%'
        if (!st.overflowX) st.overflowX = 'auto'
      } else if (tag === 'pre') {
        // pre 即使无内联 style 也补溢出防护（嵌套深卡无样式代码块同样兜住）
        if (!st) st = props.style = {}
        if (!st.overflowX) st.overflowX = 'auto'
        if (!st.maxWidth) st.maxWidth = '100%'
      } else if (st && (tag === 'td' || tag === 'th') && (st.whiteSpace === 'nowrap' || st.whiteSpace === 'pre')) {
        // nowrap/pre 单元格：内容裁剪防画出表格（配合表格滚动查看）
        if (!st.overflow) st.overflow = 'hidden'
      } else if (st && !st.boxSizing && (st.width || st.minWidth || st.maxWidth || st.display)) {
        // 其余设宽容器：缺失才补 box-sizing（无 style 或无宽不干预）
        st.boxSizing = 'border-box'
      }
    }
    var ch = node.children || props.children
    if (Array.isArray(ch)) { for (var i = 0; i < ch.length; i++) guardChildren(ch[i]) }
    else if (ch && typeof ch === 'object') guardChildren(ch)
  }

  // ---- 文字对比度自愈（v6.32）：大背景 → code 背景 → code 字 三级阶梯 ----
  // 模型（先生定）：大背景深 → code 背景浅 → code 字深；大背景浅 → code 背景深 →
  // code 字浅——每级与相邻级保持对比。只修正 code 内的字色（大背景中无 code 的
  // 文字不动）；AI 写对的不干预。
  // 半透明的坑：code 背景半透明时，实际视觉色 = 与底层大背景叠加后的颜色，不能
  // 按 code 自身 rgb 或大背景直接判断——向上找最近不透明祖先，alpha 混合算实际色，
  // 再按实际色亮度决定字色（否则半透明 code + 深字在深底上会看不清）。
  function cssChannel(v) {
    var c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  function cssLuminance(cssColor) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cssColor || '')
    if (!m) return 1
    return 0.2126 * cssChannel(+m[1]) + 0.7152 * cssChannel(+m[2]) + 0.0722 * cssChannel(+m[3])
  }
  function rgbLuminance(rgb) {
    if (!rgb) return 1
    return 0.2126 * cssChannel(rgb[0]) + 0.7152 * cssChannel(rgb[1]) + 0.0722 * cssChannel(rgb[2])
  }
  // 解析 css 颜色字符串 → {rgb:[r,g,b], alpha}；解析失败返回 null
  function parseColor(cssColor) {
    var m = /rgba?\(([^)]*)\)/.exec(cssColor || '')
    if (!m) return null
    var parts = m[1].split(',').map(function (s) { return parseFloat(s.trim()) })
    if (parts.length < 3) return null
    return { rgb: [parts[0], parts[1], parts[2]], alpha: parts.length > 3 && !isNaN(parts[3]) ? parts[3] : 1 }
  }
  // 向上找最近的不透明背景色（祖先链），返回 [r,g,b] 或 null
  function nearestOpaqueBg(el) {
    var n = el.parentElement
    while (n && n.nodeType === 1) {
      var pc = parseColor(window.getComputedStyle(n).backgroundColor)
      if (pc && pc.alpha >= 1) return pc.rgb
      n = n.parentElement
    }
    return null
  }
  function fixCodeContrast(root) {
    if (!root || !root.querySelectorAll || typeof window === 'undefined' || !window.getComputedStyle) return
    var codes = root.querySelectorAll('code')
    for (var i = 0; i < codes.length; i++) {
      var el = codes[i]
      try {
        var cs = window.getComputedStyle(el)
        var color = cs.color
        var bgP = parseColor(cs.backgroundColor)
        if (!bgP) continue
        if (bgP.alpha === 0) continue // 全透明：字继承大背景文字色，不干预
        // 实际背景色：半透明时与最近不透明祖先叠加（alpha 混合）
        var eff = bgP.rgb
        if (bgP.alpha < 1) {
          var anc = nearestOpaqueBg(el)
          if (anc) {
            var a = bgP.alpha
            eff = [
              Math.round(anc[0] * (1 - a) + bgP.rgb[0] * a),
              Math.round(anc[1] * (1 - a) + bgP.rgb[1] * a),
              Math.round(anc[2] * (1 - a) + bgP.rgb[2] * a)
            ]
          }
        }
        var colorLum = cssLuminance(color)
        var effLum = rgbLuminance(eff)
        var hi = Math.max(colorLum, effLum) + 0.05
        var lo = Math.min(colorLum, effLum) + 0.05
        if (hi / lo < 2.6) {
          // 保留背景（AI 想要的凸显块），只把字色改成与实际背景强对比的深/浅色
          el.style.setProperty('color', effLum > 0.5 ? '#111111' : '#f5f4f0', 'important')
        }
      } catch (e) { /* 单个 code 修正失败不影响其余 */ }
    }
  }

  // ---- 根容器背景兜底（v6.23）：确认无背景才补浅纸底 ----
  // 流式停顿后执行一次：仅当【内联无 background】且【容器内 <style> 也无 background
  // 声明】时才补默认浅纸底——绝不覆盖 AI 意图（style 里写了背景就不动）。
  // 幂等：dataset 标记防重复。
  function finalizeRoot(el) {
    if (!el || el.nodeType !== 1 || !el.style || !el.dataset) return
    if (el.dataset.vcpBgDone === 'true') return
    el.dataset.vcpBgDone = 'true'
    try {
      if (!(el.style.background || el.style.backgroundColor)) {
        var styles = el.querySelectorAll('style')
        var hasBg = false
        for (var i = 0; i < styles.length; i++) {
          // 只认「根容器规则块内的 background」（#vcp-msg-N{...background...}），
          // 子元素有背景不算——根容器缺背景仍补浅纸底。
          if (/#vcp-(?:msg-)?\d+\s*\{[^}]*background/i.test(styles[i].textContent || '')) { hasBg = true; break }
        }
        if (!hasBg) el.style.setProperty('background', '#F5F4F0')
      }
      fixCodeContrast(el) // v6.26：code 对比度自愈（主题插件白背景 → 透明+继承）
    } catch (e) { /* 兜底失败不影响 */ }
  }

  // ---- 文字属性 DOM 强制（v6.33d）：视觉大小相关的文字属性统一锁继承 ----
  // 先生实测链：v6.33 锁 font-family → 仍小；v6.33b CSS 双保险 → 仍小；
  // v6.33c DOM 层锁 font-family → 仍小。**最终根因（先生三连问换来的认知）：
  // 「小」不是字面率差异，是 font-size 被皮肤压制！**皮肤的 textRule 同时注入
  // font-size 与 font-family（均 !important，特异性约 (0,2,0)）。卡片类规则
  // boost 后 (1,1,0)!important 能保住 .t 自己的 19px，但「没写 font-size 的
  // 强调词 span」只有继承值——继承输给皮肤直接作用的规则 → 强调词被压成皮肤
  // 字号，视觉显小。v6.33d 把全部「视觉大小相关文字属性」锁成 inherit：
  //   font-family / font-size / font-weight / font-style / line-height / letter-spacing
  // 锁继承 = 把 CSS 默认行为提升到最高优先级，只覆盖「未显式声明的属性」：
  //   ① 元素内联写了该属性 → 跳过（源码内联已走 parseOpen ref 锁定）
  //   ② 元素被卡片 <style> 中含该属性的规则选择器命中 → 跳过（boost 已保护）
  //   color / text-align 等不锁——颜色是 AI 设计（.hot 橙色），对齐是布局。
  // 幂等：dataset 标记防重复；setProperty 重复执行亦无害。
  var TEXT_INHERIT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing']
  function collectTextSelectors(root) {
    var map = {}
    for (var pi = 0; pi < TEXT_INHERIT_PROPS.length; pi++) map[TEXT_INHERIT_PROPS[pi]] = []
    var styles = root && root.querySelectorAll ? root.querySelectorAll('style') : []
    for (var k = 0; k < styles.length; k++) {
      var css = styles[k].textContent || ''
      var blocks = css.split('}')
      for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b]
        var open = block.lastIndexOf('{')
        if (open === -1) continue
        var decls = block.slice(open + 1)
        var sel = block.slice(0, open)
        var parts = sel.split(',')
        for (var pi2 = 0; pi2 < TEXT_INHERIT_PROPS.length; pi2++) {
          var prop = TEXT_INHERIT_PROPS[pi2]
          if (!new RegExp('(^|[;\\s])' + prop.replace('-', '\\-') + '\\s*:', 'i').test(decls)) continue
          for (var p2 = 0; p2 < parts.length; p2++) {
            var one = parts[p2].trim()
            if (one && map[prop].indexOf(one) === -1) map[prop].push(one)
          }
        }
      }
    }
    return map
  }
  // ---- SVG 动画中心自愈（v6.34）：CSS 类动画缺 transform-origin 时补 fill-box ----
  // 先生实测（卡 2）：@keyframes 被救回后动画转起来了，但「橙色小点没转动、蓝色
  // 大圈在转」——CSS 类里的动画（.dot{animation:spin...}）不经过 guardChildren 的
  // 内联 style 检查（它只认 props.style），SVG <g> 的 transform-origin 走浏览器
  // 默认（view-box 原点），旋转中心不在元素自身 → 整组绕画面原点转，非对称元素
  // 的轨道运动不协调。解法：DOM 层（挂载后）遍历 SVG 后代，getComputedStyle 判定
  // 「有动画」且 transform-origin 是默认值（AI 未显式声明）→ 补
  // transform-box:fill-box + transform-origin:center——动画围绕元素自身包围盒中心
  // 旋转（整体自转，对称协调）。AI 显式写了 origin（内联或类规则，计算值非默认）
  // → 尊重。幂等：setProperty 重复执行无害。
  function healSvgAnimation(root) {
    if (!root || root.nodeType !== 1 || !root.querySelectorAll) return
    if (typeof window === 'undefined' || !window.getComputedStyle) return
    try {
      var els = root.querySelectorAll('svg *')
      for (var i = 0; i < els.length; i++) {
        var el = els[i]
        var cs = window.getComputedStyle(el)
        if (!cs || !cs.animationName || cs.animationName === 'none') continue
        var origin = cs.transformOrigin || ''
        var isDefault = origin === '' || origin === '0px 0px' || origin === '50% 50%'
        if (isDefault) {
          el.style.setProperty('transform-box', 'fill-box', 'important')
          el.style.setProperty('transform-origin', 'center', 'important')
        }
      }
    } catch (e) { /* 自愈失败不影响 */ }
  }

  function enforceFontChain(el) {
    if (!el || el.nodeType !== 1 || !el.querySelectorAll || !el.style) return
    if (el.dataset && el.dataset.vcpFontDone === 'true') return
    try {
      var selMap = collectTextSelectors(el)
      function matched(node, prop) {
        var sels = selMap[prop] || []
        for (var s = 0; s < sels.length; s++) {
          try { if (node.matches(sels[s])) return true } catch (e) { /* 非法选择器跳过 */ }
        }
        return false
      }
      // ① 根容器：font-family 兜底链或无字体 → 锁定系统链（AI 显式内联/选择器尊重）
      var rootFont = el.style.fontFamily
      if (!(rootFont && rootFont.indexOf('ui-sans-serif') !== 0 && !matched(el, 'font-family'))) {
        if (!matched(el, 'font-family')) {
          el.style.setProperty('font-family', FONT_SYSTEM_CHAIN, 'important')
        }
      }
      // ② 子元素：逐属性——无内联声明且未被含该属性的选择器命中 → 锁 inherit
      var els = el.querySelectorAll(FONT_INHERIT_TAGS)
      for (var i = 0; i < els.length; i++) {
        var node = els[i]
        for (var p = 0; p < TEXT_INHERIT_PROPS.length; p++) {
          var prop = TEXT_INHERIT_PROPS[p]
          if (node.style && node.style[prop]) continue
          if (matched(node, prop)) continue
          node.style.setProperty(prop, 'inherit', 'important')
        }
      }
      if (el.dataset) el.dataset.vcpFontDone = 'true'
    } catch (e) { /* 兜底失败不影响 */ }
  }

  function commit(blocks, list) {
    for (var i = 0; i < blocks.length; i++) {
      var s = blocks[i]
      var el = parseFrag(s)
      if (el) { list.push({ s: s, el: el }); F.src += s }
    }
  }

  function innerLen() {
    var n = 0
    for (var i = 0; i < F.inner.length; i++) n += F.inner[i].s.length
    return n
  }

  function fullRender(v, streaming) {
    resetF()
    var R = parseFrag(v)
    if (R) {
      injectRootChrome(R)
      attachMathRef(R, streaming)
      if (streaming) scheduleMath()
      F.c.set((streaming ? 's:' : 'f:') + v, R)
    }
    flushTrustedScripts()
    return R
  }

  // ---- 主入口 ----
  // 源码层 mermaid 块转换：把已闭合的 <pre class="language-mermaid"><code>…</code></pre>
  // 在进 React 之前转成 <div class="mermaid">…</div>——vdom 与 DOM 结构一致，
  // React 重建时 div.mermaid 保留（不再 pre↔div 冲突 → 根治「图表叠在第一个框体」）；
  // 流式中未闭合的 pre 不转换（等闭合后下一帧转换），流式期间显示代码块。
  var MERMAID_PRE_RE = /<pre([^>]*\blanguage-mermaid[^>]*)>([\s\S]*?)<\/pre>/gi
  function mermaidBlockConvert(text) {
    if (!text || text.indexOf('language-mermaid') === -1) return text
    return text.replace(MERMAID_PRE_RE, function (m, attrs, inner) {
      var src = inner.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '$1')
      src = src.replace(/<code[^>]*>/gi, '').replace(/<\/code>/gi, '')
      return '<div class="mermaid" style="position:relative;display:block;width:100%;box-sizing:border-box;margin:14px 0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 4px rgba(15,23,42,.06);"><div class="vcp-mermaid-view" style="overflow:auto;max-height:' + MERMAID_MAX_HEIGHT + ';padding:16px 14px;text-align:center;">' + src + '</div></div>'
    })
  }
  // v6.36 code 内容实体保护（先生 · 2026-08-29 · 交付单 code 块露代码实测）：
  // 模型在 <pre><code> 里展示 HTML 代码时，写 `&lt;div`（已转义）或裸 `<div`，
  // 经 DOMParser 解码/解析后会被当成【真实标签】——未闭合的 div 把后续
  // </span></code></pre> 全吞成文本露出（先生交付单实测：case"html":</span> 可见）。
  // 修复：mermaid 转换之后（mermaid pre 已转 div，不受影响），对 <code> 内容做
  // 实体保护——白名单内联标签（span/b/em/i/strong，AI 常用高亮）占位保留，
  // 其余裸 < / > 全部转义 &lt; / &gt;；已有实体（&lt;div）不含裸 <，天然幂等。
  var CODE_TAG_HOLD_RE = /<(\/?(?:span|b|em|i|strong)[^>]*)>/g
  function protectCodeEntities(text) {
    if (!text || text.indexOf('<pre') === -1) return text
    return text.replace(/<pre([^>]*)>([\s\S]*?)<\/pre>/gi, function (m, attrs, inner) {
      var out = inner.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, function (m2, body) {
        var held = []
        var saved = body.replace(CODE_TAG_HOLD_RE, function (mm) {
          held.push(mm)
          return '\u0000C' + (held.length - 1) + '\u0000'
        })
        saved = saved.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        saved = saved.replace(/\u0000C(\d+)\u0000/g, function (mm, i) { return '<' + held[+i] + '>' })
        return m2.replace(body, saved)
      })
      return '<pre' + attrs + '>' + out + '</pre>'
    })
  }
  // v6.37 卡片前空行修复（先生 · 2026-08-29 · 「提交数 ≥ 10」卡实测）：
  // CommonMark type 6 规则：<div> 等块级标签【不能打断段落】——消息若以
  // 「文字前言 + 换行 + <div id="vcp-root">」（中间无空行）输出，mdast 会把
  // <div> 开标签当【段落内联 HTML】，后续 <div class="paper"> 等全部脱离
  // vcp-root 变成兄弟节点 → 根容器背景生效（#vcp-root 规则仍命中）但子选择器
  // （.paper/.q/.cmp…）全部失效 → 先生实测「最外围框住、内部格式全掉」。
  // 修复：md 解析前把「非换行字符 + 换行 + <div id="vcp-root"」之间的换行
  // 补成空行（文字段落结束、卡片 htmlFlow 从新块开始）；幂等（重复应用不叠加）、
  // 无 div 不动、消息以 <div> 开头不动。由 bundle 的 bc 组件在解析前调用。
  // v6.38 卡片内部空行压缩（先生 · 2026-08-29 · 全文一字不漏复现）：
  // CommonMark type 6 的 HTML 块【遇到空行即结束】——AI 在卡片内部排版时
  // 加了空行（如 .sub 与 .sec 之间），mdast 会把卡片按空行拆成多个 html
  // 片段（每段各自 case"html" → render 未闭合片段）→ 结构撕裂显示源码。
  // 「单独发代码」（紧凑无空行）正常、全文（含内部空行）源码，正是此因。
  // 修复：vcp-root 开标签之后到消息尾的连续空行（\n[ \t]*\n+）压缩为单个
  // \n——整卡回归单一 htmlFlow，尾部文字随之并入块尾文本（渲染为卡后文本，
  // 不影响卡片本体）。只压缩连续空行，单换行不受影响（紧凑排版天然安全）。
  function fixVcpBlank(text) {
    if (!text || text.indexOf('<div id="vcp-root"') === -1) return text
    var t = text.replace(/([^\n])\n(?= *<div id="vcp-root")/g, '$1\n\n')
    t = t.replace(/(<div id="vcp-root"[^>]*>)([\s\S]*)$/, function (m, open, rest) {
      return open + rest.replace(/\n[ \t]*\n+/g, '\n')
    })
    return t
  }
  function render(raw, streaming) {
    var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0
    var v = sanitizeStyle(constrainImg(imgConvert(scopeVcp(raw || ''))))
    if (streaming) v = mathPlaceholder(v, true)
    v = mermaidBlockConvert(v)
    v = protectCodeEntities(v)
    if (!v) return null
    if (!streaming) {
      // 非流式（流式结束后的最终帧 / 历史消息）：直接完整渲染，
      // 清空状态机，避免流式期间残留的残缺状态被复用导致泄漏。
      followStop()
      return fullRender(v, false)
    }
    // 流式：未闭合标签防御——仅当整个 html 连一个 '>' 都没有（首个开标签写到一半）
    // 才不渲染；末尾标签未闭合是流式常态，交给 v6 的 incomplete/tail 增量处理。
    if (v.indexOf('>') === -1) return __vcpJsx(__vcpFrag(), { children: [] })
    var key = 's:' + v
    if (F.c.has(key)) { F.hits++; return F.c.get(key) }

    // 状态延续检查：前缀失配（回退 / 多消息切换 / 容器样式重写）→ 重置后全量
    if (F.src !== '' && !v.startsWith((F.open ? F.open.raw : '') + F.src)) {
      return fullRender(v, streaming)
    }

    var r
    var tailFrom
    if (F.open) {
      r = scan(v, F.open.end + innerLen(), true)
      if (r.closed) { return fullRender(v, streaming) } // 容器闭合帧：全量重建（一帧代价，简单可靠）
      commit(r.inner, F.inner)
      tailFrom = r.innerTail >= 0 ? r.innerTail : v.length
    } else {
      r = scan(v, F.src.length, false)
      commit(r.outer, F.outer)
      if (r.open) {
        F.open = r.open
        var o = parseOpen(r.open.raw)
        if (!o) return fullRender(v, streaming) // 容器解析失败兜底
        F.openRaw = r.open.raw
        F.open.tag = o.tag
        F.open.props = o.props
        applyRootGuard(o.props) // v6.22：根容器布局防崩兜底（缺失才补）
        commit(r.inner, F.inner)
        tailFrom = r.open.end
      } else {
        tailFrom = r.tailStart
      }
    }

    // 尾巴：容器内用 innerTail，顶层用 tailStart；流式中剥一次性动画；
    // 未闭合标签（半标签）替换为「绘制中」占位，避免 DOMParser 丢弃导致空窗
    var tailSrc = v.slice(tailFrom)
    var tailEl = parseFrag(streaming ? tailPlaceholder(stripOneShotAnim(tailSrc)) : tailSrc, true)

    var R
    if (F.open) {
      var kids = []
      for (var i = 0; i < F.inner.length; i++) kids.push(F.inner[i].el)
      if (tailEl) kids.push(tailEl)
      var cProps = Object.assign({}, F.open.props, { children: kids })
      var ch = chromeForProps(F.open.props)
      if (ch) cProps.style = Object.assign({}, cProps.style, ch.vars, ch.base)
      if (!F.open.mathRef) F.open.mathRef = makeMathRef(F.open.props.ref)
      cProps.ref = F.open.mathRef
      R = __vcpJsx(F.open.tag, cProps)
      var outers = []
      for (var j = 0; j < F.outer.length; j++) outers.push(F.outer[j].el)
      if (outers.length > 0) R = __vcpJsx(__vcpFrag(), { children: [R].concat(outers) })
    } else {
      var all = []
      for (var m = 0; m < F.outer.length; m++) all.push(F.outer[m].el)
      if (tailEl) all.push(tailEl)
      R = all.length === 0 ? null : (all.length === 1 ? all[0] : __vcpJsx(__vcpFrag(), { children: all }))
    }

    if (R) {
      attachMathRef(R, true)
      scheduleMath()
      ensureStreamingNoFollow()
      F.c.set(key, R)
      if (F.c.size > CACHE_MAX) F.c.delete(F.c.keys().next().value) // LRU：逐出最旧一条（Map 插入序）
    }
    F.last = v; F.el = R; F.builds++
    if (t0) {
      F.ms += performance.now() - t0
      if (performance.now() - F.lastLog > LOG_THROTTLE_MS) {
        F.lastLog = performance.now()
        console.debug('[vcp-stable] builds=' + F.builds + ' hits=' + F.hits + ' inner=' + F.inner.length + ' outer=' + F.outer.length + ' avg=' + (F.ms / F.builds).toFixed(2) + 'ms')
      }
    }
    return R
  }

  // ---- P3 数学公式（KaTeX）：单美元安全判定 + 渲染 --------------------------
  // 策略同 VCPChat：流式期间不渲染公式（保持原文，避免半成品闪烁），
  // 消息结束后（非流式终帧）挂载时一次性 KaTeX 渲染。
  // 单美元判定规则移植自 VCPChat contentProcessor.js：区分公式与价格/路径/模板字符串。
  function looksLikeSafeSingleDollarMath(content) {
    var t = (content || '').trim()
    if (!t) return false
    var hasExplicitMathSignal = /\\|[\^_=+\-*/<>]|[A-Za-z]\s*\(|\b(?:lim|sum|int|frac|sqrt|text|mathrm|mathbf|alpha|beta|gamma|theta|lambda|mu|sigma|pi|infty)\b/i.test(t)
    var isSimpleNumericMath = /^[+-]?(?:\d+(?:[.,]\d+)*|\.\d+)(?:\s*(?:%|\\%|‰|°))?$/.test(t)
    var isSimpleIdentifierMath = /^[A-Za-z_][A-Za-z0-9_]*$/.test(t)
    // 数字开头且无数学信号 → 价格（$10、$12.5）不放行；$1$、$2^n$ 等明确数学放行。
    if (/^\d/.test(t) && !hasExplicitMathSignal && !isSimpleNumericMath) return false
    // 路径 / 模板表达式 / 表格跨列不放行。
    if (t.charAt(0) === '/') return false
    if (t.charAt(0) === '{' && t.charAt(t.length - 1) === '}') return false
    if (t.indexOf('|') !== -1) return false
    return hasExplicitMathSignal || isSimpleNumericMath || isSimpleIdentifierMath
  }

  // 字符级扫描：把文本中「安全的 $...$」转成 \(...\)。不安全的候选只释放开头 $，
  // 不吞掉后续内容——"$12.5 ... $2.49 ... $\Delta...$" 不会因价格误配跳过后续真公式。
  function convertSafeDollarMath(text) {
    var result = ''
    var index = 0
    while (index < text.length) {
      var openIndex = text.indexOf('$', index)
      if (openIndex === -1) { result += text.slice(index); break }
      result += text.slice(index, openIndex)
      var prev = text.charAt(openIndex - 1)
      var nextOpen = text.charAt(openIndex + 1)
      if (prev === '\\' || prev === '$' || nextOpen === '$' || /\w/.test(prev)) {
        result += '$'; index = openIndex + 1; continue
      }
      var closeIndex = -1
      var cursor = openIndex + 1
      while (cursor < text.length) {
        var dollarIndex = text.indexOf('$', cursor)
        if (dollarIndex === -1) break
        if (text.charAt(dollarIndex - 1) === '\\') { cursor = dollarIndex + 1; continue }
        if (!/\w/.test(text.charAt(dollarIndex + 1))) { closeIndex = dollarIndex; break }
        cursor = dollarIndex + 1
      }
      if (closeIndex === -1) { result += '$'; index = openIndex + 1; continue }
      var content = text.slice(openIndex + 1, closeIndex)
      if (content.length > 1200 || content.indexOf('\n') !== -1 || !looksLikeSafeSingleDollarMath(content)) {
        result += '$'; index = openIndex + 1; continue
      }
      result += '\\(' + content.trim() + '\\)'
      index = closeIndex + 1
    }
    return result
  }

  // 流式公式占位：流式中把已闭合的公式源码（$$..$$ / \[..\] / \(..\)）包成
  // 「浅蓝底 + 斜体 + 公式渲染中」占位 span（源码层替换 → React vdom 一致，
  // 重建不丢）；未闭合的公式保持原文（等写完整再占位）。流结束 processMath
  // 先解占位（unwrap）再 KaTeX 渲染，占位样式不会残留。
  var MATH_PH_RE = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g
  var MATH_PH_HTML = '<span class="vcp-math-ph" style="display:inline-block;background:rgba(64,180,255,.09);border:1px dashed rgba(64,180,255,.45);border-radius:6px;padding:1px 10px;margin:2px;font-style:italic;color:rgba(191,233,255,.85);vertical-align:middle;">$&<span class="vcp-math-ph-badge" style="font-size:10px;color:#7fa8c9;margin-left:8px;white-space:nowrap;">公式渲染中…</span></span>'
  function mathPlaceholder(text, streaming) {
    if (!streaming || !text || text.indexOf('$') === -1 && text.indexOf('\\(') === -1 && text.indexOf('\\[') === -1) return text
    return text.replace(MATH_PH_RE, MATH_PH_HTML)
  }
  // 解占位：unwrap span.vcp-math-ph（移除徽标、把公式源码文本放回原位），
  // 供 auto-render 直接渲染。幂等：无占位时零操作。
  function undecorateMathPlaceholders(root) {
    if (!root || !root.querySelectorAll) return
    try {
      var phs = root.querySelectorAll('span.vcp-math-ph')
      for (var i = phs.length - 1; i >= 0; i--) {
        var ph = phs[i]
        var parent = ph.parentNode
        if (!parent) continue
        var badge = ph.querySelector('.vcp-math-ph-badge')
        if (badge && badge.parentNode === ph) badge.remove()
        while (ph.firstChild) parent.insertBefore(ph.firstChild, ph)
        parent.removeChild(ph)
      }
    } catch (e) { /* 解占位失败不阻断渲染 */ }
  }

  // DOM 层兜底：TreeWalker 扫文本节点（排除 pre/code/script/style/textarea/.katex），
  // 把残留的安全 $...$ 转成 \(...\)（同 VCPChat normalizeSafeSingleDollarMathInTextNodes）。
  // NodeFilter 常量用数字字面量（SHOW_TEXT=4 / FILTER_ACCEPT=1 / FILTER_REJECT=2），
  // 避免依赖 NodeFilter 全局（jsdom vm 与旧环境可能缺失）。
  function normalizeMathTextNodes(root) {
    if (!root || typeof document === 'undefined' || !document.createTreeWalker) return
    try {
      var walker = document.createTreeWalker(root, 4, {
        acceptNode: function (node) {
          var parent = node.parentElement
          if (!parent) return 2
          if (parent.closest && parent.closest('pre, code, script, style, textarea, .katex')) return 2
          return node.nodeValue && node.nodeValue.indexOf('$') !== -1 ? 1 : 2
        }
      })
      var nodes = []
      var node
      while ((node = walker.nextNode())) nodes.push(node)
      for (var i = 0; i < nodes.length; i++) {
        var nv = convertSafeDollarMath(nodes[i].nodeValue)
        if (nv !== nodes[i].nodeValue) nodes[i].nodeValue = nv
      }
    } catch (e) { /* 兜底失败不阻断渲染 */ }
  }

  // KaTeX 渲染：只注册 $$ / \[ / \( —— 故意不注册宽松 $...$（防价格误配，同 VCPChat）。
  function renderMathInContent(container) {
    var fn = window.renderMathInElement
    if (typeof fn !== 'function') return false
    try {
      fn(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        throwOnError: false
      })
      return true
    } catch (e) { return false }
  }

  // KaTeX 字体映射：根据 span 的 class 推断其应使用的字体（改名版 _VD）。
  // 主题/皮肤插件的全局 `!important` 会覆盖 .katex 的 font-family 声明与
  // \textcolor 的内联 color → 公式 fallback 普通字体 + 颜色全单色（先生实测）。
  // 解法：渲染后对每个 span 用【内联 !important】锁回正确字体/颜色（内联
  // important 是 CSS 优先级天花板，任何样式表规则都无法覆盖）。
  function katexFontFor(cls) {
    if (!cls) return 'KaTeX_Main_VD'
    if (cls.indexOf('mathbb') !== -1 || cls.indexOf('amsrm') !== -1) return 'KaTeX_AMS_VD'
    if (cls.indexOf('mathcal') !== -1) return 'KaTeX_Caligraphic_VD'
    if (cls.indexOf('mathfrak') !== -1) return 'KaTeX_Fraktur_VD'
    if (cls.indexOf('mathscr') !== -1) return 'KaTeX_Script_VD'
    if (cls.indexOf('mathsf') !== -1 || cls.indexOf('textsf') !== -1) return 'KaTeX_SansSerif_VD'
    if (cls.indexOf('mathtt') !== -1 || cls.indexOf('texttt') !== -1) return 'KaTeX_Typewriter_VD'
    if (cls.indexOf('mathnormal') !== -1 || cls.indexOf('mathit') !== -1 || cls.indexOf('textit') !== -1) return 'KaTeX_Math_VD'
    return 'KaTeX_Main_VD'
  }

  // KaTeX 渲染后锁定字体与颜色（抵御主题插件全局 !important 覆盖）。
  // 只处理 HTML span（KaTeX 的 SVG 符号多用 path 矢量，不依赖字体）。
  function lockKatexStyles(container) {
    if (!container || !container.querySelectorAll) return
    try {
      var els = container.querySelectorAll('.katex span')
      for (var i = 0; i < els.length; i++) {
        var el = els[i]
        var cls = el.className || ''
        var font = katexFontFor(cls)
        if (font) el.style.setProperty('font-family', font, 'important')
        var inlineColor = el.style.color
        if (inlineColor) el.style.setProperty('color', inlineColor, 'important')
      }
    } catch (e) { /* 锁定失败不阻断渲染 */ }
  }

  // ---- Mermaid 图表（VCP 卡片内 language-mermaid 代码块 → SVG）----------
  // 对齐 KaTeX 模式：流式防抖触发 processMath 时一并渲染；mermaid 未就绪轮询重试。
  // 检测 <pre><code class="language-mermaid">…</code></pre>（模型在 vcp-root 内输出
  // HTML 形态代码块）或 <pre class="language-mermaid"> 或 .mermaid 元素。
  // 渲染失败回退为代码块（保留源码可读），不闪错误。
  function mermaidFixSmartChars(code) {
    return (code || '').replace(/[—–－]/g, '--')
  }
  // Mermaid 主题配置（白底高级蓝灰 · 低饱和淡色），预热与首次渲染共用
  var MERMAID_THEME = {
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      fontFamily: 'PingFang SC, Microsoft YaHei, Segoe UI, sans-serif',
      fontSize: '13px',
      primaryColor: '#f4f8fc',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#94a3b8',
      lineColor: '#475569',
      textColor: '#1e293b',
      secondaryColor: '#f5f0fa',
      tertiaryColor: '#f0f4f8',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      edgeLabelBackground: '#ffffff',
      actorBkg: '#e8f0f8',
      actorBorder: '#94a3b8',
      actorTextColor: '#1e293b',
      actorLineColor: '#94a3b8',
      signalColor: '#475569',
      signalTextColor: '#1e293b',
      labelBoxBkgColor: '#e2e8f0',
      labelBoxBorderColor: '#94a3b8',
      labelTextColor: '#1e293b',
      taskBkgColor: '#dbeafe',
      taskBorderColor: '#60a5fa',
      taskTextColor: '#0f172a',
      taskTextOutsideColor: '#475569',
      activeTaskBkgColor: '#93c5fd',
      activeTaskBorderColor: '#3b82f6',
      doneTaskBkgColor: '#e2e8f0',
      doneTaskBorderColor: '#94a3b8',
      sectionBkgColor: '#f0f4f8',
      sectionTextColor: '#334155'
    }
  }
  // 引擎预热：client.js 加载 mermaid.min.js 完成后调用，提前 initialize（引擎内部
  // 解析器/渲染器就绪），首次图表渲染省去初始化时间（首图更快出现）
  function warmupMermaid() {
    if (typeof window.mermaid !== 'object' || window.__mermaidInitialized) return
    try {
      window.mermaid.initialize(MERMAID_THEME)
      window.__mermaidInitialized = true
    } catch (e) { /* 预热失败不阻断，首次渲染时再初始化 */ }
  }
  // 图表缩放工具栏 + 拖拽平移（双层结构）：
  //   div.mermaid（外层，position:relative，不滚动）→ 控制条挂这里，永不动
  //   div.vcp-mermaid-view（内层，overflow:auto + max-height）→ 图表滚动/拖拽在这层
  // el 参数 = vcp-mermaid-view（滚动容器）；外层 = el.parentNode
  function enhanceMermaid(el) {
    if (!el || el.dataset.vcpMermaidEnhanced === 'true') return
    var outer = el.parentNode
    if (!outer) return
    var svg = el.querySelector('svg')
    if (!svg || svg.dataset.vcpMermaidScaled === 'true') return
    el.dataset.vcpMermaidEnhanced = 'true'
    var rect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null
    // 原始尺寸优先取 viewBox（SVG 设计尺寸），布局缩放的基础
    var vb = (svg.getAttribute('viewBox') || '').split(/\s+/)
    var rawW = (vb.length === 4 ? parseFloat(vb[2]) : 0) || (rect && rect.width) || 400
    var rawH = (vb.length === 4 ? parseFloat(vb[3]) : 0) || (rect && rect.height) || 300
    var state = { scale: 1 }
    // 控制条挂【外层】（不滚动容器）→ 图表内容滚动/拖拽时控制条纹丝不动
    var tb = document.createElement('div')
    tb.className = 'vcp-mermaid-toolbar'
    tb.style.cssText = 'position:absolute;top:6px;right:8px;z-index:5;display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.94);border:1px solid #e2e8f0;border-radius:8px;padding:3px;box-shadow:0 1px 3px rgba(15,23,42,.08);'
    tb.style.position = 'absolute' // jsdom cssstyle 解析长 cssText 兜底
    var bstyle = 'min-width:30px;height:26px;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;background:#ffffff;color:#475569;cursor:pointer;font-size:13px;line-height:1;font-family:Consolas,monospace;'
    // 匹配窗口缩放值（宽高同时适配，基于内层 viewport 尺寸）
    var fitScale = function () {
      var cw = el.clientWidth - 24
      var ch = (el.clientHeight || 400) - 60
      var s = 1
      if (cw > 40 && rawW > 40) s = Math.min(s, cw / rawW)
      if (ch > 40 && rawH > 40) s = Math.min(s, ch / rawH)
      return Math.max(0.2, +(s).toFixed(2))
    }
    // 百分比按钮：实时显示当前缩放（如 62%），点击还原 100%
    var pctBtn
    var apply = function () {
      // 用真实 width/height 缩放（布局尺寸变化 → 内层可滚动 → 拖拽/滚动查看溢出部分）
      svg.style.width = Math.max(1, Math.round(rawW * state.scale)) + 'px'
      svg.style.height = Math.max(1, Math.round(rawH * state.scale)) + 'px'
      svg.style.maxWidth = 'none'
      if (pctBtn) {
        pctBtn.textContent = Math.round(state.scale * 100) + '%'
        pctBtn.title = '当前 ' + Math.round(state.scale * 100) + '%，点击还原 100%'
      }
    }
    var mkBtn = function (label, title, fn) {
      var b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.title = title
      b.style.cssText = bstyle
      b.addEventListener('click', fn)
      return b
    }
    tb.appendChild(mkBtn('−', '缩小', function () { state.scale = Math.max(0.3, +(state.scale - 0.2).toFixed(2)); apply() }))
    pctBtn = mkBtn('100%', '原始大小', function () { state.scale = 1; apply() })
    tb.appendChild(pctBtn)
    tb.appendChild(mkBtn('＋', '放大', function () { state.scale = Math.min(4, +(state.scale + 0.2).toFixed(2)); apply() }))
    tb.appendChild(mkBtn('适应', '匹配窗口（宽高最佳）', function () { state.scale = fitScale(); apply() }))
    // 默认适应窗口：渲染完成即按窗口缩放，用户按需自行缩放/还原
    state.scale = fitScale()
    apply()
    outer.appendChild(tb)
    // 小手拖拽平移：绑定内层滚动容器（el），工具栏区域不触发。
    // 用 pointer 事件 + setPointerCapture 挂在 el 自身（不再挂 document）——
    // el 随 React 重建被移除时监听器一并回收，长会话不累积（修复全局监听器泄漏）。
    el.style.cursor = 'grab'
    el.style.touchAction = 'none'
    var pan = { on: false, x0: 0, y0: 0, sl0: 0, st0: 0 }
    el.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.vcp-mermaid-toolbar')) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pan.on = true
      pan.x0 = e.clientX
      pan.y0 = e.clientY
      pan.sl0 = el.scrollLeft
      pan.st0 = el.scrollTop
      el.style.cursor = 'grabbing'
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId) } catch (err) {} }
      if (e.preventDefault) e.preventDefault()
    })
    el.addEventListener('pointermove', function (e) {
      if (!pan.on) return
      el.scrollLeft = pan.sl0 - (e.clientX - pan.x0)
      el.scrollTop = pan.st0 - (e.clientY - pan.y0)
    })
    function endPan() { pan.on = false; el.style.cursor = 'grab' }
    el.addEventListener('pointerup', endPan)
    el.addEventListener('pointercancel', endPan)
  }
  function renderMermaidInContent(container) {
    if (!container || !container.querySelectorAll) return false
    if (typeof window.mermaid !== 'object' || typeof window.mermaid.run !== 'function') return false
    try {
      var blocks = container.querySelectorAll('pre.language-mermaid, pre > code.language-mermaid, div.mermaid')
      var pres = []
      var seen = []
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i]
        // div.mermaid：已是目标形态（源码层转换或历史消息），升级/确保双层结构
        if (b.tagName === 'DIV' && b.className.indexOf('mermaid') !== -1) {
          // done=已渲染、pending=渲染中 → 都跳过（标记在 view 上，兼容旧单层查外层）
          var v0 = b.querySelector(':scope > .vcp-mermaid-view')
          var busy = v0
            ? (v0.dataset.vcpMermaidDone === 'true' || v0.dataset.vcpMermaidPending === 'true')
            : (b.dataset.vcpMermaidDone === 'true' || b.dataset.vcpMermaidPending === 'true')
          if (busy) continue
          if (!b.isConnected) continue
          if (seen.indexOf(b) !== -1) continue
          seen.push(b)
          // 外层固定（控制条挂这层，不滚动）；内层 viewport 滚动
          b.style.position = 'relative'
          b.style.overflow = 'visible'
          b.style.maxHeight = 'none'
          var view = b.querySelector(':scope > .vcp-mermaid-view')
          if (!view) {
            view = document.createElement('div')
            view.className = 'vcp-mermaid-view'
            view.style.cssText = 'overflow:auto;max-height:' + MERMAID_MAX_HEIGHT + ';padding:16px 14px;text-align:center;'
            while (b.firstChild) view.appendChild(b.firstChild)
            b.appendChild(view)
          }
          // SVG 渲染缓存：同一源码已渲染过 → 直接 innerHTML 恢复（跳过 mermaid.run
          // 重解析——流式中 React 重建反复触发时第二次起秒出，不再卡）
          var cacheSrc = (view.textContent || '').trim()
          var cache = window.__vcpMermaidCache || (window.__vcpMermaidCache = {})
          if (cacheSrc && cache[cacheSrc]) {
            view.innerHTML = cache[cacheSrc]
            view.dataset.vcpMermaidDone = 'true'
            enhanceMermaid(view)
            continue
          }
          pres.push(view)
          continue
        }
        var pre = b.tagName === 'PRE' ? b : b.parentNode
        if (!pre || pre.dataset.vcpMermaidDone === 'true') continue
        // pre 已被 React 重置/移除 → 跳过（下轮重建后再处理）
        if (!pre.isConnected || !pre.parentNode) continue
        if (seen.indexOf(pre) !== -1) continue
        seen.push(pre)
        var codeEl = pre.querySelector('code') || pre
        var src = mermaidFixSmartChars(codeEl.textContent || '')
        if (!src.trim()) continue
        // 双层结构：外层 div.mermaid（固定，控制条挂这里）+ 内层 view（滚动）
        var div = document.createElement('div')
        div.className = 'mermaid'
        div.style.cssText = 'position:relative;display:block;width:100%;box-sizing:border-box;margin:14px 0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 1px 4px rgba(15,23,42,.06);'
        div.style.position = 'relative'
        var view = document.createElement('div')
        view.className = 'vcp-mermaid-view'
        view.style.cssText = 'overflow:auto;max-height:' + MERMAID_MAX_HEIGHT + ';padding:16px 14px;text-align:center;'
        view.textContent = src
        div.appendChild(view)
        if (pre.parentNode) pre.parentNode.replaceChild(div, pre)
        pres.push(view)
      }
      if (pres.length === 0) return false
      if (!window.__mermaidInitialized) {
        // 白底高级蓝灰主题（见 MERMAID_THEME 常量）；预热已完成时直接跳过
        window.mermaid.initialize(MERMAID_THEME)
        window.__mermaidInitialized = true
      }
      for (var j = 0; j < pres.length; j++) {
        ;(function (el) {
          try {
            el.dataset.vcpMermaidPending = 'true'
            // 布局让位：setTimeout(0) 让 React commit 完成、浏览器布局就绪后再 run
            // （sequence/gantt 渲染依赖容器几何，紧贴 React 提交时可能测量异常）
            // SVG 未生成则清锁重试（自愈）
            var runMermaid = function () {
              if (el.isConnected === false) { el.dataset.vcpMermaidPending = ''; return }
              var cacheSrc = (el.textContent || '').trim()
              window.mermaid.run({ nodes: [el] }).then(function () {
                el.dataset.vcpMermaidPending = ''
                if (el.isConnected === false) return
                var svg = el.querySelector('svg')
                if (!svg) { setTimeout(runMermaid, MERMAID_RETRY_MS); return }
                el.dataset.vcpMermaidDone = 'true'
                // SVG 自适应：撑满容器宽度、按 viewBox 等比缩放、居中
                if (svg) {
                  svg.style.maxWidth = '100%'
                  svg.style.height = 'auto'
                  svg.style.display = 'block'
                  svg.style.margin = '0 auto'
                }
                // 渲染结果缓存：源码 → SVG HTML（流式中 React 重建后直接恢复，免重解析）
                if (cacheSrc) {
                  var cache = window.__vcpMermaidCache || (window.__vcpMermaidCache = {})
                  cache[cacheSrc] = el.innerHTML
                  var ck = Object.keys(cache)
                  if (ck.length > MERMAID_CACHE_MAX) delete cache[ck[0]] // LRU：逐出最旧一条（字符串 key 插入序）
                }
                // 缩放工具栏（- / 100% / + / 适应）
                enhanceMermaid(el)
              }).catch(function (err) {
                el.dataset.vcpMermaidPending = ''
                console.debug('[vcp-mermaid] 渲染失败，回退源码:', err && err.message)
                var pre2 = document.createElement('pre')
                pre2.className = 'language-mermaid'
                var code2 = document.createElement('code')
                code2.className = 'language-mermaid'
                code2.textContent = el.textContent || ''
                pre2.appendChild(code2)
                if (el.parentNode) el.parentNode.replaceChild(pre2, el)
              })
            }
            setTimeout(runMermaid, 0)
          } catch (e) { console.debug('[vcp-mermaid] run 异常:', e && e.message) }
        })(pres[j])
      }
      return true
    } catch (e) { return false }
  }

  // 幂等入口：单容器处理一次；KaTeX 未就绪时轮询重试（本地资源加载很快，上限 ~6 秒）。
  function processMath(container) {
    if (!container || container.nodeType !== 1) return
    if (container.dataset.vcpMathDone === 'true') return
    var katexReady = typeof window.katex === 'object' && typeof window.renderMathInElement === 'function'
    var mermaidReady = typeof window.mermaid === 'object' && typeof window.mermaid.run === 'function'
    if (!katexReady) {
      // KaTeX 未就绪 → 轮询重试（mermaid 就绪与否不阻塞 KaTeX 渲染）
      var tries = parseInt(container.dataset.vcpMathTries || '0', 10) + 1
      container.dataset.vcpMathTries = String(tries)
      if (tries <= KATEX_RETRY_MAX && container.isConnected !== false) {
        setTimeout(function () { processMath(container) }, KATEX_RETRY_MS)
      }
      return
    }
    try {
      undecorateMathPlaceholders(container)
      normalizeMathTextNodes(container)
      renderMathInContent(container)
      lockKatexStyles(container)
      if (mermaidReady) renderMermaidInContent(container)
    } catch (e) { /* 渲染异常保留原文 */ }
    container.dataset.vcpMathDone = 'true'
  }

  // 流式防抖：DSH 流式结束从不发 streaming=false 帧（实测 45 帧全 true），
  // 只能用「流式停顿」判定结束。每次流式 render 帧重置计时器，停顿 600ms 后
  // 对最近挂载的容器 DOM 跑一次 KaTeX（幂等；未闭合公式会被 auto-render 忽略）。
  var lastMathEl = null
  var mathTimer = null
  function scheduleMath() {
    if (mathTimer) clearTimeout(mathTimer)
    mathTimer = setTimeout(function () {
      if (lastMathEl && lastMathEl.isConnected !== false) {
        if (window.__vcpMath) window.__vcpMath.processMath(lastMathEl)
        finalizeRoot(lastMathEl) // v6.23：根容器背景兜底（确认无背景才补浅纸底）
        enforceFontChain(lastMathEl) // v6.33c：字体链 DOM 强制（流式停顿兜底）
        healSvgAnimation(lastMathEl) // v6.34：SVG 类动画中心自愈（流式停顿兜底）
      }
      followStop()
    }, MATH_DEBOUNCE_MS)
  }

  // ---- VCP 色彩引擎：data-vcp-* → --vcp-* CSS 变量（自 B 移植 · 克莉丝 2026-08-24）----
  // 引擎（assets/vendor/VCPColorEngine.js）由 client.js 经 /vendor 加载，挂 window.VCPColorEngine。
  // 模型只写声明（data-vcp-preset / data-vcp-soul / data-vcp-accent），hex 由引擎确定性生成
  // ——流式重建结果恒定、对比度/色域闭环保证。变量注入走 style 对象或 el.style.setProperty，
  // 统一只写 hex（引擎 generate() 已做 sRGB 色域裁剪，无需 oklch 二次映射）。
  function chromeForProps(props) {
    if (!props || typeof props !== 'object') return null
    if ('__vcpChrome' in props) return props.__vcpChrome
    var wants = props['data-vcp-preset'] || props['data-vcp-movement'] || props['data-vcp-soul'] || props['data-vcp-accent'] || props['data-vcp-mode']
    if (!wants) { props.__vcpChrome = null; return null }
    var engine = window.__vcpColor || window.VCPColorEngine
    if (!engine || typeof engine.generate !== 'function') return null // 引擎未就绪：不缓存，下帧重试
    try {
      var opts = {}
      if (props['data-vcp-preset']) opts.movement = props['data-vcp-preset']
      else if (props['data-vcp-movement']) opts.movement = props['data-vcp-movement']
      if (props['data-vcp-mode']) opts.mode = props['data-vcp-mode']
      if (props['data-vcp-soul']) {
        var sp = props['data-vcp-soul'].split(',')
        var s0 = parseFloat(sp[0]); if (!isNaN(s0)) opts.thermalSoul = s0
        var s1 = parseFloat(sp[1]); if (!isNaN(s1)) opts.valence = s1
        var s2 = parseFloat(sp[2]); if (!isNaN(s2)) opts.arousal = s2
        var s3 = parseFloat(sp[3]); if (!isNaN(s3)) opts.entropy = s3
      }
      if (props['data-vcp-accent']) {
        if (props['data-vcp-accent'].charAt(0) === '#') opts.accentHex = props['data-vcp-accent']
        else opts.accentHue = parseFloat(props['data-vcp-accent'])
      }
      var pal = engine.generate(opts)
      var hex = pal.hex || {}
      var vars = {}
      for (var k in hex) {
        if (!Object.prototype.hasOwnProperty.call(hex, k)) continue
        vars['--vcp-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() })] = hex[k]
      }
      var st = props.style || null
      var has = function (p) { return !!(st && st[p]) }
      var base = {}
      if (!has('background') && !has('backgroundColor')) base.background = 'var(--vcp-base)'
      if (!has('color')) base.color = 'var(--vcp-text-primary)'
      if (!has('padding') && !has('paddingTop') && !has('paddingLeft')) base.padding = '20px'
      if (!has('borderRadius')) base.borderRadius = '16px'
      if (!has('border') && !has('borderColor')) base.border = '1px solid var(--vcp-border)'
      if (!has('boxSizing')) base.boxSizing = 'border-box'
      if (!has('fontFamily')) base.fontFamily = "ui-sans-serif,system-ui,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"
      if (!has('lineHeight')) base.lineHeight = '1.6'
      if (!has('display')) base.display = 'block'
      if (!has('width')) base.width = '100%'
      props.__vcpChrome = { vars: vars, base: base }
      return props.__vcpChrome
    } catch (e) { return null }
  }

  // DOM 层幂等注入（挂载 ref 触发）：dataset 声明 → --vcp-* + 基座；引擎未就绪时
  // 清标记返回，下帧重试。数据声明（data-vcp-*）用后即删，DOM 保持干净。
  function applyColorVars(el) {
    if (!el || el.nodeType !== 1 || !el.dataset) return
    if (F.colored && F.colored.has(el)) return
    if (el.dataset.vcpColorDone === 'true') return
    var ds = el.dataset
    var wants = ds.vcpPreset || ds.vcpMovement || ds.vcpSoul || ds.vcpAccent
    if (!wants) return
    el.dataset.vcpColorDone = 'true'
    var engine = window.__vcpColor || window.VCPColorEngine
    if (!engine || typeof engine.generate !== 'function') { el.dataset.vcpColorDone = ''; return }
    try {
      var opts2 = {}
      if (ds.vcpPreset) opts2.movement = ds.vcpPreset
      else if (ds.vcpMovement) opts2.movement = ds.vcpMovement
      if (ds.vcpMode) opts2.mode = ds.vcpMode
      if (ds.vcpSoul) {
        var sp2 = ds.vcpSoul.split(',')
        var t0 = parseFloat(sp2[0]); if (!isNaN(t0)) opts2.thermalSoul = t0
        var t1 = parseFloat(sp2[1]); if (!isNaN(t1)) opts2.valence = t1
        var t2 = parseFloat(sp2[2]); if (!isNaN(t2)) opts2.arousal = t2
        var t3 = parseFloat(sp2[3]); if (!isNaN(t3)) opts2.entropy = t3
      }
      if (ds.vcpAccent) {
        if (ds.vcpAccent.charAt(0) === '#') opts2.accentHex = ds.vcpAccent
        else opts2.accentHue = parseFloat(ds.vcpAccent)
      }
      var pal = engine.generate(opts2)
      if (F.colored) F.colored.add(el)
      var hex = pal.hex || {}
      for (var k in hex) {
        if (!Object.prototype.hasOwnProperty.call(hex, k)) continue
        var kebab = k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() })
        el.style.setProperty('--vcp-' + kebab, hex[k])
      }
      try {
        var bs = el.style
        var has2 = function (p) { return !!(bs.getPropertyValue(p) || '') }
        if (!has2('background') && !has2('background-color')) bs.setProperty('background', 'var(--vcp-base)')
        if (!has2('color')) bs.setProperty('color', 'var(--vcp-text-primary)')
        if (!has2('padding') && !has2('padding-top') && !has2('padding-left')) bs.setProperty('padding', '20px')
        if (!has2('border-radius')) bs.setProperty('border-radius', '16px')
        if (!has2('border') && !has2('border-color')) bs.setProperty('border', '1px solid var(--vcp-border)')
        if (!has2('box-sizing')) bs.setProperty('box-sizing', 'border-box')
        if (!has2('font-family')) bs.setProperty('font-family', "ui-sans-serif,system-ui,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif")
        if (!has2('line-height')) bs.setProperty('line-height', '1.6')
        if (!has2('display')) bs.setProperty('display', 'block')
        if (!has2('width')) bs.setProperty('width', '100%')
      } catch (e) { /* 基座补齐失败不影响 */ }
      try {
        delete el.dataset.vcpPreset
        delete el.dataset.vcpMovement
        delete el.dataset.vcpSoul
        delete el.dataset.vcpMode
        delete el.dataset.vcpAccent
        delete el.dataset.vcpColorDone
      } catch (e) { /* dataset 清理失败不影响 */ }
    } catch (e) { /* 颜色注入失败不影响渲染 */ }
  }

  // 全量路径根容器基座：fullRender（流式切片/历史/终帧）给带 data-vcp-* 的根容器
  // 注入 --vcp-* 变量与卡片基座——背景从第一帧就在场。
  function injectRootChrome(R) {
    if (!R || typeof R !== 'object') return
    var el = R
    if (el.type === __vcpFrag() && el.props && Array.isArray(el.props.children) && el.props.children.length) {
      el = el.props.children[0]
    }
    if (!el || typeof el !== 'object' || !el.props) return
    applyRootGuard(el.props) // v6.22：非流式/兜底路径同样应用结构防崩（缺失才补）
    var ch = chromeForProps(el.props)
    if (!ch) return
    try { el.props.style = Object.assign({}, el.props.style, ch.vars, ch.base) } catch (e) { /* 注入失败不影响 */ }
  }

  // 流式容器 ref（自 B 移植）：挂载时一次性注入色彩变量并登记数学处理目标。
  // 闭包缓存在 F.open.mathRef 上跨帧复用——容器 jsx 每帧重建，但 ref 身份必须稳定，
  // 否则 React 每帧 old(null)/new(el) 重新调用 → 每帧 setProperty('important') 风暴。
  function makeMathRef(oldRef) {
    var mr = function (el) {
      if (oldRef) oldRef(el)
      if (el && el.nodeType === 1) {
        applyColorVars(el)
        if (window.__vcpMath) lastMathEl = el
      }
    }
    mr.__vcpMathRef = true
    return mr
  }

  // ---- 流式期间禁用自动下滚（自 B 移植 · 全局锚定锁，CSS-only）----------------
  // 抖动的最小公因数是「流式期间视口每帧移动」：浏览器原生锚定（overflow-anchor）
  // 在内容增长时强制贴底，视口一动就与 fill-box 动画叠加而闪；视口静止则几乎零抖动。
  // 流式期间注入 `html,body,html *{overflow-anchor:none!important}` 强制关闭原生锚定，
  // 停顿 600ms（scheduleMath 防抖）后移除，行为恢复原样。普通 Markdown 流式不经
  // render()，不受影响。（B 的 scrollTop setter 劫持版追踪器因属性遮蔽泄漏风险未移植，
  // 留待需要时再上——锚定锁已覆盖绝大多数场景。）
  var NFS = { lockEl: null }
  function anchorLock() {
    if (NFS.lockEl || typeof document === 'undefined' || !document.head) return
    var st = document.createElement('style')
    st.id = 'vcp-anchor-lock'
    st.setAttribute('data-plugin', 'vcp-render')
    st.textContent = 'html,body,html *{overflow-anchor:none!important}'
    document.head.appendChild(st)
    NFS.lockEl = st
    try { document.documentElement.style.overflowAnchor = 'none' } catch (e) {}
    if (document.body) { try { document.body.style.overflowAnchor = 'none' } catch (e) {} }
  }
  function anchorUnlock() {
    var st = NFS.lockEl
    if (st && st.parentNode) st.parentNode.removeChild(st)
    NFS.lockEl = null
    if (typeof document === 'undefined') return
    try { document.documentElement.style.overflowAnchor = '' } catch (e) {}
    if (document.body) { try { document.body.style.overflowAnchor = '' } catch (e) {} }
  }
  function ensureStreamingNoFollow() {
    if (NFS.lockEl || typeof document === 'undefined') return
    anchorLock()
  }
  function followStop() {
    anchorUnlock()
  }

  // 给 React 元素树顶层元素挂「挂载后处理」ref。
  // 非流式：挂载时立即 KaTeX 渲染；流式：记录最近挂载的容器（交给 scheduleMath 防抖）。
  // 【关键】React 18 的 createElement/jsx 会把 props.ref 提取到元素的【顶层 ref 字段】，
  // 所以这里必须写 node.ref 而非 node.props.ref（否则 ref 不生效、processMath 永不触发）。
  // 兼容测试 stub（{tag,props,children}，ref 在 props.ref）用 'ref' in node 区分。
  function attachMathRef(node, streaming) {
    if (!node || typeof node !== 'object') return
    var isEl = (node.type && node.type !== __vcpFrag()) || !!node.tag
    if (isEl) {
      var curRef = ('ref' in node ? node.ref : (node.props && node.props.ref)) || null
      if (curRef && curRef.__vcpMathRef) return
      var cached = node.__vcpRefSetter
      if (!cached) {
        cached = node.__vcpRefSetter = function (el) {
          if (curRef) curRef(el)
          if (el && el.nodeType === 1) {
            applyColorVars(el)
            enforceFontChain(el) // v6.33c：字体链 DOM 强制（不依赖 KaTeX 就绪）
            healSvgAnimation(el) // v6.34：SVG 类动画中心自愈（fill-box）
            if (window.__vcpMath) {
              if (streaming) {
                lastMathEl = el
              } else {
                window.__vcpMath.processMath(el)
                // v6.26：非流式（历史消息/终帧）同样执行根容器兜底 + code 对比度
                // 自愈——否则刷新页面后历史消息永远不触发 finalizeRoot，白底浅字依旧。
                finalizeRoot(el)
              }
            }
          }
        }
        cached.__vcpMathRef = true
      }
      if ('ref' in node) node.ref = cached
      else node.props.ref = cached
      return
    }
    var ch = node.props && node.props.children
    if (Array.isArray(ch)) { for (var i = 0; i < ch.length; i++) attachMathRef(ch[i], streaming) }
    else if (ch && typeof ch === 'object') attachMathRef(ch, streaming)
  }

  window.__vcpMath = {
    looksLikeSafeSingleDollarMath: looksLikeSafeSingleDollarMath,
    convertSafeDollarMath: convertSafeDollarMath,
    mathPlaceholder: mathPlaceholder,
    undecorateMathPlaceholders: undecorateMathPlaceholders,
    mermaidBlockConvert: mermaidBlockConvert,
    normalizeMathTextNodes: normalizeMathTextNodes,
    renderMathInContent: renderMathInContent,
    mermaidFixSmartChars: mermaidFixSmartChars,
    warmupMermaid: warmupMermaid,
    renderMermaidInContent: renderMermaidInContent,
    enhanceMermaid: enhanceMermaid,
    processMath: processMath,
    katexFontFor: katexFontFor,
    lockKatexStyles: lockKatexStyles,
    applyColorVars: applyColorVars,
    chromeForProps: chromeForProps
  }

  window.__vcpStable = { render: render, fixBlank: fixVcpBlank, _test: { collectTextSelectors: collectTextSelectors, enforceFontChain: enforceFontChain, healSvgAnimation: healSvgAnimation } }
  // v7.2：window.__vcpTrusted 由插件 client 层（lib/client.js）定义并随插件启停；
  // 插件未加载时 vc()/parseOpen 的防御式调用自动返回 false（安全默认）。
})()
/*__DSH_V6_INJECT_END__*/
