# Layer 2 — 核心交互层：插件界面详细规划

> 更新：2025-05-12
> 原则：每个面板独立定义输入/输出/状态

---

## 面板体系（5 个面板）

```
┌──────────────────────────────────────────────────────────┐
│                    插件侧边面板（Side Panel）               │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  DOM 树  │  │ 属性面板 │  │ A2UI 对话 │  │ Spec 预览│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
│  Tab 切换                                                │
└──────────────────────────────────────────────────────────┘
```

**独立面板（5 个）：**
1. **DOM 树面板** — 页面结构浏览与导航
2. **属性面板** — 选中节点的 style / attributes / events 编辑
3. **A2UI 对话面板** — 对话标注 + 点击推荐
4. **Spec 预览面板** — 实时预览导出的分层 Spec
5. **设置面板** — Agent 配置 / 模板选择 / 导出格式

**共享状态（跨面板）：**
- `$selectedNode` — 当前选中的 DOM 节点
- `$annotationMap` — 区域标注映射（nodeId → label）
- `$specDraft` — 正在生成的 Spec 草稿

---

## Panel 1 — DOM 树面板（DOM Tree Panel）

### 输入
- content-script 发送的页面 DOM 结构（序列化后的 JSON）

### 功能
- 树形展示（可折叠/展开）
- 节点高亮（对应 `$selectedNode` + `$annotationMap`）
- 节点搜索/筛选
- 点击节点 → 选中 + 同步到属性面板

### 输出
- `onNodeSelect(nodeId)` → 更新 `$selectedNode`
- `onNodeHover(nodeId)` → 页面元素高亮（content-script）

### 任务拆分

```
task-L2-CORE-1-DOMTREE
├── task-L2-CORE-1-DOMTREE-1   DOM 树读取
│   定义：content-script → panel 通信协议
│   输出：
│       ├── content-script: serializePageDOM() → JSON
│       ├── panel: receiveDOMTree(json)
│       └── 树结构：{id, tag, children, attributes, xpath}
│
├── task-L2-CORE-1-DOMTREE-2   DOM 树 UI
│   定义：Svelte/React 树形组件
│   输出：
│       ├── 折叠/展开
│       ├── 节点图标（tag 类型区分：div/button/input/img等）
│       ├── 标注高亮（不同颜色表示不同标注）
│       ├── 搜索框（按 tag/class/id 筛选）
│       └── 滚动同步（选中节点滚动到可见）
│
└── task-L2-CORE-1-DOMTREE-3   节点交互
    定义：选中/悬浮/右键菜单
    输出：
        ├── onClick → 更新 $selectedNode → 属性面板响应
        ├── onHover → content-script 高亮元素
        └── 右键菜单（复制 xpath / 复制 selector / 隐藏元素）
```

---

## Panel 2 — 属性面板（Properties Panel）

### 输入
- `$selectedNode`（跨面板共享状态）

### 功能
- **Style Tab**：可视化编辑 CSS 属性（color picker / font-size / padding 等）
- **Attributes Tab**：编辑 HTML 属性（id/class/data-* / 自定义属性）
- **Events Tab**：查看/编辑事件绑定（onclick / onchange 等）

### 输出
- `onPropertyChange(nodeId, property, value)` → content-script 修改 DOM
- 实时预览（页面 DOM 同步变化）

### 任务拆分

```
task-L2-CORE-1-PROP
├── task-L2-CORE-1-PROP-1   属性面板框架
│   定义：Tab 切换 + $selectedNode 响应
│   输出：
│       ├── Style / Attributes / Events 三 Tab
│       ├── 选中节点为空时显示"请先选择节点"
│       └── 节点切换时清空/重载属性
│
├── task-L2-CORE-1-PROP-2   Style 可视化编辑
│   定义：常用 CSS 属性可视化控件
│   输出：
│       ├── 颜色选择器（color picker）
│       ├── 数字输入 + 单位（px/em/rem/%）
│       ├── 布局属性（display / flex / grid）
│       ├── 边距/内边距（box model 可视化）
│       └── 字体属性（font-size / font-weight / font-family）
│
├── task-L2-CORE-1-PROP-3   Attributes 编辑
│   定义：HTML 属性直接编辑
│   输出：
│       ├── id / class 输入框
│       ├── data-* 属性列表
│       ├── 自定义属性添加/删除
│       └── class 输入（多 class，tag-it 样式）
│
└── task-L2-CORE-1-PROP-4   Events 查看/编辑
    定义：事件绑定查看 + 简单事件添加
    输出：
        ├── 现有事件列表（onclick / oninput 等）
        ├── 简单事件处理器模板生成
        └── 事件 → A2UI 标注联动
```

---

## Panel 3 — A2UI 对话面板

### 输入
- `$selectedNode`（当前选中节点）
- `$annotationMap`（已标注区域）
- LLM API（意图识别/推荐生成）

### 功能
- **对话区**：输入对话 → LLM 分析 → 自动标注区域
- **推荐区**：点击原型页面 → LLM 生成提示词 → 展示推荐
- **标注区**：展示当前页面的所有标注（节点 → 描述）

### 输出
- `onAnnotation(nodeId, label)` → 更新 `$annotationMap` → DOM 树高亮
- `onSuggest(nodeId)` → LLM 生成推荐 → 展示在输入框上方

### 任务拆分

```
task-L2-CORE-2-A2UI
├── task-L2-CORE-2-A2UI-1   对话 → 区域标注
│   定义：用户输入 → LLM 分析意图 → 关联 HTML 区域 → 标注
│   输入：
│       ├── 用户对话文本
│       ├── $selectedNode（当前选中节点，可选）
│       └── DOM 上下文（可被 LLM 用于理解结构）
│   输出：
│       ├── LLM 调用（prompt 构造）
│       ├── 标注结果解析（nodeId + label）
│       ├── $annotationMap 更新
│       └── DOM 树对应节点高亮
│   待冻结：LLM prompt 模板
│
├── task-L2-CORE-2-A2UI-2   点击 → 推荐提示
│   定义：用户点击页面 → 识别元素 → LLM 生成提示词 → 展示
│   输入：
│       ├── 用户点击事件（content-script 捕获）
│       ├── 点击元素的 DOM 信息（tag / class / text）
│       └── 页面当前状态（$annotationMap）
│   输出：
│       ├── LLM 调用（推荐 prompt 生成）
│       ├── 推荐结果展示（在对话输入框上方）
│       └── 一键发送推荐到对话区
│
├── task-L2-CORE-2-A2UI-3   标注管理
│   定义：标注列表查看/编辑/删除
│   输入：$annotationMap
│   输出：
│       ├── 标注列表（节点 → 描述）
│       ├── 编辑标注描述
│       ├── 删除标注
│       └── 标注 → Spec 片段关联（后续 Layer 4 联动）
│
└── task-L2-CORE-2-A2UI-4   对话历史
    定义：当前会话的对话记录
    输入：对话消息列表
    输出：
        ├── 对话消息展示（用户/AI 消息）
        ├── 消息 → 标注关联
        └── 对话历史持久化（→ Layer 1-INFRA-2）
```

