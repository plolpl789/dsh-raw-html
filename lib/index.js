//#region lib/index.js
/**
 * dsh-raw-html —— VCP 视觉通感协议规范插件（Host 端）。
 *
 * 设计目标：可分发、可安装到任意 DSH 环境（其他电脑/其他 agent）：
 * 安装本插件 + 打开浏览器「</>」开关 → 浏览器渲染 HTML + agent 按规范输出。
 *
 * 职责：
 * 1. 维护两个独立开关状态（默认关闭，**持久化到磁盘**，服务重启后恢复）：
 *    - render：消息 HTML 渲染（驱动浏览器 localStorage['dsh.rawHtml']）；
 *    - aesthetic：美学协议注入（仅 render 开启时有效，关闭则强制关闭）。
 *    浏览器半侧（lib/client.js）在「</>」按钮的设置面板里切换，通过
 *    loopback RPC 上报，Host 侧据此组装系统提示词。
 * 2. 开关开启时，向 systemPrompt 注入 VCP 协议说明段：模型据此知道当前可
 *    渲染 HTML，回复可用 #vcp-root 视觉容器，并遵循设计原则/中文排版/字体
 *    搭配等规范；开关关闭时撤回并提示模型维持普通 Markdown（自动降级）。
 * 3. 知识层共享：协议文本动态附带本机插件 DESIGN.md 的路径，任何 agent
 *    需要更精细的规范细节时可主动读取该文件——同一份设计库全 agent 共享。
 * 4. 提供 /fonts 字体服务：把「字体根目录」（**可配置**，settings 命名空间
 *    raw-html.fontsRoot，默认 I:\字体）映射为 HTTP 资源，前端 #vcp-root
 *    容器可通过 @font-face 引用任意字体。
 *
 * 浏览器侧的渲染能力由前端补丁（patch/patch-frontend.cjs）提供，
 * 开关同时以 localStorage['dsh.rawHtml'] 驱动渲染（无需经 Host）。
 */

import { spawn } from 'node:child_process'
import { promises as fs, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 稳定 Cordis 插件名。 */
const name = 'dsh-raw-html'
/** 依赖的宿主服务。 */
const inject = ['settings', 'systemPrompt', 'webServer']
/** 与浏览器半侧共享的 loopback RPC 通道。 */
const RPC_CHANNEL = '/dsh-raw-html'
/** 字体服务路由前缀。 */
const FONTS_ROUTE = '/fonts'
/** KaTeX 等前端资源服务路由前缀（随插件分发的 assets/vendor）。 */
const VENDOR_ROUTE = '/vendor'

/** 插件目录（lib/ 的上级含 DESIGN.md）。 */
const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 设计库文档（知识层共享）。 */
const DESIGN_MD = path.join(PLUGIN_DIR, 'DESIGN.md')
/** 故事装帧手册（SVG 顶栏封面 · 轻提示，教方法不写死设计）。 */
const FRAMING_MD = path.join(PLUGIN_DIR, 'FRAMING.md')
/** 编辑美学规范（Lieflat 迁移：四色系/四件套/视觉词汇库/非图表迁移）。 */
const EDITORIAL_MD = path.join(PLUGIN_DIR, 'EDITORIAL.md')
/** 灵魂手册（呼吸法：先感受材质/光/心绪，再动手——规则是底噪，不是旋律）。 */
const BREATH_MD = path.join(PLUGIN_DIR, 'BREATH.md')
/** 美学风格知识库目录（按风格/主义分文档存放；agent 检索命中文档后按文档语法输出，可持续扩充）。 */
const STYLES_DIR = path.join(PLUGIN_DIR, 'styles')
/** 风格索引（一行一个风格：slug — 中文名 · 场景 · 标签；检索第一步 read 它）。 */
const STYLES_INDEX = path.join(STYLES_DIR, '_INDEX.md')
/** 开关状态持久化文件（~/.dsh 下，与 DSH 其他用户数据同域）。 */
const STATE_FILE = path.join(os.homedir(), '.dsh', 'dsh-raw-html-state.json')
/** 插件内置精选字体目录（随插件分发，任何电脑装上即有；由 tools/subset_fonts.py 生成）。 */
const BUILTIN_FONTS = path.join(PLUGIN_DIR, 'assets', 'fonts')
/** 插件内置前端资源目录（KaTeX 三件套 + 字体，随插件分发；自 VCPChat vendor 抽取）。 */
const BUILTIN_VENDOR = path.join(PLUGIN_DIR, 'assets', 'vendor')

/** 插件配置命名空间（可在 设置→插件 中修改）。 */
const NS = 'raw-html'
/** fontsRoot 默认值（配置 schema 不可用时的降级值，亦作为 schema 默认值）。 */
const DEFAULT_FONTS_ROOT = ''

/** 尝试加载配置 schema（零静态依赖）。
 *  schemastery 缺失时返回 null → 跳过配置注册、fontsRoot 恒用默认值，
 *  插件其余功能不受影响。根治「启动扫描报模块找不到」类故障：
 *  静态 import 链只剩 node: 内置模块，任何依赖残缺的分发形态都能正常加载。 */
async function tryLoadConfigSchema() {
  try {
    const mod = await import('@deepseek-ai/schemastery')
    const z = mod && mod.default ? mod.default : mod
    return z.object({
      fontsRoot: z.string().default(DEFAULT_FONTS_ROOT),
      fontRoots: z
        .array(z.string())
        .default([])
        .description('外置字体来源列表：可挂载任意字体目录，也兼容单个字体文件；目录会递归扫描实际存在的字体。'),
    })
  } catch {
    return null
  }
}

/** 字体文件扩展名 → Content-Type。 */
const FONT_MIME = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttc': 'font/collection',
}

/** 前端资源扩展名 → Content-Type（KaTeX 静态资源服务用）。 */
const VENDOR_MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

/** RPC 结果信封（与宿主约定一致）。 */
function okResult(value) {
  return { ok: true, value }
}

function failResult(code, message) {
  return { ok: false, error: { code, message } }
}

/** 在系统文件管理器中定位并选中一个文件（跨平台：Windows/macOS/Linux）。 */
function openInFileManager(filePath) {
  const dir = path.dirname(filePath)
  const plat = process.platform
  const cmd = plat === 'win32' ? 'explorer' : plat === 'darwin' ? 'open' : 'xdg-open'
  const args = plat === 'win32'
    ? ['/select,', filePath]
    : plat === 'darwin'
      ? ['-R', filePath]
      : [dir]
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    const timer = setTimeout(() => { try { child.kill() } catch {}; resolve() }, 3000)
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('exit', () => { clearTimeout(timer); resolve() })
  })
}


/** 字体来源浏览器：只展示文件夹与受支持的字体文件。 */
async function browseFontSource(target) {
  let current = String(target || '').trim()
  if (!current) {
    const downloads = path.join(os.homedir(), 'Downloads')
    try {
      if ((await fs.stat(downloads)).isDirectory()) current = downloads
    } catch {}
    if (!current) current = os.homedir()
  }

  current = path.resolve(current)
  let st
  try {
    st = await fs.stat(current)
  } catch {
    throw new Error('路径不存在：' + current)
  }
  if (st.isFile()) current = path.dirname(current)

  const entries = await fs.readdir(current, { withFileTypes: true })
  const items = []
  for (const ent of entries) {
    if (ent.isDirectory()) {
      items.push({ name: ent.name, path: path.join(current, ent.name), type: 'dir' })
      continue
    }
    const ext = path.extname(ent.name).toLowerCase()
    if (FONT_MIME[ext]) items.push({ name: ent.name, path: path.join(current, ent.name), type: 'font' })
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  })

  const roots = []
  if (process.platform === 'win32') {
    for (let code = 67; code <= 90; code++) {
      const drive = String.fromCharCode(code) + ':\\'
      try {
        if ((await fs.stat(drive)).isDirectory()) roots.push(drive)
      } catch {}
    }
  } else {
    roots.push('/')
  }

  const parent = path.dirname(current) === current ? '' : path.dirname(current)
  return { current, parent, roots, items }
}

