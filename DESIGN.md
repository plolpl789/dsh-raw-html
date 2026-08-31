# 蓝汐 · 视觉设计系统（DESIGN.md）

> 定位：**纯技术参考手册**——字体资产、中文排版、安全铁律、色板速查。
> 审美（编辑感 / 四色系 / 视觉词汇库）见 [EDITORIAL.md](./EDITORIAL.md)；灵魂（呼吸法）见 [BREATH.md](./BREATH.md)。
> AI 本身具备基础审美，本文件不教「怎么好看」，只给「会崩 / 会错 / 先生骂过」的技术约束与资产。

---

## 0. 字体库（内置精选 + 外置全量 双源）

> `/fonts/` 服务只认**实际存在**的字体文件：① 插件内置 `assets/fonts`；② 用户在美学系统中挂载的任意字体目录。外置目录会递归扫描，不要求复刻作者目录结构。

### 0.0 内置精选（随插件分发 · 无需配置 · 直接可用 · 全部开源授权）

> 用法：`@font-face{font-family:'Lanxi-WenKai';src:url('/fonts/Lanxi-WenKai.woff2');}` 后引用。`DESIGN.md` 中的字体表只为已知文件提供友好别名：文件未实际扫描到时不会出现在 UI；用户挂载的新字体即使不在本表中，也会自动加入可用字体列表。外置字体的授权与使用范围由用户自行确认。

| 领域 | font-family 名 | /fonts/ 路径 | 体积 |
|---|---|---|---|
| 楷书 | `Lanxi-WenKai` | Lanxi-WenKai.woff2 | 883KB |
| 楷书·细 | `Lanxi-WenKaiLight` | Lanxi-WenKaiLight.woff2 | 921KB |
| 手写楷 | `Lanxi-MaShanZheng` | Lanxi-MaShanZheng.woff2 | 1.7MB |
| 黑体 | `Lanxi-HeiTi` | Lanxi-HeiTi.woff2 | 1.3MB |
| 黑体·细 | `Lanxi-HeiTiLight` | Lanxi-HeiTiLight.woff2 | 1.3MB |
| 黑体·粗 | `Lanxi-HeiTiBold` | Lanxi-HeiTiBold.woff2 | 1.4MB |
| 英文花体 | `Lanxi-GreatVibes` | Lanxi-GreatVibes.woff2 | 44KB |
| 宋体·正文（warm-minimal） | `Lanxi-可宋` | Lanxi-可宋.woff2 | 2.79MB |
| 宋体·标题 | `Lanxi-朗宋` | Lanxi-朗宋.woff2 | 2.05MB |
| 宋体·副题 | `Lanxi-品宋` | Lanxi-品宋.woff2 | 2.53MB |
| 宋体·颜韵 | `Lanxi-颜宋` | Lanxi-颜宋.woff2 | 2.37MB |
| 极细·空灵 | `Lanxi-静黑超细` | Lanxi-静黑超细.woff2 | 1.39MB |
| 黑体·几何 | `Lanxi-点黑` | Lanxi-点黑.woff2 | 1.92MB |
| 冲击·超粗 | `Lanxi-超粗黑` | Lanxi-超粗黑.woff2 | 0.73MB |
| 可爱·卡通 | `Lanxi-卡通` | Lanxi-卡通.woff2 | 1.17MB |
| 可爱·手绘 | `Lanxi-叮叮` | Lanxi-叮叮.woff2 | 4.21MB |
| 可爱·萌系 | `Lanxi-喵喵` | Lanxi-喵喵.woff2 | 2.88MB |
| 手写·文人 | `Lanxi-春兰茅坤` | Lanxi-春兰茅坤.woff2 | 1.73MB |
| 书法·行书（刊头首选） | `Lanxi-鱼尾行书` | Lanxi-鱼尾行书.woff2 | 3.70MB |
| 书法·江湖 | `Lanxi-狂侠体` | Lanxi-狂侠体.woff2 | 3.57MB |
| 少女·手写日记（仅手账场景） | `Lanxi-暗恋初夏` | Lanxi-暗恋初夏.woff2 | 3.25MB |
| 少女·标题俏皮（仅手账场景） | `Lanxi-秀英体` | Lanxi-秀英体.woff2 | 1.82MB |
| 少女·软萌（仅手账场景） | `Lanxi-初心少女` | Lanxi-初心少女.woff2 | 1.46MB |
| 少女·童趣（仅手账场景） | `Lanxi-丫丫体` | Lanxi-丫丫体.woff2 | 1.65MB |
| 繁体·行书（须配繁体内容） | `Lanxi-鱼尾行书繁` | Lanxi-鱼尾行书繁.woff2 | 7.64MB |

