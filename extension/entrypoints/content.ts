// content.ts — Proto Spec content script
// 注入 runtime.js 到目标页面，并作为 popup ↔ page 的通信桥梁

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main(ctx) {
    // Proto Spec Runtime — 内联版（从 assets/runtime.js 复制）
    const RUNTIME_SCRIPT = `(function(){
  'use strict';
  var PREFIX = 'PS_EXT_MSG_';
  var _listeners={}, _replyListeners={}, _pendingReplies={}, _extSource=null, _initialized=false;
  var PostMessage = {
    init: function() {
      if(_initialized) return;
      _initialized = true;
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if(!msg || typeof msg.type !== 'string') return;
        if(!msg.type.startsWith(PREFIX)) return;
        var type = msg.type.slice(PREFIX.length);
        var data = msg.payload;
        if(msg._from === 'extension' && event.source) _extSource = event.source;
        (_listeners[type] || []).forEach(function(h){ try{ h(data, {type: type, source: event.source, origin: event.origin}); } catch(e){ console.error('[PostMessage]', e); }});
        if(msg._msgId && _pendingReplies[msg._msgId]) {
          var p = _pendingReplies[msg._msgId];
          delete _pendingReplies[msg._msgId];
          p.resolve(data);
        }
      });
    },
    send: function(type, payload, msgId) {
      var msg = { type: PREFIX + type, payload: payload, _msgId: msgId || this._genId(), _from: 'extension', _ts: Date.now() };
      window.postMessage(msg, '*');
      return msg._msgId;
    },
    reply: function(msg) {
      if(_extSource) {
        _extSource.postMessage({ type: PREFIX + msg.type, payload: msg.payload, _from: 'page', _ts: Date.now() }, '*');
      } else {
        (_replyListeners[msg.type] || []).forEach(function(h){ try{ h(msg.payload); } catch(e){} });
      }
    },
    on: function(type, handler) {
      if(!_listeners[type]) _listeners[type] = [];
      _listeners[type].push(handler);
    },
    request: function(type, payload, timeout) {
      var msgId = this._genId();
      this.send(type, payload, msgId);
      return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() { delete _pendingReplies[msgId]; reject(new Error('timeout')); }, timeout || 5000);
        _pendingReplies[msgId] = { resolve: function(d){ clearTimeout(timer); resolve(d); }, reject: reject };
      });
    },
    _genId: function() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  };
  var Runtime = {
    _activeSpec: null, _annotationsVisible: false,
    init: function() {
      PostMessage.on('spec:select',   this._onSpecSelect.bind(this));
      PostMessage.on('spec:bind',     this._onSpecBind.bind(this));
      PostMessage.on('onboard:start', this._onOnboardStart.bind(this));
      PostMessage.on('design:toggle', this._onDesignToggle.bind(this));
      PostMessage.on('elem:highlight', this._onElemHighlight.bind(this));
      PostMessage.on('annotation:show', this._onAnnotationShow.bind(this));
      PostMessage.on('annotation:clear', this._onAnnotationClear.bind(this));
      this._initDOMListeners();
      PostMessage.reply({ type: 'runtime:ready', payload: { version: '1.0.0', pageURL: location.href, documentTitle: document.title } });
      console.log('[Proto Spec] Runtime initialized on', location.href);
    },
    _onSpecSelect: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); this._highlight(el, data.specName); }
      this._activeSpec = data;
    },
    _onSpecBind: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(!el) { console.warn('[Proto Spec] bind target not found:', data.selector); return; }
      el.setAttribute('data-ps-spec', data.specName);
      this._flashHighlight(el, '#10b981', 800);
      PostMessage.reply({ type: 'spec:bound', payload: { specName: data.specName, selector: data.selector } });
    },
    _onOnboardStart: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(!el) return;
      var self = this;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function() { self._highlight(el, data.specName); self._showTooltip(el, data.specName + ' — ' + ((data.steps||[]).join(' | '))); }, 400);
    },
    _onDesignToggle: function(data) { document.documentElement.dataset.psTheme = data.theme || 'dark'; },
    _onElemHighlight: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if(el) this._highlight(el, null, data.color);
    },
    _onAnnotationShow: function(data) {
      this._annotationsVisible = data.mode === 'show';
      document.documentElement.dataset.psAnnotations = this._annotationsVisible ? 'show' : 'hide';
    },
    _onAnnotationClear: function() {
      var self = this;
      document.querySelectorAll('[data-ps-highlight]').forEach(function(el2){ el2.style.boxShadow = ''; el2.removeAttribute('data-ps-highlight'); });
      document.querySelectorAll('.ps-tooltip').forEach(function(el2){ el2.remove(); });
    },
    _initDOMListeners: function() {
      var self = this;
      document.addEventListener('click', function(e) {
        PostMessage.reply({ type: 'elem:click', payload: { selector: self._getSelector(e.target), text: e.target.innerText.slice(0,50), tagName: e.target.tagName } });
      }, true);
    },
    _highlight: function(el, specName, color) {
      var c = color || '#7170ff';
      el.setAttribute('data-ps-highlight', specName || 'h');
      el.style.boxShadow = '0 0 0 3px ' + c + ', 0 0 20px ' + c + '44';
      var self = this;
      setTimeout(function() { el.style.boxShadow = '0 0 0 2px ' + c + '88'; }, 600);
    },
    _flashHighlight: function(el, color, ms) {
      var orig = el.style.boxShadow;
      el.style.boxShadow = '0 0 0 3px ' + color;
      setTimeout(function() { el.style.boxShadow = orig || ''; }, ms);
    },
    _showTooltip: function(el, text) {
      var existing = document.querySelector('.ps-tooltip');
      if(existing) existing.remove();
      var tip = document.createElement('div');
      tip.className = 'ps-tooltip';
      tip.textContent = text;
      tip.style.cssText = 'position:fixed;z-index:999999;background:#1a1b27;color:#f9fafb;padding:6px 12px;border-radius:6px;font-size:12px;font-family:Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid #2a2d3a;pointer-events:none;top:10px;left:50%;transform:translateX(-50%)';
      document.body.appendChild(tip);
      setTimeout(function(){ tip.remove(); }, 4000);
    },
    _getSelector: function(el) {
      if(el.id) return '#' + el.id;
      var parts = [];
      while(el && el.nodeType === Node.ELEMENT_NODE) {
        var s = el.tagName.toLowerCase();
        if(el.id) { s = '#' + el.id; parts.unshift(s); break; }
        if(el.className && typeof el.className === 'string') {
          var cls = el.className.trim().split(/\\s+/)[0];
          if(cls) s += '.' + cls;
        }
        parts.unshift(s);
        el = el.parentElement;
        if(parts.length > 4) break;
      }
      return parts.join(' > ');
    }
  };
  PostMessage.init();
  window.ProtoSpec = { PostMessage: PostMessage, Runtime: Runtime };
  Runtime.init();
})();`;

    // 注入 Proto Spec Runtime
    if (!document.getElementById('ps-runtime')) {
      const script = document.createElement('script');
      script.id = 'ps-runtime';
      script.textContent = RUNTIME_SCRIPT;
      (document.head || document.documentElement).appendChild(script);
    } else {
      console.log('[Proto Spec] Runtime already injected');
    }

    // 监听来自 background 的 Extension 指令
    browser.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type && msg.payload) {
        // 触发 runtime 处理（通过 postMessage 注入到页面）
        window.postMessage({
          type: 'PS_EXT_MSG_' + msg.type,
          payload: msg.payload,
          _from: 'extension',
        }, '*');
      }
    });

    ctx.onUnload(() => {
      console.log('[Proto Spec] Content script unloaded');
    });
  },
});
