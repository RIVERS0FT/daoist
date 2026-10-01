# 行囊物品美术素材

当前状态：**37 张透明原稿已生成并接入行囊，物品查询、渲染与固定静态路由已完成；本机素材、映射、HTTP 与文档专项 66/66 通过，桌面与手机帧性能专项 2/2 通过。** 浏览器场景证据见专项报告，发布验证见 [1.22.0 发布验证](TEST_REPORT_RELEASE_1.22.0.md)；应用版本为 1.22.0，存档 schema 为 v25。

统一美术方向见 [ART_DIRECTION.md](ART_DIRECTION.md)，内置 `image_gen` 的完整中文提示词、尺寸与每个物品 ID 的明确映射见 [item-prompts.json](item-prompts.json)。资产、浏览器与性能验证证据见 [行囊美术验证报告](TEST_REPORT_INVENTORY_ART_2026-10-01.md)。

## 覆盖范围

当前 `G.ITEMS` 共 213 个 ID，来自 `public/js/data.js` 与加载后的 `public/js/sects.js`：

| 分组 | 素材数量 | 对应物品 ID 数量 | 共享规则 |
| --- | ---: | ---: | --- |
| 成品丹药 | 12 | 108 | 每种药的 1–9 阶共用一张药种素材；清心散使用散剂纸包，其余丹药以瓶器轮廓与自然颜色区分 |
| 药材 | 14 | 64 | 按草、叶芽、苔、藤、藻、根茎、花蕊、芝菌、果、枝木、种子、矿砂、灵髓、虫蜕的形态共享 |
| 独立道具与装备 | 5 | 5 | 灵石、阵心碎玉、护身符、纳灵玉佩、青云法衣分别绘制 |
| 功法卷册 | 6 | 36 | 11 本系统通用功法共用一张；体修、药修、剑修、符阵修、神识修各 5 本共用对应卷册 |
| 合计 | 37 | 213 | 全部当前 ID 有明确映射，无运行时猜测 |

药材外形仅是制作端美术归类，不改变药性、名称或物品配置。空蝉蜕独立使用虫蜕；朱雀羽苔仍是苔形药材；磁极砂使用矿砂，曜石蕊按矿石花芯归矿物；玉竹芯按药用根茎、青龙须按须根表现；九转灵髓独立使用凝聚精华素材。64 项完整覆盖记录保存在提示词清单的 `details.materialCoverage`。

36 本功法按可信 `source` 固定分组：`system → manual-system`、`jingang → manual-body`、`baicao → manual-alchemy`、`lingxiao → manual-sword`、`tingyu → manual-talisman`、`xuanwei → manual-mind`；不按功法标题、效果或任意文本猜测分组。

## 素材白名单

下表列出全部 37 个素材 key 与实际物品 ID。路径为原稿保存位置；全部实际 PNG 均为 1254×1254 RGBA，尺寸、真实透明通道与文件完整性已通过本机素材专项验证。

