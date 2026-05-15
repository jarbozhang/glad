import { describe, expect, it } from 'vitest';
import { DEFAULT_SIDEBAR_MODE, isSidebarMode, SIDEBAR_MODES } from './filesSidebarTabsModel';

describe('filesSidebarTabsModel', () => {
    it('defaults to the directory tab', () => {
        expect(SIDEBAR_MODES).toEqual(['directory', 'changes', 'allFiles']);
        expect(DEFAULT_SIDEBAR_MODE).toBe('directory');
    });

    it('recognizes only supported sidebar modes', () => {
        expect(isSidebarMode('directory')).toBe(true);
        expect(isSidebarMode('changes')).toBe(true);
        expect(isSidebarMode('allFiles')).toBe(true);
        expect(isSidebarMode('gitFiles')).toBe(false);
    });
});
