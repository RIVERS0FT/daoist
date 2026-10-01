# 地图数据与复现

游戏展示的是虚构青岚城：城市、道路、街区、水系、配送地址均使用虚构名称。几何底图覆盖上海全市；原老城厢数据及地点坐标保持不变。

## 章节区域

`CITY_REGION.administrative` 使用上海十六区的真实 OSM 多面体边界，与上海市界求交，保留凹形轮廓、洞和离散部分；区名仍虚构，不改地点 ID、坐标或道路。原 110 个地址全部位于首章青藤旧城。十六章按配置与十六区一一对应；地图遮罩与道路段求交共用同一边界，市外不按最近中心补区域。未开放区与市外不可借道，暂时无法沿开放区道路抵达的地址不发单。当前 484 个地址可沿市内道路抵达，青禾水乡一个地址仅能借道市外，暂不生成订单；沧澜群洲没有现有路网可达地址。制作大纲与各区地址数量见 [CHAPTER_OUTLINES.md](CHAPTER_OUTLINES.md)。

## 行政边界复现

静安区（relation 398353）和宝山区（398374）的完整几何不在 PBF 的可导出 area 中，使用 Overpass 同一快照补齐；主数据与补充数据 SHA-256、查询日期保存在行政数据中。行政区含市外农场与海域，通行范围与上海市界求交，标注点落在显示范围内陆地。

下载补充文件的查询：

```overpass
[out:xml][timeout:90][date:"2026-09-26T20:22:51Z"];
relation(id:398353,398374);
(._;>;);
out body;
```

保存为 artifacts/shanghai-district-supplement.osm 后运行：

```powershell
python scripts/import-shanghai-districts.py artifacts/shanghai-260926.osm.pbf artifacts/shanghai-district-supplement.osm
```

重新生成全市背景后再次执行行政边界导入。行政导入只更新 city-region-data.js 的行政字段，不改背景几何、制图分块、原路网或地点。已发布数据保持厘米精度，运行时 2 厘米容差仅处理坐标量化。

## 全市扩展数据

- 来源：[Geofabrik 上海提取](https://download.geofabrik.de/asia/china/shanghai.html)，固定输入 `shanghai-260926.osm.pbf`，OSM 数据时间为 2026-09-26T20:22:51Z。文件下载地址和 SHA-256 保存在 `city-region-data.js` 与 `city-routes.js`。
- 与原图共用米制原点（121.477° E、31.237° N）及换算常数，不重新投影已有地点。显示范围约 135 × 141 千米，包含崇明等岛屿；外缘含数据提取的少量邻接背景。
- 提取到 209,963 条道路 way、10,262 条水道、153,497 个建筑多边形、6,994 个绿地及 5,412 个水域。OSM 中 4 个无效 area 跳过；不存在的几何不通过程序补造。
- 海岸与行政边界叠加按 10 米精度闭合，修复独立边界微小错位导致的缺口；背景按总览/城区/街道分级简化，街道背景容差 5 米。可行驶道路叠加原始厘米精度顶点，路线不会按背景简化后的线移动。
- 原城区和外围共用同一背景、配色及细节阈值，不按旧城区边界切换图层；街道级别全域绘制已有建筑与小路。瓦片补绘边缘，同时读取相邻分区的文字及宽道路，避免分区边缘截断。
- 新增 375 个虚构配送地址，均在上海行政范围内并通过真实道路连接原城区。使用通往地址及相邻配送区之间的真实道路走廊；追加 90,827 个节点、94,091 条边，原有节点/道路前缀不改。没有轮渡、高速通行或跨水域虚构连接；道路不可达岛屿仅绘制背景。
- 原始派生核心库为 `public/js/city-data.js`；新增路网为 `city-routes.js`；地理分区索引及边界为 `city-region-data.js`，分区在 `public/map/region/`。这些文件随应用提供，均为 ODbL 派生数据库。路网使用无损差分整数及 gzip；背景按固定顺序整数编码及 gzip，解码逻辑分别在生成文件和 `map-region.js` 中。

复现（依赖 Python `osmium`、`shapely`）：

```powershell
python scripts/import-shanghai-region.py artifacts/shanghai-260926.osm.pbf
python scripts/import-shanghai-routes.py artifacts/shanghai-260926.osm.pbf
```

导入过程不修改原 `city-data.js`。新增地址 ID 按固定 4 千米候选网格编码，实际位置落在原始 OSM 节点上；旧地点不重排。制图分区只按视野读取本地资源，不请求 Geofabrik 或在线瓦片。`fflate` 0.8.3 用于启动时同步解码路网，MIT 许可证随包保存；分区使用浏览器原生 `DecompressionStream`。

## 原城区固定数据

- 来源：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。地理数据库及其派生数据按 ODbL 提供；游戏剧情、人物和代码不因地图许可而变为 OSM 数据。
- 提取服务：[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)，`https://overpass-api.de/api/interpreter`。
- 数据库时间：2026-09-26T00:43:04Z。
- 范围：南 31.208，西 121.477，北 31.237，东 121.510，WGS84。
- 派生数据库：[city-data.js](../public/js/city-data.js)，运行页面「帮助 → 地图来源与许可」可直接下载；文件记录源 JSON 的 SHA-256、提取时间、OSM 节点及 way ID。
- 规模：5,652 个节点、6,571 条道路边、1,655 个道路 way、2,868 个建筑/水系/绿地多边形。110 个虚构地址锚定已有节点，不额外画连接捷径。

查询如下，将响应保存为 `artifacts/shanghai-osm.json`：

```overpass
[out:json][timeout:50];
(
  way[highway](31.208,121.477,31.237,121.510);
  way[building](31.208,121.477,31.237,121.510);
  way[natural=water](31.208,121.477,31.237,121.510);
  way[waterway](31.208,121.477,31.237,121.510);
  way[landuse](31.208,121.477,31.237,121.510);
  way[leisure=park](31.208,121.477,31.237,121.510);
  relation[natural=water](31.208,121.477,31.237,121.510);
);
out body geom;
```

生成：

```powershell
python scripts/import-shanghai.py artifacts/shanghai-osm.json
```

工具仅使用 Python 标准库。道路按源节点 ID 连接；截取范围内最大的可步行连通分量，排除高速、快速路、台阶、私有或明确禁止通行的 way。不会把画面上相交但节点不同的高架/地面路段自动连接。建筑、水域与绿地取完整闭合 way，以矩形边界裁剪；本次不合并 relation 多面体，OSM 缺失的建筑或道路不通过程序生成补齐。

投影以范围中纬度的等距近似得到本地米制坐标，保留到厘米。游戏步行和骑行共享双向图，不模拟现实单行、禁骑、施工或时段限制，不作为现实导航。游戏耗时、资源消耗、回报继续由自身规则计算。

同一原始 JSON 和 `scripts/map-places.json` 可生成相同的输出；再次请求 Overpass 会取得更新的数据。更换已发布路网时必须重新考虑 schema 与途中状态，不能仅覆盖资源后继续沿旧路线读档。

运行时全部使用本地矢量文件，不访问在线地图或缓存第三方瓦片。Leaflet 许可证随 `public/vendor/leaflet/` 发布。「帮助 → 地图来源与许可」保留 OpenStreetMap 署名、版权及 ODbL 许可链接、地图数据下载入口，以及 Leaflet 署名与 BSD 许可证；开始页和局内均有帮助入口，地图角落不再显示常驻署名条。

署名位置依据 [OpenStreetMap 游戏与模拟应用指引](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Computer_games_and_simulations)：游戏可以在署名页、菜单或其他合适位置提供署名及详细许可信息。
