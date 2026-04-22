/**
 * useFileTransfer — handles file upload/download between local filesystem and remote session.
 * Uses Tauri dialog + fs plugins for native file picking and saving.
 * Falls back to disabled state in non-Tauri environments.
 * Uploads: local file → base64 → sessionWriteFile RPC → remote
 * Downloads: sessionReadFile RPC → base64 → local file via Tauri save dialog
 */
import * as React from 'react';
import { isTauri } from '@/utils/platform';
import { sessionWriteFile, sessionReadFile } from '@/sync/ops';
import { Modal } from '@/modal';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Lazy-loaded Tauri modules (cached at module level)
let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null;

async function getDialog() {
    if (!isTauri()) return null;
    if (!tauriDialog) {
        tauriDialog = await import('@tauri-apps/plugin-dialog');
    }
    return tauriDialog;
}

async function getFs() {
    if (!isTauri()) return null;
    if (!tauriFs) {
        tauriFs = await import('@tauri-apps/plugin-fs');
    }
    return tauriFs;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

interface UseFileTransferResult {
    uploading: boolean;
    downloading: boolean;
    enabled: boolean;
    uploadFile: (targetDir: string, onSuccess?: () => void) => void;
    downloadFile: (remotePath: string) => void;
}

export function useFileTransfer(sessionId: string | null): UseFileTransferResult {
    const [uploading, setUploading] = React.useState(false);
    const [downloading, setDownloading] = React.useState(false);
    const enabled = isTauri();

    const uploadFile = React.useCallback(async (targetDir: string, onSuccess?: () => void) => {
        if (!sessionId || uploading) return;

        const dialog = await getDialog();
        const fs = await getFs();
        if (!dialog || !fs) return;

        try {
            setUploading(true);

            // 1. Pick file
            const selected = await dialog.open({ multiple: false }) as string | null;
            if (!selected) return; // user cancelled

            const filePath = selected;

            // 2. Check file size before reading (avoid OOM on large files)
            const stat = await fs.stat(filePath);
            if (stat.size && stat.size > MAX_FILE_SIZE) {
                Modal.alert(
                    'File too large',
                    `File size (${formatSize(stat.size)}) exceeds the 10MB limit. Please use CLI for large files.`,
                    [{ text: 'OK', style: 'cancel' }],
                );
                return;
            }

            // 3. Read file content
            const bytes = await fs.readFile(filePath);

            // 4. Convert to base64
            const base64Content = uint8ArrayToBase64(bytes);

            // 5. Build remote path
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
            const remotePath = targetDir === '.' ? fileName : `${targetDir}/${fileName}`;

            // 6. Upload via RPC
            const result = await sessionWriteFile(sessionId, remotePath, base64Content);
            if (!result.success) {
                Modal.alert('Upload failed', result.error || 'Unknown error', [{ text: 'OK', style: 'cancel' }]);
                return;
            }

            // 7. Success
            onSuccess?.();
        } catch (e: any) {
            if (e?.message?.includes('cancelled') || e?.message?.includes('canceled')) {
                return; // user cancelled dialog
            }
            Modal.alert('Upload failed', e?.message || 'Unknown error', [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setUploading(false);
        }
    }, [sessionId, uploading]);

    const downloadFile = React.useCallback(async (remotePath: string) => {
        if (!sessionId || downloading) return;

        const dialog = await getDialog();
        const fs = await getFs();
        if (!dialog || !fs) return;

        try {
            setDownloading(true);

            // 1. Fetch file content from remote (always bypass cache — cache stores decoded text, not raw bytes)
            const result = await sessionReadFile(sessionId, remotePath);
            if (!result.success || !result.content) {
                Modal.alert('Download failed', result.error || 'File could not be read', [{ text: 'OK', style: 'cancel' }]);
                return;
            }

            // 2. Pick save location
            const fileName = remotePath.split('/').pop() || 'file';
            const savePath = await dialog.save({ defaultPath: fileName });
            if (!savePath) return; // user cancelled

            // 3. Decode base64 to bytes
            const bytes = base64ToUint8Array(result.content);

            // 4. Write to local filesystem
            await fs.writeFile(savePath, bytes);
        } catch (e: any) {
            if (e?.message?.includes('cancelled') || e?.message?.includes('canceled')) {
                return;
            }
            Modal.alert('Download failed', e?.message || 'Unknown error', [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setDownloading(false);
        }
    }, [sessionId, downloading]);

    // Wrap callbacks to not return promises (React event handlers shouldn't return promises)
    const uploadFileSync = React.useCallback((targetDir: string, onSuccess?: () => void) => {
        void uploadFile(targetDir, onSuccess);
    }, [uploadFile]);

    const downloadFileSync = React.useCallback((remotePath: string) => {
        void downloadFile(remotePath);
    }, [downloadFile]);

    return {
        uploading,
        downloading,
        enabled,
        uploadFile: uploadFileSync,
        downloadFile: downloadFileSync,
    };
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