---

## Panel 4 — Spec 预览面板

### 输入
- `$specDraft`（Agent 生成的 Spec 草稿，流式）
- Layer 4 的导出数据

### 功能
- 实时预览正在生成的 Spec
- 分层导航（总体 / 页面 / 组件 / 行为）
- 预览 vs 已导出版本 diff

### 任务拆分

```
task-L2-CORE-2-SPEC
├── task-L2-CORE-2-SPEC-1   Spec 流式预览
│   定义：Agent SSE 流 → 实时解析 → 预览面板更新
│   输入：Agent SSE stream（data: {"type": "spec_chunk", ...}）
│   输出：
│       ├── SSE 解析器
│       ├── 预览面板实时更新
│       └── 加载状态（streaming indicator）
│
└── task-L2-CORE-2-SPEC-2   分层导航
    定义：总体 / 页面 / 组件 / 行为 四级导航
    输入：$specDraft（完整 Spec 对象）
    输出：
        ├── 层级树形导航
        ├── 当前层级内容展示
        └── 跳转编辑（点击节点 → 跳转对应 HTML 元素）
```

---

## Panel 5 — 设置面板

### 输入
- 用户配置

### 功能
- Agent 启动配置（本地路径 / 模型选择）
- 导出格式默认选择（YAML / MD / JSON）
- Design.md 模板选择（vercel / stripe / linear / 自定义）
- 快捷键配置

### 任务拆分

```
task-L2-CORE-2-SETTINGS
├── task-L2-CORE-2-SETTINGS-1   Agent 配置
│   定义：本地 Agent 路径 / 模型 / API Key
│   输出：
│       ├── Agent 路径输入
│       ├── 模型选择（gpt-4 / claude / 本地模型）
│       ├── API Key 输入（敏感信息本地存储）
│       └── 连接测试按钮
│
└── task-L2-CORE-2-SETTINGS-2   导出/模板配置
    定义：默认格式 + Design.md 模板
    输出：
        ├── 默认导出格式（radio: YAML / MD+frontmatter / JSON）
        ├── Design.md 模板选择（列表 + 预览）
        └── 自定义模板上传
```

---

## Layer 2 任务结构（更新）

```
task-L2-CORE-1   DOM 编辑
├── task-L2-CORE-1-DOMTREE
│   ├── task-L2-CORE-1-DOMTREE-1   DOM 树读取（content-script → panel）
│   ├── task-L2-CORE-1-DOMTREE-2   DOM 树 UI（折叠/展开/高亮/搜索）
│   └── task-L2-CORE-1-DOMTREE-3   节点交互（选中/悬浮/右键菜单）
│
├── task-L2-CORE-1-PROP
│   ├── task-L2-CORE-1-PROP-1   属性面板框架（Tab 切换）
│   ├── task-L2-CORE-1-PROP-2   Style 可视化编辑
│   ├── task-L2-CORE-1-PROP-3   Attributes 编辑
│   └── task-L2-CORE-1-PROP-4   Events 查看/编辑
│
└── task-L2-CORE-1-UNDO   撤销/重做（跨面板共享）
    定义：操作历史栈 + Ctrl+Z / Ctrl+Y
    输出：
        ├── 操作快照（DOM state diff）
        ├── 撤销栈 / 重做栈
        ├── 快捷键绑定
        └── 面板 UI 反馈（undo/redo 按钮）

task-L2-CORE-2   A2UI 感知
├── task-L2-CORE-2-A2UI
│   ├── task-L2-CORE-2-A2UI-1   对话 → 区域标注
│   ├── task-L2-CORE-2-A2UI-2   点击 → 推荐提示
│   ├── task-L2-CORE-2-A2UI-3   标注管理
│   └── task-L2-CORE-2-A2UI-4   对话历史
│
└── task-L2-CORE-2-SPEC
    ├── task-L2-CORE-2-SPEC-1   Spec 流式预览
    └── task-L2-CORE-2-SPEC-2   分层导航

task-L2-CORE-3   设置面板
├── task-L2-CORE-3-SETTINGS-1   Agent 配置
└── task-L2-CORE-3-SETTINGS-2   导出/模板配置
```

**Layer 2 子任务总数：14 个**

---

# Layer 1 — 基础设施层详细规划

> 职责：插件脚手架 + 本地持久化
> 原则：每层独立定义输入/输出/边界协议

## Layer 1 任务结构

```
task-L1-INFRA      Layer 1：基础设施层
├── task-L1-INFRA-1   浏览器插件脚手架
│   ├── task-L1-INFRA-1-BASE     基础工程结构
│   ├── task-L1-INFRA-1-CS       content-script 基础设施
│   ├── task-L1-INFRA-1-BG       background service worker
│   ├── task-L1-INFRA-1-POPUP    popup 入口
│   └── task-L1-INFRA-1-DEV      开发/调试工具
│
└── task-L1-INFRA-2   本地持久化
    ├── task-L1-INFRA-2-SCHEMA   数据库 schema 设计
    ├── task-L1-INFRA-2-CRUD     原型 CRUD 操作
    ├── task-L1-INFRA-2-SNAP     DOM 快照序列化
    └── task-L1-INFRA-2-SYNC     状态同步（内存 ↔ IndexedDB）
```

---

## task-L1-INFRA-1 — 浏览器插件脚手架

### 目标
Chrome + Firefox 共享同一套 core 代码，Manifest V3，使用 wxt 或 Plasmo 框架。

### 共享代码 vs 平台差异

| 模块 | 共享 | Chrome | Firefox |
|------|------|--------|---------|
| content-script | ✅ | manifest.json | manifest.json（browser_specific_settings） |
| background | ✅ | service_worker | background（script） |
| popup | ✅ | browser_action | browser_action |
| devtools | ✅ | devtools_page | 相同 |

### task-L1-INFRA-1-BASE — 基础工程结构

**定义：** 项目初始化 + 框架选择 + 构建工具链

**输出：**
```
src/
├── manifest.chrome.json   ← Chrome Manifest V3 配置
├── manifest.firefox.json  ← Firefox Manifest V3 配置（browser_specific_settings）
├── background/
│   └── index.ts           ← background service worker（通信中枢）
├── content-script/
│   ├── index.ts           ← 注入脚本（content script）
│   └── dom-serializer.ts  ← DOM 序列化工具
├── panel/                 ← 侧边面板（React/Svelte）
│   ├── App.tsx
│   ├── panels/
│   └── shared/             ← 跨面板共享状态
├── popup/                  ← 插件 popup
│   └── index.tsx
└── shared/
    ├── types/              ← TypeScript 类型定义（shared between CS/panel/BG）
    └── utils/
```

**验收：**
- [ ] wxt/plasmo 项目初始化完成
- [ ] Chrome dev mode 可运行
- [ ] Firefox dev mode 可运行
- [ ] TypeScript 无编译错误

---

## task-L1-INFRA-1-CS — content-script 基础设施

