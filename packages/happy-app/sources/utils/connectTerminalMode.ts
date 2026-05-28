import { Platform } from 'react-native';
import { isDesktop } from '@/utils/platform';

export type ConnectTerminalMode = 'manual-only' | 'scanner-and-manual' | 'hidden';

export function getConnectTerminalMode(options?: {
    platformOS?: typeof Platform.OS;
    isDesktopPlatform?: boolean;
}): ConnectTerminalMode {
    const platformOS = options?.platformOS ?? Platform.OS;
    const isDesktopPlatform = options?.isDesktopPlatform ?? isDesktop();

    if (isDesktopPlatform) {
        return 'manual-only';
    }

    if (platformOS === 'web') {
        return 'hidden';
    }

    return 'scanner-and-manual';
}
