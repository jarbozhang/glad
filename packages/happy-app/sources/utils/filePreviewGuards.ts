export const MAX_PREVIEW_BYTES = 1024 * 1024;

const NON_PREVIEWABLE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'ico',
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm',
    'mp3', 'wav', 'flac', 'aac', 'ogg',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'tar', 'gz', 'rar', '7z',
    'exe', 'dmg', 'deb', 'rpm',
    'woff', 'woff2', 'ttf', 'otf',
    'db', 'sqlite', 'sqlite3',
]);

export function isTooLargeForPreview(fileSize: number | undefined): boolean {
    return fileSize !== undefined && fileSize > MAX_PREVIEW_BYTES;
}

export function isPathNonPreviewable(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ext ? NON_PREVIEWABLE_EXTENSIONS.has(ext) : false;
}

export function shouldSkipInlineFilePreview(path: string, fileSize?: number): boolean {
    return isPathNonPreviewable(path) || isTooLargeForPreview(fileSize);
}
