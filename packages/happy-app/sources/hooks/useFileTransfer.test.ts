import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native and device-info (transitive deps via platform.ts)
vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (obj: any) => obj.default },
}));
vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));

// Mock React — stub useState, useCallback passes through
vi.mock('react', () => ({
    useState: (init: any) => [init, vi.fn()],
    useCallback: (fn: any) => fn,
}));

// Mock Tauri dialog
const mockOpen = vi.fn();
const mockSave = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: (...args: any[]) => mockOpen(...args),
    save: (...args: any[]) => mockSave(...args),
}));

// Mock Tauri fs
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockStat = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    stat: (...args: any[]) => mockStat(...args),
}));

// Mock Tauri HTTP
const mockHttpFetch = vi.fn();
vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: (...args: any[]) => mockHttpFetch(...args),
}));

// Mock session RPC ops
const mockSessionWriteFile = vi.fn();
const mockSessionReadFile = vi.fn();
const mockSessionBash = vi.fn();
vi.mock('@/sync/ops', () => ({
    sessionWriteFile: (...args: any[]) => mockSessionWriteFile(...args),
    sessionReadFile: (...args: any[]) => mockSessionReadFile(...args),
    sessionBash: (...args: any[]) => mockSessionBash(...args),
}));

const mockCreateInboundFileTransfer = vi.fn();
const mockCreateOutboundFileTransfer = vi.fn();
const mockCleanupFileTransfer = vi.fn();
vi.mock('@/sync/fileTransfer', () => ({
    createInboundFileTransfer: (...args: any[]) => mockCreateInboundFileTransfer(...args),
    createOutboundFileTransfer: (...args: any[]) => mockCreateOutboundFileTransfer(...args),
    cleanupFileTransfer: (...args: any[]) => mockCleanupFileTransfer(...args),
}));

// Mock Modal
const mockAlert = vi.fn();
vi.mock('@/modal', () => ({
    Modal: { alert: (...args: any[]) => mockAlert(...args) },
}));

// Set __TAURI_INTERNALS__ to make isTauri() return true
(global as any).window = {
    __TAURI_INTERNALS__: {},
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
};

import { useFileTransfer } from './useFileTransfer';

