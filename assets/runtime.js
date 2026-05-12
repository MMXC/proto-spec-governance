/**
 * runtime.js — Proto Spec Governance: 插件 ↔ HTML 页面通信运行时
 *
 * 依赖: postMessage.js（必须先于本文件引入）
 *
 * 职责:
 * - 接收来自 Extension 插件的 postMessage 指令（spec:select, onboard:start 等）
 * - 在页面 DOM 上执行对应操作（高亮、标注、onboard 步骤等）
 * - 将页面事件上报给 Extension（elem:click, spec:bound 等）
 *
 * Extension → HTML 事件:
 *   spec:select       选中 Spec → 高亮对应元素
 *   spec:bind         绑定 Spec 到页面元素
 *   onboard:start     开启 onboard 展示模式
 *   onboard:step      前进/后退 onboard 步骤
 *   design:toggle     切换深/浅色主题
 *   layout:split      切换分屏布局
 *   elem:highlight    高亮指定元素
 *   annotation:show   显示/隐藏标注覆盖层
 *   annotation:clear  清除所有标注
 *
 * HTML → Extension 事件:
 *   elem:click        用户点击页面元素（上报 selector + rect）
 *   elem:hover        鼠标悬停页面元素
 *   spec:bound        Spec 绑定完成通知
 *   spec:unbound      Spec 解除绑定
 *   onboard:step_done 某个 onboard 步骤完成
 *   onboard:done      onboard 演示完成
 *   runtime:ready     runtime.js 加载完成，可接收指令
 *   runtime:error     运行时错误
 */

