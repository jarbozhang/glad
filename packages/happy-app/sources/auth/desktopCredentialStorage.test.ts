import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsTauri = vi.fn();
vi.mock('@/utils/platform', () => ({
    isTauri: () => mockIsTauri(),
}));

const mockStoreGet = vi.fn();
const mockStoreSet = vi.fn();
const mockStoreDelete = vi.fn();
const mockStoreSave = vi.fn();
const mockStoreLoad = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
    Store: {
        load: (...args: any[]) => mockStoreLoad(...args),
    },
}));

import {
    DesktopCredentialStorage,
    resetDesktopCredentialStorageForTests,
} from './desktopCredentialStorage';

describe('desktopCredentialStorage', () => {
    beforeEach(() => {
        mockIsTauri.mockReturnValue(true);
        mockStoreGet.mockReset();
        mockStoreSet.mockReset();
        mockStoreDelete.mockReset();
        mockStoreSave.mockReset();
        mockStoreLoad.mockReset();
        mockStoreLoad.mockResolvedValue({
            get: (...args: any[]) => mockStoreGet(...args),
            set: (...args: any[]) => mockStoreSet(...args),
            delete: (...args: any[]) => mockStoreDelete(...args),
            save: (...args: any[]) => mockStoreSave(...args),
        });
        resetDesktopCredentialStorageForTests();
    });

    it('loads the auth store and reads encrypted credentials', async () => {
        mockStoreGet.mockResolvedValue('encrypted');

        const value = await DesktopCredentialStorage.getEncryptedCredentials();

        expect(value).toBe('encrypted');
        expect(mockStoreLoad).toHaveBeenCalledWith('auth.store.json', { defaults: {}, autoSave: false });
        expect(mockStoreGet).toHaveBeenCalledWith('auth_credentials_v1');
    });

    it('returns null for missing or non-string credential values', async () => {
        mockStoreGet.mockResolvedValue({ token: 'not-a-string' });

        const value = await DesktopCredentialStorage.getEncryptedCredentials();

        expect(value).toBeNull();
    });

    it('saves encrypted credentials and flushes the store', async () => {
        const saved = await DesktopCredentialStorage.setEncryptedCredentials('encrypted');

        expect(saved).toBe(true);
        expect(mockStoreSet).toHaveBeenCalledWith('auth_credentials_v1', 'encrypted');
        expect(mockStoreSave).toHaveBeenCalled();
    });

    it('removes encrypted credentials and flushes the store', async () => {
        const removed = await DesktopCredentialStorage.removeEncryptedCredentials();

        expect(removed).toBe(true);
        expect(mockStoreDelete).toHaveBeenCalledWith('auth_credentials_v1');
        expect(mockStoreSave).toHaveBeenCalled();
    });

    it('fails closed outside Tauri', async () => {
        mockIsTauri.mockReturnValue(false);

        await expect(DesktopCredentialStorage.getEncryptedCredentials()).resolves.toBeNull();
        await expect(DesktopCredentialStorage.setEncryptedCredentials('encrypted')).resolves.toBe(false);
        await expect(DesktopCredentialStorage.removeEncryptedCredentials()).resolves.toBe(false);
    });

    it('returns failure values when the Tauri store throws', async () => {
        mockStoreLoad.mockRejectedValue(new Error('store unavailable'));

        await expect(DesktopCredentialStorage.getEncryptedCredentials()).resolves.toBeNull();
        await expect(DesktopCredentialStorage.setEncryptedCredentials('encrypted')).resolves.toBe(false);
        await expect(DesktopCredentialStorage.removeEncryptedCredentials()).resolves.toBe(false);
    });
});
