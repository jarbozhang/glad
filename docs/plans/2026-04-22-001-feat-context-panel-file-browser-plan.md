---
title: "feat: Add file browser to ContextPanel"
type: feat
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md
deepened: 2026-04-22
---

# feat: Add file browser to ContextPanel

## Overview

将桌面端右侧 ContextPanel 从占位符升级为功能完整的文件浏览器，支持文件树浏览、内容预览、以及本地与远程工作目录之间的文件上传/下载。

## Problem Frame

桌面端三栏布局中右侧 ContextPanel 目前是占位符。用户在聊天时需要频繁查看项目文件，当前只能通过路由跳转到 files/file 页面，中断聊天上下文。(see origin: docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md)

## Requirements Trace

- R1. 层级文件树，支持展开/折叠
- R2. 文件图标、文件名、大小等信息
- R3. 文件名搜索过滤
- R4. 面板内文件预览，代码带语法高亮
- R5. 二进制文件显示类型和大小，不渲染内容
- R6. 预览顶部显示路径，支持返回文件树
- R7. 本地文件上传到远程子文件夹
- R8. 通过 writeFile RPC 中转传输
- R9. 上传状态指示（loading spinner，因 RPC 无进度回调）
- R10. 远程文件下载到本地
- R11. 通过 readFile RPC 中转传输

## Scope Boundaries

- 只读预览，不支持编辑
- 不支持批量/拖拽上传下载
- 仅桌面端（Tauri），移动端保持现有 files 页面
- 不做大文件分片

## Context & Research

### Relevant Code and Patterns

- `ContextPanel.tsx` — 当前占位符，`React.memo()` 包裹，无 props
- `DesktopLayout.tsx` — 三栏布局，ContextPanel 在 300px 容器中，borderLeftWidth:1
- `files.tsx` — 已有 git status 文件列表，使用 `useGitStatusFiles`、`searchFiles`、`FileIcon`、`Item`
- `file.tsx` — 已有文件预览，使用 `sessionReadFile`、`SimpleSyntaxHighlighter`、`DiffDisplay`、`sessionFileCache`
- `ops.ts` — 已有 `sessionListDirectory`、`sessionGetDirectoryTree`、`sessionReadFile`、`sessionWriteFile`
- `storage.ts` — Zustand store，`sessionFileCache` 和 `applyFileCache`
- `suggestionFile.ts` — `searchFiles` 基于 ripgrep + Fuse.js 的模糊搜索
- `FileIcon.tsx` — `{ fileName, size? }` props
- `SimpleSyntaxHighlighter.tsx` — `{ code, language, selectable }` props
- `Item` / `ItemList` — 标准列表项组件

### Key Constraints

- ContextPanel 在 `<Slot/>` 外部，`useLocalSearchParams` 不可用。使用 `usePathname()` 解析 URL 获取 sessionId（`SessionsList.tsx` 已有此模式）
- 300px 宽度约束，文件路径需要截断显示
- 所有文件操作走 session RPC（WebSocket 中转），非本地文件系统
- 上传/下载需要 Tauri 原生文件对话框 — 当前未安装 `@tauri-apps/plugin-dialog` 和 `@tauri-apps/plugin-fs`
- ContextPanel 不会因路由变化而卸载/重新挂载，session 切换时必须用 `useEffect` 显式重置内部状态
- Tauri API 必须使用动态 `await import()` 条件导入（参考 `tauriNotifications.ts` 的 lazy-import 模式）
- 错误提示使用 `Modal.alert`（CLAUDE.md 禁止使用 React Native `Alert`）

## Key Technical Decisions

- **sessionId 获取**：在 ContextPanel 内部使用 `usePathname()` + 正则匹配从 URL 路径提取 sessionId。理由：`usePathname()` 在项目中已有先例（`SessionsList.tsx`），返回确定性的 URL 字符串，比 `useGlobalSearchParams()` 更可靠。不创建独立 hook，仅一个消费者。
- **文件树加载策略**：初始用 `sessionGetDirectoryTree(sessionId, path, 3)` 加载 3 层，深层目录展开时用 `listDirectory` 懒加载。平衡首次加载速度和可用性。
- **缓存复用**：复用现有 `sessionFileCache`（Zustand），避免维护两套缓存。
- **文件大小上限**：上传限制 10MB（base64 编码后 ~13.3MB），超过提示用户使用 CLI。
- **Tauri 插件**：新增 `@tauri-apps/plugin-dialog`（文件选择/保存对话框）和 `@tauri-apps/plugin-fs`（读写本地文件）。