describe('useFileTransfer', () => {
    beforeEach(() => {
        mockOpen.mockReset();
        mockSave.mockReset();
        mockReadFile.mockReset();
        mockWriteFile.mockReset();
        mockStat.mockReset();
        mockHttpFetch.mockReset();
        mockSessionWriteFile.mockReset();
        mockSessionReadFile.mockReset();
        mockSessionBash.mockReset();
        mockCreateInboundFileTransfer.mockReset();
        mockCreateOutboundFileTransfer.mockReset();
        mockCleanupFileTransfer.mockReset();
        mockAlert.mockReset();
    });

    it('enabled is true in Tauri environment', () => {
        const hook = useFileTransfer('sess1');
        expect(hook.enabled).toBe(true);
    });

    it('enabled is false when not Tauri', () => {
        const saved = (global as any).window.__TAURI_INTERNALS__;
        delete (global as any).window.__TAURI_INTERNALS__;

        const hook = useFileTransfer('sess1');
        expect(hook.enabled).toBe(false);

        (global as any).window.__TAURI_INTERNALS__ = saved;
    });

    it('upload: full success flow', async () => {
        mockOpen.mockResolvedValue('/Users/test/photo.png');
        mockStat.mockResolvedValue({ size: 1024 });
        mockReadFile.mockResolvedValue(new Uint8Array([72, 101, 108, 108, 111]));
        mockSessionWriteFile.mockResolvedValue({ success: true });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        // uploadFile is the sync wrapper that fires-and-forgets the async fn
        hook.uploadFile('docs', onSuccess);

        await vi.waitFor(() => {
            expect(mockSessionWriteFile).toHaveBeenCalled();
        });

        expect(mockOpen).toHaveBeenCalledWith({ multiple: true });
        expect(mockStat).toHaveBeenCalledWith('/Users/test/photo.png');
        expect(mockSessionWriteFile).toHaveBeenCalledWith('sess1', 'docs/photo.png', expect.any(String));
        expect(onSuccess).toHaveBeenCalled();
    });

    it('upload: supports selecting multiple files', async () => {
        mockOpen.mockResolvedValue(['/Users/test/photo.png', '/Users/test/readme.md']);
        mockStat.mockResolvedValue({ size: 1024 });
        mockReadFile
            .mockResolvedValueOnce(new Uint8Array([65]))
            .mockResolvedValueOnce(new Uint8Array([66]));
        mockSessionWriteFile.mockResolvedValue({ success: true });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.uploadFile('.', onSuccess);

        await vi.waitFor(() => {
            expect(mockSessionWriteFile).toHaveBeenCalledTimes(2);
        });

        expect(mockOpen).toHaveBeenCalledWith({ multiple: true });
        expect(mockSessionWriteFile).toHaveBeenNthCalledWith(1, 'sess1', 'photo.png', expect.any(String));
        expect(mockSessionWriteFile).toHaveBeenNthCalledWith(2, 'sess1', 'readme.md', expect.any(String));
        expect(onSuccess).toHaveBeenCalled();
    });

    it('uploadFiles: uploads provided local paths without opening picker', async () => {
        mockStat.mockResolvedValue({ size: 512 });
        mockReadFile.mockResolvedValue(new Uint8Array([72, 105]));
        mockSessionWriteFile.mockResolvedValue({ success: true });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.uploadFiles('src', ['C:\\Users\\test\\notes.txt'], onSuccess);

        await vi.waitFor(() => {
            expect(mockSessionWriteFile).toHaveBeenCalled();
        });

        expect(mockOpen).not.toHaveBeenCalled();
        expect(mockSessionWriteFile).toHaveBeenCalledWith('sess1', 'src/notes.txt', expect.any(String));
        expect(onSuccess).toHaveBeenCalled();
    });

    it('upload: user cancels dialog silently', async () => {
        mockOpen.mockResolvedValue(null);

        const hook = useFileTransfer('sess1');
        hook.uploadFile('docs');

        // Let microtasks flush
        await vi.waitFor(() => {
            expect(mockOpen).toHaveBeenCalled();
        });

        expect(mockStat).not.toHaveBeenCalled();
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('upload: large file uses transfer storage and remote curl', async () => {
        mockOpen.mockResolvedValue('/Users/test/big.zip');
        mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 });
        mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
        mockCreateInboundFileTransfer.mockResolvedValue({
            transferId: 't1',
            uploadUrl: 'https://storage/upload',
            downloadUrl: 'https://storage/download',
            objectName: 'transfers/u/t1/big.zip',
            expiresAt: Date.now() + 1000,
        });
        mockHttpFetch.mockResolvedValue({ ok: true });
        mockSessionBash.mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.uploadFile('.', onSuccess);

        await vi.waitFor(() => {
            expect(mockSessionBash).toHaveBeenCalled();
        });

        expect(mockSessionWriteFile).not.toHaveBeenCalled();
        expect(mockHttpFetch).toHaveBeenCalledWith('https://storage/upload', expect.objectContaining({ method: 'PUT' }));
        expect(mockSessionBash).toHaveBeenCalledWith('sess1', expect.objectContaining({
            command: expect.stringContaining('curl'),
        }));
        expect(mockCleanupFileTransfer).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalled();
    });

    it('upload: large file shows a clear error when transfer storage is unavailable', async () => {
        mockOpen.mockResolvedValue('/Users/test/big.zip');
        mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 });
        mockCreateInboundFileTransfer.mockRejectedValue(new Error('Large file transfer storage is not configured'));

        const hook = useFileTransfer('sess1');
        hook.uploadFile('.');

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(mockSessionWriteFile).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith(
            'Upload failed',
            expect.stringContaining('large file transfer storage is not configured'),
            expect.any(Array),
        );
    });

    it('upload: RPC failure shows alert', async () => {
        mockOpen.mockResolvedValue('/Users/test/file.txt');
        mockStat.mockResolvedValue({ size: 100 });
        mockReadFile.mockResolvedValue(new Uint8Array([65]));
        mockSessionWriteFile.mockResolvedValue({ success: false, error: 'Disk full' });

        const onSuccess = vi.fn();
        const hook = useFileTransfer('sess1');
        hook.uploadFile('.', onSuccess);

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(onSuccess).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith('Upload failed', 'Disk full', expect.any(Array));
    });

    it('upload: string errors show the underlying message', async () => {
        mockOpen.mockResolvedValue('/Users/test/file.txt');
        mockStat.mockRejectedValue('path not allowed by the configured scope');

        const hook = useFileTransfer('sess1');
        hook.uploadFile('.');

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(mockAlert).toHaveBeenCalledWith(
            'Upload failed',
            'path not allowed by the configured scope',
            expect.any(Array),
        );
    });

    it('download: full success flow', async () => {
        mockCreateOutboundFileTransfer.mockRejectedValue(new Error('Large file transfer storage is not configured'));
        mockSessionReadFile.mockResolvedValue({ success: true, content: 'SGVsbG8=' });
        mockSave.mockResolvedValue('/Users/test/Downloads/readme.md');
        mockWriteFile.mockResolvedValue(undefined);

        const hook = useFileTransfer('sess1');
        hook.downloadFile('project/readme.md');

        await vi.waitFor(() => {
            expect(mockWriteFile).toHaveBeenCalled();
        });

        expect(mockSessionReadFile).toHaveBeenCalledWith('sess1', 'project/readme.md');
        expect(mockSave).toHaveBeenCalledWith({ defaultPath: 'readme.md' });
        expect(mockWriteFile).toHaveBeenCalledWith('/Users/test/Downloads/readme.md', expect.any(Uint8Array));
    });

    it('download: uses transfer storage and remote curl when available', async () => {
        mockCreateOutboundFileTransfer.mockResolvedValue({
            transferId: 't2',
            uploadUrl: 'https://storage/upload',
            downloadUrl: 'https://storage/download',
            objectName: 'transfers/u/t2/readme.md',
            expiresAt: Date.now() + 1000,
        });
        mockSessionBash.mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 });
        mockHttpFetch.mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new Uint8Array([72, 105]).buffer,
        });
        mockSave.mockResolvedValue('/Users/test/Downloads/readme.md');
        mockWriteFile.mockResolvedValue(undefined);

        const hook = useFileTransfer('sess1');
        hook.downloadFile('project/readme.md');

        await vi.waitFor(() => {
            expect(mockWriteFile).toHaveBeenCalled();
        });

        expect(mockSessionReadFile).not.toHaveBeenCalled();
        expect(mockSessionBash).toHaveBeenCalledWith('sess1', expect.objectContaining({
            command: expect.stringContaining('--upload-file'),
        }));
        expect(mockHttpFetch).toHaveBeenCalledWith('https://storage/download');
        expect(mockCleanupFileTransfer).toHaveBeenCalled();
    });

    it('download: RPC failure shows alert', async () => {
        mockCreateOutboundFileTransfer.mockRejectedValue(new Error('Large file transfer storage is not configured'));
        mockSessionReadFile.mockResolvedValue({ success: false, error: 'Not found' });
        mockSave.mockResolvedValue('/Users/test/Downloads/missing.txt');

        const hook = useFileTransfer('sess1');
        hook.downloadFile('missing.txt');

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(mockSave).toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith('Download failed', 'Not found', expect.any(Array));
    });

    it('download: string errors show the underlying message', async () => {
        mockCreateOutboundFileTransfer.mockRejectedValue(new Error('Large file transfer storage is not configured'));
        mockSessionReadFile.mockResolvedValue({ success: true, content: 'SGVsbG8=' });
        mockSave.mockResolvedValue('/Users/test/Downloads/readme.md');
        mockWriteFile.mockRejectedValue('path not allowed by the configured scope');

        const hook = useFileTransfer('sess1');
        hook.downloadFile('project/readme.md');

        await vi.waitFor(() => {
            expect(mockAlert).toHaveBeenCalled();
        });

        expect(mockAlert).toHaveBeenCalledWith(
            'Download failed',
            'path not allowed by the configured scope',
            expect.any(Array),
        );
    });
});
