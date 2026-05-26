# Mobile File Transfer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Android/iOS file upload and download for session workspaces, matching the desktop file panel behavior without introducing a separate global file manager.

**Architecture:** Reuse the existing server-backed file transfer lease protocol and remote `curl` commands. Refactor the current Tauri-only `useFileTransfer` into a small platform adapter layer, then wire the existing `FilesSidebar` / `DirectoryTreeTab` UI into the mobile `/session/[id]/files` route with native long-press actions.

**Tech Stack:** React Native, Expo Router, Expo SDK 55, `expo-document-picker`, `expo-file-system`, `expo-file-system/legacy`, `expo-sharing`, Vitest, existing `sessionBash` and `sync/fileTransfer` APIs.

---

## Current State

- Desktop upload/download already exists in `packages/happy-app/sources/hooks/useFileTransfer.ts`.
- The existing hook is enabled only when `isTauri()` is true.
- It uses `createInboundFileTransfer`, `createOutboundFileTransfer`, `cleanupFileTransfer`, and `sessionBash` with remote `curl`.
- `FilesSidebar` already passes directory upload/download props into `DirectoryTreeTab`.
- `DirectoryTreeTab` already supports transfer status and web context menus, but native long-press actions are missing.
- Mobile `/session/[id]/files.tsx` is still the older git/search file list, not the newer directory-first file panel.
- `SessionView` only exposes the mobile file viewer button behind `experiments && !isTablet`.
- Expo dependencies already present in `packages/happy-app/package.json`:
  - `expo-document-picker`
  - `expo-file-system`
  - `expo-sharing`
  - `expo-intent-launcher`

## Product Decisions

- File panel stays session-scoped.
- Do not add a global bottom-tab file manager.
- Phone layout uses full-screen route `/session/[id]/files`.
- Tablet and desktop keep sidebar / split-panel behavior.
- Directory tab is the primary mobile file-transfer surface.
- MVP download UX:
  - iOS: download to app cache, then open system share sheet so users can save to Files.
  - Android: download to app cache, then open share sheet. Add Storage Access Framework save-to-folder as an optional enhancement after the basic transfer loop is stable.
- MVP should support one file at a time, matching the desktop hook.
- Do not support folder upload/download in this phase.

## Implementation Notes From Expo Docs

- Expo SDK 55 `expo-file-system` has newer `File` / `Paths` APIs.
- `uploadAsync` and `downloadAsync` from the main `expo-file-system` entry are deprecated and throw at runtime; if needed, import them from `expo-file-system/legacy`.
- `expo-document-picker` should use `getDocumentAsync({ copyToCacheDirectory: true })`.
- Android `StorageAccessFramework` APIs are exposed from `expo-file-system/legacy`.
- Prefer file URI based upload/download paths on native. Avoid converting large files into JS `ArrayBuffer` unless the file is known to be small.

## Branch

Create a dedicated worktree from the intended upstream feature base before touching code. This avoids mixing the feature with unrelated local changes in the current checkout:

```bash
git fetch origin
git worktree add -b feature/mobile-file-transfer ../glad-mobile-file-transfer origin/main
cd ../glad-mobile-file-transfer
```

If this repository's canonical base is not `origin/main`, replace `origin/main` with the current happy coder upstream branch before creating `feature/mobile-file-transfer`.

Do not run destructive checkout/reset commands if the current working tree is dirty. If `feature/mobile-file-transfer` already exists, use a new branch name such as `feature/mobile-file-transfer-v2` or delete the unused branch only after confirming it has no needed work.

---

### Task 1: Add a file-transfer platform adapter contract

**Files:**
- Create: `packages/happy-app/sources/hooks/fileTransfer/types.ts`
- Create: `packages/happy-app/sources/hooks/fileTransfer/errors.ts`
- Modify: `packages/happy-app/sources/hooks/useFileTransfer.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

**Step 1: Write the failing tests**

Add tests that describe the future adapter boundary without changing behavior:

```ts
it('reports disabled when no platform transfer adapter is available', () => {
    delete (global as any).window.__TAURI_INTERNALS__;

    const hook = useFileTransfer('sess1');

    expect(hook.enabled).toBe(false);
});

