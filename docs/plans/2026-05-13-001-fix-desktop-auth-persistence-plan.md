---
title: "fix: 保留桌面端重启后的认证状态"
type: fix
status: completed
date: 2026-05-13
---

# fix: 保留桌面端重启后的认证状态

## 摘要

BFELAB 桌面端当前在每次完整退出后需要重新关联/认证。计划将桌面端认证凭据从 WebView `localStorage` 迁移到 Tauri app-scoped 持久化存储，并保留旧 `localStorage` 凭据迁移、显式退出登录清理、dev 构建不触发 macOS Keychain 弹窗等行为。

---

## 问题背景

桌面端启动路径是 `packages/happy-app/sources/app/_layout.tsx` 调用 `TokenStorage.getCredentials()`，如果拿到凭据就执行 `syncRestore(credentials)`；如果拿不到，就进入重新关联/认证。当前 Tauri 分支的 `TokenStorage` 使用加密后的浏览器 `localStorage` 保存 `auth_credentials`。

生产桌面端在 `packages/happy-app/src-tauri/src/lib.rs` 中通过 `portpicker::pick_unused_port()` 每次选择随机 localhost 端口，并让 WebView 导航到 `http://localhost:{port}`。浏览器 `localStorage` 按 origin 隔离，端口变化会导致上次写入的 `auth_credentials` 不在当前 origin 下可见。这解释了“退出再打开后像认证丢失”的现象。关闭窗口本身不会清认证：macOS close 只 hide window，托盘 `Quit BFELAB` 才 `app.exit(0)`；显式清认证只在 `AuthContext.logout()` 路径。

---

## 需求

- R1. 桌面端正常退出、重新打开后保留已关联/已认证状态，不再要求重新关联。
- R2. 显式 logout/sign out 仍然清空认证凭据和本地同步持久化数据，下一次启动必须要求重新认证。
- R3. dev/unsigned 桌面构建不能重新引入每次启动 macOS Keychain password prompt。
- R4. web、iOS、Android 的认证存储行为不因本次修复改变。
- R5. 已经保存在旧 Tauri `localStorage` 的有效认证凭据应尽可能自动迁移，避免用户升级后被迫重新关联。
- R6. 损坏、不可解析或无法读取的凭据必须安全失败：不崩溃、不无限重试，并输出足够定位问题的日志。
- R7. CI 至少覆盖凭据读写、迁移和清理语义；桌面端手工验收覆盖退出重启场景。

---

## 范围边界

- 本计划只修复桌面端认证状态持久化，不改 server 认证协议、token 格式、QR/linking 流程或 sync 协议。
- 不把 CLI 命令、deep link scheme、服务端 session 模型作为本次范围。
- 不把所有桌面偏好设置从 `localStorage` 迁移出去；本次只处理认证凭据。`useZenMode.tsx`、`DesktopLayout.tsx` 等普通 UI 偏好可以后续单独整理。
- 不使用 OS Keychain 作为 dev/unsigned 默认路径，避免回到已记录的 “macOS Keychain password prompt every launch” 问题。
- 凭据文件、store 文件和 secrets 不提交进仓库。

---

## 上下文与调研

### 相关代码和模式

- `packages/happy-app/sources/auth/tokenStorage.ts` 是认证凭据持久化边界。Tauri 分支当前写入 AES-GCM 加密后的 `localStorage.auth_credentials`；web 分支写明文 JSON localStorage；native 分支使用 `expo-secure-store`。
- `packages/happy-app/sources/auth/AuthContext.tsx` 的 `login()` 先 `TokenStorage.setCredentials()`，成功后 `syncCreate()`；`logout()` 调用 `clearPersistence()` 和 `TokenStorage.removeCredentials()`。
- `packages/happy-app/sources/app/_layout.tsx` 启动时调用 `TokenStorage.getCredentials()`，有凭据则 `syncRestore(credentials)`，再把凭据传给 `AuthProvider`。
- `packages/happy-app/src-tauri/src/lib.rs` production 构建使用 `tauri_plugin_localhost` 和随机端口加载本地前端，这是 `localStorage` origin 不稳定的核心风险。
- `packages/happy-app/src-tauri/capabilities/default.json` 当前只授权 http、notification、window-state、dialog、fs 等插件，尚未授权 store 插件。
- `packages/happy-app/sources/trash/e2e-test-results.md` 记录过历史问题：使用 keyring crate 会让 unsigned dev builds 每次启动访问 Keychain，因此后来 dev 跳过 keychain 并用 localStorage。
- `packages/happy-app/sources/auth/tokenStorage.test.ts` 当前只覆盖 Tauri 加密 localStorage 的读写/损坏清理，没有覆盖 Tauri app-scoped store。

