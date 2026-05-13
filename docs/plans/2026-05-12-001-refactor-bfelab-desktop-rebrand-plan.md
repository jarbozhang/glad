---
title: "refactor: BFELAB 桌面端品牌改造"
type: refactor
status: active
date: 2026-05-12
deepened: 2026-05-12
---

# refactor: BFELAB 桌面端品牌改造

## 摘要

将 `packages/happy-app` 里的 Tauri 桌面端应用从 Happy 改造成 BFELAB，覆盖应用身份、打包元数据、可见 UI、logo/icon 资产、macOS 签名、安装和验收验证。实现时先创建独立分支，范围限定在桌面端；只有在构建准备签名时，才向用户索取 BFELAB 证书材料。

---

## 问题背景

当前桌面端构建在应用名、窗口标题、系统托盘、顶部标题、设置页/about 文案和图片资产上仍然显示 Happy。用户希望桌面端应用成为独立签名身份的 BFELAB，并移除可见界面中 “Codex and Claude Code mobile client” 这类移动端定位描述。

---

## 需求

- R1. 为 BFELAB 桌面端品牌改造创建并使用一个新分支。
- R2. 将 Tauri 桌面端应用身份改为 BFELAB，包括 production/dev/preview 的显示名、窗口标题和 BFELAB 专属 bundle identifier。
- R3. 将桌面端可见的 Happy logo、logotype、icon 替换为 BFELAB 资产，包括打包后的 Tauri icon。
- R4. 移除或改写桌面端可见的 slogan 和描述，尤其是 “Codex and Claude Code mobile client” 以及 Happy Coder 品牌露出。
- R5. 将顶部 app/header 品牌文本从 Happy 改为 BFELAB。
- R6. 审计桌面端 app 内部可见界面，尤其是设置页/about 区域，移除或重命名不必要的 Happy 相关露出。
- R7. 构建、安装并验证一个名为 BFELAB 的 macOS 桌面端包。
- R8. 使用 BFELAB 证书材料签发应用，并验证签名和 notarization 状态。

---

## 范围边界

- 本计划只针对 `packages/happy-app` 下的 Tauri 桌面端，不做整个 monorepo 的全局改名。
- CLI 命令名、后端包名、协议操作名、现有 server URL 和兼容性字符串保持不变，除非它们直接作为桌面端可见品牌露出。
- `packages/happy-app/Stores.md` 里的 App Store / Play Store 文案、`app.config.js` 里的移动端 bundle ID、移动端发布资产不属于本次桌面端改造范围，除非实现时确认它们会泄漏进桌面端构建。
- 桌面端品牌隔离是本计划的硬约束：共享 assets、translations、settings links、Expo mobile metadata 默认不得全局改成 BFELAB，必须通过 Tauri/desktop variant 选择 BFELAB。任何不可避免的 mobile/web 视觉或文案副作用，都必须作为显式用户确认项记录，不能作为实现细节悄悄发生。
- 历史 changelog 和测试夹具可以保留 Happy 引用，只要它们不会出现在桌面端 UI 或打包元数据里。
- BFELAB 签名证书、私钥、Apple 凭据、notarization secrets 不允许提交进仓库。

### 品牌共存原则

- Happy 只允许作为兼容性命令、协议、server/storage contract、现有 CLI help 语境出现，例如 `happy` CLI 或 `happy://` scheme。
- 如果桌面端仍可见 Happy 字符串，该字符串必须有清楚的兼容语境，不能表现为产品品牌、marketing、support、about、logo 或 logotype。
- BFELAB 桌面端的 welcome、header、settings/about、tray、窗口标题、bundle metadata、Dock/Finder icon 必须表现为 BFELAB。
- 最终交付需要列出仍保留的 Happy 可见引用及保留理由，便于确认它们是兼容性引用而不是品牌残留。

### 后续工作

- CLI 命令、deep link、server 文档、package 名、storage namespace 的全产品改名需要单独规划，因为这会影响兼容性和用户迁移。
- 如果 BFELAB 最终不只覆盖桌面端，官网、商店 listing、README marketing copy 和移动端品牌改造应作为单独品牌 rollout 处理。

---

## 上下文与调研

### 相关代码和模式