it('does not start upload when disabled', async () => {
    delete (global as any).window.__TAURI_INTERNALS__;

    const hook = useFileTransfer('sess1');
    hook.uploadFile('.');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockCreateInboundFileTransfer).not.toHaveBeenCalled();
});
```

**Step 2: Run the focused test and verify it fails**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
```

Expected: the new disabled-environment expectations fail or require setup fixes.

**Step 3: Create the adapter types**

Create `packages/happy-app/sources/hooks/fileTransfer/types.ts`:

```ts
export interface PickedUploadFile {
    uri: string;
    name: string;
    size?: number | null;
    mimeType?: string | null;
}

export interface FileTransferAdapter {
    enabled: boolean;
    pickUploadFile: () => Promise<PickedUploadFile | null>;
    uploadToUrl: (file: PickedUploadFile, uploadUrl: string) => Promise<void>;
    downloadAndSaveFromUrl: (downloadUrl: string, fileName: string, mimeType?: string | null) => Promise<void>;
}
```

Create `packages/happy-app/sources/hooks/fileTransfer/errors.ts`:

```ts
export class FileTransferCancelledError extends Error {
    constructor() {
        super('File transfer cancelled');
        this.name = 'FileTransferCancelledError';
    }
}

export function isFileTransferCancelled(error: unknown): boolean {
    return error instanceof FileTransferCancelledError
        || (error instanceof Error && /cancell?ed/i.test(error.message));
}
```

**Step 4: Refactor `useFileTransfer` to call an adapter internally**

Keep public exports stable:

- `UseFileTransferResult`
- `buildRemotePath`
- `quoteShell`
- `curlUploadCommand`
- `curlDownloadCommand`
- `useFileTransfer`

Move platform-specific dialog/fs/http calls behind local helper functions for now. The Tauri implementation can remain in `useFileTransfer.ts` until Task 2.

The behavior must remain:

- Tauri enabled.
- Non-Tauri disabled.
- Upload creates inbound lease, uploads local file to staging, remote curls from staging to workspace, then cleans up.
- Download creates outbound lease, remote curls file to staging, local app downloads and saves, then cleans up.

**Step 5: Run tests**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/happy-app/sources/hooks/useFileTransfer.ts packages/happy-app/sources/hooks/useFileTransfer.test.ts packages/happy-app/sources/hooks/fileTransfer/types.ts packages/happy-app/sources/hooks/fileTransfer/errors.ts
git commit -m "refactor: introduce file transfer adapter boundary"
```

---

### Task 2: Move desktop transfer into a Tauri adapter

**Files:**
- Create: `packages/happy-app/sources/hooks/fileTransfer/tauriAdapter.ts`
- Modify: `packages/happy-app/sources/hooks/useFileTransfer.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

**Step 1: Write the failing test**

Add a test that proves the hook delegates local picking/upload/save work to the Tauri adapter without changing the remote lease flow:

```ts
it('keeps desktop upload and download behavior through the adapter', async () => {
    const hook = useFileTransfer('sess1');

    expect(hook.enabled).toBe(true);
});
```

Keep the existing upload/download tests; they are the real regression coverage.

**Step 2: Run the focused test**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
```

Expected: PASS before implementation. This is a characterization step.

**Step 3: Extract the Tauri adapter**

Create `packages/happy-app/sources/hooks/fileTransfer/tauriAdapter.ts`:

```ts
import type { FileTransferAdapter, PickedUploadFile } from './types';
import { FileTransferCancelledError } from './errors';
import { isTauri } from '@/utils/platform';

let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null;
let tauriHttp: typeof import('@tauri-apps/plugin-http') | null = null;