### 0.1 已知外置字体别名（仅匹配实际存在文件 · 非必需注册表）

> 下表只用于“扫描到这个文件名时，用哪个友好 `font-family` 别名”。没有对应文件时不会显示；用户自己的其他字体无需加入此表即可使用。外置字体均由用户自行准备并确认授权。

| 风格 | 字体（font-family 名） | 相对路径（/fonts/ 之后） |
|---|---|---|
| 书法·皇家 | `Lanxi-瘦金书` | `方正所有字体/02/FZfonts/FZSZJW.TTF` |
| 书法·石刻 | `Lanxi-魏碑` | `方正所有字体/02/FZfonts/FZWBJW.TTF` |
| 书法·隶意 | `Lanxi-隶书` | `方正所有字体/02/FZfonts/FZLSJW.TTF` |
| 书法·狂草 | `Lanxi-行草` | `方正所有字体/02/FZfonts/FZXBSJW.TTF` |
| 书法·简牍 | `Lanxi-汉简` | `方正所有字体/02/FZfonts/FZHCJW.TTF` |
| 书法·铁筋 | `Lanxi-铁筋隶书` | `方正所有字体/02/FZfonts/FZTJLSJW.TTF` |
| 书法·手写 | `Lanxi-叶根友` | `bb1213/bb1213/叶根友特色简体升级版.ttf` |
| 书法·舒体 | `Lanxi-舒体` | `方正所有字体/02/FZfonts/FZSTJW.TTF` |
| 艺术·装饰 | `Lanxi-黄金时代` | `造字工房最全字体-2016-01-06更新/艺术字体/MFTheGoldenEra_Noncommercial-Bold.ttf` |
| 艺术·优雅 | `Lanxi-尚雅` | `造字工房最全字体-2016-01-06更新/艺术字体/MFShangYa_Noncommercial-Regular.ttf` |
| 艺术·几何 | `Lanxi-菱心体` | `常用字体/汉仪菱心体简.ttf` |
| 艺术·海报 | `Lanxi-海报体` | `常用字体/华康海报体W12(P).ttf` |
| 艺术·综艺 | `Lanxi-综艺` | `方正所有字体/02/FZfonts/FZZHYJW.TTF` |
| 极细·秀美 | `Lanxi-浪倩` | `造字工房最全字体-2016-01-06更新/艺术字体/MFLangQian_Noncommercial-Regular.ttf` |
| 书法·行书·繁 | `Lanxi-鱼尾行书繁` | `新增-2026-08-28/鱼尾书法行书-繁体.ttf`（繁体字库 · 须配繁体内容） |
| 书法·狂草 | `Lanxi-狂派手书` | `新增-2026-08-28/Aa狂派手书.ttf` |
| 书法·江湖 | `Lanxi-狂侠体` | `新增-2026-08-28/Aa狂侠体.ttf` |
| 篆书·游龙 | `Lanxi-游龙篆书` | `新增-2026-08-28/字魂游龙篆书(商用需授权).ttf` |
| 篆书·山北 | `Lanxi-山北篆体` | `新增-2026-08-28/依山北篆体.ttf` |
| 手写·自由 | `Lanxi-自由浪漫` | `新增-2026-08-28/自由浪漫体.ttf` |
| 手写·胶带 | `Lanxi-修正带灵感` | `新增-2026-08-28/香蕉修正带灵感体.ttf` |