| 素材 key | 中文标签 | 对应实际物品 ID | ID 数量 | 原稿路径 |
| --- | --- | --- | ---: | --- |
| `pill-heal` | 回春丹 | `heal`、`heal-2`、`heal-3`、`heal-4`、`heal-5`、`heal-6`、`heal-7`、`heal-8`、`heal-9` | 9 | [pill-heal-v1.png](../public/art/items/pill-heal-v1.png) |
| `pill-stamina` | 清心散 | `stamina`、`stamina-2`、`stamina-3`、`stamina-4`、`stamina-5`、`stamina-6`、`stamina-7`、`stamina-8`、`stamina-9` | 9 | [pill-stamina-v1.png](../public/art/items/pill-stamina-v1.png) |
| `pill-qi` | 凝气丹 | `qi`、`qi-2`、`qi-3`、`qi-4`、`qi-5`、`qi-6`、`qi-7`、`qi-8`、`qi-9` | 9 | [pill-qi-v1.png](../public/art/items/pill-qi-v1.png) |
| `pill-foundation` | 破境丹 | `foundation`、`foundation-2`、`foundation-3`、`foundation-4`、`foundation-5`、`foundation-6`、`foundation-7`、`foundation-8`、`foundation-9` | 9 | [pill-foundation-v1.png](../public/art/items/pill-foundation-v1.png) |
| `pill-spiritpill` | 回灵丹 | `spiritpill`、`spiritpill-2`、`spiritpill-3`、`spiritpill-4`、`spiritpill-5`、`spiritpill-6`、`spiritpill-7`、`spiritpill-8`、`spiritpill-9` | 9 | [pill-spiritpill-v1.png](../public/art/items/pill-spiritpill-v1.png) |
| `pill-bodypill` | 锻体丹 | `bodypill`、`bodypill-2`、`bodypill-3`、`bodypill-4`、`bodypill-5`、`bodypill-6`、`bodypill-7`、`bodypill-8`、`bodypill-9` | 9 | [pill-bodypill-v1.png](../public/art/items/pill-bodypill-v1.png) |
| `pill-greatqi` | 聚元丹 | `greatqi`、`greatqi-2`、`greatqi-3`、`greatqi-4`、`greatqi-5`、`greatqi-6`、`greatqi-7`、`greatqi-8`、`greatqi-9` | 9 | [pill-greatqi-v1.png](../public/art/items/pill-greatqi-v1.png) |
| `pill-marrowpill` | 玉髓丹 | `marrowpill`、`marrowpill-2`、`marrowpill-3`、`marrowpill-4`、`marrowpill-5`、`marrowpill-6`、`marrowpill-7`、`marrowpill-8`、`marrowpill-9` | 9 | [pill-marrowpill-v1.png](../public/art/items/pill-marrowpill-v1.png) |
| `pill-bloodpill` | 血元丹 | `bloodpill`、`bloodpill-2`、`bloodpill-3`、`bloodpill-4`、`bloodpill-5`、`bloodpill-6`、`bloodpill-7`、`bloodpill-8`、`bloodpill-9` | 9 | [pill-bloodpill-v1.png](../public/art/items/pill-bloodpill-v1.png) |
| `pill-vitalpill` | 养元丹 | `vitalpill`、`vitalpill-2`、`vitalpill-3`、`vitalpill-4`、`vitalpill-5`、`vitalpill-6`、`vitalpill-7`、`vitalpill-8`、`vitalpill-9` | 9 | [pill-vitalpill-v1.png](../public/art/items/pill-vitalpill-v1.png) |
| `pill-harmonypill` | 三元丹 | `harmonypill`、`harmonypill-2`、`harmonypill-3`、`harmonypill-4`、`harmonypill-5`、`harmonypill-6`、`harmonypill-7`、`harmonypill-8`、`harmonypill-9` | 9 | [pill-harmonypill-v1.png](../public/art/items/pill-harmonypill-v1.png) |
| `pill-spiritqi` | 灵元丹 | `spiritqi`、`spiritqi-2`、`spiritqi-3`、`spiritqi-4`、`spiritqi-5`、`spiritqi-6`、`spiritqi-7`、`spiritqi-8`、`spiritqi-9` | 9 | [pill-spiritqi-v1.png](../public/art/items/pill-spiritqi-v1.png) |
| `herb-grass` | 草形药材 | `herb`、`herb-13`、`herb-21`、`herb-33`、`herb-51` | 5 | [herb-grass-v1.png](../public/art/items/herb-grass-v1.png) |
| `herb-leaf` | 叶芽形药材 | `herb-2`、`herb-7`、`herb-19`、`herb-34`、`herb-55`、`herb-61` | 6 | [herb-leaf-v1.png](../public/art/items/herb-leaf-v1.png) |
| `herb-moss` | 苔形药材 | `herb-3`、`herb-23`、`herb-44`、`herb-60`、`herb-62` | 5 | [herb-moss-v1.png](../public/art/items/herb-moss-v1.png) |
| `herb-vine` | 藤形药材 | `herb-4`、`herb-14`、`herb-31`、`herb-37`、`herb-46`、`herb-54` | 6 | [herb-vine-v1.png](../public/art/items/herb-vine-v1.png) |
| `herb-algae` | 藻形药材 | `herb-5`、`herb-52` | 2 | [herb-algae-v1.png](../public/art/items/herb-algae-v1.png) |
| `herb-root` | 根茎形药材 | `herb-6`、`herb-8`、`herb-15`、`herb-25`、`herb-26`、`herb-27`、`herb-30`、`herb-59`、`herb-63` | 9 | [herb-root-v1.png](../public/art/items/herb-root-v1.png) |
| `herb-flower` | 花蕊形药材 | `herb-9`、`herb-12`、`herb-16`、`herb-18`、`herb-20`、`herb-35`、`herb-36`、`herb-42`、`herb-49`、`herb-58` | 10 | [herb-flower-v1.png](../public/art/items/herb-flower-v1.png) |
| `herb-mushroom` | 芝菌形药材 | `herb-10`、`herb-17`、`herb-28`、`herb-29`、`herb-56` | 5 | [herb-mushroom-v1.png](../public/art/items/herb-mushroom-v1.png) |
| `herb-fruit` | 果实形药材 | `herb-11`、`herb-24`、`herb-32`、`herb-38`、`herb-45`、`herb-53`、`herb-57` | 7 | [herb-fruit-v1.png](../public/art/items/herb-fruit-v1.png) |
| `herb-branch` | 枝木形药材 | `herb-22`、`herb-41`、`herb-48` | 3 | [herb-branch-v1.png](../public/art/items/herb-branch-v1.png) |
| `herb-seed` | 种子形药材 | `herb-39`、`herb-43` | 2 | [herb-seed-v1.png](../public/art/items/herb-seed-v1.png) |
| `herb-mineral` | 矿砂形药材 | `herb-47`、`herb-50` | 2 | [herb-mineral-v1.png](../public/art/items/herb-mineral-v1.png) |
| `herb-essence` | 灵髓形药材 | `herb-64` | 1 | [herb-essence-v1.png](../public/art/items/herb-essence-v1.png) |
| `herb-insect` | 虫蜕形药材 | `herb-40` | 1 | [herb-insect-v1.png](../public/art/items/herb-insect-v1.png) |
| `item-mana` | 灵石 | `mana` | 1 | [item-mana-v1.png](../public/art/items/item-mana-v1.png) |
| `item-fragment` | 阵心碎玉 | `fragment` | 1 | [item-fragment-v1.png](../public/art/items/item-fragment-v1.png) |
| `item-charm` | 护身符 | `charm` | 1 | [item-charm-v1.png](../public/art/items/item-charm-v1.png) |
| `item-jade` | 纳灵玉佩 | `jade` | 1 | [item-jade-v1.png](../public/art/items/item-jade-v1.png) |
| `item-robe` | 青云法衣 | `robe` | 1 | [item-robe-v1.png](../public/art/items/item-robe-v1.png) |
| `manual-system` | 系统通用功法卷册 | `breathing`、`lightstep`、`vital-breath`、`long-breath`、`gather-spirit`、`quiet-heart`、`night-meditation`、`river-body`、`steady-road`、`small-fire`、`inner-sea` | 11 | [manual-system-v1.png](../public/art/items/manual-system-v1.png) |
| `manual-body` | 体修功法卷册 | `iron-skin`、`stone-breath`、`bull-march`、`golden-body`、`mountain-bone` | 5 | [manual-body-v1.png](../public/art/items/manual-body-v1.png) |
| `manual-alchemy` | 药修功法卷册 | `herbal-breath`、`fire-sense`、`double-dew`、`herbal-memory`、`green-cauldron` | 5 | [manual-alchemy-v1.png](../public/art/items/manual-alchemy-v1.png) |
| `manual-sword` | 剑修功法卷册 | `sword-step`、`sword-breath`、`sword-heart`、`sword-body`、`sword-sky` | 5 | [manual-sword-v1.png](../public/art/items/manual-sword-v1.png) |
| `manual-talisman` | 符阵修功法卷册 | `rain-breath`、`steady-heart`、`gentle-fire`、`city-ward`、`linked-veins` | 5 | [manual-talisman-v1.png](../public/art/items/manual-talisman-v1.png) |
| `manual-mind` | 神识修功法卷册 | `mind-lamp`、`mind-calm`、`mind-thread`、`mind-mirror`、`mind-return` | 5 | [manual-mind-v1.png](../public/art/items/manual-mind-v1.png) |

