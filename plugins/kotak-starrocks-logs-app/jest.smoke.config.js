// API-level e2e tests against the running stack (scripts/e2e.sh up). Not part of `npm run test:ci`.
const base = require('./jest.config');

module.exports = {
  ...base,
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  testMatch: ['<rootDir>/tests/smoke/**/*.test.ts'],
  testTimeout: 60000,
};
