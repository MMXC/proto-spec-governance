import './style.css';

// Proto Spec Popup — 连接 background → content script 通信

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

// === State ===
let currentSpec: { id: string; name: string; layer: string; type: string } | null = null;
let logCount = 0;

// === Init ===
async function init() {
  renderTree();
  bindEvents();

  // 监听 background 转发的页面事件
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'popup:receive') {
      const { type, data } = msg.payload;
      addLog('page', type, data);
      // 更新状态栏
      if (type === 'runtime:ready') {
        setStatus('ok', 'Runtime 就绪');
      }
    }
  });

  // 检查当前 tab runtime 状态
  const resp = await browser.runtime.sendMessage({ type: 'ext:getActiveTab' });
  if (resp?.tabId) {
    setStatus('ok', '已连接');
  } else {
    setStatus('warn', '请打开目标页面');
  }
}

// === Tree rendering ===
function renderTree() {
  const container = document.getElementById('tree-list')!;
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

  const typeClass = { P: 'P', C: 'C', B: 'B', S: 'S' }[node.type] || 'P';
  el.innerHTML = `
    <span class="tag-${typeClass}">${node.type}</span>
    <span class="tree-node-name">${node.name}</span>
    ${node.layer ? `<span class="tree-node-layer">${node.layer}</span>` : ''}
  `;

  el.addEventListener('click', () => selectSpec(node));

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
  document.getElementById('act-spec-name')!.textContent = node.name;
  renderTree(); // Re-render to show active state

  // 发送 spec:select 指令给页面
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
  }
}

// === Event binding ===
function bindEvents() {
  document.getElementById('btn-highlight')!.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    sendAction('elem:highlight', {
      selector: `[data-ps-spec="${currentSpec.name}"]`,
      color: '#7170ff',
    });
  });

  document.getElementById('btn-annotate')!.addEventListener('click', () => {
    sendAction('annotation:show', { mode: 'show' });
  });

  document.getElementById('btn-onboard')!.addEventListener('click', () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    sendAction('onboard:start', {
      specName: currentSpec.name,
      selector: `[data-ps-spec="${currentSpec.name}"]`,
      steps: ['hover 查看', '点击展开详情', '完成绑定'],
    });
  });

  document.getElementById('btn-bind')!.addEventListener('click', async () => {
    if (!currentSpec) { setStatus('warn', '请先选择 Spec'); return; }
    // 绑定当前 spec 到选中元素（通过 querySelector）
    sendAction('spec:bind', {
      specName: currentSpec.name,
      selector: `body`, // 用户稍后可在页面上点击选择
    });
    setStatus('ok', `已绑定: ${currentSpec.name}`);
  });

  document.getElementById('btn-theme')!.addEventListener('click', () => {
    sendAction('design:toggle', { theme: 'light' });
  });

  document.getElementById('btn-refresh')!.addEventListener('click', () => {
    browser.tabs.reload();
    setStatus('warn', '页面刷新中…');
  });

  document.getElementById('log-toggle')!.addEventListener('click', () => {
    const list = document.getElementById('log-list')!;
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-add-spec')!.addEventListener('click', () => {
    const name = prompt('Spec 名称:');
    if (name) {
      SPEC_TREE.push({ id: 'new-' + Date.now(), name, layer: 'L3', type: 'C' });
      renderTree();
      setStatus('ok', `已添加: ${name}`);
    }
  });
}

// === Status ===
function setStatus(state: 'ok' | 'err' | 'warn', text: string) {
  const dot = document.getElementById('status-dot')!;
  const textEl = document.getElementById('status-text')!;
  dot.className = 'dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'warn');
  textEl.textContent = text;
}

// === Event log ===
function addLog(dir: 'ext' | 'page', type: string, data: any) {
  logCount++;
  document.getElementById('log-count')!.textContent = String(logCount);

  const list = document.getElementById('log-list')!;
  list.style.display = 'block';

  const item = document.createElement('div');
  item.className = 'log-item';
  item.innerHTML = `
    <div>
      <span class="log-dir ${dir}">${dir === 'ext' ? '→' : '←'}</span>
      <span class="log-type">${type}</span>
    </div>
    ${data ? `<div class="log-data">${JSON.stringify(data).slice(0, 80)}</div>` : ''}
  `;

  list.insertBefore(item, list.firstChild);

  // 限制最多 50 条
  while (list.children.length > 50) {
    list.removeChild(list.lastChild!);
  }
}

// Boot
init();
