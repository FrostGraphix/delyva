/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Cold Babel transforms of the workspace ESM packages are slow under parallel CI load.
  testTimeout: 60_000,
  // Regex (not glob): globs skip dot-directories such as .claude/worktrees.
  testRegex: '[\/]src[\/].*\.test\.tsx?$',
  // Workspace packages ship ESM; transform them (and RN/Expo libs) with Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|zustand|@delyva/.*))',
  ],
  collectCoverageFrom: [
    'src/features/**/*.ts',
    'src/components/otp-form.tsx',
    'src/components/item-sheet.tsx',
    'src/components/price-breakdown.tsx',
  ],
  coverageThreshold: { global: { lines: 80, statements: 80, functions: 70, branches: 70 } },
};
