"""Export Shanghai's 16 OSM administrative polygons in the published metre grid.

Requires osmium and shapely; never rewrites places, roads or scenery chunks.
Real names are import keys only. Runtime names remain fictional.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import osmium
from shapely import wkb
from shapely.geometry import Polygon, box
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[1]
KX = 6371008.8 * math.pi / 180 * math.cos(math.radians((31.237 + 31.208) / 2))
KY = 6371008.8 * math.pi / 180
# One authored chapter per administrative district; geography stays independent.
DISTRICTS = {
    '黄浦区': ('310101', '青藤旧城', 1),
    '徐汇区': ('310104', '长乐西坊', 2),
    '长宁区': ('310105', '松风西城', 3),
    '静安区': ('310106', '听雨北城', 4),
    '虹口区': ('310109', '杏花里', 5),
    '杨浦区': ('310110', '云汀东城', 6),
    '普陀区': ('310107', '松风西关', 7),
    '闵行区': ('310112', '归云南郊', 8),
    '宝山区': ('310113', '望舒北境', 9),
    '嘉定区': ('310114', '星河北原', 10),
    '浦东新区': ('310115', '星河东原', 11),
    '青浦区': ('310118', '青禾水乡', 12),
    '奉贤区': ('310120', '落霞海门', 13),
    '松江区': ('310117', '远岫南原', 14),
    '金山区': ('310116', '南烛海岸', 15),
    '崇明区': ('310151', '沧澜群洲', 16),
}


def project(x, y, z=None):
    return ((x - 121.477) * KX, (31.237 - y) * KY)


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.districts = {}
        self.boundary = None

    def area(self, area):
        tags = dict(area.tags)
        name = tags.get('name:zh') or tags.get('name')
        municipal = area.orig_id() == 913067 and tags.get('boundary') == 'administrative'
        if not municipal and (tags.get('boundary') != 'administrative' or tags.get('admin_level') != '6' or name not in DISTRICTS):
            return
        geometry = transform(project, wkb.loads(self.factory.create_multipolygon(area), hex=True))
        if not geometry.is_valid:
            raise ValueError(f'Invalid district geometry: {name}')
        if municipal:
            self.boundary = geometry
            return
        if name in self.districts:
            raise ValueError(f'Duplicate district: {name}')
        self.districts[name] = (area.orig_id(), geometry)


def build(source, supplement=None):
    extract = Extract()
    extract.apply_file(str(source), locations=True)
    if supplement:
        extract.apply_file(str(supplement), locations=True)
    missing = DISTRICTS.keys() - extract.districts.keys()
    if missing:
        raise ValueError(f'Missing Shanghai districts: {sorted(missing)}')
    if extract.boundary is None:
        raise ValueError('Shanghai municipal boundary is missing')
    target = ROOT / 'public/js/city-region-data.js'
    content = target.read_text(encoding='utf8')
    prefix, raw = content.split('G.CITY_REGION=', 1)
    raw = raw.split(';\n', 1)[0]
    data = json.loads(raw)
    # Farms owned by a district outside Shanghai are not gameplay territory.
    # Label anchors use land inside the display extent, rather than offshore seas.
    def pairs(ring):
        return list(zip(ring[::2], ring[1::2]))
    land = unary_union([Polygon(pairs(p[0]), [pairs(r) for r in p[1:]]) for p in data['land']])
    visible_land = land.intersection(box(*data['bounds']))
    records = []
    for name, (code, label, chapter) in DISTRICTS.items():
        relation, geometry = extract.districts[name]
        geometry = geometry.intersection(extract.boundary)
        label_land = geometry.intersection(visible_land)
        parts = list(label_land.geoms) if hasattr(label_land, 'geoms') else [label_land]
        anchor = max(parts, key=lambda p: p.area).representative_point()
        def ring(coords):
            return [[round(x, 2), round(y, 2)] for x, y in coords]
        polygons = [
            [ring(p.exterior.coords)] + [ring(r.coords) for r in p.interiors]
            for p in (geometry.geoms if hasattr(geometry, 'geoms') else [geometry])
        ]
        records.append({'id': f'district-{code}', 'name': label, 'chapter': chapter,
                        'osmRelation': relation, 'seed': [round(anchor.x, 2), round(anchor.y, 2)],
                        'bounds': [round(v, 2) for v in geometry.bounds], 'polygons': polygons})
        print(code, name, relation, 'rings', sum(len(p) for p in polygons),
              'vertices', sum(len(r) for p in polygons for r in p), flush=True)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if data['sourceSHA256'] != digest:
        raise ValueError('District source differs from the published scenery source')
    data['administrative'] = {'sourceSHA256': digest, 'precisionMeters': 0.01, 'districts': records}
    if supplement:
        data['administrative']['supplement'] = {
            'source': 'https://overpass-api.de/api/interpreter',
            'timestamp': '2026-09-26T20:22:51Z',
            'relations': [398353, 398374],
            'sha256': hashlib.sha256(supplement.read_bytes()).hexdigest(),
        }
    target.write_text(prefix + 'G.CITY_REGION=' + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
                      + ';\n})(globalThis);\n', encoding='utf8')


if __name__ == '__main__':
    build(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else None)
