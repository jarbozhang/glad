import * as React from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { sessionGetDirectoryTree, sessionListDirectory } from '@/sync/ops';
import { FileIcon } from '@/components/FileIcon';
import { Text } from '@/components/StyledText';
import { Modal } from '@/modal';

// Exported for testing
export const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.expo', '__pycache__', '.cache',
]);

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
    onFileSelect: (path: string) => void;
    onUpload?: (targetDir: string) => void;
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

// -- TreeNodeRow component --

interface TreeNodeRowProps {
    node: TreeNode;
    depth: number;
    expanded: boolean;
    loading: boolean;
    onToggle: () => void;
    onFileSelect: (path: string) => void;
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
            onFileSelect(node.path);
        }
    }, [isDir, onToggle, onFileSelect, node.path]);

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
    sessionId, searchQuery, onFileSelect, onUpload,
}: FileTreeViewProps) {
    const [tree, setTree] = React.useState<TreeNode[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
    const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(new Set());
    // Track which dirs have had their children loaded (to distinguish "not loaded" vs "empty")
    const loadedDirsRef = React.useRef<Set<string>>(new Set());

    // Initial load
    const loadTree = React.useCallback(async () => {
        setInitialLoading(true);
        setError(null);
        try {
            const res = await sessionGetDirectoryTree(sessionId, '.', 3);
            if (!res.success || !res.tree) {
                throw new Error(res.error || 'Failed to load directory tree');
            }
            const rootChildren = res.tree.children ? filterTree(res.tree.children) : [];
            setTree(sortNodes(rootChildren));
            // Mark all dirs with children as loaded
            const markLoaded = (nodes: TreeNode[]) => {
                for (const n of nodes) {
                    if (n.type === 'directory' && n.children) {
                        loadedDirsRef.current.add(n.path);
                        markLoaded(n.children);
                    }
                }
            };
            markLoaded(rootChildren);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            setError(msg);
        } finally {
            setInitialLoading(false);
        }
    }, [sessionId]);

    React.useEffect(() => {
        loadTree();
    }, [loadTree]);

    // Lazy load a directory's contents
    const lazyLoadDir = React.useCallback(async (dirPath: string) => {
        if (loadedDirsRef.current.has(dirPath)) return;
        setLoadingPaths((prev) => new Set(prev).add(dirPath));
        try {
            const res = await sessionListDirectory(sessionId, dirPath);
            if (!res.success || !res.entries) {
                Modal.alert('Error', res.error || 'Failed to load directory');
                return;
            }
            loadedDirsRef.current.add(dirPath);
            // Convert DirectoryEntry to TreeNode and merge into tree
            const newChildren: TreeNode[] = res.entries
                .filter((e) => e.type !== 'other' && !EXCLUDED_DIRS.has(e.name))
                .map((e) => ({
                    name: e.name,
                    path: dirPath === '.' ? e.name : `${dirPath}/${e.name}`,
                    type: e.type as 'file' | 'directory',
                    size: e.size,
                    modified: e.modified,
                }));

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

    // Search filtering: flat list of matching nodes
    const searchResults = React.useMemo(() => {
        if (!searchQuery || !tree) return null;
        const query = searchQuery.toLowerCase();
        const flat = flattenTree(tree);
        return flat.filter((n) => n.name.toLowerCase().includes(query));
    }, [searchQuery, tree]);

    // -- Render --

    if (initialLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={loadTree} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    if (!tree || tree.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.emptyText}>No files</Text>
            </View>
        );
    }

    // Search mode: flat list
    if (searchResults) {
        if (searchResults.length === 0) {
            return (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No matching files</Text>
                </View>
            );
        }
        return (
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
        );
    }

    // Tree mode
    return (
        <ScrollView style={styles.scroll}>
            {renderNodes(tree, 0)}
        </ScrollView>
    );
});

const styles = StyleSheet.create((theme) => ({
    scroll: {
        flex: 1,
    },
    center: {
        flex: 1,
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
    errorText: {
        fontSize: 13,
        color: theme.colors.warningCritical,
        textAlign: 'center',
        marginBottom: 12,
    },
    retryBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
        backgroundColor: theme.colors.textLink,
    },
    retryText: {
        fontSize: 13,
        color: '#ffffff',
    },
    uploadBtn: {
        width: 22,
        height: 22,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        marginLeft: 4,
    },
    uploadIcon: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
}));