**定义：** content-script 生命周期 + 与 panel/background 的通信

**输入：** 目标页面 DOM

**输出：**

### 通信协议（content-script ↔ panel）

content-script 无法直接访问 panel，采用 **chrome.runtime.sendMessage** / **tabMessaging**：

```
content-script                      panel（via background relay）
     │                                     │
     │  chrome.runtime.sendMessage({        │
     │    type: "DOM_READY",               │
     │    tabId: xxx                       │
     │  })  ─────────────────────────────► │
     │                                     │
     │                      ◄────────────── │
     │  panel: chrome.runtime.sendMessage({ │
     │    type: "NODE_SELECT",             │
     │    nodeId: "xxx"                    │
     │  })                                  │
     │                                     │
     │  onNodeHighlight(nodeId) → 页面高亮  │
     │  onDOMEdit(edit) → 修改 DOM          │
```

### 生命周期

| 事件 | 行为 |
|------|------|
| 页面加载完成 | `document.addEventListener('DOMContentLoaded')` → 初始化 |
| 页面 DOM 变化 | MutationObserver 监听 → 通知 panel |
| panel 选中节点 | 页面元素高亮（border + outline） |
| panel 修改 DOM | 直接调用 DOM API → MutationObserver 捕获 |

**验收：**
- [ ] content-script 正确注入目标页面
- [ ] DOM_READY 消息能发送到 background
- [ ] panel 能通过 background 转发选中节点到 content-script
- [ ] content-script 能高亮页面元素
- [ ] MutationObserver 能捕获 DOM 变化并通知 panel

---

## task-L1-INFRA-1-BG — background service worker

**定义：** background 作为 relay + 进程管理 + 全局状态

**输出：**

### 职责

```
┌─────────────────────────────────────────────────────┐
│              background service worker                │
│                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────┐ │
│  │ panel ←→ CS │   │ Agent 进程   │   │ 存储    │ │
│  │  消息转发   │   │  管理        │   │ 代理    │ │
│  └─────────────┘   └──────────────┘   └─────────┘ │
│                                                     │
│  ┌─────────────┐   ┌──────────────┐               │
│  │ tab 管理    │   │ 快捷键注册   │               │
│  │             │   │              │               │
│  └─────────────┘   └──────────────┘               │
└─────────────────────────────────────────────────────┘
```

**通信路由：**
- panel ↔ content-script：通过 background 中转
- panel ↔ background：chrome.runtime.sendMessage（直接）
- background ↔ Agent 子进程：stdio（独立进程）

**验收：**
- [ ] panel ↔ content-script 消息转发正常
- [ ] background 持久化全局状态（Agent 连接状态等）
- [ ] 快捷键注册（Ctrl+Shift+P 打开面板）

---

## task-L1-INFRA-1-POPUP — popup 入口

**定义：** 点击插件图标弹出的 popup（可选，快速入口）

**输出：**
```
popup/
└── index.tsx
    ├── 最近项目列表
    ├── 新建原型按钮
    ├── 打开现有 HTML 文件
    └── 设置快捷入口
```

**验收：**
- [ ] popup 能打开侧边面板
- [ ] 能新建原型（blank HTML）
- [ ] 能选择本地 HTML 文件打开

---

## task-L1-INFRA-1-DEV — 开发/调试工具

**定义：** 热重载 + Chrome DevTools + 调试日志

**输出：**
```
├── vite.config.ts          ← 构建配置（wxt 内置）
├── scripts/
│   ├── watch.sh           ← 监听文件变化 → 自动重载
│   └── package-extension.sh ← 打包发布脚本
├── src/shared/utils/
│   └── logger.ts          ← 统一日志（console + background console）
└── README.md              ← 开发指南
```

**验收：**
- [ ] 文件修改后自动热重载
- [ ] content-script 日志能在 background console 查看
- [ ] 打包脚本能生成 .crx / .xpi

---

## task-L1-INFRA-2 — 本地持久化

### 目标
原型数据 + DOM快照 + 对话历史 + Spec片段 → IndexedDB 持久化

### 数据库设计

```
IndexedDB: "proto-spec-governance"
│
├── ObjectStore: "prototypes"
│   ├── id (primary key)
│   ├── name
│   ├── htmlContent (原始 HTML 字符串）
│   ├── createdAt
│   ├── updatedAt
│   └── metadata (宽高/主题等)
│
├── ObjectStore: "domSnapshots"
│   ├── id (primary key)
│   ├── prototypeId (index)
│   ├── timestamp
│   ├── serializedDOM (DOM 树 JSON）
│   └── diff (与上一版本的 diff）
│
├── ObjectStore: "conversations"
│   ├── id (primary key)
│   ├── prototypeId (index)
│   ├── messages (对话消息数组）
│   │   └── { role: "user"/"ai", content, timestamp, annotations[] }
│   └── updatedAt
│
├── ObjectStore: "annotations"
│   ├── id (primary key)
│   ├── prototypeId (index)
│   ├── nodeId (CSS selector)
│   ├── label
│   ├── conversationId (index)
│   └── createdAt
│
└── ObjectStore: "specs"
    ├── id (primary key)
    ├── prototypeId (index)
    ├── type ("overall"/"page"/"component"/"behavior")
    ├── content (YAML/MD 字符串)
    ├── version
    └── createdAt
```

---

## task-L1-INFRA-2-SCHEMA — 数据库 schema 设计

**定义：** IndexedDB schema 定义 + 索引配置

**输出：**
- `src/shared/db/schema.ts` — 数据库初始化 + 版本迁移
- `src/shared/db/migrations/` — 迁移脚本

**验收：**
- [ ] 数据库初始化成功
- [ ] 索引配置正确（prototypeId, conversationId 等）
- [ ] 版本迁移机制（下次升级时 schema 变更）

---

## task-L1-INFRA-2-CRUD — 原型 CRUD 操作

**定义：** 原型 + 对话 + 标注 + Spec 的增删改查

**输出：**
```
src/shared/db/
├── prototype.ts    ← create/read/update/delete/list
├── snapshot.ts     ← DOM 快照相关
├── conversation.ts ← 对话历史
├── annotation.ts   ← 标注
└── spec.ts         ← Spec 存储
```

**验收：**
- [ ] 新建原型 → IndexedDB 有记录
- [ ] 打开原型 → 数据完整加载
- [ ] 删除原型 → 关联数据一并清理
- [ ] 列表查询 → 分页 + 搜索

---

## task-L1-INFRA-2-SNAP — DOM 快照序列化

**定义：** DOM 树 → JSON 序列化 + 反序列化

**输出：**
```
src/content-script/dom-serializer.ts
    ├── serialize(node) → SerializedNode
    ├── deserialize(json) → Node
    └── computeDiff(oldSnap, newSnap) → DOMDiff
```

