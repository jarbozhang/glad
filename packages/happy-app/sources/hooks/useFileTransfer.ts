/**
 * useFileTransfer — handles file upload/download between local filesystem and remote session.
 * Uses Tauri dialog + fs plugins for native file picking and saving.
 * Falls back to disabled state in non-Tauri environments.
 * Small files use base64 over session RPC.
 * Large uploads/downloads use temporary object storage URLs plus remote curl via existing bash RPC.
 */
import * as React from 'react';
import { isTauri } from '@/utils/platform';
import { sessionWriteFile, sessionReadFile, sessionBash } from '@/sync/ops';
import { cleanupFileTransfer, createInboundFileTransfer, createOutboundFileTransfer, type FileTransferLease } from '@/sync/fileTransfer';
import { Modal } from '@/modal';

const LARGE_FILE_THRESHOLD = 1024 * 1024; // 1MB
const LARGE_TRANSFER_TIMEOUT_MS = 30 * 60 * 1000;

// Lazy-loaded Tauri modules (cached at module level)
let tauriDialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null;
let tauriHttp: typeof import('@tauri-apps/plugin-http') | null = null;

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

async function getHttp() {
    if (!isTauri()) return null;
    if (!tauriHttp) {
        tauriHttp = await import('@tauri-apps/plugin-http');
    }
    return tauriHttp;
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
    uploadFiles: (targetDir: string, filePaths: string[], onSuccess?: () => void) => void;
    downloadFile: (remotePath: string) => void;
}

function getFileName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop() || 'file';
}

function buildRemotePath(targetDir: string, fileName: string): string {
    return targetDir === '.' || targetDir === ''
        ? fileName
        : `${targetDir}/${fileName}`;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    return 'Unknown error';
}

function isCancelError(error: unknown): boolean {
    return /cancell?ed/i.test(getErrorMessage(error));
}

function quoteShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function curlUploadCommand(localPath: string, uploadUrl: string): string {
    return [
        'curl',
        '--fail',
        '--location',
        '--retry', '5',
        '--retry-delay', '2',
        '--connect-timeout', '20',
        '--max-time', String(Math.floor(LARGE_TRANSFER_TIMEOUT_MS / 1000)),
        '--upload-file', quoteShell(localPath),
        quoteShell(uploadUrl),
    ].join(' ');
}

function curlDownloadCommand(downloadUrl: string, remotePath: string): string {
    const quotedTarget = quoteShell(remotePath);
    const quotedTemp = quoteShell(`${remotePath}.happy-download-${Date.now()}.tmp`);
    return [
        'set -e;',
        `tmp=${quotedTemp};`,
        'curl',
        '--fail',
        '--location',
        '--retry', '5',
        '--retry-delay', '2',
        '--connect-timeout', '20',
        '--max-time', String(Math.floor(LARGE_TRANSFER_TIMEOUT_MS / 1000)),
        '--output', '"$tmp"',
        quoteShell(downloadUrl),
        '&& mv -- "$tmp"', quotedTarget,
    ].join(' ');
}

async function cleanupQuietly(transfer: FileTransferLease) {
    try {
        await cleanupFileTransfer(transfer);
    } catch {
        // Transfer objects are TTL-style scratch data; failed cleanup should not mask the user action.
    }
}

async function putObject(url: string, bytes: Uint8Array): Promise<Response> {
    const http = await getHttp();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return await (http?.fetch ?? fetch)(url, {
        method: 'PUT',
        body: new Blob([body]),
    });
}

