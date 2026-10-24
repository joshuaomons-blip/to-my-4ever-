/** @type {import('jest').Config} */
const tsJest = ['ts-jest', {}];
module.exports = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: { '^.+\\.ts$': tsJest },
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: { '^.+\\.ts$': tsJest },
      testMatch: ['<rootDir>/test/**/*.int.spec.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/env.ts'],
    },
  ],
};
