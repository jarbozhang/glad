import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set globals before any imports
(globalThis as any).__DEV__ = false;

vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (obj: any) => obj.default },
    View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
}));
vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));
vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (fn: any) => (typeof fn === 'function' ? fn({ colors: {}, margins: {} }) : fn) },
    useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock('@/sync/ops', () => ({
    sessionGetDirectoryTree: vi.fn(),
    sessionListDirectory: vi.fn(),
}));
vi.mock('@/components/FileIcon', () => ({ FileIcon: 'FileIcon' }));
vi.mock('@/components/StyledText', () => ({ Text: 'Text' }));
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn() } }));

import {
    EXCLUDED_DIRS,
    formatFileSize,
    filterTree,
    flattenTree,
    sortNodes,
} from './FileTreeView';

describe('FileTreeView utilities', () => {
    describe('EXCLUDED_DIRS', () => {
        it('contains expected directories', () => {
            const expected = ['node_modules', '.git', '.next', 'dist', 'build', '.expo', '__pycache__', '.cache'];
            for (const dir of expected) {
                expect(EXCLUDED_DIRS.has(dir)).toBe(true);
            }
            expect(EXCLUDED_DIRS.size).toBe(expected.length);
        });
    });

    describe('formatFileSize', () => {
        it('returns empty string for undefined', () => {
            expect(formatFileSize(undefined)).toBe('');
        });

        it('formats bytes', () => {
            expect(formatFileSize(500)).toBe('500 B');
            expect(formatFileSize(0)).toBe('0 B');
        });

        it('formats kilobytes', () => {
            expect(formatFileSize(2048)).toBe('2.0 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
        });

        it('formats megabytes', () => {
            expect(formatFileSize(1048576)).toBe('1.0 MB');
            expect(formatFileSize(2621440)).toBe('2.5 MB');
        });
    });

    describe('filterTree', () => {
        it('removes excluded directories', () => {
            const nodes = [
                { name: 'src', path: 'src', type: 'directory' as const },
                { name: 'node_modules', path: 'node_modules', type: 'directory' as const },
                { name: '.git', path: '.git', type: 'directory' as const },
                { name: 'index.ts', path: 'index.ts', type: 'file' as const },
            ];
            const result = filterTree(nodes);
            expect(result.map((n) => n.name)).toEqual(['src', 'index.ts']);
        });

        it('recursively filters nested excluded dirs', () => {
            const nodes = [
                {
                    name: 'packages', path: 'packages', type: 'directory' as const,
                    children: [
                        { name: 'app', path: 'packages/app', type: 'directory' as const },
                        { name: 'node_modules', path: 'packages/node_modules', type: 'directory' as const },
                    ],
                },
            ];
            const result = filterTree(nodes);
            expect(result[0].children!.length).toBe(1);
            expect(result[0].children![0].name).toBe('app');
        });
    });

    describe('flattenTree', () => {
        it('flattens nested tree into a flat list', () => {
            const nodes = [
                {
                    name: 'src', path: 'src', type: 'directory' as const,
                    children: [
                        { name: 'index.ts', path: 'src/index.ts', type: 'file' as const },
                        { name: 'utils.ts', path: 'src/utils.ts', type: 'file' as const },
                    ],
                },
                { name: 'README.md', path: 'README.md', type: 'file' as const },
            ];
            const result = flattenTree(nodes);
            expect(result.map((n) => n.name)).toEqual(['src', 'index.ts', 'utils.ts', 'README.md']);
        });
    });

    describe('sortNodes', () => {
        it('sorts directories before files, then alphabetically', () => {
            const nodes = [
                { name: 'zebra.ts', path: 'zebra.ts', type: 'file' as const },
                { name: 'alpha', path: 'alpha', type: 'directory' as const },
                { name: 'beta.ts', path: 'beta.ts', type: 'file' as const },
                { name: 'zeta', path: 'zeta', type: 'directory' as const },
            ];
            const result = sortNodes(nodes);
            expect(result.map((n) => n.name)).toEqual(['alpha', 'zeta', 'beta.ts', 'zebra.ts']);
        });
    });
});
