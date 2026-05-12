// html-parser.ts — Proto Spec HTML 解析器
// 运行在 Content Script 内，解析 DOM → Spec 树（page/region/component 三层）

export type SpecType = 'P' | 'C' | 'B' | 'S';
export type OverlayType = 'modal' | 'drawer' | 'tooltip' | 'dropdown' | 'none';

export interface SpecNode {
  id: string;
  name: string;
  type: SpecType;
  layer: string;
  children: SpecNode[];
  // 组件特有
  selector?: string;
  overlay?: string;           // 关联的 P-overlay 名称
  overlayType?: OverlayType;
  // 样式推断
  inferredStyles?: {
    tag: string;
    classCount: number;
    hasInteraction: boolean;
  };
}

export interface ParsedSpec {
  url: string;
  title: string;
  generatedAt: string;
  layers: {
    pages: SpecNode[];
    overlays: SpecNode[];  // P-overlay 集合
  };
}

// ── 语义标签 → 类型映射 ────────────────────────────────────
const SEMANTIC_TAG_MAP: Record<string, SpecType> = {
  header: 'C', nav: 'C', aside: 'C', footer: 'C',
  main: 'P', section: 'P', article: 'P',
  button: 'B', a: 'B', input: 'B', textarea: 'B', select: 'B', form: 'B',
  img: 'S', svg: 'S', span: 'S', i: 'S', em: 'S', strong: 'S',
  div: 'C', p: 'S', h1: 'S', h2: 'S', h3: 'S', h4: 'S', h5: 'S', h6: 'S',
  ul: 'C', ol: 'C', li: 'C', table: 'C', tr: 'C', td: 'C', th: 'C',
};

// 交互标签
const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'textarea', 'select', 'form', 'details', 'summary']);

// 是否为交互元素
function hasInteraction(el: Element): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName.toLowerCase())) return true;
  const hasClick =
    el.getAttribute('onclick') !== null ||
    el.getAttribute('data-toggle') !== null ||
    el.querySelector('button, a, input, [role="button"], [aria-pressed]') !== null;
  return hasClick;
}

// 是否为可见文本元素
function isVisibleText(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'meta', 'link', 'noscript', 'template'].includes(tag)) return false;
  const display = window.getComputedStyle(el).display;
  if (display === 'none' || display === 'none') return false;
  return true;
}

// 生成唯一 ID
let _idCounter = 0;
function genId(): string {
  return 'n' + (++_idCounter);
}

// 推断组件类型
function inferType(el: Element, children: SpecNode[]): SpecType {
  // 显式交互 → B
  if (hasInteraction(el)) return 'B';

  // 有 B 类型子节点 → C
  if (children.some(c => c.type === 'B')) return 'C';

  // 多个子节点 → C
  if (children.length > 1) return 'C';

  // 单子节点跟随子节点类型
  if (children.length === 1) return children[0].type;

  // 默认：语义标签映射
  return SEMANTIC_TAG_MAP[el.tagName.toLowerCase()] ?? 'S';
}

// 推断 overlay 类型
function inferOverlayType(el: Element): OverlayType {
  const role = el.getAttribute('role') ?? '';
  const className = (el.className ?? '').toLowerCase();
  const id = (el.id ?? '').toLowerCase();

  if (/modal|dialog|popup/.test(className + id + role)) return 'modal';
  if (/drawer|sidebar|panel/.test(className + id + role)) return 'drawer';
  if (/tooltip/.test(className + id + role)) return 'tooltip';
  if (/dropdown|select-menu|combobox/.test(className + id + role)) return 'dropdown';
  return 'none';
}

// 是否为 overlay 触发元素（点击后出现 modal/drawer/tooltip）
function isOverlayTrigger(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') ?? '';
  if (tag === 'button' || role === 'button') return true;
  if (el.getAttribute('data-toggle') || el.getAttribute('aria-haspopup')) return true;
  return false;
}

// 检测是否为 overlay 容器
function isOverlayContainer(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const className = (el.className ?? '').toLowerCase();
  const id = (el.id ?? '').toLowerCase();
  const role = el.getAttribute('role') ?? '';

  // dialog/alertdialog 语义标签
  if (tag === 'dialog') return true;
  if (role === 'dialog' || role === 'alertdialog') return true;
  if (/modal|dialog|popup|overlay/.test(className + id)) return true;
  // details/summary 原生折叠
  if (tag === 'details') return true;
  return false;
}