async function getDialog() {
    if (!isTauri()) return null;
    tauriDialog ??= await import('@tauri-apps/plugin-dialog');
    return tauriDialog;
}

async function getFs() {
    if (!isTauri()) return null;
    tauriFs ??= await import('@tauri-apps/plugin-fs');
    return tauriFs;
}

async function getHttp() {
    if (!isTauri()) return null;
    tauriHttp ??= await import('@tauri-apps/plugin-http');
    return tauriHttp;
}

function getFileName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop() || 'file';
}

export function createTauriFileTransferAdapter(): FileTransferAdapter {
    return {
        enabled: isTauri(),
        async pickUploadFile(): Promise<PickedUploadFile | null> {
            const dialog = await getDialog();
            if (!dialog) return null;
            const selected = await dialog.open({ multiple: false }) as string | string[] | null;
            if (!selected) return null;
            const uri = Array.isArray(selected) ? selected[0] : selected;
            if (!uri) return null;
            return { uri, name: getFileName(uri) };
        },
        async uploadToUrl(file, uploadUrl) {
            const fs = await getFs();
            if (!fs) throw new Error('Tauri filesystem plugin is unavailable');
            const bytes = await fs.readFile(file.uri);
            const http = await getHttp();
            const standalone = new Uint8Array(bytes);
            const response = await (http?.fetch ?? fetch)(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: standalone.buffer,
            });
            if (!response.ok) {
                throw new Error(`Upload staging failed: HTTP ${response.status}`);
            }
        },
        async downloadAndSaveFromUrl(downloadUrl, fileName) {
            const dialog = await getDialog();
            const fs = await getFs();
            if (!dialog || !fs) throw new Error('Tauri file plugins are unavailable');

            const savePath = await dialog.save({ defaultPath: fileName });
            if (!savePath) throw new FileTransferCancelledError();

            const http = await getHttp();
            const response = await (http?.fetch ?? fetch)(downloadUrl);
            if (!response.ok) {
                throw new Error(`Download staging failed: HTTP ${response.status}`);
            }

            const bytes = new Uint8Array(await response.arrayBuffer());
            await fs.writeFile(savePath, bytes);
        },
    };
}
```

Do not introduce temporary `globalThis` state or fake in-memory URIs. The final adapter contract should keep download and save in one adapter method.

**Step 4: Wire `useFileTransfer` to `createTauriFileTransferAdapter()`**

Use the adapter for:

- `enabled`
- upload picker
- upload to staging URL
- download from staging URL and save/share

Keep all transfer lease and remote `sessionBash` orchestration in `useFileTransfer.ts`.

**Step 5: Run tests**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/happy-app/sources/hooks/useFileTransfer.ts packages/happy-app/sources/hooks/useFileTransfer.test.ts packages/happy-app/sources/hooks/fileTransfer/tauriAdapter.ts packages/happy-app/sources/hooks/fileTransfer/types.ts
git commit -m "refactor: move desktop file transfer into tauri adapter"
```

---

### Task 3: Add the native file-transfer adapter

**Files:**
- Create: `packages/happy-app/sources/hooks/fileTransfer/nativeAdapter.ts`
- Modify: `packages/happy-app/sources/hooks/useFileTransfer.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

**Step 1: Write failing tests for native enablement**

Extend the React Native platform mock in a new describe block:

```ts
it('enables file transfer on native platforms', () => {
    mockPlatformOS('ios');
    delete (global as any).window.__TAURI_INTERNALS__;

    const hook = useFileTransfer('sess1');

    expect(hook.enabled).toBe(true);
});
```

Use the repo's existing mock style. If `Platform.OS` cannot be mutated safely in the current test file, add a smaller unit test for the adapter selection helper instead.

**Step 2: Run the focused test and verify it fails**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
```

Expected: FAIL because native has no adapter yet.

**Step 3: Implement `nativeAdapter.ts`**

