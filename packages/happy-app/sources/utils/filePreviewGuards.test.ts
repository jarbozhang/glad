import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_BYTES, isPathNonPreviewable, isTooLargeForPreview, shouldSkipInlineFilePreview } from './filePreviewGuards';

describe('filePreviewGuards', () => {
    it('flags only files larger than the preview limit', () => {
        expect(isTooLargeForPreview(undefined)).toBe(false);
        expect(isTooLargeForPreview(MAX_PREVIEW_BYTES)).toBe(false);
        expect(isTooLargeForPreview(MAX_PREVIEW_BYTES + 1)).toBe(true);
    });

    it('skips inline preview for known binary document types even when size is unavailable', () => {
        expect(isPathNonPreviewable('report.pdf')).toBe(true);
        expect(isPathNonPreviewable('slides.pptx')).toBe(true);
        expect(shouldSkipInlineFilePreview('report.pdf')).toBe(true);
        expect(shouldSkipInlineFilePreview('src/index.ts', MAX_PREVIEW_BYTES + 1)).toBe(true);
        expect(shouldSkipInlineFilePreview('src/index.ts', 1024)).toBe(false);
    });
});
