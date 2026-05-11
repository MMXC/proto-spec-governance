# Proto-Spec Governance — Spec Consistency Report

> 生成时间：2025-05-12
> 依据：grill-me 澄清记录 + L2 spec + task tree

---

## 一致性检查报告

### ✅ 一致：任务按 Spec 生成

| L2 Spec MVP Phase 1 Item | 对应 Task | 状态 |
|-------------------------|-----------|------|
| 浏览器插件基础框架 | task-001, task-001-1, task-001-2 | ✅ 已映射 |
| 侧边面板 + DOM 编辑 | task-002, task-002-1, task-002-2, task-002-3 | ✅ 已映射 |
| 本地 Agent 集成（stdio + JSON-RPC + SSE） | task-003, task-003-1, task-003-2, task-003-3 | ✅ 已映射 |
| A2UI 感知：对话标注 + 点击推荐 | task-004, task-004-1, task-004-2 | ✅ 已映射 |
| 分层 Spec 导出 | task-005, task-005-1, task-005-2, task-005-3 | ✅ 已映射 |
| IndexedDB 本地持久化 | task-006 | ✅ 已映射 |
| 导出文件到本地磁盘 | task-007 | ✅ 已映射 |
| Design.md 参考模板集成 | task-008 | ✅ 已映射（额外补充） |

### ⚠️ 歧义：Spec 说法模糊

| 位置 | 问题 | 建议 |
|------|------|------|
| Section 3.3 JSON-RPC 接口 | `dom.edit` 方法的 `op` 参数只写了 `setAttribute`，但 DOM 编辑可能有多种操作（innerHTML/setAttribute/style/remove/insert） | 补充完整操作类型定义 |
| Section 4.2 实现要求 | "感知结果实时同步到侧边面板" —— 没有定义具体的同步协议 | 补充感知结果的数据结构 |
| Section 5.1 分层规格模型 | Schema 结构只有层级关系，没有字段定义 | 需要 task-005-1 专门定义 Schema |
| Section 8 MVP Scope | "核心交互全覆盖" —— 没有定义"核心交互"的具体范围 | 需要补充核心交互清单 |
| Section 11 References | Go Agent 参考写了 nanoClaudeCode，但没有说明如何集成 | 需要 task-003 阶段补充集成方案 |

### ❌ 冲突：Spec 内部矛盾

**无明显冲突。** A2UI 感知在 Section 4 写了"必须接 LLM"，在 Section 3 写了"通信方案 stdio"，两者是独立的维度，不冲突。

---

## 依赖链分析（关键路径）

```
task-001（插件框架）
    ↓
task-002（DOM 编辑）
    ↓
task-003（Agent 集成）
    ↓
task-004（A2UI 感知）
    ↓
task-005（Spec 导出）
    ↓
task-007（导出到磁盘）
```

```
task-001（插件框架）
    ↓
task-006（IndexedDB）
    ↓
task-007（导出到磁盘）
```

**task-005-1（Spec Schema 定义）是独立关键路径**，不依赖其他任务但被 task-005-2/005-3 依赖，应该优先完成。

---

## 并行轨迹汇总

| 轨迹 | 视角 | 结论 |
|------|------|------|
| 轨迹1（信任前端） | Extension + DOM 编辑 + A2UI | 一致，task-002/004 可并行 |
| 轨迹2（信任后端） | Agent 集成 + Spec 导出 + Schema | task-003-2（JSON-RPC 方法签名）是关键瓶颈 |
| 轨迹3（全局一致性） | 存储 + 导出 + 通信协议 | task-005-1（Schema 定义）缺失会影响 task-005-2/005-3 |

---

## 推荐执行顺序（基于依赖）

### 第一批（可并行）
- task-001（插件框架）
- task-005-1（Spec Schema 定义 — **独立关键路径**）

### 第二批
- task-002（DOM 编辑）
- task-003-1（Agent 进程管理）
- task-006（IndexedDB）

### 第三批
- task-003-2（JSON-RPC 方法签名 — **需要冻结**）
- task-002-2（属性面板）

### 第四批
- task-003（Agent 集成完成）
- task-004（A2UI 感知）
- task-005-2/005-3（Spec 导出）

### 第五批
- task-007（导出到磁盘）
- task-008（Design.md 集成）

---

## 结论

✅ **Spec 与 Task Tree 一致性：PASS**

⚠️ **需补充（实现前）：**
1. JSON-RPC 方法签名冻结（task-003-2 前置）
2. Spec Schema 定义（task-005-1）
3. 核心交互清单（验收标准量化）

❌ **无冲突**
