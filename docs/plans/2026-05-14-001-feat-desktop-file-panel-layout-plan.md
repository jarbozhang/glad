---
title: "feat: 右侧新增文件目录 Tab"
type: feat
status: completed
date: 2026-05-14
---

# feat: 右侧新增文件目录 Tab

## 摘要

本计划只做一件事：在桌面端 session 右侧现有文件面板中新增 `文件目录` Tab，用来浏览当前 session 工作目录下的文件夹和文件。

现有 git 相关能力已经稳定，不作为本轮改造对象：

- 保留现有 `Changes` / git changes 行为，不改数据获取、点击逻辑、diff 展示、空状态和测试。
- 保留现有 `All Files` / git files 行为，不改数据获取、搜索、点击逻辑、文案、空状态和测试。
- 不把 git diff 或 git files 的预览行为迁移到新的右侧 detail。
- 不重命名现有 git tabs；如果以后要调整文案，单独做一个无行为变更的小任务。

本轮新增的 `文件目录` Tab 使用目录浏览数据源，而不是 git 数据源。它应复用旧 file panel 中基于 `sessionListDirectory` 的目录浏览能力，并让视觉风格尽量贴近当前右侧面板。

---

## 问题背景

当前右侧面板已有稳定的 git 视角：`Changes` 展示变更文件，`All Files` 展示 git 可枚举文件。它们经过测试且稳定，本轮不应为了新增目录浏览而重构。

缺失的是一个独立的项目目录入口：用户需要看到当前 session 工作目录下的文件夹和文件，包括未被 git 文件列表表达出来的目录结构。仓库里仍有 `FileTreeView` 相关目录浏览逻辑，可作为新 `文件目录` Tab 的能力来源。

---

## 需求

### 新增文件目录 Tab

- R1. 在现有右侧文件面板中新增 `文件目录` Tab。
- R2. 现有 `Changes` 和 `All Files` Tab 的行为、文案、数据源、点击逻辑、选中态和空状态保持不变。
- R3. `文件目录` Tab 的数据源必须是当前 session 工作目录的目录列举能力，不能复用 `git ls-files` 结果。
- R4. `文件目录` Tab 展示可浏览的文件夹和文件，支持目录展开/折叠。
- R5. `文件目录` Tab 的行高、字体、图标、hover/pressed、选中态、搜索框、loading、empty、error 状态应与现有右侧面板风格一致。
- R6. 默认 Tab 选择策略保持现状，不因为新增 `文件目录` 改变现有 git 用户进入 session 后的首屏体验。

### 文件目录行为

- R7. 初始加载当前 session 工作目录根目录。
- R8. 展开目录时懒加载子目录，避免一次性递归大仓库。
- R9. 搜索目录文件时可以复用 `sessionRipgrep --files` 路径；搜索行为只影响 `文件目录` Tab，不影响 `All Files` 的现有搜索。
- R10. 目录浏览默认排除 `.git`、`node_modules`、构建缓存等极大或无业务意义目录；排除列表必须集中定义并有测试覆盖。
- R11. 点击 `文件目录` 中的文件时，复用现有文件打开/预览入口；本轮不改变该入口当前是否覆盖聊天区。
- R12. 二进制文件、大文件、读取失败、session 离线等文件打开状态由现有文件预览入口处理；本轮只保证目录 Tab 不因目录读取失败而崩溃。

### 范围保护

- R13. 不修改 `getGitStatusFiles`、`getProjectFiles`、`AllFilesDiffView`、`InlineFileDiff` 的行为。
- R14. 不修改 `Changes` 文件点击后打开 diff 的现有行为。
- R15. 不修改 `All Files` 文件点击后打开文件预览的现有行为。
- R16. 不新增后端 RPC，不改变上传/下载传输协议。
- R17. 不实现文件编辑、保存、冲突处理或 `sessionWriteFile` 写路径。
- R18. 不实现上传/下载完整 UI、拖拽上传、进度条或本地保存对话框。
- R19. 当前 Vitest 配置只执行 `.test.ts` / `.spec.ts`，新增测试应落在可执行的 `.test.ts` helper/model 测试上。

---

## 不做项

- 不重命名 `All Files`。
- 不改 `Changes` / git changes 的实现。
- 不改 `All Files` / git files 的实现。
- 不移动 git diff 到右侧详情。
- 不移动 git files 的文件预览到右侧详情。
- 不新增 `SessionFilesWorkspace` 作为大范围状态重构，除非实现中证明没有更小改法。
- 不恢复旧的 `ContextPanel.tsx` / `DesktopLayout.tsx` 架构。
- 不改变移动端文件页面行为。
- 不改变右侧面板现有响应式宽度策略。
- 不实现文件编辑、上传、下载、拖拽上传或可拖拽调宽。

