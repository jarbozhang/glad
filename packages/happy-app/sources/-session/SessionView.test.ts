import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('SessionView sidebar defaults', () => {
    it('initializes the sidebar from the shared default mode', () => {
        const source = readFileSync(join(__dirname, 'SessionView.tsx'), 'utf8');

        expect(source).toContain("import { DEFAULT_SIDEBAR_MODE } from '@/components/filesSidebarTabsModel';");
        expect(source).toContain('React.useState<SidebarMode>(DEFAULT_SIDEBAR_MODE)');
        expect(source).not.toContain("React.useState<SidebarMode>('changes')");
    });
});
