// content.ts — Proto Spec content script
// 注入 runtime.js + 4 侧栏 overlay 到目标页面

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main(ctx) {
    // ── Proto Spec Runtime（内联版）─────────────────────────────
    const RUNTIME_SCRIPT = `(function(){
  'use strict';
  var PREFIX = 'PS_EXT_MSG_';
  var _listeners={}, _pendingReplies={}, _extSource=null, _initialized=false;
  var PostMessage = {
    init: function() {
      if(_initialized) return;
      _initialized = true;
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if(!msg || typeof msg.type !== 'string' || !msg.type.startsWith(PREFIX)) return;
        var type = msg.type.slice(PREFIX.length);
        if(msg._from === 'extension' && event.source) _extSource = event.source;
        (_listeners[type] || []).forEach(function(h){ try{ h(msg.payload, {type: type, source: event.source}); } catch(e){} });
        if(msg._msgId && _pendingReplies[msg._msgId]) {
          var p = _pendingReplies[msg._msgId];
          clearTimeout(p.timer);
          delete _pendingReplies[msg._msgId];
          p.resolve(msg.payload);
        }
      });
    },
    send: function(type, payload) {
      var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
      window.postMessage({ type: PREFIX + type, payload: payload, _msgId: msgId, _from: 'extension' }, '*');
      return msgId;
    },
    reply: function(type, payload) {
      if(_extSource) _extSource.postMessage({ type: PREFIX + type, payload: payload, _from: 'page' }, '*');
    },
    on: function(type, handler) { (_listeners[type] = _listeners[type] || []).push(handler); },
    request: function(type, payload, timeout) {
      var msgId = this.send(type, payload);
      return new Promise(function(resolve, reject) {
        _pendingReplies[msgId] = { resolve: resolve, reject: reject, timer: setTimeout(function() {
          delete _pendingReplies[msgId]; reject(new Error('timeout'));
        }, timeout||5000) };
      });
    }
  };

  var Runtime = {
    _activeSpec: null,
    init: function() {
      PostMessage.on('spec:select',   this._onSpecSelect.bind(this));
      PostMessage.on('spec:bind',     this._onSpecBind.bind(this));
      PostMessage.on('onboard:start', this._onOnboardStart.bind(this));
      PostMessage.on('elem:highlight', this._onElemHighlight.bind(this));
      PostMessage.on('annotation:show', this._onAnnotationShow.bind(this));
      PostMessage.on('annotation:clear', this._onAnnotationClear.bind(this));
      PostMessage.on('design:toggle', function(d){ document.documentElement.dataset.psTheme = d.theme||'dark'; });
      PostMessage.reply('runtime:ready', { version: '1.0.0', url: location.href });
      this._initDOMListeners();
      console.log('[Proto Spec] Runtime ready');
    },
    _onSpecSelect: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(el) { el.scrollIntoView({ behavior:'smooth', block:'center' }); this._flash(el, '#7170ff', 600); }
      this._activeSpec = data;
    },
    _onSpecBind: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(!el) return;
      el.setAttribute('data-ps-spec', data.specName);
      this._flash(el, '#10b981', 800);
      PostMessage.reply('spec:bound', { specName: data.specName });
    },
    _onOnboardStart: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(!el) return;
      el.scrollIntoView({ behavior:'smooth', block:'center' });
      var self = this;
      setTimeout(function() { self._flash(el, '#f59e0b', 1000); self._showTip(el, data.specName); }, 400);
    },
    _onElemHighlight: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(el) this._flash(el, data.color||'#7170ff', 1000);
    },
    _onAnnotationShow: function(data) {
      document.documentElement.dataset.psAnnotations = data.mode==='show' ? 'show' : 'hide';
    },
    _onAnnotationClear: function() {
      document.querySelectorAll('[data-ps-highlight]').forEach(function(el){ el.style.boxShadow=''; el.removeAttribute('data-ps-highlight'); });
      document.querySelectorAll('.ps-tooltip').forEach(function(el){ el.remove(); });
    },
    _initDOMListeners: function() {
      var self = this;
      document.addEventListener('click', function(e) {
        PostMessage.reply('elem:click', { selector: self._sel(e.target), tag: e.target.tagName, text: e.target.innerText.slice(0,40) });
      }, true);
    },
    _flash: function(el, color, ms) {
      el.setAttribute('data-ps-highlight', '1');
      el.style.boxShadow = '0 0 0 3px ' + color + ', 0 0 20px ' + color + '44';
      var orig = '0 0 0 2px ' + color + '88';
      setTimeout(function(){ el.style.boxShadow = orig; }, ms);
    },
    _showTip: function(el, text) {
      var old = document.querySelector('.ps-tooltip');
      if(old) old.remove();
      var tip = document.createElement('div');
      tip.className = 'ps-tooltip';
      tip.textContent = text;
      tip.style.cssText = 'position:fixed;z-index:9999999;background:#1a1b27;color:#f9fafb;padding:6px 12px;border-radius:6px;font-size:12px;font-family:Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid #2a2d3a;pointer-events:none;top:12px;left:50%;transform:translateX(-50%);white-space:nowrap;z-index:2147483647';
      document.body.appendChild(tip);
      setTimeout(function(){ tip.remove(); }, 4000);
    },
    _sel: function(el) {
      if(el.id) return '#' + el.id;
      var parts = [];
      while(el && el.nodeType===1 && parts.length<4) {
        var s = el.tagName.toLowerCase();
        if(el.id) { parts.unshift('#'+el.id); return parts.join('>'); }
        if(el.className && typeof el.className==='string') { var c=el.className.trim().split(/\\s+/)[0]; if(c) s+='.'+c; }
        parts.unshift(s);
        el = el.parentElement;
      }
      return parts.join(' > ');
    }
  };
  PostMessage.init();
  window.ProtoSpec = { PostMessage: PostMessage, Runtime: Runtime };
  Runtime.init();
})();`;

    // 注入 runtime
    if (!document.getElementById('ps-runtime')) {
      const s = document.createElement('script');
      s.id = 'ps-runtime';
      s.textContent = RUNTIME_SCRIPT;
      (document.head || document.documentElement).appendChild(s);
    }

    // ── 4 侧栏 Overlay 管理器 ──────────────────────────────
    const overlayId = 'ps-overlay-root';

    // 监听 side panel 发来的消息
    browser.runtime.onMessage.addListener((msg) => {
      switch (msg?.type) {
        case 'panel:ping':
          return Promise.resolve({ ok: true });

        case 'panel:toggle':
          return Promise.resolve(toggleOverlay(msg.payload.active, msg.payload.collapsed));

        case 'panel:setCollapsed':
          return Promise.resolve(setPanelCollapsed(msg.payload.panel, msg.payload.collapsed));

        case 'panel:setMode':
          return Promise.resolve(setMode(msg.payload.mode));

        case 'panel:reset':
          return Promise.resolve(resetOverlay());

        case 'action:highlight':
          window.postMessage({ type: 'PS_EXT_MSG_elem:highlight', payload: { selector: 'body', color: '#7170ff' }, _from: 'extension' }, '*');
          return Promise.resolve({ ok: true });

        case 'action:annotate':
          window.postMessage({ type: 'PS_EXT_MSG_annotation:show', payload: { mode: 'show' }, _from: 'extension' }, '*');
          return Promise.resolve({ ok: true });

        case 'action:extract':
          return Promise.resolve(extractSpec());

        default:
          return Promise.resolve({ ok: true });
      }
    });

    // ── Overlay DOM ──────────────────────────────
    function buildOverlayDOM() {
      const root = document.createElement('div');
      root.id = overlayId;
      root.innerHTML = `
      <div class="ps-ov-top" id="ps-ov-top">
        <div class="ps-ov-top-inner" id="ps-ov-top-inner">
          <div class="ps-ov-drag" data-panel="top"></div>
          <div class="ps-ov-content ps-panel-top"></div>
          <div class="ps-ov-collapse-btn" data-panel="top" title="折叠顶部">▬</div>
        </div>
      </div>
      <div class="ps-ov-left" id="ps-ov-left">
        <div class="ps-ov-left-inner" id="ps-ov-left-inner">
          <div class="ps-ov-collapse-btn" data-panel="left" title="折叠左侧">◀</div>
          <div class="ps-ov-content ps-panel-left"></div>
          <div class="ps-ov-drag" data-panel="left"></div>
        </div>
      </div>
      <div class="ps-ov-right" id="ps-ov-right">
        <div class="ps-ov-right-inner" id="ps-ov-right-inner">
          <div class="ps-ov-drag" data-panel="right"></div>
          <div class="ps-ov-content ps-panel-right"></div>
          <div class="ps-ov-collapse-btn" data-panel="right" title="折叠右侧">▶</div>
        </div>
      </div>
      <div class="ps-ov-bottom" id="ps-ov-bottom">
        <div class="ps-ov-bottom-inner" id="ps-ov-bottom-inner">
          <div class="ps-ov-collapse-btn" data-panel="bottom" title="折叠底部">▬</div>
          <div class="ps-ov-content ps-panel-bottom"></div>
          <div class="ps-ov-drag" data-panel="bottom"></div>
        </div>
      </div>
      <style id="ps-ov-style">
        #ps-overlay-root{position:fixed;inset:0;z-index:2147483640;pointer-events:none;font-family:'Inter',system-ui,sans-serif!important}
        #ps-overlay-root.active{pointer-events:all}
        #ps-overlay-root.active .ps-page-region{opacity:0.92}
        .ps-page-region{position:absolute;inset:0;transition:opacity .25s, top .3s, right .3s, bottom .3s, left .3s;pointer-events:none}
        /* Top bar */
        .ps-ov-top{position:absolute;top:0;left:0;right:0;background:#0d0e11;border-bottom:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;transition:height .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}
        .ps-ov-top.collapsed{height:28px!important}
        .ps-ov-top.expanded{height:var(--ps-top-h, 160px)}
        .ps-ov-top-inner{flex:1;display:flex;flex-direction:column;overflow:hidden}
        /* Bottom bar */
        .ps-ov-bottom{position:absolute;bottom:0;left:0;right:0;background:#0d0e11;border-top:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;transition:height .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}
        .ps-ov-bottom.collapsed{height:28px!important}
        .ps-ov-bottom.expanded{height:var(--ps-bottom-h, 140px)}
        .ps-ov-bottom-inner{flex:1;display:flex;flex-direction:column;overflow:hidden}
        /* Left bar */
        .ps-ov-left{position:absolute;top:0;bottom:0;left:0;background:#0d0e11;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:row;transition:width .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}
        .ps-ov-left.collapsed{width:28px!important}
        .ps-ov-left.expanded{width:var(--ps-left-w, 260px)}
        .ps-ov-left-inner{flex:1;display:flex;overflow:hidden;align-items:stretch}
        /* Right bar */
        .ps-ov-right{position:absolute;top:0;bottom:0;right:0;background:#0d0e11;border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:row;transition:width .3s cubic-bezier(.4,0,.2,1);overflow:hidden;z-index:1}
        .ps-ov-right.collapsed{width:28px!important}
        .ps-ov-right.expanded{width:var(--ps-right-w, 280px)}
        .ps-ov-right-inner{flex:1;display:flex;overflow:hidden;align-items:stretch}
        /* Collapse button */
        .ps-ov-collapse-btn{width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:none;color:#6b7280;font-size:10px;cursor:pointer;transition:all .15s;flex-shrink:0;z-index:2;cursor:pointer}
        .ps-ov-collapse-btn:hover{background:rgba(255,255,255,.08);color:#f7f8f8}
        /* Content */
        .ps-ov-content{flex:1;overflow:auto;padding:10px 12px;min-width:0;min-height:0}
        .ps-panel-left .ps-ov-content,.ps-panel-right .ps-ov-content{padding:10px 0}
        /* Drag handle */
        .ps-ov-drag{background:transparent;flex-shrink:0;transition:background .15s}
        .ps-ov-drag[data-panel="top"],.ps-ov-drag[data-panel="bottom"]{height:4px;cursor:ns-resize;width:100%}
        .ps-ov-drag[data-panel="left"],.ps-ov-drag[data-panel="right"]{width:4px;cursor:ew-resize;height:100%}
        .ps-ov-drag:hover{background:rgba(113,112,255,.3)!important}
        /* Collapsed icon strip */
        .ps-ov-top.collapsed .ps-ov-drag,.ps-ov-bottom.collapsed .ps-ov-drag{display:none}
        .ps-ov-top.collapsed .ps-panel-top,.ps-ov-bottom.collapsed .ps-panel-bottom{display:none}
        .ps-ov-left.collapsed .ps-panel-left,.ps-ov-right.collapsed .ps-panel-right{display:none}
        /* Collapsed: collapse button at opposite end */
        .ps-ov-top.collapsed .ps-ov-collapse-btn{order:-1}
        .ps-ov-bottom.collapsed .ps-ov-collapse-btn{order:1}
        .ps-ov-left.collapsed .ps-ov-left-inner{flex-direction:row}
        .ps-ov-right.collapsed .ps-ov-right-inner{flex-direction:row-reverse}
        /* Panel inner layout */
        .ps-ov-left-inner,.ps-ov-right-inner{flex-direction:column}
        .ps-ov-top-inner,.ps-ov-bottom-inner{flex-direction:row}
        /* Panel title */
        .ps-panel-title{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;padding:8px 12px 4px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
        .ps-panel-left .ps-panel-title,.ps-panel-right .ps-panel-title{padding:8px 12px 4px}
        /* Spec list */
        .ps-spec-item{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;color:#c8cdd6;transition:all .12s}
        .ps-spec-item:hover{background:rgba(255,255,255,.05);color:#fff}
        .ps-spec-item.active{background:rgba(113,112,255,.12);color:#818cff}
        .ps-spec-tag{font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;background:rgba(113,112,255,.15);color:#818cff}
        /* Status bar */
        .ps-status{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#10b981;font-size:10px;padding:3px 10px;border-radius:10px;pointer-events:none;white-space:nowrap;z-index:10;transition:opacity .3s}
        .ps-status.hidden{opacity:0}
        /* Resize cursors when hovering */
        .ps-ov-top .ps-ov-drag[data-panel="top"]{cursor:ns-resize}
        .ps-ov-bottom .ps-ov-drag[data-panel="bottom"]{cursor:ns-resize}
        .ps-ov-left .ps-ov-drag[data-panel="left"]{cursor:ew-resize}
        .ps-ov-right .ps-ov-drag[data-panel="right"]{cursor:ew-resize}
      </style>
      <div class="ps-status hidden" id="ps-status"></div>`;
      return root;
    }

    // ── Overlay 状态 ──────────────────────────────
    let active = false;
    let mode = 'local';
    const collapsed: Record<string, boolean> = {};
    const sizes: Record<string, number> = { top: 160, bottom: 140, left: 260, right: 280 };
    const MIN_SIZE = 28; // collapsed height

    function toggleOverlay(show: boolean, initCollapsed?: string[]) {
      let root = document.getElementById(overlayId);
      if (show) {
        if (!root) {
          document.body.appendChild(buildOverlayDOM());
          root = document.getElementById(overlayId)!;
          initDragResize();
          initCollapseButtons();
        }
        root.classList.add('active');
        (initCollapsed || []).forEach((p: string) => collapsed[p] = true);
        applyState();
      } else {
        root?.classList.remove('active');
      }
      active = show;
    }

    function setPanelCollapsed(panel: string, val: boolean) {
      collapsed[panel] = val;
      applyState();
    }

    function setMode(m: string) {
      mode = m;
      // 填充各面板内容
      fillPanels();
    }

    function resetOverlay() {
      for (const k of Object.keys(collapsed)) delete collapsed[k];
      applyState();
    }

    function applyState() {
      for (const panel of ['top', 'bottom', 'left', 'right']) {
        const el = document.getElementById(`ps-ov-${panel}`);
        if (!el) continue;
        if (collapsed[panel]) {
          el.classList.remove('expanded');
          el.classList.add('collapsed');
        } else {
          el.classList.remove('collapsed');
          el.classList.add('expanded');
          el.style.setProperty(`--ps-${panel}-${panel[0] === 't' || panel[0] === 'b' ? 'h' : 'w'}`, `${sizes[panel]}px`);
        }
      }
    }

    // ── 拖拽调整大小 ──────────────────────────────
    function initDragResize() {
      for (const panel of ['top', 'bottom', 'left', 'right']) {
        const el = document.getElementById(`ps-ov-${panel}`);
        if (!el) continue;
        const drag = el.querySelector('.ps-ov-drag') as HTMLElement;
        if (!drag) continue;

        let startPos = 0, startSize = 0, dragging = false;

        drag.addEventListener('mousedown', (e: MouseEvent) => {
          if (collapsed[panel]) return;
          dragging = true;
          startPos = panel === 'top' || panel === 'bottom' ? e.clientY : e.clientX;
          startSize = sizes[panel];
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e: MouseEvent) => {
          if (!dragging) return;
          const current = panel === 'top' || panel === 'bottom' ? e.clientY : e.clientX;
          const delta = panel === 'top' ? startPos - current : panel === 'bottom' ? current - startPos : current - startPos;
          const newSize = Math.max(60, startSize + delta);
          sizes[panel] = newSize;
          el.style.setProperty(`--ps-${panel}-${panel[0] === 't' || panel[0] === 'b' ? 'h' : 'w'}`, `${newSize}px`);
        });

        window.addEventListener('mouseup', () => { dragging = false; });
      }
    }

    // ── 折叠按钮 ──────────────────────────────
    function initCollapseButtons() {
      document.querySelectorAll('.ps-ov-collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const panel = (btn as HTMLElement).dataset.panel!;
          collapsed[panel] = !collapsed[panel];
          applyState();
          // 通知 side panel
          browser.runtime.sendMessage({ type: 'overlay:panelState', payload: { panel, collapsed: collapsed[panel] } });
        });
      });
    }

    // ── 填充面板内容 ──────────────────────────────
    function fillPanels() {
      const isLocal = mode === 'local';

      // Left panel: Spec tree
      const leftContent = document.querySelector('#ps-ov-left .ps-panel-left') || document.querySelector('#ps-ov-left-inner .ps-ov-content');
      if (leftContent) {
        leftContent.innerHTML = `
          <div class="ps-panel-title">Spec 树</div>
          <div class="ps-spec-item active"><span class="ps-spec-tag">P</span> page-shell</div>
          <div class="ps-spec-item" style="padding-left:20px"><span class="ps-spec-tag">C</span> sidebar-nav</div>
          <div class="ps-spec-item" style="padding-left:36px"><span class="ps-spec-tag">B</span> menu-item</div>
          <div class="ps-spec-item" style="padding-left:36px"><span class="ps-spec-tag">S</span> logo</div>
          <div class="ps-spec-item" style="padding-left:20px"><span class="ps-spec-tag">C</span> main-content</div>
          <div class="ps-spec-item" style="padding-left:36px"><span class="ps-spec-tag">B</span> card-list</div>
        `;
      }

      // Right panel: Properties / Actions
      const rightContent = document.querySelector('#ps-ov-right .ps-panel-right') || document.querySelector('#ps-ov-right-inner .ps-ov-content');
      if (rightContent) {
        rightContent.innerHTML = `
          <div class="ps-panel-title">属性 & 操作</div>
          <div class="ps-spec-item">✦ 高亮选中元素</div>
          <div class="ps-spec-item">📍 显示标注</div>
          <div class="ps-spec-item">⊕ 绑定 Spec</div>
          <div class="ps-spec-item">🎯 引导演示</div>
          <div class="ps-spec-item">🌓 主题切换</div>
          ${isLocal ? '<div class="ps-spec-item" style="opacity:.4;font-size:11px;padding-left:20px;color:#6b7280">— 远程页面不支持治理</div>' : ''}
        `;
      }

      // Top panel: Toolbar
      const topContent = document.querySelector('#ps-ov-top .ps-panel-top') || document.querySelector('#ps-ov-top-inner .ps-ov-content');
      if (topContent) {
        topContent.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:6px 12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:24px;height:24px;background:#7170ff;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">PS</div>
              <span style="font-size:12px;font-weight:600;color:#f7f8f8">Proto Spec</span>
              <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${isLocal ? 'rgba(16,185,129,.15)':'rgba(113,112,255,.15)'};color:${isLocal ? '#10b981':'#818cff'}">${isLocal ? '本地' : '远程'}</span>
            </div>
            <div style="font-size:11px;color:#6b7280;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${document.location.href.slice(0, 60)}</div>
          </div>
        `;
      }

      // Bottom panel: Event log
      const bottomContent = document.querySelector('#ps-ov-bottom .ps-panel-bottom') || document.querySelector('#ps-ov-bottom-inner .ps-ov-content');
      if (bottomContent) {
        bottomContent.innerHTML = `
          <div class="ps-panel-title">事件日志</div>
          <div id="ps-event-list" style="padding:6px 12px;font-size:11px;color:#6b7280">等待事件…</div>
        `;
      }

      // 给 spec items 绑定点击 → 发送到 runtime
      document.querySelectorAll('.ps-spec-item[data-spec]').forEach(item => {
        item.addEventListener('click', () => {
          const specName = (item as HTMLElement).dataset.spec!;
          window.postMessage({ type: 'PS_EXT_MSG_spec:select', payload: { specName }, _from: 'extension' }, '*');
        });
      });
    }

    // ── Spec 提取 ──────────────────────────────
    function extractSpec(): { ok: boolean; spec: any } {
      const tags: string[] = [];
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,button,a,input,textarea,select,img,nav,header,footer,main,section,article,aside,div,span').forEach(el => {
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        const id = el.id ? '#' + el.id : '';
        const text = el.innerText?.trim().slice(0, 30) || '';
        tags.push({ tag, cls, id, text });
      });

      const spec = {
        url: location.href,
        title: document.title,
        tags: tags.slice(0, 50),
        layer: 'L3',
        generatedAt: new Date().toISOString(),
      };

      // 通知 side panel
      browser.runtime.sendMessage({ type: 'popup:receive', payload: { type: 'spec:extracted', data: spec } });

      showStatus('提取完成：' + tags.length + ' 个元素', 3000);
      return { ok: true, spec };
    }

    function showStatus(text: string, ms = 2000) {
      const el = document.getElementById('ps-status');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), ms);
    }

    // 初始化时默认关闭 overlay（等待 side panel 激活）
    toggleOverlay(false);
    fillPanels();
  },
});
