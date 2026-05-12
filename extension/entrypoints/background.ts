// background.ts — Proto Spec background service worker
// 作为侧边栏 / content script 的消息 relay 中心
import type { Browser } from 'wxt/browser';

type SidePanelApi = {
  setPanelBehavior: (opts: { openPanelOnActionClick: boolean }) => Promise<void>;
};

type BrowserWithSidePanel = typeof browser & { sidePanel?: SidePanelApi };

export default defineBackground(() => {
  let activeTabId: number | null = null;

  async function enableSidePanelOnToolbarClick() {
    const sidePanel = (browser as BrowserWithSidePanel).sidePanel;
    if (!sidePanel?.setPanelBehavior) return;
    try {
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {
      console.warn('[Proto Spec BG] sidePanel.setPanelBehavior failed', e);
    }
  }

  void enableSidePanelOnToolbarClick();

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Proto Spec BG] Extension installed');
    void enableSidePanelOnToolbarClick();
  });

  // 监听 tab 激活
  browser.tabs.onActivated.addListener(async (info) => {
    activeTabId = info.tabId;
  });

  // 监听来自侧边栏等 UI 的消息
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse);
    return true;
  });

  async function handleMessage(msg: any, sender: Browser.runtime.MessageSender) {
    const { type, payload } = msg;

    switch (type) {
      // 侧边栏 → Content: 转发 Extension → Page 指令
      case 'ext:send':
        return await sendToPage(payload);

      // 请求当前 tab ID
      case 'ext:getActiveTab':
        return { tabId: activeTabId };

      /**
       * Content（页面 postMessage 中继）或 overlay 内联逻辑 → 广播给侧栏等 extension pages。
       * 页面 runtime 用户事件：elem:click、runtime:ready 等，payload 形状为 { type, data }。
       */
      case 'popup:receive': {
        const forward = {
          ...(payload && typeof payload === 'object' ? payload : { payload }),
          tabId: sender.tab?.id,
        };
        try {
          await browser.runtime.sendMessage({
            type: 'popup:receive',
            payload: forward,
          });
        } catch {
          /* 侧栏未打开等场景下可无接收方 */
        }
        return { ok: true };
      }

      default:
        console.warn('[Proto Spec BG] Unknown message type:', type);
        return { error: 'unknown type' };
    }
  }

  async function sendToPage(payload: any): Promise<any> {
    // 获取当前 tab
    if (!activeTabId) {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        activeTabId = tabs[0].id;
      } else {
        return { error: 'no active tab' };
      }
    }

    try {
      // 向 content script 发送消息 → runtime 处理
      const response = await browser.tabs.sendMessage(activeTabId, {
        type: payload.type,
        payload: payload.data,
      });
      return response;
    } catch (err: any) {
      if (err.message?.includes('Receiving end does not exist')) {
        return { error: 'content not ready, please refresh the page' };
      }
      return { error: err.message };
    }
  }
});