**序列化结构：**
```typescript
interface SerializedNode {
  id: string;           // 唯一 ID（用于后续引用）
  tag: string;          // div / button / input ...
  xpath: string;        // /html/body/div[1]/div[2]
  cssSelector: string;  // #root > .container > .nav
  attributes: Record<string, string>;
  styles?: Record<string, string>;  // 内联样式
  children: SerializedNode[];
  textContent?: string;
  boundingRect?: { x, y, width, height };  // 坐标（用于点击推荐）
}
```

**验收：**
- [ ] 页面 DOM 能序列化为 JSON
- [ ] JSON 能反序列化为 DOM（可渲染）
- [ ] diff 计算正确（只返回变化的节点）
- [ ] 序列化的 JSON 可存储到 IndexedDB

---

## task-L1-INFRA-2-SYNC — 状态同步

**定义：** 内存状态 ↔ IndexedDB 实时同步

**输出：**
```
src/panel/shared/stores/
├── prototypeStore.ts   ← 原型状态（内存 ↔ IndexedDB 双向同步）
├── domSnapshotStore.ts ← DOM 快照状态
├── conversationStore.ts← 对话状态
├── annotationStore.ts  ← 标注状态
└── specDraftStore.ts   ← Spec 草稿状态
```

**同步策略：**
- 读取：内存优先 → 内存为空 → 从 IndexedDB 加载
- 写入：内存变更 → 防抖（300ms）→ 异步写入 IndexedDB
- 冲突：IndexedDB 版本更新 → 内存状态合并

**验收：**
- [ ] 页面刷新后 IndexedDB 数据完整恢复
- [ ] 对话历史实时保存（打字后 300ms 内落盘）
- [ ] 异常退出后数据不丢失

---

**Layer 1 子任务总数：14 个**

---

# Layer 3 — Agent 层详细规划

> 职责：本地 Agent 集成 + 通信协议 + 指令执行
> 原则：Extension 作为 Agent 的"哑终端"，Agent 驱动所有智能行为

## Layer 3 任务结构

```
task-L3-AGENT      Layer 3：Agent 层
├── task-L3-AGENT-1   通信协议
│   ├── task-L3-AGENT-1-SPAWN    进程管理
│   ├── task-L3-AGENT-1-RPC      JSON-RPC 请求/响应
│   ├── task-L3-AGENT-1-STREAM   SSE 流解析
│   └── task-L3-AGENT-1-MULTI    多 Agent 模式（本地+远程）
│
├── task-L3-AGENT-2   Agent 指令集（方法签名）
│   ├── task-L3-AGENT-2-SCHEMA   指令 Schema 定义
│   └── task-L3-AGENT-2-IMPL     Extension 侧调用封装
│
└── task-L3-AGENT-3   Agent 执行引擎
    ├── task-L3-AGENT-3-STUB      Go Agent stub 实现
    ├── task-L3-AGENT-3-TEMPLATE Design.md 模板加载
    └── task-L3-AGENT-3-PIPELINE Spec 生成流水线
```

---

## task-L3-AGENT-1 — 通信协议

### 总体架构

```
┌──────────────────────────────────────────────────────┐
│                  Extension（TypeScript）               │
│                                                      │
│  ┌──────────────┐    ┌──────────────┐              │
│  │  AgentBridge │────│  EventBus    │              │
│  │  (单例)      │    │  (panel 订阅) │              │
│  └──────┬───────┘    └──────────────┘              │
│         │                                             │
│  ┌──────▼───────┐                                   │
│  │ ProcessManager│ ←→ stdio ←→ Agent 子进程          │
│  └──────────────┘                                   │
└──────────────────────────────────────────────────────┘
```

---

## task-L3-AGENT-1-SPAWN — 进程管理

**定义：** Agent 子进程的启动/停止/健康检查/重连

**输出：**

### 启动流程

```
用户点击"启动 Agent"
    ↓
检查 Agent 可执行文件是否存在
    ↓
ProcessManager.spawn([
  "path/to/nanoClaudeCode",
  "--mode", "stdio",
  "--workspace", workspaceDir,
  "--design-md-ref", "path/to/design-md-templates"
])
    ↓
等待 Agent 输出 "READY\n"（就绪信号）
    ↓
AgentBridge 进入可用状态
```

### 进程生命周期

| 事件 | 行为 |
|------|------|
| Agent 正常退出 | 通知 panel，提示"Agent 已停止" |
| Agent 崩溃 | 自动重启（最多 3 次），每次等待 2s |
| Agent 无响应（10s 无消息） | ping/pong 检测，超时则重连 |
| Extension 卸载 | 清理 Agent 进程 |

**验收：**
- [ ] Agent 能启动，输出 READY 信号
- [ ] Extension 崩溃后 Agent 进程被清理
- [ ] Agent 崩溃后自动重连（最多 3 次）
- [ ] 进程 ID 可追踪，日志可见

---

## task-L3-AGENT-1-RPC — JSON-RPC 请求/响应

**定义：** Extension ↔ Agent 的请求-响应模式

**协议：**

### 请求格式

```typescript
// Extension → Agent
interface AgentRequest {
  jsonrpc: "2.0";
  id: string;           // UUID，用于匹配响应
  method: string;       // 方法名
  params: object;       // 参数
}

// Agent → Extension（响应）
interface AgentResponse {
  jsonrpc: "2.0";
  id: string;           // 匹配请求 ID
  result?: object;      // 成功结果
  error?: {             // 错误
    code: number;
    message: string;
  };
}
```

### 请求队列管理

- 每个请求带 UUID id
- 响应按 id 匹配
- 请求超时：30s（可配置）
- 超时后重试：最多 2 次

**验收：**
- [ ] 发送请求后能收到对应响应
- [ ] id 不匹配时正确报错
- [ ] 超时能触发重试
- [ ] 并发请求能正确路由

---

## task-L3-AGENT-1-STREAM — SSE 流解析

**定义：** Agent 主动推送（不是响应）→ 流式事件

**协议：**

```
// Agent → Extension（主动推送，非响应）
data: {"type": "dom_change", "node": "div#id", "action": "modified", "snapshot": "..."}
data: {"type": "spec_chunk", "section": "typography", "content": "..."}
data: {"type": "a2ui.suggestion", "region": "#btn-submit", "hint": "这个按钮需要处理什么事件？"}
data: {"type": "progress", "step": 2, "total": 5, "message": "正在分析 DOM 结构..."}
```

### 事件类型

| type | 说明 | panel 响应 |
|------|------|------------|
| `dom_change` | Agent 修改了 DOM | 更新 DOM 树 + 实时预览 |
| `spec_chunk` | Spec 生成片段 | 更新 Spec 预览面板 |
| `a2ui.suggestion` | 推荐提示 | 展示在 A2UI 对话面板 |
| `progress` | 进度更新 | 展示 loading indicator |
| `error` | 错误 | toast 通知 |

**验收：**
- [ ] SSE 行能正确解析
- [ ] `data:` 前缀能正确剥离
- [ ] 多行 JSON 能正确组装（某些事件可能跨行）
- [ ] 空行不触发事件
- [ ] EventBus 能正确分发到各个 panel

---

## task-L3-AGENT-1-MULTI — 多 Agent 模式

