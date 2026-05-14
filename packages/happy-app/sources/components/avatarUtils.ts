export const DEFAULT_AVATAR_ID = 'unknown-avatar';

export function normalizeAvatarId(id: unknown): string {
    return typeof id === 'string' && id.length > 0 ? id : DEFAULT_AVATAR_ID;
}

export function hashAvatarValue(value: unknown): number {
    const str = normalizeAvatarId(value);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return Math.abs(hash);
}
