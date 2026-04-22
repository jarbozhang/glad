import { describe, it, expect, vi } from 'vitest';

// Provide __DEV__ global (used by expo-modules-core)
(globalThis as any).__DEV__ = false;

vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (obj: any) => obj.default },
    View: 'View',
    ScrollView: 'ScrollView',
    ActivityIndicator: 'ActivityIndicator',
    Pressable: 'Pressable',
}));
vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));
vi.mock('react-native-unistyles', () => {
    const handler: ProxyHandler<any> = { get: (_t, _p) => new Proxy({}, handler) };
    const dp: any = new Proxy({}, handler);
    return {
        StyleSheet: { create: (fn: any) => (typeof fn === 'function' ? fn(dp, dp) : fn) },
        useUnistyles: () => ({ theme: dp }),
    };
});
vi.mock('@/sync/ops', () => ({}));
vi.mock('@/sync/storage', () => ({ storage: { getState: () => ({}) }, useSessionFileCache: () => null }));
vi.mock('@/components/SimpleSyntaxHighlighter', () => ({}));
vi.mock('@/components/FileIcon', () => ({}));
vi.mock('@/components/StyledText', () => ({ Text: 'Text' }));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}), mono: () => ({}) } }));
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn() } }));

import { decodeBase64ToBytes, isBinaryContent, getFileLanguage, MAX_LINES } from './FilePreviewPanel';

describe('isBinaryContent', () => {
    it('should return false for pure printable text', () => {
        const text = new TextEncoder().encode('Hello, world!\nLine two.\n');
        expect(isBinaryContent(text)).toBe(false);
    });

    it('should return true when a null byte is present', () => {
        const bytes = new Uint8Array([72, 101, 108, 0, 111]);
        expect(isBinaryContent(bytes)).toBe(true);
    });

    it('should return true when non-printable ratio exceeds 10%', () => {
        // 20 bytes: 18 control chars (0x01) + 2 printable → 90% non-printable
        const bytes = new Uint8Array(20);
        bytes.fill(0x01); // non-printable, non-null
        bytes[0] = 65; // 'A'
        bytes[1] = 66; // 'B'
        expect(isBinaryContent(bytes)).toBe(true);
    });
});

describe('decodeBase64ToBytes', () => {
    it('should correctly decode a base64 string', () => {
        const base64 = btoa('Hello');
        const bytes = decodeBase64ToBytes(base64);
        const decoded = new TextDecoder().decode(bytes);
        expect(decoded).toBe('Hello');
    });
});

describe('getFileLanguage', () => {
    it('should map .ts to typescript', () => {
        expect(getFileLanguage('src/index.ts')).toBe('typescript');
    });

    it('should map .py to python', () => {
        expect(getFileLanguage('script.py')).toBe('python');
    });

    it('should map .md to markdown', () => {
        expect(getFileLanguage('README.md')).toBe('markdown');
    });

    it('should return null for unknown extensions', () => {
        expect(getFileLanguage('data.xyz')).toBeNull();
    });
});

describe('line truncation logic', () => {
    it('should truncate content exceeding MAX_LINES', () => {
        const lines = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`);
        const content = lines.join('\n');
        const split = content.split('\n');
        const truncated = split.length > MAX_LINES
            ? split.slice(0, MAX_LINES).join('\n')
            : content;
        expect(truncated.split('\n')).toHaveLength(MAX_LINES);
        expect(truncated.split('\n')[0]).toBe('line 1');
        expect(truncated.split('\n')[MAX_LINES - 1]).toBe(`line ${MAX_LINES}`);
    });
});