## Open Questions

### Resolved During Planning

- **maxDepth 值**：设为 3，超过的目录用懒加载。理由：大多数项目 3 层足以看到主要结构，深层展开按需加载减少初始开销。
- **缓存策略**：复用 `sessionFileCache`。理由：缓存已有 TTL 和清理机制，ContextPanel 只是另一个消费者。
- **文件大小上限**：10MB。理由：base64 编码放大 33%，RPC 30s 超时，10MB 在大多数网络下足够。

### Deferred to Implementation

- **进度指示实现**：R9 要求上传进度，但 writeFile RPC 是一次性调用，没有进度回调。用 loading spinner 替代真实进度条。
- **sessionGetDirectoryTree 大目录排除**：远程端 handler（`registerCommonHandlers.ts`）确认无任何排除逻辑。实现时必须在请求前或 handler 中添加排除规则（node_modules、.git、.next、dist、build），否则 maxDepth=3 会返回数万节点导致超时或 OOM。这是前置条件，不是可选优化。
- **上传后文件树刷新策略**：全量重载 vs 局部刷新目标目录。优先尝试局部刷新（`listDirectory` 刷新目标目录并合并到树）。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
ContextPanel (300px)
├── Header: 搜索栏 + 上传按钮
├── FileTreeView (默认视图)
│   ├── 层级目录树
│   │   ├── 📁 src/ (可展开)
│   │   │   ├── 📁 components/
│   │   │   ├── 📄 index.ts  12KB
│   │   │   └── ...
│   │   └── 📄 package.json  2KB
│   └── 底部: 下载按钮 (选中文件时)
└── FilePreviewView (点击文件后)
    ├── 顶栏: ← 返回 | 文件路径 | 下载按钮
    ├── 内容: SimpleSyntaxHighlighter / 二进制提示
    └── (复用 sessionFileCache)