Create `packages/happy-app/sources/hooks/fileTransfer/nativeAdapter.ts`.

Implementation constraints:

- Import `Platform` from `react-native`.
- Import `DocumentPicker` from `expo-document-picker`.
- Import `File`, `Directory`, and `Paths` from `expo-file-system` where useful.
- Import `uploadAsync`, `FileSystemUploadType`, and `StorageAccessFramework` from `expo-file-system/legacy` only where legacy APIs are required.
- Import `Sharing` from `expo-sharing`.
- Use `DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })` for upload.
- Use binary upload for staging PUT.
- Keep the upload content type stable as `application/octet-stream` unless the server-side signing code explicitly supports variable content types.
- Check the returned upload status and throw on non-2xx responses.

```ts
const result = await LegacyFileSystem.uploadAsync(uploadUrl, file.uri, {
    httpMethod: 'PUT',
    uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'application/octet-stream' },
});
if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload staging failed: HTTP ${result.status}`);
}
```

- Download staging object to an explicit cache file name derived from `fileName`, not to an auto-named URL destination. The share sheet should receive a local URI whose extension still matches the remote file.
- Use `File.downloadFileAsync(downloadUrl, destinationFileOrDirectory)` if it can preserve the requested file name. Otherwise use a legacy download API imported from `expo-file-system/legacy` with an explicit target URI.
- Save/share downloaded file:
  - First use `Sharing.isAvailableAsync()`.
  - Then `Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName })`.
  - If sharing is unavailable, show a clear error.

**Step 4: Pick adapter by platform**

In `useFileTransfer.ts`, select:

- Tauri adapter if `isTauri()`.
- Native adapter if `Platform.OS === 'ios' || Platform.OS === 'android'`.
- disabled adapter otherwise.

Keep web browser disabled unless it is Tauri.

**Step 5: Run tests**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/happy-app/sources/hooks/useFileTransfer.ts packages/happy-app/sources/hooks/useFileTransfer.test.ts packages/happy-app/sources/hooks/fileTransfer/nativeAdapter.ts
git commit -m "feat: add native file transfer adapter"
```

---

### Task 4: Replace the mobile files route with the shared files panel

