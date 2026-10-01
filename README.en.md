# dsh-raw-html

Adds VCP HTML rendering to DeepSeek Harness. When enabled, model output containing `<div id="vcp-root">...</div>` is rendered as a real interface instead of HTML source text.

Supports SVG, Mermaid, KaTeX, bundled fonts, interactive buttons, and an optional Trusted Mode.

**[简体中文](./README.md)**

## Gallery

![Banner 1](docs/images/banner-1.jpg)
![Banner 2](docs/images/banner-2.jpg)
![Banner 3](docs/images/banner-3.jpg)
![Banner 4](docs/images/banner-4.jpg)
![Banner 5](docs/images/banner-5.jpg)

## Changes from upstream 0.6.0

- **DeepSeek Harness 0.1.2-alpha.1 support**: VCP rendering now uses the official `conversation.chat.node / assistant-step` slot instead of modifying `dsh-web-frontend/dist`.
- **Works with DSH Desktop load order**: the plugin waits for a late `assistant-step` registration before installing its renderer.
- **Native Settings page**: on DSH builds that provide `settings.section`, plugin configuration appears directly in DSH Settings instead of using a separate composer-side settings popover.
- **Native rendering stays intact**: plain Markdown continues to use the official DSH Assistant renderer; only `#vcp-root` content enters the VCP Shadow DOM.
- **Trusted Mode no longer depends on the legacy bundle patch**: the modern plugin path directly supports script, iframe, WebGL, fetch, and related capabilities.
- **Legacy DSH remains supported**: the original patch path is retained only as a compatibility fallback.

## Install

> This version has not yet been merged upstream. Install from `j955229/dsh-raw-html` branch `refactor/official-assistant-slot`.


### DSH Desktop 2.0.4

> **If an older `dsh-raw-html` is already installed: fully quit DSH Desktop from the tray, run `dsh plugin remove dsh-raw-html`, then install this branch. Replacing a plugin while Windows still has the old package loaded can fail with `ERR_PNPM_EPERM`.**

DSH Desktop 2.0.4 ships DeepSeek Harness 0.1.2-alpha.1. Open **DSH Terminal** from DSH Desktop, confirm the active Profile shown at the top (the default is `desktop`), then run:

```powershell
dsh plugin add "github:j955229/dsh-raw-html#refactor/official-assistant-slot"
```

Inside the DSH Desktop terminal, a `dsh plugin` command **without `--profile` targets the currently active Desktop profile**. `--profile web` targets the Web profile instead, not the active Desktop profile.

Then:

1. Fully quit and restart DSH Desktop.
2. Open **Settings → VCP Rendering**.
3. Enable **Render HTML**. Enable **Aesthetic injection** only when you also want the agent to proactively use the VCP visual style.

### DSH Web / CLI profile

```powershell
dsh plugin --profile web add "github:j955229/dsh-raw-html#refactor/official-assistant-slot"
```

Restart the DSH service and refresh the browser.

### Update

Current DSH Desktop profile:

```powershell
dsh plugin update dsh-raw-html
```

Web profile:

```powershell
dsh plugin --profile web update dsh-raw-html
```

Restart DSH after updating.

## Usage

On DeepSeek Harness 0.1.2-alpha.1 / DSH Desktop 2.0.4, all plugin settings live under **Settings → VCP Rendering**:

- **Render HTML** controls VCP HTML rendering.
- **Aesthetic injection** controls style, palette, font, and framing guidance.
- **Trusted Mode** controls advanced capabilities such as `script`, `iframe`, WebGL, and `fetch`.
- **Aesthetics** manages styles, palettes, font previews, and external font folders.

Plain Markdown continues to use the native DSH renderer. Only content containing `#vcp-root` is handled by the VCP renderer.

Interactive VCP buttons can use:

```html
onclick="input('reply text')"
```

to fill the composer and send the reply.

### Aesthetics and fonts

Open **Settings → VCP Rendering → Aesthetics** to lock, edit, or create styles.

The font picker now lists only fonts that are actually available:

- bundled fonts appear automatically;
- **Choose font source** now uses the plugin's unified browser, showing folders and supported font files in one list; select either one to mount it, and double-click folders to enter them;
- users may also enter a font folder or a single font file path manually;
- every mounted font source is listed separately and can be unmounted with its `✕` button;
- folders are scanned recursively for `.ttf / .otf / .woff / .woff2 / .ttc`, and individual font files can also be mounted directly;
- fonts do not need to be pre-registered in `DESIGN.md`;
- mounted folder structure does not need to match the author's machine;
- missing fonts are not shown as selectable options;
- an old style that references a now-missing font is shown as unavailable but the missing font is not re-added to the picker.

Known mappings in `DESIGN.md` are now only optional friendly aliases applied when a matching font file is actually present. They no longer define the picker inventory.

Font preview is preview-only. Font categories in the style editor affect future generations and do not rewrite existing VCP content.

## Compatibility

DeepSeek Harness **0.1.2-alpha.1** uses the official `conversation.chat.node` / `assistant-step` slot and **does not require frontend bundle patching or the patch installer**.

DeepSeek Harness **0.1.1-rc.x and earlier** continue to use the legacy patch:

```powershell
$dir = Join-Path $HOME "dsh-plugins\dsh-raw-html"
node "$dir\patch\install-all.cjs"
```

The legacy installer modifies the old DSH frontend bundle. DeepSeek Harness 0.1.2-alpha.1 should not use it.

## Trusted Mode

Trusted Mode is disabled by default and is integrated into **Settings → VCP Rendering**. The separate bottom-right floating badge is no longer used.

When enabled, it relaxes HTML restrictions and allows model-generated content to use capabilities such as `script`, `iframe`, `object`, `embed`, WebGL, and `fetch`.

**Enabling Trusted Mode allows model-generated page code to execute in your local browser context. Enable it only when you fully trust the model output and its content sources.**

`javascript:` URLs remain blocked.

## Uninstall

DSH Desktop:

```powershell
dsh plugin remove dsh-raw-html
```

DSH Web / CLI profile:

```powershell
dsh plugin --profile web remove dsh-raw-html
```

If you previously used the legacy patch on an older DSH build, also restore the frontend bundle from the backup created by the installer.
