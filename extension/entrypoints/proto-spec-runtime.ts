/**
 * 注入到页面主世界的运行时（postMessage + proto-hub + runtime + 契约 manifest）。
 * 构建产物：/proto-spec-runtime.js — 须列入 web_accessible_resources，由 content script 通过 script[src] 加载，绕过 CSP 对 inline script 的限制。
 *
 * 必须使用静态 import（勿用 vite-ignore 的 dynamic import），否则打包后会变成对
 * chrome-extension://…/assets/*.js 的额外请求，既不存在也无法被页面加载。
 *
 * 依赖顺序：postMessage → proto-hub → runtime；manifest 在 defineUnlistedScript main 中写入 window，
 * runtime 通过 queueMicrotask 延后 init，以便读到 __PROTO_SPEC_MANIFEST。
 */
import '../../assets/postMessage.js';
import '../../assets/proto-hub.js';
import manifest from '../../assets/proto-spec.manifest.json';
import '../../assets/runtime.js';

type ProtoSpecWindow = Window &
  typeof globalThis & {
    PostMessage?: unknown;
    Runtime?: unknown;
    ProtoSpecHub?: { version: string; create: (opts?: { contract?: object | null }) => unknown };
    __PROTO_SPEC_MANIFEST?: typeof manifest;
    ProtoSpec?: { PostMessage?: unknown; Runtime?: unknown; Hub?: unknown };
  };

export default defineUnlistedScript(() => {
  const w = window as ProtoSpecWindow;
  w.__PROTO_SPEC_MANIFEST = manifest;
  w.ProtoSpec = {
    PostMessage: w.PostMessage,
    Runtime: w.Runtime,
    Hub: w.ProtoSpecHub,
  };
});
