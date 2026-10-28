import type { Configuration, RuleSetRule } from 'webpack';

import grafanaConfig, { type Env } from './.config/webpack/webpack.config';

// Extends the scaffolded config (https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations)
// for Grafana 12.0:
// - Grafana 12.0 does not share react/jsx-runtime with plugins, so it is bundled instead of left external.
//   The bundled copy delegates to Grafana's React 18 through the external 'react' module.
// - The code copied from Grafana core uses the automatic JSX runtime (no `import React`).
const config = async (env: Env): Promise<Configuration> => {
  const baseConfig = await grafanaConfig(env);

  const externals = (baseConfig.externals as unknown[]).filter(
    (e) => e !== 'react/jsx-runtime' && e !== 'react/jsx-dev-runtime'
  );

  for (const rule of baseConfig.module?.rules ?? []) {
    const use = (rule as RuleSetRule).use as { loader?: string; options?: { jsc?: Record<string, unknown> } };
    if (use?.loader === 'swc-loader' && use.options?.jsc) {
      use.options.jsc.transform = { react: { runtime: 'automatic' } };
    }
  }

  return { ...baseConfig, externals: externals as Configuration['externals'] };
};

export default config;
