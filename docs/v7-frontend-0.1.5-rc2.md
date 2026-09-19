# v7 代前端适配（dsh-web-frontend 0.1.5-rc.2+）

> 最后更新：2026-09-20
> 适用：`@deepseek-ai/dsh-web-frontend` **0.1.5-rc.2 及以后**（react-markdown 风格渲染器）
> 入口：`patch/install-v7.cjs` · 自检：`tests/verify-v7.cjs`

## 1. 为什么需要这一代

`install-v6.cjs` 的两个锚点组覆盖到 `rc.8 / 0.1.1-rc.x`：

| 代际 | 目标前端 | 锚点特征 |
|---|---|---|
| 旧锚点组 | `rc.5~rc.7` | `case"html":return n.value;` + `function vc(n,r)` + `hp()` 样式解析 |
| 新锚点组 | `rc.8 / 0.1.1-rc.x` | `vc` 改名 `Xu`、`hp` 改名 `jd`（rc.8 为 `Sd`） |
| **本代（新增）** | **`0.1.5-rc.2+`** | 渲染器换代为 react-markdown 风格：`function B3(t,r,i){switch(t.type){…}}`，**旧锚点 0 命中** |

后果：`case"html"` 保持 `return t.value;`（直接返回源码字符串）→ 消息内的 HTML 卡片在界面上
一律显示为源码，插件等于失效。

## 2. 本代前端的关键结构（锚点表）

| 用途 | 锚点 / 位置 | 说明 |
|---|---|---|
| markdown → React 渲染器 | `function B3(t,r,i){switch(t.type){…}` | `case"html"` 在**此处唯一**（另两处 `case"html"` 属纯文本提取器 `Or`/`On`，**不要动**） |
| HTML 片段 → React 元素 | `function c8(t,r){` 内的属性循环 | 原样：`for(const c of i.attributes)c.name==="class"?…:s[c.name]=c.value;` |
| 样式字符串 → 样式对象 | `function wg(t){…}` | camelCase 解析器（本代由 `c8` 调用） |
| 非流式（最终帧 / 历史）解析入口 | `function gg(t){return X5(t,{extensions:[J5(),o8(),mg(),pa()],mdastExtensions:[e6(),xa()]})}` | 唯一调用者 `Tg()` |
| **流式**解析入口 | 流式类 `update(t){if(this.cached!==null&&t===this.prevText)…}` | 内部 `this.parse()` → `ng(l8)`，**另一条路径** |
| React 命名空间 | 顶层 `var d=nc();`（= `react/jsx-runtime`） | 模块注入点须在 `c8` 之前（同作用域可见 `d`） |
| 完整 React | 顶层 `var I=P3();` | `c8` 用它 `createElement` |

## 3. 本代补丁做了什么（`install-v7.cjs`）

1. **注入 v6 稳定区模块**（复用 `patch/v6-inject.js`）到 `function c8` 之前 —— 模块把渲染器挂到 `window.__vcpStable`。
2. **`case"html"` 三态化**：`localStorage['dsh.rawHtml']` ≠ `"0"` 才渲染；异常/失败**回退为剥标签纯文本**
   （**绝不**把裸 HTML 串交给 React —— 那会连累整条消息被卸载）。
3. **属性循环适配**：`onclick="input('…')"` 桥接、`style` 走 `wg`、`href/src` 协议白名单、剥除其余 `on*`。
4. **解析器入口补回「卡内空行压缩」**（两处：`gg()` 与流式 `update()`）。
   CommonMark **type-6 HTML 块遇空行即结束** → 卡片会被 mdast **按空行拆成多个 html 片段**；
   实测浏览器里收到的是 `len=4~7` 的 `</div>` / `</b>` 孤片。
5. **孤片兜底**：解析时把含 `#vcp-root` 的**解析前文本**缓存到 `globalThis.__vcpCardText`；
   渲染时——纯闭合标签片段 `return null`（避免同一张卡被渲染 N 次）；
   「未闭合 vcp-root 片段」改用缓存的**整卡文本**渲染（离线实测：孤片单独渲染只能得到没有正文的"空壳卡"）。

## 4. 使用

```bash
node patch/install-v7.cjs                 # 自动探测 dsh-web-frontend dist bundle
node patch/install-v7.cjs <bundle.js>     # 指定 bundle
node patch/install-v7.cjs <bundle.js> --verify   # 只校验六特征
node tests/verify-v7.cjs                  # 三层自检（结构/行为/幂等），18 项
```

打完补丁：**重启 dsh 服务 → 浏览器 Ctrl+F5**（补丁只改磁盘 bundle，运行中的服务可能仍供应旧内容）。
若仍显示源码，点输入框旁「`</>`」切到「渲染 / ON」。

安全设计：**写前备份**（`*.bak-installv7-<时间戳>`）→ `node --check` 语法门 → 特征门 → 任一失败**自动回滚**。

## 5. 回归 fixture

| 文件 | 说明 |
|---|---|
| `fixtures/index-015rc2-source.js` | 0.1.5-rc.2 的**未适配** bundle（555,926 字节；可验证"前置条件：无渲染能力"） |
| `fixtures/index-015rc2-expected.js` | 打完 `install-v7.cjs` 的**参考产物**（660,489 字节；`--verify` 应全绿） |

`tests/verify-v7.cjs` 默认拿 `source` fixture 打补丁并三层自检；行为层若取不到 `@mixmark-io/domino`
会**明确跳过并告知**（不假装通过）。

## 6. 踩坑记录（写给后续维护者）

1. **两条解析路径**：只修 `gg()` 不够 —— **实时流式**渲染走流式类的 `update()`。本项目实测：
   只修前者时控制台持续刷孤片段（症状与"完全没修"几乎一样）。
2. **卡片内禁止空行**（出卡侧仍须遵守）：即使有兜底，也不要用空行排版卡内内容。
3. **补丁脚本不要依赖"是否已打过"的状态守卫**：本项目迭代中出现过"脚本报已应用、但钩子并未进包"——
   教训是**确定性替换 + 注入后逐字节读回**（本脚本即按此写）。
4. **不要用"生成脚本 → 写文件 → 再解析"的链路拼补丁代码**：多层转义会静默写坏正则（本项目踩过两次：
   `\\s` 被吃成 `s`、属性选择器引号失衡）。**在目标文件上做一次替换并逐字节校验**。
5. **回退要安全**：回退成"剥标签纯文本"而不是"返回源码串"。后者会把裸 HTML 交给 React，
   实测可导致**整条消息被卸载（界面空白，刷新才恢复）**——比原缺陷更严重。
6. **离线全绿 ≠ 线上可用**：模块渲染、真 React、真 bundle 全链通过，仍可能因宿主差异失败。
   排查时**尽早拿浏览器侧证据**（本项目为此内建了失败留痕日志），不要用推理替代取证。

## 7. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-09-20 | 建档：新增 v7 代适配（`install-v7.cjs`）+ 三层自检（`verify-v7.cjs`，18 项全绿）+ 源/参考 fixture；锚点表与六条踩坑记录。 |
