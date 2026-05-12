// panel-ui/main.ts — Proto Spec 侧栏面板
// 入口选择 → Spec 树展示 → 双向绑定控制 → 事件日志

// === HTML 解析器 ===
import { parseAndDiff, parseHTMLSpecTree, type SpecNode, type ParsedSpec, type DiffResult } from './html-parser';

// === Demo Spec 树（fallback）===
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
type EntryMode = 'local' | 'prompt' | 'url';

// === State ===
let currentSpec: { id: string; name: string; layer: string; type: string; selector?: string } | null = null;
let parsedSpec: ParsedSpec | null = null;
let currentDiff: DiffResult | null = null;
let logCount = 0;
let pageTheme: 'dark' | 'light' = 'dark';
let annotationsVisible = false;
let entryMode: EntryMode = 'local';
let undoStack: string[] = [];
let redoStack: string[] = [];

// === Entry Selector ===
function renderEntrySelector() {
  const container = document.getElementById('entry-selector');
  if (!container) return;
  container.innerHTML = `
    <div class="entry-modes">
      <button class="entry-btn ${entryMode === 'local' ? 'active' : ''}" data-entry="local">
        <span class="entry-icon">📁</span>
        <span class="entry-label">本地 HTML</span>
      </button>
      <button class="entry-btn ${entryMode === 'prompt' ? 'active' : ''}" data-entry="prompt">
        <span class="entry-icon">✏️</span>
        <span class="entry-label">需求描述</span>
      </button>
      <button class="entry-btn ${entryMode === 'url' ? 'active' : ''}" data-entry="url">
        <span class="entry-icon">🔗</span>
        <span class="entry-label">竞品参考</span>
      </button>
    </div>
    <div class="entry-input-area" id="entry-input-area">
      ${entryMode === 'local' ? '<div class="entry-hint">已在解析当前页面…</div>' : ''}
      ${entryMode === 'prompt' ? `
        <textarea id="prompt-input" class="prompt-input" placeholder="描述你想做的页面，比如：一个登录页面，包含用户名、密码输入框和登录按钮"></textarea>
        <button id="prompt-submit" class="action-btn primary">生成原型</button>
      ` : ''}
      ${entryMode === 'url' ? `
        <input id="url-input" class="url-input" type="url" placeholder="输入竞品页面 URL">
        <button id="url-submit" class="action-btn primary">分析并生成</button>
      ` : ''}
    </div>
  `;

  // Bind entry mode buttons
  container.querySelectorAll<HTMLButtonElement>('.entry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.entry as EntryMode;
      if (mode) {
        entryMode = mode;
        renderEntrySelector();
        if (mode === 'local') {
          void triggerLocalParse();
        }
      }
    });
  });

  // Bind submit buttons
  document.getElementById('prompt-submit')?.addEventListener('click', () => void submitPrompt());
  document.getElementById('url-submit')?.addEventListener('click', () => void submitUrl());
}

async function triggerLocalParse() {
  try {
    // 向 content script 请求当前页面的 Spec 树
    const resp = await browser.runtime.sendMessage({ type: 'panel:parsePage' });
    if (resp?.spec) {
      parsedSpec = resp.spec as ParsedSpec;
      renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
      setStatus('ok', `解析完成：${countNodes(parsedSpec.layers.pages)} 个节点`);
    } else {
      // Fallback：自己解析（需要 DOM 访问）
      parsedSpec = parseHTMLSpecTree(document);
      renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
      setStatus('ok', `解析完成：${countNodes(parsedSpec.layers.pages)} 个节点`);
    }
  } catch (e) {
    parsedSpec = parseHTMLSpecTree(document);
    renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
    setStatus('warn', '使用本地解析');
  }
}

async function submitPrompt() {
  const input = document.getElementById('prompt-input') as HTMLTextAreaElement;
  const text = input?.value.trim();
  if (!text) { setStatus('warn', '请输入需求描述'); return; }
  setStatus('warn', '正在生成原型…');
  // TODO: Agent 服务端调用
  setStatus('ok', '（占位）Agent 尚未接入');
  addLog('ext', 'agent:generate', { prompt: text.slice(0, 100) });
}

