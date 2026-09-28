# 技术架构与扩展边界

本文档只描述**当前技术架构、状态推进方式和工程约束**。当前玩法规则见 [GAME_DESIGN.md](GAME_DESIGN.md)，版本历史见 [VERSIONS.md](VERSIONS.md)。

当前应用版本：**1.21.0**
当前存档 schema：**v24**
当前存储键：`night-courier:saves:v24`

## 1. 文档职责

后续修改不要再把版本说明复制到 README、架构和项目记忆中。

- `README.md`：项目入口、运行、文档导航、验证与发布摘要。
- `docs/GAME_DESIGN.md`：当前有效玩法与产品规则。
- `docs/VERSIONS.md`：版本历史，未来版本固定按“新增 / 修复 / 优化”记录。
- `docs/ARCHITECTURE.md`：当前技术实现与工程边界。
- `PROJECT_MEMORY.md`：当前项目状态和必须长期记住的约束。
- `docs/TEST_REPORT*.md`：验证证据，不承担玩法定义。
- `docs/NPC_PROMPTS.md` / `docs/ZHOU_STORY.md`：角色制作资料。

## 2. 运行时模块

浏览器端使用原生 JavaScript IIFE，各模块注册到 `globalThis.NightCourier`。

加载顺序：

```text
city-data → city-region-data → fflate → city-routes → data → chapters → sects → npc-profiles → engine → sect-engine → sect-stories → clock → storage → progression → map-art → map-region → map-tiles → map → app
```

主要职责：

| 模块 | 职责 |
| --- | --- |
| `data.js` | 世界、地点、道路、物品、NPC、事件、数值配置 |
| `chapters.js` | 十二章创作结构、固定区域多边形、章节通行查询和 AI 当前章摘要 |
| `npc-profiles.js` | 人物性格、职业边界、画像/AI提示词 |
| `engine.js` | 核心行动校验、状态复制、结算、路线与规则查询 |
| `clock.js` | 连续时间、倍率、暂停理由与前后台时钟 |
| `storage.js` | v24 存档、清洗、导入导出与备份 |
| `progression.js` | 功能开放、固定主线、章节侧写与成长扩展 |
| `map-art.js` | 静态街区建筑、滨河景观与从路网派生的街道制图 |
| `map-tiles.js` | 从可信制图几何绘制本地 Canvas 瓦片，限制绘制批次和缓存内存 |
| `city-region-data.js` / `map/region/` | 全市范围、海岸、虚构区名及三级细节分区数据 |
| `city-routes.js` | 无损解码新增道路走廊和配送地址，保留原节点前缀与米制原点 |
| `map-region.js` | 本地分区加载、分帧解码、空间索引和精确可行驶道路绘制 |
| `city-data.js` | OSM 本地数据：真实节点、道路边、建筑、水系、地点锚点 |
| `map.js` | Leaflet CRS.Simple、底图承载、路线与订单点投影 |
| `vendor/leaflet/` | 本地 Leaflet 1.9.4、样式与 BSD 许可证 |
| `app.js` | UI 渲染、面板、事件请求与输入编排 |
| `server.mjs` | 本机静态服务与受限 AI 代理 |

服务端可以复用可信静态数据，但不能把浏览器本地状态当作服务端权威账户数据。

## 3. 状态推进模型

核心原则：**界面不能直接写游戏结算状态**。

```text
玩家输入
  ↓
G.perform(oldState, action, payload)
  ├─ 校验失败 → 返回原状态，不部分扣费
  └─ 即时事务 / 创建 activity
                      ↓
                 G.advance(state, dt)
                      ↓
       时间、路线、消耗、午夜、完成节点
                      ↓
      事件 / 结果 / 解锁提示 / 主线 / 保存
```

### `G.perform`

负责：

- 验证功能是否已开放。
- 验证地点与资源是否满足。
- 验证行动是否与现有 activity / pending 冲突。
- 执行零耗时事务。
- 创建一个持续行动。

