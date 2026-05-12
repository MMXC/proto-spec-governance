---
name: L2-prototype-initialization
title: 原型初始化 — 从需求/竞品/HTML 到 Spec 树
layer: L2
status: draft
created: 2025-05-13
parent: L2-local-prototype-sync
---

# L2 Spec — 原型初始化（Step 1）

## 1. 核心目标

**三种入口 → 统一收敛 → Agent 生成初始 HTML → 解析进入 Spec 绑定流程**

---

## 2. 三种入口

| 入口 | 场景 | Agent 处理方式 |
|------|------|--------------|
| 本地原型 | 用户已有 HTML 文件 | 本地 JS 解析 DOM |
| 需求描述 | 空白页，只有自然语言 | Agent 直接生成 HTML |
| 竞品/参考 | 有参考网页 URL | Agent 抓取 → 提取布局模式 → 生成符合项目风格的 HTML |

**统一输出格式**：可运行 HTML 片段 + 标准化 JSON Spec

---

## 3. 纵向分层框架

```
page
 └── region（区域）
      └── component（组件）
           └── [复杂情况提层]
```

- **Page** — 页面根，最顶层
- **Region** — 区域，按视觉分块 + 语义标签双重启发
- **Component** — 组件，交互边界 + 视觉间距切分

**固定三层，避免无限嵌套**。组件点击后出现抽屉/弹窗/模态框 → 提层为 P-overlay，与 page 同级。

---

## 4. 横向复杂度提层

### 提层触发条件
- 组件有多个状态（hover/active/disabled）
- 组件有嵌套子元素 > 3 个
- 组件有事件处理（click/submit）
- 组件点击触发 drawer/modal/overlay

### 提层规则
- **P-overlay** — 抽屉/弹窗/模态框，与 page 同级
- 组件增加 `overlay` 关联字段，可跳转至对应 P-overlay
- **Spec 树中展示调用链**：`→ P-overlay-name`

---

## 5. 服务端解析流程

```
用户输入（需求 / URL / HTML）
    ↓
Agent 服务端
    ↓
┌─ 竞品参考页 ────────────────┐
│ 抓取页面                    │
│ 提取布局模式（区域/间距/色值）│
│ 生成符合项目风格的 HTML      │
└─────────────────────────────┘
    ↓
统一输出：
┌─ HTML 片段 ────────────────┐
│ 可直接注入原型预览           │
└─────────────────────────────┘
┌─ JSON Spec ────────────────┐
│ {                          │
│   "page": "page-name",     │
│   "regions": [...],        │
│   "components": [...],     │
│   "overlays": [...]        │
│ }                          │
└─────────────────────────────┘
    ↓
用户确认初版
    ↓
进入 Spec 树绑定流程
```

---

## 6. 本地 HTML 解析（Extension 内）

### 解析时机
- 打开本地 .html 文件时自动触发
- 用户手动刷新时触发

### 解析流程
```
DOM 树
    ↓
视觉分块（外边框/背景差异）
    ↓
语义标签优先（header/nav/main/aside/footer）
    ↓
区域切分
    ↓
组件切分（交互边界 + 间距）
    ↓
L2 Spec 树输出
    ↓
Side Panel 展示
```

### 区域切分规则
| 启发方式 | 说明 |
|---------|------|
| 语义标签 | `<header>`/`<nav>`/`<main>`/`<aside>`/`<footer>` 优先 |
| 视觉分块 | border/background 差异切分 |

### 组件切分规则
| 类型 | 说明 |
|------|------|
| B (Behavior) | 有交互（click/hover/input） |
| S (Style) | 纯展示（img/svg/span 无交互） |
| C (Container) | 多个相邻相似元素包裹 |

---

## 7. 组件 overlay 关联

### 关联字段
```typescript
interface Component {
  name: string;
  type: 'B' | 'S' | 'C';
  overlay?: string; // 关联的 P-overlay 名称
}
```

### Spec 树展示
```
├── page-shell
│   ├── region-main
│   │   ├── component-btn-login → P-overlay-login-modal
│   │   └── component-card-list
│   └── region-header
```

---

## 8. 完整工作流

```
入口选择
├── 本地 HTML → 本地 JS 解析 → L2 Spec 树
├── 需求描述 → Agent 生成 HTML → 用户确认 → L2 Spec 树
└── 竞品参考 → Agent 抓取+提取 → 生成 HTML → 用户确认 → L2 Spec 树
    ↓
用户确认初版 HTML
    ↓
进入双向绑定流程（见 L2-spec-two-way-binding.md）
    ↓
刷新 → 增量 diff → 绑定同步（见 L2-local-prototype-sync.md）
```

---

## 9. grill-me 决策记录

| # | 问题 | 决策 |
|---|------|------|
| Q1 | 解析策略 | 框架优先，逐层深入 |
| Q2 | 页面分区域 | 视觉分块 + 语义标签双重启发 |
| Q3 | 区域→组件切分 | 纵向分层：page/region/component；横向按复杂度提层 |
| Q4 | 复杂度提层标准 | 固定三层 + 抽屉/弹窗/模态框提为 P-overlay |
| Q5 | P-overlay 位置 | 与 page 同级 |
| Q6 | 组件→P-overlay 关系展示 | Spec 树中 `→ P-overlay-name` |
| Q7 | 初始状态 | 空白 canvas + 隐式 page |
| Q8 | 三种入口收敛 | 统一到 Agent 生成初始 HTML |
| Q9 | HTML 解析器位置 | 本地 JS 解析（Extension 内）；竞品参考发 Agent 服务端 |
| Q10 | 服务端输出格式 | HTML 片段 + 标准化 JSON Spec |
| Q11 | 完整入口闭环 | 三种入口 → 统一流程 → 用户确认 → 进入绑定 |

---

## 10. 验收标准

- [ ] 本地 HTML 打开即解析，展示 L2 Spec 树
- [ ] 需求描述 → Agent 生成 HTML → 用户确认
- [ ] 竞品 URL → Agent 抓取+提取 → 生成 HTML → 用户确认
- [ ] 解析结果展示 page/region/component 三层结构
- [ ] 抽屉/弹窗 → P-overlay，与 page 同级
- [ ] 组件 `overlay` 关联字段 → Spec 树 `→ P-overlay-name` 展示
- [ ] 用户确认初版后进入 Spec 绑定流程
