import { isTauri } from '@/utils/platform';

const STORE_PATH = 'auth.store.json';
const AUTH_STORE_KEY = 'auth_credentials_v1';

type TauriStore = Awaited<ReturnType<typeof import('@tauri-apps/plugin-store').Store.load>>;

let storePromise: Promise<TauriStore> | null = null;

async function getStore(): Promise<TauriStore> {
    if (!isTauri()) {
        throw new Error('Desktop credential storage is only available in Tauri');
    }

    if (!storePromise) {
        storePromise = import('@tauri-apps/plugin-store')
            .then(({ Store }) => Store.load(STORE_PATH, { defaults: {}, autoSave: false }))
            .catch((error) => {
                storePromise = null;
                throw error;
            });
    }

    return storePromise;
}

export const DesktopCredentialStorage = {
    async getEncryptedCredentials(): Promise<string | null> {
        if (!isTauri()) return null;

        try {
            const store = await getStore();
            const value = await store.get<string>(AUTH_STORE_KEY);
            return typeof value === 'string' ? value : null;
        } catch (error) {
            console.warn('[desktopCredentialStorage] Failed to read credentials:', error);
            return null;
        }
    },

    async setEncryptedCredentials(value: string): Promise<boolean> {
        if (!isTauri()) return false;

        try {
            const store = await getStore();
            await store.set(AUTH_STORE_KEY, value);
            await store.save();
            return true;
        } catch (error) {
            console.warn('[desktopCredentialStorage] Failed to save credentials:', error);
            return false;
        }
    },

    async removeEncryptedCredentials(): Promise<boolean> {
        if (!isTauri()) return false;

        try {
            const store = await getStore();
            await store.delete(AUTH_STORE_KEY);
            await store.save();
            return true;
        } catch (error) {
            console.warn('[desktopCredentialStorage] Failed to remove credentials:', error);
            return false;
        }
    },
};

export function resetDesktopCredentialStorageForTests() {
    storePromise = null;
}