无效指令必须原子失败：不能先扣钱、再发现条件不满足。

### `G.advance`

是世界时间的唯一持续推进入口。

它负责：

- 连续移动坐标。
- 按实际时间/距离扣除或恢复资源。
- 订单消失与订单补充边界。
- 昼夜与房租边界。
- 行动完成。
- 剧情注入与待选节点。
- 终局优先级。

不能通过 UI 定时器单独发奖励，也不能通过动画结束事件代替规则结算。

## 4. Activity 与单行动约束

同时只能有一个主要 `activity`。

持续行动可包含：

- `kind`
- `params`
- `target`
- `phase`
- `duration / elapsed`
- 路线与累计移动距离
- 已投入成本或渐进收益快照

常见阶段：

- `travel`：沿路移动。
- `work`：到达后执行当地行为。

“停止”与“暂停”必须分离：

- 停止：结束可中断的 activity，保留真实已发生进度，世界继续。
- 暂停：冻结世界时间。
- 已提交的耗时剧情选择与拍卖轮次不能当成普通行动免费取消。

## 5. 连续时钟与暂停

`minutes` 是唯一游戏时间，允许小数。

时钟由 `GameClock` 管理，所有暂停理由组成集合：

- manual
- panel
- event
- menu
- conflict

页面隐藏不是暂停理由。

前台 requestAnimationFrame 与后台心跳共享同一时钟基准，使用经过的墙钟时间计算游戏分钟。长时间回调按批次推进，遇到剧情、终局或暂停立即停止。

关键限制：

- 不存储“离线时间余量”。
- 关闭或重载不补算。
- 读取存档默认手动暂停。
- 倍率改变只改变模拟速度，不跳过内部结算边界。
- 随机抽取只能发生在已定义的世界节点，不能按渲染帧抽。

## 6. 道路、移动与地图

`ROAD_NODES` / `ROAD_EDGES` 是以下模块共用的唯一道路拓扑：

- 路线计算。
- SVG 道路绘制。
- 途中位置校验。
- 存档恢复。
- 改道。

最短路径使用道路图而不是直线距离。途中位置为连续坐标；离开地点后不能继续使用原地点服务。

扩图要求：

- 不重排已有地点 ID。
- 不移动旧坐标。
- 新地点必须接入合法路网。
- 地图和规则必须使用同一份道路配置。
- 普通订单标记的动画不能影响世界坐标或命中区域。

地图适配层使用 Leaflet 1.9.4 的 `CRS.Simple`、底图 `GridLayer` 与动态 `SVGOverlay`，以 `[-y,x]` 显示本地米制坐标。上海全市地图保留原老城厢原点，新增区域允许负坐标；独立显示范围包含大陆与岛屿，不改变原有地点。`ROAD_NODES/ROAD_EDGES` 同时服务寻路、精确道路绘制和途中校验；地域底图用于地形、建筑和道路全貌，街道比例叠加可行驶道路的原始顶点。

`scripts/import-shanghai.py` 生成的原数据保持字节不变。新增两份导入器从 Geofabrik 上海 PBF 生成全市背景及可达配送走廊；只通过 OSM 节点 ID 连通，保留通往新增地址以及相邻地址间的真实道路，不增加轮渡或虚构接线。共 485 个虚构地址。最短路径使用堆 Dijkstra、类型数组及最多 16 MiB 的节点搜索缓存；途中保留一个起点缓存。128 米空间索引用于途中锚点与局部道路绘制，订单距离排序不再为每个候选构建路径数组。持续移动仍只由 `G.advance` 推进。