---

## 上下文与调研

### 相关代码和稳定边界

- `packages/happy-app/sources/components/FilesSidebar.tsx`：当前右侧文件面板，已有 `changes` / `allFiles` 两个模式。本轮只允许在其外壳中新增 `文件目录` Tab，不重写 existing git branches。
- `packages/happy-app/sources/sync/projectFiles.ts`：当前 `All Files` 数据源。本轮不修改。
- `packages/happy-app/sources/sync/gitStatusFiles.ts`：当前 `Changes` 数据源。本轮不修改。
- `packages/happy-app/sources/components/AllFilesDiffView.tsx`：当前全量 diff 视图。本轮不修改。
- `packages/happy-app/sources/components/InlineFileDiff.tsx`：当前 diff 组件。本轮不修改。
- `packages/happy-app/sources/components/FileViewPanel.tsx`：当前文件预览/编辑入口。本轮不改写其行为；如果需要新目录 Tab 点击文件，可复用现有打开入口。
- `packages/happy-app/sources/components/FileTreeView.tsx`：旧目录浏览能力，包含 `sessionListDirectory`、`sessionRipgrep`、排除目录、文件大小格式化、友好错误等 helper。
- `packages/happy-app/sources/components/FileTreeView.test.ts`：已有目录 helper 测试，可复用测试风格。
- `packages/happy-app/sources/sync/ops.ts`：已有 `sessionListDirectory`、`sessionRipgrep`、`sessionReadFile` 等 RPC 封装。本轮目录浏览使用 `sessionListDirectory` 和可选 `sessionRipgrep`，不新增 RPC。
- `packages/happy-app/vitest.config.ts`：当前 include 为 `sources/**/*.{spec,test}.ts`，不会执行 `.test.tsx`。

### 关键事实

- git 相关 tabs 稳定且已测试，应保护而不是重构。
- 新能力只缺 `文件目录` Tab。
- `文件目录` 的数据语义是文件系统目录，不是 git 文件列表。
- 目录 Tab 应复用当前右侧面板的视觉语言，但不应把旧 `FileTreeView` UI 原样嵌入造成视觉断层。

---

## 关键技术决策

- **最小变更优先。** 在现有右侧面板上新增一个 `文件目录` mode；现有 `changes` / `allFiles` 分支尽量不动。
- **不改 git 代码路径。** `Changes` 和 `All Files` 的数据源、回调、点击行为、diff/file preview 行为全部保持当前实现。
- **目录数据走 `sessionListDirectory`。** 这是新 Tab 和 git tabs 的核心区别；不能用 `git ls-files` 填充目录树。
- **目录 UI 对齐 `FilesSidebar`。** 目录行和状态样式跟当前右侧面板一致；只复用 `FileTreeView` 的数据/helper 能力。
- **文件点击复用现有打开入口。** 本轮不把文件预览位置作为目标，不引入新的右侧 detail workspace；如果现有入口打开 overlay，就保持 overlay。
- **测试重点放在新增目录逻辑和 git 回归保护。** 对 git tabs 不写新行为测试，只做轻量 regression smoke，确认新增 `文件目录` 没破坏现有 tabs。

---

## Tab 数据模型

| Tab | 数据源 | 本轮是否改动 | 点击文件 |
| --- | --- | --- | --- |
| `文件目录` | `sessionListDirectory` + lazy load；搜索可用 `sessionRipgrep` | 新增 | 复用现有文件打开入口 |
| `Changes` | 现有 git status storage / `getGitStatusFiles` | 不改 | 保持现有 diff 行为 |
| `All Files` | 现有 `getProjectFiles` / git files | 不改 | 保持现有文件预览行为 |

建议类型方向：

```ts
type SidebarMode = 'directory' | 'changes' | 'allFiles';
```

约束：新增 `directory` mode 不能要求重命名或迁移现有 `changes` / `allFiles` 语义。

---

## 生命周期与状态策略

