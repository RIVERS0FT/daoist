# 可选生成式游玩 relay

核心游戏无需后端。本目录提供真正调用模型的独立 Node.js 服务，而不是固定示例文本。GitHub Pages 只部署前端，不运行此服务。需要 Node.js 22 或以上版本。

## 启动

1. 将 `.env.example` 复制为 `.env.local`（本目录内）。
2. 在服务端填写 `AI_MODEL`、`AI_API_KEY`，以及独立随机生成的 `RELAY_ACCESS_TOKEN`（至少 24 字符）。不要把模型供应商密钥给游戏浏览器。`AI_BASE_URL` 是服务端固定的 Chat Completions 兼容地址；不是用户请求可指定的 URL。
3. 在仓库根目录执行 `npm run relay`。
4. 本机游戏页面切换“AI 生成剧情”，在服务设置填写 `http://127.0.0.1:8787/narrative`、relay 访问口令并勾选授权，然后保存。口令只在当前页面内存中；刷新后需重新输入。
5. 点击“测试连接”检查协议与配置，再点击“生成下一段奇遇”实际调用模型。

本机 HTTP 服务只用于本机开发。给线上 Pages 使用时，单独部署 relay 并通过 HTTPS 反向代理暴露 `/narrative`；准确设置 `ALLOWED_ORIGINS`，Pages 的 Origin 是 `https://rivers0ft.github.io`，不带项目路径。根据部署平台需要设置 `HOST=0.0.0.0`。模型费用由 relay 部署者承担；部署前应在供应商侧设置花费上限。

也可连接本机提供 Chat Completions 兼容接口的模型服务：将 `AI_BASE_URL` 指向本机服务的 `/v1`，`AI_MODEL` 设置为实际可用的模型。服务须支持 JSON 输出与本示例使用的 `max_completion_tokens`。兼容服务实现有差异，需要用实际模型验证；不会以模板输出冒充模型调用成功。

## 浏览器协议

POST `/narrative`，`Content-Type: application/json`，`Authorization: Bearer <relay access token>`。

健康检查：`{"protocol":1,"type":"health"}` → `{"protocol":1,"ready":true,"capabilities":["scene-v1"]}`。此检查不调用供应商模型，也不证明模型生成一定成功。

生成请求：

```json
{"protocol":1,"type":"scene","context":{"focus":"city","intent":"调查巷口纸鹤","day":1,"minute":435,"weather":"clear","realmLevel":0,"memories":[]}}
```

focus 支持 city / cultivation / social。social 还须传指定 NPC 的 id、route、affinity、trust、bond；客户端只能选已认识且未疏远的 NPC。最多发送 4 条最近奇遇记忆。完整协议见 `src/game/play.ts` 的 `generationPayload`。

响应格式：

```json
{"protocol":1,"scene":{"title":"风里的纸鹤","description":"墙边的纸鹤反复落在同一块砖上。你停下脚步，开始考虑要不要追查这一点异常。","choices":[{"label":"观察纸鹤落点","result":"你记下了落点，没有贸然碰触墙边的东西。","approach":"observe"},{"label":"靠近调查异常","result":"你发现砖缝里残留着一点灵气，又很快退开。","approach":"investigate"}]}}
```

生成内容不能返回 effect、数值、route、flags、endingId 或任何可执行代码。服务端与前端均校验结构。浏览器自行添加无需资源的离开选项，每个 approach 的实际效果参见 `PROFILES`，不是模型任意决定。

## 防护与限制

必须使用独立 relay 口令；精确 Origin 白名单，禁止通配 CORS；拒绝客户端指定模型供应商 URL；不跟随重定向；输入最大 16 KiB；供应商响应最大 64 KiB；每请求输出最多 1200 tokens；上游 15 秒超时；单进程最多 2 并发、每分钟 12 次、每 24 小时窗口 200 次生成；不自动重试；不记录场景或密钥；错误不转发供应商原始响应。

此服务适合个人部署。限额是进程内计数，重启会重置；多实例或公共发行须使用持久化限流、用户级鉴权及预算，不要把共享口令公开在页面或仓库。前端的设置口令与模型供应商密钥用途不同。

模型文案仍可能出现逻辑不一致，校验只确保结构和受控行动集合，并非语义完美保证。正式路线、数值与结局始终由本地规则决定。任何服务失败均可退回人工剧情。

接口参考：OpenAI Chat Completions 与 JSON mode 官方文档 https://developers.openai.com/api/docs/guides/structured-outputs ；Vite 密钥暴露说明 https://vite.dev/guide/env-and-mode 。