## 视觉、生成与原稿

每张独立生成一个完整物件，不生成拼版再裁图。采用半写实手绘，古铜、青玉、陶瓷、木、纸、布和植物的自然配色；丹药通过不同瓶型与主要色块区分，草叶、根木、苔藻保留清晰形态。主体居中约占画布 70%，留足透明边距，所有瓶塞、枝叶、根须与卷轴端点完整。64 px 查看仍须辨认大轮廓。

必须是真实 alpha 透明 PNG；不画文字、伪文字、品阶、数量、背景、底座、UI 外框、光环、地面阴影、人物或手。药种名称、真实品阶与数量只由 HTML 渲染。原稿直接保存于 `public/art/items/{key}-v1.png`，不裁切、不另行缩小、不压缩；仅通过 CSS 等比缩放展示。

使用内置 `image_gen` 分别生成，提示词记录在 [item-prompts.json](item-prompts.json)。`v1` 是素材修订号，不改变应用版本、物品 ID 或存档 schema；后续修订使用新文件并保留原稿。

## 接入与状态边界

`G.Art.item(id)` 只查询 `art.js` 内固化的明确 ID 白名单，返回冻结的 `{key, path}` 或 `null`。`G.Art.items` 是冻结的素材 key → 资产对象表，`G.Art.itemMap` 是冻结的物品 ID → 素材 key 表。浏览器不读取 `docs/`、不从名称推断图片，不接受 AI 文本、未知 ID、原型名称或任意外来路径；查询不读写玩家状态，不推进时间，不发奖。

