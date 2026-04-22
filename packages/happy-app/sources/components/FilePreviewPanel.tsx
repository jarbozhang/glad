import * as React from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { sessionReadFile } from '@/sync/ops';
import { storage, useSessionFileCache } from '@/sync/storage';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { FileIcon } from '@/components/FileIcon';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';

interface FilePreviewPanelProps {
    sessionId: string;
    filePath: string;
    onBack: () => void;
    onDownload?: (path: string) => void;
}

const MAX_LINES = 500;

function decodeBase64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function isBinaryContent(bytes: Uint8Array): boolean {
    let nonPrintable = 0;
    const sampleSize = Math.min(bytes.length, 8192);
    for (let i = 0; i < sampleSize; i++) {
        if (bytes[i] === 0) return true;
        if (bytes[i] < 32 && bytes[i] !== 9 && bytes[i] !== 10 && bytes[i] !== 13) {
            nonPrintable++;
        }
    }
    return nonPrintable / sampleSize > 0.1;
}

function getFileLanguage(path: string): string | null {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js': case 'jsx': return 'javascript';
        case 'ts': case 'tsx': return 'typescript';
        case 'py': return 'python';
        case 'html': case 'htm': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        case 'md': return 'markdown';
        case 'xml': return 'xml';
        case 'yaml': case 'yml': return 'yaml';
        case 'sh': case 'bash': return 'bash';
        case 'sql': return 'sql';
        case 'go': return 'go';
        case 'rust': case 'rs': return 'rust';
        case 'java': return 'java';
        case 'c': return 'c';
        case 'cpp': case 'cc': case 'cxx': return 'cpp';
        case 'php': return 'php';
        case 'rb': return 'ruby';
        case 'swift': return 'swift';
        case 'kt': return 'kotlin';
        default: return null;
    }
}

