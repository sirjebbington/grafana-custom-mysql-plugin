// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const base = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...base,
  // The automatic JSX runtime is used (no `import React`)
  // .mjs: some ESM-only dependencies of @grafana/data (d3-color) resolve to .mjs files
  transform: {
    '^.+\\.(t|j)sx?$|^.+\\.mjs$': [
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