// ── 主解析函数 ─────────────────────────────────────────────
export function parseHTMLSpecTree(root: Document | Element = document): ParsedSpec {
  _idCounter = 0;
  const url = root instanceof Document ? root.location.href : (root as Element)?.ownerDocument?.location?.href ?? '';
  const title = root instanceof Document ? root.title : (root as Element)?.ownerDocument?.title ?? '';

  // 第一遍：收集 overlay 容器（modal/drawer 等提前标记）
  const overlayContainers = new Map<string, Element>();
  function collectOverlays(el: Element) {
    if (isOverlayContainer(el)) {
      const name = inferOverlayName(el);
      overlayContainers.set(name, el);
    }
    for (const child of Array.from(el.children)) {
      collectOverlays(child);
    }
  }
  collectOverlays(root instanceof Document ? root.body ?? root.documentElement : root);

  // 第二遍：解析主体结构
  const body = root instanceof Document ? (root.body ?? root.documentElement) : root;
  const pageNode = parseElement(body, 0);

  // 提取 overlay 节点
  const overlays = extractOverlays(pageNode);

  return {
    url,
    title,
    generatedAt: new Date().toISOString(),
    layers: { pages: [pageNode], overlays },
  };
}

function inferOverlayName(el: Element): string {
  const className = (el.className ?? '') as string;
  const id = (el.id ?? '') as string;
  // 优先用 class/id 推断名称
  const match = /(?:modal|dialog|popup|drawer|sidebar|panel|overlay|tooltip)[-_]?(\w+)/i.exec(className + id);
  if (match) return match[1].toLowerCase();
  return el.tagName.toLowerCase() + '-' + genId();
}

function extractOverlays(node: SpecNode): SpecNode[] {
  const overlays: SpecNode[] = [];
  const overlayChildren: SpecNode[] = [];

  for (const child of node.children) {
    if (child.overlayType && child.overlayType !== 'none') {
      const overlayNode: SpecNode = {
        id: genId(),
        name: child.overlay ?? child.name + '-overlay',
        type: 'P',
        layer: 'L2',
        children: extractDescendantsAsOverlay(child),
        overlayType: child.overlayType,
      };
      overlays.push(overlayNode);
    } else {
      const sub = extractOverlays(child);
      if (sub.length > 0) overlays.push(...sub);
      overlayChildren.push(child);
    }
  }
  node.children = overlayChildren;
  return overlays;
}

function extractDescendantsAsOverlay(node: SpecNode): SpecNode[] {
  // overlay 容器内的内容全部提取为 overlay 的子节点
  return node.children;
}

// ── 核心递归解析 ───────────────────────────────────────────
function parseElement(el: Element, depth: number): SpecNode {
  const tag = el.tagName.toLowerCase();
  const id = el.id || '';
  const className = (el.className ?? '') as string;
  const classes = className.trim().split(/\s+/).filter(Boolean);

  // 跳过不可见元素
  if (!isVisibleText(el)) {
    const pseudoChildren = parseChildren(el, depth);
    return {
      id: genId(),
      name: tag + '-hidden',
      type: 'S',
      layer: 'L4',
      children: pseudoChildren,
    };
  }

  // 直接子元素递归
  const children = parseChildren(el, depth + 1);

  // 推断类型
  let type = inferType(el, children);
  let overlayType: OverlayType = 'none';
  let overlay: string | undefined;

  // 检测是否为 overlay 容器
  if (isOverlayContainer(el)) {
    type = 'P';
    overlayType = inferOverlayType(el);
  }

  // 检测是否应为 overlay 触发（按钮/链接），查找是否有关联的 overlay
  if (isOverlayTrigger(el)) {
    // 查找同级的后续 overlay 容器
    const nextSibling = el.nextElementSibling;
    if (nextSibling && isOverlayContainer(nextSibling)) {
      overlay = inferOverlayName(nextSibling);
      overlayType = inferOverlayType(nextSibling);
    }
  }

  // 推断名称
  const name = inferNodeName(tag, id, classes, el);

  // 组件复杂度提层检测
  const shouldUplift = detectComplexityUplift(el, children, type);
  if (shouldUplift && type === 'C') {
    type = 'P';
  }

  return {
    id: genId(),
    name,
    type,
    layer: depth === 0 ? 'L2' : depth === 1 ? 'L3' : 'L4',
    children,
    selector: buildSelector(el),
    overlay,
    overlayType,
    inferredStyles: {
      tag,
      classCount: classes.length,
      hasInteraction: hasInteraction(el),
    },
  };
}

