/**
 * `react-native`, as the app's own code sees it on the web.
 *
 * Everything is react-native-web except `Alert` and `Linking` (see
 * rnw-alert.ts and rnw-linking.ts). Expo's web Babel preset usually rewrites
 * `import { Alert } from "react-native"` into a deep import of that one
 * export, which metro.config.js redirects; this module covers any import
 * that reaches the package as a whole.
 */
// @ts-ignore -- react-native-web ships no type declarations.
export * from "react-native-web";
export { default as Alert } from "./rnw-alert";
export { default as Linking } from "./rnw-linking";