- `packages/happy-app/src-tauri/tauri.conf.json` 控制 production 桌面端的 `productName`、bundle `identifier`、窗口 `title`、构建命令、bundle target 和 Tauri icon 路径。
- `packages/happy-app/src-tauri/tauri.dev.conf.json` 和 `packages/happy-app/src-tauri/tauri.preview.conf.json` 覆盖 dev/preview 桌面端名称、identifier 和标题。
- `packages/happy-app/app.config.js` 是共享 Expo 元数据，但 Tauri 构建会经过 Expo web export，因此需要审计它对桌面端渲染名称、icon、favicon、HTML metadata 的影响，同时避免误改移动端 bundle ID。
- `packages/happy-app/src-tauri/src/tray.rs` 仍然在 tray tooltip 和 `Quit Happy` 菜单项中暴露 Happy。
- `packages/happy-app/sources/text/_default.ts` 和 `packages/happy-app/sources/text/translations/` 下所有翻译文件定义了欢迎页、sidebar/header 标题、settings/about footer 以及多个 Happy 品牌设置文案。
- `packages/happy-app/sources/components/SidebarView.tsx` 和 `packages/happy-app/sources/components/HomeHeader.tsx` 渲染 `t('sidebar.sessionsTitle')`，这是需要改成 BFELAB 的顶部/header 品牌文本。
- `packages/happy-app/sources/components/SettingsView.tsx` 渲染 logotype 图片、GitHub/privacy/terms 链接和 `settings.aboutFooter`，这是设置页品牌审计的主要目标。
- `packages/happy-app/sources/assets/images/logo-black.png`、`logo-white.png`、`logotype-dark.png`、`logotype-light.png`、`logotype*.png`、`icon.png`、`favicon.png` 是桌面端渲染界面会用到的共享品牌资产。
- `packages/happy-app/src-tauri/icons/` 包含打包桌面端 icon 集，包括 `icon.icns`、`icon.ico`、`32x32.png`、`128x128.png`、`128x128@2x.png`。
- `packages/happy-app/package.json` 已有 Tauri 脚本：`tauri:dev`、`tauri:build:dev`、`tauri:build:preview`、`tauri:build:production`。

### 项目经验

- 之前的桌面端计划 `docs/plans/2026-04-14-001-feat-tauri-desktop-native-plan.md` 明确了桌面端改动应尽量通过 Tauri 专用路径隔离，降低 mobile/web 回归风险。
- `packages/happy-app/CLAUDE.md` 要求所有用户可见字符串都走 `t(...)` 翻译系统，并且修改可见文案时要同步所有支持语言的翻译文件。
- 当前 checkout 没有 `docs/solutions/` 目录；相关项目经验来自已有计划和当前 package 约定。

### 外部参考

- Tauri macOS 签名官方文档：`https://tauri.app/distribute/sign/macos/`
- Tauri icon 生成官方文档：`https://tauri.app/develop/icons/`

---

## 关键技术决策

- 桌面端使用新的 BFELAB bundle identity：用户已选择新 app 身份，而不是保留 `com.slopus.happy`。production/dev/preview identifier 必须在 U2 修改配置前固定成最终三元组，不能把示例 identifier 写入可验收构建；如果 BFELAB 证书或 team 要求特定 reverse-DNS prefix，则以证书/team 约束为准。
- 保留协议、CLI 和 storage contract 中的兼容名称：可见 app branding 应改为 BFELAB，但 `happy://terminal?...`、`happy daemon status`、package-level `happy` 等字符串只有在本次桌面端构建也拥有对应外部契约时才改。
- BFELAB 资产必须桌面端隔离：Tauri 包 icon 替换 `src-tauri/icons/`；app 内 logo/logotype 新增 BFELAB 专用文件，并由 Tauri/desktop 选择逻辑使用，默认不覆盖 mobile/web 共享 Happy 资产。
- 继续使用翻译系统而不是在组件里硬编码 BFELAB：桌面端 BFELAB copy 应作为 i18n 结构里的 desktop 专用 key 或桌面专用选择逻辑输出，确保类型检查和多语言结构一致，同时保留 mobile/web 默认 Happy 文案。
- Tauri 构建需要桌面专用 Expo 变体：新增 `APP_TARGET=desktop` 或等价机制，让 Expo web export 只在桌面构建时输出 BFELAB name/favicon/HTML metadata，避免把 iOS bundle ID、Android package、associated domains 和移动发布资产一起改名。
- 从单一 BFELAB 源图生成 Tauri icons：使用 Tauri icon 生成流程填充 `src-tauri/icons/`，避免手工逐个尺寸编辑。
- 签名作为环境驱动的 release 工作处理：证书 identity、Apple/team 凭据和 notarization secrets 放在本地 Keychain 或受保护环境变量中，不提交秘密配置，也不输出到 shell history、构建日志、PR/交付说明或 artifacts。Tauri 支持通过 `bundle.macOS.signingIdentity` 或 `APPLE_SIGNING_IDENTITY` 使用本地 Keychain signing identity；CI/导入证书流程使用 `APPLE_CERTIFICATE` 和 `APPLE_CERTIFICATE_PASSWORD`；notarization 可使用 App Store Connect API 变量或 Apple ID 变量，Apple ID 路径需要 `APPLE_TEAM_ID`。

