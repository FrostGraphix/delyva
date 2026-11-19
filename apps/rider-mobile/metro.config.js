// Expo auto-detects the pnpm workspace root for Metro.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
