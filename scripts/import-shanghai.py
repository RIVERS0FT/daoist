"""Build the local ODbL map from an Overpass JSON extract (Python standard library).

Usage: python scripts/import-shanghai.py artifacts/shanghai-osm.json
Source, bounding box, query and game traffic abstraction: docs/MAP_DATA.md.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOUTH, WEST, NORTH, EAST = 31.208, 121.477, 31.237, 121.510
R = 6371008.8
KX = R * math.pi / 180 * math.cos(math.radians((NORTH + SOUTH) / 2))
KY = R * math.pi / 180
WIDTH, HEIGHT = round((EAST - WEST) * KX, 2), round((NORTH - SOUTH) * KY, 2)


def project(p):
    return [round((p['lon'] - WEST) * KX, 2), round((NORTH - p['lat']) * KY, 2)]


def inside(p):
    return SOUTH <= p['lat'] <= NORTH and WEST <= p['lon'] <= EAST


def clip(poly):
    # Sutherland-Hodgman; retain actual shoreline geometry at the extract boundary.
    for axis, bound, sign in [(0, 0, 1), (0, WIDTH, -1), (1, 0, 1), (1, HEIGHT, -1)]:
        out = []
        if not poly:
            return []
        a = poly[-1]
        for b in poly:
            ai, bi = sign * (a[axis] - bound) >= 0, sign * (b[axis] - bound) >= 0
            if ai != bi:
                t = (bound - a[axis]) / (b[axis] - a[axis])
                out.append([round(a[j] + t * (b[j] - a[j]), 2) for j in range(2)])
            if bi:
                out.append(b)
            a = b
        poly = out
    return poly if len(poly) >= 3 else []


def build(path):
    raw = path.read_bytes()
    source = json.loads(raw)
    nodes, edges, roads, polygons = {}, {}, [], []
    allowed = {'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link',
               'tertiary_link', 'residential', 'unclassified', 'living_street',
               'pedestrian', 'cycleway', 'service', 'footway', 'path'}
    for way in source['elements']:
        if way['type'] != 'way' or not way.get('geometry'):
            continue
        tags, geom = way.get('tags', {}), way['geometry']
        typ = tags.get('highway')
        if typ in allowed and tags.get('access') not in ('private', 'no') and tags.get('foot') != 'no' and tags.get('area') != 'yes':
            segments = []
            for i in range(1, len(geom)):
                if not (inside(geom[i-1]) and inside(geom[i])):
                    continue
                a, b = way['nodes'][i-1:i+1]
                pa, pb = project(geom[i-1]), project(geom[i])
                if pa == pb:
                    continue
                nodes[a], nodes[b] = pa, pb
                key = tuple(sorted((a, b)))
                edges[key] = (a, b, typ, way['id'])
                segments.append(key)
            roads.append({'id': way['id'], 'name': tags.get('name:zh') or tags.get('name', ''), 'type': typ, 'segments': segments})
        kind = ('building' if 'building' in tags else 'water' if tags.get('natural') == 'water' or tags.get('waterway') == 'riverbank'
                else 'park' if tags.get('leisure') in ('park', 'garden') or tags.get('landuse') in ('grass', 'forest', 'recreation_ground') else None)
        if kind and geom[0] == geom[-1]:
            ring = clip([project(p) for p in geom])
            if ring:
                polygons.append([kind, way['id'], ring])

    adjacency = {i: [] for i in nodes}
    for a, b, *_ in edges.values():
        adjacency[a].append(b)
        adjacency[b].append(a)
    unseen, components = set(nodes), []
    while unseen:
        stack = [min(unseen)]
        group = set(stack)
        unseen.remove(stack[0])
        while stack:
            for n in adjacency[stack.pop()]:
                if n in unseen:
                    unseen.remove(n)
                    group.add(n)
                    stack.append(n)
        components.append(group)
    connected = max(components, key=len)
    ids = sorted(connected)
    index = {v: i for i, v in enumerate(ids)}
    edge_list = [list((index[a], index[b], typ, wid)) for a, b, typ, wid in edges.values() if a in connected and b in connected]
    road_list = []
    for road in roads:
        seg = [[index[a], index[b]] for a, b in road['segments'] if a in connected and b in connected]
        if seg:
            road_list.append([road['id'], road['name'], road['type'], seg])

    # Stable game addresses anchored to existing OSM vertices. No invented connecting streets.
    used, places = set(), {}
    service_sites = {'home': (31.2172, 121.4900), 'garage': (31.2168, 121.4877),
                     'clinic': (31.2213, 121.4827), 'bookshop': (31.2250, 121.4850),
                     'temple': (31.2257, 121.4912), 'park': (31.2138, 121.4935), 'market': (31.2277, 121.4924)}
    catalog = json.loads((ROOT / 'scripts/map-places.json').read_text(encoding='utf-8'))
    candidates = [i for i in ids if 180 < nodes[i][0] < 2420 and 220 < nodes[i][1] < HEIGHT-180]
    for name, (lat, lon) in service_sites.items():
        p = project({'lat': lat, 'lon': lon})
        n = min((i for i in candidates if i not in used), key=lambda i: math.dist(nodes[i], p))
        places[name] = index[n]
        used.add(n)
    nearest = {i: min(math.dist(nodes[i], nodes[j]) for j in used) for i in candidates}
    for place_id in catalog:
        if place_id in places:
            continue
        n = max((i for i in candidates if i not in used), key=lambda i: (nearest[i], -i))
        places[place_id] = index[n]
        used.add(n)
        for i in candidates:
            nearest[i] = min(nearest[i], math.dist(nodes[i], nodes[n]))

    data = dict(id='shanghai-old-city-20260926', name='上海 · 老城厢',
                bounds=[SOUTH, WEST, NORTH, EAST], width=WIDTH, height=HEIGHT,
                timestamp=source['osm3s']['timestamp_osm_base'], sourceSHA256=hashlib.sha256(raw).hexdigest(),
                nodes=[[i, *nodes[i]] for i in ids], edges=edge_list, roads=road_list, polygons=polygons, places=places)
    output = '/* OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright\n * Derived geographic database: https://opendatacommons.org/licenses/odbl/1-0/\n * Generated by scripts/import-shanghai.py; provenance in docs/MAP_DATA.md. */\n'
    output += '(function(root){\n  "use strict";\n  const G=root.NightCourier=root.NightCourier||{};\n  G.CITY_DATA='
    output += json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n})(globalThis);\n'
    (ROOT / 'public/js/city-data.js').write_text(output, encoding='utf-8')
    print(json.dumps({'nodes': len(ids), 'edges': len(edge_list), 'roads': len(road_list), 'polygons': len(polygons), 'bytes': len(output.encode())}))


if __name__ == '__main__':
    build(Path(sys.argv[1]))