### 外部文档确认

- Tauri 2 官方插件文档显示 `@tauri-apps/plugin-store` / `tauri-plugin-store` 提供跨平台持久化 key/value store，可从 JS 使用 `Store.load('settings.json')` 后 `get`、`set`、`delete`、`save`。
- Tauri store 插件 capability 需要授权 `store:allow-load`、`store:allow-get`、`store:allow-set`、`store:allow-delete`、`store:allow-save` 等命令；`store:default` 会启用默认操作集。

---

## 关键技术决策

- 优先修复根因而不是绕过症状：不要把 production localhost 端口固定成单一值来依赖 browser origin；认证凭据应从 WebView origin-scoped storage 迁出，放到 Tauri app-scoped storage。
- 新增一个桌面凭据存储 adapter，并让 `TokenStorage` 继续作为唯一调用入口。这样 `AuthContext`、`_layout.tsx`、`sync` 和 realtime/api socket 调用方不需要知道底层存储差异。
- production/preview Tauri 使用 Tauri store 插件保存认证凭据。凭据仍先经过现有 AES-GCM 加密后再写入 store，避免把 token/secret 以明文 JSON 写入磁盘；但当前静态 key 只能降低误读风险，不等同于强安全边界。
- dev/unsigned Tauri 默认保留当前 encrypted localStorage 路径，避免重新触发 Keychain 弹窗；但应在计划实现时评估 dev build 是否也需要一个显式 opt-in 的 store 测试开关。
- 迁移读序为：先读新 Tauri store；如果不存在，再读旧 encrypted localStorage；旧凭据有效时写入新 store，写入成功后保留或延迟删除旧 localStorage 作为一版回退。不要在新 store 写入失败时删除旧数据。
- `removeCredentials()` 必须清理所有桌面认证位置：新 Tauri store、旧 `localStorage.auth_credentials`、遗留 `_keychain_migrated` flag。显式 logout 是唯一正常清认证入口。
- 损坏数据处理要局部化：新 store 损坏只清新 store key；旧 localStorage 损坏只清旧 key。不要因为一个 backend 失败而删除另一个 backend 的有效凭据。

---

## 开放问题

### 规划阶段已解决

- 是否可以优化：可以。当前最可能根因是 production Tauri 每次随机 localhost 端口导致 origin-scoped `localStorage` 读不到旧认证凭据。
- 是否应改退出逻辑：不优先。现有关闭/退出路径没有主动 logout，问题主要在凭据持久化位置。
- 是否使用 Keychain：不作为默认方案，因为项目已有 unsigned dev build Keychain 弹窗问题记录。

### 推迟到实现阶段

- Tauri store 文件名和 key 命名：建议使用专用文件，例如 `auth.store.json`，专用 key 例如 `auth_credentials_v1`，实现时按插件限制确认最终名称。
- 是否删除旧 localStorage：建议先迁移后保留一版，或在成功迁移后删除；需要实现时结合回滚策略选择。
- AES 静态 key 是否升级：本次可保持兼容；如果要引入 OS secret 或 Stronghold，应单独做安全设计，避免把“修复重启丢登录”扩大成认证加密体系改造。

---

## 实施单元

### U1. 接入 Tauri app-scoped store 插件

**目标：** 让桌面端具备不依赖 WebView origin 的持久化 key/value store。

**需求：** R1, R3, R4

**依赖：** 无

