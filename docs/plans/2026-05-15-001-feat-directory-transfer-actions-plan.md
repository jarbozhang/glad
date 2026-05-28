---
title: "feat: Directory Tab 右键上传下载接入 transfer storage"
type: feat
status: completed
date: 2026-05-15
origin: docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md
---

# feat: Directory Tab 右键上传下载接入 transfer storage

## Summary

在桌面端右侧 `Directory` / `文件目录` tab 中恢复上传和下载能力，V1 只通过右键菜单触发，不增加顶部按钮。传输层必须复用当前分支历史中已有的 `file-transfer` staging 方案：客户端和远端 session 通过阿里云 OSS / S3 兼容桶交换文件，HTTP/RPC 只负责申请临时上传/下载 URL、触发远端 `curl`、清理临时对象。不要退回到直接 `sessionWriteFile` / `sessionReadFile` base64 RPC 作为 Directory 上传下载主路径。

---

## Problem Frame

当前右侧三 tab 面板里的 `Directory` tab 已经恢复目录浏览，但上传/下载入口缺失。旧桌面文件面板曾经支持上传/下载，并且为了解决跨洋远程访问慢、RPC payload 大、HTML/PPTX 中等文件触发 call stack 错误等问题，已经改成走 OSS/S3 兼容 transfer storage。合并 `glad` 后，相关 UI/transfer 模块在当前 HEAD 中出现漂移：`FileTreeView.tsx` 仍在，但 `useFileTransfer.ts`、`sync/fileTransfer.ts`、server `fileTransferRoutes.ts` 在当前工作树缺失或未注册。新 Directory tab 需要迁移并恢复这套能力。

---

## Requirements

- R1. `Directory` tab 中通过右键菜单上传：右键目录上传到该目录，右键空白区域上传到根目录。
- R2. `Directory` tab 中通过右键菜单下载：右键文件保存到本地，目录下载不支持。
- R3. V1 不增加顶部上传/下载按钮；如果右键入口可发现性不足，再后续补按钮或更多菜单。
- R4. `Changes` / `All Files` tab 的现有 git 行为、点击行为、diff/preview 行为保持不变，不接入 Directory 上传下载入口。
- R5. 上传和下载主路径必须走 `file-transfer` OSS/S3 staging：`/v1/file-transfer/inbound`、`/v1/file-transfer/outbound`、presigned PUT/GET、远端 `sessionBash` + `curl`。
- R6. 不把 Directory 上传下载改回直接 `sessionWriteFile` / `sessionReadFile` base64 RPC；这些 RPC 只保留给文本预览/编辑等已有用途。
- R7. 仅在桌面端/Tauri 环境启用本地文件选择和保存；非 Tauri 环境隐藏或禁用右键传输项。
- R8. 上传成功后刷新受影响目录；下载成功或失败有明确反馈，不影响当前目录展开状态。
- R9. 对 OSS/S3 未配置、远端缺少 `curl`、本地文件读写失败、用户取消 dialog、session 离线、对象清理失败等情况给出可理解反馈。
- R10. 上传到远端 workspace 时不静默覆盖已有文件；远端 `curl` 下载先写临时文件，再按安全策略落到目标路径。

**Origin actors:** 桌面端用户
**Origin flows:** 文件树浏览、文件上传、文件下载
**Origin acceptance examples:** 用户可在右侧面板浏览文件树、通过右键上传文件到远程目录、通过右键下载远程文件到本地

---

## Scope Boundaries

- 不支持目录下载、压缩下载、批量目录下载。
- 不支持上传文件夹；多文件上传可沿用历史 hook 能力，但本轮入口以右键选择本地文件为主。
- 不新增自定义分片协议；transfer storage 已通过 OSS/S3 presigned URL 规避大 payload 和跨洋慢链路问题。
- 不改变聊天附件 `attachments/request-upload`、`attachments/request-download` 协议；Directory 文件传输使用独立 `file-transfer` route。
- 不改变移动端 files 页面行为。
- 不改变 `Changes` / `All Files` 的数据源和 UI。
- 不实现文件删除、重命名、移动、复制。
- 不新增顶部按钮、hover 上传按钮或拖拽入口；这些作为后续可发现性/效率优化。

### Deferred to Follow-Up Work

