import { describe, expect, it, vi } from 'vitest';
import { getConnectTerminalMode } from './connectTerminalMode';

vi.mock('react-native', () => ({
    Platform: {
        OS: 'web',
        isPad: false,
        Version: '',
        select: (obj: any) => obj.default,
    },
}));

vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));

describe('getConnectTerminalMode', () => {
    it('uses manual paste only on desktop platforms', () => {
        expect(getConnectTerminalMode({
            platformOS: 'web',
            isDesktopPlatform: true,
        })).toBe('manual-only');
    });

    it('keeps scanner and manual paste on native mobile platforms', () => {
        expect(getConnectTerminalMode({
            platformOS: 'ios',
            isDesktopPlatform: false,
        })).toBe('scanner-and-manual');

        expect(getConnectTerminalMode({
            platformOS: 'android',
            isDesktopPlatform: false,
        })).toBe('scanner-and-manual');
    });

    it('hides terminal connection controls on plain web', () => {
        expect(getConnectTerminalMode({
            platformOS: 'web',
            isDesktopPlatform: false,
        })).toBe('hidden');
    });
});
