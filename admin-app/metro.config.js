const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Web build only: the app's own code reaches these modules through browser
 * stand-ins in src/web/shims, because the claude.ai artifact frame has no
 * phone file system, share sheet, keystore, camera API or system dialogs.
 * Libraries keep their normal modules; only imports from src/ are redirected,
 * and the shims themselves see the real ones.
 */
const SRC = path.join(__dirname, "src").toLowerCase() + path.sep;
const SHIMS = path.join(__dirname, "src", "web", "shims").toLowerCase() + path.sep;
const WEB_SHIMS = {
  "react-native": "react-native.ts",
  // Expo aliases react-native to react-native-web for web, and its Babel
  // preset rewrites `import { Alert } from "react-native"` into a deep import
  // of that single export -- so the app's imports arrive under these names.
  "react-native-web": "react-native.ts",
  "react-native-web/dist/exports/Alert": "rnw-alert.ts",
  "react-native-web/dist/cjs/exports/Alert": "rnw-alert.ts",
  "react-native-web/dist/exports/Linking": "rnw-linking.ts",
  "react-native-web/dist/cjs/exports/Linking": "rnw-linking.ts",
  "expo-file-system": "file-system.ts",
  "expo-sharing": "sharing.ts",
  "expo-image-picker": "image-picker.ts",
  "expo-document-picker": "document-picker.ts",
  "expo-print": "print.ts",
  "expo-notifications": "notifications.ts",
  "expo-haptics": "haptics.ts",
};

const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = (context.originModulePath || "").toLowerCase();
  const shim = WEB_SHIMS[moduleName];
  if (platform === "web" && shim && origin.startsWith(SRC) && !origin.startsWith(SHIMS)) {
    return { type: "sourceFile", filePath: path.join(__dirname, "src", "web", "shims", shim) };
  }
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