---

## 开放问题

### 规划阶段已解决

- Bundle identity 范围：用户选择 BFELAB 专属 bundle identifier，而不是继续使用 `com.slopus.happy`。
- 范围：用户明确说明前述 logo/slogan/name 改动都是桌面端 app 范围。
- 新 app identity 行为：本计划按 clean-install/new-identity 交付，不自动迁移旧 Happy identifier 下的 preferences、keychain entries 和 window state；如需迁移，单独规划。

### 推迟到实现阶段

- 精确的 BFELAB reverse-DNS identifier：U2 开始前需要确认 production/dev/preview 三个最终 identifier；如果只能拿到示例值，不能进入可验收构建。
- 精确的 BFELAB 源 logo 文件：实现可以把用户提供的参考图作为视觉方向，创建或导入高分辨率 BFELAB 源资产；最终打包前需要人工检查生成后的 app 内 logo 和 app icons 是否符合请求里的 BFELAB wordmark 方向。
- BFELAB 法律/支持入口：distribution-ready artifact 需要 BFELAB privacy、terms、support/feedback URL；如果实现阶段没有这些 URL，交付只能标记 local/test-only。
- 签名和 notarization 输入：实现到准备签名时，再请求 BFELAB Developer ID Application 证书 identity 和 Apple/notary 凭据。
- Notarization 可用性：最终验收要求 BFELAB Developer ID 签名；如果要分发 macOS artifact，还必须执行 notarization。若用户暂时无法提供 notarization 凭据，交付时必须明确标注 artifact 只是 local/test-only，而不是 distribution-ready。

---

## 实施单元

### U1. 创建 BFELAB 改造分支

**目标：** 为桌面端品牌改造创建专用分支，同时保留现有未提交的用户改动。

**需求：** R1

**依赖：** 无

**文件：**
- Modify: none
- Test: none

**方案：**
- 从当前 repo 状态创建一个清晰命名的分支，例如 `refactor/bfelab-desktop-rebrand`。
- 保留规划阶段观察到的 dirty worktree：`packages/happy-server/.env.dev` 和 `artifacts/`。
- 后续提交 rebrand 时不要 stage 无关改动。

**遵循模式：**
- 分支聚焦在 `packages/happy-app` 的桌面端品牌、构建和签名相关面。

**测试场景：**
- Test expectation: none -- 分支创建不改变 app 行为。

**验收：**
- 当前分支名体现 BFELAB 桌面端品牌改造。
- 现有无关用户改动仍然存在，且未被修改。

---

### U2. 更新 Tauri 桌面端应用身份

**目标：** 将打包后的桌面端应用命名为 BFELAB，并为 production/dev/preview 赋予 BFELAB 专属 bundle identifiers。

**需求：** R2, R7, R8

**依赖：** U1；U2 开始前必须确认 production/dev/preview 的最终 BFELAB bundle identifier 三元组。

**文件：**
- Modify: `packages/happy-app/src-tauri/tauri.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.dev.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.preview.conf.json`
- Modify: `packages/happy-app/app.config.js`
- Modify: `packages/happy-app/package.json`
- Modify: `packages/happy-app/src-tauri/Cargo.toml`
- Test: none

**方案：**
- 先记录最终 production/dev/preview identifiers，例如 `com.bfelab.desktop`、`com.bfelab.desktop.dev`、`com.bfelab.desktop.preview`，但不能把示例值当作可验收构建输入。
- 将 production `productName` 和窗口标题从 `Happy` 改为 `BFELAB`。
- 将 dev/preview 名称改为 BFELAB 变体，同时保留本地测试需要的环境区分。
- 将当前桌面端 identifiers 替换为 BFELAB 专属 identifiers，并保持各 variant 命名一致。
- 新增桌面构建维度，例如 `APP_ENV=production APP_TARGET=desktop pnpm exec expo export --platform web --output-dir dist`，并把 `src-tauri/tauri.conf.json` 的 `beforeBuildCommand` 或 `tauri:build:production` 脚本写成这个桌面专用命令。
- 审计 `app.config.js` 中会影响 Tauri 内 Expo web export 的 metadata，包括 app name、icon、favicon、slug、scheme、associated domains 和 mobile bundle/package IDs。`APP_TARGET === 'desktop'` 或等价条件只覆盖 Tauri web export 需要的 `expo.name`、`web.favicon`、桌面图标/HTML metadata；iOS `bundleIdentifier`、Android `package`、associated domains 和移动发布资产继续使用现有 Happy 配置。
- 更新会出现在 bundle metadata 中的 Cargo package metadata，但避免做 Rust crate 级别的无关 churn。
- 只有当 Tauri 机制要求提交非秘密 metadata 时，才加入签名相关非秘密配置；实际 identity 和 secrets 仍走环境或本地 Keychain。

