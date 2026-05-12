// Proto Spec Runtime — 纯 JS 代码，无依赖
// 通过 content.ts 的 blob URL 注入到页面，绕过 CSP
(function() {
  'use strict';
  var PREFIX = 'PS_EXT_MSG_';
  var _listeners = {}, _pendingReplies = {}, _extSource = null;

  var PostMessage = {
    init: function() {
      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith(PREFIX)) return;
        var type = msg.type.slice(PREFIX.length);
        if (msg._from === 'extension' && event.source) _extSource = event.source;
        (_listeners[type] || []).forEach(function(h) { try { h(msg.payload, { type: type, source: event.source }); } catch(e) {} });
        if (msg._msgId && _pendingReplies[msg._msgId]) {
          var p = _pendingReplies[msg._msgId];
          clearTimeout(p.timer);
          delete _pendingReplies[msg._msgId];
          p.resolve(msg.payload);
        }
      });
    },
    send: function(type, payload) {
      var msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      window.postMessage({ type: PREFIX + type, payload: payload, _msgId: msgId, _from: 'extension' }, '*');
    },
    reply: function(type, payload) {
      if (_extSource) _extSource.postMessage({ type: PREFIX + type, payload: payload, _from: 'page' }, '*');
    },
    on: function(type, handler) { (_listeners[type] = _listeners[type] || []).push(handler); }
  };

  var Runtime = {
    _activeSpec: null,
    init: function() {
      PostMessage.init();
      PostMessage.on('spec:select', this._onSpecSelect.bind(this));
      PostMessage.on('spec:bind', this._onSpecBind.bind(this));
      PostMessage.on('onboard:start', this._onOnboardStart.bind(this));
      PostMessage.on('elem:highlight', this._onElemHighlight.bind(this));
      PostMessage.on('annotation:show', this._onAnnotationShow.bind(this));
      PostMessage.on('annotation:clear', this._onAnnotationClear.bind(this));
      PostMessage.on('design:toggle', function(d) { document.documentElement.dataset.psTheme = d.theme || 'dark'; });
      PostMessage.reply('runtime:ready', { version: '1.0.0', url: window.location.href });
      this._initDOMListeners();
      console.log('[Proto Spec] Runtime ready');
    },
    _onSpecSelect: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); this._flash(el, '#7170ff', 600); }
      this._activeSpec = data;
    },
    _onSpecBind: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if (!el) return;
      el.setAttribute('data-ps-spec', data.specName);
      this._flash(el, '#10b981', 800);
      PostMessage.reply('spec:bound', { specName: data.specName });
    },
    _onOnboardStart: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var self = this;
      setTimeout(function() { self._flash(el, '#f59e0b', 1000); self._showTip(el, data.specName); }, 400);
    },
    _onElemHighlight: function(data) {
      var el = data.selector ? document.querySelector(data.selector) : null;
      if (el) this._flash(el, data.color || '#7170ff', 1000);
    },
    _onAnnotationShow: function(data) {
      document.documentElement.dataset.psAnnotations = data.mode === 'show' ? 'show' : 'hide';
    },
    _onAnnotationClear: function() {
      document.querySelectorAll('[data-ps-highlight]').forEach(function(el) { el.style.boxShadow = ''; el.removeAttribute('data-ps-highlight'); });
      document.querySelectorAll('.ps-tooltip').forEach(function(el) { el.remove(); });
    },
    _initDOMListeners: function() {
      var self = this;
      document.addEventListener('click', function(e) {
        PostMessage.reply('elem:click', { selector: self._sel(e.target), tag: e.target.tagName, text: e.target.innerText.slice(0, 40) });
      }, true);
    },
    _flash: function(el, color, ms) {
      el.setAttribute('data-ps-highlight', '1');
      el.style.boxShadow = '0 0 0 3px ' + color + ', 0 0 20px ' + color + '44';
      setTimeout(function() { el.style.boxShadow = '0 0 0 2px ' + color + '88'; }, ms);
    },
    _showTip: function(el, text) {
      var old = document.querySelector('.ps-tooltip');
      if (old) old.remove();
      var tip = document.createElement('div');
      tip.className = 'ps-tooltip';
      tip.textContent = text;
      tip.style.cssText = 'position:fixed;z-index:2147483647;background:#1a1b27;color:#f9fafb;padding:6px 12px;border-radius:6px;font-size:12px;font-family:system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid #2a2d3a;pointer-events:none;top:12px;left:50%;transform:translateX(-50%);white-space:nowrap';
      document.body.appendChild(tip);
      setTimeout(function() { tip.remove(); }, 4000);
    },
    _sel: function(el) {
      if (el.id) return '#' + el.id;
      var parts = [];
      while (el && el.nodeType === 1 && parts.length < 4) {
        var s = el.tagName.toLowerCase();
        if (el.id) { parts.unshift('#' + el.id); return parts.join('>'); }
        if (el.className && typeof el.className === 'string') { var c = el.className.trim().split(/\s+/)[0]; if (c) s += '.' + c; }
        parts.unshift(s);
        el = el.parentElement;
      }
      return parts.join(' > ');
    }
  };

  window.ProtoSpec = { PostMessage: PostMessage, Runtime: Runtime };
  Runtime.init();
})();
