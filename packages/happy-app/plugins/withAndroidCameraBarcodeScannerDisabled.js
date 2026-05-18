const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const BARCODE_SCANNER_KEY = 'expo.camera.barcode-scanner-enabled';
const DISABLE_GOOGLE_BARCODE_RUNTIME_BEGIN =
    '// @generated begin happy-disable-google-barcode-runtime';
const DISABLE_GOOGLE_BARCODE_RUNTIME_END =
    '// @generated end happy-disable-google-barcode-runtime';

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addGoogleBarcodeRuntimeExcludes(contents) {
    const block = `${DISABLE_GOOGLE_BARCODE_RUNTIME_BEGIN}
// Expo Camera ships as a prebuilt AAR in SDK 55, so the Gradle property alone
// does not remove barcode scanner runtime dependencies from the app APK.
configurations.configureEach {
    exclude group: "androidx.camera", module: "camera-mlkit-vision"
    exclude group: "com.google.android.gms", module: "play-services-code-scanner"
    exclude group: "com.google.android.gms", module: "play-services-mlkit-barcode-scanning"
    exclude group: "com.google.mlkit", module: "barcode-scanning"
    exclude group: "com.google.mlkit", module: "barcode-scanning-common"
}
${DISABLE_GOOGLE_BARCODE_RUNTIME_END}`;

    const existingBlock = new RegExp(
        `\\n*${escapeRegExp(DISABLE_GOOGLE_BARCODE_RUNTIME_BEGIN)}[\\s\\S]*?${escapeRegExp(DISABLE_GOOGLE_BARCODE_RUNTIME_END)}\\n*`,
        'm'
    );

    if (existingBlock.test(contents)) {
        return contents.replace(existingBlock, `\n\n${block}\n`);
    }

    return `${contents.trimEnd()}\n\n${block}\n`;
}

module.exports = function withAndroidCameraBarcodeScannerDisabled(config) {
    config = withGradleProperties(config, (config) => {
        const key = BARCODE_SCANNER_KEY;
        const value = 'false';
        const property = config.modResults.find((item) => item.type === 'property' && item.key === key);

        if (property) {
            property.value = value;
        } else {
            config.modResults.push({ type: 'property', key, value });
        }

        return config;
    });

    return withAppBuildGradle(config, (config) => {
        if (config.modResults.language === 'groovy') {
            config.modResults.contents = addGoogleBarcodeRuntimeExcludes(config.modResults.contents);
        }

        return config;
    });
};
