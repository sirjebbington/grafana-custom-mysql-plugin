import { AppPlugin } from '@grafana/data';

import { App } from './components/App';
import { AppConfig } from './components/AppConfig';
import { AppJsonData } from './config/config';

export const plugin = new AppPlugin<AppJsonData>().setRootPage(App).addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
