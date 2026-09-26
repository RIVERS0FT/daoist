# 本机启动脚本验证 · 2026-09-26

## 修改范围

- `package.json` 增加 `dev`，通过 `npm start` 复用现有 Node 服务及可选 `.env` 配置。
- README、架构与项目记忆同步本机启动说明。
- 应用版本仍为 1.19.0，存档 schema 仍为 v22；无玩法或界面修改。

## 本机验证

环境：Windows、Node.js v24.15.0、npm 11.12.1。

- `npm run check`：通过。
- `npm test`：1234 / 1234 通过，0 失败、0 跳过。
- `npm run build`：通过，生成 `dist/index.html`。
- `npm run dev`：实际启动成功，监听 `http://127.0.0.1:8787`。
- HTTP 检查：首页、`/js/app.js`、`/api/health` 均为 200；首页含游戏标题。
- 未配置 `.env` 时可以启动；健康接口正确返回 `aiConfigured: false`。

首次检查遇到 Windows 检出生成文档为 CRLF、导出脚本逐字比较时判定过期。运行 `npm run npc:export` 和 `npm run sects:export` 后检查通过，Git 确认生成文档没有内容差异。

沙箱内 Node 测试子进程首次启动失败（`spawn EPERM`）；在沙箱外重跑完整 `npm test` 后通过。

## 验证边界

本次没有界面改动，未运行浏览器交互回归；HTTP 成功不代表浏览器或真实 AI 上游验收。未提交、推送或部署，未进行公网内容校验。
