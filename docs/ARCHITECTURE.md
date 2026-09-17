# Architecture v0.6

## Stack and layout

React + TypeScript + Vite，Zustand，IndexedDB，CSS；GitHub Actions / Pages。核心游戏本地运行。独立 Node relay 是可选生成服务，不随 Pages 运行。

- `types.ts`、`engine.ts`：保留 v2 世界并添加 versioned bike；确定性 RPG 引擎负责硬性骑行门槛、推车、维护和升级。`bike.ts` 提供车辆派生属性、价格和成本。
- `events.ts`、`npcEvents.ts`、`content.ts`：原有人工事件定义与统一事件表。
- `npcs.ts`、`endings.ts`：关系、路线与多结局本地规则。
- `generation.ts`：生成式场景数据类型、严格验证、行动模板、6 个可回退人工奇遇与成本描述。
- `play.ts`：纯函数会话层。旧档迁移、探索开始、场景接收、创建时模式、回退、选择结算和最小请求上下文。
- `ai.ts`：安全 URL / 设置读写、限长 HTTP adapter、请求失效门控。没有构建期自动请求。
- `store.ts`：唯一 UI 写入口，统一待处理场景锁，存档与配置切换取消网络，捕获槽 ID 防迟到写入，串行自动保存、错误重试与退出保护。
- `storage.ts`：IndexedDB 读写；写事务完成后才算成功，关闭数据库连接，向 store 报告错误。
- `components/PlayModePanel.tsx`、`playModes.css`：双模式和可操作奇遇界面。
- `server/relay.mjs`：可选服务端 Chat Completions 兼容 relay，配置在服务端环境变量。

## Save envelope

当前会话格式为 `PlaySession = { version: 4, game: GameState(v2 + bike + position), play: PlayState }`。每槽外层为 `SaveSlot = { version: 1, id, name, createdAt, updatedAt, revision, session }`，存入 `saves` 下的 `slot:<id>`。内部世界版本与磁盘封装版本分开，避免为了 UI 模式破坏原有 RPG 模型。

`play` 持有 mode、sequence、pending request、完整 scene、最近 12 条已解决奇遇 history。没有 provider key 或 relay token。地址和授权为独立本机设置；访问口令仅为 store 闭包内字符串。

v1/v2 原始存档先由既有 migrateGameState 升级世界，再加默认经典模式；v3/v4 恢复时保留模式并重新验证受控模板，添加或规范化车辆。未知未来版本阻止自动写入。刷新遇到 pending 请求则在原有已付款探索上回退，不再次收费或发请求。

IndexedDB 保持 `daoist-delivery` / `saves`。首次读取将旧 `autosave` 原子迁移到 `slot:legacy-autosave` 并写入 `meta:legacy-import` 标记；原 autosave 永久保留备份，不重复导入。每次状态转移立即保存。每次写事务校验 revision 与固定剧情模式，阻止另一标签页覆盖新版。事务完成后才显示保存成功；失败自动重试，未知版本或冲突停止写入。

## Scene lifecycle

`beginExploration` 校验没有在途订单、事件、场景和游戏结束状态，扣 2 精力并用唯一时钟 `advanceTime` 推进 15 分钟，产生本地 request id。

经典模式立即按保存的种子和近期重复抑制选择人工奇遇，不发网络。生成模式只在用户授权后发请求。成功：validateScene 严格限制字段、长度、2–4 个不同 approach、允许的方向；本地补充退出选项。失败：fallbackExploration 产生明确人工来源。

选择时先查本地资源门槛，支付成本，经 advanceTime 处理跨日，再在角色存活时支付模板奖励。关系只影响已认识且非疏远的指定 NPC，不写 romance、route 或 flags。结果与已选分支进入存档及日志；scene 清空后才能执行其他动作，重复 choice 无效。

既有 GameState 引擎导出仍为世界 API；UI 必须通过 store 会话入口使用，不能绕过 pending/scene 锁直接修改世界。

## Network authority and cancellation

模式与用户同意双重约束。`RequestGate` 的 revision + AbortController 同时取消请求和迟到结果的写权限。返回开始页、换存档、改配置、回退都使旧 ticket 失效；仅同时匹配当前槽 ID 与 pending id 的结果可提交。

客户端 20 秒超时、32 KiB 响应限制、无自动重试、禁止跨重定向传令牌、credentials omit、no-referrer。所有模型文本按纯文本渲染。模型只提供 approach 标签，不提供效果 JSON。已保存的生成内容不再依赖模型可用性。