当前图片只用于行囊卡片，系统商店仍保留原字形展示。只展示玩家实际库存、已学功法与已装备物件，沿用既有所有权和操作规则；映射存在不表示玩家已经拥有物品。桌面图片 64 px，窄屏 56 px，使用 `object-fit: contain`，不响应指针；名称、数量、品阶、说明和使用按钮仍是独立 HTML 元素。丹药与药材品阶来自可信配置。图片声明原始尺寸，异步解码并按需加载，不增加帧循环或状态刷新入口。

加载失败时隐藏图片并显示原字形；文本、数量、品阶和操作继续保留。图片不可遮挡按钮或正文，也不能改变消耗、收益、修炼、功法学习和装备效果。使用物品仍由 `G.perform` 校验并结算，持续时间仍只由 `G.advance` 推进。

服务器逐一列入 37 张物品 PNG 固定路径，总美术白名单为 61 张 PNG，含保留的三张 v1 青玉 UI 纹饰；不开放整个目录。新增静态路由后须重启长驻本地服务，并通过 HTTP 核对正式资源与 MIME。

## 验证记录

相关源码与资产专项核对 213 个 ID、37 个 key、64 个药材和 36 本功法的集合一致性，检查 PNG 尺寸、真实透明通道与完整性，验证未知 ID 与路径拒绝、查询无状态写入。浏览器需覆盖桌面、手机横竖屏、长标题、真实品阶、使用按钮、滚动及图片失败回退。

帧性能场景使用 `python tests/browser-performance.py --root public --scenes inventory-art`，桌面与手机场景 2/2 通过。测试以当前规则校验的独立存档与真实行囊面板为基础，包含 175 种非唯一消耗物品/药材，以及已学的吐纳真诀、轻身诀和已装备的纳灵玉佩、青云法衣；测试库存不属于玩家真实存档。按仓库规则记录整帧 P95 / P99 / 最大值、超预算比例、全部源码模块采样及浏览器布局/绘制/合成/栅格/GPU 服务线程开销。实际数据见 [行囊美术验证报告](TEST_REPORT_INVENTORY_ART_2026-10-01.md)；零采样不等于零开销，多线程时间不得相加当作帧长。

推送前仍须完成仓库规定的完整检查、构建、浏览器回归与针对 `dist` 的性能验证；本机专项不表示 CI、线上部署或公网验收已完成。