**定义：** 本地 Agent + 远程 Agent 并存，Extension 自动选择

**架构：**

```
┌────────────────────────────────────────────────────┐
│                   AgentRouter                       │
│                                                    │
│  mode: "local"  ───► 本地 Agent（stdio）           │
│  mode: "remote" ───► 远程 Agent（fetch）           │
│  mode: "hybrid" ───► 本地做 DOM 编辑，远程做智能增强│
└────────────────────────────────────────────────────┘
```

**远程模式（后续，Phase 2）：**
- Extension fetch → 远程 SSE endpoint
- 同一套 JSON-RPC 方法签名
- 认证：Bearer token

**验收：**
- [ ] 本地模式正常
- [ ] 远程模式切换不改变 JSON-RPC 调用方式
- [ ] hybrid 模式能正确分流（DOM 编辑 → 本地，智能增强 → 远程）

---

## task-L3-AGENT-2 — Agent 指令集

### 核心原则

**指令由 Agent 定义，Extension 作为调用方。**
Extension 不知道如何做，只负责传递指令和展示结果。

---

## task-L3-AGENT-2-SCHEMA — 指令 Schema 定义

**定义：** JSON-RPC 方法的全集（需冻结）

### 方法列表（v1）

```typescript
// DOM 操作
interface DomEditParams {
  node: string;         // CSS selector
  op: "setAttribute" | "removeAttribute" | "setStyle" | 
      "setInnerHTML" | "insertBefore" | "remove" | "move";
  key?: string;
  value?: string;
  options?: object;     // 操作特定参数
}

interface DomQueryParams {
  selector: string;     // CSS selector
  includeStyles?: boolean;
  includeEvents?: boolean;
}

// A2UI 操作
interface A2UIAnnotateParams {
  region: string;        // CSS selector
  label: string;
  conversationId?: string;
}

interface A2UISuggestParams {
  region: string;
  context: string;       // 当前对话上下文
}

// Spec 操作
interface SpecExportParams {
  format: "yaml" | "md" | "json";
  path?: string;         // 导出路径（可选，默认下载）
  options?: {
    includeDesignMd?: boolean;
    template?: string;    // Design.md 模板名
  };
}

interface SpecSchemaGetParams {
  type: "overall" | "page" | "component" | "behavior";
}

interface DesignMdTemplateParams {
  name: string;          // vercel / stripe / linear 等
}

// 原型操作
interface PrototypeNewParams {
  template?: "blank" | "minimal" | string;  // 模板名或 Design.md 名
}

interface PrototypeLoadParams {
  path: string;          // HTML 文件路径
}
```

### 待冻结（Open Issue）

- [ ] `op` 参数的操作类型是否完整
- [ ] 返回值结构是否明确
- [ ] 错误码规范

**验收：**
- [ ] 方法签名文档完整
- [ ] TypeScript 类型定义可用
- [ ] Open Issue 全部冻结

---

## task-L3-AGENT-2-IMPL — Extension 侧调用封装

**定义：** Extension 调用 Agent 的封装层

**输出：**

```typescript
// src/background/agent-bridge.ts
class AgentBridge {
  async dom.edit(params: DomEditParams): Promise<DomEditResult>
  async dom.query(params: DomQueryParams): Promise<DomQueryResult>
  async a2ui.annotate(params: A2UIAnnotateParams): Promise<void>
  async a2ui.suggest(params: A2UISuggestParams): Promise<A2UISuggestResult>
  async spec.export(params: SpecExportParams): Promise<SpecExportResult>
  async spec.schema.get(params: SpecSchemaGetParams): Promise<SpecSchemaResult>
  async design.md.template(params: DesignMdTemplateParams): Promise<string>
  async prototype.new(params: PrototypeNewParams): Promise<PrototypeNewResult>
  async prototype.load(params: PrototypeLoadParams): Promise<PrototypeLoadResult>
  
  // 流式事件订阅
  on(event: "dom_change", handler: (data) => void): void
  on(event: "spec_chunk", handler: (data) => void): void
  on(event: "a2ui.suggestion", handler: (data) => void): void
  on(event: "progress", handler: (data) => void): void
  on(event: "error", handler: (data) => void): void
  
  // 生命周期
  start(): Promise<void>
  stop(): void
  getStatus(): "idle" | "busy" | "error" | "offline"
}
```

**验收：**
- [ ] AgentBridge 单例正确
- [ ] 所有方法能正确序列化/发送
- [ ] 响应能正确解析/返回
- [ ] 流式事件能正确分发到 EventBus

---

## task-L3-AGENT-3 — Agent 执行引擎

### 总体原则

**Go Agent（nanoClaudeCode）是智能核心。**
Extension 只负责：
1. 启动/停止 Agent
2. 转发 DOM 上下文
3. 展示 Agent 输出

Agent 负责：
1. 理解用户意图
2. 决定如何修改 DOM
3. 生成 Spec
4. 做 A2UI 感知

---

## task-L3-AGENT-3-STUB — Go Agent stub 实现

**定义：** MVP 阶段，Go Agent stub 支持基本的 stdio 通信

**目标：** 不依赖完整的 nanoClaudeCode，先跑通通信链路

**输出：**
```
go/
├── agent/
│   ├── main.go          ← Agent 入口
│   ├── stdio.go         ← stdio 通信处理
│   ├── rpc/
│   │   ├── handler.go   ← JSON-RPC 方法路由
│   │   └── types.go     ← 请求/响应类型
│   └── handlers/
│       ├── dom.go       ← dom.* 方法实现
│       ├── spec.go      ← spec.* 方法实现
│       ├── a2ui.go      ← a2ui.* 方法实现
│       └── prototype.go ← prototype.* 方法实现
```

**stub 实现说明：**
- `dom.edit`：直接调用 Go DOM 库修改 HTML 字符串
- `spec.export`：返回硬编码的 Spec 模板（验证格式正确即可）
- `a2ui.annotate`：记录标注，返回 success
- `a2ui.suggest`：返回硬编码的推荐（验证流式输出正常）
- `prototype.new`：生成空白 HTML
- `prototype.load`：读取 HTML 文件

**验收：**
- [ ] Agent 启动后输出 READY
- [ ] JSON-RPC 请求能正确处理
- [ ] SSE 流能正确输出
- [ ] Extension 能正确解析

---

## task-L3-AGENT-3-TEMPLATE — Design.md 模板加载

**定义：** Agent 加载 awesome-design-md-cn 模板，用于 Spec 生成时的风格参考

**输出：**
```
go/agent/templates/
├── vercel.yaml
├── stripe.yaml
├── linear.yaml
├── figma.yaml
└── minimax.yaml
```

**Agent 使用方式：**
1. 用户在设置面板选择 Design.md 模板（vercel/stripe/linear 等）
2. Extension 调用 `design.md.template({ name: "vercel" })`
3. Agent 加载对应模板 → 注入到 Spec 生成 prompt

**验收：**
- [ ] 模板文件能被 Agent 正确读取
- [ ] 模板内容能被注入到 Spec 生成流程
- [ ] 支持自定义模板上传

