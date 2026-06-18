# ADR-0002: OpenClaw 多租户策略 — 弃用并迁移至 in-process 运行时

**状态**: 已采纳  
**日期**: 2026-06-18  
**关联**: XCT-273（子任务），XCT-265（多租户改造父任务）

---

## 背景

Genesis（`genesis.xcity.one`）当前使用 OpenClaw 作为 agent 运行时。OpenClaw 将单个 API key 写入 `~/.openclaw/openclaw.json`，所有 agent 共享同一凭证和模型配置。

Phase 1（XCT-265）已交付一个 in-process Python 运行时，让 BYOK 用户能够注入自己的 tokenhub API key 并启动独立 world，不影响其他租户。

本 ADR 解决 Phase 2 的问题：在多租户架构下，OpenClaw 路线如何处理。

### 现状痛点

Multica daemon 中的 OpenClaw 后端（`server/pkg/agent/openclaw.go`）通过以下方式运行：

```
openclaw agent --local --json --session-id <id> --agent <model-name> --message <prompt>
```

- **凭证全局共享**：API key 在 agent 注册时（`openclaw agents add/update --model`）绑定到 agent 名称，运行时没有 per-call 注入机制。`Config.Env` 可以传入环境变量，但 OpenClaw 在读取 key 时忽略进程环境变量，从 `~/.openclaw/openclaw.json` 读取。
- **模型绑定静态**：`--model` 标志在 `openclawBlockedArgs` 中被明确禁止，无法 per-call 动态切换。
- **全局状态**：`~/.openclaw/` 目录包含单一配置，多个并发租户会互相干扰。

---

## 三种方案分析

### 方案 A：Per-tenant openclaw-runtime 容器

每个活跃 world 在 Railway 上启一个独立的 OpenClaw service。

**优点**
- 完全隔离，凭证不会跨租户泄漏。
- 对 OpenClaw upstream 零依赖。

**缺点**
- **启动延迟**：Railway 冷启动约 25–40 秒，用户体验差。
- **成本**：Railway Hobby 计划每个 service ~$5–10/月。10 个活跃用户 = $50–100/月，仅用于 OpenClaw 层，无法规模化。
- **运维负担**：需要编排 service 生命周期（何时 scale-to-zero、何时回收），增加 infra 复杂度。
- **genesis 当前规模不匹配**：付费用户少，高 ARPU 假设尚未验证。

**结论**：在当前阶段不可行，成本结构对 genesis 不友好。

---

### 方案 B：OpenClaw 协议扩展（per-call provider override）

修改调用层，每次 `agent.run` 时将 `apiKey + baseUrl` 作为 override 传入 OpenClaw。

Issue 描述中提到的方向为改 `openclaw-plugin/src/gateway.ts`（TypeScript 适配层），或在 Multica daemon 的 `buildOpenclawArgs` 中追加新标志。

**技术可行性评估**

查看 `server/pkg/agent/openclaw.go` 中 `buildOpenclawArgs` 的实现：

```go
var openclawBlockedArgs = map[string]blockedArgMode{
    "--local":         blockedStandalone,
    "--json":          blockedStandalone,
    "--session-id":    blockedWithValue,
    "--message":       blockedWithValue,
    "--model":         blockedWithValue,      // 明确禁止
    "--system-prompt": blockedWithValue,
}
```

当前 OpenClaw CLI（最低支持版本 2026.5.5）不接受 `--api-key` 或 `--base-url` 参数。模型绑定在 `openclaw agents add/update --model` 注册阶段完成，非运行时。要实现 per-call override，需要：

1. OpenClaw upstream 在 CLI 层面增加 `--api-key` / `--base-url` 标志（或 env var 注入）。
2. Multica daemon 解封对应标志，并在 `ExecOptions` 中增加凭证字段。
3. 协商 upstream roadmap，等待发布，再跟进升级。

**缺点**
- **依赖 upstream**：OpenClaw 尚无公开的 per-call override roadmap。等待外部团队交付，时间不可控。
- **架构耦合**：将 BYOK 凭证路由能力依赖于第三方工具，未来工具停更或改协议会让 Multica 受牵连。
- **部分解决**：即使 upstream 支持，`~/.openclaw/` 全局配置仍会影响默认行为，需要额外的进程隔离或 HOME 目录重定向。
- **与 genesis 定位错位**：OpenClaw 的核心场景是 WhatsApp 自动化，与 genesis 的 world simulation / agent orchestration 定位不同。

**结论**：方案优雅但前提条件不成立；即使跟进 upstream，收益不确定，维护风险高。

---

