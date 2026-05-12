---
name: L2-spec-two-way-binding
title: Spec 双向实时绑定
layer: L2
status: draft
created: 2025-05-13
grill_session: 2025-05-13
---

# L2 Spec — Spec 双向实时绑定

## 1. 核心目标

**空白页 + 自然语言 → 可交互原型**

用户通过自然语言描述，Agent 生成多版本 JSON 改动选项，用户选择后实时反映到页面原型。Spec 是唯一 source of truth，刷新后从 spec 重建投影。

---

## 2. Agent 多版本生成

### 输入
- 用户自然语言描述（如"登录按钮再大一点，颜色更醒目"）
- 当前 Spec 快照
- 内置 Design.md 知识库 + few-shot 启发

### 输出
- 2-4 个变体方案（JSON diff 格式）
- 每个方案附简短说明

### 变体方向来源
- Design.md 知识库（经典设计模式：padding 8/12/16、圆角 4/8、字号层级等）
- Few-shot 引导（同类型组件的常见改动方向）

---

## 3. Diff 预览与选择

### 展示方式
- Side Panel 内展开 diff 列表
- 点击 diff 行 → 原型页对应元素块高亮（视觉对应，非文字对照）

### 交互流程
```
用户点击某方案 →
  原型页对应块高亮 →
  用户确认 →
  apply
```

### 拒绝处理
- 用户不选 → 保持现状，可继续对话修改

---

## 4. Proxy 元素包裹

### 机制
- 每个受控元素用 Proxy 包裹
- 属性级别读写拦截（get/set）
- 改动记录到操作栈

### 绑定方式
- 元素绑定 spec 路径（如 `data-ps-spec="sidebar-nav/padding"`）
- 脏值 diff 比较（当前值 vs spec 值）

### 好处
- 粒度细，不影响其他未绑定属性
- 刷新后重新从 spec apply，Proxy 自动重建

---

## 5. Apply 与 Undo/Redo

### Apply 流程
1. 用户确认 diff 选择
2. Proxy 拦截 set 操作
3. Spec 更新
4. 页面实时响应

### 撤销机制
- 操作栈记录（每次 apply 推栈）
- undo → 弹栈，恢复 spec + 页面
- redo → 重做

### 刷新处理
- Spec 是 source of truth
- 页面刷新 → 从 spec 重建投影
- Proxy 包裹自动恢复

---

## 6. 导入/导出

### 导出
- Spec JSON 可导出
- 导出后可作为其他原型的输入

### 导入
- 导入 Spec JSON → 重绘原型
- 支持外部 Design.md 导入

---

## 7. 架构模块

```
┌─────────────────────────────────────────┐
│  Side Panel UI                          │
│  ├── Spec 树（P/C/B/S 节点）            │
│  ├── Agent 对话区（自然语言输入）       │
│  ├── Diff 预览区（点击高亮原型块）      │
│  └── 操作栈状态                         │
├─────────────────────────────────────────┤
│  Background Service Worker               │
│  ├── 消息 relay（panel ↔ content）      │
│  └── activeTabId 追踪                   │
├─────────────────────────────────────────┤
│  Content Script                          │
│  ├── 4 侧栏 overlay 管理器              │
│  ├── Proxy 包裹器                       │
│  └── 操作栈（undo/redo）                │
├─────────────────────────────────────────┤
│  Page Runtime                            │
│  ├── ProtoSpecHub（数据/状态/事件）     │
│  ├── Proxy 拦截层                       │
│  └── postMessage 通信                   │
└─────────────────────────────────────────┘
```

---

## 8. 验收标准

### 核心路径
- [ ] 空白页输入自然语言 → Agent 生成 2+ 个 JSON 变体
- [ ] 点击 diff → 原型页对应块高亮
- [ ] 确认 apply → 页面实时响应
- [ ] undo/redo 正常工作
- [ ] 页面刷新 → 从 spec 重建

### 周边能力
- [ ] Spec 导出为 JSON
- [ ] 导入 JSON 重绘原型
- [ ] Design.md 知识库集成

---

## 9. grill-me 决策记录

| # | 问题 | 决策 |
|---|------|------|
| Q1 | Spec 编辑方式 | Agent 理解自然语言 → 多版本 JSON → 用户选 |
| Q2 | apply 方式 | 先预览 diff，用户确认后再 apply |
| Q3 | 撤销机制 | 操作栈 undo/redo |
| Q4 | 绑定关系 | Proxy 包裹元素，属性级别拦截 |
| Q5 | 刷新处理 | Spec 是 source of truth，刷新重建 |
| Q6 | diff 展示 | 点击 diff 高亮原型页对应块 |
| Q7 | 变体方向来源 | Design.md 知识库 + few-shot |
| Q8 | 验收标准 | 空白页 + 自然语言 → 可交互原型 |