```

数据流：
- 浏览：`sessionGetDirectoryTree` → 本地状态 → 渲染树
- 懒加载：展开深层目录 → `sessionListDirectory` → 合并到树
- 预览：点击文件 → `sessionReadFile` → `sessionFileCache` → 渲染
- 上传：Tauri dialog.open() → Tauri fs.readFile() → base64 → `sessionWriteFile` RPC → 刷新树
- 下载：`sessionReadFile` RPC → base64 → Tauri dialog.save() → Tauri fs.writeFile()

## Implementation Units

- [ ] **Unit 1: Add Tauri dialog and fs plugins**

  **Goal:** 安装配置 Tauri 文件对话框和本地文件系统插件，为上传/下载提供原生能力。

  **Requirements:** R7, R10 (前置依赖)

  **Dependencies:** None

  **Files:**
  - Modify: `packages/happy-app/src-tauri/Cargo.toml`
  - Modify: `packages/happy-app/src-tauri/src/lib.rs`
  - Modify: `packages/happy-app/src-tauri/capabilities/default.json`
  - Modify: `packages/happy-app/package.json`

  **Approach:**
  - 添加 `tauri-plugin-dialog` 和 `tauri-plugin-fs` 到 Cargo.toml
  - 在 lib.rs 的 plugin 注册链中添加两个插件
  - 在 capabilities/default.json 中添加 `dialog:default`、`fs:allow-read-file`、`fs:allow-write-file` 权限（`fs:default` scope 太窄，只允许 app 数据目录；需要 allow-read/write 以访问用户通过 dialog 选择的任意路径）
  - 安装 npm 包 `@tauri-apps/plugin-dialog` 和 `@tauri-apps/plugin-fs`

  **Patterns to follow:**
  - 现有 `tauri-plugin-http`、`tauri-plugin-notification` 的注册方式

  **Test expectation:** none — 纯配置变更，通过 Tauri 构建验证

  **Verification:**
  - `pnpm build` / `cargo build` 无错误
  - 插件在 Tauri 运行时可用

- [ ] **Unit 2: ContextPanel shell with session context**

  **Goal:** 重构 ContextPanel 为功能性容器，解决 sessionId 获取问题，搭建搜索栏和视图切换骨架。

  **Requirements:** R3, R6

  **Dependencies:** None

  **Files:**
  - Modify: `packages/happy-app/sources/components/ContextPanel.tsx`

  **Approach:**
  - 在 ContextPanel 内部使用 `usePathname()` + 正则 `/session/([^/]+)` 提取 sessionId，无匹配时返回 null 显示空状态（参考 `SessionsList.tsx` 的 `usePathname` 用法）。不创建独立 hook — 仅一个消费者
  - 组件内部状态管理：当前视图（tree / preview）、选中文件路径、搜索关键词
  - `useEffect` 监听 sessionId 变化，重置所有内部状态（view、selectedFile、searchQuery、文件树数据）— ContextPanel 不因路由变化卸载
  - 无 session 时显示空状态提示
  - 搜索栏放在顶部，使用 `TextInput` + `theme.colors.input.*` 样式
  - 视图切换：文件树 ↔ 文件预览，通过内部状态控制

  **Patterns to follow:**
  - `files.tsx` 的搜索输入框样式和 debounce 逻辑
  - `SidebarView.tsx` 的容器布局模式
  - `SessionsList.tsx` 的 `usePathname()` 用法

  **Test scenarios:**
  - Happy path: 在 session 页面时，ContextPanel 正确获取 sessionId 并显示文件树
  - Edge case: 不在 session 页面时（如 settings），显示空状态
  - Happy path: 搜索框输入触发过滤
  - Edge case: session 切换时（URL 从 `/session/abc` 变为 `/session/xyz`），内部状态全部重置

  **Test file:** `packages/happy-app/sources/components/ContextPanel.test.tsx`

  **Verification:**
  - ContextPanel 在 session 路由下正确获取 sessionId
  - 非 session 路由下优雅降级

- [ ] **Unit 3: FileTreeView component**

  **Goal:** 实现层级文件树组件，支持展开/折叠目录和懒加载。

  **Requirements:** R1, R2, R3

  **Dependencies:** Unit 2

  **Files:**
  - Create: `packages/happy-app/sources/components/FileTreeView.tsx`
  - Test: `packages/happy-app/sources/components/FileTreeView.test.tsx`

  **Approach:**
  - Props: `sessionId`、`searchQuery`、`onFileSelect(path)`、`onUpload(targetDir)`
  - 初始加载：`sessionGetDirectoryTree(sessionId, '.', 3)` 获取前 3 层
  - 懒加载：展开超过 3 层的目录时调用 `sessionListDirectory`，将 `DirectoryEntry[]`（扁平列表）转换为 `TreeNode`（带 children 的递归结构）后合并到树状态。需要区分"未加载"和"空目录"两种叶节点状态
  - 树节点渲染：缩进(12px/层，上限 5 层=60px) + 展开箭头(目录) + `FileIcon` + 文件名(ellipsis 截断) + 大小(文件)
  - 键盘导航：Up/Down 移动焦点，Right 展开目录，Left 折叠或跳转到父级，Enter 打开文件预览。使用 `useGlobalKeyboard` 实现（仅 web/Tauri 生效）
  - 初始加载状态：ActivityIndicator 居中显示，直到 `sessionGetDirectoryTree` 返回
  - 懒加载展开状态：展开目录时立即显示单行 ActivityIndicator 子节点，RPC 返回后替换为实际内容
  - 搜索过滤：对已加载的树节点做本地字符串匹配（`name.includes(query)`），即时响应无网络延迟。不使用 `searchFiles` RPC — 已加载的 3 层树覆盖主要文件，不需要全量搜索
  - 上传按钮：hover 目录节点时显示上传图标（非始终可见，避免 300px 空间不足）
  - 文件大小格式化为 KB/MB
  - 300px 宽度下长文件名用 ellipsis 截断

  **Patterns to follow:**
  - `files.tsx` 中的文件列表项布局（`Item` + `FileIcon`）
  - `useGitStatusFiles` 的 stale-while-revalidate 数据获取模式

  **Test scenarios:**
  - Happy path: 加载并渲染 3 层文件树
  - Happy path: 点击目录展开/折叠子内容
  - Happy path: 点击文件触发 `onFileSelect`
  - Edge case: 空目录显示空状态
  - Edge case: 搜索模式切换到扁平文件列表
  - Error path: RPC 失败时显示错误提示
  - Happy path: 懒加载深层目录（展开第 4 层+）

  **Verification:**
  - 文件树正确渲染层级结构
  - 目录展开/折叠交互流畅
  - 搜索过滤结果准确

- [ ] **Unit 4: FilePreviewPanel component**

  **Goal:** 实现面板内文件预览，支持语法高亮和二进制文件处理。

  **Requirements:** R4, R5, R6

  **Dependencies:** Unit 2

  **Files:**
  - Create: `packages/happy-app/sources/components/FilePreviewPanel.tsx`
  - Test: `packages/happy-app/sources/components/FilePreviewPanel.test.tsx`

  **Approach:**
  - Props: `sessionId`、`filePath`、`onBack()`、`onDownload(path)`
  - 顶栏：返回按钮 + 文件路径（截断显示，按压/hover 时通过 Pressable 显示完整路径的 popover，因 React Native 无原生 tooltip）+ 下载按钮
  - 从 `sessionFileCache` 读取缓存（检查 `cachedAt` 是否在 TTL 内），无有效缓存时调用 `sessionReadFile`，避免与 `file.tsx` 页面重复请求同一文件
  - 缓存写入复用 `storage.getState().applyFileCache()`
  - 代码文件：`SimpleSyntaxHighlighter` 渲染，language 从文件扩展名推断
  - 二进制文件：显示文件类型图标 + 大小 + "Binary file" 提示
  - 加载中：skeleton 或 ActivityIndicator
  - 复用 `file.tsx` 中的 binary detection 逻辑（null bytes + non-printable threshold）

  **Patterns to follow:**
  - `file.tsx` 的文件内容加载和 base64 解码逻辑
  - `file.tsx` 的二进制检测逻辑
  - `useSessionFileCache` hook 的使用方式

  **Test scenarios:**
  - Happy path: 加载并渲染代码文件，带语法高亮
  - Happy path: 点击返回触发 `onBack`
  - Happy path: 点击下载触发 `onDownload`
  - Edge case: 二进制文件显示类型信息而非内容
  - Edge case: 缓存命中时直接渲染，不发 RPC
  - Error path: 文件读取失败显示错误信息
  - Edge case: 超大文件（>1MB 文本）渲染不卡顿

  **Verification:**
  - 代码文件带语法高亮正确渲染
  - 二进制文件不尝试渲染内容
  - 返回按钮回到文件树视图

- [ ] **Unit 5: Upload and download actions**

  **Goal:** 实现文件上传和下载功能，通过 Tauri 原生对话框选择文件。

  **Requirements:** R7, R8, R9, R10, R11

  **Dependencies:** Unit 1, Unit 3, Unit 4

  **Files:**
  - Create: `packages/happy-app/sources/hooks/useFileTransfer.ts`
  - Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

  **Approach:**
  - 自定义 hook `useFileTransfer(sessionId)` 封装上传/下载逻辑
  - **上传流程**：
    1. Tauri `dialog.open({ multiple: false })` 选择本地文件
    2. Tauri `fs.readFile(localPath)` 读取本地文件为 `Uint8Array`
    3. 转 base64 编码
    4. 检查原始文件大小 ≤ 10MB（通过 dialog 返回的文件元数据或 fs.stat()，在 readFile 之前检查），超过提示用户
    5. `sessionWriteFile(sessionId, remotePath, base64Content)` 写入远程
    6. 成功后触发文件树刷新回调
  - **下载流程**（注意：必须直接调用 `sessionReadFile` 获取原始 base64，不能从 `sessionFileCache` 取——缓存中存的是解码后的 UTF-8 文本，二进制文件存空字符串）：
    1. `sessionReadFile(sessionId, remotePath)` 获取原始 base64 内容（绕过缓存）
    2. Tauri `dialog.save({ defaultPath: fileName })` 选择保存位置
    3. base64 解码为 `Uint8Array`
    4. Tauri `fs.writeFile(localPath, content)` 写入本地
  - 状态：`uploading` / `downloading` boolean + 错误信息
  - 进度指示：因 RPC 无进度回调，用 loading spinner 表示"进行中"（非百分比进度条）
  - 成功反馈：上传成功后短暂 toast 提示 + 文件树刷新高亮新文件；下载成功依赖 OS save dialog 确认
  - 注意：`apiSocket.ts` 的 `emitWithAck()` 实际未配置 `ackTimeout`，socket.io v4 默认无超时。实现时需要在 RPC 调用层添加超时控制（如 `socket.timeout(30000).emitWithAck()`），否则大文件传输可能永远 hang
  - 条件导入：Tauri API 使用 `isTauri()` 守卫 + 动态 `await import()` 加载，模块级缓存导入结果。非 Tauri 环境 hook 返回 disabled 状态，隐藏上传/下载按钮
  - 错误提示使用 `Modal.alert`（不用 React Native `Alert`）

  **Patterns to follow:**
  - `tauriNotifications.ts` 的 lazy-import 和模块缓存模式
  - `useHappyAction` 的错误处理模式
  - `isTauri()` 条件检查

  **Test scenarios:**
  - Happy path: 上传文件到指定目录成功，文件树刷新
  - Happy path: 下载文件到本地成功
  - Edge case: 文件超过 10MB 时拒绝上传并提示
  - Error path: RPC 失败时显示错误信息
  - Error path: 用户取消对话框，操作静默终止
  - Edge case: 非 Tauri 环境下 hook 返回 disabled 状态

  **Verification:**
  - 文件成功在本地和远程之间传输
  - 错误和边界情况有明确用户反馈

- [ ] **Unit 6: Wire everything into ContextPanel**

  **Goal:** 将文件树、预览、上传/下载集成到 ContextPanel 中，完成端到端功能。

  **Requirements:** R1-R11 (集成)

  **Dependencies:** Unit 2, 3, 4, 5

  **Files:**
  - Modify: `packages/happy-app/sources/components/ContextPanel.tsx`
  - Modify: `packages/happy-app/sources/text/*.ts` (i18n 翻译文件)

  **Approach:**
  - ContextPanel 内部状态机：`{ view: 'tree' | 'preview', selectedFile: string | null, searchQuery: string }`
  - tree 视图渲染 `FileTreeView`，preview 视图渲染 `FilePreviewPanel`
  - 文件树点击文件 → 切换到 preview 视图
  - 预览返回 → 切换回 tree 视图
  - 上传按钮（目录节点旁）和下载按钮（预览顶栏）绑定 `useFileTransfer`
  - 添加所有用户可见字符串的 i18n 翻译（所有语言文件）
  - loading/error 状态的 UI 反馈

  **Patterns to follow:**
  - `files.tsx` 和 `file.tsx` 的组件组合方式
  - `SidebarView.tsx` 的容器样式

  **Test scenarios:**
  - Integration: 打开文件树 → 点击文件 → 进入预览 → 返回 → 回到文件树
  - Integration: 文件树中点击上传 → 选择文件 → 上传成功 → 树刷新
  - Integration: 预览中点击下载 → 选择位置 → 下载成功
  - Edge case: session 切换时重置面板状态
  - Edge case: 面板隐藏/显示时保持状态 — 需要将 `DesktopLayout` 中 ContextPanel 的条件渲染 `{contextVisible && <ContextPanel />}` 改为 `display:none` 方式，否则 toggle 会卸载组件丢失所有状态

  **Verification:**
  - 端到端流程：浏览 → 预览 → 上传/下载 全链路可用
  - 300px 宽度下布局不溢出
  - 所有文字有 i18n 翻译

## System-Wide Impact

- **Interaction graph:** ContextPanel 消费 sessionRPC 通道，与 files.tsx/file.tsx 共享 `sessionFileCache`。无新的副作用或回调链。
- **Error propagation:** RPC 失败在 ContextPanel 内部消化，显示错误提示，不影响聊天区域。
- **State lifecycle:** `sessionFileCache` 已有会话删除时的清理逻辑，ContextPanel 作为消费者无需额外清理。
- **API surface parity:** 移动端继续使用 files.tsx/file.tsx 路由页面，不受影响。
- **Unchanged invariants:** 聊天功能、左侧边栏、中心区域的行为不变。Zen mode 仍然隐藏 ContextPanel。
- **对话框方案共存：** 项目中已有 `rfd` crate 实现退出确认对话框，新增 `tauri-plugin-dialog` 后有两套方案共存。不阻塞当前实现。Follow-up: Unit 1 完成后创建 issue 将退出确认对话框从 `rfd` 迁移到 `tauri-plugin-dialog`，然后移除 `rfd` 依赖。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tauri dialog/fs 插件安装后可能与现有插件冲突 | 先单独构建验证，再集成 UI |
| `sessionGetDirectoryTree` 对大目录（含 node_modules）返回数据过大 | **前置条件**：在远程端 handler 添加排除规则（node_modules/.git/.next/dist/build），或在 RPC 请求中传 exclude 参数 |
| 300px 宽度下文件树层级缩进空间不足 | 限制缩进层级深度的视觉表达（超过 5 层不再增加缩进） |
| base64 编码大文件可能导致内存峰值 | 上传前用 fs.stat() 检查大小（≤10MB）；峰值内存约 40-50MB（原始+base64+加密副本），桌面端可接受 |
| RPC 实际无超时 | apiSocket `emitWithAck()` 未配置 ackTimeout，需要添加 per-call 超时 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md](docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md)
- Layout spec: `docs/layout-core.md`
- Related code: `packages/happy-app/sources/components/ContextPanel.tsx`, `packages/happy-app/sources/sync/ops.ts`
- Tauri v2 plugins: `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`
