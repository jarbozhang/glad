import { useCameraPermissions } from "expo-camera";

export function useCheckScannerPermissions(): () => Promise<boolean> {
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    return async () => {
        if (!cameraPermission) {
            // camera permissions are loading
            return false;
        }

        if (!cameraPermission.granted) {
            const reqRes = await requestCameraPermission();
            return reqRes.granted;
        }

        return true;
    }
}
