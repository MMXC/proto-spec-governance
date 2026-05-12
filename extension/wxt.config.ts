import { defineConfig } from 'wxt';

// Proto Spec — Spec-first page prototyping extension
export default defineConfig({
  manifest: {
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
