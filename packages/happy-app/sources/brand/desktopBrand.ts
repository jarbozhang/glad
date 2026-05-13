import { isTauri } from '@/utils/platform';
import { t } from '@/text';

export const BFELAB_BRAND_NAME = 'BFELAB';

export function isBFELABDesktop(): boolean {
    return isTauri();
}

export function desktopBrandTitle(): string {
    return isBFELABDesktop() ? t('desktopBrand.name') : t('sidebar.sessionsTitle');
}

export function desktopBrandAccessibilityLabel(): string {
    return desktopBrandTitle();
}

export function desktopWelcomeTitle(): string {
    return isBFELABDesktop() ? t('desktopBrand.welcomeTitle') : t('welcome.title');
}

export function desktopWelcomeSubtitle(): string {
    return isBFELABDesktop() ? t('desktopBrand.welcomeSubtitle') : t('welcome.subtitle');
}

export function desktopAboutFooter(): string | undefined {
    return isBFELABDesktop() ? undefined : t('settings.aboutFooter');
}

export function desktopTerminalRequestDescription(): string {
    return isBFELABDesktop()
        ? t('desktopBrand.terminalRequestDescription')
        : t('terminal.terminalRequestDescription');
}

export function desktopRestoreOpenMobileInstruction(): string {
    return isBFELABDesktop()
        ? t('desktopBrand.restoreOpenMobileInstruction')
        : 'Open Happy on your mobile device';
}

export function desktopMicrophonePermissionMessage(canAskAgain: boolean): string {
    if (canAskAgain) {
        return `${desktopBrandTitle()} needs access to your microphone for voice chat. Please grant permission when prompted.`;
    }
    return `${desktopBrandTitle()} needs access to your microphone for voice chat. Please enable microphone access in your device settings.`;
}

export function desktopDefaultVoiceAgentLabel(): string {
    return isBFELABDesktop() ? `${BFELAB_BRAND_NAME} default` : 'Happy default';
}

export function desktopVoiceServerLabel(): string {
    return isBFELABDesktop() ? `${BFELAB_BRAND_NAME} server` : 'Happy server';
}

export function desktopVoiceByoDescription(): string {
    return `Use your own ElevenLabs agent instead of the ${desktopDefaultVoiceAgentLabel()}. No subscription required - connect directly with your own ElevenLabs account. Your agent must define two client tools: messageClaudeCode (sends text to the coding agent) and processPermissionRequest (allows or denies tool use). It receives session context via the {{initialConversationContext}} dynamic variable.`;
}

export function desktopVoiceCustomAgentIdDescription(): string {
    return `Enter your ElevenLabs agent ID. Leave empty to use the ${desktopDefaultVoiceAgentLabel()}.`;
}

export function desktopVoiceBypassTokenSubtitle(): string {
    return `Skip ${desktopVoiceServerLabel()}, connect straight to ElevenLabs`;
}

export function desktopVoiceDeveloperFooter(): string {
    return `Developer-only diagnostics and local override controls for the current voice rollout. The paid voice gate runs through ${desktopVoiceServerLabel()} unless Direct Connection and a custom ElevenLabs agent are both enabled.`;
}

export function desktopLogoSource(themeDark: boolean) {
    if (isBFELABDesktop()) {
        return themeDark
            ? require('@/assets/images/bfelab-logo-white.png')
            : require('@/assets/images/bfelab-logo-black.png');
    }

    return themeDark
        ? require('@/assets/images/logo-white.png')
        : require('@/assets/images/logo-black.png');
}

export function desktopLogotypeSource(themeDark: boolean) {
    if (isBFELABDesktop()) {
        return themeDark
            ? require('@/assets/images/bfelab-logotype-light.png')
            : require('@/assets/images/bfelab-logotype-dark.png');
    }

    return themeDark
        ? require('@/assets/images/logotype-light.png')
        : require('@/assets/images/logotype-dark.png');
}
