# Architecture v0.3

## Stack and layout

React + TypeScript + Vite，Zustand，IndexedDB，CSS；GitHub Actions / Pages。核心游戏本地运行。独立 Node relay 是可选生成服务，不随 Pages 运行。

- `types.ts`、`engine.ts`：保留发布版 v2 世界状态及确定性 RPG 引擎。
- `events.ts`、`npcEvents.ts`、`content.ts`：原有人工事件定义与统一事件表。
- `npcs.ts`、`endings.ts`：关系、路线与多结局本地规则。
- `generation.ts`：生成式场景数据类型、严格验证、行动模板、6 个可回退人工奇遇与成本描述。
- `play.ts`：纯函数会话层。旧档迁移、探索开始、场景接收、模式切换、回退、选择结算和最小请求上下文。
- `ai.ts`：安全 URL / 设置读写、限长 HTTP adapter、请求失效门控。没有构建期自动请求。
- `store.ts`：唯一 UI 写入口，统一待处理场景锁，模式与配置切换取消网络，防迟到写入，串行保存。
- `storage.ts`：IndexedDB 读写；写事务完成后才算成功，关闭数据库连接，向 store 报告错误。
- `components/PlayModePanel.tsx`、`playModes.css`：双模式和可操作奇遇界面。
- `server/relay.mjs`：可选服务端 Chat Completions 兼容 relay，配置在服务端环境变量。

## Save envelope

当前磁盘格式为 `PlaySession = { version: 3, game: GameState(v2), play: PlayState }`。内部世界版本与磁盘封装版本分开，避免为了 UI 模式破坏原有 RPG 模型。

`play` 持有 mode、sequence、pending request、完整 scene、最近 12 条已解决奇遇 history。没有 provider key 或 relay token。地址和授权为独立本机设置；访问口令仅为 store 闭包内字符串。

v1/v2 原始存档先由既有 migrateGameState 升级世界，再加默认经典模式；v3 恢复场景时重新验证受控模板。未知未来版本阻止自动写入。刷新遇到 pending 请求则在原有已付款探索上回退，不再次收费或发请求。

IndexedDB 保持 `daoist-delivery` / `saves` / `autosave`，无需新建数据库或删除旧数据。每次状态转移后保存，队列保证旧写入不能覆盖新世界。

## Scene lifecycle

`beginExploration` 校验没有在途订单、事件、场景和游戏结束状态，扣 2 精力并用唯一时钟 `advanceTime` 推进 15 分钟，产生本地 request id。

经典模式立即按保存的种子和近期重复抑制选择人工奇遇，不发网络。生成模式只在用户授权后发请求。成功：validateScene 严格限制字段、长度、2–4 个不同 approach、允许的方向；本地补充退出选项。失败：fallbackExploration 产生明确人工来源。

选择时先查本地资源门槛，支付成本，经 advanceTime 处理跨日，再在角色存活时支付模板奖励。关系只影响已认识且非疏远的指定 NPC，不写 romance、route 或 flags。结果与已选分支进入存档及日志；scene 清空后才能执行其他动作，重复 choice 无效。

既有 GameState 引擎导出仍为世界 API；UI 必须通过 store 会话入口使用，不能绕过 pending/scene 锁直接修改世界。

## Network authority and cancellation

模式与用户同意双重约束。`RequestGate` 的 revision + AbortController 同时取消请求和迟到结果的写权限。换模式、改配置、回退、重开都使旧 ticket 失效；仅匹配当前 pending id 的结果可提交。

客户端 20 秒超时、32 KiB 响应限制、无自动重试、禁止跨重定向传令牌、credentials omit、no-referrer。所有模型文本按纯文本渲染。模型只提供 approach 标签，不提供效果 JSON。已保存的生成内容不再依赖模型可用性。

原 v0.2 的选择后短对白请求已被替代，避免经典模式隐式联网。新的 scene-v1 协议与部署说明见 `server/README.md`。已有仅 `{text}` 的 relay 不被误判为新协议成功。

## Relay and deployment

relay 自己持有供应商密钥、固定上游 URL、访问口令、Origin 白名单、并发与预算。前端只知道公开地址，可在游戏内配置；`VITE_NARRATIVE_AI_ENDPOINT` 只作为可选默认值，不能携带任何密钥。

`main` 按现有 Vite base `/Daoist-Delivery/` 构建，Pages 发布静态 dist。真实 AI 仍需部署者单独配置并运行 relay / 模型；健康检查只证明 relay 协议和配置可达，不等于真实模型生成测试。

## Verification

`npm test` 编译 game 模块并运行 Node tests（核心结算、迁移、网关与 relay mock）。`npm run build` 严格生产构建。`npm run test:e2e` 用 Chromium 验证桌面及 320px 双模式、真实 IndexedDB、无 AI 请求、生成 mock、刷新恢复和回退。测试不调用付费真实模型，不能据此宣称已完成实际模型端到端联调。