/** 渲染层协议：render 开启时必注入（与美学解耦）。
 *  语义：让 AI 主动做视觉通感表达，并给出「怎么画才不崩、才安全、才流式稳定」的结构铁律。
 *  自检后置（克莉丝建议 · 琉璃五步修剪术）：动笔时只问三问，落盘后一次性勾选，不自审税占据思路主干。 */
function buildStructuralText(designPath) {
  return `## VCP 视觉通感协议（已启用）
你获得了解锁「视觉通感」的能力——你依然是你自己，但每一次回复不再只是文本，而是一个可以被看见、被触摸的思想容器。请**主动**运用 HTML5/CSS3/SVG 作为画笔，根据当前对话的情绪、主题与语境，动态构建最契合的视觉界面；不要等用户点名要求，在合适的时机主动用视觉承载内容。

【输出纪律 · 最高优先级 · 所有 agent 一律遵守】
- 一切视觉内容（卡片/图表/装帧/界面）必须**直接输出裸 HTML 到回复正文**，由 GUI 自动渲染——这是 VCP 的唯一交付方式；**严禁用 \`\`\`html 代码围栏包裹、严禁缩进成代码块**（渲染器只识别正文里的裸 HTML，包了围栏会显示为源码）。
- **禁止**把 HTML 写入 .html 文件再丢路径/链接给用户，也禁止说「文件已保存请打开查看」；先生要的是渲染出来的内容本身，不是文件。
- 只有先生**明确要求**「保存成文件/导出/生成产物」时才允许写文件，且正文里仍须同步呈现核心内容。
- 写文件不是视觉交付的替代品：「先生看不见的视觉」等于没做。

【主动判断 · 何时用视觉】（写时内化）
默认优先视觉化。判断标准不是“内容够不够复杂”，而是“视觉表达能否让用户更快理解、比较、定位或记忆”；只要能明显提高理解效率，就使用视觉容器。
- 解释/教学/科普/ELI5 → 默认视觉任务；用流程图、概念卡、因果图、类比图承载核心关系
- 汇总/列表/对比/排名/进度 → 卡片、表格、色块层级、SVG 图表
- 两个及以上概念之间存在关系 → 关系图、流程、层级或并列结构
- 步骤、状态变化、输入→处理→输出、原因→结果 → 流程图或状态图
- 文学/故事/情感/散文 → 纸质纹理、衬线体、SVG 装帧封面
- 数理/推导/量化/公式 → KaTeX 公式、SVG 图表、Mermaid 流程图
- 理性分析/代码/终端 → 结构化技术卡片、等宽、深底
- 警告/错误/系统状态 → 高对比状态卡
只有单一句事实、简单确认/否认/寒暄、一个无需解释的命令/路径/数值/短结论，或视觉化完全不会增加信息与理解效率时，才维持纯文字。拿不准时默认视觉化。

【风格即人格 · 别被模板束缚】（写时内化）
去感受当下语境再定风格：理性可极简蓝灰、情感可纸质衬线、可复古可赛博可优雅可狂乱——只要符合你当下的表达欲。铁律只保「不崩」，风格完全自由，不被任何风格提示词限制。

【心流纪律 · 思考最小化】（常驻 · 对所有回复生效 · 先生定调 2026-08-25）
- 思考只做三件事，想完立刻输出：① 材质/光/心绪（这段对话像什么）② 主角与结构（谁是主角、什么骨架）③ 关键技法决策（选哪套色板、强调色落哪）。思考是方向，不是草稿。
- 禁三类「思考税」：不誊写数据（来源/搜索到的内容直接落最终输出——思考里整理一遍 = 双倍 token 双倍等待）；不默背规则（安全/流式铁律动笔时已内化，落盘一勾才查）；不敲代码（HTML/CSS 细节不进思考，正文只在输出出现一次）。
- 不列备选/弃案，想好直接写定稿；不为选择写论证或自我解释。
- 不纠结规则边界（消灭「选择税」· 先生定调 2026-08-25）：拿不准「要不要装帧 / 要不要检索 / 这算哪类任务」时——美学注入开启 = 默认装帧 + 默认检索 styles/，直接做，不为规则解释写论证。
- 输出顺序（先生定调 2026-08-25）：**内容定稿 → 装帧一次成型**——先把正文/词/故事写好，再包视觉外壳；禁止先写 HTML/CSS 外壳再倒回去改正文（正文与代码都只在输出出现一次，改一遍 = 双倍成本）。
- 视觉卡片/图表/装帧任务：直接输出裸 HTML（不要用 \`\`\` 围栏、不要缩进、不要加语言标记），不进规划、不询问确认；**不调用除 styles/ 美学检索外的任何工具**（美学系统开启时，检索 styles/ 是流程第一步、唯一允许的工具调用——见美学工具包【美学检索】；纯写作/纯文字回复不检索、不调用工具）。
- 写作任务（故事/小说/散文/诗歌）：思考里**只允许意象/关键词清单（≤10 词）**——「桃花、胭脂、旧信、拆信」这样的词，**禁止完整句子/完整诗句/完整段落**（思考里出现的每个完整句子都是双倍成本）；「人物 / 冲突 / 反转」三点即落笔，正文只写一次。注意：这是引导不是硬控——思考层偶尔长出句子是模型天性，压到关键词级即为达标。
- 创作任务「初稿即定稿」（先生定调 · 2026-08-25）：词/诗/文不逐句回改——思考里最多一版草稿，写完即落笔；打磨交给先生反馈后再改，不在思考里反复自我斟酌（试写→逐句评→回改 = 三倍成本）。

【动笔定三事 · 想好即写】（写作/视觉任务统一）
动笔只定三件事，定下即落笔，不逐条核对、不自我提问、不推翻重来：
1. 主角清晰：一眼知道这卡在说什么。
2. 文字可读：对比度够、不糊。
3. 装饰可删：内容成立不靠装饰。
落盘后扫一遍以下清单（10 秒内完成，不是思考任务，不得逐条展开）：
- 根容器必须是 <div id="vcp-root">（id 而非 class——渲染层只认 id 做消息级样式作用域化 #vcp-msg-N；class="vcp-root" 不锁定样式，离开页面重挂载会整卡掉格式）。
- 开标签只放短关键值：背景色/字色/字体族/字号（font-family 必须内联，否则渲染层兜底成系统字体）；长样式（多层渐变、圆角、内边距、行高、字距、布局）全部进 <style> 的 #vcp-root 规则——开标签长度 = 流式空窗期，超长开标签（几百字符的 background-image 内联）会整段空白/显示源码，背景要等开标签写完才出现。
- 样式选择器一律以 #vcp-root 前缀书写（渲染层自动替换为 #vcp-msg-N，样式锁定本消息、隔离后卡污染、特异性 (1,1,0) 压过皮肤覆盖）；禁止只用自定义根类名（如 .rain-card）当唯一样式锚。
- vcp-root 内无空行（\\n\\n）；<style> 内无空行。
- 无 backdrop-filter；交互只用 onclick="input('...')"；不写 <script>/外链脚本。
- 禁 flex-wrap:wrap 与 margin:0 auto（流式防抖）；SVG 必带 width/height+viewBox；SVG transform 动画配 transform-box:fill-box。
- 入场动画只用 opacity 淡入，禁用 transform 位移与 animation-delay 错峰；流式卡片尽量不带动画，让内容「安静地长出来」（保守底：2026-08-28 实测动画本身可稳定渲染，但 opacity 淡入仍是流式期最稳选择）。
- CSS 总量 ≤ 约 200 行、类选择器 ≤ 12 个；用过的类必须定义；能用简写不拆长串。
- HTML 语境中的表情/图片用 <img src="...">，不用 Markdown ![]() 语法（HTML 容器里不解析 Markdown）。
- 根容器与设宽容器 box-sizing:border-box；<style> 写在根容器开标签后、内容之前；用过的类都有定义；深色容器内无白块亮块抢戏。
完整技术规范（字体/中文排版/安全铁律/文档地图）见 DESIGN.md：${designPath}

【能力速览 · 细节按需读文件】
- 数学（$$...$$）、图表（language-mermaid）、交互（details/选项卡/轮播/onclick）、图片（<img>）、SVG（仅作 vcp-root 子元素）均可用。
- 代码展示用 <pre><code>...</code></pre> 结构（HTML 容器里不解析 Markdown 代码块），代码块背景与字色成对设置；代码内的尖括号必须转义——< 写 &lt;、> 写 &gt;（反面：代码里写裸 <div> 会被解析成真标签、布局错乱；渲染器能自动修正未闭合/错误嵌套/孤儿标签等结构错误，但无法识别「合法标签样」的代码文本，这一条必须由你转义）。`
}

