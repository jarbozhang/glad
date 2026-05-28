import * as React from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { sessionListDirectory, sessionRipgrep } from '@/sync/ops';
import { FileIcon } from '@/components/FileIcon';
import { Text } from '@/components/StyledText';
import { Modal } from '@/modal';
import { isTauri } from '@/utils/platform';

// Exported for testing
export const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.expo', '__pycache__', '.cache',
]);

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_QUERY_LENGTH = 2;
const SEARCH_RESULT_LIMIT = 200;
const SEARCH_MAX_STDOUT_BYTES = 96 * 1024;
const SEARCH_BASE_ARGS = [
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

interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: number;
    children?: TreeNode[];
}

interface FileTreeViewProps {
    sessionId: string;
    searchQuery: string;
    refreshKey?: number;
    dropLabel?: string;
    onFileSelect: (path: string, size?: number) => void;
    onUpload?: (targetDir: string) => void;
    onUploadFiles?: (targetDir: string, filePaths: string[]) => void;
}

// Exported for testing
export function formatFileSize(bytes: number | undefined): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Exported for testing
export function filterTree(nodes: TreeNode[]): TreeNode[] {
    return nodes
        .filter((n) => !EXCLUDED_DIRS.has(n.name))
        .map((n) => {
            if (n.children) {
                return { ...n, children: filterTree(n.children) };
            }
            return n;
        });
}

// Exported for testing
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.children) {
            result.push(...flattenTree(node.children));
        }
    }
    return result;
}

// Exported for testing
export function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return [...nodes].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export function directoryEntriesToTreeNodes(dirPath: string, entries: {
    name: string;
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
}[]): TreeNode[] {
    return entries
        .filter((e) => e.type !== 'other' && !EXCLUDED_DIRS.has(e.name))
        .map((e) => ({
            name: e.name,
            path: dirPath === '.' ? e.name : `${dirPath}/${e.name}`,
            type: e.type as 'file' | 'directory',
            size: e.size,
            modified: e.modified,
        }));
}

