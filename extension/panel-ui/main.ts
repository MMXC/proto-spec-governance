// Proto Spec 侧栏面板 — background → content → 页面；布局由 sidepanel/index.html 提供

// === Demo Spec 树 ===
const SPEC_TREE = [
  { id: 'p1', name: 'page-shell', layer: 'L2', type: 'P', children: [
    { id: 'c1', name: 'sidebar-nav', type: 'C', children: [
      { id: 'b1', name: 'menu-item', type: 'B' },
      { id: 's1', name: 'logo', type: 'S' },
    ]},
    { id: 'c2', name: 'main-content', type: 'C', children: [
      { id: 'b2', name: 'card-list', type: 'B' },
    ]},
  ]},
  { id: 'p2', name: 'page-login', layer: 'L2', type: 'P' },
];

const STORAGE_WORK_MODE = 'psWorkMode';

type WorkMode = 'governance' | 'browse' | 'debug';

// === State ===
let currentSpec: { id: string; name: string; layer: string; type: string } | null = null;
let logCount = 0;
let pageTheme: 'dark' | 'light' = 'dark';
let annotationsVisible = false;

/** 最近一次页面 proto:hub:ack（扩展三中心写入 ProtoSpecHub 的确认） */
let lastPageHubAck: unknown = null;

function applyWorkMode(mode: WorkMode): void {
  const shell = document.getElementById('proto-shell');
  if (shell) shell.dataset.workMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.proto-mode').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.mode === mode);
  });
  switch (mode) {
    case 'governance':
      break;
    case 'browse':
      break;
    case 'debug':
      break;
  }
}

async function persistWorkMode(mode: WorkMode): Promise<void> {
  await browser.storage.local.set({ [STORAGE_WORK_MODE]: mode });
}

async function loadWorkMode(): Promise<void> {
  const { [STORAGE_WORK_MODE]: stored } = await browser.storage.local.get(STORAGE_WORK_MODE);
  if (stored === 'governance' || stored === 'browse' || stored === 'debug') {
    applyWorkMode(stored);
  } else {
    applyWorkMode('governance');
  }
}

function setDockTab(tab: 'data' | 'status' | 'events'): void {
  document.querySelectorAll('.proto-dock-tab').forEach((el) => {
    const t = el as HTMLButtonElement;
    const id = t.dataset.dockTab;
    const active = id === tab;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.proto-dock-panel').forEach((el) => {
    const p = el as HTMLElement;
    p.classList.toggle('is-active', p.dataset.dockPanel === tab);
  });
}

function refreshDataPreview(): void {
  const pre = document.getElementById('data-preview');
  if (!pre) return;
  const bundle = {
    currentSpec: currentSpec
      ? { id: currentSpec.id, name: currentSpec.name, layer: currentSpec.layer, type: currentSpec.type }
      : null,
    lastPageHubAck,
  };
  pre.textContent = JSON.stringify(bundle, null, 2);
}

function appendAgentBubble(role: 'user' | 'agent', text: string): void {
  const thread = document.getElementById('agent-thread');
  if (!thread) return;
  const div = document.createElement('div');
  div.className = `proto-agent-bubble proto-agent-bubble--${role}`;
  div.textContent = text;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

// === Init ===
async function init() {
  await loadWorkMode();
  renderTree();
  bindEvents();
  refreshDataPreview();

  const thread = document.getElementById('agent-thread');
  if (thread && thread.childElementCount === 0) {
    appendAgentBubble(
      'agent',
      '侧栏底部「数据」可向页面 ProtoSpecHub 推送 proto:data:set / proto:state:patch / proto:event:emit；事件中心会收到页面回执 proto:hub:ack。'
    );
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'popup:receive') {
      const { type, data, tabId } = msg.payload as {
        type: string;
        data?: unknown;
        tabId?: number;
      };
      const logData =
        tabId != null && data != null && typeof data === 'object' && !Array.isArray(data)
          ? { tabId, ...(data as Record<string, unknown>) }
          : tabId != null
            ? { tabId, data }
            : data;
      addLog('page', type, logData);
      if (type === 'proto:hub:ack') {
        lastPageHubAck = data;
        refreshDataPreview();
      }
      if (type === 'runtime:ready') {
        setStatus('ok', 'Runtime 就绪');
        setStatusExtra(
          tabId != null ? `页面已上报 runtime:ready · tab ${tabId}` : '页面已上报 runtime:ready'
        );
      }
    }
  });

  const resp = await browser.runtime.sendMessage({ type: 'ext:getActiveTab' });
  if (resp?.tabId) {
    setStatus('ok', '已连接当前标签页');
    setStatusExtra(`tabId: ${resp.tabId}`);
  } else {
    setStatus('warn', '请打开目标页面');
    setStatusExtra('无活动 tabId，请聚焦含内容的标签页');
  }
}

