import { defineConfig } from 'wxt';

// Proto Spec — Spec-first page prototyping extension
export default defineConfig({
  manifest: {
    permissions: ['activeTab', 'storage', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    /** 无 popup 时仍需 action，工具栏图标点击才会打开侧边栏（见 background sidePanel.setPanelBehavior） */
    action: {
      default_title: 'Proto Spec 治理',
    },
    web_accessible_resources: [
      {
        resources: ['/proto-spec-runtime.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