**Files:**
- Modify: `packages/happy-app/sources/app/(app)/session/[id]/files.tsx`
- Modify: `packages/happy-app/sources/app/(app)/session/[id]/file.tsx`
- Test: `packages/happy-app/sources/components/filesSidebarTabsModel.test.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

**Step 1: Write a route-level smoke test if the repo has an existing pattern**

Search for route tests:

```bash
rg -n "render\\(|expo-router|useLocalSearchParams" packages/happy-app/sources -g "*.test.ts" -g "*.test.tsx"
```

If no route-rendering pattern exists, skip route snapshot tests and rely on typecheck plus focused unit tests. Do not add `.test.tsx` files unless `packages/happy-app/vitest.config.ts` is also changed, because the current Vitest include only collects `sources/**/*.{spec,test}.ts`.

**Step 2: Replace the old mobile files screen**

`packages/happy-app/sources/app/(app)/session/[id]/files.tsx` should:

- Read `sessionId` from `useLocalSearchParams`.
- Own `sidebarMode` with default `DEFAULT_SIDEBAR_MODE`.
- Own `directoryRefreshRequest`.
- Call `useFileTransfer(sessionId)`.
- Render `FilesSidebar` full-screen.
- Route file presses to `/session/${sessionId}/file?path=${btoa(filePath)}`.
- On directory upload success, refresh the target directory.
- On directory download, call `fileTransfer.downloadFile(filePath)`.

Use this shape:

```tsx
export default React.memo(function FilesScreen() {
    const router = useRouter();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const [mode, setMode] = React.useState<SidebarMode>(DEFAULT_SIDEBAR_MODE);
    const [refreshRequest, setRefreshRequest] = React.useState({ key: 0, path: '.' });
    const fileTransfer = useFileTransfer(sessionId ?? null);

    const openFile = React.useCallback((filePath: string) => {
        router.push(`/session/${sessionId}/file?path=${btoa(filePath)}`);
    }, [router, sessionId]);

    return (
        <View style={styles.container}>
            <FilesSidebar
                sessionId={sessionId}
                mode={mode}
                onModeChange={setMode}
                onAllFilesFilePress={openFile}
                onDirectoryFilePress={openFile}
                onDirectoryUpload={(targetDir) => fileTransfer.uploadFile(targetDir, () => {
                    setRefreshRequest((request) => ({ key: request.key + 1, path: targetDir || '.' }));
                })}
                onDirectoryDownload={(filePath) => fileTransfer.downloadFile(filePath)}
                directoryTransferEnabled={fileTransfer.enabled}
                directoryTransferStatus={fileTransfer.uploading ? 'uploading' : fileTransfer.downloading ? 'downloading' : 'idle'}
                directoryRefreshKey={refreshRequest.key}
                directoryRefreshPath={refreshRequest.path}
            />
        </View>
    );
});
```

Adjust imports/styles to match project conventions.

**Step 3: Add download support to mobile file preview**

In `packages/happy-app/sources/app/(app)/session/[id]/file.tsx`:

- Import `useNavigation` or route options pattern used elsewhere if available.
- Import `useFileTransfer`.
- Add a header-right download icon on native only.
- Pressing it calls `fileTransfer.downloadFile(filePath)`.
- Disable while `fileTransfer.downloading`.

If adding header buttons is too invasive, add a compact top-row button inside the existing file screen content for this task and move it to header polish later.

**Step 4: Run checks**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts sources/components/filesSidebarTabsModel.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/happy-app/sources/app/'(app)'/session/'[id]'/files.tsx packages/happy-app/sources/app/'(app)'/session/'[id]'/file.tsx
git commit -m "feat: use shared files panel on mobile"
```

---

### Task 5: Add native file actions to the directory tree

**Files:**
- Modify: `packages/happy-app/sources/components/DirectoryTreeTab.tsx`
- Create: `packages/happy-app/sources/components/NativeDirectoryActionSheet.tsx`
- Modify: `packages/happy-app/sources/text/_default.ts`
- Modify: `packages/happy-app/sources/text/translations/en.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hans.ts`
- Modify: `packages/happy-app/sources/text/translations/zh-Hant.ts`
- Test: `packages/happy-app/sources/components/directoryTreeModel.test.ts`

**Step 1: Write the behavioral target**

There may not be an existing component interaction test harness for React Native long-press. If there is no established test pattern, document the behavior in comments and cover the pure path/menu target helpers with unit tests.

Add a pure helper if useful:

```ts
export function getDirectoryActionAvailability(target: DirectoryContextMenuTarget) {
    return {
        canUpload: target.type === 'directory' || target.type === 'empty',
        canDownload: target.type === 'file',
    };
}
```

**Step 2: Implement native action sheet**

Create `packages/happy-app/sources/components/NativeDirectoryActionSheet.tsx`.

Use `Modal.alert` if the project does not already have a bottom-sheet action component:

```tsx
export function showNativeDirectoryActions({
    target,
    onUploadDirectory,
    onDownloadFile,
}: {
    target: DirectoryContextMenuTarget;
    onUploadDirectory?: (targetDir: string) => void;
    onDownloadFile?: (filePath: string) => void;
}) {
    if (target.type === 'file') {
        Modal.alert(t('files.file'), target.path, [
            { text: t('files.downloadFile'), onPress: () => onDownloadFile?.(target.path) },
            { text: t('common.cancel'), style: 'cancel' },
        ]);
        return;
    }

    const targetDir = target.type === 'directory' ? target.path : '.';
    Modal.alert(t('files.directory'), targetDir, [
        { text: t('files.uploadToThisDirectory'), onPress: () => onUploadDirectory?.(targetDir) },
        { text: t('common.cancel'), style: 'cancel' },
    ]);
}
```