`CityRegion` 为全市提供统一背景几何与日夜配色；原城区不再叠加旧底图，避免矩形细节分界。`MapArtwork.render()` 的可信 SVG 仅供没有全市数据时的制图回退，不消费随机数或写状态。`CityTiles` 将几何绘制为 192 px、双倍像素密度的本地 Canvas 瓦片，道路按共享边裁剪到瓦片范围，不把整城 SVG 反复送入栅格化。新瓦片每帧绘制一块，旧瓦片在替代内容完成前继续显示；卸载瓦片按 48 MiB 上限缓存，日夜或总览细节变化使缓存失效。瓦片层明确允许负缩放级别，避免 CRS.Simple 小于 1 的比例被默认范围不断清除。

瓦片四边各补绘 2 个逻辑像素，CSS 按同样距离外扩，保持 192 px 网格步长与真实世界坐标不变，消除非整数缩放的透明接缝。全市背景按总览、城区、街道三级几何分区加载，gzip + 差分整数编码压缩；分帧解码和空间索引限制单次主线程工作。分区缓存按解压体积估算限制在 32 MiB、最多 8 块（待完成请求除外）。浏览器无外部地图请求。全市使用同一细节阈值：瓦片缩放级别 ≤ −7 为总览，≤ −5 为城区，其余为完整街道与建筑层。原城区边界不参与底图选择。

当前 v24 进行中路线不重新求最短路；逐段验证仍位于真实边、终点和总里程一致，并检查整段路线都处于已开放区域，再保留原行程及消耗。旧版本因章节通行规则变化明确拒绝，用户须重新开局。

`MAP_REGIONS` 由固定种子的 Voronoi 半平面裁剪形成十二个凸区域，覆盖全市显示范围。地图遮罩与权限共用这些多边形，不另画近似边界。`segmentChapter` 对整条道路段求交，记录所需最高章节；不能只测两端。邻接表只在初始化时计算权限，Dijkstra 按当前章节过滤边，缓存键包含章节和起点。途中虚拟锚点也检查线段权限；`routeFrom` 是有状态行动的统一入口，无状态 `route/routeMeters` 可显式指定章节，默认全图仅用于几何与制作工具。

`CityRegion` 按当前章遮罩未开放区域，完全落在同一锁定区的瓦片跳过细节加载，章节变化使瓦片缓存失效。区域线、地名和开章提示只影响显示。订单从已开放且可达的候选生成；指令先校验区域与地点权限，再计算路线，非法指令不扣费。存档校验当前坐标、发现地址、全部订单和进行中路线；不在每帧重复扫描整条路线。

路线和交互标记保留动态 `SVGOverlay`，与瓦片使用相同米制边界。平移过程交给 Leaflet 移动容器，结束后通过单次动画帧合并标签避让；缩放值变化时才更新图标反向缩放、制图细节和比例尺。标签布局执行时读取最新视图原点，日夜、位置、订单环和路线只在对应显示值变化时改写 DOM。玩家落地点锚定 `G.playerPoint`，光晕以自身 `fill-box` 中心缩放，不能围绕整幅地图缩放。

地图采用纸色、细线、灰绿建筑与淡蓝水系，缩放时隐藏次要街名。原始道路名只作为虚构街名的稳定映射键，游戏文字不显示真实上海地名。路线、图标、骑手共用米制坐标；图标保持屏幕大小，标签避让，比例尺由米制单位和视图缩放直接派生。

数据和 Leaflet 全部随静态站点发布，运行时不请求第三方瓦片或地理接口。地图关闭 Leaflet 常驻署名控件；「帮助 → 地图来源与许可」集中显示 OpenStreetMap 归属、ODbL 许可和数据下载，以及 Leaflet 与随包发布的 BSD 许可证。该入口在开始页和局内均可访问。提取范围、时间、来源、授权和复现方式见 [MAP_DATA.md](MAP_DATA.md)。

放大、缩小、定位和全图按钮共用一份尺寸样式：44×44 px 点击区域、22×22 px SVG 图标与一致线宽；横竖屏仅调整排列，不改变按钮尺寸。图标不使用字体字符，按钮保留独立无障碍名称。

