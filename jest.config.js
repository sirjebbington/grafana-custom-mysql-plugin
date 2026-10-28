// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const base = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...base,
  // The code copied from Grafana core uses the automatic JSX runtime (no `import React`)
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        sourceMaps: 'inline',
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: false, dynamicImport: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
};