- 顶部按钮或更多菜单入口：如果右键入口验证后不够明显，再补显式入口。
- 拖拽上传：旧 `FileTreeView` 有 drop overlay，可在 Directory tab 稳定后再迁移。
- 目录下载：需要压缩、递归、权限、进度和取消语义，单独设计。
- 真实进度条：当前 transfer storage 有大文件路径，但没有端到端进度事件；后续可增加上传/下载阶段进度展示。

---

## Context & Research

### Current Branch Facts

- 当前分支：`refactor/bfelab-desktop-rebrand`。
- 当前 HEAD 后的工作树中，`packages/happy-app/sources/components/FileTreeView.tsx` 仍存在，包含旧的 `onUpload` / `onUploadFiles` props、hover 上传和 drop 逻辑，可作为迁移参考。
- 当前 HEAD 中未找到 `packages/happy-app/sources/hooks/useFileTransfer.ts`、`packages/happy-app/sources/sync/fileTransfer.ts`、`packages/happy-server/sources/app/api/routes/fileTransferRoutes.ts`，且 `packages/happy-server/sources/app/api/api.ts` 当前只注册了 `attachmentRoutes`，没有注册 `fileTransferRoutes`。
- 历史提交 `81fcaca7 Add large file transfers and update default server` 新增了 `fileTransferRoutes.ts`、`sync/fileTransfer.ts`、`useFileTransfer.ts`。
- 历史提交 `d174541f Use transfer storage for medium uploads` 和 `ef37c3a8 Use transfer storage for all uploads` 将上传统一改为 transfer storage，避免中等 HTML/PPTX 和大文件走 inline/base64 RPC。
- 历史提交 `8338c99b fix(app): avoid preview RPC for large files` 修复了大文件预览不应走 RPC 的问题，Directory 下载不能依赖预览读取结果。
- `docs/deployment.md` 已记录阿里云 OSS / S3 兼容配置：`S3_HOST`、`S3_BUCKET`、`S3_PUBLIC_URL`、`S3_PATH_STYLE=false`，并指出 Aliyun OSS 需要 virtual-hosted-style URL。

### Relevant Code and Patterns

- `packages/happy-server/sources/storage/files.ts`：S3/OSS 兼容 client 配置，当前支持 `S3_PATH_STYLE`，供 transfer storage 复用。
- 历史 `packages/happy-server/sources/app/api/routes/fileTransferRoutes.ts`：提供 `/v1/file-transfer/inbound`、`/v1/file-transfer/outbound`、`DELETE /v1/file-transfer/:transferId`，生成 `transfers/{userId}/{transferId}/{fileName}` 临时对象的 presigned PUT/GET URL。
- 历史 `packages/happy-app/sources/sync/fileTransfer.ts`：封装 `createInboundFileTransfer`、`createOutboundFileTransfer`、`cleanupFileTransfer`。
- 历史 `packages/happy-app/sources/hooks/useFileTransfer.ts`：封装 Tauri dialog/fs/http、本地上传到 storage、远端 `curl` 下载到 workspace、远端 `curl --upload-file` 到 storage、本地下载保存。
- `packages/happy-app/sources/components/DirectoryTreeTab.tsx`：当前新目录 tab，负责 `sessionListDirectory`、搜索、展开、文件点击；需要在这里接右键菜单和 transfer action props。
- `packages/happy-app/sources/components/FilesSidebar.tsx`：右侧三 tab 容器；只应把 Directory transfer props 传给 `DirectoryTreeTab`，不要改 `Changes` / `All Files` 分支。
- `packages/happy-app/sources/-session/SessionView.tsx`：当前承接目录文件点击/预览；适合持有 `useFileTransfer(sessionId)` 并把 handler 传给 `FilesSidebar`。
- `packages/happy-app/sources/components/FileTreeView.tsx`：旧文件树的上传目标目录语义、drop 逻辑和测试工具函数可参考，但不要恢复 hover/按钮作为 V1 入口。
- `packages/happy-app/sources/components/FileViewPanel.tsx`：文件预览/编辑仍可用 `sessionReadFile` / `sessionWriteFile`，但不要把 Directory 上传下载实现成直接 base64 RPC。

---

## Key Technical Decisions

