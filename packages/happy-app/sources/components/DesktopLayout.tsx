import * as React from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Slot } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { SidebarView } from './SidebarView';
import { ContextPanel } from './ContextPanel';
import { useZenMode } from '@/hooks/useZenMode';

const DEFAULT_PANEL_WIDTH = 300;
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 520;
const MIN_CENTER_WIDTH = 420;
const SIDEBAR_WIDTH_KEY = 'happy.desktop.sidebarWidth';
const CONTEXT_WIDTH_KEY = 'happy.desktop.contextWidth';

function clampPanelWidth(width: number, maxWidth: number = MAX_PANEL_WIDTH) {
    const effectiveMax = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, maxWidth));
    return Math.min(effectiveMax, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

function readStoredPanelWidth(key: string) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
        return DEFAULT_PANEL_WIDTH;
    }
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return DEFAULT_PANEL_WIDTH;
        }
        const value = Number(raw);
        return Number.isFinite(value) ? clampPanelWidth(value) : DEFAULT_PANEL_WIDTH;
    } catch {
        return DEFAULT_PANEL_WIDTH;
    }
}

function writeStoredPanelWidth(key: string, width: number) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(key, String(width));
    } catch {
        // Ignore storage failures; panel resizing should still work for this session.
    }
}

// Three-column desktop layout per docs/layout-core.md:
// SidebarView (~300px) | Center (flex:1, routes via Slot) | ContextPanel (~300px)
// Left/right panels can be individually toggled. Cmd/Ctrl+0 toggles both (Zen mode).
export const DesktopLayout = React.memo(() => {
    const { zen, toggleZen } = useZenMode();
    const { width: windowWidth } = useWindowDimensions();
    const [sidebarVisible, setSidebarVisible] = React.useState(true);
    const [contextVisible, setContextVisible] = React.useState(true);
    const [sidebarWidth, setSidebarWidth] = React.useState(() => readStoredPanelWidth(SIDEBAR_WIDTH_KEY));
    const [contextWidth, setContextWidth] = React.useState(() => readStoredPanelWidth(CONTEXT_WIDTH_KEY));

    const sidebarMaxWidth = React.useMemo(() => {
        return windowWidth - (contextVisible ? contextWidth : 0) - MIN_CENTER_WIDTH;
    }, [contextVisible, contextWidth, windowWidth]);

    const contextMaxWidth = React.useMemo(() => {
        return windowWidth - (sidebarVisible ? sidebarWidth : 0) - MIN_CENTER_WIDTH;
    }, [sidebarVisible, sidebarWidth, windowWidth]);

    // Zen mode overrides individual panel state
    React.useEffect(() => {
        if (zen) {
            setSidebarVisible(false);
            setContextVisible(false);
        } else {
            setSidebarVisible(true);
            setContextVisible(true);
        }
    }, [zen]);

    // Register Cmd/Ctrl+0 for Zen mode toggle
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '0') {
                e.preventDefault();
                toggleZen();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleZen]);

    React.useEffect(() => {
        writeStoredPanelWidth(SIDEBAR_WIDTH_KEY, sidebarWidth);
    }, [sidebarWidth]);

    React.useEffect(() => {
        writeStoredPanelWidth(CONTEXT_WIDTH_KEY, contextWidth);
    }, [contextWidth]);

    React.useEffect(() => {
        setSidebarWidth(width => clampPanelWidth(width, sidebarMaxWidth));
    }, [sidebarMaxWidth]);

    React.useEffect(() => {
        setContextWidth(width => clampPanelWidth(width, contextMaxWidth));
    }, [contextMaxWidth]);

    const resizeSidebar = React.useCallback((deltaX: number) => {
        setSidebarWidth(width => clampPanelWidth(width + deltaX, sidebarMaxWidth));
    }, [sidebarMaxWidth]);

    const resizeContext = React.useCallback((deltaX: number) => {
        setContextWidth(width => clampPanelWidth(width - deltaX, contextMaxWidth));
    }, [contextMaxWidth]);

    return (
        <View style={styles.container}>
            {sidebarVisible && (
                <View style={[styles.sidebar, { width: sidebarWidth }]}>
                    <SidebarView />
                </View>
            )}
            {sidebarVisible && (
                <ResizeHandle
                    accessibilityLabel="Resize sidebar"
                    onResize={resizeSidebar}
                />
            )}
            <View style={styles.center}>
                {/* Toggle buttons at top of center column */}
                <View style={styles.toggleBar}>
                    <Pressable
                        onPress={() => setSidebarVisible(v => !v)}
                        style={styles.toggleButton}
                    >
                        <Text style={styles.toggleText}>{sidebarVisible ? '◀' : '▶'}</Text>
                    </Pressable>
                    <View style={styles.toggleSpacer} />
                    <Pressable
                        onPress={() => setContextVisible(v => !v)}
                        style={styles.toggleButton}
                    >
                        <Text style={styles.toggleText}>{contextVisible ? '▶' : '◀'}</Text>
                    </Pressable>
                </View>
                <View style={styles.centerContent}>
                    <Slot />
                </View>
            </View>
            {contextVisible && (
                <ResizeHandle
                    accessibilityLabel="Resize file panel"
                    onResize={resizeContext}
                />
            )}
            <View style={[styles.contextPanel, { width: contextWidth }, !contextVisible && styles.hidden]}>
                <ContextPanel />
            </View>
        </View>
    );
});