// === Tree rendering ===
function renderTree() {
  const container = document.getElementById('tree-list');
  if (!container) return;
  container.innerHTML = '';

  for (const node of SPEC_TREE) {
    container.appendChild(renderNode(node, 0));
  }

  if (SPEC_TREE.length === 0) {
    container.innerHTML = '<div class="tree-empty">暂无 Spec，点击 + 新建</div>';
  }
}

function renderNode(node: any, depth: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-node' + (depth > 0 ? ' tree-node-pad' : '');
  if (currentSpec?.id === node.id) el.classList.add('active');

  const tagMap: Record<string, string> = { P: 'P', C: 'C', B: 'B', S: 'S' };
  const typeClass = tagMap[node.type] ?? 'P';
  el.innerHTML = `
    <span class="tag-${typeClass}">${node.type}</span>
    <span class="tree-node-name">${node.name}</span>
    ${node.layer ? `<span class="tree-node-layer">${node.layer}</span>` : ''}
  `;

  el.addEventListener('click', () => void selectSpec(node));

  if (node.children) {
    for (const child of node.children) {
      el.appendChild(renderNode(child, depth + 1));
    }
  }

  return el;
}

// === Spec selection ===
async function selectSpec(node: any) {
  currentSpec = node;
  const nameEl = document.getElementById('act-spec-name');
  if (nameEl) nameEl.textContent = node.name;
  renderTree();
  refreshDataPreview();

  const resp = await browser.runtime.sendMessage({
    type: 'ext:send',
    payload: {
      type: 'spec:select',
      data: {
        specName: node.name,
        layer: node.layer,
        selector: `[data-ps-spec="${node.name}"],.${node.name},#${node.name}`,
      },
    },
  });
  addLog('ext', 'spec:select', { specName: node.name, layer: node.layer });
  if (resp?.error) {
    setStatus('err', resp.error);
  }
}

// === Action handlers ===
async function sendAction(type: string, data: any) {
  const resp = await browser.runtime.sendMessage({
    type: 'ext:send',
    payload: { type, data },
  });
  addLog('ext', type, data);
  if (resp?.error) {
    setStatus('err', resp.error);
  } else if (type.startsWith('proto:')) {
    setStatus('ok', '已下发 ' + type);
  }
}

function sendAgentMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  appendAgentBubble('user', trimmed);
  addLog('ext', 'agent:prompt', { text: trimmed.slice(0, 200) });
  appendAgentBubble(
    'agent',
    '（占位）已记录。后续可在此对接 Cursor Agent / MCP 将指令转为对页面的 spec:select、spec:bind 等调用。'
  );
}