- **传输主路径是 OSS/S3 transfer storage。** Directory 上传下载必须恢复历史 `file-transfer` staging 方案，解决跨洋慢链路和 inline RPC payload 风险。
- **右键-only V1。** 目录/空白区域右键上传，文件右键下载；暂不增加顶部按钮、hover 上传按钮或拖拽入口。
- **附件 route 不等于 Directory transfer route。** `attachments/request-upload` 用于聊天附件加密 blob；Directory workspace 文件使用 `/v1/file-transfer/*` 临时对象和远端 `curl`。
- **远端落盘由 session 执行。** 本地上传时，客户端 PUT 到 OSS/S3 后，远端 session 用 `curl downloadUrl` 拉取到 workspace；本地下载时，远端 session 用 `curl --upload-file remotePath uploadUrl` 上传到 OSS/S3，客户端再 GET 保存。
- **不回退为上传 base64 RPC。** 上传不使用 `sessionWriteFile`，避免重现 HTML/PPTX call stack 和跨洋慢链路问题。
- **下载也优先 transfer storage。** 不从预览缓存取内容，不依赖 `sessionReadFile`；如保留历史兼容 fallback，必须限制在 storage 未配置的 dev/self-host 场景，生产 BFELAB 路径应走 transfer storage。
- **清理失败不阻断用户动作。** transfer 对象是 TTL 风格临时数据；`DELETE` 清理失败记录但不应把成功传输变成失败。

---

## Open Questions

### Resolved During Planning

- 是否走 `sessionReadFile` / `sessionWriteFile`？不走，Directory 上传下载主路径恢复 OSS/S3 transfer storage。
- 是否只做右键？是，V1 只右键，按钮后置。
- 是否复用聊天附件 route？不复用，使用独立 `file-transfer` route。
- 当前分支是否还保留完整 transfer 模块？没有，当前 HEAD 缺少 `useFileTransfer.ts`、`sync/fileTransfer.ts`、`fileTransferRoutes.ts`，需要从历史方案恢复/迁移。

### Deferred to Implementation

- 是否保留下载的 base64 fallback：建议只作为 self-host/dev 兼容，不作为 BFELAB 生产路径；实施时根据现有产品策略决定。
- 远端 `curl` 不存在时的提示文案和降级策略：V1 先报可理解错误，不引入新的 CLI RPC。
- 上传同名文件的远端冲突策略：V1 不静默覆盖；具体是否用 `curl --fail --output tmp && mv -n` 或显式 `test -e` 由实现时收敛。

---

## High-Level Technical Design

> This is directional guidance, not implementation code.

```mermaid
flowchart TB
    DirectoryTab[Directory tab right-click menu] --> TransferHook[useFileTransfer]
    TransferHook --> TransferAPI[/v1/file-transfer inbound/outbound]
    TransferAPI --> OSS[(Aliyun OSS / S3-compatible bucket)]
    TransferHook --> Tauri[Tauri dialog + fs + http]
    TransferHook --> Bash[sessionBash remote curl]
    Bash --> Workspace[remote session workspace]
    TransferHook --> Refresh[refresh affected directory]
    Refresh --> DirectoryTab
```

Upload:

1. 用户右键目录或空白区域，选择上传。
2. Tauri dialog 选择本地文件。
3. 客户端调用 `/v1/file-transfer/inbound` 获取 `uploadUrl` / `downloadUrl`。
4. 客户端把本地 bytes PUT 到 OSS/S3 `uploadUrl`。
5. 远端 session 通过 `sessionBash` 执行 `curl downloadUrl -> tmp -> targetPath`。
6. 成功后清理 transfer object 并刷新目标目录。

Download:

1. 用户右键文件，选择下载。
2. Tauri dialog 选择本地保存路径。
3. 客户端调用 `/v1/file-transfer/outbound` 获取 `uploadUrl` / `downloadUrl`。
4. 远端 session 通过 `sessionBash` 执行 `curl --upload-file remotePath uploadUrl`。
5. 客户端 GET `downloadUrl`，写入本地保存路径。
6. 清理 transfer object。

---

## Implementation Units

### U1. 恢复 server file-transfer routes

**Goal:** 恢复 OSS/S3 兼容 transfer storage 的服务端临时对象租约 API。

**Requirements:** R5, R6, R9

**Dependencies:** None

**Files:**
- Create: `packages/happy-server/sources/app/api/routes/fileTransferRoutes.ts`
- Create: `packages/happy-server/sources/app/api/routes/fileTransferRoutes.test.ts`
- Modify: `packages/happy-server/sources/app/api/api.ts`

