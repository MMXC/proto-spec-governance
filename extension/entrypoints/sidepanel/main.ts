import './style.css';

// sidepanel/main.ts — Proto Spec Side Panel Controller

type Panel = 'top' | 'left' | 'bottom' | 'right';

const PANELS: Panel[] = ['top', 'left', 'bottom', 'right'];

let isOverlayActive = false;
let collapsedPanels = new Set<Panel>();

async function init() {
  renderStatus();
  bindToggleAll();
  bindPanelToggles();
  bindModeButtons();
  bindQuickActions();
  bindReset();

  // 监听 overlay 发来的事件
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'overlay:ready') {
      updateStatus('ok', '已连接');
    }
  });

  // 检查 content script 是否已就绪
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      await browser.tabs.sendMessage(tabs[0].id, { type: 'panel:ping' });
      updateStatus('ok', '已连接');
    } catch {
      updateStatus('warn', '刷新目标页面');
    }
  }
}

function renderStatus() {
  document.getElementById('status-text')!.textContent =
    isOverlayActive ? '治理模式运行中' : '等待启动';
  document.getElementById('status-dot')!.className =
    'dot ' + (isOverlayActive ? 'ok' : 'warn');
}

function bindToggleAll() {
  document.getElementById('btn-toggle')!.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;

    isOverlayActive = !isOverlayActive;
    await browser.tabs.sendMessage(tabs[0].id, {
      type: 'panel:toggle',
      payload: {
        active: isOverlayActive,
        collapsed: Array.from(collapsedPanels),
      },
    });

    renderStatus();
    updateToggleBtn();
  });
}

function updateToggleBtn() {
  const btn = document.getElementById('btn-toggle')!;
  btn.textContent = isOverlayActive ? '退出治理' : '进入治理';
  btn.className = 'ctrl-btn ' + (isOverlayActive ? 'active' : '');
}

function bindPanelToggles() {
  for (const panel of PANELS) {
    const btn = document.getElementById(`btn-${panel}`)!;
    btn.addEventListener('click', async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id || !isOverlayActive) return;

      if (collapsedPanels.has(panel)) {
        collapsedPanels.delete(panel);
      } else {
        collapsedPanels.add(panel);
      }

      btn.className = 'panel-btn ' + (collapsedPanels.has(panel) ? 'collapsed' : '');
      await browser.tabs.sendMessage(tabs[0].id, {
        type: 'panel:setCollapsed',
        payload: { panel, collapsed: collapsedPanels.has(panel) },
      });
    });
  }
}

function bindModeButtons() {
  const localBtn = document.getElementById('btn-local')!;
  const remoteBtn = document.getElementById('btn-remote')!;

  async function setMode(mode: 'local' | 'remote') {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;

    localBtn.className = 'mode-btn ' + (mode === 'local' ? 'active' : '');
    remoteBtn.className = 'mode-btn ' + (mode === 'remote' ? 'active' : '');

    await browser.tabs.sendMessage(tabs[0].id, {
      type: 'panel:setMode',
      payload: { mode },
    });
  }

  localBtn.addEventListener('click', () => setMode('local'));
  remoteBtn.addEventListener('click', () => setMode('remote'));
}

function bindQuickActions() {
  document.getElementById('btn-highlight')!.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;
    await browser.tabs.sendMessage(tabs[0].id, { type: 'action:highlight', payload: {} });
  });

  document.getElementById('btn-annotate')!.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;
    await browser.tabs.sendMessage(tabs[0].id, { type: 'action:annotate', payload: {} });
  });

  document.getElementById('btn-extract')!.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;
    await browser.tabs.sendMessage(tabs[0].id, { type: 'action:extract', payload: {} });
    updateStatus('ok', '提取完成，请查看右侧 Spec 面板');
  });
}

function bindReset() {
  document.getElementById('btn-reset')!.addEventListener('click', async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return;
    await browser.tabs.sendMessage(tabs[0].id, { type: 'panel:reset', payload: {} });
    collapsedPanels.clear();
    isOverlayActive = false;
    for (const p of PANELS) {
      document.getElementById(`btn-${p}`)!.className = 'panel-btn';
    }
    renderStatus();
    updateToggleBtn();
    updateStatus('ok', '已重置');
  });
}

function updateStatus(state: 'ok' | 'warn' | 'err', text: string) {
  document.getElementById('status-dot')!.className = 'dot ' + state;
  document.getElementById('status-text')!.textContent = text;
}

init();