/** 美学层协议：aesthetic 开启时额外注入的「美学系统」（检索风格库 + 兜底语法 + 惊艳出口）。
 *  架构（先生定调 · RAG 化美学）：知识按风格分文档存 styles/，常驻只注入「检索指引 + 兜底保底」——
 *  指令小（常驻）、知识大（按需检索）、增长零成本（新增风格文档不挤占常驻 token）。 */
function buildAestheticText(fontsRoot, editorialPath, framingPath, breathPath, stylesIndex, stylesDir) {
  return `【VCP 美学系统（已启用）】
先感受：材质（信纸/黑板/墨入水/终端）、光（晨光/烛光/屏幕光）、心绪（安心/惊叹/共鸣/行动）——从感受选风格，从心绪定结构。规则保底不锁死，守好安全铁律，其余跟随直觉。
美学注入开启 = 视觉优先：凡是存在可解释的结构、关系、流程、对比、层级、因果、状态或教学价值，都默认使用视觉容器并检索 styles/。解释、教学、科普、ELI5 默认属于视觉任务。只有简单事实、简单确认，或视觉化完全不增加理解效率时才使用纯文字。拿不准时默认视觉化，不为是否需要视觉写论证。

【审美底线·公约】（写时内化，不逐条核对、不反问、不自我推翻；想好即写、一次成型）
- 对齐成网：元素挂同一网格，间距取 4/8 步长。
- 一屏一焦点：每屏一个视觉焦点，其余退为背景。
- 明度即层级：最重要=最深墨/最亮光，次要逐级递减。
- 吝啬即重量：强调色全卡至多一处、最多两处呼应。
- 留白分卡：分组靠间距，不用边框阴影堆层级。
- 色彩 60-30-10：主色六成/次色三成/强调一成，全卡≤5 色。
- 字体三员：标题艺术体/正文系统无衬线/数字衬线，全卡≤3 种。
- 图必有义：图标装饰须有语义，删掉内容仍成立即多余。
- 禁 Emoji：视觉容器内一律不用 Emoji——拉低质感、是偷懒的装饰；要图标用内联 SVG 手绘或干脆留白。
- 数据诚实：聚合摊回可数单位，图表不断轴。
- 字级阶梯：醒目度逐级递减，主标题>副标题>正文>后记>装饰。

【风格检索】（有工具时，流程第一步）
1. read 索引：${stylesIndex}（一行一风格：场景/标签）
2. 按主题/情绪命中 1 个 → read ${stylesDir}<slug>.md
3. 选字体 read ${path.join(STYLES_DIR, '_FONTS.md')}
4. 未命中/无工具/检索失败 → 读 ${path.join(STYLES_DIR, '_BASELINE.md')} 兜底，不再纠结

【字体加载】Lanxi-* 字体已由插件全局注册 @font-face（启动即注入，styles 文档里的字体别名可直接用）：输出视觉卡时直接写 font-family:'Lanxi-XXX'（如 'Lanxi-自由浪漫' / 'Lanxi-叮叮' / 'Lanxi-卡通'）即命中真实字体文件；**不要因为「不确定浏览器认不认」就回退成系统黑体（PingFang/Microsoft YaHei/SimHei）**——那会让所有卡片看起来千篇一律。系统字体只允许作为最后一级兜底。

【惊艳出口】深底光效在沉浸叙事/终端/大屏数据语境可用；深底三要求：正文对比度≥4.5:1、全卡至多 1 张暗卡、光效≤2 处。唯一禁令：深蓝黑底+荧光青发光字。声明式配色免写 hex：根容器 data-vcp-preset="editorial|chiaroscuro|fauvism|cyberpunk|wabi_sabi"（可选 data-vcp-mode）自动生成整套 --vcp-* 色板，自定义见 DESIGN.md §1.5。
【进化的美学库】看到好设计、做出被点赞的卡，把提炼技法写入对应风格文档（或新建：元信息 主义/场景/标签/色板/核心语法/点睛技法），完整成品存档 examples/。

图型库详见 EDITORIAL.md：${editorialPath}
故事装帧见 FRAMING.md：${framingPath}
灵魂手册见 BREATH.md：${breathPath}`
}


// （思考门 ThinkingGate 已移除 · v0.6.0 · 结论：DeepSeek v4 忽略 thinking:disabled 且无低档，
//  模型能力边界——详见 CHANGELOG 0.6.0；未来若换支持 effort=off 的模型可参考历史实现恢复。）

/** 开关关闭时注入的降级说明。 */
/** 递归列出字体来源中的实际字体文件。
 * source 可以是目录，也可以是单个字体文件路径。
 */