**Approach:**
- 从历史 `81fcaca7` / `ef37c3a8` 迁移 `fileTransferRoutes.ts`，不要重新发明协议。
- 暴露 `POST /v1/file-transfer/inbound`、`POST /v1/file-transfer/outbound` 和 `DELETE /v1/file-transfer/:transferId`。
- 复用 `packages/happy-server/sources/storage/files.ts` 中的 `s3client`、`s3bucket`、`isLocalStorage`。
- transfer object path 使用 `transfers/{userId}/{transferId}/{safeFileName}`，DELETE 时校验 userId/transferId 前缀，避免跨用户删除。
- 当 S3/OSS 未配置时返回清晰 503：`Large file transfer storage is not configured`。
- 在 `api.ts` 注册 `fileTransferRoutes(typed)`。

**Test scenarios:**
- Happy path: inbound/outbound 返回 `transferId`、`uploadUrl`、`downloadUrl`、`objectName`、`expiresAt`。
- Edge case: local storage / 未配置 S3 时返回 503。
- Security: DELETE 不允许删除不属于当前 userId/transferId 前缀的对象。
- Edge case: 文件名包含 `/`、`\`、超长名称时被安全归一化。

**Verification:**
- server route 测试通过。
- 部署环境继续使用 `S3_PATH_STYLE=false` 支持 Aliyun OSS virtual-hosted-style URL。

---

### U2. 恢复 app transfer client 和 useFileTransfer

**Goal:** 恢复桌面端本地文件和远端 workspace 之间的 OSS/S3 staging 传输 hook。

**Requirements:** R1, R2, R5, R6, R7, R8, R9, R10

**Dependencies:** U1

**Files:**
- Create: `packages/happy-app/sources/sync/fileTransfer.ts`
- Create: `packages/happy-app/sources/hooks/useFileTransfer.ts`
- Create: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`
- Modify: `packages/happy-app/package.json`
- Modify: `packages/happy-app/src-tauri/capabilities/default.json`

**Approach:**
- 从历史 `ef37c3a8` 迁移 `sync/fileTransfer.ts` 和 `useFileTransfer.ts`，并适配当前 imports、path aliases、Tauri 依赖版本。
- `sync/fileTransfer.ts` 通过 `apiSocket.request` 调用 `/v1/file-transfer/inbound|outbound` 和 DELETE cleanup。
- `useFileTransfer(sessionId)` lazy-import Tauri dialog/fs/http，非 Tauri 返回 disabled。
- 上传使用 `createInboundFileTransfer`，本地 `fs.readFile` 后通过 Tauri HTTP/fetch PUT 到 `uploadUrl`，再用 `sessionBash` 执行远端 `curl downloadUrl` 写入目标路径。
- 下载使用 `createOutboundFileTransfer`，先让远端 `curl --upload-file remotePath uploadUrl`，再客户端下载 `downloadUrl` 并写入本地。
- shell 命令必须安全 quote 远端路径和 URL；远端落盘先写临时文件再移动。
- transfer cleanup 放在 finally；cleanup 失败静默或 warning，不覆盖主操作结果。
- 不在上传流程调用 `sessionWriteFile`。
- 下载流程不从 `FileViewPanel` cache 读取内容；生产路径不依赖 `sessionReadFile`。

**Test scenarios:**
- Happy path: 上传小文件、中等 HTML 文件、大文件都调用 transfer storage，不调用 `sessionWriteFile`。
- Happy path: 多文件选择逐个走 transfer storage，并在全部成功后触发 refresh。
- Happy path: 下载文件时远端 `curl --upload-file` 到 storage，客户端 GET 后写入本地，不调用预览缓存。
- Edge case: 用户取消 open/save dialog，静默返回。
- Error path: `Large file transfer storage is not configured` 显示明确错误。
- Error path: 本地 PUT 到 storage 失败、远端 `curl` 失败、本地 writeFile 失败，分别显示可理解错误。
- Security: 远端路径包含空格、引号、中文时 shell quote 正确。

**Verification:**
- `packages/happy-app/sources/hooks/useFileTransfer.test.ts` 覆盖 transfer storage 主路径。
- 手动验证 macOS Tauri：上传 HTML/PPTX、小文本、大 PDF；下载二进制文件。

---

### U3. 给 Directory tab 增加右键上下文菜单