**遵循模式：**
- `tauri.dev.conf.json` 和 `tauri.preview.conf.json` 现有 variant override 模式。
- `packages/happy-app/package.json` 现有桌面端构建脚本。

**测试场景：**
- Test expectation: none -- 这是打包 metadata，使用构建产物检查，而不是单元测试验证。

**验收：**
- 构建后的 production app metadata 显示 product name 为 `BFELAB`。
- 构建后的 production app bundle identifier 是 BFELAB 专属 identifier。
- `dist/index.html` title/metadata 与 Tauri `Info.plist` 都显示 BFELAB，但移动端 bundle ID、Android package 和 associated domains 没有被 BFELAB 桌面改造顺带修改。
- Dev 和 preview 构建不再在标题栏或 app metadata 中显示 Happy。

---

### U3. 替换桌面端 Logo、Logotype、Icon 和 Favicon 资产

**目标：** 用 BFELAB 资产替换可见和打包的 Happy 品牌图片，包括 macOS 显示的 app icon 和 app 内 header/settings logo。

**需求：** R3, R5, R7

**依赖：** U1

**文件：**
- Audit only: `packages/happy-app/sources/assets/images/logo-black.png`
- Audit only: `packages/happy-app/sources/assets/images/logo-white.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype@2x.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype@3x.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-dark.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-dark@2x.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-dark@3x.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-light.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-light@2x.png`
- Audit only: `packages/happy-app/sources/assets/images/logotype-light@3x.png`
- Audit only: `packages/happy-app/sources/assets/images/icon.png`
- Audit only: `packages/happy-app/sources/assets/images/favicon.png`
- Audit only: `packages/happy-app/sources/assets/images/favicon-active.png`
- Modify: `packages/happy-app/src-tauri/icons/32x32.png`
- Modify: `packages/happy-app/src-tauri/icons/128x128.png`
- Modify: `packages/happy-app/src-tauri/icons/128x128@2x.png`
- Modify: `packages/happy-app/src-tauri/icons/icon.icns`
- Modify: `packages/happy-app/src-tauri/icons/icon.ico`
- Modify: `packages/happy-app/src-tauri/icons/icon.png`
- Create: `packages/happy-app/sources/assets/images/bfelab-logo-black.png`
- Create: `packages/happy-app/sources/assets/images/bfelab-logo-white.png`
- Create: `packages/happy-app/sources/assets/images/bfelab-logotype-dark.png`
- Create: `packages/happy-app/sources/assets/images/bfelab-logotype-light.png`
- Create: `packages/happy-app/sources/assets/images/bfelab-favicon.png`
- Test: none

**方案：**
- 将用户提供的 BFELAB 视觉方向作为桌面端可见品牌方向，替换当前桌面端 surface 上的 Happy logotype 和 compact logo。
- 默认保留共享 Happy 资产不改；新增 BFELAB 专用 app 内资产，并在 desktop/Tauri UI 中通过 `isTauri()`、`APP_TARGET=desktop` 或等价 helper 选择这些文件。
- 不覆盖 `logo-*`、`logotype-*`、`icon.png`、`favicon*` 共享文件，除非实现能证明该文件只服务桌面端，或用户明确接受 mobile/web 也发生品牌变化。
- 保留现有 UI 对透明背景、light/dark variant、tintable logo 的需求。
- 从高分辨率 BFELAB 源图生成 Tauri icon 集，保证 macOS `.icns`、Windows `.ico` 和 PNG 尺寸一致。
- 修改 `SettingsView`、`SidebarView`、`HomeHeader`、`HeaderLogo` 和欢迎页的资产选择逻辑：Tauri/desktop 选择 BFELAB 专用资产，mobile/web 继续选择现有 Happy 资产。
- 建立视觉验收矩阵，覆盖 Dock/Finder/app bundle icon、tray、header/sidebar、welcome、settings/about、favicon 在 light/dark 下使用的 BFELAB 资产、期望品牌文本或 mark、最小可读尺寸、背景要求和截图证据。