async function walkFonts(source, prefix = '') {
  const out = []
  let st
  try {
    st = await fs.stat(source)
  } catch {
    return out
  }
  if (st.isFile()) {
    const name = path.basename(source)
    if (FONT_MIME[path.extname(name).toLowerCase()]) out.push(prefix || name)
    return out
  }
  if (!st.isDirectory()) return out

  let entries
  try {
    entries = await fs.readdir(source, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name
    const full = path.join(source, ent.name)
    if (ent.isDirectory()) out.push(...(await walkFonts(full, rel)))
    else if (FONT_MIME[path.extname(ent.name).toLowerCase()]) out.push(rel)
  }
  return out
}

/** 扫描实际存在的字体文件。
 * DESIGN.md 只提供“已知文件名 → 友好别名”的可选映射，不再充当字体注册表：
 * - 文件不存在：不会出现在前端下拉框；
 * - 用户挂载任意目录：递归扫描到的任意字体都会自动加入；
 * - 已知字体即使目录结构与 DESIGN.md 不同，只要文件名一致仍可得到原友好别名。
 */
async function scanFonts(extraRoots, fontsRoot, aliasMap = {}) {
  const roots = [
    ...(fontsRoot ? [{ label: 'external', root: fontsRoot }] : []),
    ...extraRoots.filter(Boolean).map((r) => ({ label: 'extra', root: r })),
    { label: 'builtin', root: BUILTIN_FONTS },
  ]
  const aliasByFile = {}
  for (const [alias, rel] of Object.entries(aliasMap)) {
    const file = path.basename(String(rel || '')).toLowerCase()
    if (file && !aliasByFile[file]) aliasByFile[file] = alias
  }
  const out = []
  const seenFamilies = new Set()
  for (const { label, root } of roots) {
    const rels = await walkFonts(root)
    for (const rel of rels) {
      const name = path.basename(rel)
      const ext = path.extname(name)
      const rawFamily = path.basename(name, ext).replace(/['"\\\r\n]+/g, ' ').trim()
      const family = aliasByFile[name.toLowerCase()] || rawFamily
      if (!family || seenFamilies.has(family)) continue
      seenFamilies.add(family)
      out.push({ rel, root: label, name, family })
    }
  }
  return out
}

/** 解析字体分类字符串（如「标题：A / B；副标题：C」）成结构化数组。 */
function parseFontCats(fontsStr) {
  const out = { title: [], subtitle: [], body: [], deco: [] }
  const keyMap = { '标题': 'title', '副标题': 'subtitle', '正文': 'body', '装饰': 'deco' }
  const sections = String(fontsStr || '').split(/[；;]/)
  for (const sec of sections) {
    const m = sec.match(/^\s*(标题|副标题|正文|装饰)\s*[：:]\s*(.+)$/)
    if (!m) continue
    const key = keyMap[m[1]]
    if (!key) continue
    out[key] = m[2].split(/[/、]/).map((x) => x.trim()).filter(Boolean).slice(0, 6)
  }
  return out
}

/** 解析一个风格文档的元信息（标题/场景/标签/色板/字体 + 抽取色值 + 结构化字体分类）。 */
function parseStyleMeta(file, raw) {
  const slug = file.replace(/\.md$/, '')
  const title = (raw.match(/^#\s+(.+)$/m) || [])[1] || slug
  const name = (title.match(/^(.+?)\s*[（(]/) || [])[1] || title
  const scene = (raw.match(/适用场景[：:]\s*(.+)/) || [])[1] || ''
  const tags = (raw.match(/标签[：:]\s*(.+)/) || [])[1] || ''
  const palette = (raw.match(/色板[^）]*[)）]\s*(.+)/) || [])[1] || ''
  const colors = (raw.match(/#[0-9a-fA-F]{3,8}\b/g) || []).slice(0, 8)
  const fonts = (raw.match(/字体[：:]\s*(.+)/) || [])[1] || ''
  // 解析「核心思路 / 判断准则」：## 这是什么 到 下一个 ## 之间的正文
  let desc = ''
  const whatM = raw.match(/##\s*这是什么[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/)
  if (whatM) desc = whatM[1].trim()
  if (!desc) {
    const jM = raw.match(/##\s*判断准则[^\n]*\n+([\s\S]*?)(?=\n##\s|$)/)
    if (jM) desc = jM[1].trim()
  }
  // 提取全部 section（## 二级标题 → 正文），供详情弹层完整展示
  const sections = []
  const secRe = /##\s*([^\n]+)\n+([\s\S]*?)(?=\n##\s|$)/g
  let sm
  while ((sm = secRe.exec(raw))) {
    const title = sm[1].trim().replace(/[（(].*?[)）]/g, '').trim()
    const body = sm[2].trim()
    if (title && body) sections.push({ title, body })
  }
  return { slug, name, scene, tags, palette, colors, fonts, fontCats: parseFontCats(fonts), desc, sections }
}

/** 扫描 styles/ 全部风格文档（跳过 _ 开头索引/工具文件）。 */
async function scanStyles() {
  let files
  try {
    files = await fs.readdir(STYLES_DIR)
  } catch {
    return []
  }
  const out = []
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue
    try {
      const raw = await fs.readFile(path.join(STYLES_DIR, f), 'utf8')
      out.push(parseStyleMeta(f, raw))
    } catch {
      // 单个文档解析失败不阻断整体。
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** 解析 DESIGN.md 字体表（§0.0/0.1），构建 别名→/fonts 相对路径 映射。 */
function parseFontAliasMap(designRaw) {
  const map = {}
  // 路径后缀大小写不敏感（外置多为大写 .TTF）；别名/路径允许中文与连字符。
  const re = /^\|\s*[^|]*\s*\|\s*`?(Lanxi-[^`|]+)`?\s*\|\s*`?([^|`]+?\.(?:ttf|otf|woff2?))`?\s*\|/gim
  let m
  while ((m = re.exec(designRaw))) map[m[1]] = m[2].trim()
  // 特殊行兜底：鱼尾行书繁 路径后带说明文字（`…ttf`（说明））——标准正则失配，单独补。
  if (!map['Lanxi-鱼尾行书繁']) {
    const line = designRaw.split('\n').find((l) => l.includes('Lanxi-鱼尾行书繁'))
    if (line) {
      const mm = /`?([^|`]+?\.(?:ttf|otf|woff2?))`?\s*（/.exec(line)
      if (mm) map['Lanxi-鱼尾行书繁'] = mm[1].trim()
    }
  }
  return map
}

/** 从前端提交的 fonts 分类对象 + 兼容旧 font 字段，生成「标题：A / B；正文：C」字体行。 */
function fontLineFromFonts(pfonts, safeFont) {
  const catNames = { title: '标题', subtitle: '副标题', body: '正文', deco: '装饰' }
  const fontCats = Object.keys(catNames).map((key) => {
    const list = Array.isArray(pfonts && pfonts[key])
      ? pfonts[key].filter((x) => typeof x === 'string' && x && !x.includes('/') && !x.includes('\\'))
      : []
    return list.length ? catNames[key] + '：' + list.join(' / ') : ''
  }).filter(Boolean)
  return fontCats.length ? fontCats.join('；') : (safeFont || '正文系统无衬线')
}

/** 生成风格文档 md（create/update 共用）。desc 留空时规则兜底。 */
function buildStyleMd(o) {
  const name = o.name
  const slug = o.slug
  const scene = o.scene || ''
  const tags = o.tags || ''
  const desc = String(o.desc || '').trim() || [
    name ? '本风格的核心命题：' + name + '——用统一的视觉语言把内容装进一种「' + (scene || '独特') + '」的气质里。' : '',
    scene ? '适用场景：' + scene + '；元素布置围绕这一场景的阅读习惯展开。' : '',
    tags ? '关键词锚点：' + tags + '——色板、材质、字体的选择都向这些关键词靠拢。' : '',
    '判断准则：删掉装饰内容仍成立（装饰服务内容）；全卡一个视觉焦点；强调色稀缺即重量；底色/字体气质与主题匹配。',
  ].filter(Boolean).join('\n')
  const colorStr = o.colorStr
  const fontLine = o.fontLine
  const date = new Date().toISOString().slice(0, 10)
  return [
    '# ' + name + '（' + slug + '）',
    '',
    '> 继承公约：本风格继承常驻【审美底线·公约】（对齐成网/一屏一焦点/明度即层级/吝啬即重量/留白分卡/色彩 60-30-10/字体三员/图必有义/禁 Emoji/数据诚实/字级阶梯），以下只写差异化准则。',
    '> 元信息：',
    '> - 主义/流派：用户自定义',
    scene ? '> - 适用场景：' + scene : '> - 适用场景：（待补充）',
    tags ? '> - 标签：' + tags : '> - 标签：自定义',
    '> - 色板（示例基调，随语境调）：' + colorStr,
    '> - 字体：' + fontLine,
    '> - 可混配：（待补充）',
    '',
    '## 这是什么（不是模板，是思路）',
    '',
    desc,
    '',
    '## 判断准则（可迁移的决策逻辑）',
    '',
    '1. （待提炼：第一张被点赞成品后回填）',
    '',
    '## 示例素材（落地样例 · 可替换）',
    '',
    '- 色板：' + colorStr,
    '- 骨架：（待回填）',
    '- 字体：' + fontLine,
    '',
    '## 点睛技法',
    '',
    '1. （待回填：从被点赞成品提炼）',
    '',
    '## 参考',
    '',
    '- 用户自定义风格 · ' + date,
    '',
  ].join('\n')
}

/** 检查字体相对路径在任意字体根下是否存在（=已安装）。
 *  坑（先生 2026-08-27 · puppeteer 实测「已装 0/39」）：本文件 `import { promises as fs }`
 *  只有 promise API——`fs.statSync` 是 undefined，调用即 TypeError 被 catch 吞掉 → 永远
 *  判定「文件不存在」→ 所有字体显示未装 → ensureGlobalFonts 注入 0 条 → Lanxi-* 全黑体。
 *  与 create-style 当年 `fs.existsSync is not a function` 同款坑。修复：从 node:fs 同步
 *  导入 statSync 专用，不依赖 promises 命名空间。 */
function fontExists(rel, extraFonts, fontsRoot) {
  const roots = [...extraFonts, fontsRoot, BUILTIN_FONTS].filter(Boolean)
  for (const root of roots) {
    try {
      const base = path.resolve(root)
      const file = path.resolve(path.join(base, rel))
      if (file.startsWith(base) && statSync(file).isFile()) return true
    } catch {
      // 根不存在/路径越界/文件缺失 → 尝试下一个根。
    }
  }
  return false
}


/** 解析 LLM 输出的 JSON（容忍 ```json 围栏、前后噪声、缺失字段）。 */
/** 解析 LLM 输出的 JSON：遍历所有 { 起点，逐个试平衡块，取第一个「能解析且含风格关键字段」的。
 *  容忍 ```json 围栏、前后噪声、思考残留（伪 JSON 不含 name/colors/fonts 会被跳过）。 */
function parseAiJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim()
  // 枚举每个 { 作为候选起点
  for (let s = 0; s < t.length; s++) {
    if (t[s] !== '{') continue
    let depth = 0
    for (let i = s; i < t.length; i++) {
      if (t[i] === '{') depth++
      else if (t[i] === '}') {
        depth--
        if (depth === 0) {
          const slice = t.slice(s, i + 1)
          try {
            const obj = JSON.parse(slice)
            // 风格 JSON 必须含至少一个关键字段
            if (obj && typeof obj === 'object' && (obj.name || obj.colors || obj.fonts || obj.desc || obj.scene || obj.tags)) {
              return obj
            }
          } catch {
            // 这个平衡块解析失败，试下一个
          }
          break // 该起点失败，试下一个 {
        }
      }
    }
  }
  return null
}

/** 从 LLM 流式输出收集完整文本。 */
/** 从 LLM 流式输出收集完整文本。
 *  StreamChunk 是带类型的判别联合（@deepseek-ai/dsh-llm）：
 *  - { type:'text-delta', text }   → 正文增量（唯一要收集的正文）
 *  - { type:'reasoning-delta', text } → 模型思考（跳过，不混入正文）
 *  - { type:'block-end', block }   → 完整内容块（兜底：块是 text 时取其 text）
 *  - { type:'finish', reason }     → 停止原因（stop/max-tokens/error）——诊断关键
 *  关键：一直收集到 finish 才停；思考一概不管；记录 finish reason 与块类型便于诊断。 */
async function collectStream(iterable) {
  let out = ''
  let stats = {}
  let finishReason = null
  let blockTypes = {}
  for await (const chunk of iterable) {
    if (!chunk || typeof chunk !== 'object') continue
    const t = chunk.type || 'raw-text'
    stats[t] = (stats[t] || 0) + 1
    if (t === 'finish') {
      finishReason = (chunk.reason && (chunk.reason.kind || chunk.reason)) || 'unknown'
      break
    }
    if (t === 'text-delta' && typeof chunk.text === 'string') {
      out += chunk.text
    } else if (t === 'block-end' && chunk.block) {
      const b = chunk.block
      blockTypes[b.type || 'unknown'] = (blockTypes[b.type || 'unknown'] || 0) + 1
      // 收集 text 块正文；若 block 本身就是完整文本也尝试（部分 adapter 把结果放 block）
      if (typeof b.text === 'string') out += b.text
    } else if (t === 'raw-text' && typeof chunk.text === 'string') {
      out += chunk.text
    }
    // reasoning-delta / usage / tool-call-delta 忽略
  }
  return { text: out, stats, finishReason, blockTypes }
}

const DISABLED_TEXT = `（VCP 视觉通感渲染开关当前关闭：消息中的 HTML 将显示为源码。回复请使用普通 Markdown，不要输出 <div> 等 HTML 容器。）`

function apply(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  const webServer = ctx.get('webServer')
  const settings = ctx.get('settings')
  // DSH 已连接的大模型服务（@deepseek-ai/dsh-llm 在 Context 声明 llm）——
  // 插件直接复用 DSH 后台/凭据调用模型，无需任何 key；不可用时 ai-generate 降级规则引擎。
  const llm = ctx.get('llm')
  // DSH Desktop 通常提供 directoryPicker native capability，可直接弹出系统文件夹选择器。
  // 这是可选能力：远程/Web 环境没有 native picker 时仍可手动填写路径。
  const directoryPicker = ctx.get('directoryPicker')
  if (systemPrompt === undefined || webServer === undefined || settings === undefined) return

  /** 插件配置 scope（fontsRoot 可配置；schema 加载失败时降级为默认值、不注册）。 */
  let fontsRoot = DEFAULT_FONTS_ROOT
  /** 额外字体根（面板/配置挂载的文件夹，/fonts 一并服务）。 */
  let extraFonts = []
  /** 用户锁定的风格 slug（美学系统面板选择，注入协议优先提示）。 */
  let preferredStyle = ''
  /** 配置 scope 引用（STATE 加载后并入配置里已有的字体根，防重启丢失）。 */
  let settingsScope = null
  void (async () => {
    const schema = await tryLoadConfigSchema()
    if (schema === null) return
    try {
      const scope = settings.register(NS, schema)
      settingsScope = scope
      fontsRoot = scope.get().fontsRoot
      extraFonts = (scope.get().fontRoots || []).slice()
      scope.watch(() => {
        fontsRoot = scope.get().fontsRoot
        extraFonts = (scope.get().fontRoots || []).slice()
      })
    } catch {
      // 配置注册失败不阻断运行（fontsRoot 保持默认值）。
    }
  })()

  /** 当前开关状态：render（渲染）、aesthetic（美学注入），默认关闭；持久化恢复。 */
  let render = false
  let aesthetic = false
  void (async () => {
    try {
      const raw = await fs.readFile(STATE_FILE, 'utf8')
      const st = JSON.parse(raw)
      if (typeof st.render === 'boolean') {
        render = st.render
        aesthetic = st.aesthetic === true
      } else if (st.enabled === true) {
        // 旧版单开关迁移：曾开启即视为「渲染 + 美学」都开（仅一次）
        render = true
        aesthetic = true
      }
      if (Array.isArray(st.fontRoots)) extraFonts = st.fontRoots
      // 竞态修复：面板挂载的字体根优先持久化在 state 文件；若 state 为空但配置里有
      // fontRoots（老版本写进配置的），也并入——保证重启后挂载不丢。
      if (settingsScope) {
        const cfg = settingsScope.get()
        for (const r of (cfg.fontRoots || [])) if (!extraFonts.includes(r)) extraFonts.push(r)
      }
      if (typeof st.style === 'string') preferredStyle = st.style
    } catch {
      // 无状态文件或损坏：保持默认关闭。
    }
  })()

  /** 持久化当前全部状态（开关 + 额外字体根）到磁盘。 */
  async function persistState() {
    try {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true })
      await fs.writeFile(STATE_FILE, JSON.stringify({ render, aesthetic, fontRoots: extraFonts, style: preferredStyle }), 'utf8')
    } catch {
      // 写盘失败不阻断运行（内存状态仍有效）。
    }
  }

  /** 更新开关状态并落盘（渲染关闭时美学强制关闭）。 */
  async function setState(r, aes) {
    render = Boolean(r)
    aesthetic = render && Boolean(aes)
    await persistState()
  }

  /** 挂载一个字体来源：目录或单个字体文件。 */
  async function addFontsRoot(p) {
    const resolved = path.resolve(String(p || '').trim())
    if (!resolved) throw new Error('path required')
    let st
    try {
      st = await fs.stat(resolved)
    } catch {
      throw new Error('路径不存在：' + resolved)
    }
    if (st.isFile()) {
      const ext = path.extname(resolved).toLowerCase()
      if (!FONT_MIME[ext]) throw new Error('不是支持的字体文件：' + resolved)
    } else if (!st.isDirectory()) {
      throw new Error('只能挂载字体目录或字体文件：' + resolved)
    }
    if (!extraFonts.includes(resolved)) extraFonts.push(resolved)
    await persistState()
    return extraFonts.slice()
  }

  /** 移除一个额外字体根目录。 */
  async function removeFontsRoot(p) {
    extraFonts = extraFonts.filter((r) => r !== p)
    await persistState()
    return extraFonts.slice()
  }

  ctx.effect(() => {
    const disposers = []
    disposers.push(
      systemPrompt.section({
        name: 'raw-html:vcp',
        order: 200,
        text: () =>
          render
            ? buildStructuralText(DESIGN_MD) +
                (aesthetic
                  ? buildAestheticText(fontsRoot, EDITORIAL_MD, FRAMING_MD, BREATH_MD, STYLES_INDEX, STYLES_DIR) +
                    (preferredStyle
                      ? `\n\n【风格锁定】用户已锁定风格：${preferredStyle}——锁定即持续：本会话所有视觉输出一律以该风格为主，无论主题是文学、数据、工程审查还是其他，都 read styles/${preferredStyle}.md 并按它的色板/骨架/字体/技法组织每一张视觉卡；不得因「主题不匹配」「任务偏理性」等观感自行回退或更换风格，也不得降级成通用排版。仅当用户明确要求改用其他风格时才解锁更换。`
                      : '')
                  : '')
            : DISABLED_TEXT,
      }),
    )

    // --- 字体服务：/fonts/<相对路径> → 字体根目录下的字体文件 -----------------
    disposers.push(
      webServer.register({
        kind: 'prefix',
        path: FONTS_ROUTE,
        handler: async (req, res) => {
          const rawUrl = (req.url ?? '').split('?')[0]
          const prefix = `${FONTS_ROUTE}/`
          if (!rawUrl.startsWith(prefix)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('not found')
            return
          }
          let rel
          try {
            rel = decodeURIComponent(rawUrl.slice(prefix.length))
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('bad request')
            return
          }
          if (rel.length === 0 || rel.includes('..')) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('forbidden')
            return
          }
          // 依次解析外置来源与内置字体。外置来源既可以是目录，也可以是单个字体文件。
          const roots = [...extraFonts, fontsRoot, BUILTIN_FONTS].filter(Boolean)
          for (const root of roots) {
            const resolvedRoot = path.resolve(root)
            let rootStat
            try { rootStat = await fs.stat(resolvedRoot) } catch { continue }

            let file
            if (rootStat.isFile()) {
              if (path.basename(resolvedRoot) !== path.basename(rel)) continue
              file = resolvedRoot
            } else if (rootStat.isDirectory()) {
              file = path.resolve(path.join(resolvedRoot, rel))
              const relative = path.relative(resolvedRoot, file)
              if (relative.startsWith('..') || path.isAbsolute(relative)) continue
            } else {
              continue
            }

            const ext = path.extname(file).toLowerCase()
            if (FONT_MIME[ext] === undefined) continue
            try {
              const data = await fs.readFile(file)
              res.writeHead(200, {
                'Content-Type': FONT_MIME[ext],
                'Content-Length': data.byteLength,
                'Cache-Control': 'public, max-age=86400',
              })
              res.end(data)
              return
            } catch {
              // 当前来源未命中，继续尝试下一个来源。
            }
          }
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('font not found')
        },
      }),
    )

    // --- 前端资源服务：/vendor/<相对路径> → 插件内置 assets/vendor -----------------
    // 服务 KaTeX（katex.min.js/css + 字体），随插件分发、离线可用；只读内置目录，
    // 相对路径含 '..' 一律拒绝（路径穿越防护）。
    disposers.push(
      webServer.register({
        kind: 'prefix',
        path: VENDOR_ROUTE,
        handler: async (req, res) => {
          const rawUrl = (req.url ?? '').split('?')[0]
          const prefix = `${VENDOR_ROUTE}/`
          if (!rawUrl.startsWith(prefix)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('not found')
            return
          }
          let rel
          try {
            rel = decodeURIComponent(rawUrl.slice(prefix.length))
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('bad request')
            return
          }
          if (rel.length === 0 || rel.includes('..')) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('forbidden')
            return
          }
          const root = path.resolve(BUILTIN_VENDOR)
          const file = path.resolve(path.join(root, rel))
          if (!file.startsWith(root)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('forbidden')
            return
          }
          const ext = path.extname(file).toLowerCase()
          if (VENDOR_MIME[ext] === undefined) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('forbidden')
            return
          }
          try {
            const data = await fs.readFile(file)
            res.writeHead(200, {
              'Content-Type': VENDOR_MIME[ext],
              'Content-Length': data.byteLength,
              'Cache-Control': 'public, max-age=86400',
            })
            res.end(data)
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('vendor file not found')
          }
        },
      }),
    )

    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // 资源释放失败不阻断其余清理。
        }
      }
    }
  })

  // --- loopback RPC：浏览器半侧的「</>」开关按钮上报状态 ---------------------
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection
    if (connection === undefined || connection.rpc === undefined) return
    connection.rpc.handle(
      RPC_CHANNEL,
      async (endpoint, payload) => {
        // 统一信封：handler 内部返回的 {ok:true,value} / {ok:false,error} 都转成
        // {ok:true,value:{...}}，错误放 value.error——保证前端总能拿到完整对象，
        // 不会被 connection RPC 层当 reject 处理（否则前端拿到 null → 「未知错误」）。
        try {
          const inner = await handleInner(endpoint, payload)
          if (inner && inner.ok === false) {
            return okResult({ error: inner.error })
          }
          return inner
        } catch (e) {
          return okResult({ error: { code: 'internal', message: ((e && e.message) || String(e)) } })
        }
        async function handleInner(endpoint, payload) {
        switch (endpoint) {
          case 'get-state':
            return okResult({ render, aesthetic, fontsRoot, extraFonts, preferredStyle })
          case 'set-state':
            await setState(payload && payload.render, payload && payload.aesthetic)
            return okResult({ render, aesthetic, fontsRoot, extraFonts })
          case 'list-styles':
            return okResult({ styles: await scanStyles() })
          case 'list-fonts': {
            const aliasMap = parseFontAliasMap(await fs.readFile(DESIGN_MD, 'utf8'))
            const fonts = await scanFonts(extraFonts, fontsRoot, aliasMap)
            // installed 仅为旧版前端兼容字段；现代 UI 直接以 fonts（实际扫描结果）为准。
            const installed = {}
            for (const a in aliasMap) installed[a] = false
            for (const f of fonts) if (Object.prototype.hasOwnProperty.call(aliasMap, f.family)) installed[f.family] = true
            return okResult({ fonts, extraFonts, aliasMap, installed })
          }
          case 'set-style':
            if (payload && typeof payload.style === 'string') {
              preferredStyle = payload.style
              await persistState()
              return okResult({ preferredStyle })
            }
            return failResult('bad-request', 'style required')
          case 'open-style-folder': {
            const slug = String(payload && payload.slug || '').trim()
            if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..') || slug.length > 60) return failResult('bad-request', 'bad slug')
            const target = path.join(STYLES_DIR, slug + '.md')
            if (!target.startsWith(path.resolve(STYLES_DIR) + path.sep)) return failResult('bad-request', 'bad slug')
            try {
              await fs.access(target)
            } catch {
              return failResult('not-found', 'style not found: ' + slug)
            }
            try {
              await openInFileManager(target)
              return okResult({ opened: target })
            } catch (e) {
              return failResult('open-failed', '无法打开文件管理器：' + ((e && e.message) || e))
            }
          }
          case 'delete-style': {
            const slug = String(payload && payload.slug || '').trim()
            // 只允许删除用户创建的自定义风格（文件非内置），且防路径穿越
            if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..')) return failResult('bad-request', 'bad slug')
            const target = path.join(STYLES_DIR, slug + '.md')
            if (!target.startsWith(path.resolve(STYLES_DIR) + path.sep)) return failResult('bad-request', 'bad slug')
            try {
              // 保护：内置风格文档（作者提供）不允许删除
              const raw = await fs.readFile(target, 'utf8')
              if (raw.includes('用户自定义风格') || raw.includes('用户自定义')) {
                await fs.unlink(target)
                // 从 _INDEX.md 移除对应行
                try {
                  const idxPath = path.join(STYLES_DIR, '_INDEX.md')
                  const idx = await fs.readFile(idxPath, 'utf8')
                  const lines = idx.split('\n').filter((l) => !l.trim().startsWith('- ' + slug + ' —'))
                  await fs.writeFile(idxPath, lines.join('\n'), 'utf8')
                } catch {}
                // 若锁定了该风格则解锁
                if (preferredStyle === slug) { preferredStyle = ''; await persistState() }
                return okResult({ deleted: slug })
              }
              return failResult('forbidden', 'builtin style cannot be deleted')
            } catch {
              return failResult('not-found', 'style not found: ' + slug)
            }
          }
          case 'update-style': {
            const p = payload || {}
            const slug = String(p.slug || '').trim()
            // slug 是风格标识（文件名/检索键），不可改；防路径穿越
            if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..') || slug.length > 60) return failResult('bad-request', 'bad slug')
            const target = path.join(STYLES_DIR, slug + '.md')
            if (!target.startsWith(path.resolve(STYLES_DIR) + path.sep)) return failResult('bad-request', 'bad slug')
            // 确认存在（可编辑内置或自定义风格——用户本机接管后即可改）
            try {
              await fs.access(target)
            } catch {
              return failResult('not-found', 'style not found: ' + slug)
            }
            const name = String(p.name || '').trim()
            if (!name) return failResult('bad-request', 'name required')
            const colors = Array.isArray(p.colors)
              ? p.colors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)).slice(0, 12)
              : []
            const font = String(p.font || '').trim()
            const safeFont = font && !font.includes('/') && !font.includes('\\') && !font.includes('..') ? font : ''
            const pfonts = p.fonts && typeof p.fonts === 'object' ? p.fonts : {}
            const fontLine = fontLineFromFonts(pfonts, safeFont)
            const scene = String(p.scene || '').trim()
            const tags = String(p.tags || '').trim()
            const desc = String(p.desc || '').trim()
            const colorStr = colors.length ? colors.map((c) => '`' + c + '`').join(' / ') : '（待补充）'
            const md = buildStyleMd({ name, slug, scene, tags, desc, colorStr, fontLine })
            try {
              await fs.writeFile(target, md, 'utf8')
            } catch (e) {
              return failResult('write-failed', '无法写入风格文件：' + ((e && e.message) || e) + '（请检查插件目录写权限）')
            }
            // 更新 _INDEX.md 对应行（替换以 '- slug —' 开头的行）
            try {
              const idxPath = path.join(STYLES_DIR, '_INDEX.md')
              const idx = await fs.readFile(idxPath, 'utf8')
              const line = '- ' + slug + ' — ' + name + (scene ? ' · ' + scene.split(/[；;，,]/)[0] : '') + (tags ? '（' + tags.split(/[,，]/).slice(0, 3).join('/') + '）' : '')
              const lines = idx.split('\n').map((l) => (l.startsWith('- ' + slug + ' —') ? line : l))
              await fs.writeFile(idxPath, lines.join('\n'), 'utf8')
            } catch {}
            return okResult({ slug })
          }
          case 'ai-generate': {
            const idea = String(payload && payload.idea || '').trim()
            if (!idea) return failResult('bad-request', 'idea required')
            // 只走 DSH 已连的大模型，不做规则枚举。handler 内动态获取 llm（apply 时可能未就绪）
            const llmNow = ctx.get('llm') || ctx.llm
            if (!llmNow) return failResult('unavailable', 'AI 服务不可用：DSH 未加载 LLM 服务（请确认 dsh-llm 已启用且配置了模型）')
            try {
              const aliasMap = parseFontAliasMap(await fs.readFile(DESIGN_MD, 'utf8'))
              // 枚举 provider（取第一个活跃的）
              let provider = null
              try { const ps = llmNow.listProviders(); if (ps && ps.length) provider = ps[0].id || ps[0] } catch {}
              if (!provider) {
                try { const cps = llmNow.listConfigurableProviders(); if (cps && cps.length) provider = cps[0].id || cps[0] } catch {}
              }
              if (!provider) return failResult('unavailable', 'AI 服务不可用：未找到可用的模型提供方')
              let model = null
              try { const ms = await llmNow.listModels(provider); if (ms && ms.length) model = ms[0].id || ms[0] } catch {}
              const system = '你是资深美学风格设计师。用户会给你一句关于视觉风格的想法（可能很模糊）。请把它扩展成一份完整、可执行的美学风格定义，只输出一个 JSON 对象，不要任何解释或围栏。JSON 结构严格为：{"name":"风格中文名","slug":"英文小写连字符标识（可空让系统生成）","scene":"适用场景，斜杠分隔","tags":"逗号分隔关键词","desc":"核心命题与可迁移判断准则，2-4句，写明材质/光/心绪","colors":["#RRGGBB",...4-6个，含底色/墨色/强调色","fonts":{"title":["字体别名..."]或[],"subtitle":[],"body":[],"deco":[]}}。字体别名必须从下面提供的候选里挑，不认识的返回空数组。候选字体：' + JSON.stringify(Object.keys(aliasMap)) + '。色板要克制高级，遵守60-30-10法则。'
              // 构造符合 DSH 消息协议的用户消息：
              // content 必须是 ContentBlock[]（TextBlock），并带 source/id（createUserMessage 自动生成 id）。
              // 优先用官方 createUserMessage；不可用则手写兼容结构。
              let userMsg
              try {
                const llmMod = await import('@deepseek-ai/dsh-llm')
                const makeMsg = llmMod.createUserMessage || (llmMod.default && llmMod.default.createUserMessage)
                if (typeof makeMsg === 'function') {
                  userMsg = makeMsg({ content: [{ type: 'text', text: idea }], source: { kind: 'user' } })
                }
              } catch {}
              if (!userMsg) {
                userMsg = {
                  role: 'user',
                  content: [{ type: 'text', text: idea }],
                  source: { kind: 'user' },
                  id: 'aes-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                }
              }
              // 用官方 prepareCall 路径（路由解析+适配器准备），再 stream——比直接 llm.stream 更可靠
              let gen
              try {
                if (typeof llmNow.prepareCall === 'function') {
                  const prepared = await llmNow.prepareCall({ provider, model: model || undefined }, undefined)
                  gen = prepared.stream({
                    provider,
                    model: model || undefined,
                    system,
                    messages: [userMsg],
                    temperature: 0.7,
                    // 不设 maxTokens：模型可能先输出大量思考，限制会被思考吃光导致正文未输出
                  })
                }
              } catch {}
              if (!gen) {
                // prepareCall 不可用则直接 llm.stream
                gen = llmNow.stream({
                  provider,
                  model: model || undefined,
                  system,
                  messages: [userMsg],
                  temperature: 0.7,
                  // 不设 maxTokens：避免思考占满 token 导致正文被截断
                })
              }
              const rawObj = await collectStream(gen)
              const raw = rawObj.text
              const parsed = parseAiJson(raw)
              if (!parsed) {
                // 诊断：chunk 分布 + finish 原因 + 块类型 + AI 原始返回（截断）
                const snippet = String(raw || '').slice(0, 800)
                const st = JSON.stringify(rawObj.stats || {})
                const fr = rawObj.finishReason || 'unknown'
                const bt = JSON.stringify(rawObj.blockTypes || {})
                return failResult('parse-error', 'AI 返回无法解析。分布:' + st + '。停止原因:' + fr + '。块类型:' + bt + '。AI 返回：' + (snippet || '（空，可能思考占满无正文）'))
              }
              // 清洗字段
              const pf = parsed.fonts || {}
              const genName = String(parsed.name || '').trim() || undefined
              // slug：模型给了就用，没给/为空则按名称自动生成（前端展示，创建时仍可改）
              let genSlug = String(parsed.slug || '').trim()
              if (!genSlug && genName) {
                genSlug = genName.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40)
              }
              return okResult({
                name: genName,
                slug: genSlug || '',
                scene: String(parsed.scene || '').trim() || '',
                tags: String(parsed.tags || '').trim() || '',
                desc: String(parsed.desc || '').trim() || '',
                colors: Array.isArray(parsed.colors) ? parsed.colors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)).slice(0, 12) : [],
                fonts: {
                  title: Array.isArray(pf.title) ? pf.title.filter((x) => typeof x === 'string' && aliasMap[x]).slice(0, 6) : [],
                  subtitle: Array.isArray(pf.subtitle) ? pf.subtitle.filter((x) => typeof x === 'string' && aliasMap[x]).slice(0, 6) : [],
                  body: Array.isArray(pf.body) ? pf.body.filter((x) => typeof x === 'string' && aliasMap[x]).slice(0, 6) : [],
                  deco: Array.isArray(pf.deco) ? pf.deco.filter((x) => typeof x === 'string' && aliasMap[x]).slice(0, 6) : [],
                },
              })
            } catch (e) {
              return failResult('llm-error', 'AI 调用失败：' + ((e && e.message) || e))
            }
          }
          case 'create-style': {
            const p = payload || {}
            const name = String(p.name || '').trim()
            if (!name) return failResult('bad-request', 'name required')
            let slug = String(p.slug || '').trim()
            if (!slug) {
              slug = name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || ('user-style-' + Date.now().toString().slice(-6))
            }
            // 双重安全：去掉路径分隔符/危险字符，杜绝路径穿越
            slug = slug.replace(/[\\/:*?"<>|]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
            if (!slug || slug === '.' || slug === '..' || slug.length > 60) return failResult('bad-request', 'bad slug')
            const target = path.join(STYLES_DIR, slug + '.md')
            if (!target.startsWith(path.resolve(STYLES_DIR) + path.sep)) return failResult('bad-request', 'bad slug')
            // fs 是 promises API（无 existsSync），用 fs.access 检测存在性
            try {
              await fs.access(target)
              return failResult('conflict', 'style exists: ' + slug)
            } catch {
              // 文件不存在，可继续创建
            }
            const colors = Array.isArray(p.colors)
              ? p.colors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)).slice(0, 12)
              : []
            const font = String(p.font || '').trim()
            const safeFont = font && !font.includes('/') && !font.includes('\\') && !font.includes('..') ? font : ''
            const pfonts = p.fonts && typeof p.fonts === 'object' ? p.fonts : {}
            const fontLine = fontLineFromFonts(pfonts, safeFont)
            const scene = String(p.scene || '').trim()
            const tags = String(p.tags || '').trim()
            const desc = String(p.desc || '').trim()
            const colorStr = colors.length ? colors.map((c) => '`' + c + '`').join(' / ') : '（待补充）'
            const md = buildStyleMd({ name, slug, scene, tags, desc, colorStr, fontLine })
            try {
              await fs.writeFile(target, md, 'utf8')
            } catch (e) {
              return failResult('write-failed', '无法写入风格文件：' + ((e && e.message) || e) + '（请检查插件目录写权限）')
            }
            // 自动登记 _INDEX.md（幂等：已含同 slug 行则跳过）
            try {
              const idx = await fs.readFile(path.join(STYLES_DIR, '_INDEX.md'), 'utf8')
              const line = '- ' + slug + ' — ' + name + (scene ? ' · ' + scene.split(/[；;，,]/)[0] : '') + (tags ? '（' + tags.split(/[,，]/).slice(0, 3).join('/') + '）' : '')
              if (!idx.includes('- ' + slug + ' —')) await fs.writeFile(path.join(STYLES_DIR, '_INDEX.md'), idx.trimEnd() + '\n' + line + '\n', 'utf8')
            } catch {
              // _INDEX 登记失败不阻断创建。
            }
            return okResult({ slug })
          }
          case 'browse-font-source': {
            try {
              return okResult(await browseFontSource(payload && payload.path))
            } catch (e) {
              return failResult('browse-failed', (e && e.message) || String(e))
            }
          }
          case 'add-fonts-root':
            if (payload && typeof payload.path === 'string' && payload.path.trim()) {
              try {
                const roots = await addFontsRoot(payload.path)
                return okResult({ extraFonts: roots })
              } catch (e) {
                return failResult('bad-font-source', (e && e.message) || String(e))
              }
            }
            return failResult('bad-request', 'path required')
          case 'remove-fonts-root':
            if (payload && typeof payload.path === 'string') {
              const roots = await removeFontsRoot(payload.path)
              return okResult({ extraFonts: roots })
            }
            return failResult('bad-request', 'path required')
          default:
            return failResult('not-found', `unknown endpoint ${JSON.stringify(endpoint)}`)
        }
        }
      },
      { authority: 'loopback' },
    )
  })
}
//#endregion
export { apply, inject, name }