const ResizeHandle = React.memo(function ResizeHandle(props: {
    accessibilityLabel: string;
    onResize: (deltaX: number) => void;
}) {
    const [active, setActive] = React.useState(false);
    const [hovered, setHovered] = React.useState(false);
    const onResizeRef = React.useRef(props.onResize);
    const lastClientXRef = React.useRef(0);
    const cleanupDragRef = React.useRef<(() => void) | null>(null);
    onResizeRef.current = props.onResize;

    const stopDragging = React.useCallback(() => {
        cleanupDragRef.current?.();
        cleanupDragRef.current = null;
        setActive(false);
    }, []);

    const startDragging = React.useCallback((event: any) => {
        if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }

        const nativeEvent = event?.nativeEvent ?? event;
        if (typeof nativeEvent.button === 'number' && nativeEvent.button !== 0) {
            return;
        }
        if (typeof nativeEvent.clientX !== 'number') {
            return;
        }

        event?.preventDefault?.();
        event?.stopPropagation?.();
        stopDragging();

        lastClientXRef.current = nativeEvent.clientX;
        setActive(true);

        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            const deltaX = moveEvent.clientX - lastClientXRef.current;
            lastClientXRef.current = moveEvent.clientX;
            if (deltaX !== 0) {
                onResizeRef.current(deltaX);
            }
        };

        const handleUp = () => {
            stopDragging();
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('blur', handleUp);

        cleanupDragRef.current = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('blur', handleUp);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
        };
    }, [stopDragging]);

    React.useEffect(() => {
        return () => {
            cleanupDragRef.current?.();
            cleanupDragRef.current = null;
        };
    }, []);

    const webHandlers = Platform.OS === 'web'
        ? {
            onMouseDown: startDragging,
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
        }
        : undefined;

    return (
        <View
            accessibilityLabel={props.accessibilityLabel}
            accessibilityRole="adjustable"
            style={[styles.resizeHandle, (hovered || active) && styles.resizeHandleActive]}
            {...(Platform.OS === 'web' ? ({ className: 'desktop-resize-handle' } as any) : {})}
            {...(webHandlers as any)}
        >
            <View style={[styles.resizeHandleLine, (hovered || active) && styles.resizeHandleLineActive]} />
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
    },
    sidebar: {
        borderRightWidth: 1,
        borderRightColor: theme.colors.divider,
        overflow: 'hidden',
    },
    center: {
        flex: 1,
        minWidth: MIN_CENTER_WIDTH,
    },
    centerContent: {
        flex: 1,
    },
    toggleBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    toggleButton: {
        padding: 4,
        borderRadius: 4,
    },
    toggleText: {
        fontSize: 10,
        color: theme.colors.textSecondary,
    },
    toggleSpacer: {
        flex: 1,
    },
    contextPanel: {
        borderLeftWidth: 1,
        borderLeftColor: theme.colors.divider,
    },
    hidden: {
        display: 'none',
    },
    resizeHandle: {
        width: 8,
        marginLeft: -4,
        marginRight: -4,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    resizeHandleActive: {
        backgroundColor: theme.colors.surfacePressed,
    },
    resizeHandleLine: {
        width: 1,
        height: '100%',
        backgroundColor: 'transparent',
    },
    resizeHandleLineActive: {
        backgroundColor: theme.colors.divider,
    },
}));