**视觉验收矩阵：**
| Surface | 期望结果 | 证据 |
|---------|----------|------|
| Dock/Finder/app bundle icon | 使用 BFELAB icon，浅/深系统外观下可识别 | Finder/Dock 截图和 app bundle icon 截图 |
| Header/sidebar | 显示 BFELAB 文本或 wordmark，mobile/web 不被改名 | light/dark 截图，mobile/web 默认路径抽查 |
| Welcome | 移除移动端 client 定位，显示 BFELAB 桌面端口径 | welcome 截图和 active desktop translation 搜索 |
| Settings/about | 无 Happy marketing/support/about/logo 露出；缺 BFELAB URL 时隐藏外部链接 | settings 截图和 link 列表 |
| Favicon/web export | Tauri desktop export 使用 BFELAB favicon，移动端/web 默认配置不被覆盖 | `dist/index.html` / favicon 检查 |

**遵循模式：**
- 现有组件结构和 `isTauri()`/平台判断模式，避免把 desktop-only rebrand 变成全局 UI 重构。
- Tauri 官方从单一源图生成 icon 的流程。

**测试场景：**
- Test expectation: none -- raster 资产替换通过视觉检查和打包产物检查验证。

**验收：**
- App 内 header、sidebar、settings、welcome 品牌图片显示 BFELAB，而不是 Happy。
- 构建并安装后，macOS Finder/Dock/app bundle icon 显示 BFELAB。
- Light 和 dark theme 下 BFELAB 资产都清晰可读。
- 非装饰性品牌图片提供 “BFELAB” 可访问名称；装饰性重复 logo 对屏幕阅读器隐藏。
- 200% 缩放和较窄桌面窗口下，header、settings、welcome 的 BFELAB 文本或图片不裁切、不重叠。

---

### U4. 改写可见文案并移除移动端定位

**目标：** 将桌面端品牌露出里的 Happy/Happy Coder 改为 BFELAB，并从欢迎页/about 等 surface 移除 “Codex and Claude Code mobile client” 描述。

**需求：** R4, R5, R6

**依赖：** U1

**文件：**
- Modify: `packages/happy-app/sources/text/_default.ts`
- Modify: `packages/happy-app/sources/text/translations/en.ts`
- Modify: `packages/happy-app/sources/text/translations/ru.ts`
- Modify: `packages/happy-app/sources/text/translations/pl.ts`
- Modify: `packages/happy-app/sources/text/translations/es.ts`
- Modify: `packages/happy-app/sources/text/translations/ca.ts`
- Modify: `packages/happy-app/sources/text/translations/it.ts`
- Modify: `packages/happy-app/sources/text/translations/pt.ts`
- Modify: `packages/happy-app/sources/text/translations/ja.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hans.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hant.ts`
- Modify: desktop brand selection helper or affected desktop-rendered components
- Test: none

**方案：**
- 保留共享/mobile/web 默认翻译值作为 Happy 文案，新增 desktop 专用 BFELAB keys 或桌面端选择逻辑，让 Tauri desktop 渲染 BFELAB 文案。
- 不直接覆盖 `sidebar.sessionsTitle`、`welcome.title`、`settings.aboutFooter` 等共享 key 的 mobile/web 默认值；如果必须复用同一 key，则需要先确认该 key 在当前构建只服务桌面端。
- 桌面端 welcome/header/settings 使用统一口径：BFELAB 是桌面端 AI coding session 控制应用，兼容现有 `happy` CLI，不新增未经确认的功能或市场承诺。
- 桌面端移除 “Codex and Claude Code mobile client” 这类移动端定位。
- 桌面端 `settings.aboutFooter` 默认移除；如果需要 replacement copy，只使用上述统一口径。
- 审计并改写设置页可见字符串，例如 “Happy Coder account”、“Happy default”、“Happy server”、“Happy Session ID”。如果这些是品牌露出则改写；如果是协议或兼容标签则保留。
- 保留指导用户运行现有 `happy` CLI 命令的兼容/help 文案，除非本次也修改 CLI contract。

**遵循模式：**
- `packages/happy-app/CLAUDE.md` i18n 规则：所有用户可见文案走 translations，并保持所有语言文件结构一致。
- 沿用现有 translation object shape；新增 desktop 专用 key 时同步所有语言文件，避免 TypeScript 和 runtime lookup 结构漂移。