### 0.3 @font-face 模板（直接抄）

```css
@font-face{font-family:'Lanxi-WenKai';src:url('/fonts/Lanxi-WenKai.woff2');}
#vcp-root .title{font-family:'Lanxi-WenKai','Lanxi-HeiTi',serif;}
```

### 0.4 注意
- 单帖最多 1-2 款艺术字体（woff2 子集 0.9-1.7MB，克制）；正文永远系统无衬线。
- 内置字体源存 `tools/font-src/`，改动后重跑 `tools/subset_fonts.py`。
- **皮肤覆盖对抗（技术铁律）**：maid-atelier 皮肤会注入带 `!important` 的全局字体覆盖（特异性 (0,2,0)），强制换消息区字体。对策：`font-family` 声明**必须加 `!important`** 且选择器以 `#vcp-root` 前缀（特异性 (1,1,0) 压过）；或加 `data-skin-chrome` 属性绕开。字号同理。⚠️**实测补充（2026-08-28 · 雨柬卡历史卡字号被压）：渲染器 boost 只给 `<style>` 文字声明加 `!important`，不改选择器特异性**——裸类选择器（如 `.num{font-size:86px!important}`）特异性仍是 (0,1,0)，会被皮肤 (0,2,0)!important 反压（`!important` 之间比特异性），字号/字体静默退回皮肤默认。**所有类选择器必须带 `#vcp-root` 前缀**（scopeVcp 替换后 (1,1,0) 胜出）；关键字号/字体的终极保险是**内联在元素 style 上**（parseOpen ref 锁定 → 内联 !important，最高优先级，任何皮肤都压不住）。⚠️⚠️**实测补充（2026-08-25 · 晚报卡四连问 · 渲染器自愈 v6.33d 落网）：「强调词显小」的真根因不是字面率，是 font-size 被皮肤 textRule 压制**——皮肤的 textRule 同时注入 `font-size` 与 `font-family`（均 !important）；类规则 boost 后 (1,1,0)!important 能保住「自己声明了字号」的元素（如 `.t{font-size:19px}`），但「没写 font-size 的强调词 span」只有**继承值——继承输给直接作用在元素上的皮肤规则**，强调词被压成皮肤字号。对策（渲染器已内建，AI 无需操心）：自愈层把 font-family / font-size / font-weight / font-style / line-height / letter-spacing 按属性锁 `inherit`（仅覆盖未显式声明的属性；color/text-align 不锁——颜色是 AI 设计、对齐是布局）。AI 侧铁律不变：**关键文字属性尽量显式声明**（自己声明 → boost 保护 → 稳赢皮肤）。

---

## 1. 色板参考（色纸卡 · 只查值）

> **默认基调（先生定调）**：浅纸底 + 墨色 + 明度即层级（lieflat）；深色系黑底 + 白字+对比撞色。
> 四色系（Mono / porcelain / palm / wire）与选色逻辑见 [EDITORIAL.md §1](./EDITORIAL.md)。

| 色板 | 基底 | 正文 | accent | 描边 |
|---|---|---|---|---|
| 暖纸书房 | `#faf6ef` | `#2b2b28` | `#8a6d3b` | `#e4dccb` |
| 终端绿幕（仅终端） | `#0d1117` | `#c9d1d9` | `#3fb950` | — |
| 胶片黄昏 | `linear-gradient(165deg,#1a0f0a,#3a1f14 55%,#5c2e1c)` | `#f4e9d8` | `#e0a458` | `rgba(224,164,88,.18)` |
| 青瓷素雅 | `linear-gradient(165deg,#eef4f1,#e3ede8 60%,#d7e4dd)` | `#2a3a33` | `#4e8a6e` | `#c8d8cf` |

### 1.5 声明式配色（可选 · 免写 hex · 渲染层色彩引擎代劳）