---

## task-L3-AGENT-3-PIPELINE — Spec 生成流水线

**定义：** DOM 上下文 + Design.md 模板 + 用户对话 → 分层 Spec

**流程：**

```
用户对话 + DOM 上下文 + Design.md 模板
    ↓
Agent LLM 调用（prompt 组装）
    ↓
流式输出（SSE spec_chunk 事件）
    ↓
Extension 解析 → 更新 $specDraft
    ↓
Spec 预览面板实时展示
    ↓
用户确认 → 导出到本地文件
```

**Prompt 组装（Agent 内部）：**

```
SYSTEM:
你是一个 HTML 原型分析 Agent。根据用户对话和 HTML 结构，生成符合以下 Schema 的分层 Spec。

Design.md 参考风格：{selectedTemplate}

DOM 结构：
{serializedDOM}

对话历史：
{conversationHistory}

当前对话：{userInput}

输出格式：按照 Layer 4 Spec Schema 定义的结构输出。
```

**验收：**
- [ ] Spec 能流式生成并实时展示
- [ ] Spec 结构符合 Layer 4 Schema
- [ ] Design.md 风格被正确应用
- [ ] 导出格式正确（YAML / MD+frontmatter）

---

**Layer 3 子任务总数：11 个**

---

# 完整任务结构总览

```
task-000  MVP Phase 1（根任务）
│
├── task-L1-INFRA      Layer 1：基础设施层
│   ├── task-L1-INFRA-1   浏览器插件脚手架
│   │   ├── task-L1-INFRA-1-BASE     基础工程结构
│   │   ├── task-L1-INFRA-1-CS       content-script 基础设施
│   │   ├── task-L1-INFRA-1-BG       background service worker
│   │   ├── task-L1-INFRA-1-POPUP    popup 入口
│   │   └── task-L1-INFRA-1-DEV      开发/调试工具
│   │
│   └── task-L1-INFRA-2   本地持久化
│       ├── task-L1-INFRA-2-SCHEMA   数据库 schema 设计
│       ├── task-L1-INFRA-2-CRUD     原型 CRUD 操作
│       ├── task-L1-INFRA-2-SNAP     DOM 快照序列化
│       └── task-L1-INFRA-2-SYNC     状态同步（内存 ↔ IndexedDB）
│
├── task-L2-CORE       Layer 2：核心交互层
│   ├── task-L2-CORE-1   DOM 编辑
│   │   ├── task-L2-CORE-1-DOMTREE-1   DOM 树读取
│   │   ├── task-L2-CORE-1-DOMTREE-2   DOM 树 UI
│   │   ├── task-L2-CORE-1-DOMTREE-3   节点交互
│   │   ├── task-L2-CORE-1-PROP-1   属性面板框架
│   │   ├── task-L2-CORE-1-PROP-2   Style 可视化编辑
│   │   ├── task-L2-CORE-1-PROP-3   Attributes 编辑
│   │   ├── task-L2-CORE-1-PROP-4   Events 查看/编辑
│   │   └── task-L2-CORE-1-UNDO     撤销/重做
│   │
│   ├── task-L2-CORE-2   A2UI 感知
│   │   ├── task-L2-CORE-2-A2UI-1   对话 → 区域标注
│   │   ├── task-L2-CORE-2-A2UI-2   点击 → 推荐提示
│   │   ├── task-L2-CORE-2-A2UI-3   标注管理
│   │   ├── task-L2-CORE-2-A2UI-4   对话历史
│   │   ├── task-L2-CORE-2-SPEC-1   Spec 流式预览
│   │   └── task-L2-CORE-2-SPEC-2   分层导航
│   │
│   └── task-L2-CORE-3   设置面板
│       ├── task-L2-CORE-3-SETTINGS-1   Agent 配置
│       └── task-L2-CORE-3-SETTINGS-2   导出/模板配置
│
├── task-L3-AGENT      Layer 3：Agent 层
│   ├── task-L3-AGENT-1   通信协议
│   │   ├── task-L3-AGENT-1-SPAWN    进程管理
│   │   ├── task-L3-AGENT-1-RPC      JSON-RPC 请求/响应
│   │   ├── task-L3-AGENT-1-STREAM   SSE 流解析
│   │   └── task-L3-AGENT-1-MULTI    多 Agent 模式
│   │
│   ├── task-L3-AGENT-2   Agent 指令集
│   │   ├── task-L3-AGENT-2-SCHEMA   指令 Schema 定义
│   │   └── task-L3-AGENT-2-IMPL     Extension 侧调用封装
│   │
│   └── task-L3-AGENT-3   Agent 执行引擎
│       ├── task-L3-AGENT-3-STUB      Go Agent stub 实现
│       ├── task-L3-AGENT-3-TEMPLATE  Design.md 模板加载
│       └── task-L3-AGENT-3-PIPELINE  Spec 生成流水线
│
├── task-L4-OUTPUT     Layer 4：输出层（保持原结构）
│   ├── task-L4-OUTPUT-1   Spec Schema 定义
│   ├── task-L4-OUTPUT-2   分层 Spec 生成
│   └── task-L4-OUTPUT-3   文件落盘
│
└── task-INT-MVP       端到端联调
```

---

# Layer T — 测试层（Test Layer）

> 职责：每层的单元测试 + 集成测试
> 原则：测试驱动（TDD），每层完成后即有测试覆盖

## Layer T 任务结构

```
task-TEST         测试层
├── task-TEST-L1    Layer 1 基础设施测试
│   ├── task-TEST-L1-INFRA-1    插件脚手架测试
│   └── task-TEST-L1-INFRA-2    持久化测试
│
├── task-TEST-L2    Layer 2 核心交互测试
│   ├── task-TEST-L2-CORE-1    DOM 编辑测试
│   ├── task-TEST-L2-CORE-2    A2UI 感知测试
│   └── task-TEST-L2-CORE-3    设置面板测试
│
├── task-TEST-L3    Layer 3 Agent 测试
│   ├── task-TEST-L3-AGENT-1    通信协议测试
│   ├── task-TEST-L3-AGENT-2    指令集测试
│   └── task-TEST-L3-AGENT-3    执行引擎测试
│
├── task-TEST-L4    Layer 4 输出测试
│   ├── task-TEST-L4-OUTPUT-1   Schema 测试
│   ├── task-TEST-L4-OUTPUT-2   导出格式测试
│   └── task-TEST-L4-OUTPUT-3   文件落盘测试
│
└── task-TEST-INT    集成测试
    ├── task-TEST-INT-E2E   端到端 E2E 测试
    └── task-TEST-INT-PERF  性能测试
```

---

## task-TEST-L1-INFRA-1 — 插件脚手架测试

**测试对象：**
- content-script 注入逻辑
- background service worker 消息转发
- popup 功能