async function submitUrl() {
  const input = document.getElementById('url-input') as HTMLInputElement;
  const url = input?.value.trim();
  if (!url) { setStatus('warn', '请输入 URL'); return; }
  setStatus('warn', '正在分析竞品…');
  // TODO: Agent 服务端调用
  setStatus('ok', '（占位）Agent 尚未接入');
  addLog('ext', 'agent:crawl', { url });
}

function countNodes(nodes: SpecNode[]): number {
  let count = nodes.length;
  for (const n of nodes) {
    count += countNodes(n.children);
  }
  return count;
}

// === Spec Tree Rendering ===
function renderSpecTree(pages: SpecNode[], overlays: SpecNode[]) {
  const container = document.getElementById('tree-list');
  if (!container) return;
  container.innerHTML = '';

  for (const node of pages) {
    container.appendChild(renderNode(node, 0));
  }

  // Overlays section
  if (overlays.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'tree-divider';
    divider.textContent = '── Overlays ──';
    container.appendChild(divider);
    for (const node of overlays) {
      container.appendChild(renderNode(node, 0, true));
    }
  }

  if (pages.length === 0) {
    container.innerHTML = '<div class="tree-empty">暂无 Spec，使用入口选择开始</div>';
  }
}

function renderNode(node: SpecNode, depth: number, isOverlay = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-node' + (depth > 0 ? ' tree-node-pad' : '');
  if (currentSpec?.id === node.id || currentSpec?.name === node.name) {
    el.classList.add('active');
  }

  const tagMap: Record<string, string> = { P: 'P', C: 'C', B: 'B', S: 'S' };
  const typeClass = tagMap[node.type] ?? 'P';

  const overlayHint = node.overlay ? ` → ${node.overlay}` : '';
  const overlayTag = isOverlay ? '<span class="tag-P">P-overlay</span>' : `<span class="tag-${typeClass}">${node.type}</span>`;

  el.innerHTML = `
    ${overlayTag}
    <span class="tree-node-name">${node.name}${overlayHint}</span>
    <span class="tree-node-layer">${node.layer}</span>
  `;

  el.addEventListener('click', () => void selectSpec(node));

  // Render children
  const childContainer = document.createElement('div');
  childContainer.className = 'tree-children';
  for (const child of node.children) {
    childContainer.appendChild(renderNode(child, depth + 1, isOverlay));
  }
  el.appendChild(childContainer);

  return el;
}

async function selectSpec(node: SpecNode) {
  currentSpec = { id: node.id, name: node.name, layer: node.layer, type: node.type, selector: node.selector };
  const nameEl = document.getElementById('act-spec-name');
  if (nameEl) nameEl.textContent = node.name;
  renderSpecTree(parsedSpec?.layers.pages ?? [], parsedSpec?.layers.overlays ?? []);
  refreshDataPreview();

  const resp = await browser.runtime.sendMessage({
    type: 'ext:send',
    payload: {
      type: 'spec:select',
      data: {
        specName: node.name,
        layer: node.layer,
        selector: node.selector ?? `[data-ps-spec="${node.name}"],.${node.name},#${node.name}`,
      },
    },
  });
  addLog('ext', 'spec:select', { specName: node.name, layer: node.layer });
  if (resp?.error) setStatus('err', resp.error);
}

// === Diff UI ===
function renderDiff(diff: DiffResult) {
  const container = document.getElementById('diff-list');
  if (!container) return;
  container.innerHTML = '';

  if (diff.added.length === 0 && diff.removed.length === 0) {
    container.innerHTML = '<div class="diff-empty">无变更</div>';
    return;
  }

  for (const node of diff.added) {
    const item = document.createElement('div');
    item.className = 'diff-item diff-added';
    item.innerHTML = `<span class="diff-op">+</span><span class="diff-name">${node.name}</span><span class="diff-type">${node.type}</span>`;
    item.addEventListener('click', () => {
      void browser.runtime.sendMessage({
        type: 'ext:send',
        payload: { type: 'elem:highlight', data: { selector: node.selector ?? node.name, color: '#10b981' } },
      });
    });
    container.appendChild(item);
  }

  for (const rem of diff.removed) {
    const item = document.createElement('div');
    item.className = 'diff-item diff-removed';
    item.innerHTML = `<span class="diff-op">-</span><span class="diff-name">${rem.name}</span>`;
    container.appendChild(item);
  }
}

