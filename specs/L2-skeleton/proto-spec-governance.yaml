---
name: proto-spec-governance
type: L2-skeleton
parent: null
phase: planning
created: 2025-05-12
author: 小羊 + grill-me
status: draft
tags:
  - prototype
  - spec-governance
  - browser-extension
  - a2ui
---

# Proto-Spec Governance — L2 Skeleton Spec

## 1. Overview

**一句话：** 面向全栈 web / web 套壳桌面开发者的所见即所得 HTML 原型工具，通过浏览器插件实时编辑 DOM + AI 对话感知式交互，导出分层 Spec 用于二次开发。

### 核心价值链
```
脑海想法 → HTML 交互原型（插件编辑） → AI 感知增强 → 分层 Spec 导出 → 二次开发
```

### 目标用户
- 全栈 web 开发人员
- web 套壳桌面应用开发人员（Tauri/Wails）
- 需要快速出原型 + 沉淀规格文档的开发者

---

## 2. Architecture

### 2.1 Component Model

| 组件 | 职责 | 技术选型 |
|------|------|----------|
| 浏览器插件 | 原型编辑、DOM 操作、A2UI 感知交互 | Chrome/Firefox Extension (Manifest V3) |
| 本地 Agent | HTML 编辑、Spec 生成、DOM 感知 | Go Agent（如 nanoClaudeCode） |
| 远程 Agent | 智能增强、可视化能力、订阅服务后端 | 云端部署 |
| 存储层 | IndexedDB + 本地文件 + 可选云同步 | 浏览器 + 本地磁盘 |

### 2.2 Data Flow

```
用户打开/创建 HTML 原型
    ↓
插件侧边面板（DOM 树 + 属性编辑）
    ↓
直接编辑 DOM → 实时预览
    ↓
A2UI 感知：
  - 对话 → 自动标注 HTML 区域 + 记录行为变化
  - 点击原型 → 自动推荐对话提示词
    ↓
本地 Agent 理解意图 → 生成结构化 Spec
    ↓
导出：分层 Spec（总体/页面/组件/行为）
```

---

## 3. Communication Protocol

### 3.1 架构原则
将本地 Agent 视为"不可 HTTP/WS 访问的远程 Agent"，统一 Streaming/SSE/JSON-RPC 通信范式。

### 3.2 协议对比

| 维度 | 本地模式 | 远程模式（后续） |
|------|----------|-----------------|
| 传输层 | stdio 子进程 | HTTP/SSE |
| RPC 格式 | JSON-RPC 2.0 | JSON-RPC 2.0 |
| 流式输出 | stdout 按行输出 `data: {...}\n\n` | SSE `data: {...}\n\n` |
| 启动方式 | Extension fork 子进程 | Extension fetch 远程端点 |
| 接口协议 | 同一套 JSON-RPC 方法签名 | 同一套 JSON-RPC 方法签名 |

### 3.3 JSON-RPC 接口（草案）

**插件 → Agent**
```json
{"jsonrpc": "2.0", "method": "dom.edit", "params": {"node": "div#id", "op": "setAttribute", "key": "class", "value": "active"}}
{"jsonrpc": "2.0", "method": "spec.export", "params": {"format": "yaml", "path": "/tmp/out.yaml"}}
{"jsonrpc": "2.0", "method": "a2ui.annotate", "params": {"region": "#root > div:nth-child(2)", "label": "导航栏"}}
```

**Agent → 插件**
```
data: {"type": "dom_change", "node": "div#id", "action": "modified", "snapshot": "<div id=\"id\">..."}
data: {"type": "spec_chunk", "section": "typography", "content": "..."}
data: {"type": "a2ui.suggestion", "region": "#btn-submit", "hint": "这个按钮需要处理什么事件？"}
```

### 3.4 实现路径

**MVP 阶段 1（直接 stdio）**
- Extension 使用 Native Messaging 或 subprocess 启动 Go Agent
- stdin 发送 JSON-RPC 请求
- stdout 按行读取 SSE 流式响应

**MVP 阶段 2（HTTP fallback）**
- Go Agent 附带轻量 HTTP server（仅本地 `:33338`）
- Extension 优先尝试 HTTP/SSE，降级到 stdio