**测试内容：**
```
src/
├── __tests__/
│   ├── content-script/
│   │   ├── dom-serializer.test.ts    ← DOM 序列化/反序列化
│   │   ├── message-relay.test.ts      ← 消息发送/接收
│   │   └── mutation-observer.test.ts   ← MutationObserver 行为
│   ├── background/
│   │   ├── message-router.test.ts     ← 消息路由逻辑
│   │   └── agent-process.test.ts       ← 进程启动/停止（mock）
│   └── popup/
│       └── popup-interactions.test.ts  ← popup 点击行为
└── mocks/
    └── chrome-api.mock.ts             ← Chrome API mock
```

**验收：**
- [ ] DOM 序列化：`<div id="test">hello</div>` → 正确 JSON
- [ ] 消息转发：panel → background → content-script 链路
- [ ] MutationObserver：DOM 变化能触发回调

---

## task-TEST-L1-INFRA-2 — 持久化测试

**测试对象：**
- IndexedDB CRUD 操作
- 状态同步逻辑
- 快照序列化/反序列化

**测试内容：**
```
src/shared/db/
├── __tests__/
│   ├── prototype.test.ts       ← 创建/读取/更新/删除原型
│   ├── snapshot.test.ts        ← 快照存储/恢复
│   ├── conversation.test.ts    ← 对话历史 CRUD
│   ├── annotation.test.ts      ← 标注 CRUD
│   └── spec-storage.test.ts   ← Spec 存储/版本
│
├── __tests__/sync/
│   ├── memory-to-idb.test.ts   ← 内存变更 → IndexedDB
│   ├── idb-to-memory.test.ts   ← IndexedDB → 内存恢复
│   └── conflict-merge.test.ts   ← 冲突合并策略
│
└── __tests__/serialization/
    ├── serialize.test.ts        ← DOM → JSON
    ├── deserialize.test.ts      ← JSON → DOM
    └── diff.test.ts            ← diff 计算
```

**验收：**
- [ ] IndexedDB 操作：所有 CRUD 成功
- [ ] 快照：序列化 → 存储 → 恢复 → DOM 一致
- [ ] 同步：内存变更 300ms 内落盘

---

## task-TEST-L2-CORE-1 — DOM 编辑测试

**测试对象：**
- DOM 树 UI 组件
- 属性面板组件
- 撤销/重做逻辑

**测试内容：**
```
src/panel/
├── panels/
│   ├── dom-tree/
│   │   ├── __tests__/
│   │   │   ├── tree-render.test.tsx     ← 树形渲染
│   │   │   ├── node-expand.test.tsx      ← 折叠/展开
│   │   │   ├── node-highlight.test.tsx   ← 高亮状态
│   │   │   ├── search-filter.test.tsx     ← 搜索筛选
│   │   │   └── node-context-menu.test.tsx← 右键菜单
│   │   └── __mocks__/
│   │       └── selectedNode.mock.ts
│   │
│   └── properties/
│       ├── __tests__/
│       │   ├── tab-switch.test.tsx       ← Tab 切换
│       │   ├── style-editor.test.tsx     ← Style 编辑
│       │   ├── attr-editor.test.tsx      ← Attributes 编辑
│       │   ├── events-list.test.tsx      ← Events 列表
│       │   └── color-picker.test.tsx      ← 颜色选择器
│       └── __mocks__/
│           └── selectedNode.mock.ts
│
└── shared/
    └── __tests__/
        └── undo-manager.test.ts          ← 撤销/重做栈
```

**验收：**
- [ ] DOM 树：正确渲染嵌套结构
- [ ] 属性面板：选中节点时正确显示属性
- [ ] 撤销/重做：Ctrl+Z / Ctrl+Y 正确回退/前进

---

## task-TEST-L2-CORE-2 — A2UI 感知测试

**测试对象：**
- A2UI 对话交互
- Spec 预览
- 设置面板

**测试内容：**
```
src/panel/
├── panels/
│   ├── a2ui/
│   │   ├── __tests__/
│   │   │   ├── conversation-flow.test.tsx     ← 对话 → 标注流程
│   │   │   ├── click-suggest.test.tsx         ← 点击 → 推荐流程
│   │   │   ├── annotation-list.test.tsx       ← 标注列表
│   │   │   ├── history-display.test.tsx       ← 对话历史
│   │   │   └── llm-prompt-builder.test.ts    ← prompt 构造
│   │   └── __mocks__/
│   │       └── llm-api.mock.ts
│   │
│   ├── spec-preview/
│   │   ├── __tests__/
│   │   │   ├── streaming-render.test.tsx   ← 流式渲染
│   │   │   ├── layer-nav.test.tsx         ← 分层导航
│   │   │   └── diff-view.test.tsx         ← diff 展示
│   │   └── __mocks__/
│   │       └── sse-stream.mock.ts
│   │
│   └── settings/
│       └── __tests__/
│           ├── agent-config.test.tsx       ← Agent 配置
│           ├── template-select.test.tsx     ← 模板选择
│           └── export-format.test.tsx      ← 导出格式
```

**验收：**
- [ ] 对话 → 标注：输入对话 → 正确调用 LLM → 正确解析标注
- [ ] 点击 → 推荐：点击区域 → 正确构造 context → 推荐展示
- [ ] Spec 流式预览：SSE 事件 → 实时渲染

---

## task-TEST-L3-AGENT-1 — 通信协议测试

**测试对象：**
- 进程管理
- JSON-RPC 序列化/反序列化
- SSE 流解析

**测试内容：**
```
src/background/
├── __tests__/
│   ├── agent-bridge/
│   │   ├── __tests__/
│   │   │   ├── process-spawn.test.ts       ← 进程启动
│   │   │   ├── process-restart.test.ts     ← 崩溃重启
│   │   │   ├── process-cleanup.test.ts     ← 进程清理
│   │   │   └── ready-signal.test.ts        ← READY 信号检测
│   │   └── __mocks__/
│   │       ├── child-process.mock.ts
│   │       └── agent-output.mock.ts
│   │
│   ├── json-rpc/
│   │   ├── __tests__/
│   │   │   ├── request-serialize.test.ts   ← 请求序列化
│   │   │   ├── response-parse.test.ts     ← 响应解析
│   │   │   ├── request-queue.test.ts      ← 请求队列
│   │   │   ├── timeout-retry.test.ts       ← 超时重试
│   │   │   └── id-match.test.ts            ← id 匹配
│   │   └── __fixtures__/
│   │       └── rpc-requests.json
│   │
│   └── sse-parser/
│       ├── __tests__/
│       │   ├── line-parse.test.ts          ← 单行解析
│       │   ├── multiline-assemble.test.ts   ← 多行组装
│       │   ├── event-dispatch.test.ts       ← 事件分发
│       │   └── empty-line.test.ts           ← 空行处理
│       └── __fixtures__/
│           └── sse-streams.txt
```

**验收：**
- [ ] 进程：启动 → READY → 崩溃 → 重启 → 最多 3 次
- [ ] JSON-RPC：发送请求 → 收到响应 → id 匹配
- [ ] SSE：`data: {...}\n\n` → 正确解析 → 事件分发

---