不想手写色值时，在根容器声明预设，渲染层自动生成整套 `--vcp-*` 色板变量 + 卡片基座（背景/文字色/内边距 20px/圆角 16px/边框），对比度与色域由引擎闭环保证（正文≥4.5:1）。子元素用 `var(--vcp-base)` / `var(--vcp-surface)` / `var(--vcp-border)` / `var(--vcp-text-primary)` / `var(--vcp-text-muted)` / `var(--vcp-accent-primary)` / `var(--vcp-code-bg)` / `var(--vcp-danger)` 取值；显式声明过的样式不会被覆盖。

```html
<div id="vcp-root" data-vcp-preset="editorial"><!-- 内容 --></div>
```

- 五大流派预设：`editorial`（编辑部）/ `chiaroscuro`（明暗法）/ `fauvism`（野兽派）/ `cyberpunk`（赛博）/ `wabi_sabi`（侘寂）；另有 `cyber-hacker` / `jiangnan-scholar`（江南书生）/ `void-prophet`（虚空先知）人格。
- 自定义：`data-vcp-mode="dark|light"`、`data-vcp-soul="色温K,愉悦度,激惹度,熵"`（如 `18000,-0.2,0.6,0.1`）、`data-vcp-accent="#00ff66"` 或色相角（如 `140`）。
- 依赖渲染层色彩引擎（浏览器经 /vendor 加载，未就绪时自动降级——根容器需自带 style 兜底）。

---

## 2. 中文排版（硬规则 · 先生骂过）

- **首行缩进**：正文自然段首行缩进 **2 汉字宽**（`text-indent: 2em`）；段间**不靠空行区分**、靠缩进（网页可加段距，缩进必须保留）。
- **字号阶梯**：正文 **14-15px（五号）**，小标题 **18-20px（四号~小三）＝比正文大 2 号**，大标题 **22-24px（二号~小一）**。
- **字级区分度（先生定调 · 2026-08-25 · 排版双轴之文字轴）**：完整阶梯 **主标题 > 副标题 > 正文 > 后记 > 装饰 > 其他**，逐级递减醒目度——主标题字体/大小/颜色必须贴合内容主题且比副标题醒目，后记弱于正文，来源行/装饰不得比正文抢眼。主/副/正文三大类**必须有字体上的区分**，不只靠字号：标题用楷书/衬线/艺术字体造主题感，正文永远系统无衬线，数字用衬线 `tabular-nums` 造精度（与 EDITORIAL「明度即层级」构成色彩+文字双轴）。
- **行距**：正文行高 **1.6-1.8**；标题 1.2-1.35。
- **对齐**：正文两端对齐（`text-align: justify`）；中文正文不居中（标题/诗歌除外）。
- **标点**：一律全角中文标点（，。！？「」……）；弯引号「」『』优先。
- **字距**：正文不加字距（`letter-spacing: 0`）；标题可略加 0.5-2px。
- **背题孤行**：小标题不与后段分离（标题+首段同块）；正文避免孤行。
- **中西混排**：英文/数字用半角，中西文之间加空格（如「iOS 与 Android」）。

---

## 3. 动笔三问 · 自检后置（克莉丝建议 · 琉璃五步修剪术）

审美与灵魂在动笔前已内化——灵魂三问见 BREATH.md §4，数据可视化契约见 EDITORIAL.md，装帧克制见 FRAMING.md。动笔时**只问三句**，答「是」即落笔，不自审税占据思路主干：

1. **主角清晰吗？**——一眼知道这卡在说什么。
2. **文字可读吗？**——对比度够，不糊。
3. **删掉装饰还成立吗？**——内容是空气，装饰是香水。