| 触发 | `文件目录` Tab 行为 | git tabs 行为 |
| --- | --- | --- |
| `sessionId` 变化 | 清空目录树、搜索 query、展开状态，重新加载根目录 | 保持现有实现 |
| 切到 `文件目录` | 如果未加载则加载根目录；已加载则保留目录展开状态 | 不影响 |
| 从 `文件目录` 切走 | 保留目录展开状态和搜索 query，避免返回时丢上下文 | 不影响 |
| `fileDiffsSidebar` 关闭 | 右侧面板按现有逻辑卸载；目录 Tab 不保留跨关闭状态 | 保持现有实现 |
| 小屏/zen mode/隐藏右侧栏 | 不额外挂载目录读取副作用 | 保持现有实现 |
| session 离线或目录 RPC 失败 | `文件目录` 显示友好错误和 retry | 不影响 |

---

## 实施单元

### U1. 在现有右侧面板增加 `文件目录` Tab 壳

**目标:** 最小化扩展 `FilesSidebar`，新增 `directory` mode 和 tab 按钮，同时保持现有 `changes` / `allFiles` 分支稳定。

**需求:** R1, R2, R5, R6, R13, R14, R15, R19

**依赖:** None

**文件:**
- Modify: `packages/happy-app/sources/components/FilesSidebar.tsx`
- Modify: `packages/happy-app/sources/text/*`
- Test: `packages/happy-app/sources/components/filesSidebarTabsModel.test.ts`

**做法:**
- 将 `SidebarMode` 扩展为 `'directory' | 'changes' | 'allFiles'`。
- 在 tab row 中新增 `文件目录` 按钮。
- 保持 `changes` 和 `allFiles` 现有渲染分支、数据获取和回调不变。
- 默认 mode 保持当前行为，不因新增目录 Tab 自动切到 directory。
- 新增 `DirectoryTreeTab` 占位接入点；未实现 U2 前可显示 loading/empty placeholder。

**测试场景:**
- Happy path: 三个 tab 可渲染并切换到 `directory`。
- Regression: 默认 mode 仍是当前默认值。
- Regression: `changes` mode 仍渲染现有 changes tree。
- Regression: `allFiles` mode 仍渲染现有 All Files tab。

---

### U2. 实现 `DirectoryTreeTab` 目录浏览

**目标:** 新增目录浏览组件，使用 `sessionListDirectory` 展示当前 session 工作目录下的文件夹和文件。

**需求:** R3, R4, R5, R7, R8, R10, R12, R16, R19

**依赖:** U1

**文件:**
- Create: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Create: `packages/happy-app/sources/components/directoryTreeModel.ts`
- Modify: `packages/happy-app/sources/components/FilesSidebar.tsx`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**做法:**
- 使用 `sessionListDirectory(sessionId, '.')` 加载根目录。
- 目录节点展开时再调用 `sessionListDirectory(sessionId, dirPath)` 懒加载子目录。
- 复用或迁移 `FileTreeView` 中的纯 helper：目录 entry 转 node、排序、文件大小格式化、友好错误、排除目录。
- 排除目录列表集中定义，至少包含 `.git`、`node_modules`、`.next`、`dist`、`build`、`.expo`、`__pycache__`、`.cache`。
- UI 使用当前 `FilesSidebar` 的行、图标、缩进、选中态、loading、empty、error 风格。
- 不接入上传按钮、拖拽上传和 drop overlay。

**测试场景:**
- Happy path: 根目录 entries 转成目录树，目录排在文件前。
- Happy path: 展开目录时生成子目录加载请求。
- Edge case: 空目录显示一致的 empty 状态。
- Edge case: 排除目录不会进入普通目录树。
- Error path: timeout / target disconnected / RPC 失败转成友好错误。

---

### U3. 实现 `文件目录` 搜索

**目标:** 让 `文件目录` Tab 支持按路径搜索文件，不影响现有 `All Files` 搜索。

**需求:** R5, R9, R12, R19

**依赖:** U2

**文件:**
- Modify: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Modify: `packages/happy-app/sources/components/directoryTreeModel.ts`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**做法:**
- `文件目录` Tab 维护自己的 search query。
- 搜索 query 不和 `All Files` search query 共享。
- 空 query 显示目录树；短 query 显示提示；有效 query 使用 `sessionRipgrep --files` 或同等现有 RPC 能力。
- 搜索结果使用和目录文件行一致的视觉。
- 搜索失败显示 `文件目录` 专属错误，不影响 git tabs。

**测试场景:**
- Happy path: 有效 query 构造正确搜索参数。
- Happy path: 搜索结果转成文件行。
- Edge case: 短 query 不触发 RPC。
- Error path: 搜索失败显示友好错误。
- Regression: `All Files` 搜索 query 不受 `文件目录` 搜索影响。

