# 地图数据与复现

游戏展示的是虚构青岚城：城市、道路、街区、水系、配送地址均使用虚构名称。几何底图使用上海老城厢及周边的 OpenStreetMap 数据。

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
