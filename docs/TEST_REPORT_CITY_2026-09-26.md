# 真实道路与兼容清理验证 · 2026-09-26

应用 1.20.0，存档 schema v23。本文记录发布前的本机修改与验证；CI、合并及线上发布结果以对应 PR 和 RIVERSOFT 工作流为准。

## 当前实现

- 本地 Leaflet 显示上海老城厢的真实 OSM 道路、建筑、水系与绿地形状；游戏地名全部虚构，包括青岚城、听雨园、长乐里、青藤坊、月渡湾、沧江和各条道路。
- 5,652 个节点、6,571 条边、2,744 个建筑轮廓；全部地形多边形共 2,868 个。110 个游戏地址落在真实连通图节点上。
- 绘制、导航、移动、里程与途中校验共用米制道路。堆实现最短路与有界缓存，无在线瓦片或运行时地理请求。
- 删除旧网格、不规则投影、旧美术样式、历史 schema 迁移、凡人投入抵扣、旧药鼎索引及故事衔接。保留当前格式的状态清洗、备份、进行中事务及历史回执保护。
- v1–v22、未知和未来存档明确拒绝。v23 存储和备份键独立，不探测、迁移、删除或覆盖旧键。

## 验证结果

- `npm run check`：通过，包括语法及人物/宗门资料导出一致性。
- `npm test`：**1,185 / 1,185 通过**，无跳过。日志 `artifacts/shanghai-tests-complete.log`。
- `npm run build`：通过，生成 24 个本地资源及构建清单。
- `git diff --check`：通过。
- 导入器复现：相同原始 JSON 再生成的 `city-data.js` SHA-256 相同，为 `804b67e2d48d54646c322c92b8125b0c3425c083db41fcd29902eff45fe4d582`。
- 本机 HTTP：1440×1000、375×812 页面返回 200，均绘制 2,744 个建筑、无页面异常、无横向溢出；实际上传 v22 旧档提示不支持且 localStorage 不变。日志 `artifacts/shanghai-live-check.log`。
- 本机全部 `public/` 资源通过 `verifyPublic` 逐个 HTTP / SHA-256 校验。开发服务不提供构建清单；清单属于 `dist/` 发布产物，资源校验使用正确的源码服务目录。

## 浏览器回归证据与边界

首次完整运行在通知测试处中断：原夹具固定推进 1 分钟，在较短的新路线中已抵达。修正为按剩余时间比例推进。后续分段复核同时修正了依赖旧迁移自动补修车点的夹具、旧街区名称断言和 SVG 文本读取方式。

地图图例清理、角落署名移至帮助后分别完整执行 `python tests/browser-smoke.py`，每次 252 / 252 项通过，退出码为 0，日志分别为 `artifacts/legend-browser-smoke.log`、`artifacts/attribution-browser-smoke.log`。统一地图按钮后再次完整执行，**252 / 252 项通过，退出码为 0**，最新完整日志为 `artifacts/map-controls-browser-smoke.log`，`artifacts/browser-tests.json` 为该次完整结果。最后的横屏 CSS 避让调整在最终构建上额外通过原脚本的四视口地图检查，见 `artifacts/map-controls-final-browser.log`；五视口实际按钮操作验证见下文。

离线浏览器使用受控游戏时钟和模拟 AI，真实 rAF / 后台定时器另有检查；结果页三个视口均实际重新加载文档与本地存储。本机 HTTP 检查使用运行中的开发服务。以上均不等同于真实 AI 服务或公网部署验证。

## 预览

- 桌面：`artifacts/qinglan-map-1440.png`
- 手机：`artifacts/qinglan-map-375.png`
- 全城：`artifacts/qinglan-overview-1440.png`

数据许可、范围和复现步骤见 [MAP_DATA.md](MAP_DATA.md)。地图仅用于游戏，不模拟现实交通限制。

## 地图图例清理

- 删除左下角配送订单、城市地点、玩家位置的图例，以及对应的 17 条基础、纸色主题和响应式 CSS 规则。
- 本机 HTTP 页面在 1440×1000、375×812 下确认图例 DOM 不存在，地图控制按钮、比例尺和数据归属显示正常，无页面异常或横向溢出。
- 截图：`artifacts/map-clean-1440.png`、`artifacts/map-clean-375.png`。
- `npm run check`、`npm test`（1,185 / 1,185）、`npm run build` 通过；单测日志为 `artifacts/legend-unit-tests.log`。
- `python tests/browser-smoke.py`：单次完整运行 252 / 252 项通过，日志为 `artifacts/legend-browser-smoke.log`。

## 地图角落署名移至帮助

- 关闭 Leaflet 的常驻署名控件，删除两条相关主题样式；「帮助 → 地图来源与许可」保留 OpenStreetMap 署名、ODbL 许可和地图数据下载，以及 Leaflet 与 BSD 许可证。
- 本机 HTTP 页面在 1440×1000、375×812、320×740 下确认地图署名控件不存在；开始页和局内帮助均可查看来源信息，无页面异常或横向溢出。
- 浏览器实际点击下载，所得文件与 `public/js/city-data.js` 字节一致；本地 Leaflet 许可证返回 HTTP 200，包含完整 BSD 2-Clause 文本。日志 `artifacts/attribution-live-check.log`。
- 截图：`artifacts/map-without-attribution-1440.png`、`artifacts/map-without-attribution-375.png`、`artifacts/map-credits-help-320.png`。
- `npm run check`、`npm test`（1,185 / 1,185）、`npm run build`、`git diff --check` 通过；单测日志为 `artifacts/attribution-unit-tests.log`。
- `python tests/browser-smoke.py`：单次完整运行 252 / 252 项通过，日志为 `artifacts/attribution-browser-smoke.log`。

## 地图控制按钮统一

- 放大、缩小、定位和全图按钮统一 44×44 px；图标改为 22×22 px SVG，相同线宽并居中，保留中文无障碍名称。移除三条被覆盖的旧尺寸规则。
- 667×375 横屏原有日志及行动栏遮挡按钮；调整横屏工具栏、底部行动栏与日志的布局，日志内容可滚动。
- 在 1440×1000、375×812、320×740、667×375、812×375 五个视口实际测量四个按钮及图标，尺寸、中心位置均一致；通过点击缩放/全图、Enter 定位操作验证功能及游戏状态不变，无页面异常或横向溢出。日志 `artifacts/map-controls-live-check.log`。
- 截图：`artifacts/map-controls-1440.png`、`artifacts/map-controls-375.png`、`artifacts/map-controls-667.png`；工具栏局部截图为 `artifacts/map-control-bar-{width}.png`。
- `npm run check`、`npm test`（1,185 / 1,185）、`npm run build` 通过；单测日志 `artifacts/map-controls-unit-tests.log`。
- `python tests/browser-smoke.py`：单次完整运行 252 / 252 项通过，日志为 `artifacts/map-controls-browser-smoke.log`。最后的横屏 CSS 避让调整另以五视口实测验证，并在最终构建上重新执行原脚本的四视口地图用例，全部通过，日志为 `artifacts/map-controls-final-browser.log`。
- 最终构建与源码逐字节一致，`git diff --check` 通过。

## 发布前跨平台检查

- PR 首次 CI 的 1,185 项中仅 Leaflet 官方 CSS 哈希失败：Git 文本换行转换改变了上游 CRLF 字节。本机原文件哈希正确。
- `.gitattributes` 将本地 Leaflet JS/CSS 标记为 `-text` 并重新暂存官方原文件，保留原有官方 SHA-256 断言；同时验证 Git 索引内的字节，避免仅在 Windows 工作区通过。