落盘后**只做一次勾选**（协议正文已精简为同款四条，此处为权威完整版）：
- vcp-root 内无空行（`\n\n`）；`<style>` 内无空行（`\n\n`）但**每条规则独立一行（`\n`）**——「无空行」≠「压成超长单行」，二者是两种完全不同的写法（先生实测 2026-08-28，详见安全铁律 6 之补充）。
- 无 backdrop-filter；交互只用 `onclick="input('...')"`；不写 `<script>`/外链脚本。
- 禁 `flex-wrap:wrap` 与 `margin:0 auto`（流式防抖）；SVG 必带 width/height+viewBox；SVG transform 动画配 `transform-box:fill-box`。
- 入场动画只用 opacity 淡入（禁 transform 位移与 animation-delay 错峰）；流式卡片尽量不带动画；CSS ≤ 约 200 行、类选择器 ≤ 12；HTML 语境图片用 `<img>` 不用 Markdown `![]()`。
- 根容器与设宽容器 `box-sizing:border-box`；`<style>` 写在根容器开标签后、内容之前；用过的类都有定义；深色容器内无白块亮块抢戏。

不为自检延长思考——勾选是确认「不崩」，不是评审「美不美」。

---

## 4. 安全铁律（权威完整清单 · 按需查阅）

> 协议正文只注入「动笔三问 + 落盘一勾」的精简版；本清单是**完整权威版**——需要细节时（如排查具体 bug）回来查，不要求逐条背。前 11 条违反必出 bug；渲染器自愈层已兜底的项标注「已兜底」，可放心降级为「了解」。

0. **输出纪律（最高优先级）**：视觉内容**直接输出 HTML 到回复正文**，由 GUI 自动渲染——这是 VCP 的唯一交付方式。**禁止**把 HTML 写入 .html 文件再丢路径/链接给用户（除非先生明确要求保存文件，此时正文仍须同步呈现核心内容）。「先生看不见的视觉」等于没做。
1. **vcp-root 内禁止空行**（`\n\n`）——markdown HTML 块遇空行即拆，背景只包顶部一条、下方溢出。子元素单换行或单行，分组用 margin。写完查 `\n\n` 次数为 0。⚠️**外空行、内无空行（先生实测 2026-08-28 · 雨柬卡溢出根因）**：卡片 HTML **与前文之间必须留空行独立成块**——若前置文字后只接单个换行，markdown 会把「前置文字 + 超长开标签」并进同一段落，流式解析期整段当纯文本吐出，表现为「卡片前面溢出大量代码」。对照实证：同款卡片前有空行 → 正常；单换行无空行 → 溢出。**规则：卡前必有空行、卡内绝无空行**。
2. **禁 backdrop-filter**——子背景用实色多层渐变（rgba 叠加 + 细描边 + 内高光）；`#vcp-root` 显式 `display:block;width:100%;box-sizing:border-box;overflow:hidden`。
3. **交互只放行 `onclick="input('...')"`**——不写 `<script>`/外链脚本/其他 `on*` 事件（安全白名单见 [VCP-INTERACTIONS.md](./VCP-INTERACTIONS.md)）。
4. **流式三规则**——① 开标签后**紧贴**首元素（勿换行/空格）；② `<style>` 写在 #vcp-root 开标签后、内容之前；③ 子块少换行。违反则整卡一次性展开、无流式。（协议正文已收敛为「落盘一勾」精简版）
5. **code 成对设色**——深容器「更深底 #0a1626 + 亮青 #bfe9ff」；浅容器「浅灰底 #f0f0ea + 深红 #b03a2e / 深蓝 #1f5fa8」。禁止只设一面。（部分已兜底：v6.32 自动修 code 字色；写对更稳）
6. **根容器 id 契约 + 开标签短小**——根容器**必须** `<div id="vcp-root">`（id 不是 class）：渲染层 `scopeVcp` 只认 `id="vcp-root"`，为每条消息分配唯一 id `vcp-msg-N` 并把消息内 `#vcp-root` 选择器全部替换为 `#vcp-msg-N`（v6.12 消息级样式隔离）。`class="vcp-root"` 或自定义根类名（如 `.rain-card`）不被作用域化——样式是全局规则、不锁定本消息，消息列表重挂载（离开页面再回来）时层叠/注入时序一变化就整卡掉格式（先生实测 2026-08-27）。配套三条：
   - **开标签只放短关键值**：背景色/字色/字体族/字号（`font-family` 必须内联，否则 `applyRootGuard` 兜底成系统无衬线并压过 style 规则）；长样式（多层渐变、圆角、内边距、行高、字距、布局）全部进 `<style>` 的 `#vcp-root` 规则（v6.19 流式补闭合机制让它们逐步生效）。**开标签长度 = 流式空窗期**——几百字符的 `background-image` 内联进开标签，流式早期整段空白/显示源码、背景要等开标签写完才出现（先生实测 2026-08-27：700 字符开标签空窗 29 帧，压到 130 字符后仅 6 帧）。⚠️**勘误补充（先生实测 2026-08-28 · 背景渐变排查三轮定位）**：开标签若内联了平色 `background`，会以 CSS 内联优先级**永远压住** `<style>` 里的渐变——「平色兜底」与「style 渐变」不可并存，渐变写了也白写（先生前几版正是此组合，渐变从未显示）。两种正确姿势：① **渐变直接内联开标签**（雨柬·山城酷热实证 · 多层渐变+天光叠加全部内联，必显）；② **开标签完全不写 background**，渐变全放 `<style>`（流式早期由 finalizeRoot 浅纸底兜底，style 输出后渐变接管）。严禁「平色内联 + 渐变 style」组合。
   - **选择器一律 `#vcp-root` 前缀**（特异性 (1,1,0) 压过皮肤覆盖）；禁止自定义根类名当唯一样式锚。
   - `<style>` 只放 @font-face/@keyframes 与类样式/根规则；根容器内联的短关键值在 style 块失效时兜住卡片骨架。
   - **style 书写格式：每条规则独立一行、规则短小**（如 `#vcp-root .note{display:inline-block;font-size:10px}`），行间无空行。**严禁把整个 style 压成几千字符的超长单行**——流式渲染期间超长行会被当纯文本吐出/解析错乱，表现为「卡片前溢出整段 CSS」或「反复闪动」（先生实测 2026-08-28：晚报卡单行 style 先溢出后闪动，改回多行逐条后稳定；同日「混沌嵌套测试」卡内满是无限循环动画仍稳定渲染，证明动画无罪、病根在 style 单行）。
