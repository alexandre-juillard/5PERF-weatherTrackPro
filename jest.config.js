// Tests use config/test.yaml (dedicated database, no access log)
process.env.NODE_ENV = 'test';

/** @type {import('jest').Config} */
export default {
  verbose: true,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, isolatedModules: true, tsconfig: { module: 'es2022', moduleResolution: 'node', esModuleInterop: true } },
    ],
  },
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globalSetup: '<rootDir>/test/global-setup.mjs',
};