## 7. 配送票据与地点所有权

待接订单与已接订单分开保存。

票据在创建后固定：

- 目标地点。
- 现金与外卖币基础奖励。
- 特殊条件。
- 可选 NPC 关联。

接单后票据转入 `activeOrder`，不能因刷新、暂停或读档重抽。

地点所有权由 `unlockedPlaces` 保存。成功配送结算时才调用地点解锁逻辑；到达、待选、中断、取消或未完成耗时选项都不能授予地点。

规则层必须校验地点所有权，不能仅靠隐藏 UI 防止异地操作。

## 8. 事件、选择与结果回执

普通剧情流程：

```text
pending
  ↓ choose
即时结算 或 耗时 choice activity
  ↓
eventResult
  ↓ ackResult
后续地点/人物/功能回执
  ↓
下一段 pending / 地图
```

`eventResult` 是一次性已结算回执，不是可重复执行的奖励票据。

规则：

- 选择必须匹配正确 event ID 和合法索引。
- 成本不足时整次提交失败。
- 耗时选项先提交必要投入，完成后才应用剩余结果。
- 配送结算只发生一次。
- `ackResult` 只确认阅读，不再次发奖、不推进时间、不抽随机。
- 未读结果冻结世界推进。
- 后续主线可以排队，但不能覆盖当前结果。

固定主线、人物关键章节和拍卖决策使用可信模板恢复，不能从存档的任意文本或 AI 输出恢复效果。

## 9. 解锁与进度

功能定义集中在 `FEATURE_UNLOCKS`，面板映射集中在 `FEATURE_PANELS`。

同一条件必须同时用于：

- 规则层 action 校验。
- 导航显示。
- 顶部入口。
- 地点快捷操作。
- 解锁提示。

`G.featureUnlocked` 等查询必须是纯查询，不能因打开面板或渲染 UI 写入所有权。

人物发现、地点发现、玩法解锁是三种独立所有权，不能互相推导。

章节以 `STORY_STAGES` 的连续前缀计算，遇到首个未满足条件立即停止；固定节点必须真实完成，待选与选项处理中不算完成。区域权限从当前章节派生，不另存可随意解锁的区域数组。

当前玩法门槛写在 GAME_DESIGN，不在架构文档重复维护。

## 10. 主线与角色资料

关键主线由 `progression.js` 注入，固定事件使用 classic source，并跳过 AI 替换。

章节人物侧写 `G.CHAPTER_CHARACTER_BEATS` 是静态只读配置：

- 只读取已结识人物。
- 不推进人物 stage。
- 不发奖。
- 不写存档。
- 不发送未来人物剧情给 AI。

NPC 身份、年龄、职业以 `data.js` 为主；扩展人设在 `npc-profiles.js`。导出脚本从同一源码生成 `NPC_PROMPTS.md` 与 JSON，禁止只改导出文件。

周野的分阶段身份披露必须按已结算阶段裁剪，不能把完整制作端剧透直接发送给早期 AI。

`CHAPTER_OUTLINES` 保存每章三幕、风貌、矛盾、支线、人物池、事实、禁透范围、固定事件和出入口。`scripts/export-chapters.mjs` 生成 `docs/CHAPTER_OUTLINES.md`，`--check` 防止配置与文档漂移。AI 代理只接受已知 `chapterId/regionId`，从配置重建当前章摘要并验证区域不晚于当前章，忽略客户端自带大纲正文；完整三幕不进入运行时提示词。这是单机叙事约束，不是服务端进度防作弊。

## 11. 存档 v24

当前：

```text
G.VERSION = 24
G.STORAGE_KEY = night-courier:saves:v24
G.MAX_SAVES = 12
```

状态类别包括：

