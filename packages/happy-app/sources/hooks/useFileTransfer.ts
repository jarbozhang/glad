import * as React from 'react';
import { Modal } from '@/modal';
import { sessionBash } from '@/sync/ops';
import {
    cleanupFileTransfer,
    createInboundFileTransfer,
    createOutboundFileTransfer,
    type FileTransferLease,
} from '@/sync/fileTransfer';
import { isTauri } from '@/utils/platform';

const LARGE_TRANSFER_TIMEOUT_MS = 30 * 60 * 1000;

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

export interface UseFileTransferResult {
    uploading: boolean;
    downloading: boolean;
    enabled: boolean;
    uploadFile: (targetDir: string, onSuccess?: () => void) => void;
    downloadFile: (remotePath: string, onSuccess?: () => void) => void;
}

function getFileName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop() || 'file';
}

export function buildRemotePath(targetDir: string, fileName: string): string {
    return !targetDir || targetDir === '.'
        ? fileName
        : `${targetDir.replace(/\/+$/g, '')}/${fileName}`;
}

export function quoteShell(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
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

function isTransferStorageUnavailable(error: unknown): boolean {
    return /Large file transfer storage is not configured/i.test(getErrorMessage(error));
}

function transferUnavailableMessage(fileName: string): string {
    return `File transfer storage is not configured. Unable to transfer ${fileName}.`;
}

export function curlUploadCommand(localPath: string, uploadUrl: string): string {
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

export function curlDownloadCommand(downloadUrl: string, remotePath: string): string {
    const quotedTarget = quoteShell(remotePath);
    const quotedTemp = quoteShell(`${remotePath}.happy-download-${Date.now()}.tmp`);
    return [
        'set -e;',
        `target=${quotedTarget};`,
        `tmp=${quotedTemp};`,
        'if [ -e "$target" ]; then echo "Target file already exists" >&2; exit 73; fi;',
        'curl',
        '--fail',
        '--location',
        '--retry', '5',
        '--retry-delay', '2',
        '--connect-timeout', '20',
        '--max-time', String(Math.floor(LARGE_TRANSFER_TIMEOUT_MS / 1000)),
        '--output', '"$tmp"',
        quoteShell(downloadUrl),
        '&& mv -- "$tmp" "$target"',
    ].join(' ');
}

async function cleanupQuietly(transfer: FileTransferLease) {
    try {
        await cleanupFileTransfer(transfer);
    } catch {
        // Transfer objects are scratch data; cleanup failures should not mask the user action.
    }
}

async function putObject(url: string, bytes: Uint8Array): Promise<Response> {
    const http = await getHttp();
    const standalone = new Uint8Array(bytes);
    return await (http?.fetch ?? fetch)(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: standalone.buffer,
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

    const uploadFileAsync = React.useCallback(async (targetDir: string, onSuccess?: () => void) => {
        if (!sessionId || uploading) return;

        const dialog = await getDialog();
        const fs = await getFs();
        if (!dialog || !fs) return;

        try {
            const selected = await dialog.open({ multiple: false }) as string | string[] | null;
            if (!selected) return;

            const filePath = Array.isArray(selected) ? selected[0] : selected;
            if (!filePath) return;

            setUploading(true);

            const fileName = getFileName(filePath);
            const remotePath = buildRemotePath(targetDir, fileName);
            let transfer: FileTransferLease | null = null;

            try {
                transfer = await createInboundFileTransfer(fileName);
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
            } catch (error) {
                if (isTransferStorageUnavailable(error)) {
                    Modal.alert('Upload failed', transferUnavailableMessage(fileName), [{ text: 'OK', style: 'cancel' }]);
                    return;
                }
                throw error;
            } finally {
                if (transfer) await cleanupQuietly(transfer);
            }

            onSuccess?.();
        } catch (error) {
            if (isCancelError(error)) return;
            Modal.alert('Upload failed', getErrorMessage(error), [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setUploading(false);
        }
    }, [sessionId, uploading]);

    const downloadFileAsync = React.useCallback(async (remotePath: string, onSuccess?: () => void) => {
        if (!sessionId || downloading) return;

        const dialog = await getDialog();
        const fs = await getFs();
        if (!dialog || !fs) return;

        try {
            const fileName = getFileName(remotePath);
            const savePath = await dialog.save({ defaultPath: fileName });
            if (!savePath) return;

            setDownloading(true);

            let transfer: FileTransferLease | null = null;
            try {
                transfer = await createOutboundFileTransfer(fileName);
                const remoteUpload = await sessionBash(sessionId, {
                    command: curlUploadCommand(remotePath, transfer.uploadUrl),
                    timeout: LARGE_TRANSFER_TIMEOUT_MS,
                });
                if (!remoteUpload.success) {
                    throw new Error(remoteUpload.error || remoteUpload.stderr || 'Remote upload failed');
                }

                const bytes = await getObjectBytes(transfer.downloadUrl);
                await fs.writeFile(savePath, bytes);
            } catch (error) {
                if (isTransferStorageUnavailable(error)) {
                    Modal.alert('Download failed', transferUnavailableMessage(fileName), [{ text: 'OK', style: 'cancel' }]);
                    return;
                }
                throw error;
            } finally {
                if (transfer) await cleanupQuietly(transfer);
            }

            onSuccess?.();
        } catch (error) {
            if (isCancelError(error)) return;
            Modal.alert('Download failed', getErrorMessage(error), [{ text: 'OK', style: 'cancel' }]);
        } finally {
            setDownloading(false);
        }
    }, [sessionId, downloading]);

    return {
        uploading,
        downloading,
        enabled,
        uploadFile: React.useCallback((targetDir: string, onSuccess?: () => void) => {
            void uploadFileAsync(targetDir, onSuccess);
        }, [uploadFileAsync]),
        downloadFile: React.useCallback((remotePath: string, onSuccess?: () => void) => {
            void downloadFileAsync(remotePath, onSuccess);
        }, [downloadFileAsync]),
    };
}