If the project has a better native action sheet helper, use it instead.

Use existing translation keys when possible. For example, the file title uses `t('files.file')`; there is no `t('common.file')` key in the current translations.

**Step 3: Wire long-press on native**

In `DirectoryTreeTab.tsx`:

- Keep existing web right-click behavior.
- For `Platform.OS !== 'web'`, add `onLongPress`.
- File long-press opens download action.
- Directory long-press opens upload-to-directory action.
- Empty-area long-press opens upload-to-root action if feasible.

Do not change normal file tap behavior.

**Step 4: Add missing translations**

Add only the keys needed for the new UI. English and Chinese must be fully translated. Other locales can fall back to English if that is the current project convention.

Likely keys:

- `files.fileActions`
- `files.directoryActions`
- `files.saveOrShareFile`
- `files.transferUnavailable`

**Step 5: Run checks**

```bash
pnpm --filter happy-app test -- sources/components/directoryTreeModel.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/DirectoryTreeTab.tsx packages/happy-app/sources/components/NativeDirectoryActionSheet.tsx packages/happy-app/sources/text/_default.ts packages/happy-app/sources/text/translations/en.ts packages/happy-app/sources/text/translations/zh-Hans.ts packages/happy-app/sources/text/translations/zh-Hant.ts
git commit -m "feat: add native file actions"
```

---

### Task 6: Make the mobile files entry point official

**Files:**
- Modify: `packages/happy-app/sources/-session/SessionView.tsx`
- Modify: `packages/happy-app/sources/components/AgentInput.tsx`
- Optional Modify: `packages/happy-app/sources/components/ChatHeaderView.tsx`
- Test: `packages/happy-app/sources/-session/SessionView.test.ts`

**Step 1: Write the failing test**

If `SessionView.test.ts` can assert `AgentInput` props, add:

```ts
it('exposes the mobile file viewer entry outside experiments', () => {
    // render SessionViewLoaded or the smallest wrapper available
    // assert AgentInput receives onFileViewerPress on phone native layout
});
```

If the current test harness cannot render this path cleanly, skip the unit test and use typecheck/manual QA.

**Step 2: Remove experiments gating**

Change:

```tsx
onFileViewerPress={experiments && !isTablet ? () => router.push(`/session/${sessionId}/files`) : undefined}
```

to:

```tsx
onFileViewerPress={!isTablet ? () => router.push(`/session/${sessionId}/files`) : undefined}
```

Do not remove the `experiments` variable if it is still used elsewhere in `SessionViewLoaded`.

**Step 3: Decide whether to add a header button**

Preferred final UX is a session header file button. Before editing `ChatHeaderView`, inspect its props and existing call sites:

```bash
rg -n "ChatHeaderView" packages/happy-app/sources
sed -n '1,220p' packages/happy-app/sources/components/ChatHeaderView.tsx
```

If adding one prop is clean:

- Add `onFilesPress?: () => void`.
- Render an Octicons `file-directory` icon button in the header action area.
- Only pass it on phone native session screens.

If the header component is too coupled, defer header entry and keep the official AgentInput toolbar entry for MVP.

**Step 4: Run checks**

```bash
pnpm --filter happy-app test -- sources/-session/SessionView.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/happy-app/sources/-session/SessionView.tsx packages/happy-app/sources/components/AgentInput.tsx packages/happy-app/sources/components/ChatHeaderView.tsx packages/happy-app/sources/-session/SessionView.test.ts
git commit -m "feat: expose mobile files entry point"
```

If `AgentInput.tsx` or `ChatHeaderView.tsx` were not changed, omit them from `git add`.

---

### Task 7: Add Android SAF save-to-folder support if needed

