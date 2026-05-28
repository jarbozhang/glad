import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, Platform } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { DirectoryContextMenu, type DirectoryContextMenuAnchor, type DirectoryContextMenuTarget } from '@/components/DirectoryContextMenu';
import { FileIcon } from '@/components/FileIcon';
import { Typography } from '@/constants/Typography';
import { sessionListDirectory, sessionRipgrep } from '@/sync/ops';
import { t } from '@/text';
import {
    DIRECTORY_SEARCH_DEBOUNCE_MS,
    DIRECTORY_SEARCH_MAX_STDOUT_BYTES,
    DIRECTORY_SEARCH_MIN_QUERY_LENGTH,
    DirectoryTreeNode,
    buildDirectorySearchArgs,
    directoryEntriesToTreeNodes,
    formatDirectoryFileSize,
    getFriendlyDirectoryRpcError,
    mergeDirectoryChildren,
    parseDirectorySearchResults,
    shouldSearchDirectory,
} from './directoryTreeModel';

interface DirectoryTreeTabProps {
    sessionId: string;
    selectedPath: string | null;
    enabled: boolean;
    visible: boolean;
    onFilePress?: (filePath: string, size?: number) => void;
    onUploadDirectory?: (targetDir: string) => void;
    onDownloadFile?: (filePath: string) => void;
    transferEnabled?: boolean;
    transferStatus?: 'idle' | 'uploading' | 'downloading';
    refreshKey?: number;
    refreshPath?: string;
    activityRefreshKey?: string | number;
    autoRefreshIntervalMs?: number;
}

const INDENT_PX = 10;
const CHEVRON_DURATION = 160;
const EASING = Easing.out(Easing.cubic);
const ACTIVITY_REFRESH_DEBOUNCE_MS = 750;
const MAX_AUTO_REFRESH_DIRS = 20;