**测试场景：**
- 正常路径：默认 English locale 在欢迎标题、sidebar/header 标题、settings/about copy 中显示 BFELAB。
- 正常路径：简体中文和日文翻译文件在 BFELAB 值更新后仍保持相同 translation object shape。
- Edge case: mobile/web 默认 translations 仍保持 Happy 文案，除非有显式用户确认允许全局品牌改造。
- Edge case: 仍然需要写 `happy` 的 CLI 兼容文案没有被改成不存在的命令。

**验收：**
- TypeScript 接受所有翻译文件的现有 `TranslationStructure`。
- 对 active desktop UI translations 做文本搜索后，不再有 welcome/about/header/settings 的 Happy 品牌露出。
- 对 mobile/web 默认 translation path 做抽查，确认没有被 BFELAB 桌面改造顺带重命名。
- “Codex and Claude Code mobile client” 这句不再出现在 active desktop UI translations 中。

---

### U5. 审计桌面端 UI Surface 和链接

**目标：** 清理桌面端 screen 中剩余的 Happy 显示露出，尤其是设置页，同时避免误改协议或服务 contract。

**需求：** R4, R6

**依赖：** U3, U4

**文件：**
- Modify: `packages/happy-app/sources/components/SettingsView.tsx`
- Modify: `packages/happy-app/sources/components/SidebarView.tsx`
- Modify: `packages/happy-app/sources/components/HomeHeader.tsx`
- Modify: `packages/happy-app/sources/components/HeaderLogo.tsx`
- Modify: `packages/happy-app/sources/app/(app)/index.tsx`
- Modify: `packages/happy-app/app.config.js`
- Modify: `packages/happy-app/src-tauri/src/tray.rs`
- Test: `packages/happy-app/sources/sync/tauriTray.test.ts`

**方案：**
- 审查所有 active desktop-rendered components 中对 logo/logotype 资产和品牌链接的引用。
- 将 tray tooltip 和 quit 菜单改为 BFELAB。
- 桌面端 settings/about group 默认保留 version item，以及具备功能性的 account/security controls。
- 未提供 BFELAB URL 时，桌面端隐藏 GitHub、issue-report、privacy、terms 等外部 Happy 链接并移除 aboutFooter，避免混合 Happy/BFELAB 品牌；不要在本次桌面端改造中移除 mobile/web 的法律或支持访问入口。
- 如果要交付 distribution-ready BFELAB artifact，必须提供 BFELAB 所属的隐私、条款和支持/反馈入口；若这些入口尚未准备好，最终交付只能标注为 local/test-only，不能把隐藏链接的包称为可分发版本。
- 提供 BFELAB URL 后，桌面端 settings 只显示 BFELAB 链接，按固定顺序排列：version、privacy、terms、support/feedback、GitHub/repository（如适用）。
- 确保顶部/header 的 BFELAB 文本来自 desktop translation path，而不是组件硬编码。
- 保持 UI route 和组件结构不变，让本次仍然是品牌改造，而不是导航重构。

**遵循模式：**
- `SettingsView.tsx` 现有 `ItemGroup` 组织方式。
- `src-tauri/src/tray.rs` 现有 Rust tray menu builder 模式。

**测试场景：**
- 正常路径：tray 菜单 label 使用 BFELAB，并仍然为 show、new session、quit、session navigation 发出相同 tray actions。
- 正常路径：Settings about group 不再显示 Happy Coder copy 或 Happy repository details。
- Edge case: 移除/隐藏设置链接不会移除 version item，也不会破坏 developer-mode multi-click 行为。
- Edge case: settings 链接和按钮键盘焦点顺序保持可用。

**验收：**
- 对 active `packages/happy-app/sources` 文件做桌面端 UI 文本搜索后，只剩下有意保留的兼容/protocol `happy` 引用。
- 桌面端 settings 页面显示 BFELAB 品牌，且不再显示不必要的 Happy marketing/support links。
- Distribution-ready artifact 不隐藏法律/支持入口；如果缺 BFELAB URLs，则交付状态明确标记为 local/test-only。
- Tray tooltip 和 quit 菜单显示 BFELAB。

---

### U6. 构建、安装、签名并验证 BFELAB 桌面端 App

**目标：** 产出可安装的 macOS BFELAB 桌面端应用，用 BFELAB 证书材料签发，并验证安装后的 artifact。

**需求：** R7, R8

**依赖：** U2, U3, U4, U5

