# 行囊物件图专项验证 · 2026-10-01

范围：行囊中的包内物件 PNG、可信映射和现有文字/使用交互。不把隔离的全物品所有权夹具当作实际游戏进度验证。

## Node 素材与查询专项

`npm run check` 通过，相关 Node 专项 66 项全部通过（主代理执行）。其中 `tests/item-art.test.mjs` 覆盖清单中 37 张 PNG 的尺寸、逐块 CRC、完整像素解码与真实透明像素；全部 213 个当前物品 ID、36 心法与两件装备均映射至冻结的包内素材记录，未知 ID、原型名称与外来路径返回 `null`。重复图片查询不改变玩家资源、物品配置、时间或人物结识状态。

主代理实际执行 `node --test tests/item-art.test.mjs tests/art-assets.test.mjs tests/server.test.mjs tests/docs-structure.test.mjs`，终端结果为 tests 66 / pass 66 / fail 0；随后 `npm.cmd run check` 完整通过，章节大纲显示 current。Node 结果依据本轮终端输出，没有另外保存独立日志。

## 浏览器专项

`tests/browser-inventory-art.py` 专项通过。执行命令：

```sh
python tests/browser-inventory-art.py --url http://127.0.0.1:8787 --output artifacts/inventory-art
```

本轮实际解释器为 Python 3.11，使用现有 Playwright 依赖和 Microsoft Edge / Chromium。

使用真实 `server.mjs` 本机 8787 服务及其 HTTP 路由和 CSP。六个场景分别使用独立 browser context，不读取用户浏览器档案或存档；全物品夹具通过当前 `G.sanitizeSave` 恢复，五宗典籍同时具有合法引荐、故事前缀、等级与贡献支出记录。

| 视口 / 场景 | 卡片 | 素材种类 | 页面脚本错误 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 1440×1000 | 213 | 37 | 0 | 通过 |
| 375×812 | 213 | 37 | 0 | 通过 |
| 320×740 | 213 | 37 | 0 | 通过 |
| 812×375 | 213 | 37 | 0 | 通过 |
| 1440×1000，全部物件图 404 | 213 | 37 | 0 | 通过 |
| 320×740，全部物件图 404 | 213 | 37 | 0 | 通过 |

六个场景共同验证：

- 新档仍为回春丹、清心散、凝气丹三项，均从真实状态读取数量；素材查询不结识人物，不请求未结识的林晚/周野立绘。
- 全行囊包含 175 项普通物品、36 部已学心法和两件已装备法器；全部 ID 对应可信映射，逐段滚动后所有图片实际加载成功。普通物品数量使用存档上限 9999；完整名称、四位数量与现有 172 项丹药/药材配置品阶不被裁切，心法/装备保留“已生效”。
- 页面、弹窗和正文无横向溢出，弹窗在视口内；内部列表能滚至底部，点击关闭与 Escape 正常。装饰图片采用 `pointer-events: none`，使用按钮命中尺寸至少 44×44 px。
- 每场实际点击初始凝气丹后，库存从 1 到 0、修为从 0 到 35，完整游戏状态与 `G.perform` 的结果一致；只排除其真实写入时戳 `updatedAt` 进行比较，没有在测试中复制资源收益公式。使用后消耗卡片移除，未提前开启人物入口。
- 查看、滚动与关闭全行囊不改变暂停游戏状态。全部物件图返回 404 时显示原字形回退，文字、数量、品阶、关闭及丹药使用仍可操作。

37 张正式图片通过真实服务器逐一返回 HTTP 200、`image/png` 和正确 PNG 签名；正常场景的全部浏览器图片请求记录为 200，回退场景记录为 404。

截图与结构化证据：`artifacts/inventory-art/report.json` 及同目录 PNG。`gallery.png` 完整展示 37 张素材，每项并排呈现 128 px 和 64 px 尺寸，全部 37 项加载成功；`gallery.html` 使用本地相对路径，保留为独立审查文件，未进入产品页面。代表截图包括 `initial-1440x1000.png`、`initial-375x812.png`、`pills-320x740.png`、`herbs-375x812.png`、`techniques-320x740.png`、`equipment-812x375.png` 与 `initial-320x740-missing.png`。

## 帧性能专项

