# 游戏图标素材

当前状态：**12 枚图标已接入对应功能入口。** 全部为 1254×1254 RGBA PNG，保留原生透明通道；界面与性能验证见 [TEST_REPORT_ART_INTEGRATION_2026-10-01.md](TEST_REPORT_ART_INTEGRATION_2026-10-01.md)。

统一美术方向见 [ART_DIRECTION.md](ART_DIRECTION.md)。正式玩法与功能开放规则仍以 [GAME_DESIGN.md](GAME_DESIGN.md)、`public/js/data.js` 和 `public/js/progression.js` 为准。主导航名称与原 SVG 图标映射来自 `public/js/app.js`；配送标记来自 `public/js/map.js`。

## 游戏应用图标

[game-icon-v1.png](../public/art/game-icon-v1.png) 为独立的游戏入口图标原稿，1254×1254 RGBA PNG：深青绿色圆角底板、暖金配送箱、青玉莲花标记，底板外四角透明。已用于页面 favicon 和开始页品牌标记；不包含 PWA/安装流程。完整提示词记录在 `icon-prompts.json` 的 `application` 条目。

## 首批图标映射

| 素材 key | 标签 | 面板或用途 | 原 SVG key | 保存路径 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `delivery` | 配送 | 地点面板配送订单标题；不增加独立接取餐品功能 | `delivery`，地图专用形状 | [delivery-v1.png](../public/art/icons/delivery-v1.png) | 已接入 |
| `cultivation` | 修行 | 主导航 `cultivation` 面板 | `lotus` | [cultivation-v1.png](../public/art/icons/cultivation-v1.png) | 已接入 |
| `alchemy` | 炼药 | 主导航 `alchemy` 面板 | `tea` | [alchemy-v1.png](../public/art/icons/alchemy-v1.png) | 已接入 |
| `auction` | 拍卖 | 主导航 `auction` 面板 | `auction` | [auction-v1.png](../public/art/icons/auction-v1.png) | 已接入 |
| `sect` | 宗门 | 主导航 `sect` 面板 | `home` | [sect-v1.png](../public/art/icons/sect-v1.png) | 已接入 |
| `system` | 外卖系统 | 主导航 `system` 面板；名称使用 `G.SYSTEM_NAME` | `spark`；顶栏外卖币入口使用 `coin` | [system-v1.png](../public/art/icons/system-v1.png) | 已接入 |
| `inventory` | 行囊 | 主导航 `inventory` 面板 | `bag` | [inventory-v1.png](../public/art/icons/inventory-v1.png) | 已接入 |
| `bonds` | 羁绊 | 主导航 `bonds` 面板 | `people` | [bonds-v1.png](../public/art/icons/bonds-v1.png) | 已接入 |
| `vehicle` | 座驾 | 主导航 `vehicle` 面板 | `bike` | [vehicle-v1.png](../public/art/icons/vehicle-v1.png) | 已接入 |
| `rest` | 歇息 | 主导航 `rest` 面板 | `tea` | [rest-v1.png](../public/art/icons/rest-v1.png) | 已接入 |
| `regions` | 区域 | 当前区域提示及 `chapters` 面板；展示十六章对应区域 | 无；原为文字区域入口 | [regions-v1.png](../public/art/icons/regions-v1.png) | 已接入 |
| `help` | 帮助 | 主导航和开始页的 `help` 面板 | `help`；开始页原为文字按钮 | [help-v1.png](../public/art/icons/help-v1.png) | 已接入 |

上表记录本机最终保存路径。`regions` 是素材 key，实际面板 ID 仍为 `chapters`，不新增地图模式或新的权限入口。

接入通过 `G.Art.icon(key)` 白名单查询。导航图标桌面 32 px、手机 28 px，动作卡片 40 px，区域入口 20 px（横屏紧凑布局 14 px），订单标题 21 px；导航命中区域至少 44 px。所有入口保留文字与原开放条件，图片不接收点击，加载失败隐藏图像。地图中的地点和订单标记继续使用现有 SVG，避免增加瓦片和实时绘制开销。

