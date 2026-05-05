import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native
vi.mock('react-native', () => ({
    Platform: { OS: 'web', select: (obj: any) => obj.default },
}));
vi.mock('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));
vi.mock('expo-secure-store', () => ({
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
}));

// Setup localStorage mock
const localStorageData = new Map<string, string>();
(global as any).localStorage = {
    getItem: (key: string) => localStorageData.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageData.set(key, value),
    removeItem: (key: string) => localStorageData.delete(key),
};

// Mock Web Crypto API for AES-GCM
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();
const mockImportKey = vi.fn();
const mockDeriveKey = vi.fn();
vi.stubGlobal('crypto', {
    subtle: {
        importKey: mockImportKey,
        deriveKey: mockDeriveKey,
        encrypt: mockEncrypt,
        decrypt: mockDecrypt,
    },
    getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i;
        return arr;
    },
});
vi.stubGlobal('btoa', (str: string) => Buffer.from(str, 'binary').toString('base64'));
vi.stubGlobal('atob', (str: string) => Buffer.from(str, 'base64').toString('binary'));

// Tauri environment
(global as any).window = { __TAURI_INTERNALS__: {} };

import { TokenStorage } from './tokenStorage';

describe('tokenStorage (Tauri encrypted localStorage)', () => {
    const testCreds = { token: 't1', secret: 's1' };
    const testCredsJson = JSON.stringify(testCreds);

    beforeEach(() => {
        localStorageData.clear();
        mockImportKey.mockReset();
        mockDeriveKey.mockReset();
        mockEncrypt.mockReset();
        mockDecrypt.mockReset();

        const fakeKey = { type: 'secret' };
        mockImportKey.mockResolvedValue(fakeKey);
        mockDeriveKey.mockResolvedValue(fakeKey);
    });

    describe('setCredentials', () => {
        it('encrypts and stores in localStorage', async () => {
            const cipherBytes = new TextEncoder().encode('encrypted-data');
            mockEncrypt.mockResolvedValue(cipherBytes.buffer);

            const result = await TokenStorage.setCredentials(testCreds);
            expect(result).toBe(true);
            expect(mockEncrypt).toHaveBeenCalled();
            expect(localStorageData.has('auth_credentials')).toBe(true);
        });

        it('returns false if encryption fails', async () => {
            mockEncrypt.mockRejectedValue(new Error('encrypt fail'));
            const result = await TokenStorage.setCredentials(testCreds);
            expect(result).toBe(false);
        });
    });

    describe('getCredentials', () => {
        it('returns null when nothing stored', async () => {
            const creds = await TokenStorage.getCredentials();
            expect(creds).toBeNull();
        });

        it('decrypts stored credentials', async () => {
            localStorageData.set('auth_credentials', 'some-base64-data');
            mockDecrypt.mockResolvedValue(new TextEncoder().encode(testCredsJson).buffer);

            const creds = await TokenStorage.getCredentials();
            expect(creds).toEqual(testCreds);
            expect(mockDecrypt).toHaveBeenCalled();
        });

        it('clears corrupted data on decrypt failure', async () => {
            localStorageData.set('auth_credentials', 'corrupted');
            mockDecrypt.mockRejectedValue(new Error('decrypt fail'));

            const creds = await TokenStorage.getCredentials();
            expect(creds).toBeNull();
            expect(localStorageData.has('auth_credentials')).toBe(false);
        });
    });

    describe('removeCredentials', () => {
        it('removes from localStorage', async () => {
            localStorageData.set('auth_credentials', 'data');
            localStorageData.set('_keychain_migrated', 'true');

            const result = await TokenStorage.removeCredentials();
            expect(result).toBe(true);
            expect(localStorageData.has('auth_credentials')).toBe(false);
            expect(localStorageData.has('_keychain_migrated')).toBe(false);
        });
    });
});
