import { defineConfig } from 'wxt';

// Proto Spec — Spec-first page prototyping extension
export default defineConfig({
  manifest: {
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.sw.js'],
        run_at: 'document_idle',
      },
    ],
  },
});
