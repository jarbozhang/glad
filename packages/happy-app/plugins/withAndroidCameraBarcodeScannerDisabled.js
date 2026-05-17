const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAndroidCameraBarcodeScannerDisabled(config) {
    return withGradleProperties(config, (config) => {
        const key = 'expo.camera.barcode-scanner-enabled';
        const value = 'false';
        const property = config.modResults.find((item) => item.type === 'property' && item.key === key);

        if (property) {
            property.value = value;
        } else {
            config.modResults.push({ type: 'property', key, value });
        }

        return config;
    });
};