7. **字号被皮肤压制**——内联 `!important`（`#vcp-root` 前缀）或 `transform:scale(1.3~1.5)`+`transform-origin:left center` 兜底；书法细体配 `text-shadow` 增重。（已兜底：v6.19 自动 important + parseOpen ref 锁定；本条为极端情况补充手段）
8. **容器内元素同明度域**——深色容器内的 code/徽章/按钮背景也须深色，禁白块亮块抢戏。
9. **入场动画只用 opacity 淡入**——禁用 transform 位移与 animation-delay 错峰（流式重挂载会重播位移）；流式卡片尽量不带动画，让内容「安静地长出来」（保守底：2026-08-28 实测动画本身可稳定渲染，但 opacity 淡入仍是流式期最稳、最不易被误判的选择）。
10. **CSS 规模上限**——CSS 总量 ≤ 约 200 行、类选择器 ≤ 12 个；用过的类必须定义；能用简写不拆长串（来自 GIT 版协议正文，2026-08-28 先生对比后确认恢复）。
11. **HTML 语境图片用 `<img>`**——表情/图片用 `<img src="...">`，不用 Markdown `![]()`（HTML 容器里不解析 Markdown 语法）。

---

## 5. 交互元素

> 交互元素（折叠 / 选项卡 / 手风琴 / 轮播 / 按钮）与渲染层安全白名单的唯一权威见 [VCP-INTERACTIONS.md](./VCP-INTERACTIONS.md)。

## 6. 故事装帧 · SVG 顶栏封面

> 叙事类回复（故事 / 小说 / 散文 / 书信 / 诗歌）可在卡片顶部加内联 SVG 小顶栏封面。
> 完整手册见 [FRAMING.md](./FRAMING.md)（怎么实现 + 骨架 + 风格示例，示例仅演示手法、禁止照搬）。

*—— 蓝汐 · 深蓝深海频道 · 美学是理解，不是模板 ——*