---

## 4. A2UI Perception System

### 4.1 感知触发层（核心创新）

| 感知模式 | 行为描述 |
|----------|----------|
| 对话 → 标注 | 用户对话内容 → 自动关联标注对应 HTML 区域 + 记录行为变化 |
| 点击 → 推荐 | 用户点击原型区域 → 自动推荐相关对话提示词 |

### 4.2 实现要求
- **必须接 LLM**，纯规则无法满足意图识别精度要求
- 感知结果实时同步到侧边面板的 DOM 树视图

---

## 5. Layered Spec Structure

### 5.1 分层规格模型

```
总体 Spec（应用级）
├── 页面 Spec
│   ├── 抽屉（Drawer）
│   ├── 弹窗（Modal）
│   ├── 页面（Page）
│   ├── iframe
│   └── Tab 页
├── 组件/元素 Spec
└── 行为 Spec
    ├── 状态（State）
    ├── 事件（Event）
    └── 流程（Flow）
```

### 5.2 Spec 格式
支持多种格式（灵活输出）：
- YAML（结构化，可程序化）
- Markdown + YAML frontmatter（可读性好）
- JSON（可选）

### 5.3 Design.md 参考
复用 [awesome-design-md-cn](https://github.com/fchangjun/awesome-design-md-cn) 项目模板（覆盖 59 个产品），Agent 生成 Spec 时可参考 vercel/stripe/linear 等风格。

---

## 6. Plugin Interaction Design

### 6.1 侧边面板功能
- DOM 树展示与编辑
- 属性面板（style/attributes/events）
- 实时预览
- Spec 导出入口
- A2UI 感知结果展示

### 6.2 交互流程

```
用户打开/创建 HTML 原型
    ↓
点击插件图标 → 打开侧边面板
    ↓
直接编辑 DOM（所见即所得）
    ↓
对话 → AI 自动标注区域
    ↓
点击原型区域 → AI 推荐下一步提示
    ↓
确认满意 → 导出分层 Spec
```

---

## 7. Storage Design

| 存储位置 | 内容 | 说明 |
|----------|------|------|
| IndexedDB | 原型数据、DOM 快照、对话历史 | 浏览器本地，持久化 |
| 本地磁盘 | 导出文件（HTML/Spec） | 用户指定路径 |
| 云端（可选） | 同步数据、订阅服务 | 产品化阶段，远程 Agent 提供 |

---

## 8. MVP Scope

### Phase 1（MVP，先行）

- [ ] 浏览器插件基础框架（Chrome + Firefox Extension Manifest V3）
- [ ] 侧边面板 + DOM 编辑（所见即所得）
- [ ] 本地 Agent 集成（stdio + JSON-RPC + SSE）
- [ ] A2UI 感知：对话标注 + 点击推荐
- [ ] 分层 Spec 导出（YAML / MD + YAML frontmatter）
- [ ] IndexedDB 本地持久化
- [ ] 导出文件到本地磁盘

### Phase 2+（后续支持）

- [ ] 云端订阅服务（远程 Agent）
- [ ] 智能增强（可视化能力）
- [ ] 多人协作/评审
- [ ] 云端同步
- [ ] Figma/设计工具集成
- [ ] 版本管理（Git-like）

---

## 9. Acceptance Criteria

- 核心交互全覆盖
- 导出 Spec 可用于二次开发
- 本地 Agent 可独立完整工作（离线可用）
- 种子用户试用 0 major bug

---

## 10. Open Issues

- [ ] A2UI 感知意图识别的精度基线
- [ ] 分层 Spec 各层级的 Schema 定义
- [ ] HTML 原型初始模板设计
- [ ] 云端订阅定价模式
- [ ] JSON-RPC 方法签名的完整定义（MVP 前需冻结）
- [ ] Go Agent stdio 模式的启动参数与环境变量约定

---

## 11. References

- Design.md 模板：[fchangjun/awesome-design-md-cn](https://github.com/fchangjun/awesome-design-md-cn)
- 通信协议参考：Bolt 机器人 / MCP stdio 模式
- Go Agent 参考：nanoClaudeCode（neyuki778/nanoClaudeCode）
