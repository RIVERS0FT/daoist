# 外卖修仙录

白天送外卖，夜里修仙的单机 Web RPG。项目基于此前对话中的玩法需求重新实现，不是被封禁旧仓库的逐文件恢复。

当前应用版本：**1.20.0**
当前存档 schema：**v23**
线上静态版：<https://mevius.riversoft.top/daoist/>

## 开始运行

推荐使用 Node.js **22.16.0+**：

```sh
npm start
```

也可使用 `npm run dev`，它复用同一启动入口并读取可选的 `.env`。修改前端源码后手动刷新浏览器；修改服务端代码或环境配置后重新启动服务。

浏览器打开：

```text
http://127.0.0.1:8787
```

Windows 也可双击根目录的 `开始游戏.bat`。

经典模式不需要网络或 AI 密钥。AI 模式需要在本机配置兼容 Chat Completions JSON 接口，配置示例见 `.env.example`。密钥只由本机 Node 服务读取，不应写进浏览器代码、存档或仓库。

如需生成静态发布目录：

```sh
npm run build
```

生成结果位于 `dist/`，入口为 `index.html`，包含独立脚本、样式、本地 Leaflet 1.9.4 资源及 `asset-manifest.json` 校验清单。请完整复制或发布整个目录。不要直接修改 `dist`；源码以 `public/` 为准。

地图使用 Leaflet 加载上海老城厢真实街道与建筑形状，全部游戏地名虚构；数据随站点发布，无在线瓦片、地图 API 密钥或 CDN 依赖。来源、ODbL 许可及导入方式见 [地图数据说明](docs/MAP_DATA.md)。仅支持新版 v23 存档，旧版需要重新开局，原数据不会自动删除。

## 文档入口

仓库文档按职责拆分，不再把玩法、版本历史和技术实现混在 README 中：

- [当前玩法设计](docs/GAME_DESIGN.md)：当前有效游戏规则、解锁顺序、系统与内容边界。
- [五宗、功法与宗门剧情](docs/SECTS_AND_TECHNIQUES.md)：36 种功法、五个主修方向、宗际关系与固定剧情目录。
- [版本记录](docs/VERSIONS.md)：应用版本历史；从下一版本起固定按“新增 / 修复 / 优化”记录。
- [技术架构](docs/ARCHITECTURE.md)：模块、状态推进、存档、AI、安全边界与部署架构。
- [项目记忆](PROJECT_MEMORY.md)：当前项目状态、关键约束和维护入口。
- [NPC 设定与提示词](docs/NPC_PROMPTS.md)：21 位具名 NPC 的人设、画像和 AI 提示词。
- [周野完整个人线](docs/ZHOU_STORY.md)：周野十段剧情的制作端剧透资料。
- [恢复范围说明](docs/RECOVERY_NOTES.md)：重建来源、可恢复范围与已知限制。
- `docs/TEST_REPORT*.md`：各阶段验证与回归记录。

历史版本里的旧规则只代表当时状态。判断“现在怎么玩”时，以 `docs/GAME_DESIGN.md` 和当前源码为准。

## 开发与验证

源码修改后至少运行：

```sh
npm run check
npm test
npm run build
```

涉及界面、交互、地图、响应式布局或浏览器行为时，还要运行：

```sh
python tests/browser-smoke.py
```

当前主要结构：

```text
public/index.html          页面骨架
public/styles.css         响应式界面与地图样式
public/js/data.js         世界、物品、事件、人物与静态配置
public/js/engine.js       行动校验、规则与结算
public/js/clock.js        连续时钟与暂停
public/js/storage.js      当前存档校验、导入导出
public/js/progression.js  解锁、主线与成长扩展
public/js/map-art.js      街道、街区建筑与滨河景观的静态矢量制图
public/js/city-data.js    本地 OSM 道路、建筑、水系与来源信息
public/js/map.js          Leaflet 地图交互、路线与地点投影
public/vendor/leaflet/    固定版本地图库、样式、图片与许可证
public/js/app.js          UI 渲染与行动编排
server.mjs               本机静态服务与 AI 代理
scripts/build.mjs        多文件静态构建与资源校验清单
tests/                   Node 与浏览器回归
docs/                    设计、版本、架构、角色与验证文档
```

## 发布

仓库不再使用 GitHub Pages。

`main` 推送后由 `.github/workflows/deploy-riversoft.yml` 执行完整验证、构建并发布到 RIVERSOFT。工作流通过 `scripts/verify-public.mjs` 逐个下载页面、脚本、样式和地图资源，与本次 `dist/` 构建做 SHA-256 比对。

RIVERSOFT 是受限静态沙箱，适合经典静态版体验；真实 AI 代理、稳定 localStorage 和完整本机能力仍应通过 `npm start` 运行。

## 项目边界

这是单机游戏。玩家可以通过开发者工具修改自己的本地状态；现有校验用于避免坏档、保护结算顺序和约束 AI，不是服务端权威防作弊系统。

原仓库源码、原提交历史、原账号权限和原存档格式均未恢复。不要仅通过修改未知旧存档的版本号来强行导入。