---

### U4. 接入目录文件点击

**目标:** 用户点击 `文件目录` 中的文件后，复用现有文件打开入口，不改变 `All Files` 的点击行为。

**需求:** R11, R12, R15, R17, R19

**依赖:** U2

**文件:**
- Modify: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Modify: `packages/happy-app/sources/components/FilesSidebar.tsx`
- Modify: `packages/happy-app/sources/-session/SessionView.tsx`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**做法:**
- 给 `FilesSidebar` 增加独立的 `onDirectoryFilePress?: (filePath: string, size?: number) => void`。
- `DirectoryTreeTab` 文件行点击时调用 `onDirectoryFilePress`。
- `SessionView` 可将该回调接到现有 file open handler。
- 不修改 `onAllFilesFilePress`。
- 不修改 `handleSidebarFilePress`。
- 不修改 `AllFilesDiffView`、`InlineFileDiff`、`getProjectFiles`、`getGitStatusFiles`。

**测试场景:**
- Happy path: 点击目录文件传出 path 和 size。
- Regression: 点击 `All Files` 文件仍走 `onAllFilesFilePress`。
- Regression: 点击 `Changes` 文件仍走现有 diff handler。
- Edge case: 目录行只展开/折叠，不触发文件打开。

---

### U5. 验证与回归保护

**目标:** 证明新 `文件目录` Tab 可用，并且没有破坏现有 git tabs。

**需求:** R2, R5, R13, R14, R15, R19

**依赖:** U1-U4

**文件:**
- Test: `packages/happy-app/sources/components/filesSidebarTabsModel.test.ts`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**做法:**
- 跑新增 `.test.ts` helper/model 测试。
- 手动打开 mac 桌面端 app，确认右侧出现 `文件目录` Tab。
- 手动确认 `Changes` 和 `All Files` 既有路径仍可点击、显示和切换。
- 手动确认 `文件目录` 的 loading、empty、error、搜索、展开目录、点击文件。

**验证场景:**
- `文件目录` 能加载根目录。
- `文件目录` 能展开子目录。
- `文件目录` 搜索不会影响 `All Files` 搜索。
- `Changes` tab 行为保持当前稳定表现。
- `All Files` tab 行为保持当前稳定表现。
- 小屏/zen mode/feature toggle off 行为保持现状。

---

## 实施顺序

1. U1：先加 `directory` tab 壳，确保现有 git tabs 没被重构。
2. U2：实现目录树加载和懒加载。
3. U3：实现 `文件目录` 自己的搜索。
4. U4：接入目录文件点击，复用现有文件打开入口。
5. U5：跑测试和桌面端回归验证。

---

## 风险与缓解

- **误改稳定 git tabs：** 本轮最大风险是把 git changes/files 也卷进重构。缓解：明确禁止改 `getGitStatusFiles`、`getProjectFiles`、`AllFilesDiffView`、`InlineFileDiff`，并让 U1/U4 的 regression 验证覆盖现有 tab。
- **目录树性能风险：** 大仓库一次性递归会卡顿。缓解：根目录初始加载 + 子目录懒加载；搜索限制结果数量。
- **目录 UI 视觉断层：** 旧 `FileTreeView` UI 直接嵌入会和右侧面板不一致。缓解：只复用 helper/data 逻辑，渲染层贴近 `FilesSidebar`。
- **用户误解目录 Tab 是文件管理器：** 本轮不上传/下载/编辑。缓解：文案和空状态只表达“浏览/打开文件”，不暗示文件管理能力。
- **测试覆盖不足：** `.test.tsx` 当前不会跑。缓解：新增逻辑放到 `.test.ts` helper/model，桌面端交互用人工回归验证补齐。

---

## 验收标准

- 右侧面板新增 `文件目录` Tab。
- 现有 `Changes` Tab 行为保持不变。
- 现有 `All Files` Tab 行为保持不变。
- `文件目录` 使用 `sessionListDirectory` 浏览当前 session 工作目录，不依赖 git 文件列表。
- `文件目录` 可展开目录、显示文件、显示 loading/empty/error。
- `文件目录` 搜索不影响 `All Files` 搜索。
- 点击 `文件目录` 文件时复用现有文件打开入口。
- 不修改 git diff 和 git files 的核心代码路径。
- 新增 `.test.ts` 测试通过。
- mac 桌面端人工验证通过：`文件目录` 可用，`Changes` / `All Files` 回归正常。
