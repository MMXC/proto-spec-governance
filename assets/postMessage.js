/**
 * postMessage.js — Chrome Extension ↔ Webpage 通信层模拟
 *
 * 参考 Chrome Extension content script 与网页的 postMessage 协议：
 * - Extension → Page: window.postMessage({ type, payload }, '*')
 * - Page → Extension: event.source.postMessage({ type, payload }, event.origin)
 *
 * 在开发/测试环境中，Extension 端也通过这个库模拟，
 * 因为 Extension 的 background script 无法直接 postMessage 到普通网页（需通过 content script relay）。
 *
 * Usage:
 *   // 网页端：监听 Extension 消息
 *   PostMessage.on('spec:select', data => { ... });
 *
 *   // Extension 端（或测试）：发送消息
 *   PostMessage.send('spec:select', { specName: 'sidebar-nav', selector: 'nav.sidebar' });
 *
 *   // 网页端回复（自动基于收到的 event.source）
 *   PostMessage.reply({ type: 'spec:bound', payload: { specName: 'sidebar-nav' }});
 *
 *   // Extension 端监听网页消息
 *   PostMessage.onReply('elem:click', data => { ... });
 */

(function (global) {
  'use strict';

  const PREFIX = 'PS_EXT_MSG_';  // 消息前缀，避免与其他 postMessage 混

  function hubEmit(name, payload) {
    try {
      const hub = globalThis.__protoSpecHub;
      if (hub && hub.events && typeof hub.events.emit === 'function') {
        hub.events.emit(name, payload);
      }
    } catch (_e) {
      /* 忽略，避免影响主协议 */
    }
  }

  function hubDataSet(key, value) {
    try {
      const hub = globalThis.__protoSpecHub;
      if (hub && hub.data && typeof hub.data.set === 'function') {
        hub.data.set(key, value);
      }
    } catch (_e) {}
  }

  const PostMessage = {
    // ── 内部状态 ──
    _listeners: {},        // type → [handler]
    _replyListeners: {},  // type → [handler]
    _pendingReplies: {},   // msgId → { resolve, reject }
    _extensionSource: null,// 模拟 Extension 的消息源（event.source）
    _initialized: false,

    /**
     * 初始化网页端的监听
     * 在网页的 <script src="postMessage.js"></script> 之后调用
     */
    init() {
      if (this._initialized) return;
      this._initialized = true;

      window.addEventListener('message', this._onMessage.bind(this));
    },

    /**
     * Extension 端（或测试代码）发送消息到网页
     * 模拟: window.postMessage({ type, payload }, '*')
     *
     * @param {string} type - 消息类型，如 'spec:select'
     * @param {object} payload - 消息数据
     * @param {string} [msgId] - 可选的消息 ID，用于reply追踪
     */
    send(type, payload, msgId) {
      const msg = {
        type: PREFIX + type,
        payload: payload,
        _msgId: msgId || this._genId(),
        _from: 'extension',
        _ts: Date.now()
      };

      // 模拟 Extension 通过 content script 发送
      // 在真实环境中，这是 content script 的 window.postMessage
      // 在测试/开发环境，我们直接触发网页的 message 事件
      if (typeof window !== 'undefined') {
        window.postMessage(msg, '*');
      }

      return msg._msgId;
    },

    /**
     * 网页端回复 Extension（自动使用之前收到的 event.source）
     * 模拟: event.source.postMessage({ type, payload }, event.origin)
     *
     * @param {object} msg - { type, payload }
     */
    reply(msg) {
      hubEmit('page:outbound', { type: msg.type, payload: msg.payload });
      hubDataSet('lastOutboundType', msg.type);

      const out = {
        type: PREFIX + msg.type,
        payload: msg.payload,
        _from: 'page',
        _ts: Date.now()
      };

      if (this._extensionSource) {
        // 典型：event.source 指向可回复的窗口（如 iframe 父级）
        this._extensionSource.postMessage(out, '*');
      } else if (typeof window !== 'undefined') {
        // 扩展由 content 在同一 window 上 postMessage 投递时，event.source 常为空；
        // 必须仍向本 window 广播，content script 才能中继到侧栏事件中心。
        window.postMessage(out, '*');
      } else {
        const handlers = this._replyListeners[msg.type] || [];
        handlers.forEach(h => {
          try { h(msg.payload); } catch (e) { console.error('[PostMessage] reply handler error:', e); }
        });
      }
    },

    /**
     * 网页端注册监听 Extension 发来的消息
     * 在 init() 之后调用
     *
     * @param {string} type - 消息类型，如 'spec:select'
     * @param {function} handler - (payload) => void
     */
    on(type, handler) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(handler);
    },

    /**
     * Extension 端注册监听网页端回复的消息
     *
     * @param {string} type - 消息类型，如 'elem:click'
     * @param {function} handler - (payload) => void
     */
    onReply(type, handler) {
      if (!this._replyListeners[type]) this._replyListeners[type] = [];
      this._replyListeners[type].push(handler);
    },

    /**
     * 移除监听器
     * @param {string} type
     * @param {function} [handler] - 不传则移除该类型所有监听器
     */
    off(type, handler) {
      if (!handler) {
        delete this._listeners[type];
        delete this._replyListeners[type];
        return;
      }
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(h => h !== handler);
      }
      if (this._replyListeners[type]) {
        this._replyListeners[type] = this._replyListeners[type].filter(h => h !== handler);
      }
    },

    /**
     * 发送并等待回复（Request/Response 模式）
     *
     * @param {string} type
     * @param {object} payload
     * @param {number} [timeout=5000]
     * @returns {Promise}
     */
    request(type, payload, timeout = 5000) {
      const msgId = this._genId();
      this.send(type, payload, msgId);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          delete this._pendingReplies[msgId];
          reject(new Error(`PostMessage request timeout: ${type}`));
        }, timeout);

        this._pendingReplies[msgId] = {
          resolve: (data) => { clearTimeout(timer); resolve(data); },
          reject: (err) => { clearTimeout(timer); reject(err); }
        };
      });
    },

    // ── 内部方法 ──

    _onMessage(event) {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;

      // 过滤前缀
      if (!msg.type.startsWith(PREFIX)) return;

      const type = msg.type.slice(PREFIX.length);
      const data = msg.payload;

      // reply() 向本 window 广播的回包（供 content 中继），勿当作 extension 下行再派发
      if (msg._from === 'page') {
        return;
      }

      hubEmit('extension:inbound', { type: type, payload: data, raw: msg });
      hubDataSet('lastInboundType', type);

      // 记录 Extension source（用于 reply）
      if (msg._from === 'extension' && event.source) {
        this._extensionSource = event.source;
      }

      // 派发给对应监听器
      const handlers = this._listeners[type] || [];
      handlers.forEach(handler => {
        try {
          handler(data, {
            type,
            source: event.source,
            origin: event.origin,
            msgId: msg._msgId,
            reply: (payload) => this.reply({ type, payload })
          });
        } catch (e) {
          console.error(`[PostMessage] Handler error for "${type}":`, e);
        }
      });

      // 处理等待回复的 Promise
      if (msg._msgId && this._pendingReplies[msg._msgId]) {
        const pending = this._pendingReplies[msg._msgId];
        delete this._pendingReplies[msg._msgId];
        pending.resolve(data);
      }
    },

    _genId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    // ── 工具方法 ──

    /**
     * 模拟 Extension 向网页发送一系列消息（用于 onboard 演示）
     * @param {Array} sequence - [{type, payload, delay(ms)}]
     * @returns {function} - 返回 stop 函数
     */
    playSequence(sequence) {
      let i = 0;
      let stopped = false;

      const tick = () => {
        if (stopped || i >= sequence.length) return;
        const item = sequence[i++];
        setTimeout(() => {
          if (stopped) return;
          this.send(item.type, item.payload);
          if (i < sequence.length) tick();
        }, item.delay || 0);
      };

      tick();
      return () => { stopped = true; };
    },

    /**
     * 清除所有监听器（测试用）
     */
    reset() {
      this._listeners = {};
      this._replyListeners = {};
      this._pendingReplies = {};
      this._extensionSource = null;
    },

    /**
     * 获取已注册的事件列表（调试用）
     */
    getRegisteredTypes() {
      return {
        inbound: Object.keys(this._listeners),
        outbound: Object.keys(this._replyListeners)
      };
    }
  };

  // 自动初始化
  if (typeof window !== 'undefined') {
    PostMessage.init();
  }

  // 导出：始终挂到传入的 global（浏览器即 window），供页面 / 注入脚本使用。
  // 打包器若同时提供 module.exports，也必须保留 global 挂载，否则 runtime 读不到 PostMessage。
  global.PostMessage = PostMessage;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PostMessage;
  }

})(typeof window !== 'undefined' ? window : global);
