# Architecture v0.1

## Stack

React + TypeScript + Vite；Zustand 作为 UI-facing store；IndexedDB 作为本地存档；CSS 作为当前视觉层；GitHub Actions + GitHub Pages 部署。不需要后端。

## Source layout

- `src/game/types.ts` — serializable state and content types
- `src/game/events.ts` — data-driven event definitions
- `src/game/engine.ts` — deterministic simulation actions, time, RNG, event selection
- `src/game/storage.ts` — IndexedDB persistence
- `src/game/store.ts` — Zustand adapter between React and engine
- `src/App.tsx` — presentation and action controls
- `src/styles.css` — responsive visual design

## State model

`GameState` 是完整可序列化存档，包含 schema version、日/时间、随机种子、天气、角色资源、进度、当前订单、待处理事件、flags、事件历史和日志。引擎 action 接收 `GameState` 并返回新的 `GameState`；引擎本身不执行持久化。

## Randomness

存档持有 numeric seed。随机调用同时返回结果和更新后的 seed，禁止用 `Math.random()` 决定核心游戏结果。

## Time advancement

`advanceTime` 是唯一允许推动游戏时间的函数，负责跨日以及日初维护（天气、房租、疲劳压力）。玩法 action 不应直接修改 minute。

## Events

`maybeTriggerEvent` 按行动上下文、条件、近期重复抑制、权重随机四层筛选 `EVENTS`。React 只渲染选中的定义并 dispatch choice id，效果由引擎解释。

## Save strategy

IndexedDB database: `daoist-delivery`; store: `saves`; key: `autosave`。每次行动和事件选择后自动保存。必须保留 version 字段，便于后续迁移。

## Deployment

`main` 使用 Vite base `/Daoist-Delivery/` 构建。GitHub Actions 上传 `dist/` 并部署到 GitHub Pages。
