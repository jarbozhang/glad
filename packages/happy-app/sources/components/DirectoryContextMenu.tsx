import * as React from 'react';
import { Modal as RNModal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

export type DirectoryContextMenuAnchor = {
    x: number;
    y: number;
};

export type DirectoryContextMenuTarget =
    | { type: 'directory'; path: string }
    | { type: 'file'; path: string }
    | { type: 'empty' };

interface DirectoryContextMenuProps {
    anchor: DirectoryContextMenuAnchor | null;
    target: DirectoryContextMenuTarget | null;
    visible: boolean;
    transferEnabled: boolean;
    onClose: () => void;
    onUploadDirectory?: (targetDir: string) => void;
    onDownloadFile?: (filePath: string) => void;
}

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 44;
const MENU_MARGIN = 12;

export function DirectoryContextMenu({
    anchor,
    target,
    visible,
    transferEnabled,
    onClose,
    onUploadDirectory,
    onDownloadFile,
}: DirectoryContextMenuProps) {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();

    const actions = React.useMemo(() => {
        if (!target || !transferEnabled) return [];
        if (target.type === 'file') {
            return [{
                id: 'download',
                label: t('files.downloadFile'),
                icon: 'download' as const,
                onPress: () => onDownloadFile?.(target.path),
            }];
        }
        const targetDir = target.type === 'directory' ? target.path : '.';
        return [{
            id: 'upload',
            label: target.type === 'directory' ? t('files.uploadToThisDirectory') : t('files.uploadToProjectRoot'),
            icon: 'upload' as const,
            onPress: () => onUploadDirectory?.(targetDir),
        }];
    }, [onDownloadFile, onUploadDirectory, target, transferEnabled]);

    const position = React.useMemo(() => {
        if (!anchor) return null;
        const estimatedHeight = Math.max(actions.length, 1) * MENU_ITEM_HEIGHT;
        return {
            left: Math.max(MENU_MARGIN, Math.min(windowWidth - MENU_WIDTH - MENU_MARGIN, anchor.x)),
            top: Math.max(MENU_MARGIN, Math.min(windowHeight - estimatedHeight - MENU_MARGIN, anchor.y)),
        };
    }, [actions.length, anchor, windowHeight, windowWidth]);

    const handleActionPress = React.useCallback((action: { onPress: () => void }) => {
        onClose();
        action.onPress();
    }, [onClose]);

    if (!visible || !anchor || !target || actions.length === 0 || Platform.OS !== 'web') {
        return null;
    }

    return (
        <RNModal animationType="none" onRequestClose={onClose} transparent visible={visible}>
            <View style={styles.container}>
                <Pressable onPress={onClose} style={styles.backdrop} />
                <View style={[styles.menu, { left: position?.left ?? MENU_MARGIN, top: position?.top ?? MENU_MARGIN }]}>
                    <View style={[styles.card, { backgroundColor: theme.colors.header.background }]}>
                        {actions.map((action, index) => (
                            <Pressable
                                key={action.id}
                                accessibilityRole="button"
                                onPress={() => handleActionPress(action)}
                                style={({ pressed }) => [
                                    styles.menuItem,
                                    index < actions.length - 1 && styles.menuItemDivider,
                                    pressed && styles.menuItemPressed,
                                ]}
                            >
                                <Octicons name={action.icon} size={16} color={theme.colors.text} />
                                <Text style={styles.menuItemLabel} numberOfLines={1}>{action.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </View>
        </RNModal>
    );
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.08)',
    },
    menu: {
        position: 'absolute',
        width: MENU_WIDTH,
    },
    card: {
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    menuItem: {
        minHeight: MENU_ITEM_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
    },
    menuItemPressed: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    menuItemDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    menuItemLabel: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
}));