export const FilePreviewPanel = React.memo(function FilePreviewPanel(props: FilePreviewPanelProps) {
    const { sessionId, filePath, onBack, onDownload } = props;
    const { theme } = useUnistyles();
    const cached = useSessionFileCache(sessionId, filePath);

    const [content, setContent] = React.useState<string | null>(() => cached?.content ?? null);
    const [isBinary, setIsBinary] = React.useState(() => cached?.isBinary ?? false);
    const [isLoading, setIsLoading] = React.useState(!cached);
    const [error, setError] = React.useState<string | null>(null);
    const [showFullPath, setShowFullPath] = React.useState(false);

    const fileName = filePath.split('/').pop() || filePath;
    const language = getFileLanguage(filePath);

    React.useEffect(() => {
        if (cached) return;

        let cancelled = false;

        (async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await sessionReadFile(sessionId, filePath);

                if (cancelled) return;

                if (!response.success || !response.content) {
                    setError(response.error || 'Failed to read file');
                    return;
                }

                let bytes: Uint8Array;
                let decoded: string;
                try {
                    bytes = decodeBase64ToBytes(response.content);
                    decoded = new TextDecoder().decode(bytes);
                } catch {
                    setIsBinary(true);
                    storage.getState().applyFileCache(sessionId, filePath, '', '', true);
                    return;
                }

                const binary = isBinaryContent(bytes);
                const text = binary ? '' : decoded;
                setContent(text);
                setIsBinary(binary);
                storage.getState().applyFileCache(sessionId, filePath, text, '', binary);
            } catch (e) {
                if (!cancelled) {
                    setError('Failed to load file');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [sessionId, filePath, cached]);

    React.useEffect(() => {
        if (error) {
            Modal.alert('Error', error);
        }
    }, [error]);

    // Truncate content if too many lines
    const { displayContent, isTruncated } = React.useMemo(() => {
        if (!content) return { displayContent: '', isTruncated: false };
        const lines = content.split('\n');
        if (lines.length > MAX_LINES) {
            return { displayContent: lines.slice(0, MAX_LINES).join('\n'), isTruncated: true };
        }
        return { displayContent: content, isTruncated: false };
    }, [content]);

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.container}>
                <TopBar
                    filePath={filePath}
                    fileName={fileName}
                    onBack={onBack}
                    onDownload={onDownload}
                    showFullPath={showFullPath}
                    onToggleFullPath={() => setShowFullPath(v => !v)}
                />
                <View style={styles.centered}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
            </View>
        );
    }

    // Error state
    if (error) {
        return (
            <View style={styles.container}>
                <TopBar
                    filePath={filePath}
                    fileName={fileName}
                    onBack={onBack}
                    onDownload={onDownload}
                    showFullPath={showFullPath}
                    onToggleFullPath={() => setShowFullPath(v => !v)}
                />
                <View style={styles.centered}>
                    <Text style={[styles.errorText, { color: theme.colors.textDestructive }]}>
                        {error}
                    </Text>
                </View>
            </View>
        );
    }

    // Binary file state
    if (isBinary) {
        return (
            <View style={styles.container}>
                <TopBar
                    filePath={filePath}
                    fileName={fileName}
                    onBack={onBack}
                    onDownload={onDownload}
                    showFullPath={showFullPath}
                    onToggleFullPath={() => setShowFullPath(v => !v)}
                />
                <View style={styles.centered}>
                    <FileIcon fileName={fileName} size={48} />
                    <Text style={[styles.binaryLabel, { color: theme.colors.textSecondary }]}>
                        Binary file
                    </Text>
                    <Text style={[styles.binaryFileName, { color: theme.colors.textSecondary }]}>
                        {fileName}
                    </Text>
                </View>
            </View>
        );
    }

    // Code content
    return (
        <View style={styles.container}>
            <TopBar
                filePath={filePath}
                fileName={fileName}
                onBack={onBack}
                onDownload={onDownload}
                showFullPath={showFullPath}
                onToggleFullPath={() => setShowFullPath(v => !v)}
            />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
            >
                {displayContent ? (
                    <SimpleSyntaxHighlighter
                        code={displayContent}
                        language={language}
                        selectable={true}
                    />
                ) : (
                    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                        Empty file
                    </Text>
                )}
                {isTruncated && (
                    <View style={[styles.truncatedBanner, { backgroundColor: theme.colors.surfaceHigh }]}>
                        <Text style={[styles.truncatedText, { color: theme.colors.textSecondary }]}>
                            File truncated — showing first {MAX_LINES} lines
                        </Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
});

// Top bar sub-component
interface TopBarProps {
    filePath: string;
    fileName: string;
    onBack: () => void;
    onDownload?: (path: string) => void;
    showFullPath: boolean;
    onToggleFullPath: () => void;
}

const TopBar = React.memo(function TopBar(props: TopBarProps) {
    const { filePath, fileName, onBack, onDownload, showFullPath, onToggleFullPath } = props;
    const { theme } = useUnistyles();

    return (
        <View style={[styles.topBar, { borderBottomColor: theme.colors.divider, backgroundColor: theme.colors.surfaceHigh }]}>
            <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
                <Text style={[styles.backArrow, { color: theme.colors.textLink }]}>
                    ←
                </Text>
            </Pressable>

            <Pressable onPress={onToggleFullPath} style={styles.pathContainer}>
                <FileIcon fileName={fileName} size={16} />
                <Text
                    numberOfLines={1}
                    style={[styles.fileName, { color: theme.colors.text }]}
                >
                    {fileName}
                </Text>
            </Pressable>

            {onDownload && (
                <Pressable onPress={() => onDownload(filePath)} style={styles.downloadButton} hitSlop={8}>
                    <Text style={[styles.downloadIcon, { color: theme.colors.textLink }]}>
                        ↓
                    </Text>
                </Pressable>
            )}

            {showFullPath && (
                <View style={[styles.fullPathOverlay, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.divider }]}>
                    <Text style={[styles.fullPathText, { color: theme.colors.text }]} selectable>
                        {filePath}
                    </Text>
                </View>
            )}
        </View>
    );
});

// Exported for testing
export { decodeBase64ToBytes, isBinaryContent, getFileLanguage, MAX_LINES };

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        position: 'relative',
    },
    backButton: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    backArrow: {
        fontSize: 18,
        ...Typography.default('semiBold'),
    },
    pathContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 8,
        overflow: 'hidden',
    },
    fileName: {
        fontSize: 13,
        marginLeft: 6,
        ...Typography.mono(),
    },
    downloadButton: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    downloadIcon: {
        fontSize: 18,
        ...Typography.default('semiBold'),
    },
    fullPathOverlay: {
        position: 'absolute',
        top: '100%',
        left: 8,
        right: 8,
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        zIndex: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    fullPathText: {
        fontSize: 12,
        ...Typography.mono(),
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 12,
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    },
    binaryLabel: {
        fontSize: 16,
        marginTop: 12,
        ...Typography.default('semiBold'),
    },
    binaryFileName: {
        fontSize: 13,
        marginTop: 4,
        ...Typography.mono(),
    },
    emptyText: {
        fontSize: 14,
        fontStyle: 'italic',
        ...Typography.default(),
    },
    truncatedBanner: {
        marginTop: 12,
        padding: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    truncatedText: {
        fontSize: 12,
        ...Typography.default(),
    },
}));
