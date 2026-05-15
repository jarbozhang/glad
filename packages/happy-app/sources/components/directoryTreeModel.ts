export type DirectoryEntryInput = {
    name: string;
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
};

export type DirectoryTreeNode = {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: number;
    children?: DirectoryTreeNode[];
};

export const EXCLUDED_DIRECTORY_NAMES = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    '.expo',
    '__pycache__',
    '.cache',
]);

export const DIRECTORY_SEARCH_DEBOUNCE_MS = 250;
export const DIRECTORY_SEARCH_MIN_QUERY_LENGTH = 2;
export const DIRECTORY_SEARCH_RESULT_LIMIT = 200;
export const DIRECTORY_SEARCH_MAX_STDOUT_BYTES = 96 * 1024;

const DIRECTORY_SEARCH_BASE_ARGS = [
    '--files',
    '--hidden',
    '--glob', '!node_modules/**',
    '--glob', '!.git/**',
    '--glob', '!.next/**',
    '--glob', '!dist/**',
    '--glob', '!build/**',
    '--glob', '!.expo/**',
    '--glob', '!__pycache__/**',
    '--glob', '!.cache/**',
];

export function isExcludedDirectoryName(name: string): boolean {
    return EXCLUDED_DIRECTORY_NAMES.has(name);
}

export function sortDirectoryNodes(nodes: DirectoryTreeNode[]): DirectoryTreeNode[] {
    return [...nodes].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export function directoryEntriesToTreeNodes(dirPath: string, entries: DirectoryEntryInput[]): DirectoryTreeNode[] {
    return sortDirectoryNodes(entries
        .filter((entry) => entry.type !== 'other')
        .filter((entry) => entry.type !== 'directory' || !isExcludedDirectoryName(entry.name))
        .map((entry) => ({
            name: entry.name,
            path: dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`,
            type: entry.type as 'file' | 'directory',
            size: entry.size,
            modified: entry.modified,
        })));
}

export function mergeDirectoryChildren(
    nodes: DirectoryTreeNode[],
    dirPath: string,
    children: DirectoryTreeNode[],
): DirectoryTreeNode[] {
    return nodes.map((node) => {
        if (node.path === dirPath && node.type === 'directory') {
            return { ...node, children: sortDirectoryNodes(children) };
        }
        if (node.children) {
            return { ...node, children: mergeDirectoryChildren(node.children, dirPath, children) };
        }
        return node;
    });
}

export function formatDirectoryFileSize(bytes: number | undefined): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function escapeRipgrepGlob(value: string): string {
    return value.replace(/[\\*?[\]{}]/g, (match) => `\\${match}`);
}

export function buildDirectorySearchArgs(query: string): string[] {
    return [
        ...DIRECTORY_SEARCH_BASE_ARGS,
        '--iglob',
        `*${escapeRipgrepGlob(query)}*`,
    ];
}

export function shouldSearchDirectory(query: string): boolean {
    return query.trim().length >= DIRECTORY_SEARCH_MIN_QUERY_LENGTH;
}

export function filePathToDirectorySearchNode(path: string): DirectoryTreeNode {
    const normalized = path.replace(/^\.?\//, '');
    return {
        name: normalized.split('/').pop() || normalized,
        path: normalized,
        type: 'file',
    };
}

export function parseDirectorySearchResults(stdout: string, query: string, limit = DIRECTORY_SEARCH_RESULT_LIMIT): DirectoryTreeNode[] {
    const lowered = query.trim().toLowerCase();
    return stdout
        .split('\n')
        .map((path) => path.trim())
        .filter(Boolean)
        .filter((path) => !lowered || path.toLowerCase().includes(lowered))
        .slice(0, limit)
        .map(filePathToDirectorySearchNode);
}

export function getFriendlyDirectoryRpcError(raw: string, fallback = 'Failed to load files'): string {
    if (/timed out|timeout/i.test(raw)) {
        return 'File request timed out. Try a smaller directory or search query.';
    }
    if (/not available|target disconnected|socket has been disconnected/i.test(raw)) {
        return 'Session is offline. Start the CLI to browse files.';
    }
    if (/RPC call failed/i.test(raw)) {
        return 'File request failed. Retry, or narrow the directory/search query.';
    }
    return raw || fallback;
}
