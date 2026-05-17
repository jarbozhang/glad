import { CameraView } from 'expo-camera';
import { Platform } from 'react-native';

const SCANNER_TIMEOUT_MS = 5 * 60 * 1000;
let cancelPendingScan: (() => void) | undefined;

export async function scanQrCodeWithExpo(): Promise<string | null> {
    return await new Promise((resolve, reject) => {
        if (!CameraView.isModernBarcodeScannerAvailable) {
            resolve(null);
            return;
        }

        cancelPendingScan?.();
        if (Platform.OS === 'ios') {
            CameraView.dismissScanner().catch((e: unknown) => {
                console.warn('Failed to dismiss previous scanner', e);
            });
        }

        let settled = false;
        let subscription: { remove: () => void } | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }
            subscription?.remove();
            subscription = undefined;
            if (cancelPendingScan === settleAsCanceled) {
                cancelPendingScan = undefined;
            }
        };

        const settleAsCanceled = () => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            resolve(null);
        };

        const settleWithError = (e: unknown) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            reject(e);
        };

        subscription = CameraView.onModernBarcodeScanned(async (event) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();

            if (Platform.OS === 'ios') {
                try {
                    await CameraView.dismissScanner();
                } catch (e) {
                    console.warn('Failed to dismiss scanner', e);
                }
            }

            resolve(event.data ?? null);
        });
        cancelPendingScan = settleAsCanceled;
        timeout = setTimeout(settleAsCanceled, SCANNER_TIMEOUT_MS);

        CameraView.launchScanner({
            barcodeTypes: ['qr']
        }).catch(settleWithError);
    });
}

export function cancelScanQrCodeWithExpo() {
    cancelPendingScan?.();
    if (Platform.OS === 'ios' && CameraView.isModernBarcodeScannerAvailable) {
        CameraView.dismissScanner().catch((e: unknown) => {
            console.warn('Failed to dismiss scanner during cleanup', e);
        });
    }
}
