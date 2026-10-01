# 游戏应用图标与功能图标验收

日期：2026-10-01。应用 1.22.0 / 存档 v25。交付 1 枚游戏应用图标、12 枚功能图标及制作资料，当前未接入页面，未提交、推送或部署。

## 制作结果

使用内置 `image_gen`，每枚独立生成单张 PNG，没有图集裁切或 CLI/API 回退。统一低饱和青绿、青灰与暖金的半写实手绘风格；无可读文字、水印或平台商标。所有最终文件均为 **1254×1254 RGBA PNG**，保留生成工具的原生 alpha，不做背景删除或重新编码。

完整路径与用途映射见 [ICON_ASSETS.md](ICON_ASSETS.md)，全部实际生成提示词见 [icon-prompts.json](icon-prompts.json)。应用图标为青绿色圆角底板上的配送箱与莲花标记，底板外四角透明；功能图标仅保留对应物件，背景透明。

| 文件 | 意象 | 字节数 |
| --- | --- | ---: |
| `public/art/game-icon-v1.png` | 配送箱与莲花，应用入口原稿 | 2,588,788 |
| `public/art/icons/delivery-v1.png` | 配送保温箱 | 1,649,221 |
| `public/art/icons/cultivation-v1.png` | 青玉莲花 | 1,560,386 |
| `public/art/icons/alchemy-v1.png` | 青铜药鼎 | 1,553,741 |
| `public/art/icons/auction-v1.png` | 木质拍卖槌 | 990,662 |
| `public/art/icons/sect-v1.png` | 青瓦山门 | 1,117,704 |
| `public/art/icons/system-v1.png` | 方孔外卖币 | 1,671,222 |
| `public/art/icons/inventory-v1.png` | 束口行囊 | 1,758,834 |
| `public/art/icons/bonds-v1.png` | 双股交织绳结 | 1,162,896 |
| `public/art/icons/vehicle-v1.png` | 现代电动车 | 1,500,289 |
| `public/art/icons/rest-v1.png` | 温热茶杯 | 911,174 |
| `public/art/icons/regions-v1.png` | 折叠地图与定位针 | 1,410,204 |
| `public/art/icons/help-v1.png` | 打开的素色手册 | 1,121,297 |

功能图标合计 16,407,630 字节，含应用图标共 18,996,418 字节。新文件以 v1 命名，不覆盖此前插画或现有 SVG 资源。

## 文件与显示检查

- 13 张 PNG 签名、全部 chunk CRC、结束边界、RGBA 色彩模式、正方形尺寸通过检查；最终源码、`dist` 与清单的大小及 SHA-256 完全一致。
- 功能图标完全透明像素比例为 42.17%–74.23%。不透明主体完整；最外侧边缘 alpha 最大为 1/255，无 alpha > 16/255 的边界像素。初始严格零边缘检查捕获极低 alpha 噪点，进一步检查记录其实际强度；没有把噪点当作不透明主体裁切或修改原图。
- Microsoft Edge 154.0.4258.48 / Playwright / Windows 中实际加载 48 个功能图标样本，覆盖 12 图 × 128/64 px × 深青绿/浅纸色背景，无页面错误或横向溢出。目检轮廓及缩小后的辨识度，药鼎/茶杯、配送箱/行囊、地图/手册可区分，无明显白底、棋盘格或被裁切主体。
- 应用图标分别以 256、128、64、32、16 px 在两种背景加载，10 个样本无页面错误。小尺寸保留整体配送箱轮廓，16 px 时莲花细节不等于完整原稿细节，未声称已完成小尺寸专用 favicon 制作。
- `npm run build` 成功：174 个静态资源加校验清单。最终 RIVERSOFT 本地包校验成功：175 文件、36,817,516 字节，包含 16 张本批及此前最终美术素材；未连接发布服务。
- 文档结构专项 4 / 4 通过；`git diff --check` 通过。

本机忽略产物：`artifacts/icon-assets-report.json`、`artifacts/game-app-icon-report.json`、`artifacts/game-icons-preview.png`、`artifacts/game-app-icon-preview.png`。预览为浏览器加载实际 PNG 后的截图，未用图像后处理替代最终素材。

## 验证边界

本轮没有修改运行时脚本、页面引用或样式，没有提前开放功能、改动玩法、路网、章节、世界状态或现有控件。PNG 会随构建复制，但页面当前尚未加载它们；应用图标尚未替换 favicon，未引入 PWA 或安装流程。

执行的是独立素材预览和文件/构建检查，没有重跑完整游戏浏览器、Node 全套或帧性能。实际接入页面后仍需验证控件尺寸、无障碍名称、低分辨率展示和加载开销。CI、公网、真实手机及部署未验证。
