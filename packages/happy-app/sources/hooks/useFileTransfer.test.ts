import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (obj: any) => obj.default },
}));
vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));
vi.mock('react', () => ({
    useState: (init: any) => [init, vi.fn()],
    useCallback: (fn: any) => fn,
}));

const mockOpen = vi.fn();
const mockSave = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: (...args: any[]) => mockOpen(...args),
    save: (...args: any[]) => mockSave(...args),
}));

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
}));

const mockHttpFetch = vi.fn();
vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: (...args: any[]) => mockHttpFetch(...args),
}));

const mockSessionBash = vi.fn();
const mockSessionWriteFile = vi.fn();
vi.mock('@/sync/ops', () => ({
    sessionBash: (...args: any[]) => mockSessionBash(...args),
    sessionWriteFile: (...args: any[]) => mockSessionWriteFile(...args),
}));

const mockCreateInboundFileTransfer = vi.fn();
const mockCreateOutboundFileTransfer = vi.fn();
const mockCleanupFileTransfer = vi.fn();
vi.mock('@/sync/fileTransfer', () => ({
    createInboundFileTransfer: (...args: any[]) => mockCreateInboundFileTransfer(...args),
    createOutboundFileTransfer: (...args: any[]) => mockCreateOutboundFileTransfer(...args),
    cleanupFileTransfer: (...args: any[]) => mockCleanupFileTransfer(...args),
}));

const mockAlert = vi.fn();
vi.mock('@/modal', () => ({
    Modal: { alert: (...args: any[]) => mockAlert(...args) },
}));

(global as any).window = { __TAURI_INTERNALS__: {} };

import {
    buildRemotePath,
    curlDownloadCommand,
    quoteShell,
    useFileTransfer,
} from './useFileTransfer';

describe('useFileTransfer', () => {
    beforeEach(() => {
        mockOpen.mockReset();
        mockSave.mockReset();
        mockReadFile.mockReset();
        mockWriteFile.mockReset();
        mockHttpFetch.mockReset();
        mockSessionBash.mockReset();
        mockSessionWriteFile.mockReset();
        mockCreateInboundFileTransfer.mockReset();
        mockCreateOutboundFileTransfer.mockReset();
        mockCleanupFileTransfer.mockReset();
        mockAlert.mockReset();
    });

    it('builds remote paths without adding ./ prefixes', () => {
        expect(buildRemotePath('.', 'report.html')).toBe('report.html');
        expect(buildRemotePath('', 'report.html')).toBe('report.html');
        expect(buildRemotePath('docs/', 'report.html')).toBe('docs/report.html');
    });

    it('quotes shell values with single quotes safely', () => {
        expect(quoteShell("docs/it's ok.html")).toBe("'docs/it'\\''s ok.html'");
    });

    it('generates remote download commands that do not overwrite target files', () => {
        const command = curlDownloadCommand('https://oss.test/download', 'docs/report.html');
        expect(command).toContain('if [ -e "$target" ]');
        expect(command).toContain('curl');
        expect(command).toContain('mv -- "$tmp" "$target"');
    });

    it('reports enabled in Tauri environment', () => {
        const hook = useFileTransfer('sess1');
        expect(hook.enabled).toBe(true);
    });

    it('upload uses transfer storage and remote curl, not sessionWriteFile', async () => {
        mockOpen.mockResolvedValue('/Users/test/diagram.html');
        mockReadFile.mockResolvedValue(new Uint8Array([60, 33, 68, 79, 67]));
        mockCreateInboundFileTransfer.mockResolvedValue({
            transferId: 't-html',
            uploadUrl: 'https://oss.test/upload-html',
            downloadUrl: 'https://oss.test/download-html',
            objectName: 'transfers/u/t-html/diagram.html',
            expiresAt: Date.now() + 1000,
        });
        mockHttpFetch.mockResolvedValue({ ok: true });
        mockSessionBash.mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.uploadFile('docs', onSuccess);

        await vi.waitFor(() => {
            expect(mockSessionBash).toHaveBeenCalled();
        });

        expect(mockOpen).toHaveBeenCalledWith({ multiple: false });
        expect(mockSessionWriteFile).not.toHaveBeenCalled();
        expect(mockHttpFetch).toHaveBeenCalledWith('https://oss.test/upload-html', expect.objectContaining({ method: 'PUT' }));
        expect(mockSessionBash).toHaveBeenCalledWith('sess1', expect.objectContaining({
            command: expect.stringContaining('docs/diagram.html'),
        }));
        expect(mockCleanupFileTransfer).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
    });

    it('download uses transfer storage and remote curl upload', async () => {
        mockSave.mockResolvedValue('/Users/test/Downloads/report.pdf');
        mockCreateOutboundFileTransfer.mockResolvedValue({
            transferId: 't-pdf',
            uploadUrl: 'https://oss.test/upload-pdf',
            downloadUrl: 'https://oss.test/download-pdf',
            objectName: 'transfers/u/t-pdf/report.pdf',
            expiresAt: Date.now() + 1000,
        });
        mockSessionBash.mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 });
        mockHttpFetch.mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });
        mockWriteFile.mockResolvedValue(undefined);

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.downloadFile('docs/report.pdf', onSuccess);

        await vi.waitFor(() => {
            expect(mockWriteFile).toHaveBeenCalled();
        });

        expect(mockSessionBash).toHaveBeenCalledWith('sess1', expect.objectContaining({
            command: expect.stringContaining('--upload-file'),
        }));
        expect(mockHttpFetch).toHaveBeenCalledWith('https://oss.test/download-pdf');
        expect(mockWriteFile).toHaveBeenCalledWith('/Users/test/Downloads/report.pdf', expect.any(Uint8Array));
        expect(mockCleanupFileTransfer).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
    });

    it('shows a clear error when transfer storage is unavailable', async () => {
        mockOpen.mockResolvedValue('/Users/test/file.txt');
        mockCreateInboundFileTransfer.mockRejectedValue(new Error('Large file transfer storage is not configured'));

        const hook = useFileTransfer('sess1');
        hook.uploadFile('.');

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(mockSessionWriteFile).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith(
            'Upload failed',
            expect.stringContaining('File transfer storage is not configured'),
            expect.any(Array),
        );
    });

    it('cancels upload dialogs silently', async () => {
        mockOpen.mockResolvedValue(null);

        const hook = useFileTransfer('sess1');
        hook.uploadFile('.');

        await vi.waitFor(() => {
            expect(mockOpen).toHaveBeenCalled();
        });

        expect(mockCreateInboundFileTransfer).not.toHaveBeenCalled();
        expect(mockAlert).not.toHaveBeenCalled();
    });
});
