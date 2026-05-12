// content.ts — Proto Spec content script
// 四侧栏 overlay + side panel；页面 runtime 通过 injectScript 注入（兼容 CSP），并转发 background → 页面的 runtime 指令

import { injectScript } from 'wxt/utils/inject-script';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main(_ctx) {
    const PAGE_MSG_PREFIX = 'PS_EXT_MSG_';

    /**
     * 页面主世界 runtime 通过 postMessage 上报（_from: page）→ 经 background 广播给侧栏「事件中心」。
     * 与 assets/postMessage.js 中 reply 信封一致。
     */
    function installPageOutboundRelay() {
      window.addEventListener('message', (ev: MessageEvent) => {
        const d = ev.data;
        if (!d || typeof d.type !== 'string') return;
        if (!d.type.startsWith(PAGE_MSG_PREFIX)) return;
        if (d._from !== 'page') return;

        const logicalType = d.type.slice(PAGE_MSG_PREFIX.length);
        const payload = d.payload;

        void browser.runtime
          .sendMessage({
            type: 'popup:receive',
            payload: { type: logicalType, data: payload },
          })
          .catch(() => {});

        const list = document.getElementById('ps-event-list');
        if (list) {
          const line = document.createElement('div');
          line.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%';
          line.textContent = '[page] ' + logicalType;
          list.insertBefore(line, list.firstChild);
          while (list.children.length > 40) {
            list.removeChild(list.lastChild!);
          }
        }
      });
    }

    installPageOutboundRelay();

    // ── 注入完整页面 runtime（与 assets/runtime.js 一致）────
    async function injectRuntime() {
      if (document.getElementById('ps-runtime')) return;
      if (document.documentElement.getAttribute('data-ps-proto-runtime') === 'embedded') {
        console.log('[Proto Spec] Page embeds runtime, skip inject');
        return;
      }
      try {
        await injectScript('/proto-spec-runtime.js', {
          keepInDom: true,
          modifyScript: (el) => {
            el.id = 'ps-runtime';
          },
        });
      } catch (e) {
        console.error('[Proto Spec] Runtime injectScript failed:', e);
      }
    }

    // ── 4 侧栏 Overlay 管理器 ──────────────────────────────
    const overlayId = 'ps-overlay-root';

    browser.runtime.onMessage.addListener((msg) => {
      if (!msg) return Promise.resolve({ ok: true });
      switch (msg.type) {
        case 'panel:ping': return Promise.resolve({ ok: true });
        case 'panel:toggle': return Promise.resolve(toggleOverlay(msg.payload?.active, msg.payload?.collapsed));
        case 'panel:setCollapsed': return Promise.resolve(setPanelCollapsed(msg.payload?.panel, msg.payload?.collapsed));
        case 'panel:setMode': return Promise.resolve(setMode(msg.payload?.mode));
        case 'panel:reset': return Promise.resolve(resetOverlay());
        case 'panel:parsePage': {
          const spec = contentParseSpecTree();
          return Promise.resolve({ ok: true, spec });
        }
        case 'panel:diffPage': {
          const { spec, diff } = contentParseAndDiff();
          return Promise.resolve({ ok: true, spec, diff });
        }
        case 'action:highlight':
          window.postMessage({ type: 'PS_EXT_MSG_elem:highlight', payload: { selector: 'body', color: '#7170ff' }, _from: 'extension' }, '*');
          return Promise.resolve({ ok: true });
        case 'action:annotate':
          window.postMessage({ type: 'PS_EXT_MSG_annotation:show', payload: { mode: 'show' }, _from: 'extension' }, '*');
          return Promise.resolve({ ok: true });
        case 'action:extract': return Promise.resolve(extractSpec());
        default:
          if (
            msg &&
            typeof msg.type === 'string' &&
            !msg.type.startsWith('panel:') &&
            !msg.type.startsWith('action:') &&
            Object.prototype.hasOwnProperty.call(msg, 'payload')
          ) {
            window.postMessage(
              {
                type: 'PS_EXT_MSG_' + msg.type,
                payload: msg.payload,
                _from: 'extension',
              },
              '*'
            );
            return Promise.resolve({ ok: true });
          }
          return Promise.resolve({ ok: true });
      }
    });

    // ── Overlay DOM ──────────────────────────────
    function buildOverlayDOM() {
      const root = document.createElement('div');
      root.id = overlayId;
      root.innerHTML =
        '<div class="ps-ov-top" id="ps-ov-top"><div class="ps-ov-inner" id="ps-ov-top-inner"><div class="ps-ov-drag" data-panel="top"></div><div class="ps-ov-content ps-panel-top"></div><div class="ps-ov-collapse-btn" data-panel="top" title="折叠">▬</div></div></div>' +
        '<div class="ps-ov-left" id="ps-ov-left"><div class="ps-ov-inner" id="ps-ov-left-inner"><div class="ps-ov-collapse-btn" data-panel="left" title="折叠">◀</div><div class="ps-ov-content ps-panel-left"></div><div class="ps-ov-drag" data-panel="left"></div></div></div>' +
        '<div class="ps-ov-right" id="ps-ov-right"><div class="ps-ov-inner" id="ps-ov-right-inner"><div class="ps-ov-drag" data-panel="right"></div><div class="ps-ov-content ps-panel-right"></div><div class="ps-ov-collapse-btn" data-panel="right" title="折叠">▶</div></div></div>' +
        '<div class="ps-ov-bottom" id="ps-ov-bottom"><div class="ps-ov-inner" id="ps-ov-bottom-inner"><div class="ps-ov-collapse-btn" data-panel="bottom" title="折叠">▬</div><div class="ps-ov-content ps-panel-bottom"></div><div class="ps-ov-drag" data-panel="bottom"></div></div></div>' +
        '<style>' +
        '#ps-overlay-root{position:fixed;inset:0;z-index:2147483640;pointer-events:none;font-family:system-ui,sans-serif!important}' +
        '#ps-overlay-root.active{pointer-events:all}' +
        '.ps-ov-top,.ps-ov-bottom{position:absolute;left:0;right:0;background:#0d0e11;display:flex;flex-direction:column;transition:height .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}' +
        '.ps-ov-top{top:0;border-bottom:1px solid rgba(255,255,255,.06)}' +
        '.ps-ov-bottom{bottom:0;border-top:1px solid rgba(255,255,255,.06)}' +
        '.ps-ov-top.collapsed,.ps-ov-bottom.collapsed{height:28px!important}' +
        '.ps-ov-top.expanded{height:var(--ps-top-h,160px)}' +
        '.ps-ov-bottom.expanded{height:var(--ps-bottom-h,140px)}' +
        '.ps-ov-left,.ps-ov-right{position:absolute;top:0;bottom:0;background:#0d0e11;display:flex;flex-direction:row;transition:width .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}' +
        '.ps-ov-left{left:0;border-right:1px solid rgba(255,255,255,.06)}' +
        '.ps-ov-right{right:0;border-left:1px solid rgba(255,255,255,.06)}' +
        '.ps-ov-left.collapsed,.ps-ov-right.collapsed{width:28px!important}' +
        '.ps-ov-left.expanded{width:var(--ps-left-w,260px)}' +
        '.ps-ov-right.expanded{width:var(--ps-right-w,280px)}' +
        '.ps-ov-inner{flex:1;display:flex;overflow:hidden}' +
        '.ps-ov-left-inner,.ps-ov-right-inner{flex-direction:column}' +
        '.ps-ov-top-inner,.ps-ov-bottom-inner{flex-direction:row}' +
        '.ps-ov-collapse-btn{width:28px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:none;color:#6b7280;font-size:10px;cursor:pointer;transition:all .15s;flex-shrink:0;z-index:2}' +
        '.ps-ov-collapse-btn:hover{background:rgba(255,255,255,.08);color:#f7f8f8}' +
        '.ps-ov-content{flex:1;overflow:auto;padding:8px 0;min-width:0;min-height:0;display:flex;flex-direction:column;gap:1px}' +
        '.ps-ov-drag{background:transparent;flex-shrink:0;transition:background .15s}' +
        '.ps-ov-drag[data-panel="top"],.ps-ov-drag[data-panel="bottom"]{height:4px;cursor:ns-resize}' +
        '.ps-ov-drag[data-panel="left"],.ps-ov-drag[data-panel="right"]{width:4px;cursor:ew-resize}' +
        '.ps-ov-drag:hover{background:rgba(113,112,255,.3)!important}' +
        '.ps-ov-top.collapsed .ps-ov-drag[data-panel="top"],.ps-ov-bottom.collapsed .ps-ov-drag[data-panel="bottom"],' +
        '.ps-ov-top.collapsed .ps-panel-top,.ps-ov-bottom.collapsed .ps-panel-bottom,' +
        '.ps-ov-left.collapsed .ps-panel-left,.ps-ov-right.collapsed .ps-panel-right,' +
        '.ps-ov-top.collapsed .ps-ov-content,.ps-ov-bottom.collapsed .ps-ov-content,' +
        '.ps-ov-left.collapsed .ps-ov-content,.ps-ov-right.collapsed .ps-ov-content{display:none!important}' +
        '.ps-panel-title{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;padding:6px 12px 3px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}' +
        '.ps-spec-item{display:flex;align-items:center;gap:6px;padding:5px 12px;cursor:pointer;font-size:12px;color:#c8cdd6;transition:all .12s;border-radius:4px;margin:1px 4px}' +
        '.ps-spec-item:hover{background:rgba(255,255,255,.05);color:#fff}' +
        '.ps-spec-item.active{background:rgba(113,112,255,.12);color:#818cff}' +
        '.ps-spec-tag{font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:rgba(113,112,255,.15);color:#818cff;flex-shrink:0}' +
        '.ps-action-item{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;font-size:12px;color:#c8cdd6;transition:all .12s;border-radius:4px;margin:1px 4px}' +
        '.ps-action-item:hover{background:rgba(255,255,255,.05);color:#fff}' +
        '.ps-action-icon{width:16px;text-align:center;flex-shrink:0}' +
        '.ps-status{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#10b981;font-size:10px;padding:3px 10px;border-radius:10px;pointer-events:none;white-space:nowrap;z-index:10;transition:opacity .3s;opacity:0}' +
        '.ps-status.visible{opacity:1}' +
        '.ps-divider{height:1px;background:rgba(255,255,255,.05);margin:4px 12px}' +
        '</style>' +
        '<div class="ps-status" id="ps-status"></div>';
      return root;
    }

    // ── Overlay 状态 ──────────────────────────────
    let active = false;
    let mode: 'local' | 'remote' = 'local';
    const collapsed: Record<string, boolean> = {};
    const sizes: Record<string, number> = { top: 160, bottom: 140, left: 260, right: 280 };

    async function toggleOverlay(show: boolean, initCollapsed?: string[]) {
      let root = document.getElementById(overlayId);
      if (show) {
        if (!root) {
          await injectRuntime();
          document.body.appendChild(buildOverlayDOM());
          root = document.getElementById(overlayId)!;
          initDragResize();
          initCollapseButtons();
          initSpecClicks();
          initActionClicks();
        }
        root.classList.add('active');
        (initCollapsed || []).forEach((p: string) => { (collapsed as any)[p] = true; });
        applyState();
        fillPanels();
      } else {
        root?.classList.remove('active');
      }
      active = show;
    }

    function setPanelCollapsed(panel: string, val: boolean) {
      (collapsed as any)[panel] = val;
      applyState();
    }

    function setMode(m: 'local' | 'remote') {
      mode = m;
      fillPanels();
    }

    function resetOverlay() {
      for (const k of Object.keys(collapsed)) delete (collapsed as any)[k];
      applyState();
    }

    function applyState() {
      for (const panel of ['top', 'bottom', 'left', 'right']) {
        const el = document.getElementById('ps-ov-' + panel);
        if (!el) continue;
        const dim = panel === 'top' || panel === 'bottom' ? 'h' : 'w';
        if ((collapsed as any)[panel]) {
          el.classList.remove('expanded');
          el.classList.add('collapsed');
        } else {
          el.classList.remove('collapsed');
          el.classList.add('expanded');
          el.style.setProperty('--ps-' + panel + '-' + dim, sizes[panel] + 'px');
        }
      }
    }

    // ── 拖拽调整大小 ──────────────────────────────
    function initDragResize() {
      for (const panel of ['top', 'bottom', 'left', 'right']) {
        const el = document.getElementById('ps-ov-' + panel);
        if (!el) continue;
        const drag = el.querySelector('.ps-ov-drag') as HTMLElement;
        if (!drag) continue;
        let dragging = false, startPos = 0, startSize = 0;
        drag.addEventListener('mousedown', (e: MouseEvent) => {
          if ((collapsed as any)[panel]) return;
          dragging = true;
          startPos = panel === 'top' || panel === 'bottom' ? e.clientY : e.clientX;
          startSize = sizes[panel];
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e: MouseEvent) => {
          if (!dragging) return;
          const current = panel === 'top' || panel === 'bottom' ? e.clientY : e.clientX;
          const delta = panel === 'top' ? startPos - current : panel === 'bottom' ? current - startPos : current - startPos;
          sizes[panel] = Math.max(60, startSize + delta);
          const dim = panel === 'top' || panel === 'bottom' ? 'h' : 'w';
          el.style.setProperty('--ps-' + panel + '-' + dim, sizes[panel] + 'px');
        });
        window.addEventListener('mouseup', () => { dragging = false; });
      }
    }

    // ── 折叠按钮 ──────────────────────────────
    function initCollapseButtons() {
      document.querySelectorAll('.ps-ov-collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const panel = (btn as HTMLElement).dataset.panel!;
          (collapsed as any)[panel] = !(collapsed as any)[panel];
          applyState();
          browser.runtime.sendMessage({ type: 'overlay:panelState', payload: { panel, collapsed: (collapsed as any)[panel] } });
        });
      });
    }

    // ── Spec 点击 ──────────────────────────────
    function initSpecClicks() {
      document.querySelectorAll('.ps-spec-item[data-spec]').forEach(item => {
        item.addEventListener('click', () => {
          const specName = (item as HTMLElement).dataset.spec!;
          window.postMessage({ type: 'PS_EXT_MSG_spec:select', payload: { specName }, _from: 'extension' }, '*');
        });
      });
    }

    // ── 操作按钮 ──────────────────────────────
    function initActionClicks() {
      const actions: Record<string, string> = {
        'ps-action-highlight': 'elem:highlight',
        'ps-action-annotate': 'annotation:show',
        'ps-action-theme': 'design:toggle',
      };
      for (const [id, msgType] of Object.entries(actions)) {
        document.getElementById(id)?.addEventListener('click', () => {
          window.postMessage({ type: 'PS_EXT_MSG_' + msgType, payload: msgType === 'annotation:show' ? { mode: 'show' } : { theme: 'light' }, _from: 'extension' }, '*');
        });
      }
    }

    // ── 填充面板内容 ──────────────────────────────
    function fillPanels() {
      const isLocal = mode === 'local';

      const topInner = document.getElementById('ps-ov-top-inner');
      if (topInner) {
        topInner.innerHTML =
          '<div class="ps-ov-drag" data-panel="top"></div>' +
          '<div class="ps-ov-content ps-panel-top" style="display:flex;align-items:center;gap:12px;padding:0 12px;flex-direction:row">' +
          '<div style="display:flex;align-items:center;gap:8px"><div style="width:22px;height:22px;background:#7170ff;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">PS</div><span style="font-size:12px;font-weight:600;color:#f7f8f8">Proto Spec</span><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:' + (isLocal ? 'rgba(16,185,129,.15);color:#10b981' : 'rgba(113,112,255,.15);color:#818cff') + '">' + (isLocal ? '本地' : '远程') + '</span></div>' +
          '<div style="font-size:11px;color:#6b7280;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:400px">' + window.location.href.slice(0, 80) + '</div>' +
          '</div><div class="ps-ov-collapse-btn" data-panel="top" title="折叠">▬</div>';
      }

      const leftContent = document.querySelector('#ps-ov-left-inner .ps-ov-content') as HTMLElement;
      if (leftContent) {
        leftContent.innerHTML =
          '<div class="ps-panel-title">Spec 树</div>' +
          '<div class="ps-spec-item active" data-spec="page-shell"><span class="ps-spec-tag">P</span> page-shell</div>' +
          '<div class="ps-spec-item" data-spec="sidebar-nav" style="padding-left:20px"><span class="ps-spec-tag">C</span> sidebar-nav</div>' +
          '<div class="ps-spec-item" data-spec="menu-item" style="padding-left:36px"><span class="ps-spec-tag">B</span> menu-item</div>' +
          '<div class="ps-spec-item" data-spec="main-content" style="padding-left:20px"><span class="ps-spec-tag">C</span> main-content</div>' +
          '<div class="ps-spec-item" data-spec="card-list" style="padding-left:36px"><span class="ps-spec-tag">B</span> card-list</div>';
        initSpecClicks();
      }

      const rightContent = document.querySelector('#ps-ov-right-inner .ps-ov-content') as HTMLElement;
      if (rightContent) {
        rightContent.innerHTML =
          '<div class="ps-panel-title">治理操作</div>' +
          '<div class="ps-action-item" id="ps-action-highlight"><span class="ps-action-icon">✦</span>高亮元素</div>' +
          '<div class="ps-action-item" id="ps-action-annotate"><span class="ps-action-icon">📍</span>显示标注</div>' +
          '<div class="ps-action-item" id="ps-action-bind"><span class="ps-action-icon">⊕</span>绑定 Spec</div>' +
          '<div class="ps-action-item" id="ps-action-onboard"><span class="ps-action-icon">🎯</span>引导演示</div>' +
          '<div class="ps-action-item" id="ps-action-theme"><span class="ps-action-icon">🌓</span>主题切换</div>' +
          '<div class="ps-divider"></div>' +
          '<div class="ps-action-item" id="ps-action-extract"><span class="ps-action-icon">📋</span>提取 Spec</div>' +
          (!isLocal ? '<div style="padding:8px 12px;font-size:10.5px;color:#4b5563;line-height:1.5">远程页面仅支持样式提取</div>' : '');
        initActionClicks();
        document.getElementById('ps-action-extract')?.addEventListener('click', () => extractSpec());
      }

      const bottomContent = document.querySelector('#ps-ov-bottom-inner .ps-ov-content') as HTMLElement;
      if (bottomContent) {
        bottomContent.innerHTML = '<div class="ps-panel-title">事件日志</div><div id="ps-event-list" style="padding:6px 12px;font-size:11px;color:#6b7280;line-height:1.8">等待交互…</div>';
      }

      initCollapseButtons();
    }

    // ── Spec 提取 ──────────────────────────────
    function extractSpec(): { ok: boolean; spec: any } {
      const tags: any[] = [];
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,button,a,input,textarea,select,img,nav,header,footer,main,section,article,aside,div,span').forEach((el) => {
        const node = el as HTMLElement;
        tags.push({ tag: node.tagName.toLowerCase(), cls: node.className && typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 2).join('.') : '', id: node.id || '', text: node.innerText?.trim().slice(0, 30) || '' });
      });
      const spec = { url: window.location.href, title: document.title, tags: tags.slice(0, 50), layer: 'L3', generatedAt: new Date().toISOString() };
      browser.runtime.sendMessage({ type: 'popup:receive', payload: { type: 'spec:extracted', data: spec } });
      showStatus('提取完成：' + tags.length + ' 个元素', 3000);
      return { ok: true, spec };
    }

    function showStatus(text: string, ms = 2000) {
      const el = document.getElementById('ps-status');
      if (!el) return;
      el.textContent = text;
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), ms);
    }

    // 默认关闭，等待 side panel 激活
    toggleOverlay(false);

    // ══════════════════════════════════════════════════════
    // content script 内联解析器（panel:parsePage / panel:diffPage）
    // ══════════════════════════════════════════════════════
    let _lastDOM: string | null = null;
    let _idCnt = 0;
    function cgenId(): string { return 'n' + (++_idCnt); }

    function contentParseSpecTree(): any {
      _idCnt = 0;
      const body = document.body ?? document.documentElement;
      const root = parseEl(body, 0);
      const overlays = extractOverlays(root);
      return {
        url: location.href,
        title: document.title,
        generatedAt: new Date().toISOString(),
        layers: { pages: [root], overlays },
      };
    }

    function contentParseAndDiff(): any {
      const current = contentParseSpecTree();
      const snapshot = document.body?.innerHTML ?? '';
      const added: any[] = [];
      const removed: { name: string; selector: string }[] = [];
      if (_lastDOM !== null && _lastDOM !== snapshot) {
        // 简单策略：当前有上次没有的命名节点视为新增
        // 实际增量 diff 应持久化上次 spec 结构
        _lastDOM = snapshot;
      } else {
        _lastDOM = snapshot;
      }
      _lastDOM = snapshot;
      return { spec: current, diff: { added, removed, modified: [] } };
    }

    function parseEl(el: Element, depth: number): any {
      const tag = el.tagName.toLowerCase();
      const id = el.id || '';
      const cls = ((el.className ?? '') as string).trim();
      const classes = cls.split(/\s+/).filter(Boolean);
      if (!isVisible(el)) {
        return { id: cgenId(), name: tag + '-hidden', type: 'S', layer: 'L4', children: [], selector: tag };
      }
      const children = Array.from(el.children).map((c) => parseEl(c, depth + 1));
      const type = inferType(el, children);
      const name = inferName(tag, id, classes, el);
      return {
        id: cgenId(),
        name,
        type,
        layer: depth === 0 ? 'L2' : depth === 1 ? 'L3' : 'L4',
        children,
        selector: buildSel(el),
      };
    }

    function isVisible(el: Element): boolean {
      const tag = el.tagName.toLowerCase();
      if (['script','style','meta','link','noscript'].includes(tag)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    }

    function inferType(el: Element, children: any[]): string {
      const tag = el.tagName.toLowerCase();
      const interactiveTags = ['button','a','input','textarea','select','form'];
      if (interactiveTags.includes(tag)) return 'B';
      if (el.getAttribute('onclick') || el.querySelector('button,[role="button"]' )) return 'B';
      if (children.some((c: any) => c.type === 'B')) return 'C';
      if (children.length > 1) return 'C';
      if (children.length === 1) return children[0].type;
      const semMap: Record<string,string> = {header:'C',nav:'C',aside:'C',footer:'C',main:'P',section:'P',article:'P',img:'S',svg:'S',span:'S',div:'C',p:'S',h1:'S',h2:'S',h3:'S'};
      return semMap[tag] ?? 'S';
    }

    function inferName(tag: string, id: string, classes: string[], el: Element): string {
      if (id) return kebab(id);
      const sem = classes.find((c) => /^(nav|header|footer|sidebar|main|hero|banner|card|modal|btn|menu|item|logo|search|input|form)/i.test(c));
      if (sem) return kebab(sem);
      if (classes[0]) return kebab(classes[0]);
      return tag;
    }

    function kebab(str: string): string {
      return str.replace(/([a-z])([A-Z])/g,'$1-$2').replace(/[\s_]+/g,'-').toLowerCase().replace(/[^a-z0-9-]/g,'');
    }

    function buildSel(el: Element): string {
      if (el.id) return '#' + el.id;
      const tag = el.tagName.toLowerCase();
      const cls = ((el.className ?? '') as string).trim().split(/\s+/).slice(0,2).join('.');
      return cls ? tag + '.' + cls : tag;
    }

    function extractOverlays(node: any): any[] {
      const overlays: any[] = [];
      const remaining: any[] = [];
      for (const child of (node.children ?? [])) {
        const ot = inferOverlayType(child);
        if (ot !== 'none') {
          overlays.push({ id: cgenId(), name: child.name + '-overlay', type: 'P', layer: 'L2', children: child.children ?? [], overlayType: ot });
        } else {
          remaining.push(child);
        }
      }
      node.children = remaining;
      return overlays;
    }

    function inferOverlayType(el: any): string {
      const name = (el.name ?? '').toLowerCase();
      if (/modal|dialog|popup/.test(name)) return 'modal';
      if (/drawer|sidebar|panel/.test(name)) return 'drawer';
      if (/tooltip/.test(name)) return 'tooltip';
      if (/dropdown/.test(name)) return 'dropdown';
      return 'none';
    }
  },
});