export function filePathToSearchNode(path: string): TreeNode {
    const normalized = path.replace(/^\.?\//, '');
    return {
        name: normalized.split('/').pop() || normalized,
        path: normalized,
        type: 'file',
    };
}

export function escapeRipgrepGlob(value: string): string {
    return value.replace(/[\\*?[\]{}]/g, (match) => `\\${match}`);
}

export function buildSearchArgs(query: string): string[] {
    return [
        ...SEARCH_BASE_ARGS,
        '--iglob',
        `*${escapeRipgrepGlob(query)}*`,
    ];
}

export function getFriendlyFileRpcError(raw: string, fallback = 'Failed to load files'): string {
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

// -- TreeNodeRow component --

interface TreeNodeRowProps {
    node: TreeNode;
    depth: number;
    expanded: boolean;
    loading: boolean;
    onToggle: () => void;
    onFileSelect: (path: string, size?: number) => void;
    onUpload?: (targetDir: string) => void;
}

const TreeNodeRow = React.memo(function TreeNodeRow({
    node, depth, expanded, loading, onToggle, onFileSelect, onUpload,
}: TreeNodeRowProps) {
    const [hovered, setHovered] = React.useState(false);
    const indent = Math.min(depth, 5) * 12;
    const isDir = node.type === 'directory';

    const handlePress = React.useCallback(() => {
        if (isDir) {
            onToggle();
        } else {
            onFileSelect(node.path, node.size);
        }
    }, [isDir, onToggle, onFileSelect, node.path, node.size]);

    const handleUpload = React.useCallback(() => {
        onUpload?.(node.path);
    }, [onUpload, node.path]);

    return (
        <Pressable
            style={[styles.row, { paddingLeft: indent + 8 }]}
            onPress={handlePress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
        >
            {isDir && (
                <Text style={styles.arrow}>{loading ? '' : expanded ? '▼' : '▶'}</Text>
            )}
            {isDir && loading && (
                <ActivityIndicator size={10} style={styles.inlineLoader} />
            )}
            {!isDir && <View style={styles.arrowSpacer} />}
            <FileIcon fileName={isDir ? '__folder__' : node.name} size={16} />
            <Text style={styles.fileName} numberOfLines={1}>{node.name}</Text>
            {node.size !== undefined && !isDir && (
                <Text style={styles.fileSize}>{formatFileSize(node.size)}</Text>
            )}
            {isDir && hovered && onUpload && (
                <Pressable onPress={handleUpload} style={styles.uploadBtn}>
                    <Text style={styles.uploadIcon}>↑</Text>
                </Pressable>
            )}
        </Pressable>
    );
});

// -- Main FileTreeView component --

export const FileTreeView = React.memo(function FileTreeView({
    sessionId, searchQuery, refreshKey = 0, dropLabel, onFileSelect, onUpload, onUploadFiles,
}: FileTreeViewProps) {
    const [tree, setTree] = React.useState<TreeNode[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [searchResults, setSearchResults] = React.useState<TreeNode[] | null>(null);
    const [searchLoading, setSearchLoading] = React.useState(false);
    const [searchError, setSearchError] = React.useState<string | null>(null);
    const [dropActive, setDropActive] = React.useState(false);
    const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
    const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(new Set());
    const containerRef = React.useRef<any>(null);
    const uploadFilesRef = React.useRef(onUploadFiles);
    const dropEnabled = !!onUploadFiles;
    // Track which dirs have had their children loaded (to distinguish "not loaded" vs "empty")
    const loadedDirsRef = React.useRef<Set<string>>(new Set());

    React.useEffect(() => {
        uploadFilesRef.current = onUploadFiles;
    }, [onUploadFiles]);

    // Initial load
    const loadTree = React.useCallback(async () => {
        setInitialLoading(true);
        setError(null);
        loadedDirsRef.current.clear();
        setExpandedPaths(new Set());
        setLoadingPaths(new Set());
        try {
            const res = await sessionListDirectory(sessionId, '.');
            if (!res.success || !res.entries) {
                setError(getFriendlyFileRpcError(res.error || 'Failed to load directory'));
                return;
            }
            const rootChildren = directoryEntriesToTreeNodes('.', res.entries);
            loadedDirsRef.current.add('.');
            setTree(sortNodes(rootChildren));
        } catch (e) {
            const raw = e instanceof Error ? e.message : 'Unknown error';
            console.warn('[FileTreeView] loadTree error:', raw);
            setError(getFriendlyFileRpcError(raw));
        } finally {
            setInitialLoading(false);
        }
    }, [sessionId]);

    React.useEffect(() => {
        loadTree();
    }, [loadTree, refreshKey]);

    React.useEffect(() => {
        if (!dropEnabled || !isTauri()) return;

        let unlisten: (() => void) | null = null;
        let cancelled = false;

        const isInsidePanel = (position: { x: number; y: number }) => {
            const node = containerRef.current;
            if (!node) return false;

            const rect = typeof node.getBoundingClientRect === 'function'
                ? node.getBoundingClientRect()
                : null;
            if (!rect) return false;

            const scale = typeof window !== 'undefined'
                ? window.devicePixelRatio || 1
                : 1;
            const x = position.x / scale;
            const y = position.y / scale;

            return x >= rect.left &&
                x <= rect.right &&
                y >= rect.top &&
                y <= rect.bottom;
        };

        void import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => getCurrentWindow().onDragDropEvent((event) => {
                if (event.payload.type === 'enter' || event.payload.type === 'over') {
                    setDropActive(isInsidePanel(event.payload.position));
                    return;
                }

                if (event.payload.type === 'drop') {
                    const insidePanel = isInsidePanel(event.payload.position);
                    setDropActive(false);
                    if (insidePanel && event.payload.paths.length > 0) {
                        uploadFilesRef.current?.('.', event.payload.paths);
                    }
                    return;
                }

                setDropActive(false);
            }))
            .then((cleanup) => {
                if (cancelled) {
                    cleanup();
                } else {
                    unlisten = cleanup;
                }
            })
            .catch((e) => {
                console.warn('[FileTreeView] failed to register file drop handler:', e);
            });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [dropEnabled]);

    React.useEffect(() => {
        const query = searchQuery.trim();
        if (!query) {
            setSearchResults(null);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }
        if (query.length < MIN_SEARCH_QUERY_LENGTH) {
            setSearchResults([]);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }

        let cancelled = false;
        setSearchLoading(true);
        setSearchError(null);

        const timer = setTimeout(() => {
            (async () => {
                try {
                    const res = await sessionRipgrep(sessionId, buildSearchArgs(query), undefined, SEARCH_MAX_STDOUT_BYTES);
                    if (cancelled) return;

                    if (!res.success || res.stdout === undefined) {
                        setSearchResults([]);
                        setSearchError(getFriendlyFileRpcError(res.error || 'Failed to search files', 'Failed to search files'));
                        return;
                    }

                    const lowered = query.toLowerCase();
                    const matches = res.stdout
                        .split('\n')
                        .map((path) => path.trim())
                        .filter(Boolean)
                        .filter((path) => path.toLowerCase().includes(lowered))
                        .slice(0, SEARCH_RESULT_LIMIT)
                        .map(filePathToSearchNode);

                    setSearchResults(matches);
                } catch (e) {
                    if (!cancelled) {
                        const raw = e instanceof Error ? e.message : 'Unknown error';
                        setSearchResults([]);
                        setSearchError(getFriendlyFileRpcError(raw, 'Failed to search files'));
                    }
                } finally {
                    if (!cancelled) {
                        setSearchLoading(false);
                    }
                }
            })();
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [sessionId, searchQuery]);

    // Lazy load a directory's contents
    const lazyLoadDir = React.useCallback(async (dirPath: string) => {
        if (loadedDirsRef.current.has(dirPath)) return;
        setLoadingPaths((prev) => new Set(prev).add(dirPath));
        try {
            const res = await sessionListDirectory(sessionId, dirPath);
            if (!res.success || !res.entries) {
                const friendly = getFriendlyFileRpcError(res.error || 'Failed to load directory', 'Failed to load directory');
                Modal.alert('Error', friendly, [{ text: 'OK', style: 'cancel' }]);
                return;
            }
            loadedDirsRef.current.add(dirPath);
            // Convert DirectoryEntry to TreeNode and merge into tree
            const newChildren: TreeNode[] = directoryEntriesToTreeNodes(dirPath, res.entries);

            setTree((prev) => {
                if (!prev) return prev;
                const updateChildren = (nodes: TreeNode[]): TreeNode[] => {
                    return nodes.map((n) => {
                        if (n.path === dirPath) {
                            return { ...n, children: sortNodes(newChildren) };
                        }
                        if (n.children) {
                            return { ...n, children: updateChildren(n.children) };
                        }
                        return n;
                    });
                };
                return updateChildren(prev);
            });
        } finally {
            setLoadingPaths((prev) => {
                const next = new Set(prev);
                next.delete(dirPath);
                return next;
            });
        }
    }, [sessionId]);

    // Toggle directory expand/collapse
    const toggleDir = React.useCallback((dirPath: string) => {
        setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(dirPath)) {
                next.delete(dirPath);
            } else {
                next.add(dirPath);
                // Trigger lazy load if not yet loaded
                if (!loadedDirsRef.current.has(dirPath)) {
                    lazyLoadDir(dirPath);
                }
            }
            return next;
        });
    }, [lazyLoadDir]);

    // Render tree nodes recursively
    const renderNodes = React.useCallback((nodes: TreeNode[], depth: number): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        for (const node of nodes) {
            const isDir = node.type === 'directory';
            const expanded = expandedPaths.has(node.path);
            const loading = loadingPaths.has(node.path);

            result.push(
                <TreeNodeRow
                    key={node.path}
                    node={node}
                    depth={depth}
                    expanded={expanded}
                    loading={loading}
                    onToggle={() => toggleDir(node.path)}
                    onFileSelect={onFileSelect}
                    onUpload={onUpload}
                />
            );

            if (isDir && expanded && node.children) {
                result.push(...renderNodes(sortNodes(filterTree(node.children)), depth + 1));
            }

            // Empty directory indicator
            if (isDir && expanded && loadedDirsRef.current.has(node.path) &&
                (!node.children || node.children.length === 0) && !loading) {
                result.push(
                    <View key={`${node.path}__empty`} style={[styles.emptyDir, { paddingLeft: (Math.min(depth + 1, 5) * 12) + 8 }]}>
                        <Text style={styles.emptyText}>Empty directory</Text>
                    </View>
                );
            }
        }
        return result;
    }, [expandedPaths, loadingPaths, toggleDir, onFileSelect, onUpload]);

    // -- Render --

    if (initialLoading) {
        return (
            <View ref={containerRef} style={styles.center}>
                <ActivityIndicator />
                <DropOverlay visible={dropActive} label={dropLabel} />
            </View>
        );
    }

    if (error) {
        return (
            <View ref={containerRef} style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={loadTree} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
                <DropOverlay visible={dropActive} label={dropLabel} />
            </View>
        );
    }

    if (!tree || tree.length === 0) {
        return (
            <View ref={containerRef} style={styles.center}>
                <Text style={styles.emptyText}>No files</Text>
                <DropOverlay visible={dropActive} label={dropLabel} />
            </View>
        );
    }

    // Search mode: flat list
    if (searchQuery.trim()) {
        if (searchQuery.trim().length < MIN_SEARCH_QUERY_LENGTH) {
            return (
                <View ref={containerRef} style={styles.center}>
                    <Text style={styles.emptyText}>Type at least {MIN_SEARCH_QUERY_LENGTH} characters</Text>
                    <DropOverlay visible={dropActive} label={dropLabel} />
                </View>
            );
        }
        if (searchLoading) {
            return (
                <View ref={containerRef} style={styles.center}>
                    <ActivityIndicator />
                    <Text style={styles.loadingText}>Searching files...</Text>
                    <DropOverlay visible={dropActive} label={dropLabel} />
                </View>
            );
        }
        if (!searchResults) {
            return (
                <View ref={containerRef} style={styles.center}>
                    <ActivityIndicator />
                    <Text style={styles.loadingText}>Searching files...</Text>
                    <DropOverlay visible={dropActive} label={dropLabel} />
                </View>
            );
        }
        if (searchError) {
            return (
                <View ref={containerRef} style={styles.center}>
                    <Text style={styles.errorText}>{searchError}</Text>
                    <DropOverlay visible={dropActive} label={dropLabel} />
                </View>
            );
        }
        if (searchResults.length === 0) {
            return (
                <View ref={containerRef} style={styles.center}>
                    <Text style={styles.emptyText}>No matching files</Text>
                    <DropOverlay visible={dropActive} label={dropLabel} />
                </View>
            );
        }
        return (
            <View ref={containerRef} style={styles.dropContainer}>
                <ScrollView style={styles.scroll}>
                    {searchResults.map((node) => (
                        <TreeNodeRow
                            key={node.path}
                            node={node}
                            depth={0}
                            expanded={false}
                            loading={false}
                            onToggle={() => {}}
                            onFileSelect={onFileSelect}
                            onUpload={onUpload}
                        />
                    ))}
                </ScrollView>
                <DropOverlay visible={dropActive} label={dropLabel} />
            </View>
        );
    }

    // Tree mode
    return (
        <View ref={containerRef} style={styles.dropContainer}>
            <ScrollView style={styles.scroll}>
                {renderNodes(tree, 0)}
            </ScrollView>
            <DropOverlay visible={dropActive} label={dropLabel} />
        </View>
    );
});

const DropOverlay = React.memo(function DropOverlay({ visible, label }: { visible: boolean; label?: string }) {
    if (!visible || !label) return null;

    return (
        <View pointerEvents="none" style={styles.dropOverlay}>
            <View style={styles.dropMessage}>
                <Text style={styles.dropText}>{label}</Text>
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    dropContainer: {
        flex: 1,
        position: 'relative',
    },
    scroll: {
        flex: 1,
    },
    center: {
        flex: 1,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingRight: 8,
        minHeight: 28,
    },
    arrow: {
        width: 14,
        fontSize: 10,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    arrowSpacer: {
        width: 14,
    },
    inlineLoader: {
        width: 14,
        marginRight: 0,
    },
    fileName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        marginLeft: 6,
    },
    fileSize: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginLeft: 4,
    },
    emptyDir: {
        paddingVertical: 2,
    },
    emptyText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
    loadingText: {
        marginTop: 8,
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    errorText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 12,
    },
    retryBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    retryText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    uploadBtn: {
        width: 22,
        height: 22,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surfaceHigh,
        marginLeft: 4,
    },
    uploadIcon: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    dropOverlay: {
        position: 'absolute',
        top: 8,
        right: 8,
        bottom: 8,
        left: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.textSecondary,
        borderRadius: 6,
        backgroundColor: theme.colors.surface,
        opacity: 0.92,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dropMessage: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    dropText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
}));
