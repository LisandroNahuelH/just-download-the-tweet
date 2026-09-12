import { defineManifest } from '@crxjs/vite-plugin';

const matches = ['https://x.com/*', 'https://twitter.com/*'];

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extensionName__',
  version: '0.1.8',
  description: '__MSG_extensionDescription__',
  default_locale: 'en',
  permissions: ['downloads', 'offscreen', 'storage'],
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    default_title: '__MSG_extensionName__',
  },
  host_permissions: [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://*.twimg.com/*',
    'https://video.twimg.com/*',
    'https://pbs.twimg.com/*',
    'https://www.premium11.com/*',
    'https://premium11.com/*',
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches,
      js: ['src/bridge/page.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches,
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
