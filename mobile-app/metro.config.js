const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Metro's "package exports" resolution (default since SDK 53) makes `firebase/auth`
// resolve to the wrong internal build for React Native, breaking Auth component
// registration ("Component auth has not been registered yet"). Disabling it falls
// back to the classic main-field resolution, which resolves the RN-specific build.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