(function () {
  'use strict';

  if (typeof PostMessage === 'undefined') {
    console.error('[runtime] postMessage.js 未加载，请先引入 postMessage.js');
    return;
  }

  const Runtime = {
    // ── 状态 ──
    _activeSpec: null,
    _annotationsVisible: true,
    _theme: 'dark',
    _splitMode: '1-split',
    _onboardState: null,
    _elementMap: {},   // specName → element reference
    _highlightLayer: null,

    // ── 生命周期 ──

    /**
     * 初始化 runtime
     * 注册所有 Extension → HTML 事件监听
     */
    init() {
      // 注册 Extension → HTML 事件
      PostMessage.on('spec:select',      this._onSpecSelect.bind(this));
      PostMessage.on('spec:bind',        this._onSpecBind.bind(this));
      PostMessage.on('onboard:start',    this._onOnboardStart.bind(this));
      PostMessage.on('onboard:step',     this._onOnboardStep.bind(this));
      PostMessage.on('design:toggle',    this._onDesignToggle.bind(this));
      PostMessage.on('layout:split',     this._onLayoutSplit.bind(this));
      PostMessage.on('elem:highlight',   this._onElemHighlight.bind(this));
      PostMessage.on('annotation:show',  this._onAnnotationShow.bind(this));
      PostMessage.on('annotation:clear', this._onAnnotationClear.bind(this));

      // 初始化 DOM 监听（点击、悬停）
      this._initDOMListeners();

      // 创建高亮覆盖层
      this._createHighlightLayer();

      // 上报 runtime ready
      PostMessage.reply({
        type: 'runtime:ready',
        payload: {
          version: '1.0.0',
          pageURL: window.location.href,
          documentTitle: document.title,
          bodyChildren: document.body.children.length
        }
      });
    },

    // ── Extension → HTML 事件处理 ──

    _onSpecSelect({ specName, layer, selector }) {
      this._activeSpec = { specName, layer, selector };

      if (selector) {
        const el = document.querySelector(selector);
        if (el) {
          this._scrollIntoView(el);
          this._highlight(el, specName, layer);
        } else {
          console.warn(`[runtime] spec:select — selector "${selector}" 未找到`);
        }
      }

      this._dispatchEvent('spec-selected', { specName, layer, selector });
    },

    _onSpecBind({ specName, selector }) {
      if (!specName || !selector) return;

      const el = document.querySelector(selector);
      if (!el) {
        console.warn(`[runtime] spec:bind — selector "${selector}" 未找到`);
        return;
      }

      // 给元素添加 data-ps-spec 属性
      el.setAttribute('data-ps-spec', specName);

      // 记录映射
      this._elementMap[specName] = el;

      // 短暂高亮反馈
      this._flashHighlight(el, '#10b981', 600);

      // 上报绑定完成
      PostMessage.reply({
        type: 'spec:bound',
        payload: { specName, selector, timestamp: Date.now() }
      });

      this._dispatchEvent('spec-bound', { specName, selector });
    },

    _onOnboardStart({ specName, steps }) {
      // 清除之前的 onboard
      if (this._onboardState) {
        this._onboardState.stop();
      }

      const targetEl = this._elementMap[specName] || document.querySelector(`[data-ps-spec="${specName}"]`);

      this._onboardState = {
        specName,
        steps: steps || [],
        currentStep: 0,
        stepEls: [],
        stopRequested: false,
        interval: null,

        stop: () => {
          this.stopRequested = true;
          if (this.interval) clearInterval(this.interval);
          this._clearOnboardHighlights();
        }
      };

      // 高亮目标元素
      if (targetEl) {
        this._scrollIntoView(targetEl);
        targetEl.style.position = 'relative';
        const rect = targetEl.getBoundingClientRect();
        this._renderOnboardStep(targetEl, specName, 0, steps?.[0] || '步骤 1');
      }

      // 自动前进（每 2 秒一步）
      this._onboardState.interval = setInterval(() => {
        if (this._onboardState.stopRequested) {
          clearInterval(this._onboardState.interval);
          return;
        }

        const nextStep = this._onboardState.currentStep + 1;
        if (nextStep >= this._onboardState.steps.length) {
          clearInterval(this._onboardState.interval);

          // 演示完成
          PostMessage.reply({
            type: 'onboard:done',
            payload: {
              specName,
              stepsCompleted: this._onboardState.steps.length,
              duration: (Date.now() - this._startTime) / 1000 + 's'
            }
          });

          this._onboardState = null;
          return;
        }

        this._onboardState.currentStep = nextStep;
        const stepLabel = this._onboardState.steps[nextStep];

        PostMessage.reply({
          type: 'onboard:step_done',
          payload: { specName, step: nextStep, label: stepLabel }
        });

        // 简单闪烁反馈
        if (targetEl) {
          this._flashHighlight(targetEl, '#f59e0b', 300);
        }

      }, 2000);

      this._startTime = Date.now();
    },

    _onOnboardStep({ step }) {
      if (!this._onboardState) return;
      this._onboardState.currentStep = Math.max(0, Math.min(step, this._onboardState.steps.length - 1));
      // 即时跳转到指定步骤
      if (this._onboardState.interval) clearInterval(this._onboardState.interval);
      this._onboardState.interval = null;
    },

    _onDesignToggle({ theme }) {
      const validThemes = ['dark', 'light'];
      if (!validThemes.includes(theme)) {
        console.warn(`[runtime] design:toggle — 未知主题: ${theme}`);
        return;
      }
      this._theme = theme;
      document.documentElement.dataset.psTheme = theme;

      PostMessage.reply({
        type: 'design:toggled',
        payload: { theme, previousTheme: theme === 'dark' ? 'light' : 'dark' }
      });
    },

    _onLayoutSplit({ mode }) {
      const validModes = ['1-split', '2-split', '4-split'];
      if (!validModes.includes(mode)) {
        console.warn(`[runtime] layout:split — 未知模式: ${mode}`);
        return;
      }
      this._splitMode = mode;
      document.documentElement.dataset.psSplit = mode;

      PostMessage.reply({
        type: 'layout:splitted',
        payload: { mode }
      });
    },

    _onElemHighlight({ selector, color }) {
      if (!selector) return;
      const el = document.querySelector(selector);
      if (el) this._highlight(el, null, null, color);
    },

    _onAnnotationShow({ mode }) {
      const visible = mode === 'show';
      this._annotationsVisible = visible;

      document.querySelectorAll('[data-ps-annotation]').forEach(el => {
        el.style.display = visible ? '' : 'none';
      });

      // 同时显示/隐藏高亮层
      if (this._highlightLayer) {
        this._highlightLayer.style.display = visible ? '' : 'none';
      }
    },

    _onAnnotationClear() {
      this._clearAllHighlights();
      this._onboardState?.stop?.();
      this._onboardState = null;

      // 清除所有 data-ps-* 属性
      document.querySelectorAll('[data-ps-spec]').forEach(el => {
        el.removeAttribute('data-ps-spec');
      });
    },

    // ── DOM 事件监听 ──

    _initDOMListeners() {
      // 鼠标点击上报
      document.addEventListener('click', (e) => {
        const target = e.target;
        const selector = this._getSelector(target);
        const rect = target.getBoundingClientRect();
        const specName = target.getAttribute('data-ps-spec');

        PostMessage.reply({
          type: 'elem:click',
          payload: {
            selector,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              top: Math.round(rect.top),
              left: Math.round(rect.left)
            },
            specBound: specName || null,
            tagName: target.tagName.toLowerCase(),
            text: target.innerText?.slice(0, 50) || null
          }
        });
      }, { passive: true });

      // 鼠标悬停上报（节流）
      let hoverTimer = null;
      document.addEventListener('mouseover', (e) => {
        clearTimeout(hoverTimer);
        const target = e.target;
        hoverTimer = setTimeout(() => {
          const specName = target.getAttribute('data-ps-spec');
          if (specName) {
            PostMessage.reply({
              type: 'elem:hover',
              payload: { selector: this._getSelector(target), specBound: specName }
            });
          }
        }, 300);
      }, { passive: true });

      // 右键菜单
      document.addEventListener('contextmenu', (e) => {
        const target = e.target;
        const specName = target.getAttribute('data-ps-spec');
        if (specName) {
          PostMessage.reply({
            type: 'elem:contextmenu',
            payload: {
              selector: this._getSelector(target),
              specBound: specName,
              x: e.clientX,
              y: e.clientY
            }
          });
        }
      }, { passive: true });

      // 键盘快捷键（上报给 Extension）
      document.addEventListener('keydown', (e) => {
        const combo = [
          e.metaKey || e.ctrlKey ? '⌘' : '',
          e.shiftKey ? '⇧' : '',
          e.altKey ? '⌥' : '',
          e.key
        ].filter(Boolean).join('+');

        PostMessage.reply({
          type: 'page:keydown',
          payload: {
            key: e.key,
            combo,
            meta: e.metaKey,
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey
          }
        });
      }, { passive: true });

      // MutationObserver: 监听 DOM 变化，更新 elementMap
      this._observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            const spec = node.getAttribute?.('data-ps-spec');
            if (spec) this._elementMap[spec] = node;
          });
        });
      });
      this._observer.observe(document.body, { childList: true, subtree: true });
    },

    // ── 高亮与标注 ──

    _createHighlightLayer() {
      if (this._highlightLayer) return;

      this._highlightLayer = document.createElement('div');
      this._highlightLayer.id = 'ps-highlight-layer';
      this._highlightLayer.style.cssText = [
        'position:fixed', 'pointer-events:none', 'z-index:2147483646',
        'top:0', 'left:0', 'width:100%', 'height:100%',
        'overflow:hidden'
      ].join(';');
      document.body.appendChild(this._highlightLayer);
    },

    _highlight(el, specName, layer, color) {
      if (!el) return;

      this._clearHighlight();

      const rect = el.getBoundingClientRect();
      const accentColor = color || '#7170ff';

      // 创建高亮框
      const box = document.createElement('div');
      box.id = 'ps-highlight-box';
      box.style.cssText = [
        'position:absolute',
        `left:${rect.left + window.scrollX}px`,
        `top:${rect.top + window.scrollY}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        `border:2px solid ${accentColor}`,
        `box-shadow:0 0 0 4px ${accentColor}33, 0 8px 24px rgba(0,0,0,0.3)`,
        'border-radius:3px',
        'pointer-events:none',
        'transition:all 0.3s ease',
        'animation:ps-highlight-in 0.3s ease'
      ].join(';');

      // Spec 标签
      if (specName || layer) {
        const label = document.createElement('div');
        label.style.cssText = [
          'position:absolute',
          `top:${rect.top + window.scrollY - 24}px`,
          `left:${rect.left + window.scrollX}px`,
          `background:${accentColor}`,
          'color:#fff',
          'font-size:10px',
          'font-weight:600',
          'padding:2px 8px',
          'border-radius:3px 3px 0 0',
          'white-space:nowrap',
          'pointer-events:none',
          'font-family:system-ui,sans-serif'
        ].join(';');
        label.textContent = layer ? `${layer}-${specName}` : specName;
        this._highlightLayer.appendChild(label);
      }

      // 添加动画样式（如果还没有）
      if (!document.getElementById('ps-runtime-styles')) {
        const style = document.createElement('style');
        style.id = 'ps-runtime-styles';
        style.textContent = `
          @keyframes ps-highlight-in {
            from { opacity: 0; transform: scale(0.95); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes ps-highlight-pulse {
            0%,100% { box-shadow: 0 0 0 4px ${accentColor}33; }
            50%      { box-shadow: 0 0 0 8px ${accentColor}22; }
          }
        `;
        document.head.appendChild(style);
      }

      this._highlightLayer.appendChild(box);
    },

    _flashHighlight(el, color, duration) {
      if (!el) return;
      const originalOutline = el.style.outline;
      const originalTransition = el.style.transition;

      el.style.transition = `outline ${duration}ms ease`;
      el.style.outline = `3px solid ${color}`;
      el.style.outlineOffset = '2px';

      setTimeout(() => {
        el.style.outline = originalOutline;
        el.style.transition = originalTransition;
      }, duration);
    },

    _clearHighlight() {
      if (!this._highlightLayer) return;
      // 保留 highlight-layer，只清除 highlight-box 和标签
      const toRemove = ['ps-highlight-box', 'ps-spec-label'];
      toRemove.forEach(id => {
        this._highlightLayer.querySelectorAll('#' + id).forEach(el => el.remove());
      });
    },

    _clearAllHighlights() {
      if (this._highlightLayer) {
        this._highlightLayer.innerHTML = '';
      }
      document.querySelectorAll('[data-ps-highlight]').forEach(el => {
        el.removeAttribute('data-ps-highlight');
      });
    },

    _clearOnboardHighlights() {
      document.querySelectorAll('[data-ps-onboard-step]').forEach(el => {
        el.style.position = '';
        el.style.zIndex = '';
        el.removeAttribute('data-ps-onboard-step');
      });
    },

    _renderOnboardStep(el, specName, stepIndex, stepLabel) {
      el.setAttribute('data-ps-onboard-step', stepIndex);
      el.style.position = 'relative';

      // 移除旧的 step 标签
      document.querySelectorAll('.ps-onboard-step-label').forEach(l => l.remove());

      const rect = el.getBoundingClientRect();
      const label = document.createElement('div');
      label.className = 'ps-onboard-step-label';
      label.style.cssText = [
        'position:fixed',
        `left:${rect.left + rect.width / 2}px`,
        `top:${rect.bottom + window.scrollY + 8}px`,
        `transform:translateX(-50%)`,
        `background:#f59e0b`,
        'color:#000',
        'font-size:11px',
        'font-weight:600',
        'padding:4px 12px',
        'border-radius:4px',
        'pointer-events:none',
        'white-space:nowrap',
        'font-family:system-ui,sans-serif',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
        'z-index:2147483647',
        'animation:ps-step-in 0.3s ease'
      ].join(';');

      label.innerHTML = `<span style="opacity:0.5;font-weight:400">${stepIndex + 1}.</span> ${stepLabel}`;

      if (!document.getElementById('ps-runtime-styles')) {
        const s = document.createElement('style');
        s.id = 'ps-runtime-styles';
        s.textContent = `@keyframes ps-step-in { from { opacity:0; transform:translateX(-50%) translateY(-4px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
        document.head.appendChild(s);
      }

      document.body.appendChild(label);
    },

    // ── 工具方法 ──

    _getSelector(el) {
      if (!el || !el.tagName) return null;

      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const classes = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).filter(Boolean).join('.')
        : '';

      // 优先用 data-ps-spec
      const spec = el.getAttribute?.('data-ps-spec');
      if (spec) return `[data-ps-spec="${spec}"]`;

      // 回退：构建选择器
      return `${tag}${id}${classes}` || tag;
    },

    _scrollIntoView(el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    _dispatchEvent(name, detail) {
      window.dispatchEvent(new CustomEvent('ps-' + name, { detail }));
    },

    // ── 公开 API ──

    /**
     * 手动高亮元素
     * @param {string|Element} selectorOrEl
     * @param {string} [specName]
     * @param {string} [layer]
     */
    highlight(selectorOrEl, specName, layer) {
      const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
      if (el) this._highlight(el, specName, layer);
    },

    /**
     * 手动上报元素点击
     * @param {string|Element} selectorOrEl
     */
    click(selectorOrEl) {
      const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
      if (!el) return;
      el.click();
    },

    /**
     * 销毁 runtime，清理所有副作用
     */
    destroy() {
      this._observer?.disconnect();
      this._highlightLayer?.remove();
      document.querySelectorAll('.ps-onboard-step-label, #ps-runtime-styles').forEach(el => el.remove());
      PostMessage.off('spec:select');
      PostMessage.off('spec:bind');
      PostMessage.off('onboard:start');
      PostMessage.off('onboard:step');
      PostMessage.off('design:toggle');
      PostMessage.off('layout:split');
      PostMessage.off('elem:highlight');
      PostMessage.off('annotation:show');
      PostMessage.off('annotation:clear');
    }
  };

  // 自动初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Runtime.init());
  } else {
    Runtime.init();
  }

  // 导出
  window.Runtime = Runtime;

})();
