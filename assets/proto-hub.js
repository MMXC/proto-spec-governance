/**
 * proto-hub.js — 原型三中心最小内核（事件 / 数据 / 状态）
 *
 * - 与契约 assets/proto-spec.manifest.json 中 hub 段对齐；扩展注入时由 proto-spec-runtime 写入 __PROTO_SPEC_MANIFEST。
 * - 无依赖；可与任意静态页共存；未加载时不影响 postMessage / runtime。
 *
 * globalThis.ProtoSpecHub.create({ contract })
 * 返回 { events, data, state, destroy, contract }
 */

(function (global) {
  'use strict';

  function cloneJson(x) {
    if (x == null || typeof x !== 'object') return x;
    try {
      return JSON.parse(JSON.stringify(x));
    } catch (_e) {
      return Array.isArray(x) ? x.slice() : Object.assign({}, x);
    }
  }

  /**
   * @param {{ contract?: object }=} options
   */
  function createProtoHub(options) {
    options = options || {};
    const contract = options.contract || null;
    const hubCfg = (contract && contract.hub) || {};

    const dataStore = Object.assign({}, cloneJson(hubCfg.initialData) || {});
    let state = Object.assign({}, cloneJson(hubCfg.initialState) || {});

    /** @type {Map<string, function[]>} */
    const listeners = new Map();
    /** @type {Map<string, Set<function>>} */
    const keySubs = new Map();

    function on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return function unsubscribe() {
        off(name, fn);
      };
    }

    function off(name, fn) {
      if (!fn) {
        listeners.delete(name);
        return;
      }
      const arr = listeners.get(name);
      if (!arr) return;
      listeners.set(
        name,
        arr.filter(function (f) {
          return f !== fn;
        })
      );
    }

    function once(name, fn) {
      function wrap(payload) {
        off(name, wrap);
        fn(payload);
      }
      on(name, wrap);
    }

    function emit(name, payload) {
      const arr = listeners.get(name) || [];
      for (let i = 0; i < arr.length; i++) {
        try {
          arr[i](payload);
        } catch (e) {
          console.error('[ProtoSpecHub] listener "' + name + '":', e);
        }
      }
    }

    function dataGet(key) {
      return dataStore[key];
    }

    function dataSet(key, value) {
      dataStore[key] = value;
      emit('data:changed', { key: key, value: value, snapshot: cloneJson(dataStore) });
      const set = keySubs.get(key);
      if (set) {
        set.forEach(function (fn) {
          try {
            fn(value, dataStore);
          } catch (e) {
            console.error('[ProtoSpecHub] data subscriber "' + key + '":', e);
          }
        });
      }
    }

    function dataSubscribe(key, fn) {
      if (!keySubs.has(key)) keySubs.set(key, new Set());
      keySubs.get(key).add(fn);
      return function unsub() {
        const s = keySubs.get(key);
        if (s) s.delete(fn);
      };
    }

    function dataSnapshot() {
      return cloneJson(dataStore);
    }

    function stateGet() {
      return cloneJson(state);
    }

    function stateSet(patch) {
      if (!patch || typeof patch !== 'object') return;
      Object.assign(state, patch);
      emit('state:changed', stateGet());
    }

    function stateSubscribe(fn) {
      return on('state:changed', function () {
        fn(stateGet());
      });
    }

    function destroy() {
      listeners.clear();
      keySubs.clear();
      state = {};
      for (const k in dataStore) {
        if (Object.prototype.hasOwnProperty.call(dataStore, k)) delete dataStore[k];
      }
    }

    return {
      contract: contract,
      events: { on: on, off: off, emit: emit, once: once },
      data: { get: dataGet, set: dataSet, subscribe: dataSubscribe, snapshot: dataSnapshot },
      state: { get: stateGet, set: stateSet, subscribe: stateSubscribe },
      destroy: destroy
    };
  }

  global.ProtoSpecHub = {
    version: '1.0.0',
    create: createProtoHub
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