function parseChildren(el: Element, depth: number): SpecNode[] {
  const result: SpecNode[] = [];
  const seen = new Map<string, number>(); // name → count

  for (const child of Array.from(el.children)) {
    const node = parseElement(child, depth);
    // 合并同名的连续子节点
    if (node.type === 'S' && node.children.length === 0) {
      // 纯文本/空元素，跳过
      if (node.inferredStyles?.tag === 'script') continue;
      if (node.inferredStyles?.tag === 'style') continue;
    }

    // 合并相邻同类型同名节点（如多个 li）
    const last = result[result.length - 1];
    if (last && last.name === node.name && last.type === node.type) {
      last.children.push(...node.children);
      continue;
    }

    result.push(node);
  }

  return result;
}

function inferNodeName(tag: string, id: string, classes: string[], el: Element): string {
  // 1. id 优先
  if (id) return kebabCase(id);

  // 2. class 中的语义词
  const semantic = classes.find(c =>
    /^(nav|header|footer|sidebar|main|content|hero|banner|card|modal|drawer|form|list|menu|item|btn|icon|logo|search|input|field|label|title|text|img|avatar|tag|badge|chip|tooltip)/i.test(c)
  );
  if (semantic) return kebabCase(semantic);

  // 3. 第一个有意义的 class
  if (classes.length > 0) return kebabCase(classes[0]);

  // 4. 语义标签名
  if (tag === 'main' || tag === 'header' || tag === 'footer' || tag === 'nav') {
    return tag;
  }

  // 5. 生成序号名
  return tag;
}

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const classes = ((el.className ?? '') as string)
    .trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (classes.length > 0) {
    return `${tag}.${classes.join('.')}`;
  }
  return tag;
}

function detectComplexityUplift(el: Element, children: SpecNode[], type: SpecType): boolean {
  if (type !== 'C') return false;

  // 触发条件：多个状态 / 嵌套过深 / 事件处理
  const stateAttr = el.getAttribute('data-state') ||
    el.getAttribute('aria-selected') ||
    el.hasAttribute('aria-expanded');
  if (stateAttr) return true;

  // 嵌套深度 > 3
  const maxDepth = (nodes: SpecNode[], d: number): number => {
    if (nodes.length === 0) return d;
    return Math.max(...nodes.map(n => maxDepth(n.children, d + 1)));
  };
  if (maxDepth(children, 0) > 3) return true;

  // 有事件监听属性
  const eventAttrs = ['onclick', 'onchange', 'oninput', 'onsubmit', 'ontoggle'];
  if (eventAttrs.some(a => el.hasAttribute(a))) return true;

  // 组件数量 > 5
  if (children.filter(c => c.type === 'B').length > 5) return true;

  return false;
}

// ── 增量 diff ──────────────────────────────────────────────
export interface DiffResult {
  added: SpecNode[];
  removed: { name: string; selector: string }[];
  modified: { name: string; before: SpecNode; after: SpecNode }[];
}

let _lastSpec: ParsedSpec | null = null;

export function parseAndDiff(root: Document | Element = document): { spec: ParsedSpec; diff: DiffResult } {
  const current = parseHTMLSpecTree(root);
  const diff = _lastSpec ? computeDiff(_lastSpec, current) : { added: current.layers.pages, removed: [], modified: [] };
  _lastSpec = current;
  return { spec: current, diff };
}

export function computeDiff(before: ParsedSpec, after: ParsedSpec): DiffResult {
  const added: SpecNode[] = [];
  const removed: { name: string; selector: string }[] = [];
  const modified: { name: string; before: SpecNode; after: SpecNode }[] = [];

  const beforeNodes = flatNodes(before.layers.pages);
  const afterNodes = flatNodes(after.layers.pages);

  const beforeNames = new Set(beforeNodes.map(n => n.name));
  const afterNames = new Set(afterNodes.map(n => n.name));

  // 新增
  for (const node of afterNodes) {
    if (!beforeNames.has(node.name)) added.push(node);
  }

  // 删除
  for (const node of beforeNodes) {
    if (!afterNames.has(node.name)) removed.push({ name: node.name, selector: node.selector ?? '' });
  }

  return { added, removed, modified };
}

function flatNodes(nodes: SpecNode[]): SpecNode[] {
  const result: SpecNode[] = [];
  function walk(n: SpecNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}