**文件：**
- Modify: `packages/happy-app/package.json`
- Modify: `packages/happy-app/src-tauri/Cargo.toml`
- Modify: `packages/happy-app/src-tauri/src/lib.rs`
- Modify: `packages/happy-app/src-tauri/capabilities/default.json`
- Test: none

**方案：**
- 添加 `@tauri-apps/plugin-store` JS dependency 和 `tauri-plugin-store` Rust dependency，版本与当前 Tauri 2 插件系列保持一致。
- 在 Tauri builder 中注册 store plugin，位置跟现有 `http`、`notification`、`window-state`、`dialog`、`fs` 插件保持同一层级。
- 在 capability 中只授权 store 需要的命令。优先使用最小权限组合：load/get/set/delete/save；如果插件要求默认权限集，再使用 `store:default` 并记录原因。
- 不在 Rust 侧写入任何认证数据；Rust 侧只启用插件能力。

**遵循模式：**
- `packages/happy-app/src-tauri/src/lib.rs` 现有插件注册模式。
- `packages/happy-app/src-tauri/capabilities/default.json` 现有 capability permission 列表模式。

**测试场景：**
- Test expectation: none -- 插件 wiring 通过 TypeScript 测试和 Tauri 构建验证。

**验收：**
- Tauri 构建能识别 store plugin，JS 能在 Tauri 环境中加载指定 store 文件。
- web/mobile 构建不引用 Tauri store plugin runtime。

---

### U2. 新增桌面凭据存储 adapter

**目标：** 在 `TokenStorage` 下增加 Tauri store backend，让 production/preview 桌面端读写稳定持久化凭据。

**需求：** R1, R3, R4, R6

**依赖：** U1

**文件：**
- Modify: `packages/happy-app/sources/auth/tokenStorage.ts`
- Create: `packages/happy-app/sources/auth/desktopCredentialStorage.ts`
- Create: `packages/happy-app/sources/auth/desktopCredentialStorage.test.ts`
- Modify: `packages/happy-app/sources/auth/tokenStorage.test.ts`

**方案：**
- 新建 `desktopCredentialStorage`，封装 Tauri store 的 `load`、`get`、`set`、`delete`、`save`。
- adapter API 只暴露 `getEncryptedCredentials()`、`setEncryptedCredentials(value)`、`removeEncryptedCredentials()`，避免让调用方处理 store 细节。
- 使用动态 import 或 Tauri 环境分支，确保非 Tauri web/native 测试和 bundle 不主动加载 `@tauri-apps/plugin-store`。
- 在 `TokenStorage` Tauri 分支中按环境选择 backend：production/preview 使用 desktop store；dev/unsigned 默认继续使用 encrypted localStorage。
- 保留现有 `encryptValue()` / `decryptValue()` 和 `AuthCredentials` JSON 格式，降低迁移复杂度。
- 对 store load/read/write/delete 错误做局部 catch，并返回失败状态；不要让启动阶段因 store 插件错误崩溃。

**遵循模式：**
- `TokenStorage` 现有按 `isTauri()`、`Platform.OS === 'web'`、native 的分支结构。
- 当前 `setCredentials()` 用 boolean 表达持久化是否成功，`login()` 依赖该返回值决定是否继续。

**测试场景：**
- Tauri production-like 环境：`setCredentials()` 加密后写入 desktop store，`getCredentials()` 能从 desktop store 解密恢复。
- Tauri production-like 环境：store 写入失败时 `setCredentials()` 返回 `false`，不会误报登录成功。
- Tauri production-like 环境：store 读取失败或密文损坏时 `getCredentials()` 返回 `null`，清理对应 store key，并输出 warning。
- Tauri dev-like 环境：仍走 encrypted localStorage，不调用 desktop store adapter。
- Web 环境：仍走普通 localStorage JSON，不调用 desktop store adapter。
- Native 环境：仍走 `expo-secure-store`，不调用 desktop store adapter。

**验收：**
- `TokenStorage` 调用方无需变更即可获得稳定桌面持久化。
- dev/unsigned 路径没有重新引入 Keychain 访问。

---

### U3. 实现旧 localStorage 凭据迁移

