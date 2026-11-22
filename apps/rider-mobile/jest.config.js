/** Jest (jest-expo + React Native Testing Library) for the rider app. Tests live under src/. */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testTimeout: 30_000,
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-.*|react-navigation|@react-navigation/.*|@delyva/.*|socket\\.io-client|engine\\.io-client|socket\\.io-parser|engine\\.io-parser|@socket\\.io/.*|zod|zustand|@tanstack/.*|xmlhttprequest-ssl))',
  ],
  collectCoverageFrom: [
    'src/offline/trip-queue.ts',
    'src/offer/countdown.ts',
    'src/location/location-reporter.ts',
    'src/api/authed-fetch.ts',
    'src/api/errors.ts',
    'src/onboarding/routes.ts',
    'src/trip/maps.ts',
    'src/trip/trip-stage.ts',
    'src/lib/format.ts',
    'src/lib/jwt.ts',
    'src/lib/battery.ts',
    'src/i18n/index.ts',
  ],
  coverageThreshold: { global: { lines: 80, branches: 75, functions: 80, statements: 80 } },
};