// === Event binding ===
function bindEvents() {
  document.getElementById('btn-highlight')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    sendAction('elem:highlight', {
      selector: `[data-ps-spec="${currentSpec.name}"]`,
      color: '#7170ff',
    });
  });

  document.getElementById('btn-annotate')?.addEventListener('click', () => {
    annotationsVisible = !annotationsVisible;
    void sendAction('annotation:show', { mode: annotationsVisible ? 'show' : 'hide' });
    document.getElementById('btn-annotate')?.classList.toggle('act-btn--active', annotationsVisible);
  });

  document.getElementById('btn-onboard')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    void sendAction('onboard:start', {
      specName: currentSpec.name,
      selector: `[data-ps-spec="${currentSpec.name}"]`,
      steps: ['hover 查看', '点击展开详情', '完成绑定'],
    });
  });

  document.getElementById('btn-bind')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    void sendAction('spec:bind', {
      specName: currentSpec.name,
      selector: `body`,
    });
    setStatus('ok', `已绑定: ${currentSpec.name}`);
  });

  document.getElementById('btn-theme')?.addEventListener('click', () => {
    pageTheme = pageTheme === 'dark' ? 'light' : 'dark';
    void sendAction('design:toggle', { theme: pageTheme });
    document.getElementById('btn-theme')?.classList.toggle('act-btn--active', pageTheme === 'light');
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    void browser.tabs.reload();
    setStatus('warn', '页面刷新中…');
  });

  document.getElementById('btn-add-spec')?.addEventListener('click', () => {
    const name = prompt('Spec 名称:');
    if (name) {
      SPEC_TREE.push({ id: 'new-' + Date.now(), name, layer: 'L3', type: 'C' });
      renderTree();
      setStatus('ok', `已添加: ${name}`);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.proto-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (m !== 'governance' && m !== 'browse' && m !== 'debug') return;
      applyWorkMode(m);
      void persistWorkMode(m);
      addLog('ext', 'ui:workMode', { mode: m });
    });
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    void browser.runtime.openOptionsPage().catch(() => {
      setStatus('warn', '无法打开设置页');
    });
  });

  const shell = document.getElementById('proto-shell');
  document.getElementById('btn-spec-drawer-toggle')?.addEventListener('click', () => {
    shell?.classList.toggle('spec-collapsed');
    const collapsed = shell?.classList.contains('spec-collapsed') ?? false;
    document.getElementById('btn-spec-drawer-toggle')?.setAttribute('aria-expanded', String(!collapsed));
  });

  document.querySelectorAll<HTMLButtonElement>('.proto-dock-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.dockTab;
      if (id === 'data' || id === 'status' || id === 'events') {
        setDockTab(id);
      }
    });
  });

  document.getElementById('btn-hub-data-push')?.addEventListener('click', () => {
    const keyEl = document.getElementById('hub-data-key') as HTMLInputElement | null;
    const valEl = document.getElementById('hub-data-value') as HTMLInputElement | null;
    const key = keyEl?.value.trim();
    if (!key) {
      setStatus('warn', '请填写数据 key');
      return;
    }
    const raw = valEl?.value ?? '';
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    void sendAction('proto:data:set', { key, value });
  });

  document.getElementById('btn-hub-state-light')?.addEventListener('click', () => {
    void sendAction('proto:state:patch', { theme: 'light' });
  });
  document.getElementById('btn-hub-state-dark')?.addEventListener('click', () => {
    void sendAction('proto:state:patch', { theme: 'dark' });
  });

  document.getElementById('btn-hub-state-json')?.addEventListener('click', () => {
    const ta = document.getElementById('hub-state-json') as HTMLTextAreaElement | null;
    if (!ta) return;
    let patch: Record<string, unknown>;
    try {
      patch = JSON.parse(ta.value) as Record<string, unknown>;
    } catch {
      setStatus('err', '状态 JSON 无法解析');
      return;
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      setStatus('err', '状态须为 JSON 对象');
      return;
    }
    void sendAction('proto:state:patch', patch);
  });

  document.getElementById('btn-hub-event-push')?.addEventListener('click', () => {
    const nameEl = document.getElementById('hub-event-name') as HTMLInputElement | null;
    const payEl = document.getElementById('hub-event-payload') as HTMLInputElement | null;
    const name = nameEl?.value.trim();
    if (!name) {
      setStatus('warn', '请填写事件 name');
      return;
    }
    const raw = payEl?.value ?? '{}';
    let inner: unknown = {};
    try {
      inner = JSON.parse(raw);
    } catch {
      inner = { raw };
    }
    void sendAction('proto:event:emit', { name, payload: inner });
  });

  const agentSend = () => {
    const input = document.getElementById('agent-input') as HTMLTextAreaElement | null;
    if (!input) return;
    sendAgentMessage(input.value);
    input.value = '';
  };
  document.getElementById('agent-send')?.addEventListener('click', agentSend);
  document.getElementById('agent-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      agentSend();
    }
  });
}

// === Status ===
function setStatus(state: 'ok' | 'err' | 'warn', text: string) {
  const dot = document.getElementById('status-dot');
  const textEl = document.getElementById('status-text');
  if (dot) dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'warn');
  if (textEl) textEl.textContent = text;
}

function setStatusExtra(text: string): void {
  const el = document.getElementById('status-extra');
  if (el) el.textContent = text;
}

// === Event log ===
function addLog(dir: 'ext' | 'page', type: string, data: any) {
  logCount++;
  const countEl = document.getElementById('log-count');
  if (countEl) countEl.textContent = String(logCount);

  const list = document.getElementById('log-list');
  if (!list) return;

  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <div>
      <span class="log-dir ${dir}">${dir === 'ext' ? '→' : '←'}</span>
      <span class="log-type">${type}</span>
    </div>
    ${data ? `<div class="log-data">${JSON.stringify(data).slice(0, 120)}</div>` : ''}
  `;

  list.insertBefore(item, list.firstChild);

  while (list.children.length > 80) {
    list.removeChild(list.lastChild!);
  }
}

void init();
