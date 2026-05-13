import { useSocketStatus, useSettings } from '@/sync/storage';
import * as React from 'react';
import { Text, View, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@/utils/responsive';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { FABWide } from './FABWide';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import { useRealtimeStatus } from '@/sync/storage';
import { MainView } from './MainView';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { Ionicons } from '@expo/vector-icons';
import { desktopBrandAccessibilityLabel, desktopBrandTitle, desktopLogoSource } from '@/brand/desktopBrand';

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        borderStyle: 'solid',
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.groupped.background,
        position: 'relative',
    },
    logoContainer: {
        width: 32,
    },
    logo: {
        height: 24,
        width: 24,
    },
    titleContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'column',
        alignItems: 'center',
        pointerEvents: 'none',
    },
    titleContainerLeft: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginLeft: 8,
        justifyContent: 'center',
    },
    titleText: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.header.tint,
        ...Typography.default('semiBold'),
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -2,
    },
    statusDot: {
        marginRight: 4,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    rightContainer: {
        marginLeft: 'auto',
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: 8,
    },
    settingsButton: {
        color: theme.colors.header.tint,
    },
    // Status colors
    statusConnected: {
        color: theme.colors.status.connected,
    },
    statusConnecting: {
        color: theme.colors.status.connecting,
    },
    statusDisconnected: {
        color: theme.colors.status.disconnected,
    },
    statusError: {
        color: theme.colors.status.error,
    },
    statusDefault: {
        color: theme.colors.status.default,
    },
}));

export const SidebarView = React.memo(() => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const router = useRouter();
    const headerHeight = useHeaderHeight();
    const socketStatus = useSocketStatus();
    const realtimeStatus = useRealtimeStatus();
    const settings = useSettings();

    // Compute connection status once per render (theme-reactive, no stale memoization)
    const connectionStatus = (() => {
        const { status } = socketStatus;
        switch (status) {
            case 'connected':
                return {
                    color: styles.statusConnected.color,
                    isPulsing: false,
                    text: t('status.connected'),
                    textColor: styles.statusConnected.color
                };
            case 'connecting':
                return {
                    color: styles.statusConnecting.color,
                    isPulsing: true,
                    text: t('status.connecting'),
                    textColor: styles.statusConnecting.color
                };
            case 'disconnected':
                return {
                    color: styles.statusDisconnected.color,
                    isPulsing: false,
                    text: t('status.disconnected'),
                    textColor: styles.statusDisconnected.color
                };
            case 'error':
                return {
                    color: styles.statusError.color,
                    isPulsing: false,
                    text: t('status.error'),
                    textColor: styles.statusError.color
                };
            default:
                return {
                    color: styles.statusDefault.color,
                    isPulsing: false,
                    text: '',
                    textColor: styles.statusDefault.color
                };
        }
    })();

    // Calculate sidebar width and determine title positioning
    // Uses same formula as SidebarNavigator.tsx:18 for consistency
    const { width: windowWidth } = useWindowDimensions();
    const sidebarWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);
    // Keep the title in-flow on narrow sidebars so header actions do not overlap it.
    const shouldLeftJustify = settings.experiments || sidebarWidth < 340;

    const handleNewSession = React.useCallback(() => {
        router.navigate('/new');
    }, [router]);

    const handleSettings = React.useCallback(() => {
        router.push('/settings');
    }, [router]);

    // Title content used in both centered and left-justified modes (DRY)
    const titleContent = (
        <>
            <Text style={styles.titleText}>{desktopBrandTitle()}</Text>
            {connectionStatus.text && (
                <View style={styles.statusContainer}>
                    <StatusDot
                        color={connectionStatus.color}
                        isPulsing={connectionStatus.isPulsing}
                        size={6}
                        style={styles.statusDot}
                    />
                    <Text style={[styles.statusText, { color: connectionStatus.textColor }]}>
                        {connectionStatus.text}
                    </Text>
                </View>
            )}
        </>
    );

    return (
        <>
            <View style={[styles.container, { paddingTop: safeArea.top }]}>
                <View style={[styles.header, { height: headerHeight }]}>
                    {/* Logo - always first */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={desktopLogoSource(theme.dark)}
                            contentFit="contain"
                            style={[styles.logo, { height: 24, width: 24 }]}
                            accessibilityLabel={desktopBrandAccessibilityLabel()}
                        />
                    </View>

                    {/* Left-justified title - in document flow, prevents overlap */}
                    {shouldLeftJustify && (
                        <View style={styles.titleContainerLeft}>
                            {titleContent}
                        </View>
                    )}

                    {/* Navigation icons */}
                    <View style={styles.rightContainer}>
                        <Pressable
                            onPress={handleSettings}
                            hitSlop={15}
                        >
                            <Ionicons name="settings-outline" size={24} color={theme.colors.header.tint} />
                        </Pressable>
                        <Pressable
                            onPress={handleNewSession}
                            hitSlop={15}
                        >
                            <Ionicons name="add-outline" size={28} color={theme.colors.header.tint} />
                        </Pressable>
                    </View>

                    {/* Centered title - absolute positioned over full header */}
                    {!shouldLeftJustify && (
                        <View style={styles.titleContainer}>
                            {titleContent}
                        </View>
                    )}
                </View>
                {realtimeStatus !== 'disconnected' && (
                    <VoiceAssistantStatusBar variant="sidebar" />
                )}
                <MainView variant="sidebar" />
            </View>
            <FABWide onPress={handleNewSession} />
        </>
    )
});