原 v0.2 的选择后短对白请求已被替代，避免经典模式隐式联网。新的 scene-v1 协议与部署说明见 `server/README.md`。已有仅 `{text}` 的 relay 不被误判为新协议成功。

## Relay and deployment

relay 自己持有供应商密钥、固定上游 URL、访问口令、Origin 白名单、并发与预算。前端只知道公开地址，可在游戏内配置；`VITE_NARRATIVE_AI_ENDPOINT` 只作为可选默认值，不能携带任何密钥。

`main` 按现有 Vite base `/Daoist-Delivery/` 构建，Pages 发布静态 dist。真实 AI 仍需部署者单独配置并运行 relay / 模型；健康检查只证明 relay 协议和配置可达，不等于真实模型生成测试。

## Verification

`npm test` 编译 game 模块并运行 Node tests（核心结算、迁移、网关与 relay mock）。`npm run build` 严格生产构建。`npm run test:e2e` 用 Chromium 验证桌面及 320px 双模式、真实 IndexedDB、无 AI 请求、生成 mock、刷新恢复和回退。测试不调用付费真实模型，不能据此宣称已完成实际模型端到端联调。

## Map UI composition

`src/App.tsx` 管理临时面板與导航焦点，不保存地图浏览状态、不写世界数据。`src/game/cityMap.ts` 只提供常驻功能地标；`deliveryLocations.ts` 提供配送坐标、稳定地点 ID 和位置迁移验证。`components/CityMap.tsx` 渲染本地 SVG、原生地图滚动及缩放。`components/GamePanels.tsx` 复用现有行动、人物、结局和事件视图；所有实际行动仍调用 store。`PlayModePanel` 的 settingsOnly 视图复用同一份模式/relay 配置逻辑，不复制请求状态。`map.css` 在基础样式之后载入，`deliveryMap.css` 补充临时点、玩家标记与定位工具的桌面/320px/横屏适配。

面板是非模态区域：主地图与固定导航仍可使用。关闭/Escape 恢复焦点，更多菜单打开后焦点进入首项。AI 场景和人工事件通过 store 状态变化自动显示；关闭界面不会丢弃 pending 内容。存档失败在全局显示。AI 协议不变；存档升级到 v4 并保留旧备份。CI 附带仅含 git 跟踪文件的 source-snapshot 压缩包，便于复现 UI 验证，不包含 .git 凭证、未跟踪环境文件或 node_modules。

## Start page and slot lifecycle

`StartScreen` 是启动入口：只有新建或进入存档后才能显示地图和执行行动。模式只作为 `newGame(name, mode)` 的创建参数，不导出运行时切换 API。`returnToStart` 取消请求、保存已付款探索的人工回退并等待自动写入。失败时留在当前世界，显式确认后才能放弃未保存改动，磁盘数据不被删除。

全局保存指示器区分 saving / saved / error。生成场景的选项在保存完成前不可结算。没有手动保存按钮；自动重试只影响存储，不推进游戏时钟。浏览器清理网站数据会删除本机存档，不宣称云同步。

## Delivery geography and saved position (v0.6)

`game.position = { version: 1, locationId }` 是 v4 会话内的增量字段，不改变 IndexedDB 数据库、槽版本或 AI 协议。`migrateGameState` 通过 `normalizePosition` 读取；缺字段时创建驿站位置，未来版本、未知地点或损坏结构返回 null，让既有存储保护机制阻止覆盖。

新订单保存 pickupId/dropoffId 及既有地址文字。`orderMapPoints` 先查稳定 ID，再按旧名称解析；已发布的 8 个商家与 8 个顾客均有独立点位。未知旧名称沿用安全区域回退（取餐驿站 / 送达幸福家园），不重写订单数值。所有地图查询都是纯函数，不消耗随机数。

`completeOrder` 在资源检查、耗时结算及存活检查之后更新位置，再结算收入/触发后续事件；骑行与推车共享此路径。拒绝、取消、选中地图地标都不设置 position。Store 不新增位置写入口，现有逐槽串行自动保存负责持久化；异步 AI 结果和设置无权修改位置。

`CityMap` 接收 position，独立渲染玩家标记与条件化的两个任务图钉；永久地点目录不包含配送点。镜头在读取位置/成功到达时居中，缩放保持当前镜头目标。定位按钮只改变滚动位置。地图仍可拖动、触控和键盘平移，无浏览器定位、地图网络请求或墙钟定时器。