**Files:**
- Modify: `packages/happy-app/sources/hooks/fileTransfer/nativeAdapter.ts`
- Test: `packages/happy-app/sources/hooks/useFileTransfer.test.ts`

**Step 1: Confirm MVP behavior on Android**

Manually test whether the share sheet is good enough:

- Download `.txt`.
- Download `.png`.
- Download `.pdf`.
- Save to a user-visible app from the share sheet.

If the flow is acceptable, skip this task for MVP.

**Step 2: Add SAF only if share sheet is insufficient**

Use `StorageAccessFramework.requestDirectoryPermissionsAsync()` from `expo-file-system/legacy`.

Implementation detail:

- Ask user to pick a target directory.
- Create a file with `StorageAccessFramework.createFileAsync(parentUri, baseNameWithoutExtension, mimeType)`.
- Copy bytes from the downloaded cache file to the SAF URI.
- Beware that `createFileAsync` takes a file name without extension according to docs. Verify behavior on device before shipping.

**Step 3: Run checks**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/happy-app/sources/hooks/fileTransfer/nativeAdapter.ts packages/happy-app/sources/hooks/useFileTransfer.test.ts
git commit -m "feat: support android folder saves for downloads"
```

---

### Task 8: Manual QA and release validation

**Files:**
- Modify: `docs/plans/2026-05-19-001-feat-mobile-file-transfer-plan.md`

**Step 1: Run automated checks**

```bash
pnpm --filter happy-app test -- sources/hooks/useFileTransfer.test.ts sources/components/filesSidebarTabsModel.test.ts sources/components/directoryTreeModel.test.ts
pnpm --filter happy-app typecheck
```

Expected: PASS.

**Step 2: Run Android locally**

```bash
pnpm --filter happy-app android:dev
```

Manual checks:

- Open an online session.
- Open Files from the session toolbar/header.
- Directory tab loads project root.
- Upload a small `.txt` file to project root.
- Upload a file with spaces and non-ASCII characters in the name.
- Upload to a nested directory.
- Try uploading over an existing remote file; confirm clear failure.
- Download a small remote file.
- Download a binary file.
- Cancel document picker; confirm no error alert.
- Cancel share/save sheet; confirm no crash.

**Step 3: Run iOS locally**

```bash
pnpm --filter happy-app ios:dev
```

Repeat the same checks as Android.

**Step 4: Record results**

Append a QA section to this plan:

```md
## QA Results

- Android device/simulator:
- iOS device/simulator:
- Upload root:
- Upload nested:
- Download text:
- Download binary:
- Cancel flows:
- Known issues:
```

**Step 5: Commit QA notes**

```bash
git add docs/plans/2026-05-19-001-feat-mobile-file-transfer-plan.md
git commit -m "docs: record mobile file transfer qa"
```

---

## Risks

- Large native file uploads/downloads can exhaust JS memory if implemented through `ArrayBuffer`. Use file URI based APIs whenever possible.
- Android SAF behavior varies by OS version and selected provider. Keep share-sheet MVP separate from SAF enhancement.
- iOS does not allow arbitrary path writes. The correct UX is save/share via the system sheet.
- Remote commands currently assume POSIX shell semantics. This matches current desktop behavior but may not support Windows remote sessions.
- Existing `curlDownloadCommand` intentionally refuses to overwrite target files. Preserve this behavior.
- Mobile long-press discoverability is lower than desktop right-click. Keep upload-to-root visible from the files screen toolbar if possible.

## Definition of Done

- Android and iOS can upload one local file into the current session workspace.
- Android and iOS can download one remote file and hand it to the OS save/share flow.
- Desktop Tauri file transfer behavior remains unchanged.
- Mobile Files page uses the same directory-first model as desktop.
- Files entry point is available without the experiments flag.
- Transfer lease cleanup still runs after success and failure.
- Focused Vitest tests pass.
- `pnpm --filter happy-app typecheck` passes.
- Manual Android and iOS QA results are recorded.