### 方案 C：弃用 OpenClaw，完善 in-process 运行时 ✅ 推荐

将 Phase 1 交付的 in-process Python 运行时作为 genesis 的唯一 agent runtime，覆盖 OpenClaw 现有功能，并移除对 OpenClaw 的依赖。

**优点**

| 维度 | 现状（OpenClaw） | 方案 C（in-process） |
|---|---|---|
| 凭证隔离 | 全局 `~/.openclaw/` | per-request 注入，per-session 隔离 |
| 启动延迟 | N/A（本地进程，已解决） | N/A |
| 多租户兼容 | 无，需绕过 | Phase 1 已交付 |
| 依赖外部工具 | 是，受 OpenClaw upstream 制约 | 否，完全自控 |
| WhatsApp 功能 | 支持（但 genesis 不需要） | 不支持（不需要） |
| 调试可观测性 | 黑盒 CLI | 可直接插桩 Python 代码 |

**功能 gap 评估**

| OpenClaw 功能 | genesis 是否需要 | in-process 现状 |
|---|---|---|
| 多轮对话（session resume） | 是 | Phase 1 已实现 session_id 机制 |
| Tool calling / MCP | 是 | 已支持（tokenhub function call） |
| 流式输出 | 是 | 已支持（SSE） |
| 多模型切换 | 是 | 通过 tokenhub baseUrl + model 参数 |
| WhatsApp 自动化 | **否** | 不实现（定位不同） |
| 本地文件系统操作 | 有限 | 通过 world sandbox 实现 |

**Railway 成本（对比）**：方案 C 不需要额外的 Railway service，in-process 运行时跑在现有 genesis 容器内，边际成本为零。

**缺点**
- in-process 运行时需要补全部分 OpenClaw 功能（见迁移计划）。
- 需要为现有使用 OpenClaw 的用户提供迁移通知（当前用户极少，风险可控）。

---

## 决策

**采纳方案 C：弃用 OpenClaw，完善 in-process Python 运行时。**

理由：
1. Phase 1 已为 BYOK 多租户打好基础，方案 C 是自然延伸，而非重做。
2. OpenClaw 的产品定位（WhatsApp 自动化）与 genesis 的 world simulation 场景无交集。
3. 消除对 upstream 的依赖，降低长期维护风险。
4. 成本结构更健康：零额外 infra 成本。

---

## 迁移计划

### 阶段 1 — 功能补全（1–2 周）

| 任务 | 说明 |
|---|---|
| Session resume | 确认 in-process runtime 的 `session_id` 覆盖 OpenClaw 会话续接场景 |
| 流式输出稳定性 | 在高并发下验证 SSE 背压处理 |
| 多模型路由 | 确认 tokenhub `baseUrl + model` 动态切换覆盖 OpenClaw `--agent` 注册机制的等价场景 |
| 工具调用兼容 | 对齐 genesis world 所需的 tool schema（DM / Gazette / Narrator） |

### 阶段 2 — 下线 OpenClaw（1 周）

1. 从 genesis 配置中移除 `OPENCLAW_*` 相关环境变量。
2. 从 genesis 启动流程中移除 `openclaw.json` 初始化逻辑。
3. 在 Railway 部署配置中删除 OpenClaw 进程。
4. 发布内部 changelog，通知现有 alpha 用户切换说明。

### 阶段 3 — Multica daemon 层处理（视需求）

Multica platform（xct-multica）的 `openclaw` 后端（`server/pkg/agent/openclaw.go`）服务于桌面端本地 daemon，**不**随本次决策下线。本 ADR 仅影响 genesis.xcity.one 的服务端 agent runtime。如后续 Multica daemon 也需要多租户支持，参考本 ADR 框架独立评估。

---

## 影响面

| 组件 | 变化 |
|---|---|
| genesis FastAPI 后端 | 移除 OpenClaw agent runner，统一走 in-process Python runtime |
| genesis 前端 | 无变化（runtime 对前端透明） |
| Railway 部署 | 移除 openclaw 相关服务和环境变量 |
| Multica daemon | **不受影响**（独立代码路径） |
| 文档 / README | 更新 genesis 架构图，移除 OpenClaw 一节 |

---

## 参考

- XCT-265：多租户改造 — BYOK + 多 world 并发
- `server/pkg/agent/openclaw.go`：Multica daemon 中的 OpenClaw 后端实现
- `server/internal/daemon/config.go`：`MULTICA_OPENCLAW_PATH` / `MULTICA_OPENCLAW_MODEL` 环境变量
- Railway pricing: https://railway.com/pricing（Hobby $5/service/month 起）
