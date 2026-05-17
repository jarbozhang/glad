import { requireOptionalNativeModule } from 'expo-modules-core';

type HappyQrScannerModule = {
    scanQrCode: () => Promise<string | null>;
};

const HappyQrScanner = requireOptionalNativeModule<HappyQrScannerModule>('HappyQrScanner');

export async function scanQrCode(): Promise<string | null> {
    if (HappyQrScanner) {
        return await HappyQrScanner.scanQrCode();
    }

    console.warn('HappyQrScanner native module is not available.');
    return null;
}

export function cancelScanQrCode() {
    // The Android scanner owns a native Activity with its own back/X controls.
}
