import * as React from 'react';
import { View, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { FileTreeView } from '@/components/FileTreeView';
import { FilePreviewPanel } from '@/components/FilePreviewPanel';
import { useFileTransfer } from '@/hooks/useFileTransfer';
import { t } from '@/text';

// Extract sessionId from URL path: /session/[id]/... → id
function extractSessionId(pathname: string): string | null {
    const match = pathname.match(/\/session\/([^/]+)/);
    return match ? match[1] : null;
}

type PanelView = 'tree' | 'preview';

export const ContextPanel = React.memo(() => {
    const pathname = usePathname();
    const sessionId = extractSessionId(pathname);

    const [view, setView] = React.useState<PanelView>('tree');
    const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
    const [selectedFileSize, setSelectedFileSize] = React.useState<number | undefined>(undefined);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [treeRefreshKey, setTreeRefreshKey] = React.useState(0);

    const { uploading, downloading, enabled: transferEnabled, uploadFile, uploadFiles, downloadFile } = useFileTransfer(sessionId);

    // Reset all state when session changes (ContextPanel doesn't unmount on route change)
    React.useEffect(() => {
        setView('tree');
        setSelectedFile(null);
        setSelectedFileSize(undefined);
        setSearchQuery('');
        setTreeRefreshKey(0);
    }, [sessionId]);

    const handleFileSelect = React.useCallback((path: string, size?: number) => {
        setSelectedFile(path);
        setSelectedFileSize(size);
        setView('preview');
    }, []);

    const handleBack = React.useCallback(() => {
        setView('tree');
        setSelectedFile(null);
        setSelectedFileSize(undefined);
    }, []);

    const handleUpload = React.useCallback((targetDir: string) => {
        uploadFile(targetDir, () => {
            setTreeRefreshKey((key) => key + 1);
        });
    }, [uploadFile]);

    const handleUploadFiles = React.useCallback((targetDir: string, filePaths: string[]) => {
        uploadFiles(targetDir, filePaths, () => {
            setTreeRefreshKey((key) => key + 1);
        });
    }, [uploadFiles]);

    const handleDownload = React.useCallback((path: string) => {
        downloadFile(path);
    }, [downloadFile]);

    // No active session — show empty state
    if (!sessionId) {
        return (
            <View style={styles.container}>
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t('contextPanel.noSession')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header: search bar */}
            {view === 'tree' && (
                <View style={styles.header}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('contextPanel.searchPlaceholder')}
                        placeholderTextColor={styles.searchInput.color ? undefined : '#999'}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {transferEnabled && (
                        <Pressable
                            onPress={() => handleUpload('.')}
                            style={styles.uploadButton}
                            accessibilityRole="button"
                            accessibilityLabel={t('contextPanel.uploadToCurrentDirectory')}
                            hitSlop={6}
                        >
                            <Ionicons name="arrow-up" size={15} color={styles.uploadButtonIcon.color} />
                            <Text style={styles.uploadButtonText}>
                                {t('contextPanel.upload')}
                            </Text>
                        </Pressable>
                    )}
                </View>
            )}

            {/* Transfer status indicator */}
            {(uploading || downloading) && (
                <View style={styles.transferBar}>
                    <ActivityIndicator size="small" color={styles.transferText.color} />
                    <Text style={styles.transferText}>
                        {uploading ? t('contextPanel.uploading') : t('contextPanel.downloading')}
                    </Text>
                </View>
            )}

            {/* Main content */}
            {view === 'tree' && (
                <FileTreeView
                    sessionId={sessionId}
                    searchQuery={searchQuery}
                    refreshKey={treeRefreshKey}
                    dropLabel={t('contextPanel.dropFilesToUpload')}
                    onFileSelect={handleFileSelect}
                    onUpload={transferEnabled ? handleUpload : undefined}
                    onUploadFiles={transferEnabled ? handleUploadFiles : undefined}
                />
            )}
            {view === 'preview' && selectedFile && (
                <FilePreviewPanel
                    sessionId={sessionId}
                    filePath={selectedFile}
                    fileSize={selectedFileSize}
                    onBack={handleBack}
                    onDownload={transferEnabled ? handleDownload : undefined}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    searchInput: {
        flex: 1,
        height: 32,
        borderRadius: 6,
        paddingHorizontal: 8,
        fontSize: 13,
        backgroundColor: theme.colors.input?.background ?? theme.colors.surfaceHigh,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    uploadButton: {
        height: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    uploadButtonIcon: {
        color: theme.colors.textSecondary,
    },
    uploadButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text,
    },
    transferBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: theme.colors.surfaceHigh,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    transferText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
    },
}));
