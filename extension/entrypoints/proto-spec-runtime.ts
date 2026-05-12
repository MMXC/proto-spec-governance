/**
 * 注入到页面主世界的运行时（postMessage + runtime）。
 * 构建产物：/proto-spec-runtime.js — 须列入 web_accessible_resources，由 content script 通过 script[src] 加载，绕过 CSP 对 inline script 的限制。
 *
 * 必须使用静态 import（勿用 vite-ignore 的 dynamic import），否则打包后会变成对
 * chrome-extension://…/assets/*.js 的额外请求，既不存在也无法被页面加载。
 */
import '../../assets/postMessage.js';
import '../../assets/runtime.js';

export default defineUnlistedScript(() => {
  const w = window as Window & {
    PostMessage?: unknown;
    Runtime?: unknown;
    ProtoSpec?: { PostMessage?: unknown; Runtime?: unknown };
  };
  w.ProtoSpec = {
    PostMessage: w.PostMessage,
    Runtime: w.Runtime,
  };
});