// === Undo/Redo ===
function pushUndo(specJson: string) {
  undoStack.push(specJson);
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoRedoUI();
}

function undo() {
  if (undoStack.length === 0) return;
  if (parsedSpec) {
    redoStack.push(JSON.stringify(parsedSpec));
  }
  const prev = undoStack.pop()!;
  parsedSpec = JSON.parse(prev) as ParsedSpec;
  renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
  updateUndoRedoUI();
  addLog('ext', 'undo', {});
}

function redo() {
  if (redoStack.length === 0) return;
  if (parsedSpec) {
    undoStack.push(JSON.stringify(parsedSpec));
  }
  const next = redoStack.pop()!;
  parsedSpec = JSON.parse(next) as ParsedSpec;
  renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
  updateUndoRedoUI();
  addLog('ext', 'redo', {});
}

function updateUndoRedoUI() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) (undoBtn as HTMLButtonElement).disabled = undoStack.length === 0;
  if (redoBtn) (redoBtn as HTMLButtonElement).disabled = redoStack.length === 0;
}

// === Init ===
async function init() {
  renderEntrySelector();
  await loadWorkMode();
  bindEvents();
  refreshDataPreview();
  updateUndoRedoUI();

  // 监听来自 content script 的消息
  browser.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'popup:receive') {
      const { type, data } = msg.payload as { type: string; data?: unknown };
      addLog('page', type, data);
      if (type === 'proto:hub:ack') refreshDataPreview();
      if (type === 'runtime:ready') setStatus('ok', 'Runtime 就绪');
    }
    if (msg.type === 'panel:parseResult') {
      parsedSpec = msg.spec as ParsedSpec;
      renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
      setStatus('ok', `解析完成：${countNodes(parsedSpec.layers.pages)} 个节点`);
    }
    if (msg.type === 'panel:diffResult') {
      currentDiff = msg.diff as DiffResult;
      renderDiff(currentDiff);
      setStatus('ok', `变更：+${currentDiff.added.length} -${currentDiff.removed.length}`);
    }
  });

  // 获取当前 tab
  const resp = await browser.runtime.sendMessage({ type: 'ext:getActiveTab' });
  if (resp?.tabId) {
    setStatus('ok', '已连接当前标签页');
  } else {
    setStatus('warn', '请打开目标页面');
  }
}

