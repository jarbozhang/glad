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
const mockDesktopGet = vi.fn();
const mockDesktopSet = vi.fn();
const mockDesktopRemove = vi.fn();
vi.mock('./desktopCredentialStorage', () => ({
    DesktopCredentialStorage: {
        getEncryptedCredentials: (...args: any[]) => mockDesktopGet(...args),
        setEncryptedCredentials: (...args: any[]) => mockDesktopSet(...args),
        removeEncryptedCredentials: (...args: any[]) => mockDesktopRemove(...args),
    },
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
        (globalThis as any).__DEV__ = true;
        localStorageData.clear();
        mockImportKey.mockReset();
        mockDeriveKey.mockReset();
        mockEncrypt.mockReset();
        mockDecrypt.mockReset();
        mockDesktopGet.mockReset();
        mockDesktopSet.mockReset();
        mockDesktopRemove.mockReset();

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

describe('tokenStorage (Tauri desktop credential store)', () => {
    const testCreds = { token: 'desktop-token', secret: 'desktop-secret' };
    const testCredsJson = JSON.stringify(testCreds);

    beforeEach(() => {
        (globalThis as any).__DEV__ = false;
        localStorageData.clear();
        mockImportKey.mockReset();
        mockDeriveKey.mockReset();
        mockEncrypt.mockReset();
        mockDecrypt.mockReset();
        mockDesktopGet.mockReset();
        mockDesktopSet.mockReset();
        mockDesktopRemove.mockReset();

        const fakeKey = { type: 'secret' };
        mockImportKey.mockResolvedValue(fakeKey);
        mockDeriveKey.mockResolvedValue(fakeKey);
        mockDesktopGet.mockResolvedValue(null);
        mockDesktopSet.mockResolvedValue(true);
        mockDesktopRemove.mockResolvedValue(true);
    });

    it('stores encrypted credentials in the desktop store instead of localStorage', async () => {
        const cipherBytes = new TextEncoder().encode('encrypted-data');
        mockEncrypt.mockResolvedValue(cipherBytes.buffer);
        localStorageData.set('auth_credentials', 'stale-legacy-data');
        localStorageData.set('_keychain_migrated', 'true');

        const result = await TokenStorage.setCredentials(testCreds);

        expect(result).toBe(true);
        expect(mockDesktopSet).toHaveBeenCalledWith(expect.any(String));
        expect(localStorageData.has('auth_credentials')).toBe(false);
        expect(localStorageData.has('_keychain_migrated')).toBe(false);
    });

    it('returns false when desktop store persistence fails', async () => {
        const cipherBytes = new TextEncoder().encode('encrypted-data');
        mockEncrypt.mockResolvedValue(cipherBytes.buffer);
        mockDesktopSet.mockResolvedValue(false);
        localStorageData.set('auth_credentials', 'stale-legacy-data');

        const result = await TokenStorage.setCredentials(testCreds);

        expect(result).toBe(false);
        expect(localStorageData.get('auth_credentials')).toBe('stale-legacy-data');
    });

    it('reads credentials from the desktop store first', async () => {
        localStorageData.set('auth_credentials', 'legacy-base64-data');
        mockDesktopGet.mockResolvedValue('desktop-base64-data');
        mockDecrypt.mockResolvedValue(new TextEncoder().encode(testCredsJson).buffer);

        const creds = await TokenStorage.getCredentials();

        expect(creds).toEqual(testCreds);
        expect(mockDesktopGet).toHaveBeenCalled();
        expect(mockDesktopSet).not.toHaveBeenCalled();
        expect(mockDecrypt).toHaveBeenCalledTimes(1);
    });

    it('migrates valid legacy localStorage credentials into the desktop store', async () => {
        localStorageData.set('auth_credentials', 'legacy-base64-data');
        mockDesktopGet.mockResolvedValue(null);
        mockDecrypt.mockResolvedValue(new TextEncoder().encode(testCredsJson).buffer);

        const creds = await TokenStorage.getCredentials();

        expect(creds).toEqual(testCreds);
        expect(mockDesktopSet).toHaveBeenCalledWith('legacy-base64-data');
        expect(localStorageData.get('auth_credentials')).toBe('legacy-base64-data');
    });

    it('returns legacy credentials without deleting them if migration fails', async () => {
        localStorageData.set('auth_credentials', 'legacy-base64-data');
        mockDesktopGet.mockResolvedValue(null);
        mockDesktopSet.mockResolvedValue(false);
        mockDecrypt.mockResolvedValue(new TextEncoder().encode(testCredsJson).buffer);

        const creds = await TokenStorage.getCredentials();

        expect(creds).toEqual(testCreds);
        expect(localStorageData.get('auth_credentials')).toBe('legacy-base64-data');
    });

    it('clears corrupted desktop store credentials and falls back to legacy localStorage', async () => {
        localStorageData.set('auth_credentials', 'legacy-base64-data');
        mockDesktopGet.mockResolvedValue('corrupted-desktop-data');
        mockDecrypt
            .mockRejectedValueOnce(new Error('desktop decrypt fail'))
            .mockResolvedValueOnce(new TextEncoder().encode(testCredsJson).buffer);

        const creds = await TokenStorage.getCredentials();

        expect(creds).toEqual(testCreds);
        expect(mockDesktopRemove).toHaveBeenCalled();
        expect(mockDesktopSet).toHaveBeenCalledWith('legacy-base64-data');
        expect(localStorageData.get('auth_credentials')).toBe('legacy-base64-data');
    });

    it('clears corrupted legacy localStorage credentials when desktop store is empty', async () => {
        localStorageData.set('auth_credentials', 'corrupted-legacy-data');
        mockDesktopGet.mockResolvedValue(null);
        mockDecrypt.mockRejectedValue(new Error('legacy decrypt fail'));

        const creds = await TokenStorage.getCredentials();

        expect(creds).toBeNull();
        expect(localStorageData.has('auth_credentials')).toBe(false);
    });

    it('removes both desktop store and legacy localStorage credentials', async () => {
        localStorageData.set('auth_credentials', 'legacy-data');
        localStorageData.set('_keychain_migrated', 'true');

        const result = await TokenStorage.removeCredentials();

        expect(result).toBe(true);
        expect(mockDesktopRemove).toHaveBeenCalled();
        expect(localStorageData.has('auth_credentials')).toBe(false);
        expect(localStorageData.has('_keychain_migrated')).toBe(false);
    });

    it('clears legacy localStorage even when desktop store removal fails', async () => {
        localStorageData.set('auth_credentials', 'legacy-data');
        localStorageData.set('_keychain_migrated', 'true');
        mockDesktopRemove.mockResolvedValue(false);

        const result = await TokenStorage.removeCredentials();

        expect(result).toBe(false);
        expect(localStorageData.has('auth_credentials')).toBe(false);
        expect(localStorageData.has('_keychain_migrated')).toBe(false);
    });
});
