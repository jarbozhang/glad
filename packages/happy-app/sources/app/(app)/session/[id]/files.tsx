import * as React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { FilesSidebar } from '@/components/FilesSidebar';
import { useFileTransfer } from '@/hooks/useFileTransfer';
import { useSession } from '@/sync/storage';

export default React.memo(function FilesScreen() {
    const router = useRouter();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const { theme } = useUnistyles();
    const session = useSession(sessionId!);
    const fileTransfer = useFileTransfer(sessionId!);
    const [directoryRefreshRequest, setDirectoryRefreshRequest] = React.useState({ key: 0, path: '.' });

    const directoryActivityRefreshKey = React.useMemo(() => {
        if (!session) return 0;
        return [
            session.seq ?? 0,
            session.updatedAt ?? 0,
            session.agentStateVersion ?? 0,
            session.metadataVersion ?? 0,
            session.thinking ? 1 : 0,
        ].join(':');
    }, [session]);

    const directoryAutoRefreshIntervalMs = session?.thinking ? 7000 : 45000;

    const handleFilePress = React.useCallback((filePath: string) => {
        const encodedPath = btoa(filePath);
        router.push(`/session/${sessionId}/file?path=${encodedPath}`);
    }, [router, sessionId]);

    const handleUploadDirectory = React.useCallback((targetDir: string) => {
        fileTransfer.uploadFile(targetDir, () => {
            setDirectoryRefreshRequest((request) => ({
                key: request.key + 1,
                path: targetDir || '.',
            }));
        });
    }, [fileTransfer]);

    const handleDownloadFile = React.useCallback((filePath: string) => {
        fileTransfer.downloadFile(filePath);
    }, [fileTransfer]);

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.surface }}>
            <FilesSidebar
                sessionId={sessionId!}
                mode="directory"
                onDirectoryFilePress={handleFilePress}
                onDirectoryUpload={handleUploadDirectory}
                onDirectoryDownload={handleDownloadFile}
                directoryTransferEnabled={fileTransfer.enabled}
                directoryTransferStatus={fileTransfer.uploading ? 'uploading' : fileTransfer.downloading ? 'downloading' : 'idle'}
                directoryRefreshKey={directoryRefreshRequest.key}
                directoryRefreshPath={directoryRefreshRequest.path}
                directoryActivityRefreshKey={directoryActivityRefreshKey}
                directoryAutoRefreshIntervalMs={directoryAutoRefreshIntervalMs}
            />
        </View>
    );
});
