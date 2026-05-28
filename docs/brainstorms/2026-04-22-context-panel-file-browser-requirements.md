---
date: 2026-04-22
topic: context-panel-file-browser
---

# ContextPanel 文件浏览器

## Problem Frame

桌面端右侧 ContextPanel 目前是占位符。用户需要在不离开聊天界面的情况下浏览当前 session 工作目录的文件结构、预览文件内容、以及在本地和远程工作目录之间传输文件。

## Requirements

**文件树浏览**
- R1. 展示当前 session 工作目录的层级文件树，支持展开/折叠目录
- R2. 显示文件图标、文件名、文件大小等基础信息
- R3. 支持按文件名搜索过滤

**文件预览**
- R4. 点击文件在面板内预览内容，代码文件带语法高亮
- R5. 二进制文件显示文件类型和大小信息，不尝试渲染内容
- R6. 预览区域顶部显示文件路径，支持返回文件树

**文件上传**
- R7. 支持从本地选择文件上传到远程工作目录的指定子文件夹
- R8. 通过 happy-server WebSocket 中转传输，复用现有 writeFile RPC
- R9. 上传过程显示进度指示

**文件下载**
- R10. 支持将远程文件下载保存到本地，通过 Tauri 文件对话框选择保存位置
- R11. 通过 happy-server WebSocket 中转传输，复用现有 readFile RPC

## Success Criteria

- 用户能在右侧面板浏览完整的项目文件树，无需离开聊天页面
- 文件预览响应流畅（利用已有缓存机制）
- 上传/下载功能可靠，错误情况有明确提示

## Scope Boundaries

- 不支持文件编辑（只读预览）
- 不支持批量上传/下载
- 不支持拖拽上传（V1 先用文件选择器）
- 仅桌面端（Tauri），移动端继续使用现有 files 页面
- 大文件传输不做分片（依赖现有 RPC 30s 超时机制）

## Key Decisions

- 复用现有 RPC 协议：`listDirectory`、`getDirectoryTree`、`readFile`、`writeFile` 已具备所需能力，无需新增后端接口
- 复用现有组件：`SimpleSyntaxHighlighter`、`FileIcon`、git status 相关 hooks
- 下载使用 Tauri file dialog API 选择保存路径

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] `getDirectoryTree` 的 maxDepth 应设为多少？是否需要懒加载深层目录？
- [Affects R7][Technical] 上传大文件时 base64 编码的内存开销，是否需要设置文件大小上限？
- [Affects R4][Technical] 文件预览是否复用现有 `sessionFileCache`，还是 ContextPanel 维护独立缓存？

## Next Steps

→ `/ce:plan` for structured implementation planning