**目标：** 让已经登录过的桌面端用户升级后尽可能无感迁移到新 store，不因为存储位置变化被迫重新关联。

**需求：** R1, R5, R6

**依赖：** U2

**文件：**
- Modify: `packages/happy-app/sources/auth/tokenStorage.ts`
- Modify: `packages/happy-app/sources/auth/tokenStorage.test.ts`
- Modify: `packages/happy-app/sources/auth/desktopCredentialStorage.test.ts`

**方案：**
- `getCredentials()` 在 Tauri production/preview 中先读取 desktop store。
- 如果 store 没有凭据，则读取旧 `localStorage.auth_credentials`，沿用现有 decrypt/parse 逻辑。
- 旧凭据有效时，调用 desktop store 写入同一份 encrypted payload 或重新加密后的 payload。
- 只有在 desktop store 写入成功后，才考虑删除旧 localStorage key；为了降低回滚风险，建议第一版保留旧 key，只记录迁移成功 flag 或 warning。
- 旧 localStorage 损坏时只删除旧 key，不影响 store 中可能存在的有效数据。

**遵循模式：**
- 当前 `tokenStorage.test.ts` 已有损坏 localStorage 会删除 `auth_credentials` 的测试，可扩展为“只删除损坏 backend”的覆盖。

**测试场景：**
- 新 store 为空、旧 localStorage 有有效密文：`getCredentials()` 返回旧凭据，并写入 desktop store。
- 新 store 已有有效凭据、旧 localStorage 也有不同凭据：优先返回新 store 凭据，不覆盖新 store。
- 新 store 为空、旧 localStorage 损坏：返回 `null`，只删除旧 localStorage key。
- 新 store 写入迁移失败：仍返回旧凭据，但保留旧 localStorage key，并记录 warning。

**验收：**
- 已登录用户升级后不应因为存储迁移而重新关联，除非旧 origin 下本来已经读不到旧 localStorage。
- 迁移失败不造成数据丢失。

---

### U4. 修正显式 logout 清理语义

**目标：** 确保“保留重启登录”和“退出登录清空登录”同时成立。

**需求：** R2, R4, R6

**依赖：** U2

**文件：**
- Modify: `packages/happy-app/sources/auth/tokenStorage.ts`
- Modify: `packages/happy-app/sources/auth/tokenStorage.test.ts`
- Audit only: `packages/happy-app/sources/auth/AuthContext.tsx`
- Audit only: `packages/happy-app/sources/app/(app)/settings/account.tsx`
- Audit only: `packages/happy-app/sources/components/CommandPalette/CommandPaletteProvider.tsx`

**方案：**
- `removeCredentials()` 在 Tauri production/preview 中删除 desktop store key、旧 localStorage `auth_credentials` 和 `_keychain_migrated`。
- 如果删除 store 失败，返回 `false` 并记录 warning；但仍尽力删除旧 localStorage key，避免部分清理失败造成更混乱状态。
- 审计所有 logout 入口，确认它们最终都调用 `AuthContext.logout()` 或 `TokenStorage.removeCredentials()`，不新增旁路清理。
- 不在 close/quit 路径加入 `removeCredentials()`，避免把正常退出误当 logout。

**遵循模式：**
- `AuthContext.logout()` 当前已经在清认证前调用 `clearPersistence()`，这个职责不需要迁移到 `TokenStorage`。

**测试场景：**
- Tauri production-like 环境：`removeCredentials()` 删除 desktop store key。
- Tauri production-like 环境：`removeCredentials()` 同时删除旧 `localStorage.auth_credentials` 和 `_keychain_migrated`。
- Store delete 失败时：函数返回 `false` 或保守失败状态，但旧 localStorage 仍被清理。
- Web/native 环境：现有清理路径不变。

**验收：**
- 用户点击设置页或命令面板 logout 后，重启桌面端需要重新认证。
- 用户仅关闭窗口或托盘 Quit 后，重启桌面端仍保持认证。

---

### U5. 启动恢复与回归验证

**目标：** 用自动化和手工桌面验收证明重启恢复链路可用。

**需求：** R1, R2, R7