export const DirectoryTreeTab = React.memo(function DirectoryTreeTab({
    sessionId,
    selectedPath,
    enabled,
    visible,
    onFilePress,
    onUploadDirectory,
    onDownloadFile,
    transferEnabled = false,
    transferStatus = 'idle',
    refreshKey = 0,
    refreshPath = '.',
    activityRefreshKey,
    autoRefreshIntervalMs,
}: DirectoryTreeTabProps) {
    const { theme } = useUnistyles();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [tree, setTree] = React.useState<DirectoryTreeNode[] | null>(null);
    const [initialLoading, setInitialLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => new Set());
    const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(() => new Set());
    const [loadedDirs, setLoadedDirs] = React.useState<Set<string>>(() => new Set());
    const loadedDirsRef = React.useRef(loadedDirs);
    const loadedSessionRef = React.useRef<string | null>(null);
    const activeSessionRef = React.useRef(sessionId);
    const mountedRef = React.useRef(true);
    activeSessionRef.current = sessionId;

    const [searchLoading, setSearchLoading] = React.useState(false);
    const [searchError, setSearchError] = React.useState<string | null>(null);
    const [searchResults, setSearchResults] = React.useState<DirectoryTreeNode[] | null>(null);
    const [contextMenuAnchor, setContextMenuAnchor] = React.useState<DirectoryContextMenuAnchor | null>(null);
    const [contextMenuTarget, setContextMenuTarget] = React.useState<DirectoryContextMenuTarget | null>(null);
    const lastRefreshKeyRef = React.useRef(refreshKey);
    const lastActivityRefreshKeyRef = React.useRef(activityRefreshKey);
    const refreshingPathsRef = React.useRef(new Set<string>());

    React.useEffect(() => {
        loadedDirsRef.current = loadedDirs;
    }, [loadedDirs]);

    React.useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const resetLoadedDirs = React.useCallback(() => {
        const next = new Set<string>();
        loadedDirsRef.current = next;
        setLoadedDirs(next);
    }, []);

    const markLoaded = React.useCallback((dirPath: string) => {
        const next = new Set(loadedDirsRef.current);
        next.add(dirPath);
        loadedDirsRef.current = next;
        setLoadedDirs(next);
    }, []);

    const loadRoot = React.useCallback(async () => {
        loadedSessionRef.current = sessionId;
        setInitialLoading(true);
        setError(null);
        setTree(null);
        setExpandedPaths(new Set());
        setLoadingPaths(new Set());
        resetLoadedDirs();

        try {
            const res = await sessionListDirectory(sessionId, '.');
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            if (!res.success || !res.entries) {
                setError(getFriendlyDirectoryRpcError(res.error || 'Failed to load directory'));
                return;
            }
            setTree(directoryEntriesToTreeNodes('.', res.entries));
            markLoaded('.');
        } catch (e) {
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            const raw = e instanceof Error ? e.message : 'Unknown error';
            setError(getFriendlyDirectoryRpcError(raw));
        } finally {
            if (mountedRef.current && activeSessionRef.current === sessionId) setInitialLoading(false);
        }
    }, [markLoaded, resetLoadedDirs, sessionId]);

    React.useEffect(() => {
        loadedSessionRef.current = null;
        setInitialLoading(true);
        setError(null);
        setTree(null);
        setSearchQuery('');
        setSearchLoading(false);
        setSearchError(null);
        setSearchResults(null);
        setExpandedPaths(new Set());
        setLoadingPaths(new Set());
        resetLoadedDirs();
    }, [resetLoadedDirs, sessionId]);

    React.useEffect(() => {
        if (!enabled || loadedSessionRef.current === sessionId) return;
        void loadRoot();
    }, [enabled, loadRoot, sessionId]);

    const openContextMenu = React.useCallback((event: any, target: DirectoryContextMenuTarget) => {
        if (!transferEnabled || Platform.OS !== 'web') return;
        event.preventDefault?.();
        event.stopPropagation?.();
        setContextMenuAnchor({
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
        setContextMenuTarget(target);
    }, [transferEnabled]);

    const closeContextMenu = React.useCallback(() => {
        setContextMenuAnchor(null);
        setContextMenuTarget(null);
    }, []);

    React.useEffect(() => {
        if (!enabled) return;
        const query = searchQuery.trim();
        if (!query) {
            setSearchResults(null);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }
        if (!shouldSearchDirectory(query)) {
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
                    const res = await sessionRipgrep(
                        sessionId,
                        buildDirectorySearchArgs(query),
                        undefined,
                        DIRECTORY_SEARCH_MAX_STDOUT_BYTES,
                    );
                    if (cancelled || !mountedRef.current || activeSessionRef.current !== sessionId) return;
                    if (!res.success || res.stdout === undefined) {
                        setSearchResults([]);
                        setSearchError(getFriendlyDirectoryRpcError(res.error || 'Failed to search files', 'Failed to search files'));
                        return;
                    }
                    setSearchResults(parseDirectorySearchResults(res.stdout, query));
                } catch (e) {
                    if (!cancelled && mountedRef.current && activeSessionRef.current === sessionId) {
                        const raw = e instanceof Error ? e.message : 'Unknown error';
                        setSearchResults([]);
                        setSearchError(getFriendlyDirectoryRpcError(raw, 'Failed to search files'));
                    }
                } finally {
                    if (!cancelled && mountedRef.current && activeSessionRef.current === sessionId) setSearchLoading(false);
                }
            })();
        }, DIRECTORY_SEARCH_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [enabled, sessionId, searchQuery]);

    React.useEffect(() => {
        if (!visible) closeContextMenu();
    }, [closeContextMenu, visible]);

    const loadDirectory = React.useCallback(async (dirPath: string) => {
        if (loadedDirsRef.current.has(dirPath)) return;
        setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.add(dirPath);
            return next;
        });
        try {
            const res = await sessionListDirectory(sessionId, dirPath);
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            if (!res.success || !res.entries) {
                setError(getFriendlyDirectoryRpcError(res.error || 'Failed to load directory', 'Failed to load directory'));
                return;
            }
            const children = directoryEntriesToTreeNodes(dirPath, res.entries);
            setTree((prev) => prev ? mergeDirectoryChildren(prev, dirPath, children) : prev);
            markLoaded(dirPath);
        } catch (e) {
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            const raw = e instanceof Error ? e.message : 'Unknown error';
            setError(getFriendlyDirectoryRpcError(raw, 'Failed to load directory'));
        } finally {
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            setLoadingPaths((prev) => {
                const next = new Set(prev);
                next.delete(dirPath);
                return next;
            });
        }
    }, [markLoaded, sessionId]);

    const refreshDirectory = React.useCallback(async (dirPath: string) => {
        const targetPath = dirPath || '.';
        if (refreshingPathsRef.current.has(targetPath)) return;
        refreshingPathsRef.current.add(targetPath);

        const nextLoadedDirs = new Set(loadedDirsRef.current);
        nextLoadedDirs.delete(targetPath);
        loadedDirsRef.current = nextLoadedDirs;
        setLoadedDirs(nextLoadedDirs);

        if (targetPath !== '.' && !expandedPaths.has(targetPath)) return;

        setLoadingPaths((prev) => {
            const next = new Set(prev);
            next.add(targetPath);
            return next;
        });

        try {
            const res = await sessionListDirectory(sessionId, targetPath);
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            if (!res.success || !res.entries) {
                setError(getFriendlyDirectoryRpcError(res.error || 'Failed to refresh directory', 'Failed to refresh directory'));
                return;
            }
            const children = directoryEntriesToTreeNodes(targetPath, res.entries);
            setTree((prev) => {
                if (targetPath === '.') return children;
                return prev ? mergeDirectoryChildren(prev, targetPath, children) : prev;
            });
            markLoaded(targetPath);
        } catch (e) {
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            const raw = e instanceof Error ? e.message : 'Unknown error';
            setError(getFriendlyDirectoryRpcError(raw, 'Failed to refresh directory'));
        } finally {
            refreshingPathsRef.current.delete(targetPath);
            if (!mountedRef.current || activeSessionRef.current !== sessionId) return;
            setLoadingPaths((prev) => {
                const next = new Set(prev);
                next.delete(targetPath);
                return next;
            });
        }
    }, [expandedPaths, markLoaded, sessionId]);

    const refreshVisibleDirectories = React.useCallback(() => {
        const paths = ['.', ...Array.from(expandedPaths)]
            .filter((path, index, self) => self.indexOf(path) === index)
            .slice(0, MAX_AUTO_REFRESH_DIRS);
        for (const path of paths) {
            void refreshDirectory(path);
        }
    }, [expandedPaths, refreshDirectory]);

    React.useEffect(() => {
        if (!enabled || loadedSessionRef.current !== sessionId || refreshKey === lastRefreshKeyRef.current) return;
        lastRefreshKeyRef.current = refreshKey;
        void refreshDirectory(refreshPath);
    }, [enabled, refreshDirectory, refreshKey, refreshPath, sessionId]);

    React.useEffect(() => {
        if (
            !enabled ||
            !visible ||
            loadedSessionRef.current !== sessionId ||
            activityRefreshKey === undefined ||
            activityRefreshKey === lastActivityRefreshKeyRef.current
        ) {
            return;
        }
        lastActivityRefreshKeyRef.current = activityRefreshKey;
        const timer = setTimeout(refreshVisibleDirectories, ACTIVITY_REFRESH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [activityRefreshKey, enabled, refreshVisibleDirectories, sessionId, visible]);

    React.useEffect(() => {
        if (!enabled || !visible || loadedSessionRef.current !== sessionId || !autoRefreshIntervalMs || autoRefreshIntervalMs <= 0) return;
        const timer = setInterval(refreshVisibleDirectories, autoRefreshIntervalMs);
        return () => clearInterval(timer);
    }, [autoRefreshIntervalMs, enabled, refreshVisibleDirectories, sessionId, visible]);

    const toggleDir = React.useCallback((dirPath: string) => {
        setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(dirPath)) {
                next.delete(dirPath);
            } else {
                next.add(dirPath);
                if (!loadedDirsRef.current.has(dirPath)) {
                    void loadDirectory(dirPath);
                }
            }
            return next;
        });
    }, [loadDirectory]);

    const renderNodes = React.useCallback((nodes: DirectoryTreeNode[], depth: number): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        for (const node of nodes) {
            const isDir = node.type === 'directory';
            const expanded = expandedPaths.has(node.path);
            const loading = loadingPaths.has(node.path);
            result.push(
                <DirectoryTreeNodeRow
                    key={node.path}
                    node={node}
                    depth={depth}
                    expanded={expanded}
                    loading={loading}
                    selectedPath={selectedPath}
                    onToggle={() => toggleDir(node.path)}
                    onFilePress={onFilePress}
                    onContextMenu={openContextMenu}
                />
            );

            if (isDir && expanded && node.children) {
                result.push(...renderNodes(node.children, depth + 1));
            }

            if (isDir && expanded && loadedDirs.has(node.path) && !loading && (!node.children || node.children.length === 0)) {
                result.push(
                    <View key={`${node.path}__empty`} style={[styles.emptyDir, { paddingLeft: 8 + (depth + 1) * INDENT_PX }]}>
                        <Text style={styles.inlineEmptyText}>{t('files.emptyDirectory')}</Text>
                    </View>
                );
            }
        }
        return result;
    }, [expandedPaths, loadedDirs, loadingPaths, onFilePress, openContextMenu, selectedPath, toggleDir]);

    const searchMode = searchQuery.trim().length > 0;

    if (!visible) return null;

    return (
        <View
            style={{ flex: 1 }}
            {...(transferEnabled && Platform.OS === 'web'
                ? { onContextMenu: (event: any) => openContextMenu(event, { type: 'empty' }) }
                : null)}
        >
            <View style={styles.searchWrap}>
                <Octicons name="search" size={14} color={theme.colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('files.searchPlaceholder')}
                    placeholderTextColor={theme.colors.input.placeholder}
                    style={[styles.searchInput, { color: theme.colors.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {transferStatus !== 'idle' ? (
                <View style={styles.transferBar}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={styles.transferText}>
                        {transferStatus === 'uploading' ? t('files.uploading') : t('files.downloading')}
                    </Text>
                </View>
            ) : null}

            {searchMode ? (
                <DirectorySearchResults
                    query={searchQuery}
                    loading={searchLoading}
                    error={searchError}
                    results={searchResults}
                    selectedPath={selectedPath}
                    onFilePress={onFilePress}
                    onContextMenu={openContextMenu}
                    onCloseContextMenu={closeContextMenu}
                />
            ) : initialLoading ? (
                <CenteredState>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </CenteredState>
            ) : error ? (
                <CenteredState>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={() => { void loadRoot(); }} style={styles.retryButton}>
                        <Text style={styles.retryText}>{t('common.retry')}</Text>
                    </Pressable>
                </CenteredState>
            ) : !tree || tree.length === 0 ? (
                <CenteredState>
                    <View style={styles.emptyIconWrap}>
                        <Octicons name="file-directory" size={28} color={theme.colors.textSecondary} />
                    </View>
                    <Text style={styles.emptyTitle}>{t('files.noFilesInProject')}</Text>
                </CenteredState>
            ) : (
                <ScrollView
                    style={styles.list}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    onScrollBeginDrag={closeContextMenu}
                    scrollEventThrottle={16}
                >
                    <View style={styles.tree}>
                        {renderNodes(tree, 0)}
                    </View>
                </ScrollView>
            )}
            <DirectoryContextMenu
                anchor={contextMenuAnchor}
                target={contextMenuTarget}
                visible={!!contextMenuAnchor}
                transferEnabled={transferEnabled}
                onClose={closeContextMenu}
                onUploadDirectory={onUploadDirectory}
                onDownloadFile={onDownloadFile}
            />
        </View>
    );
});

const DirectorySearchResults = React.memo(function DirectorySearchResults({
    query,
    loading,
    error,
    results,
    selectedPath,
    onFilePress,
    onContextMenu,
    onCloseContextMenu,
}: {
    query: string;
    loading: boolean;
    error: string | null;
    results: DirectoryTreeNode[] | null;
    selectedPath: string | null;
    onFilePress?: (filePath: string, size?: number) => void;
    onContextMenu?: (event: any, target: DirectoryContextMenuTarget) => void;
    onCloseContextMenu: () => void;
}) {
    const { theme } = useUnistyles();
    const trimmed = query.trim();
    if (trimmed.length < DIRECTORY_SEARCH_MIN_QUERY_LENGTH) {
        return (
            <CenteredState>
                <Text style={styles.emptySubtitle}>
                    {t('files.typeAtLeastCharacters', { count: DIRECTORY_SEARCH_MIN_QUERY_LENGTH })}
                </Text>
            </CenteredState>
        );
    }
    if (loading || results === null) {
        return (
            <CenteredState>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={styles.emptySubtitle}>{t('files.searching')}</Text>
            </CenteredState>
        );
    }
    if (error) {
        return (
            <CenteredState>
                <Text style={styles.errorText}>{error}</Text>
            </CenteredState>
        );
    }
    if (results.length === 0) {
        return (
            <CenteredState>
                <View style={styles.emptyIconWrap}>
                    <Octicons name="file" size={28} color={theme.colors.textSecondary} />
                </View>
                <Text style={styles.emptyTitle}>{t('files.noFilesFound')}</Text>
                <Text style={styles.emptySubtitle}>{t('files.tryDifferentTerm')}</Text>
            </CenteredState>
        );
    }

    return (
        <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            onScrollBeginDrag={onCloseContextMenu}
            scrollEventThrottle={16}
        >
            <View style={styles.tree}>
                {results.map((node) => (
                    <DirectoryTreeNodeRow
                        key={node.path}
                        node={node}
                        depth={0}
                        expanded={false}
                        loading={false}
                        selectedPath={selectedPath}
                        onToggle={() => {}}
                        onFilePress={onFilePress}
                        onContextMenu={onContextMenu}
                    />
                ))}
            </View>
        </ScrollView>
    );
});

const CenteredState = React.memo(function CenteredState({ children }: { children: React.ReactNode }) {
    return <View style={styles.emptyState}>{children}</View>;
});

const DirectoryTreeNodeRow = React.memo(function DirectoryTreeNodeRow({
    node,
    depth,
    expanded,
    loading,
    selectedPath,
    onToggle,
    onFilePress,
    onContextMenu,
}: {
    node: DirectoryTreeNode;
    depth: number;
    expanded: boolean;
    loading: boolean;
    selectedPath: string | null;
    onToggle: () => void;
    onFilePress?: (filePath: string, size?: number) => void;
    onContextMenu?: (event: any, target: DirectoryContextMenuTarget) => void;
}) {
    const { theme } = useUnistyles();
    const leftPad = 8 + depth * INDENT_PX;
    const isDir = node.type === 'directory';
    const contextMenuProps = onContextMenu && Platform.OS === 'web'
        ? {
            onContextMenu: (event: any) => onContextMenu(event, { type: isDir ? 'directory' : 'file', path: node.path }),
        } as any
        : null;

    if (isDir) {
        return (
            <Pressable
                onPress={onToggle}
                {...contextMenuProps}
                style={({ pressed }) => [styles.row, { paddingLeft: leftPad }, pressed && styles.rowPressed]}
            >
                <View style={styles.chevron}>
                    {loading ? (
                        <ActivityIndicator size={10} color={theme.colors.textSecondary} />
                    ) : (
                        <AnimatedChevron expanded={expanded} color={theme.colors.textSecondary} />
                    )}
                </View>
                <FileIcon fileName="__folder__" size={16} />
                <Text style={styles.dirName} numberOfLines={1}>{node.name}</Text>
            </Pressable>
        );
    }

    const isSelected = selectedPath === node.path;
    const size = formatDirectoryFileSize(node.size);
    return (
        <Pressable
            onPress={() => onFilePress?.(node.path, node.size)}
            {...contextMenuProps}
            style={({ pressed }) => [
                styles.row,
                { paddingLeft: leftPad },
                pressed && styles.rowPressed,
                isSelected && styles.rowSelected,
            ]}
        >
            <View style={styles.fileIconSpacer} />
            <FileIcon fileName={node.name} size={16} />
            <Text style={styles.fileName} numberOfLines={1}>{node.name}</Text>
            {size ? <Text style={styles.fileSize}>{size}</Text> : null}
        </Pressable>
    );
});

const AnimatedChevron = React.memo(function AnimatedChevron({ expanded, color, size = 12 }: { expanded: boolean; color: string; size?: number }) {
    const rotation = useSharedValue(expanded ? 90 : 0);
    React.useEffect(() => {
        rotation.value = withTiming(expanded ? 90 : 0, { duration: CHEVRON_DURATION, easing: EASING });
    }, [expanded, rotation]);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));
    return (
        <Animated.View style={animatedStyle}>
            <Octicons name="chevron-right" size={size} color={color} />
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: Platform.select({ web: 6, default: 8 }),
        borderRadius: 8,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        gap: 6,
    },
    searchIcon: {
        opacity: 0.8,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default(),
        padding: 0,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
    },
    transferBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginHorizontal: 12,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    transferText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    list: {
        flex: 1,
    },
    listContent: {
        flexGrow: 1,
        paddingBottom: 16,
    },
    tree: {
        paddingHorizontal: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingRight: 12,
        paddingVertical: 5,
        borderRadius: 6,
    },
    rowPressed: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    rowSelected: {},
    chevron: {
        width: 14,
        alignItems: 'center',
    },
    fileIconSpacer: {
        width: 14,
    },
    dirName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default(),
    },
    fileName: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default(),
    },
    fileSize: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 4,
    },
    emptyIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.text,
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    emptySubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    errorText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    retryButton: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    retryText: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    emptyDir: {
        paddingVertical: 2,
    },
    inlineEmptyText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        ...Typography.default(),
    },
}));