- 基本元数据：id、name、mode、seed、revision、时间。
- 玩家属性与资源。
- 电动车。
- 炼药与药鼎/丹方所有权。
- 拍卖状态。
- 宗门状态。
- NPC bonds。
- 功能、地点、结局所有权。
- 订单与 activeOrder。
- activity。
- pending / eventResult。
- 地点、人物和功能解锁回执。
- 主线 flags。
- 日常统计、日志与最近事件。

`sanitizeSave` 必须按白名单重建，而不是把原始 JSON 深合并进新状态。

读取原则：

- 仅接受当前 schema v24；v1–v23、未知与未来版本明确拒绝。
- 只读取 v24 存储键；备份使用独立 `night-courier:saves:v24:backup`。不探测、迁移或删除旧键。
- 用户确认按新通行规则重新开局，旧存档文件及 v23 等旧浏览器数据原样保留。先恢复可信主线标记，再校验章节相关地点、订单与路线权限。
- 在途行动必须恢复真实剩余进度与已支付成本。
- 不重复发奖、不重复扣费。
- 损坏关键关系或事务链时拒绝读档，而不是猜测修复。
- 历史已结算文本保留原文。
- schema 变化必须新增往返、途中与非法数据测试。

本地完整性校验不是服务端防作弊。

## 12. AI 代理与信任边界

`server.mjs` 使用 Node 内置 HTTP，默认只监听本机。

`npm start` 与 `npm run dev` 共用启动入口，通过 Node 的 `--env-file-if-exists=.env` 读取可选配置，默认地址为 `http://127.0.0.1:8787`。服务直接读取 `public/` 文件；前端修改后手动刷新，服务端代码或环境配置修改后重新启动。

AI 请求：

- 只发送完成创作所需的有限上下文。
- 用户姓名、日志和模型输出都视作不可信文本。
- NPC 日常按 NPC ID 从服务端可信目录重建人设。
- 不接受客户端自写系统提示词覆盖角色身份。

AI 响应：

- 只接受规定 JSON 结构。
- 只允许白名单效果和数值范围。
- 不能设置地点、境界、模式、功能所有权或任意物品。
- 不执行 HTML/JS。
- 超时、格式错误或效果越界时回退经典内容。
- 迟到响应不能覆盖已经选择或结算的事件。

密钥：

- 只从服务端环境读取。
- 不写入前端、存档、日志、构建产物或仓库。

当前代理无用户认证，不应直接作为公共商业 AI 后端。

## 13. UI 与渲染边界

`app.js` 负责把状态投影为界面，不应成为业务规则第二来源。

要求：

- 普通帧尽量局部更新，不重建完整地图。
- 顶部时间倍率选择框保持 DOM 稳定。
- 地图缩放/平移只改变视图。
- 动画不改变规则状态。
- 所有用户可见文本做必要转义。
- 长导航在移动端内部滚动。
- 系统减少动态效果时移除非必要动画。
- 行旅日志是唯一长期行为日志区。
- 新建角色的点击和名字输入框回车共用创建入口，先执行表单约束校验，再调用 `G.newGame`；不依赖托管沙箱禁止的原生提交。输入法组合期间的回车不创建角色。
- 存储警告位于页面正常布局中，游戏区域使用剩余视口高度，不覆盖顶部操作或地图控件。

## 14. 测试

日常小改执行与改动相关的源码检查、专项测试；界面变更补充相关浏览器场景，不默认运行完整套件。推送前再执行完整验证：

```sh
npm run check
npm test
npm run build
```

涉及界面/浏览器行为时，推送前还必须完整执行：

```sh
python tests/browser-smoke.py
python tests/browser-performance.py --root dist
python tests/browser-chapter-regions.py --root dist
```

帧性能专项可独立执行 `python tests/browser-performance.py`，默认读取 `public`，使用真实 RAF、游戏时钟和浏览器存储，覆盖桌面/手机视口的静止自动保存、拖动、滚轮、沿路移动与面板操作。`tests/performance-budget.json` 定义超预算失败门槛；PR 与发布验证均接入构建版测试并留存报告。性能专项启动时注入一次 200 ms 阻塞，必须被帧长门槛与 Long Tasks 同时识别。

