# dsh-raw-html

为 DeepSeek Harness 提供 VCP HTML 渲染。开启后，模型输出的 `<div id="vcp-root">...</div>` 会在聊天中渲染为真实界面，而不是显示为 HTML 源码。

支持 SVG、Mermaid、KaTeX、内置字体、交互按钮，以及可选的 Trusted Mode。

**[English](./README.en.md)**

## 效果展示

![效果图 1](docs/images/banner-1.jpg)
![效果图 2](docs/images/banner-2.jpg)
![效果图 3](docs/images/banner-3.jpg)
![效果图 4](docs/images/banner-4.jpg)
![效果图 5](docs/images/banner-5.jpg)

## 相比原版 0.6.0 的变化

- **适配 DeepSeek Harness 0.1.2-alpha.1**：直接使用官方 `conversation.chat.node / assistant-step` slot 渲染 VCP，不再修改 `dsh-web-frontend/dist`。
- **兼容 DSH Desktop**：修复 `assistant-step` 晚注册时无法接管的问题，插件会等待官方 renderer 出现后再注册。
- **原生设置页**：在支持 `settings.section` 的 DSH 中，插件设置直接进入 DSH 的“设置”导航，不再依赖聊天输入框旁的独立设置弹窗。
- **普通消息不受影响**：普通 Markdown 继续使用 DSH 原生 Assistant renderer，只有 `#vcp-root` 进入 VCP Shadow DOM。
- **Trusted Mode 不再依赖旧 bundle patch**：现代路径直接在插件内支持 script、iframe、WebGL、fetch 等能力。
- **旧版 DSH 仍可用**：原有 legacy patch 保留，只作为旧环境兼容方案。

## 安装

> 当前版本尚未合并到原作者仓库，请从 `j955229/dsh-raw-html` 的 `refactor/official-assistant-slot` 分支安装。


### DSH Desktop 2.0.4

> **如果已经安装过旧版 `dsh-raw-html`：先从托盘完全退出 DSH Desktop，再执行 `dsh plugin remove dsh-raw-html`，然后再安装本分支。Windows 下直接覆盖正在加载的旧插件可能触发 `ERR_PNPM_EPERM`。**

DSH Desktop 2.0.4 内置 DeepSeek Harness 0.1.2-alpha.1。请从 DSH Desktop 打开 **DSH 终端**，确认终端顶部显示当前 Profile（默认是 `desktop`），然后执行：

```powershell
dsh plugin add "github:j955229/dsh-raw-html#refactor/official-assistant-slot"
```

在 DSH Desktop 自带终端里，**不带 `--profile` 的 `dsh plugin` 命令会安装到当前激活的 Desktop profile**。`--profile web` 会改到 Web profile，不是 Desktop 当前 profile。

安装后：

1. 完全退出并重新启动 DSH Desktop。
2. 打开 **设置 → VCP 渲染**。
3. 开启“渲染 HTML”；需要模型主动采用视觉排版时，再开启“美学注入”。

### DSH Web / CLI profile

```powershell
dsh plugin --profile web add "github:j955229/dsh-raw-html#refactor/official-assistant-slot"
```

然后重启 DSH 服务并刷新浏览器。

### 更新

DSH Desktop 当前 profile：

```powershell
dsh plugin update dsh-raw-html
```

Web profile：

```powershell
dsh plugin --profile web update dsh-raw-html
```

更新后重启 DSH。

## 使用

在 DeepSeek Harness 0.1.2-alpha.1 / DSH Desktop 2.0.4 中，插件设置已整合到 **设置 → VCP 渲染**：

- **渲染 HTML**：控制 VCP HTML 渲染。
- **美学注入**：控制风格、色板、字体与装帧规范注入。
- **可信模式**：控制 `script`、`iframe`、WebGL、`fetch` 等高级能力。
- **美学系统**：管理主题、色板、字体预览与外置字体库。

普通 Markdown 仍使用 DSH 原生渲染器。只有包含 `#vcp-root` 的内容会进入 VCP renderer。

插件也支持：

```html
onclick="input('回复内容')"
```

用于把按钮内容填入输入框并发送。

### 美学系统与字体

进入 **设置 → VCP 渲染 → 打开美学系统** 可锁定、编辑或新建风格。

字体列表只显示插件当前**实际可用**的字体：

- 插件内置字体会自动出现。
- **选择字体来源** 使用插件自己的统一浏览器，同时显示文件夹和支持的字体文件；选中哪一个就挂载哪一个，双击文件夹进入。
- 也可以手动填写字体目录或单个字体文件路径。
- 已挂载的每个字体来源都会单独列出，可随时点击 `✕` 取消挂载。
- 插件会递归扫描目录中的 `.ttf / .otf / .woff / .woff2 / .ttc`；单个字体文件也可直接挂载。
- 不要求字体事先写进 `DESIGN.md`，也不要求目录结构与作者一致。
- 不存在的字体不会出现在可选下拉框中。
- 如果已保存的旧风格引用了后来缺失的字体，只会标记为当前不可用，不会重新放回可选列表。

`DESIGN.md` 中的已知字体映射现在只用于：当实际扫描到同名字体文件时，为它保留较友好的既有别名；它不再决定字体下拉框里有什么。

字体预览只用于查看效果；编辑风格中的字体分类影响后续生成，不会修改已有 VCP。

## 兼容性

DeepSeek Harness **0.1.2-alpha.1** 使用官方 `conversation.chat.node` / `assistant-step` slot，**不需要修改 frontend bundle，也不需要运行 patch 安装器**。

DeepSeek Harness **0.1.1-rc.x 及更早版本**继续使用 legacy patch：

```powershell
$dir = Join-Path $HOME "dsh-plugins\dsh-raw-html"
node "$dir\patch\install-all.cjs"
```

Legacy patch 会修改旧版 DSH 的 frontend bundle。DeepSeek Harness 0.1.2-alpha.1 不应运行它。

## Trusted Mode

Trusted Mode 默认关闭，并已整合进 **设置 → VCP 渲染**，不再单独显示右下角悬浮徽章。

开启后会放宽 HTML 限制，允许模型输出中的脚本和嵌入内容使用 `script`、`iframe`、`object`、`embed`、WebGL、`fetch` 等能力。

**开启 Trusted Mode 等同于允许模型生成的页面代码在本地浏览器上下文中执行。只有在完全信任模型输出和内容来源时才应开启。**

`javascript:` URL 仍会被拒绝。

## 卸载

DSH Desktop：

```powershell
dsh plugin remove dsh-raw-html
```

DSH Web / CLI profile：

```powershell
dsh plugin --profile web remove dsh-raw-html
```

如果旧版 DSH 曾运行过 legacy patch，还需要按安装器生成的备份恢复被修改的 frontend bundle。
