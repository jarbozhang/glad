export type SidebarMode = 'directory' | 'changes' | 'allFiles';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'directory';

export const SIDEBAR_MODES: readonly SidebarMode[] = [
    'directory',
    'changes',
    'allFiles',
] as const;

export function isSidebarMode(value: string): value is SidebarMode {
    return (SIDEBAR_MODES as readonly string[]).includes(value);
}