帧长以 Chromium trace 中相邻 RAF 回调入口标记的真实时间差为准，另存 RAF 参数时间戳差，避免把浏览器提前给出的调度时间错配到下一帧。每帧列出全部加载脚本的 V8 采样自耗时，内建调用归属最近源码父调用；未采到的模块保留零行，但不能解释为执行耗时绝对为零。布局、绘制、合成与主线程占用以同线程区间并集统计；栅格工作线程和 GPU 服务线程单列，各线程可重叠，不能与 JS 相加当作整帧。该数据不是物理屏幕呈现时间或精确 GPU 着色器耗时。完整逐帧 JSON、`.cpuprofile` 与 Chromium trace 位于 `artifacts/performance`，便于检查尖峰来源。

新规则需要同时增加：

- 正常路径。
- 条件边界。
- 失败原子性。
- 中途存读。
- 重复提交。
- 房租/终局同刻优先级（相关时）。
- AI 不可越权（相关时）。
- 桌面与窄屏交互（相关时）。

测试报告写验证事实，不反向定义玩法。

章节专项覆盖十二章连续开放、路段中部穿过锁定区、失败原子性、在途存读、旧键保留和 AI 章节边界；浏览器专项覆盖桌面/手机的区域入口、锁区遮罩及解锁重绘。帧测试对所有加载模块（包括 `chapters.js`）逐帧归因，区域性能场景使用已开放全图的隔离存档，避免用便宜的遮罩代替真实全市绘制。

## 15. 构建与发布

### 多文件静态构建

`scripts/build.mjs` 验证 `public/` 资源，再清理固定输出目录 `dist/` 并复制完整静态文件，生成带大小及 SHA-256 的 `asset-manifest.json`。入口使用相对路径，支持 `/daoist/` 等子路径；发布时必须包含整个目录。清理前拒绝符号链接或重定向输出路径。

`dist` 是产物，不是修改源。

### CI 与自动交付

所有 job 使用 `[self-hosted, Linux, X64]` 并确认 runner 名称为 `VM-0-10-debian`。当前只运行一个同名 runner 服务，因此发布 job 串行；扩充 runner 前必须增加跨进程发布锁。Node 固定 22.16.0；固定提交的 `astral-sh/setup-uv` 在 `RUNNER_TEMP` 创建 Python 3.12 独立环境，安装 Playwright/Pillow/Chromium，不依赖系统 pip、sudo 或 GitHub artifact/cache 配额。

