import * as React from 'react';
import { View, TextInput, ActivityIndicator } from 'react-native';
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
    const [searchQuery, setSearchQuery] = React.useState('');

    const { uploading, downloading, enabled: transferEnabled, uploadFile, downloadFile } = useFileTransfer(sessionId);

    // Reset all state when session changes (ContextPanel doesn't unmount on route change)
    React.useEffect(() => {
        setView('tree');
        setSelectedFile(null);
        setSearchQuery('');
    }, [sessionId]);

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

    const handleFileSelect = (path: string) => {
        setSelectedFile(path);
        setView('preview');
    };

    const handleBack = () => {
        setView('tree');
        setSelectedFile(null);
    };

    const handleUpload = (targetDir: string) => {
        uploadFile(targetDir, () => {
            // Tree will auto-refresh on next render via stale data detection
        });
    };

    const handleDownload = (path: string) => {
        downloadFile(path);
    };

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
                </View>
            )}

            {/* Transfer status indicator */}
            {(uploading || downloading) && (
                <View style={styles.transferBar}>
                    <ActivityIndicator size="small" />
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
                    onFileSelect={handleFileSelect}
                    onUpload={transferEnabled ? handleUpload : undefined}
                />
            )}
            {view === 'preview' && selectedFile && (
                <FilePreviewPanel
                    sessionId={sessionId}
                    filePath={selectedFile}
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
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    searchInput: {
        height: 32,
        borderRadius: 6,
        paddingHorizontal: 8,
        fontSize: 13,
        backgroundColor: theme.colors.input?.background ?? theme.colors.surfaceHigh,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.divider,
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
