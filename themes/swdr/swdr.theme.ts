// The swdr theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in swdr.settings.json and the generated swdr.settings.ts;
// change them with `astryx experimental theme editor set swdr ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {swdrSettings} from './swdr.settings';

export const swdrTheme = defineTheme({
  extends: swdrSettings,
  name: 'swdr',
});