**文件：**
- Modify: `packages/happy-app/src-tauri/tauri.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.dev.conf.json`
- Modify: `packages/happy-app/src-tauri/tauri.preview.conf.json`
- Modify: `packages/happy-app/app.config.js`
- Modify: `packages/happy-app/package.json`
- Test: none

**方案：**
- 打包前运行现有 typecheck 和测试套件。
- 使用 U2 定义的桌面专用 Expo/Tauri 构建路径构建 production app，确保 web export 和 Tauri bundle 都处于 `APP_TARGET=desktop` 或等价桌面变体。
- 如果本机尚未安装 BFELAB 证书输入，则在此阶段请求用户提供。可能需要的输入包括：Keychain 中的 Developer ID Application certificate identity、Apple team identifier、Apple ID 或 App Store Connect API notarization 凭据，以及必要的 signing password 或 keychain unlock 步骤。
- 通过 Tauri/macOS 支持的环境变量或非秘密配置完成签名配置。不要提交证书文件、密码、API key 或私钥，也不要把这些值写进命令行参数、shell history、构建日志、PR/交付说明或 artifacts。
- 本地安装构建出的 `.app` 或 `.dmg`，验证系统可见名称、bundle identifier、icon、窗口标题、tray 文案和 app signature。
- 验证签名时必须核对预期 Team ID、Developer ID Application identity、certificate chain 和 bundle identifier；如果 identity 与 BFELAB/team 约束不匹配，视为 release blocker。
- BFELAB 本轮按 clean-install/new-identity 交付：验证首次启动、登录/账号恢复或 CLI 连接路径可以完成，并在交付说明中明确旧 Happy identifier 下的 preferences、keychain entries 和 window state 不会自动迁移。
- 如果使用 Developer ID Application 证书做 App Store 外分发，notarization 应纳入同一 release 验证；Tauri macOS 文档把 notarization 视为该证书路径下的分发要求。
- R8 只有在 signed-and-notarized 状态才算完成；如果还缺 BFELAB 证书或 notary 输入，交付状态必须是 blocked/partial local-test-only，不能关闭 R8。
- 对最终交付 artifact 做 notarization 绑定验证：记录 notarization submission id，执行并验证 stapling，并用 Gatekeeper assessment 检查同一个最终 `.app` 或 `.dmg`，不能只检查中间产物。

**遵循模式：**
- U2 更新后的 `pnpm --filter happy-app tauri:build:production` 桌面专用打包路径。
- Tauri 官方 macOS signing 和 notarization 文档。

**测试场景：**
- Integration: BFELAB 改造后构建 production desktop package，会产出名为 BFELAB 的 macOS artifact。
- Integration: 安装后的 app 能启动，并在系统/app UI surface 中显示 BFELAB。
- Error path: 如果缺少 BFELAB signing identity，build/sign 阶段应清晰请求所需证书 identity，而不是静默 fallback 到 unsigned release。
- Integration: code signature verification 报告预期的 BFELAB/Developer ID signing identity。
- Integration: clean install 后首次启动、登录/账号恢复或 CLI 连接路径可完成，并且用户不会被误导为旧 Happy 本地状态已自动迁移。
- Error path: 如果 notarization 凭据缺失，artifact 只标记为 local/test-only，R8 保持未完成。

**验收：**
- Typecheck 和相关测试通过。
- Tauri production build 完成。
- 安装后的 macOS app 以 BFELAB 打开。
- `Info.plist` metadata 包含 BFELAB display name 和 BFELAB 专属 bundle identifier。
- `dist/index.html` title/metadata、Tauri `Info.plist` 和最终 artifact 名称都显示 BFELAB。
- macOS signature verification 对已签名 app 通过，并且 Team ID、Developer ID Application identity、certificate chain 和 bundle identifier 与 BFELAB 预期一致。
- 分发级 artifact 已 notarized、stapled，并且 Gatekeeper assessment 对最终 `.app` 或 `.dmg` 通过。
- 如果缺少 BFELAB 证书、notary 凭据或 BFELAB 法律/支持入口，交付状态明确为 local/test-only 或 blocked，不能标记为 R8 完成。

---

## 系统级影响

