---
name: L2-local-prototype-sync
title: 本地原型文件实时同步与 Spec 绑定
layer: L2
status: draft
created: 2025-05-13
parent: L2-spec-two-way-binding
---

# L2 Spec — 本地原型 HTML 实时同步与 Spec 绑定

## 1. 核心场景

用户打开本地原型 HTML 文件 → 扩展自动解析 → 生成 L2 Spec 骨架 → 实时双向绑定 → 页面刷新后增量同步。

---

## 2. 打开流程（自动）

```
用户打开本地 .html 文件
    ↓
扩展 content script 注入
    ↓
自动解析 DOM → 生成 L2 Spec 骨架
    ↓
Side Panel 展示 Spec 树（P/C/B/S 层级）
    ↓
用户开始交互（自然语言 / 手动改 / 刷新同步）
```

**关键：无需用户手动触发，open 即解析。**

---

## 3. 刷新同步（增量 diff）

### 触发时机
- 用户点击刷新按钮（或 `Cmd+R` / `Ctrl+R`）
- 扩展拦截刷新事件

### 增量 diff 逻辑
```
上次保存 DOM tree vs 当前 DOM tree
    ↓
节点对比（tag / class / id / 位置）
    ↓
分类结果：
  [+] 新增元素 → 自动生成 L3 Spec 草稿
  [-] 已删除元素 → 绑定记录标记 inactive（保留历史）
  [~] 属性变更 → diff 记录
```

### UI 展示
- Side Panel 变更列表
- 三类分组：新增 / 删除 / 修改
- 点击跳转到原型对应位置高亮

---

## 4. Spec 树自动生成

### 解析规则
| 页面元素 | 推断类型 | Spec 节点 |
|---------|---------|----------|
| `<nav>` / `<aside>` / `<header>` / `<footer>` | C (Container) | container-* |
| `<main>` / `<section>` / `<article>` | P (Page block) | page-* |
| `<button>` / `<a>` / `<input>` | B (Behavior) | btn-* / link-* / input-* |
| `<img>` / `<svg>` / `<span>` 纯展示 | S (Style) | style-* |

### 命名推断
- `class="card-list"` → `card-list`
- `id="login-btn"` → `login-btn`
- 无 class/id → `tag-index` 顺序命名

### 草稿确认
- 自动生成的 L3 Spec 草稿展示在 Side Panel
- 用户可编辑 name / type / layer
- 确认后绑定生效

---

## 5. 绑定状态管理

### 绑定关系
- 每个元素绑定一个 spec 路径
- 存储格式：`data-ps-spec="spec-name"`（运行时）或 JSON（持久化）

### 刷新后处理
| 情况 | 处理方式 |
|------|---------|
| 元素仍在 | 绑定保留，重新 Proxy 包裹 |
| 元素已删除 | inactive 记录，历史保留 |
| 元素新增 | 自动生成 L3 草稿，等用户确认绑定 |

### 历史保留
- 删除的绑定 → 标记 inactive，不丢失
- 可在 Side Panel 查看历史绑定记录

---

## 6. 完整 session 闭环

```
┌─ 打开本地 .html ──────────────────────┐
│ 自动解析 DOM → L2 Spec 树              │
└────────────────────────────────────────┘
                    ↓
┌─ 交互阶段 ──────────────────────────────┐
│ 用户自然语言 / 手动改                    │
│ → Agent 多版本 diff → apply            │
│ → Proxy 拦截 → 实时响应                │
└────────────────────────────────────────┘
                    ↓
┌─ 刷新同步阶段 ─────────────────────────┐
│ 增量 diff → 新增 [+]/删除 [-]/修改 [~]  │
│ → Side Panel 变更列表                   │
│ → 用户确认 → 绑定同步                   │
└────────────────────────────────────────┘
                    ↓
         （循环往复）
```

---

## 7. grill-me 决策记录

| # | 问题 | 决策 |
|---|------|------|
| Q1 | HTML 修改后刷新方式 | B（手动刷新按钮已有），A（文件监听）先不做 |
| Q2 | HTML 修改后绑定状态处理 | 增量 diff，增量绑定 |
| Q3 | 增量 diff 触发时机 | 刷新时自动 diff |
| Q4 | 变更展示方式 | Side Panel 变更列表，点击跳转高亮 |
| Q5 | 新增/删除元素处理 | 新增自动生成 L3 Spec 草稿；删除标记 inactive 保留历史 |
| Q6 | 打开后第一步 | 自动解析 → L2 Spec 树 → 用户开始交互 |
| Q7 | 完整 session 流程 | 打开 → 自动解析 → 交互 → 刷新同步 → 循环 |

---

## 8. 与 Step 2 Spec 的关系

本 spec 是 [L2-spec-two-way-binding](./L2-spec-two-way-binding.md) 的**本地文件场景补充**：

- 双向绑定的触发端从「自然语言」扩展到「文件刷新」
- Proxy / 操作栈 / Spec as source of truth 机制共享
- 增量 diff 是增量绑定的具体实现

---

## 9. 验收标准

- [ ] 打开本地 .html → 自动解析 → Spec 树展示（无需手动触发）
- [ ] 刷新 → 增量 diff → Side Panel 变更列表
- [ ] 新增元素 → 自动生成 L3 Spec 草稿
- [ ] 删除元素 → inactive 记录，保留历史
- [ ] 变更确认 → 绑定同步更新
- [ ] 绑定关系在刷新后保留（Proxy 重建）
