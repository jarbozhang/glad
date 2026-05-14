import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR_ID, hashAvatarValue, normalizeAvatarId } from './avatarUtils';

describe('avatarUtils', () => {
    it('falls back when avatar id is missing', () => {
        expect(normalizeAvatarId(undefined)).toBe(DEFAULT_AVATAR_ID);
        expect(normalizeAvatarId(null)).toBe(DEFAULT_AVATAR_ID);
        expect(normalizeAvatarId('')).toBe(DEFAULT_AVATAR_ID);
    });

    it('keeps valid avatar ids unchanged', () => {
        expect(normalizeAvatarId('machine:/repo')).toBe('machine:/repo');
    });

    it('hashes missing values without throwing', () => {
        expect(hashAvatarValue(undefined)).toBe(hashAvatarValue(DEFAULT_AVATAR_ID));
        expect(hashAvatarValue(null)).toBe(hashAvatarValue(DEFAULT_AVATAR_ID));
        expect(hashAvatarValue('')).toBe(hashAvatarValue(DEFAULT_AVATAR_ID));
    });
});
