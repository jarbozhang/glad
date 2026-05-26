import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isTauri } from '@/utils/isTauri';

const RECOVERY_ATTEMPTED_KEY = 'bfelab-style-recovery-attempted';
const HEALTH_CHECK_DELAY_MS = 3000;
const HEALTH_CHECK_RETRY_MS = 1000;
const MAX_HEALTH_CHECKS = 8;
const MIN_REACT_NATIVE_WEB_RULES = 20;

function getStyleRuleCount(id: string): number {
    const element = document.getElementById(id) as HTMLStyleElement | null;
    if (!element?.sheet) {
        return 0;
    }

    try {
        return element.sheet.cssRules.length;
    } catch {
        return 0;
    }
}

function getRootView(): HTMLElement | null {
    return document.querySelector('#root > div') as HTMLElement | null;
}

function isRootViewStyled(rootView: HTMLElement): boolean {
    const className = typeof rootView.className === 'string' ? rootView.className : '';
    const display = window.getComputedStyle(rootView).display;

    return className.includes('css-') && display === 'flex';
}

function isStyleRuntimeHealthy(rootView: HTMLElement): boolean {
    return getStyleRuleCount('react-native-stylesheet') >= MIN_REACT_NATIVE_WEB_RULES
        && isRootViewStyled(rootView);
}

function hasAttemptedRecovery(): boolean {
    try {
        return window.sessionStorage.getItem(RECOVERY_ATTEMPTED_KEY) === '1';
    } catch {
        return false;
    }
}

function setRecoveryAttempted() {
    try {
        window.sessionStorage.setItem(RECOVERY_ATTEMPTED_KEY, '1');
    } catch {
        // If sessionStorage is unavailable, still allow a single reload for this page instance.
    }
}

function clearRecoveryAttempted() {
    try {
        window.sessionStorage.removeItem(RECOVERY_ATTEMPTED_KEY);
    } catch {
        // Ignore storage failures; they should not affect normal startup.
    }
}

export function useTauriStyleRecovery() {
    useEffect(() => {
        if (Platform.OS !== 'web' || !isTauri() || typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }

        let disposed = false;
        let checks = 0;
        let timer: number | null = null;

        const check = () => {
            if (disposed) {
                return;
            }

            checks += 1;
            const rootView = getRootView();

            if (!rootView && checks < MAX_HEALTH_CHECKS) {
                timer = window.setTimeout(check, HEALTH_CHECK_RETRY_MS);
                return;
            }

            if (!rootView || isStyleRuntimeHealthy(rootView)) {
                clearRecoveryAttempted();
                return;
            }

            if (hasAttemptedRecovery()) {
                console.error('[tauri-style-recovery] Styles are still unhealthy after one reload.');
                return;
            }

            setRecoveryAttempted();
            console.warn('[tauri-style-recovery] React Native Web styles did not apply; reloading once.');
            window.location.reload();
        };

        timer = window.setTimeout(check, HEALTH_CHECK_DELAY_MS);

        return () => {
            disposed = true;
            if (timer) {
                window.clearTimeout(timer);
            }
        };
    }, []);
}
