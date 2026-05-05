import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isTauri } from '@/utils/platform';

const AUTH_KEY = 'auth_credentials';
const LEGACY_KEYCHAIN_MIGRATION_FLAG = '_keychain_migrated';

// Cache for synchronous access
let credentialsCache: string | null = null;

// AES-GCM encryption for Tauri localStorage storage
const ENCRYPT_KEY = 'bfelab';

async function getCryptoKey(): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(ENCRYPT_KEY), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('happy-salt'), iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptValue(plaintext: string): Promise<string> {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
}

async function decryptValue(encrypted: string): Promise<string> {
    const key = await getCryptoKey();
    const raw = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
}

export interface AuthCredentials {
    token: string;
    secret: string;
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        // Tauri: AES-encrypted localStorage
        if (isTauri()) {
            try {
                const stored = localStorage.getItem(AUTH_KEY);
                if (!stored) return null;
                const decrypted = await decryptValue(stored);
                return JSON.parse(decrypted) as AuthCredentials;
            } catch (e) {
                console.warn('[tokenStorage] Decrypt failed, clearing corrupted data:', e);
                localStorage.removeItem(AUTH_KEY);
                return null;
            }
        }

        // Web: localStorage
        if (Platform.OS === 'web') {
            return localStorage.getItem(AUTH_KEY) ? JSON.parse(localStorage.getItem(AUTH_KEY)!) as AuthCredentials : null;
        }

        // Native: SecureStore
        try {
            const stored = await SecureStore.getItemAsync(AUTH_KEY);
            if (!stored) return null;
            credentialsCache = stored;
            return JSON.parse(stored) as AuthCredentials;
        } catch (error) {
            console.error('Error getting credentials:', error);
            return null;
        }
    },

    async setCredentials(credentials: AuthCredentials): Promise<boolean> {
        if (isTauri()) {
            try {
                const encrypted = await encryptValue(JSON.stringify(credentials));
                localStorage.setItem(AUTH_KEY, encrypted);
                return true;
            } catch (e) {
                console.warn('[tokenStorage] Encrypt failed:', e);
                return false;
            }
        }

        if (Platform.OS === 'web') {
            localStorage.setItem(AUTH_KEY, JSON.stringify(credentials));
            return true;
        }

        try {
            const json = JSON.stringify(credentials);
            await SecureStore.setItemAsync(AUTH_KEY, json);
            credentialsCache = json;
            return true;
        } catch (error) {
            console.error('Error setting credentials:', error);
            return false;
        }
    },

    async removeCredentials(): Promise<boolean> {
        if (isTauri()) {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(LEGACY_KEYCHAIN_MIGRATION_FLAG);
            return true;
        }

        if (Platform.OS === 'web') {
            localStorage.removeItem(AUTH_KEY);
            return true;
        }

        try {
            await SecureStore.deleteItemAsync(AUTH_KEY);
            credentialsCache = null;
            return true;
        } catch (error) {
            console.error('Error removing credentials:', error);
            return false;
        }
    },
};