运行 `tests/browser-performance.py --root public --scenes inventory-art --output artifacts/performance-inventory-art-complete`，完整37张资源准备完毕后桌面与手机2 / 2通过。隔离存档持有175项消耗品与药材、两本系统心法和两件装备，共179张卡片；各视口实际打开/关闭4–5次，逐次解码凝气丹、青灵草、碎玉、心法、玉佩与法衣，并滚动跨越药材、心法和装备分组。展示和滚动不改变时间、坐标、行动或行程。该性能夹具与上方全213物品浏览器覆盖分别记录。

| 视口 | P95 ms | P99 ms | 最大 ms | 超预算比例 |
| --- | ---: | ---: | ---: | ---: |
| 1440x1000 | 9.331 | 14.669 | 115.36 | 0.965% |
| 375x812 | 9.289 | 17.178 | 120.848 | 1.148% |

预算16.667 ms，仓库门槛P95 ≤ 33.5 ms、最大 ≤ 150 ms、超预算加0.5 ms比例 ≤ 10%。P99同时审查。200 ms阻塞自检被捕获，最大206.357 ms，不计入真实场景预算。

全部21个加载模块保留采样行。下表合计两场景采样，P95和最大取场景最高值；零采样表示未采到，不代表模块没有开销。

| 源码模块 | 合计采样 ms | 最高帧P95 ms | 最大单帧采样 ms |
| --- | ---: | ---: | ---: |
| vendor/leaflet/leaflet.js | 0.000 | 0 | 0 |
| vendor/fflate/fflate.js | 0.000 | 0 | 0 |
| js/city-data.js | 0.000 | 0 | 0 |
| js/city-region-data.js | 0.000 | 0 | 0 |
| js/city-routes.js | 0.000 | 0 | 0 |
| js/data.js | 0.000 | 0 | 0 |
| js/chapters.js | 0.261 | 0 | 0.261 |
| js/sects.js | 0.000 | 0 | 0 |
| js/npc-profiles.js | 0.000 | 0 | 0 |
| js/engine.js | 4.090 | 0 | 1.31 |
| js/sect-engine.js | 4.346 | 0 | 1.041 |
| js/sect-stories.js | 0.000 | 0 | 0 |
| js/clock.js | 0.023 | 0 | 0.023 |
| js/storage.js | 3.864 | 0 | 1.005 |
| js/progression.js | 0.239 | 0 | 0.239 |
| js/map-art.js | 0.000 | 0 | 0 |
| js/map-region.js | 0.000 | 0 | 0 |
| js/map-tiles.js | 0.000 | 0 | 0 |
| js/map.js | 5.330 | 0 | 1.088 |
| js/art.js | 0.000 | 0 | 0 |
| js/app.js | 417.775 | 0 | 109.738 |

| 浏览器类别 | 合计 ms | 最高帧P95 ms | 最大单帧 ms |
| --- | ---: | ---: | ---: |
| style | 101.984 | 0.119 | 7.386 |
| layout | 358.695 | 0.611 | 99.427 |
| paint | 286.009 | 2.01 | 5.23 |
| composite | 245.297 | 1.11 | 3.114 |
| main_busy | 2389.848 | 6.13 | 119.241 |
| raster_workers | 61.749 | 0.377 | 2.431 |
| gpu_service | 703.109 | 4.255 | 41.484 |

同线程区间按并集统计；栅格和GPU服务线程可与主线程重叠，不能相加当作帧长。GPU服务线程CPU时间不等于物理GPU着色器耗时。帧口径为真实RAF回调入口间隔，不代表物理显示时间。

性能使用本地资源拦截供给，真实HTTP由浏览器专项和server.test.mjs另行验证。逐帧JSON、CPU profiles与完整trace在 `artifacts/performance-inventory-art-complete/`。最后两张图生成期间的首轮采样保留于 `artifacts/performance-inventory-art/`；正式结论采用全部37张原稿落盘后的复测。

## 验证边界

- 不改变资源、位置、奖励、模拟时间或物品业务规则；测试期待取自真实 `G.perform`。
- 只执行相关专项，未运行完整套件、未提交、未推送；CI、真实 AI、RIVERSOFT 部署与公网校验未在此确认。