## task-TEST-L3-AGENT-2 — 指令集测试

**测试对象：**
- JSON-RPC 方法签名
- Extension 调用封装

**测试内容：**
```
src/background/
├── agent-bridge/
│   └── __tests__/
│       ├── dom-methods.test.ts     ← dom.edit / dom.query
│       ├── a2ui-methods.test.ts    ← a2ui.annotate / a2ui.suggest
│       ├── spec-methods.test.ts    ← spec.export / spec.schema.get
│       ├── design-methods.test.ts   ← design.md.template
│       ├── proto-methods.test.ts   ← prototype.new / prototype.load
│       └── event-subscription.test.ts ← on() 事件订阅
```

**验收：**
- [ ] 每个方法：调用 → 正确序列化 → 发送 → 正确解析响应
- [ ] 事件订阅：on('dom_change') → 正确分发

---

## task-TEST-L3-AGENT-3 — 执行引擎测试

**测试对象：**
- Go Agent stub
- Design.md 模板加载
- Spec 生成流水线

**测试内容：**
```
go/agent/
├── __tests__/
│   ├── stdio_test.go               ← stdio 通信
│   ├── rpc/
│   │   ├── handler_test.go         ← 方法路由
│   │   └── types_test.go          ← 类型序列化
│   ├── handlers/
│   │   ├── dom_test.go            ← dom.* 处理
│   │   ├── spec_test.go           ← spec.* 处理
│   │   ├── a2ui_test.go           ← a2ui.* 处理
│   │   └── prototype_test.go       ← prototype.* 处理
│   │
│   └── pipeline/
│       ├── template-loader_test.go  ← Design.md 加载
│       └── spec-generator_test.go  ← Spec 生成
│
└── __fixtures__/
    ├── templates/
    │   ├── vercel.yaml
    │   ├── stripe.yaml
    │   └── linear.yaml
    └── test-cases/
        ├── dom-edit-case.json
        ├── spec-export-case.yaml
        └── a2ui-annotate-case.json
```

**验收：**
- [ ] Go Agent 启动 → 输出 READY
- [ ] JSON-RPC：dom.edit → DOM 字符串正确修改
- [ ] Design.md：模板加载 → 正确注入 prompt
- [ ] Spec 生成：输入 → 流式输出 → 格式正确

---

## task-TEST-L4 — 输出层测试

**测试对象：**
- Spec Schema 验证
- 导出格式正确性
- 文件系统操作

**测试内容：**
```
src/panel/
├── __tests__/
│   ├── spec-schema/
│   │   ├── overall-schema.test.ts     ← 总体 Spec Schema
│   │   ├── page-schema.test.ts        ← 页面 Spec Schema
│   │   ├── component-schema.test.ts   ← 组件 Spec Schema
│   │   └── behavior-schema.test.ts    ← 行为 Spec Schema
│   │
│   └── export-format/
│       ├── yaml-export.test.ts        ← YAML 导出
│       ├── md-export.test.ts          ← MD + frontmatter 导出
│       ├── json-export.test.ts        ← JSON 导出
│       └── format-validate.test.ts     ← 格式验证
│
└── __fixtures__/
    └── spec-snapshots/
        ├── valid-overall.yaml
        ├── valid-page.yaml
        ├── valid-component.yaml
        └── valid-behavior.yaml
```

**验收：**
- [ ] Schema 验证：有效 Spec → pass，无效 Spec → 正确报错
- [ ] YAML 导出：结构正确，可被 yaml parser 解析
- [ ] MD 导出：frontmatter + 内容 分离正确

---

## task-TEST-INT-E2E — 端到端 E2E 测试

**测试工具：** Playwright

**测试场景：**

```
e2e/
├── specs/
│   ├── dom-editing.spec.ts     ← DOM 编辑完整流程
│   ├── a2ui-flow.spec.ts      ← A2UI 完整流程
│   ├── spec-export.spec.ts     ← Spec 导出完整流程
│   ├── agent-comm.spec.ts      ← Agent 通信完整流程
│   └── persistence.spec.ts      ← 持久化完整流程
│
└── fixtures/
    ├── test-pages/
    │   ├── simple.html
    │   ├── complex.html
    │   └── with-iframe.html
    └── expected-specs/
        ├── simple.spec.yaml
        └── complex.spec.yaml
```

**验收：**
- [ ] DOM 编辑：打开页面 → 选中节点 → 修改属性 → 页面实时变化 → 撤销成功
- [ ] A2UI：对话 → 标注 → 点击 → 推荐 → Spec 生成 → 导出
- [ ] 持久化：操作 → 刷新页面 → 数据完整恢复

---

## task-TEST-INT-PERF — 性能测试

**测试对象：**
- 大型 DOM 树序列化
- Spec 生成耗时
- IndexedDB 读写性能

**测试内容：**
```
perf/
├── large-dom.test.ts            ← 1000+ 节点 DOM 序列化
├── spec-gen-benchmark.test.ts  ← Spec 生成耗时
├── idb-write-benchmark.test.ts ← IndexedDB 写入速度
└── memory-leak.test.ts         ← 内存泄漏检测
```

**验收：**
- [ ] 1000 节点 DOM 序列化 < 500ms
- [ ] Spec 生成（100 节点）< 10s
- [ ] IndexedDB 写入（100 条记录）< 1s
- [ ] 无内存泄漏

---

**Layer T 子任务总数：15 个**

---

# 完整任务结构总览

```
task-000  MVP Phase 1（根任务）
│
├── task-L1-INFRA      Layer 1：基础设施层（14 个）
│
├── task-L2-CORE       Layer 2：核心交互层（14 个）
│
├── task-L3-AGENT      Layer 3：Agent 层（11 个）
│
├── task-L4-OUTPUT     Layer 4：输出层（3 个）
│
├── task-TEST         测试层（15 个）
│   ├── task-TEST-L1-INFRA-1    插件脚手架测试
│   ├── task-TEST-L1-INFRA-2    持久化测试
│   ├── task-TEST-L2-CORE-1     DOM 编辑测试
│   ├── task-TEST-L2-CORE-2     A2UI 感知测试
│   ├── task-TEST-L2-CORE-3     设置面板测试
│   ├── task-TEST-L3-AGENT-1    通信协议测试
│   ├── task-TEST-L3-AGENT-2    指令集测试
│   ├── task-TEST-L3-AGENT-3    执行引擎测试
│   ├── task-TEST-L4-OUTPUT-1    Schema 测试
│   ├── task-TEST-L4-OUTPUT-2    导出格式测试
│   ├── task-TEST-L4-OUTPUT-3    文件落盘测试
│   ├── task-TEST-INT-E2E        端到端 E2E 测试
│   └── task-TEST-INT-PERF       性能测试
│
└── task-INT-MVP       端到端联调
```

**任务总数：**
- Layer 1：14 个
- Layer 2：14 个
- Layer 3：11 个
- Layer 4：3 个
- Layer T：15 个
- 根任务 + 集成任务：2 个
- **总计：59 个任务**
