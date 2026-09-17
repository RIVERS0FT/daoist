# Architecture v0.2

## Stack

React + TypeScript + Vite；Zustand 作为 UI-facing store；IndexedDB 作为本地存档；CSS 作为当前视觉层；GitHub Actions + GitHub Pages 部署。核心游戏不需要后端。

可选 AI 叙事通过一个独立 HTTP relay 接入，浏览器只知道 `VITE_NARRATIVE_AI_ENDPOINT`，不保存模型供应商密钥。

## Source layout

- `src/game/types.ts` — serializable state and content types
- `src/game/events.ts` — 基础随机事件定义
- `src/game/npcEvents.ts` — NPC 与关系剧情事件定义
- `src/game/content.ts` — 合并事件内容并建立 EVENT_MAP
- `src/game/npcs.ts` — NPC 元数据、关系初始值、clamp 与关系操作
- `src/game/endings.ts` — 数据驱动结局定义与可用结局筛选
- `src/game/engine.ts` — deterministic simulation actions, time, RNG, relationships, event selection, ending selection
- `src/game/ai.ts` — 可选叙事 AI adapter，只返回短文本，不修改游戏状态
- `src/game/storage.ts` — IndexedDB persistence
- `src/game/store.ts` — Zustand adapter；持久化与可选 AI 网络调用发生在这一层附近
- `src/App.tsx` — presentation and action controls
- `src/styles.css` — responsive visual design

## State model

`GameState` 是完整可序列化存档，schema 当前为 v2。包含日/时间、随机种子、天气、角色资源、进度、当前订单、待处理事件、flags、事件历史、日志、5 名 NPC 的关系状态以及可选 endingId。

每个 NPC 关系包含：`met`、`affinity`、`trust`、`bond`、`romance`、`route`、`lastSeenDay`。

引擎 action 接收 `GameState` 并返回新的 `GameState`；核心引擎本身不执行持久化或网络请求。

## Save migration

`migrateGameState` 接受未知旧存档。v1 存档会保留原有时间、资源、订单、flags 和日志，并补齐 v2 的 relationships 与 endingId。迁移后立即按 v2 重新保存。

IndexedDB database: `daoist-delivery`; store: `saves`; key: `autosave`。

## Randomness

存档持有 numeric seed。核心随机调用同时返回结果和更新后的 seed，禁止用 `Math.random()` 决定订单、事件、突破或结局条件。

AI 生成文本不参与随机数流，不得反向影响确定性状态。

## Time advancement

`advanceTime` 是唯一允许推动游戏时间的核心函数，负责跨日以及日初维护（天气、房租、疲劳压力）。玩法 action 不应直接修改 minute。

主动联系 NPC 通过 `socializeNpc` 推进 45 分钟，再从该 NPC 的 `social` 事件池里选择可触发剧情。

## Events

基础与 NPC 事件都实现 `EventDefinition`。`content.ts` 将不同定义模块合并为统一 EVENT_MAP。

`maybeTriggerEvent` 按行动上下文、可选 NPC filter、条件、近期重复抑制、权重随机筛选事件。React 只渲染选中的定义并 dispatch choice id。

EventEffect 支持：

- stat
- time
- flag
- relationship
- relationship-route

因此故事分支不需要在 React 中写剧情判断。

## Endings

`endings.ts` 定义 `EndingDefinition`。每个结局只有描述与纯函数 condition。第 30 天后 UI 调用 `availableEndings` 展示所有当前成立的结局；玩家选择后由 `selectEnding` 再验证条件并写入 endingId。

普通的 `city-lights` 结局保证第 30 天后至少存在一个可收束方向，其他结局通过关系路线、数值和 flags 解锁。

## Optional AI narrative

`ai.ts` 读取构建期 `VITE_NARRATIVE_AI_ENDPOINT`。未配置时不发网络请求。

NPC 事件选择首先由 deterministic engine 完成全部时间、关系和 flag 变化，随后 store 可以异步向 relay 发送：当前事件、玩家选择、日期/时间、境界、天气和对应 NPC 的最小关系摘要。relay 预期返回 `{ "text": "..." }`。

返回文本被限制长度后只追加为日志里的“人物片段”。请求 7 秒超时；任何 HTTP、解析、超时错误都直接忽略，不影响游戏。

服务端 relay 不属于本仓库核心范围，应负责供应商密钥、鉴权、限流和模型策略。不得把模型 API key 编译进 Vite 客户端。

## Deployment

`main` 使用 Vite base `/Daoist-Delivery/` 构建。GitHub Actions 上传 `dist/` 并部署到 GitHub Pages。若需要启用 AI，Pages 构建可提供公开 relay URL 作为 `VITE_NARRATIVE_AI_ENDPOINT`；真正的模型密钥必须只存在于 relay 服务端。