- `.github/workflows/ci.yml`：验证 PR 合并候选，完整执行源码检查、Node、浏览器、地图专项及严格帧预算；成功后保存 `dist`。同一 PR 新提交会取消旧验证。
- `tests/browser-smoke.py` 保留原完整入口，同时提供 21 个独立 `--suite` 场景；`tests/ci-browser.py --workers 2` 用两个子进程执行，隔离截图、日志、浏览器上下文，汇总全部检查与每组耗时。`--workers 1` 可用于同机基准。性能采样在两个浏览器工作进程全部退出后单独运行；真实 RAF、后台定时器与 AI 迟到响应检查保留。
- `scripts/ci-step.mjs` 保留命令退出码、日志和耗时。构件只在全部严格验证通过后保存。失败仍归档源码、报告与日志。
- `.github/workflows/release.yml` 由 CI 的 `workflow_run: completed` 触发，也支持手动接续已登记的请求。控制器始终 checkout `main`，从不执行 PR 工作区内的发布脚本。只有仓库写入者登记到具体 head SHA 的 `daoist/delivery-request` 状态才允许自动合并部署；普通 PR 只验证。
- 请求同时绑定 PR 与提交号；控制器复查仓库、作者权限、非草稿、目标 main、CI 工作流身份与最终结果。新提交、取消请求、基线变化、构件过期/缺失/损坏均停止交付，返回原因。需要更新分支、重新验证并登记请求，不能把旧结果当作新版本验证。
- CI 保存实际 merge candidate 的 head/base/tree SHA；合并前通过 GitHub Git API 校验父提交和内容树，使用带预期 head SHA 的 squash merge。合并后再比较内容树与最新 main，匹配才发布。同一内容的 squash SHA 可以变化；内容不一致不能复用。
- 机器人使用 `GITHUB_TOKEN` 合并，直接在 release job 接续部署与公网校验，不依赖机器人 push 再触发工作流。`production` 密钥只传入发布步骤，PR job 没有发布密钥。
- 发布请求按 head SHA 分组，重复事件不会再次合并；完整结果与发布意图保存在持久目录 `deliveries/<head-sha>.json`。已知 deploymentId 的重试只重验公网；上次发布结果未知时停止并要求核对原日志，不能盲目再次发布。
- 成功、失败、取消结果写入 `artifacts/delivery-result.json`、Actions 摘要和 PR 中按 SHA 区分的同一条机器人评论。记录阶段、提交、CI/run 链接、部署 ID、失败断言/堆栈及完整日志路径，并对密钥脱敏。runner 掉线或任务强制终止导致收尾步骤未执行时，客户端从 Actions 最终状态和失败日志恢复诊断。

`scripts/ship.mjs` 是普通 Node CLI，不调用模型。先显式暂存目标文件，再执行 `npm run ship -- submit --message "..."`：核对仓库/分支/远端、执行本机检查、提交暂存内容、推送、创建或复用 PR、登记该 SHA 的发布请求。可用 `--body-file` 提供 PR 说明。提交后默认立即返回；`status <PR>` 一次读取结果，`wait <PR>` 每分钟在脚本内部查询、只输出最终结果，默认 60 分钟超时且不取消远端任务；`retry <PR>` 接续已有请求。不会自动 add、stash、reset 或 force push。存在未暂存/未跟踪文件时要求先处理或使用独立 worktree，保留无关工作。

首次安装必须先把工作流合入 main，再使用自动入口；`workflow_run` 不会运行仅存在于功能分支的控制器。自动把结果送回已经结束的聊天会话需要客户端回调，仓库本身只提供 GitHub 摘要、评论和命令结果。

### 持久构件

`scripts/runner-artifacts.mjs` 默认存储在 runner 的 `$HOME/.local/share/daoist-actions/meviu523/daoist/`，当前为 `/home/git-runner/.local/share/daoist-actions/meviu523/daoist/`；`DAOIST_ARTIFACT_ROOT` 可指定绝对根目录。目录不得在 checkout / `RUNNER_TEMP` 内，并拒绝符号链接或目录重定向。

- 每份构件保存为 `<run-id>-<attempt>-<name>/files/` 和 `manifest.json`，记录仓库、提交、运行、到期时间与逐文件 SHA-256。先写临时目录再改名，不覆盖既有条目。
- `daoist-riversoft-dist` 保留 1 天；PR 成功构件附带严格验证及 head/base/tree 证据。跨工作流恢复必须与控制器从 GitHub 验证的精确 run、attempt 和内容树对应，校验完整文件集合与哈希后才替换 dist。普通恢复仍只接受同一运行和提交。
- `validation-source` 保留 3 天，包含源码、测试、脚本、工具、Markdown 文档与入口，排除隐藏文件、环境密钥、依赖、截图和存档。
- 保存时只清理本仓库内身份元数据有效且已过期的构件；不删除未知目录、损坏元数据或符号链接。无后续保存就不会自动定时清理。
- `scripts/ci-retain-reports.sh` 将日志、报告、交付结果、源码归档与清单保存在 `$HOME/.local/state/daoist-actions/<owner>/<repo>/<run-id>-<attempt>/`。报告和 `deliveries/` 记录由管理者维护，不套用构件保留期。
- Actions 摘要给出服务器路径，通过 SSH/SCP 或服务器文件系统获取，没有 GitHub Artifacts 下载入口；原 GitHub 构件不迁移或删除。