**Goal:** 在新 `DirectoryTreeTab` 中提供右键-only 上传/下载入口。

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U2

**Files:**
- Modify: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Create: `packages/happy-app/sources/components/DirectoryContextMenu.tsx`
- Modify: `packages/happy-app/sources/components/directoryTreeModel.ts`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**Approach:**
- `DirectoryTreeTab` 增加 props：`onUploadDirectory?(targetDir)`、`onDownloadFile?(filePath)`、`transferEnabled?`、`transferState?`、`refreshKey?`。
- 目录行 `onContextMenu` 显示“上传到此目录”。
- 文件行 `onContextMenu` 显示“下载文件”。
- 空白区域 `onContextMenu` 显示“上传到根目录”。
- 菜单组件只做 UI 和 action dispatch，不直接 import Tauri、RPC 或 transfer API。
- 非 Tauri 或 transfer disabled 时隐藏/禁用上传下载菜单项。
- 菜单打开、点击外部、滚动或切换 tab 时关闭。
- 左键展开目录/打开文件的行为保持不变。

**Test scenarios:**
- Happy path: 右键目录行 -> 菜单含“上传到此目录”。
- Happy path: 右键文件行 -> 菜单含“下载文件”。
- Happy path: 右键空白区域 -> 菜单含“上传到根目录”。
- Edge case: 非 Tauri 环境不显示本地传输项。
- Regression: `Changes` / `All Files` tab 不渲染 Directory context menu。

**Verification:**
- 桌面端可以只通过右键完成上传/下载入口发现和触发。

---

### U4. 在 SessionView / FilesSidebar 中接入 transfer hook

**Goal:** 把 transfer hook 接到右侧三 tab 布局，同时隔离 git tabs。

**Requirements:** R4, R7, R8, R9

**Dependencies:** U2, U3

**Files:**
- Modify: `packages/happy-app/sources/-session/SessionView.tsx`
- Modify: `packages/happy-app/sources/components/FilesSidebar.tsx`
- Modify: `packages/happy-app/sources/components/filesSidebarTabsModel.ts`
- Test: `packages/happy-app/sources/components/filesSidebarTabsModel.test.ts`

**Approach:**
- `SessionView` 持有 `useFileTransfer(sessionId)`，把 `uploadFile`、`downloadFile`、`enabled`、`uploading/downloading` 传给 `FilesSidebar`。
- `FilesSidebar` 只在 `mode === 'directory'` 时把 props 传入 `DirectoryTreeTab`；`Changes` 和 `All Files` 分支不变。
- 上传成功后递增 Directory refresh signal；下载成功不刷新目录。
- 传输 pending 时在 Directory tab 内显示轻量状态，不阻塞 git tabs。
- 保持默认 sidebar mode 和现有文件点击/预览逻辑。

**Test scenarios:**
- Happy path: Directory mode 接收 transfer actions。
- Regression: Changes / All Files mode 不接收、不渲染 transfer actions。
- Edge case: sessionId 切换时 pending/refresh state 不串到旧 session。
- Error path: 上传失败后目录展开状态不被清空。

**Verification:**
- 上传后目标目录刷新，已展开目录尽量保持展开。
- 下载不覆盖主对话界面或 git diff 行为。

---

### U5. 国际化、错误反馈和状态文案

**Goal:** 补齐右键菜单、传输状态和错误提示文案。

**Requirements:** R3, R7, R8, R9

**Dependencies:** U3, U4

**Files:**
- Modify: `packages/happy-app/sources/text/_default.ts`
- Modify: `packages/happy-app/sources/text/translations/en.ts`
- Modify: `packages/happy-app/sources/text/translations/ca.ts`
- Modify: `packages/happy-app/sources/text/translations/es.ts`
- Modify: `packages/happy-app/sources/text/translations/it.ts`
- Modify: `packages/happy-app/sources/text/translations/ja.ts`
- Modify: `packages/happy-app/sources/text/translations/pl.ts`
- Modify: `packages/happy-app/sources/text/translations/pt.ts`
- Modify: `packages/happy-app/sources/text/translations/ru.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hans.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hant.ts`

**Approach:**
- 文案至少覆盖：上传到此目录、上传到根目录、下载文件、上传中、下载中、上传失败、下载失败、transfer storage 未配置、session 离线、远端 curl 失败、本地读写失败。
- 用户取消 dialog 不显示错误。
- OSS/S3 未配置时不要误导成普通网络失败，要指出 transfer storage 未配置。

