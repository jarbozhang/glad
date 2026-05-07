const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname, {
  // Enable CSS support for web
  isCSSEnabled: true,
});

// Add support for .wasm files (required by Skia for all platforms)
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/installation/
config.resolver.assetExts.push('wasm');

// Enable inlineRequires for proper Skia and Reanimated loading
// Source: https://shopify.github.io/react-native-skia/docs/getting-started/web/
// Without this, Skia throws "react-native-reanimated is not installed" error
// This is cross-platform compatible (iOS, Android, web)
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true, // Critical for @shopify/react-native-skia
  },
});

const defaultResolveRequest = config.resolver.resolveRequest;
const webAliases = {
  "libsodium": require.resolve("libsodium", { paths: [__dirname] }),
  "libsodium-wrappers": require.resolve("libsodium-wrappers", { paths: [__dirname] }),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && webAliases[moduleName]) {
    return {
      type: "sourceFile",
      filePath: fs.realpathSync(webAliases[moduleName]),
    };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
