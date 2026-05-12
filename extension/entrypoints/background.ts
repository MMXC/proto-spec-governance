// background.ts — Proto Spec background service worker
// 作为 popup ↔ content script 的消息 relay 中心
export default defineBackground(() => {
  let activeTabId: number | null = null;

  // 安装时初始化
  browser.runtime.onInstalled.addListener(() => {
    console.log('[Proto Spec BG] Extension installed');
  });

  // 监听 tab 激活
  browser.tabs.onActivated.addListener(async (info) => {
    activeTabId = info.tabId;
  });

  // 监听来自 popup 的消息
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg, sender).then(sendResponse);
    return true;
  });

  async function handleMessage(msg: any, sender: browser.runtime.MessageSender) {
    const { type, payload } = msg;

    switch (type) {
      // Popup → Content: 转发 Extension → Page 指令
      case 'ext:send':
        return await sendToPage(payload);

      // 请求当前 tab ID
      case 'ext:getActiveTab':
        return { tabId: activeTabId };

      // Runtime 就绪通知
      case 'runtime:ready':
        console.log('[Proto Spec BG] Runtime ready on tab', sender.tab?.id, payload);
        return { ok: true };

      // Spec 绑定完成
      case 'spec:bound':
        console.log('[Proto Spec BG] Spec bound:', payload);
        return { ok: true };

      // 元素点击上报
      case 'elem:click':
        console.log('[Proto Spec BG] elem:click:', payload);
        return { ok: true };

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