**依赖：** U2, U3, U4

**文件：**
- Modify: `packages/happy-app/sources/auth/tokenStorage.test.ts`
- Modify: `packages/happy-app/sources/trash/e2e-test-checklist.md`

**方案：**
- 在单元测试中覆盖 `_layout.tsx` 依赖的核心 contract：`TokenStorage.getCredentials()` 在桌面端可跨“模拟重启”返回同一凭据。
- 如果直接测试 `_layout.tsx` 成本过高，不为了形式引入脆弱组件测试；优先把持久化 contract 覆盖扎实。
- 更新桌面 e2e checklist，加入 BFELAB 桌面端认证恢复场景。
- 手工验证时使用 production/preview Tauri 构建，因为 dev 仍可能走不同 backend。

**遵循模式：**
- `packages/happy-app/sources/trash/e2e-test-checklist.md` 已用于桌面端手工验收条目。

**测试场景：**
- 登录/关联成功后退出 BFELAB，再重新打开：直接进入已认证 app，不显示重新关联。
- 关闭窗口再从 Dock/托盘恢复：仍保持认证。
- 托盘 `Quit BFELAB` 后重新打开：仍保持认证。
- 设置页 logout 后退出并重新打开：要求重新认证。
- 桌面端 store 中密文损坏：app 不崩溃，并进入未认证状态。
- dev/unsigned build 启动：不出现每次启动 Keychain password prompt。

**验收：**
- CI 单元测试通过。
- 本地 production/preview 桌面端手工验证通过。

---

## 系统影响

- `TokenStorage` 会成为更明确的平台存储策略边界，Tauri production/preview 不再依赖 localhost origin。
- 桌面端新增一个 Tauri store 插件依赖和 capability 权限，构建配置和 lockfile 会变化。
- logout 行为会清理更多位置，避免迁移期间新旧存储并存导致的“退出登录后又恢复”。
- web/native 认证路径应保持行为不变，但需要测试防止动态 import 或平台判断误伤。

---

## 风险与缓解

- 风险：Tauri store 文件是 app-scoped 磁盘持久化，不等同于 OS Keychain。缓解：继续写入 AES-GCM 密文，并把更强安全存储作为后续安全设计，不在本次 bugfix 中引入 Keychain 回归。
- 风险：动态 import Tauri plugin 可能影响 web 测试或 bundle。缓解：adapter 内集中封装，并用 web/native 测试确认不加载插件。
- 风险：迁移时误删旧 localStorage 导致用户被迫重新关联。缓解：先读新 store，旧数据只在确认损坏时删除；迁移写入失败时保留旧数据。
- 风险：dev 和 production 存储 backend 不一致导致问题在 dev 里复现不了。缓解：添加 production-like 单元测试，并在手工验收使用 production/preview 桌面构建。
- 风险：随机 localhost 端口还会影响其他依赖 localStorage 的 UI 偏好。缓解：本次只修 auth；其他 UI 偏好如分栏宽度、zen mode 可另开低优先级整理。

---

## 验证计划

- 运行 `pnpm --filter happy-app test -- tokenStorage` 或项目现有等价 Vitest 命令，覆盖 `TokenStorage` 和 desktop adapter。
- 运行 `pnpm --filter happy-app typecheck`，确认动态 import、store API 类型和平台分支通过 TypeScript。
- 运行 `pnpm --filter happy-app tauri:build:preview` 或 CI desktop build，确认 Tauri Rust/JS 插件 wiring 通过。
- 手工安装/运行 BFELAB preview 或 production 桌面构建，完成关联后执行关闭窗口、托盘 Quit、重启 app、logout 后重启四组场景。

---

## 交付标准

- BFELAB 桌面端正常退出后重新打开不再要求重新关联/认证。
- logout 后不会因为旧 localStorage 或新 store 残留而自动恢复认证。
- CI 覆盖新旧存储迁移和清理行为。
- dev/unsigned 桌面构建没有重新出现 Keychain password prompt。
- 实现说明中明确记录：本次只修认证凭据持久化，其他 localStorage UI 偏好不在范围内。