固定原城区数据库使用 `.gitattributes` 的 `-text` 规则保留已发布字节，防止 Linux checkout 的 LF 与 Windows CRLF 转换造成数据库哈希不同。

### RIVERSOFT

自动交付使用 `.github/workflows/release.yml` 复用已验证构件。`.github/workflows/deploy-riversoft.yml` 保留 main 的人工 push 和手动恢复路径，执行全量验证后发布。两条路径均在发布前检查 main 未被更新，防止排队的旧版本覆盖新版本。

手动运行默认仍执行严格帧预算。只有用户明确批准的单次发布才启用 `performance_report_only`：继续执行性能测试并留存结果，但预算超限不阻断该次发布；统计自测、页面异常、源码/功能检查与公网验收仍然阻断失败。普通 push 和 PR 不受此选项影响。

仅原仓库 `main` 推送或手动运行 `main` 时：

1. Node 22 源码检查。
2. 完整 Node 测试。
3. 多文件构建。
4. Chromium 回归。
5. RIVERSOFT bundle 检查。
6. 在同一 job 中将验证过的 `dist` 保存到持久存储，恢复并复核哈希。
7. 发布步骤获取 `production` 环境中的 `RIVERSOFT_TOKEN`。
8. 发布 `daoist` slug。
9. `scripts/verify-public.mjs` 下载全部公开资源并与构建逐个做 SHA-256 比对；主域不可用时验证现有 HTTPS 兼容路径。

GitHub Pages 已删除，不应重新添加 Pages workflow，除非用户之后明确改变发布策略。

RIVERSOFT 静态沙箱不等于完整 Node 环境：真实 AI 代理和可靠本机浏览器持久化仍以 `npm start` 为完整运行方式。

## 16. 扩展检查表

新增或修改玩法时：

1. 先修改 GAME_DESIGN 的当前规则。
2. 修改 `data.js` 配置与/或规则模块。
3. 核对 `G.perform` 的规则层入口。
4. 核对 `G.advance` 的真实耗时结算。
5. 核对存档白名单、旧档拒绝与当前途中恢复。
6. 核对 UI 是否只展示规则查询结果。
7. 增加边界测试。
8. 如果形成新应用版本，在 VERSIONS 按“新增 / 修复 / 优化”三段记录。
9. 更新对应 TEST_REPORT。
10. PR CI 通过后 squash merge。
11. 自动交付核对合并内容并复用严格验证的构件；人工 push 走完整验证。以 RIVERSOFT 发布与公网哈希均成功为完成。

## 16. 五宗与功法模块

`sects.js` 保存五宗方向、实力设定、36 种功法和 10 对基础关系；`sect-engine.js` 负责独立账户、资格查询、封顶加成、在途与存档校验；`sect-stories.js` 保存固定剧情、选择记录与关系派生。UI 只选择查看对象，不改变所属宗门。

`s.sect` 保存听雨观，`s.sectWorld` 中的 `records` 保存其余四宗，`stories` 保存五宗已结算选项前缀，`councils` 保存三场议事前缀。不保存可任意写入的关系值。宗门行动必须对应合法宗门；未指定 sectId 的听雨观入口由既有 API 默认参数处理。至多一宗 member=true，退出冷却取全部宗门记录的最大值。

`G.techniqueBonuses` 为只读白名单合计，资源上限在宗门所有权恢复后再裁剪。`finishChoice` 在真实完成后提交宗门故事，`cleanPending` 从可信模板重建；AI 不得提供资格、贡献、外交或已学功法。字段缺失或关系矛盾时拒绝存档，不补算或推测恢复旧版本。
