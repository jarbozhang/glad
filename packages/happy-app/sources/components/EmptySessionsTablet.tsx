import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { useRouter } from 'expo-router';
import { RoundButton } from '@/components/RoundButton';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { Modal } from '@/modal';
import { t } from '@/text';
import { getConnectTerminalMode } from '@/utils/connectTerminalMode';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    iconContainer: {
        marginBottom: 24,
    },
    titleText: {
        fontSize: 20,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 8,
        ...Typography.default('regular'),
    },
    descriptionText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        ...Typography.default(),
    },
    button: {
        backgroundColor: theme.colors.button.primary.background,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: theme.colors.textSecondary,
        opacity: 0.6,
    },
    buttonIcon: {
        marginRight: 8,
    },
    buttonText: {
        fontSize: 16,
        color: theme.colors.button.primary.tint,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    manualButtonWrapper: {
        width: 220,
    },
}));

export function EmptySessionsTablet() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const machines = useAllMachines();
    const { connectWithUrl, isLoading } = useConnectTerminal();
    const showManualTerminalAuth = getConnectTerminalMode() === 'manual-only';
    
    const hasOnlineMachines = React.useMemo(() => {
        return machines.some(machine => isMachineOnline(machine));
    }, [machines]);
    
    const handleStartNewSession = () => {
        router.navigate('/new');
    };

    const promptForTerminalUrl = React.useCallback(async () => {
        const url = await Modal.prompt(
            t('modals.authenticateTerminal'),
            t('modals.pasteUrlFromTerminal'),
            {
                placeholder: 'happy://terminal?...',
                cancelText: t('common.cancel'),
                confirmText: t('common.authenticate')
            }
        );

        if (url?.trim()) {
            await connectWithUrl(url.trim());
        }
    }, [connectWithUrl]);
    
    return (
        <View style={styles.container}>
            <Ionicons 
                name="terminal-outline" 
                size={64} 
                color={theme.colors.textSecondary}
                style={styles.iconContainer}
            />
            
            <Text style={styles.titleText}>
                No active sessions
            </Text>
            
            {hasOnlineMachines ? (
                <>
                    <Text style={styles.descriptionText}>
                        Start a new session on any of your connected machines.
                    </Text>
                    <Pressable
                        style={styles.button}
                        onPress={handleStartNewSession}
                    >
                        <Ionicons
                            name="add"
                            size={20}
                            color={theme.colors.button.primary.tint}
                            style={styles.buttonIcon}
                        />
                        <Text style={styles.buttonText}>
                            Start New Session
                        </Text>
                    </Pressable>
                </>
            ) : (
                <>
                    <Text style={styles.descriptionText}>
                        Open a new terminal on your computer to start session.
                    </Text>
                    {showManualTerminalAuth && (
                        <View style={styles.manualButtonWrapper}>
                            <RoundButton
                                title={t('connect.enterUrlManually')}
                                size="normal"
                                loading={isLoading}
                                onPress={promptForTerminalUrl}
                            />
                        </View>
                    )}
                </>
            )}
        </View>
    );
}