**Test scenarios:**
- Type-level/i18n completeness: 所有 locale 包含新增 key。
- Error path: storage 未配置时显示明确文案。
- Edge case: 用户取消操作不显示 alert。

**Verification:**
- UI 所有新增文字通过 `t(...)` 获取。

---

### U6. 回归验证和打包前检查

**Goal:** 确认恢复上传下载不破坏目录浏览、git tabs、预览和桌面权限。

**Requirements:** R1-R10

**Dependencies:** U1-U5

**Files:**
- Test: `packages/happy-server/sources/app/api/routes/fileTransferRoutes.test.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`
- Test: `packages/happy-app/sources/components/filesSidebarTabsModel.test.ts`

**Approach:**
- 跑 server route tests、app hook/model tests。
- 手动验证 macOS Tauri：右键目录上传 HTML、小文本、PPTX/PDF；右键文件下载；取消 open/save；session 离线；storage 未配置。
- 验证大 PDF 点击预览不会触发大内容 RPC；下载仍能通过 transfer storage 保存。
- 验证 Aliyun OSS 配置：`S3_PATH_STYLE=false`、`S3_PUBLIC_URL` 为 OSS public endpoint，presigned URL 能被本地客户端和远端 session 同时访问。

**Verification:**
- Directory 上传下载端到端可用。
- `Changes` / `All Files` 行为不变。
- CI 通过后再触发桌面构建供下载验证。

---

## System-Wide Impact

- **Server API:** 恢复 `/v1/file-transfer/*` 临时对象租约接口；不改变聊天附件接口。
- **Storage:** 使用现有 S3/OSS 兼容配置和 bucket；对象位于 `transfers/{userId}/{transferId}/...`，与聊天附件 `sessions/{sessionId}/attachments/...` 分离。
- **Client transfer:** Tauri app 需要 dialog/fs/http 能力；非 Tauri 不启用本地传输。
- **Remote execution:** 依赖 session 机器可执行 `curl`；失败要有明确提示。
- **Security:** userId scoped object prefix、safe fileName、shell quote、临时文件落盘、cleanup 校验是关键不变量。
- **UX:** V1 右键-only；无顶部按钮，减少右侧 tab 拥挤。

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 当前 HEAD 缺少历史 transfer 模块，实施时误写成 base64 RPC | 从 `81fcaca7` / `ef37c3a8` 迁移，并用测试断言上传不调用 `sessionWriteFile` |
| Aliyun OSS virtual-hosted-style URL 不兼容 path-style 默认 | 保持 `S3_PATH_STYLE=false` 配置，验证 presigned PUT/GET |
| 远端 session 无 `curl` | V1 显示明确错误；后续再考虑 CLI 内置下载/upload RPC |
| shell path quoting 出错或注入 | 集中封装 `quoteShell`，覆盖空格、单引号、中文路径测试 |
| transfer object 清理失败造成临时对象残留 | DELETE 失败不影响用户动作；bucket 配置 lifecycle/TTL 清理 |
| 右键入口可发现性差 | V1 先验证；必要时后续补顶部按钮或更多菜单 |
| 上传同名文件覆盖远端内容 | 远端命令先检测目标是否存在或使用不覆盖语义，冲突时提示用户 |

---

## Sources & References

- Origin document: `docs/brainstorms/2026-04-22-context-panel-file-browser-requirements.md`
- Prior plan: `docs/plans/2026-04-22-001-feat-context-panel-file-browser-plan.md`
- Deployment docs: `docs/deployment.md`
- Current code: `packages/happy-server/sources/storage/files.ts`
- Current code: `packages/happy-server/sources/app/api/api.ts`
- Current code: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Current code: `packages/happy-app/sources/components/FilesSidebar.tsx`
- Current code: `packages/happy-app/sources/-session/SessionView.tsx`
- Current code: `packages/happy-app/sources/components/FileTreeView.tsx`
- Historical source: `81fcaca7 Add large file transfers and update default server`
- Historical source: `d174541f Use transfer storage for medium uploads`
- Historical source: `ef37c3a8 Use transfer storage for all uploads`
- Historical source: `8338c99b fix(app): avoid preview RPC for large files`