// === Event Binding ===
function bindEvents() {
  document.getElementById('btn-highlight')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    void browser.runtime.sendMessage({
      type: 'ext:send',
      payload: { type: 'elem:highlight', data: { selector: currentSpec.selector ?? currentSpec.name, color: '#7170ff' } },
    });
    addLog('ext', 'elem:highlight', { spec: currentSpec.name });
  });

  document.getElementById('btn-annotate')?.addEventListener('click', () => {
    annotationsVisible = !annotationsVisible;
    void browser.runtime.sendMessage({
      type: 'ext:send',
      payload: { type: 'annotation:show', data: { mode: annotationsVisible ? 'show' : 'hide' } },
    });
    document.getElementById('btn-annotate')?.classList.toggle('act-btn--active', annotationsVisible);
  });

  document.getElementById('btn-onboard')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    void browser.runtime.sendMessage({
      type: 'ext:send',
      payload: { type: 'onboard:start', data: { specName: currentSpec.name, selector: currentSpec.selector ?? currentSpec.name } },
    });
  });

  document.getElementById('btn-bind')?.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    pushUndo(JSON.stringify(parsedSpec));
    void browser.runtime.sendMessage({
      type: 'ext:send',
      payload: { type: 'spec:bind', data: { specName: currentSpec.name, selector: currentSpec.selector ?? currentSpec.name } },
    });
    setStatus('ok', `已绑定: ${currentSpec.name}`);
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    void triggerLocalParse();
  });

  document.getElementById('btn-diff')?.addEventListener('click', () => {
    if (!parsedSpec) { setStatus('warn', '请先解析页面'); return; }
    const { spec, diff } = parseAndDiff(document);
    parsedSpec = spec;
    currentDiff = diff;
    renderDiff(diff);
    if (diff.added.length > 0 || diff.removed.length > 0) {
      setStatus('ok', `变更：+${diff.added.length} -${diff.removed.length}`);
    } else {
      setStatus('ok', '无变更');
    }
  });

  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);

  document.getElementById('btn-add-spec')?.addEventListener('click', () => {
    const name = prompt('Spec 名称:');
    if (name && parsedSpec) {
      pushUndo(JSON.stringify(parsedSpec));
      // 添加到 pages[0] 下
      const newNode: SpecNode = { id: 'new-' + Date.now(), name, type: 'C', layer: 'L3', children: [] };
      parsedSpec.layers.pages[0].children.push(newNode);
      renderSpecTree(parsedSpec.layers.pages, parsedSpec.layers.overlays);
      setStatus('ok', `已添加: ${name}`);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.proto-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (m !== 'governance' && m !== 'browse' && m !== 'debug') return;
      applyWorkMode(m as WorkMode);
      void persistWorkMode(m as WorkMode);
      addLog('ext', 'ui:workMode', { mode: m });
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.proto-dock-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.dockTab;
      if (id === 'data' || id === 'status' || id === 'events') setDockTab(id as 'data' | 'status' | 'events');
      if (id === 'diff') {
        setDockTab('diff' as any);
        if (parsedSpec) renderDiff(currentDiff ?? { added: [], removed: [], modified: [] });
      }
    });
  });

  // Agent prompt
  const agentSend = () => {
    const input = document.getElementById('agent-input') as HTMLTextAreaElement | null;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    appendAgentBubble('user', text);
    addLog('ext', 'agent:prompt', { text: text.slice(0, 200) });
    // TODO: Agent 多版本 diff 调用
    appendAgentBubble('agent', '（占位）Agent 多版本 diff 尚未接入。选中 Spec 后可尝试描述改动。');
    input.value = '';
  };
  document.getElementById('agent-send')?.addEventListener('click', agentSend);
  document.getElementById('agent-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); }
  });
}

// === Work Mode ===
function applyWorkMode(mode: WorkMode): void {
  const shell = document.getElementById('proto-shell');
  if (shell) shell.dataset.workMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.proto-mode').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.mode === mode);
  });
}

async function loadWorkMode(): Promise<void> {
  const { [STORAGE_WORK_MODE]: stored } = await browser.storage.local.get(STORAGE_WORK_MODE);
  if (stored === 'governance' || stored === 'browse' || stored === 'debug') applyWorkMode(stored);
  else applyWorkMode('governance');
}

async function persistWorkMode(mode: WorkMode): Promise<void> {
  await browser.storage.local.set({ [STORAGE_WORK_MODE]: mode });
}

// === Dock Tab ===
function setDockTab(tab: 'data' | 'status' | 'events' | 'diff'): void {
  document.querySelectorAll('.proto-dock-tab').forEach(el => {
    const t = el as HTMLButtonElement;
    const id = t.dataset.dockTab;
    const active = id === tab;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.proto-dock-panel').forEach(el => {
    const p = el as HTMLElement;
    p.classList.toggle('is-active', p.dataset.dockPanel === tab);
  });
}

// === Status ===
function setStatus(state: 'ok' | 'err' | 'warn', text: string) {
  const dot = document.getElementById('status-dot');
  const textEl = document.getElementById('status-text');
  if (dot) dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'warn');
  if (textEl) textEl.textContent = text;
}

// === Agent Bubble ===
function appendAgentBubble(role: 'user' | 'agent', text: string): void {
  const thread = document.getElementById('agent-thread');
  if (!thread) return;
  const div = document.createElement('div');
  div.className = `proto-agent-bubble proto-agent-bubble--${role}`;
  div.textContent = text;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

// === Data Preview ===
function refreshDataPreview(): void {
  const pre = document.getElementById('data-preview');
  if (!pre) return;
  pre.textContent = JSON.stringify({
    currentSpec: currentSpec,
    specNodeCount: parsedSpec ? countNodes(parsedSpec.layers.pages) : 0,
    overlayCount: parsedSpec?.layers.overlays.length ?? 0,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
  }, null, 2);
}

// === Event Log ===
function addLog(dir: 'ext' | 'page', type: string, data?: unknown) {
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
  while (list.children.length > 80) list.removeChild(list.lastChild!);
}

void init();