async function getObjectBytes(url: string): Promise<Uint8Array> {
    const http = await getHttp();
    const response = await (http?.fetch ?? fetch)(url);
    if (!response.ok) {
        throw new Error(`Download staging failed: HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
}

export function useFileTransfer(sessionId: string | null): UseFileTransferResult {
    const [uploading, setUploading] = React.useState(false);
    const [downloading, setDownloading] = React.useState(false);
    const enabled = isTauri();

    const uploadFiles = React.useCallback(async (targetDir: string, filePaths: string[], onSuccess?: () => void) => {
        if (!sessionId || uploading || filePaths.length === 0) return;

        const fs = await getFs();
        if (!fs) return;

        try {
            setUploading(true);

            for (const filePath of filePaths) {
                const stat = await fs.stat(filePath);
                const remotePath = buildRemotePath(targetDir, getFileName(filePath));

                if (stat.size && stat.size > LARGE_FILE_THRESHOLD) {
                    let transfer: FileTransferLease | null = null;
                    try {
                        transfer = await createInboundFileTransfer(getFileName(filePath));
                        const bytes = await fs.readFile(filePath);
                        const uploadResponse = await putObject(transfer.uploadUrl, bytes);
                        if (!uploadResponse.ok) {
                            throw new Error(`Upload staging failed: HTTP ${uploadResponse.status}`);
                        }

                        const result = await sessionBash(sessionId, {
                            command: curlDownloadCommand(transfer.downloadUrl, remotePath),
                            timeout: LARGE_TRANSFER_TIMEOUT_MS,
                        });
                        if (!result.success) {
                            throw new Error(result.error || result.stderr || 'Remote download failed');
                        }
                    } catch (transferError) {
                        if (/Large file transfer storage is not configured/i.test(getErrorMessage(transferError))) {
                            Modal.alert(
                                'Upload failed',
                                `File size (${formatSize(stat.size)}) exceeds the direct transfer limit and large file transfer storage is not configured.`,
                                [{ text: 'OK', style: 'cancel' }],
                            );
                            return;
                        }
                        throw transferError;
                    } finally {
                        if (transfer) {
                            await cleanupQuietly(transfer);
                        }
                    }
                    continue;
                }

                const bytes = await fs.readFile(filePath);
                const base64Content = uint8ArrayToBase64(bytes);

                const result = await sessionWriteFile(sessionId, remotePath, base64Content);
                if (!result.success) {
                    Modal.alert('Upload failed', result.error || 'Unknown error', [{ text: 'OK', style: 'cancel' }]);
                    return;
                }
            }

            onSuccess?.();
        } catch (e: unknown) {
            if (isCancelError(e)) {
                return; // user cancelled dialog
            }
            Modal.alert('Upload failed', getErrorMessage(e), [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setUploading(false);
        }
    }, [sessionId, uploading]);

    const uploadFile = React.useCallback(async (targetDir: string, onSuccess?: () => void) => {
        if (!sessionId || uploading) return;

        const dialog = await getDialog();
        if (!dialog) return;

        try {
            // Pick files before showing upload progress; cancelling should stay quiet.
            const selected = await dialog.open({ multiple: true }) as string | string[] | null;
            if (!selected) return;

            const filePaths = Array.isArray(selected) ? selected : [selected];
            await uploadFiles(targetDir, filePaths, onSuccess);
        } catch (e: unknown) {
            if (isCancelError(e)) {
                return;
            }
            Modal.alert('Upload failed', getErrorMessage(e), [{ text: 'OK', style: 'cancel' }]);
        }
    }, [sessionId, uploading, uploadFiles]);

    const downloadFile = React.useCallback(async (remotePath: string) => {
        if (!sessionId || downloading) return;

        const dialog = await getDialog();
        const fs = await getFs();
        if (!dialog || !fs) return;

        try {
            setDownloading(true);

            // 1. Pick save location
            const fileName = remotePath.split('/').pop() || 'file';
            const savePath = await dialog.save({ defaultPath: fileName });
            if (!savePath) return; // user cancelled

            let transfer: FileTransferLease | null = null;
            try {
                transfer = await createOutboundFileTransfer(fileName);
                const remoteUpload = await sessionBash(sessionId, {
                    command: curlUploadCommand(remotePath, transfer.uploadUrl),
                    timeout: LARGE_TRANSFER_TIMEOUT_MS,
                });
                if (remoteUpload.success) {
                    const bytes = await getObjectBytes(transfer.downloadUrl);
                    await fs.writeFile(savePath, bytes);
                    return;
                }

                if (remoteUpload.error && !/Large file transfer storage is not configured/i.test(remoteUpload.error)) {
                    throw new Error(remoteUpload.error || remoteUpload.stderr || 'Remote upload failed');
                }
            } catch (transferError) {
                if (!/Large file transfer storage is not configured/i.test(getErrorMessage(transferError))) {
                    throw transferError;
                }
            } finally {
                if (transfer) {
                    await cleanupQuietly(transfer);
                }
            }

            // 2. Fallback for servers without transfer storage: fetch file content through RPC.
            const result = await sessionReadFile(sessionId, remotePath);
            if (!result.success || !result.content) {
                Modal.alert('Download failed', result.error || 'File could not be read', [{ text: 'OK', style: 'cancel' }]);
                return;
            }

            // 3. Decode base64 to bytes
            const bytes = base64ToUint8Array(result.content);

            // 4. Write to local filesystem
            await fs.writeFile(savePath, bytes);
        } catch (e: unknown) {
            if (isCancelError(e)) {
                return;
            }
            Modal.alert('Download failed', getErrorMessage(e), [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setDownloading(false);
        }
    }, [sessionId, downloading]);

    // Wrap callbacks to not return promises (React event handlers shouldn't return promises)
    const uploadFileSync = React.useCallback((targetDir: string, onSuccess?: () => void) => {
        void uploadFile(targetDir, onSuccess);
    }, [uploadFile]);

    const uploadFilesSync = React.useCallback((targetDir: string, filePaths: string[], onSuccess?: () => void) => {
        void uploadFiles(targetDir, filePaths, onSuccess);
    }, [uploadFiles]);

    const downloadFileSync = React.useCallback((remotePath: string) => {
        void downloadFile(remotePath);
    }, [downloadFile]);

    return {
        uploading,
        downloading,
        enabled,
        uploadFile: uploadFileSync,
        uploadFiles: uploadFilesSync,
        downloadFile: downloadFileSync,
    };
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