- **交互图：** Active desktop UI components 通过 desktop brand selection layer 消费 BFELAB translations 和 image assets；mobile/web 继续消费现有共享 Happy translations 和 image assets；Tauri packaging 消费改名后的 metadata 和重新生成的 icon set。
- **错误传播：** 签名失败是 release blocker，应清楚说明缺少的 BFELAB certificate 或 notary 输入。
- **状态生命周期风险：** 修改 bundle identifier 会创建新的 macOS app identity；旧 Happy identifier 下的 app preferences、keychain entries 和 window state 不一定自动迁移。
- **API surface parity：** CLI commands、server URLs、deep-link scheme 和 protocol names 保持不变，除非明确识别为桌面端可见品牌。
- **集成覆盖：** 单元测试无法证明打包后的 app name、icon、signature 或安装行为；必须做真实 Tauri production build 和 macOS artifact 检查。
- **不变约束：** 现有 authentication、sync、encryption、session、voice、server connection 行为不应因本次品牌改造发生功能变化。

---

## 风险与依赖

| 风险 | 缓解 |
|------|------|
| BFELAB bundle identifier 与 Apple team/certificate capability 不匹配 | 最终签名前确认精确 reverse-DNS identifier，并同步调整 dev/preview/production identifiers。 |
| 新 bundle identifier 导致旧本地 app 数据不可直接访问 | 本次将 BFELAB 视为新 app identity；如需数据迁移，单独规划。 |
| 翻译改写误把 CLI 指令改成不存在的命令 | 审计时区分可见产品品牌和兼容性命令文本。 |
| 共享 `packages/happy-app` 资产或翻译影响 web/mobile 外观 | 默认不覆盖共享 Happy 资产/translation keys；使用 desktop brand selection layer；提交前记录任何不可避免的共享副作用并请求用户确认。 |
| Expo/Tauri 构建变体错误导致 mobile metadata 被改名 | U2 引入 `APP_TARGET=desktop` 或等价维度，并验收 `dist/index.html` 与移动 bundle/package metadata 分离。 |
| 签名 secrets 泄漏进 git、日志或交付说明 | 只使用 Keychain/protected environment setup；检查 git diff、终端摘录、CI logs 和 artifacts 不包含证书文件、密码、base64 证书、API key 或 Apple 凭据。 |
| 缺少 notarization 凭据导致无法分发 | U6 请求 notary 凭据；signed-and-notarized 才满足 R8，缺凭据时只能交付 local/test-only 或标记 blocked。 |
| 缺少 BFELAB 法律/支持入口导致 distribution-ready artifact 信任不足 | U5/U6 要求分发级 BFELAB artifact 提供 BFELAB 隐私、条款和支持/反馈入口；否则标记 local/test-only。 |

---

## 文档 / 运维说明

- 实现者只应在签名步骤、构建已准备好时，向用户索取 BFELAB 证书材料。
- 如果证书尚未安装，用户大概率需要在 macOS Keychain 中安装 BFELAB Developer ID Application 证书，并提供精确 signing identity 字符串。
- 如果需要 notarization，还需要 Apple notary 凭据。可接受输入为 App Store Connect API 凭据（`APPLE_API_ISSUER`、`APPLE_API_KEY`、`APPLE_API_KEY_PATH`），或 Apple ID 凭据（`APPLE_ID`、app-specific `APPLE_PASSWORD`、`APPLE_TEAM_ID`）。这些只能通过本地环境或 Keychain 机制提供，不能提交。
- 所有签名和 notarization 命令必须避免在 shell history、终端摘录、CI logs、PR 描述、交付说明和 artifacts 中暴露证书密码、base64 证书、Apple ID 密码、API key 或私钥。
- 最终交付应包含构建 artifact 路径、签名状态、notarization 状态、Gatekeeper assessment 结果、clean-install 验收结果、BFELAB 法律/支持入口状态，以及任何因兼容性有意保留的 Happy 可见引用。

---

## 来源与参考

- 相关桌面端需求：`docs/brainstorms/2026-04-14-tauri-desktop-native-requirements.md`
- 相关桌面端计划：`docs/plans/2026-04-14-001-feat-tauri-desktop-native-plan.md`
- Tauri base config：`packages/happy-app/src-tauri/tauri.conf.json`
- Tauri dev config：`packages/happy-app/src-tauri/tauri.dev.conf.json`
- Tauri preview config：`packages/happy-app/src-tauri/tauri.preview.conf.json`
- Tauri tray code：`packages/happy-app/src-tauri/src/tray.rs`
- App translations：`packages/happy-app/sources/text/_default.ts`
- Settings surface：`packages/happy-app/sources/components/SettingsView.tsx`
- Header/sidebar brand surface：`packages/happy-app/sources/components/SidebarView.tsx`
- Tauri macOS signing docs：`https://tauri.app/distribute/sign/macos/`
- Tauri icon docs：`https://tauri.app/develop/icons/`