主导航参考《鬼谷八荒》公开地图界面的圆形物件入口：采用桌面 48 px、手机 44 px 的独立深青底座、细暖金边缘和现有手绘图标。文字标签轻微覆盖圆底下缘，叠于图标上层并带 0.6 px 深青细描边，填色最后绘制。当前面板、悬停和键盘聚焦强调边缘；关闭面板清除当前状态。圆底、边框和高亮通过 CSS 绘制，未复制参考游戏的图片或字体。窄屏导航内部滚动，并为日志与行动条保留空间。相关验证见 [圆形导航验证报告](TEST_REPORT_CIRCULAR_NAV_2026-10-01.md)。

## 物件与语义边界

每枚图标表达一个明确功能，优先选择单个物件：配送使用保温配送袋或配送箱；修行使用莲花；炼药使用小型药鼎；拍卖使用木质拍卖槌；宗门使用简洁山门；外卖系统使用外卖币；行囊使用束口布袋；羁绊使用由两股绳交织成的绳结；座驾使用现代城市电动车；歇息使用温热茶杯；区域使用折叠地图；帮助使用打开的小手册。炼药与歇息分别采用药鼎、茶杯，避免两种功能沿用同一物件。

配送图标只表达已有送达行为，不画取餐窗口、领取餐品、餐厅交接或新步骤。修行、宗门和座驾不出现御剑、飞行、武器战斗、传送门或自动移动。拍卖槌表达已有竞价，不使用骰子、老虎机、随机抽奖或赌场意象。外卖系统不出现器灵本体、主线真相或后期组织符号。羁绊包括友情、道友与可选感情路线，使用普通联系意象，不以情侣、心形或亲密关系代表所有人物。

区域图标中的折叠地图只作概念装饰，不绘制可被误认成真实路网的清晰线路，不标注真实上海地名，也不表示某个未开放区已经可通行。所有素材不包含可读文字、数字、品牌、机构标志或水印。

## 视觉与生成规范

本批使用低饱和青绿、深青灰与适量暖金的手绘数字绘画，克制侧光、自然材质与统一阴影。物件轮廓简明，主体居中，避免细碎装饰、复杂景深、大面积光效或与其他图标相混淆的形状。

每枚图标独立生成一张方形 PNG，使用真实透明背景，不添加白底、色底、棋盘格、底座或圆形背景板。物件与轻微阴影之间保持连续的透明边缘，四边留足安全余量，最外侧轮廓、提手、车轮、蒸汽和发光边缘不得贴边或被裁切。不通过一张多图拼版裁切出整套素材。

验收必须在 **64×64 px** 显示尺寸下检查轮廓与功能辨识度，并分别预览于当前深青绿色界面和浅色地图背景。透明边缘不能出现可见白边或残留棋盘格；缩小后仍须区分药鼎与茶杯、配送袋与行囊、帮助手册与区域地图。

本批使用内置 `image_gen`，12 枚图标分别独立生成，未使用 CLI/API 回退。完整原始提示词按素材 key 与路径保存在 [icon-prompts.json](icon-prompts.json)。深浅背景的 128 px / 64 px 实际图片预览在本机忽略产物 [game-icons-preview.png](../artifacts/game-icons-preview.png)，完整验收见 [TEST_REPORT_ICON_ASSETS_2026-10-01.md](TEST_REPORT_ICON_ASSETS_2026-10-01.md)。

## 版本、验收与发布

文件采用 `{key}-vN.png` 命名，`vN` 为素材修订号，不等同于应用版本或存档 schema。默认新增修订，保留既有文件，不静默覆盖。验收后更新本页状态；接入页面及浏览器验证单独记录，不以生成完成代替接入完成。

图标存放于 `public/art/icons/`，以本地相对路径随静态包发布，运行时不依赖外部图床或图像生成服务。后续使用仍须保留现有功能开放条件、无障碍名称与控件命中区域，不因为图标已存在就提前显示未开放功能。

素材只改变视觉，不写游戏状态，不改地点 ID、地图坐标、行政区边界或 `ROAD_NODES/ROAD_EDGES`，不新增玩法、奖励、资产、时间推进、瞬移或路线捷径。地图绘制与交互的性能及浏览器验证在实际接入时按仓库规则执行。
