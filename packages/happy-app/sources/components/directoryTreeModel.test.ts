import { describe, expect, it } from 'vitest';
import {
    DIRECTORY_SEARCH_MIN_QUERY_LENGTH,
    EXCLUDED_DIRECTORY_NAMES,
    buildDirectorySearchArgs,
    directoryEntriesToTreeNodes,
    escapeRipgrepGlob,
    formatDirectoryFileSize,
    getFriendlyDirectoryRpcError,
    mergeDirectoryChildren,
    parseDirectorySearchResults,
    shouldSearchDirectory,
    sortDirectoryNodes,
} from './directoryTreeModel';

describe('directoryTreeModel', () => {
    it('defines the directory exclusions used by the file directory tab', () => {
        expect([...EXCLUDED_DIRECTORY_NAMES]).toEqual([
            'node_modules',
            '.git',
            '.next',
            'dist',
            'build',
            '.expo',
            '__pycache__',
            '.cache',
        ]);
    });

    it('converts directory entries, filters non-files and excluded directories, and sorts directories first', () => {
        const result = directoryEntriesToTreeNodes('.', [
            { name: 'README.md', type: 'file', size: 120 },
            { name: '.git', type: 'directory' },
            { name: 'src', type: 'directory' },
            { name: 'socket', type: 'other' },
            { name: 'package.json', type: 'file' },
        ]);

        expect(result).toEqual([
            { name: 'src', path: 'src', type: 'directory', size: undefined, modified: undefined },
            { name: 'package.json', path: 'package.json', type: 'file', size: undefined, modified: undefined },
            { name: 'README.md', path: 'README.md', type: 'file', size: 120, modified: undefined },
        ]);
    });

    it('builds nested child paths for directory entries', () => {
        expect(directoryEntriesToTreeNodes('packages/app', [
            { name: 'index.ts', type: 'file' },
        ])[0].path).toBe('packages/app/index.ts');
    });

    it('sorts directories before files and then alphabetically', () => {
        const result = sortDirectoryNodes([
            { name: 'zebra.ts', path: 'zebra.ts', type: 'file' },
            { name: 'alpha', path: 'alpha', type: 'directory' },
            { name: 'beta.ts', path: 'beta.ts', type: 'file' },
            { name: 'zeta', path: 'zeta', type: 'directory' },
        ]);

        expect(result.map((node) => node.name)).toEqual(['alpha', 'zeta', 'beta.ts', 'zebra.ts']);
    });

    it('merges lazy-loaded children into the target directory only', () => {
        const result = mergeDirectoryChildren([
            { name: 'src', path: 'src', type: 'directory' },
            { name: 'README.md', path: 'README.md', type: 'file' },
        ], 'src', [
            { name: 'index.ts', path: 'src/index.ts', type: 'file' },
        ]);

        expect(result).toEqual([
            { name: 'src', path: 'src', type: 'directory', children: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }] },
            { name: 'README.md', path: 'README.md', type: 'file' },
        ]);
    });

    it('formats file sizes', () => {
        expect(formatDirectoryFileSize(undefined)).toBe('');
        expect(formatDirectoryFileSize(500)).toBe('500 B');
        expect(formatDirectoryFileSize(2048)).toBe('2.0 KB');
        expect(formatDirectoryFileSize(1048576)).toBe('1.0 MB');
    });

    it('builds bounded ripgrep search args', () => {
        const args = buildDirectorySearchArgs('a[b]*');
        expect(args).toContain('--files');
        expect(args).toContain('--hidden');
        expect(args).toContain('!node_modules/**');
        expect(args.slice(-2)).toEqual(['--iglob', '*a\\[b\\]\\**']);
        expect(escapeRipgrepGlob('a[b]*?{c}\\d')).toBe('a\\[b\\]\\*\\?\\{c\\}\\\\d');
    });

    it('guards short search queries', () => {
        expect(DIRECTORY_SEARCH_MIN_QUERY_LENGTH).toBe(2);
        expect(shouldSearchDirectory('a')).toBe(false);
        expect(shouldSearchDirectory('ab')).toBe(true);
        expect(shouldSearchDirectory(' ab ')).toBe(true);
    });

    it('parses ripgrep file results into file nodes and respects the limit', () => {
        const result = parseDirectorySearchResults('./src/index.ts\nsrc/app.ts\nREADME.md\n', 'src', 1);
        expect(result).toEqual([
            { name: 'index.ts', path: 'src/index.ts', type: 'file' },
        ]);
    });

    it('converts common RPC failures into friendly copy', () => {
        expect(getFriendlyDirectoryRpcError('operation has timed out')).toContain('timed out');
        expect(getFriendlyDirectoryRpcError('RPC method not available')).toContain('Session is offline');
        expect(getFriendlyDirectoryRpcError('RPC call failed')).toContain('File request failed');
    });
});
