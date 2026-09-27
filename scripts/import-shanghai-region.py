"""Build offline, level-of-detail Shanghai scenery without changing game coordinates.

Requires osmium and shapely. Input: Geofabrik shanghai-260926.osm.pbf.
Output: public/map/region/*.json and public/js/city-region-data.js.
The original city-data.js routing graph and addresses are never rewritten.
"""
import base64
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
import pickle
from pathlib import Path
import sys

import osmium
from shapely import wkb, set_precision
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
KX = 6371008.8 * math.pi / 180 * math.cos(math.radians((31.237 + 31.208) / 2))
KY = 6371008.8 * math.pi / 180
WIDTHS = {'motorway':25,'trunk':23,'primary':21,'secondary':17,'tertiary':13,
          'motorway_link':14,'trunk_link':14,'primary_link':14,'secondary_link':12,
          'tertiary_link':10,'residential':9,'living_street':8,'unclassified':9,
          'pedestrian':8,'service':5,'cycleway':4,'footway':3,'path':2.5,'track':3}
NAMES = ['青岚','长乐','听雨','月渡','松风','杏花','归云','星河','栖鹤','春山','流萤','竹影','白鹭','望舒','青禾','落霞','南烛','云汀','远岫','鸣蝉','清晖','照雪','浮灯','隐泉','澄溪','云锦','拂柳','寒露','问山','知秋','临风','拾光']
DISTRICTS = {371650:'青岚旧城',398348:'云汀新区',398350:'听雨东城',398351:'杏花里',
             398353:'长乐中城',398374:'望舒北城',398886:'松风西城',398899:'栖鹤坊',
             1278188:'青藤南城',1278189:'归云原',1673543:'星河北境'}

def project(x,y,z=None):
    return ((x-121.477)*KX,(31.237-y)*KY)

def fictional(name, suffix='路'):
    n=int.from_bytes(hashlib.sha256(name.encode()).digest()[:4],'big')
    return NAMES[n%len(NAMES)]+NAMES[(n//len(NAMES))%len(NAMES)]+suffix

def rings(geometry):
    def packed(coords):
        out=[];last=None
        for x,y in coords:
            p=[round(x),round(y)]
            if p!=last:out.extend(p);last=p
        return out
    if geometry.geom_type=='LineString':return [packed(geometry.coords)]
    return [packed(geometry.exterior.coords)]+[packed(r.coords) for r in geometry.interiors]

def encode(features):
    result=bytearray()
    def integer(n):
        while n>=128:result.append((n&127)|128);n>>=7
        result.append(n)
    integer(len(features));previous=[0,0];previous_id=0
    for kind,width,key,bounds,paths,name in features:
        integer(kind);integer(round(width*2));integer(key-previous_id);previous_id=key
        integer(len(paths))
        for ring in paths:
            integer(len(ring)//2)
            for i,value in enumerate(ring):
                delta=value-previous[i%2];previous[i%2]=value;integer(delta*2 if delta>=0 else -delta*2-1)
        text=name.encode();integer(len(text));result.extend(text)
    return bytes(result)

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.features=[];self.coast=[];self.districts=[];self.boundary=None
        self.factory=osmium.geom.WKBFactory();self.counts=Counter()

    def way(self,w):
        tags=dict(w.tags);kind=tags.get('highway');water=tags.get('waterway')
        if kind not in WIDTHS and tags.get('natural')!='coastline' and water not in ('river','canal','stream'):return
        points=[project(n.lon,n.lat) for n in w.nodes if n.location.valid()]
        if len(points)<2:return
        line=LineString(points)
        if tags.get('natural')=='coastline':self.coast.append(line);return
        if kind in WIDTHS:
            name=tags.get('name:zh') or tags.get('name')
            self.features.append((4,WIDTHS[kind],f'w{w.id}',line,fictional(name) if name else ''))
            self.counts['roads']+=1
        elif water:
            self.features.append((5,{'river':18,'canal':8,'stream':3}[water],f'w{w.id}',line,''))
            self.counts['waterways']+=1

    def area(self,a):
        tags=dict(a.tags)
        admin=tags.get('boundary')=='administrative' and tags.get('admin_level') in ('4','6')
        kind=(3 if 'building' in tags else 2 if tags.get('natural')=='water' or tags.get('waterway')=='riverbank'
              else 1 if tags.get('leisure') in ('park','garden','nature_reserve') or tags.get('landuse') in ('grass','forest','recreation_ground') else None)
        if kind is None and not admin:return
        try:geometry=transform(project,wkb.loads(self.factory.create_multipolygon(a),hex=True))
        except RuntimeError:
            self.counts['invalid_areas_skipped']+=1;return
        if not geometry.is_valid:geometry=geometry.buffer(0)
        if admin:
            if a.orig_id()==913067:self.boundary=geometry
            elif tags.get('admin_level')=='6':
                p=geometry.representative_point()
                self.districts.append([a.orig_id(),DISTRICTS.get(a.orig_id(),fictional(tags.get('name',''),'郡')),round(p.x),round(p.y)])
            return
        for i,poly in enumerate(geometry.geoms if hasattr(geometry,'geoms') else [geometry]):
            if poly.is_empty or poly.geom_type!='Polygon':continue
            self.features.append((kind,0,f'{"w" if a.from_way() else "r"}{a.orig_id()}p{i}',poly,''))
            self.counts[['land','parks','waters','buildings'][kind]]+=1

def geometry_cache(source):
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    return ROOT/'artifacts'/f'shanghai-region-geometries-{digest[:16]}.pickle'

def build(source):
    extract=Extract();cache=geometry_cache(source)
    if cache.exists():
        # Local intermediate created by this importer, never a downloaded pickle.
        extract.features,extract.coast,extract.districts,extract.boundary,extract.counts=pickle.loads(cache.read_bytes())
    else:
        extract.apply_file(str(source),locations=True)
        cache.parent.mkdir(parents=True,exist_ok=True)
        cache.write_bytes(pickle.dumps((extract.features,extract.coast,extract.districts,extract.boundary,extract.counts)))
    print('Extracted',dict(extract.counts),flush=True)
    # Actual street/coast extent includes all mainland districts and Chongming.
    # Geofabrik's marine boundary extends far offshore; keep its real land detail
    # while avoiding an empty sea-dominated initial overview.
    extent=box(*unary_union([f[3].envelope for f in extract.features if f[0]==4]).bounds).buffer(1500).envelope
    if extract.boundary is None:raise ValueError('Shanghai administrative relation 913067 missing')
    # Independent OSM coast/admin boundaries can differ by a few metres.
    # Node the area overlay on a 10 m grid so clipped coast endpoints close;
    # route nodes remain untouched at their original centimetre precision.
    boundary=set_precision(extract.boundary,10)
    coast=unary_union([set_precision(line,10) for line in extract.coast]).intersection(extent)
    pieces=list(polygonize(set_precision(unary_union([coast,boundary.boundary.intersection(extent),extent.boundary]),10)))
    segments=[]
    for line in extract.coast:
        segments.extend(LineString([a,b]) for a,b in zip(line.coords,list(line.coords)[1:]) if a!=b)
    tree=STRtree(segments);land=[]
    for poly in pieces:
        p=poly.representative_point();segment=segments[tree.nearest(p)];a,b=segment.coords
        # OSM coastline has land to the left in lon/lat; projected y points south.
        if (b[0]-a[0])*(p.y-a[1])-(b[1]-a[1])*(p.x-a[0])<0:
            clipped=poly.intersection(extent)
            for part in clipped.geoms if hasattr(clipped,'geoms') else [clipped]:
                if part.geom_type=='Polygon' and not part.is_empty:land.append(part)
    if not land:raise ValueError('Coastline did not produce land polygons')
    out=ROOT/'public/map/region';out.mkdir(parents=True,exist_ok=True)
    manifest={};total=0
    if '--geometry-only' in sys.argv:
        prior=json.loads((ROOT/'public/js/city-region-data.js').read_text(encoding='utf8').split('G.CITY_REGION=',1)[1].rsplit(';',2)[0])
        manifest,total=prior['levels'],prior['bytes']
    levels=[('overview',65536,45,21,100000),('district',32768,8,17,20000),('street',16384,5,0,0)]
    for level,size,tolerance,min_width,min_area in levels:
        if '--geometry-only' in sys.argv:continue
        chunks=defaultdict(list);label_cells=set()
        for key,(kind,width,source_id,geometry,name) in enumerate(extract.features):
            if level!='street' and kind==3:continue
            if kind in (4,5) and width<min_width:continue
            if kind<4 and geometry.area<min_area:continue
            simple=geometry.simplify(tolerance,preserve_topology=True)
            if simple.is_empty:continue
            coords=rings(simple)
            if len(coords[0])<(4 if kind>=4 else 6):continue
            bounds=[round(v) for v in simple.bounds]
            label=''
            if level=='street' and kind==4 and name and width>=8 and simple.length>120:
                ring=coords[0];i=(len(ring)//4-1)*2;j=min(i+2,len(ring)-2)
                px,py=(ring[i]+ring[j])/2,(ring[i+1]+ring[j+1])/2;cell=(math.floor(px/1000),math.floor(py/1000))
                if cell not in label_cells:label=name;label_cells.add(cell)
            # Metadata and rings use metres relative to the published old-city origin.
            feature=[kind,width,key,bounds,coords,label]
            x0,y0,x1,y1=simple.bounds
            for x in range(math.floor(x0/size),math.floor(x1/size)+1):
                for y in range(math.floor(y0/size),math.floor(y1/size)+1):chunks[(x,y)].append(feature)
        files={}
        for (x,y),features in sorted(chunks.items()):
            raw=encode(features)
            body=json.dumps({'gzip':base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode()},separators=(',',':'))
            filename=f'{level}_{x}_{y}.json'.replace('_-','_m')
            (out/filename).write_text(body,encoding='utf8');total+=len(body)
            files[f'{x}:{y}']=filename
        manifest[level]={'size':size,'files':files}
        print(level,len(files),'files; cumulative bytes',total,flush=True)
    reader=osmium.io.Reader(str(source));timestamp=reader.header().get('osmosis_replication_timestamp');reader.close()
    road_lines=[f[3] for f in extract.features if f[0]==4];road_tree=STRtree(road_lines)
    districts=[]
    for key,name,x,y in extract.districts:
        if key>1000000000:continue
        p=Point(x,y);line=road_lines[road_tree.nearest(p)];anchor=line.interpolate(line.project(p))
        districts.append([key,name,round(anchor.x),round(anchor.y)])
    data={'id':'shanghai-region-20260926','timestamp':timestamp,'source':'https://download.geofabrik.de/asia/china/shanghai-260926.osm.pbf',
          'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'origin':[121.477,31.237],'bounds':[round(v) for v in extent.bounds],
          'counts':dict(extract.counts),'levels':manifest,'land':[rings(p.simplify(2,preserve_topology=True)) for p in land],
          'boundary':[rings(p.simplify(10,preserve_topology=True)) for p in boundary.geoms if p.geom_type=='Polygon'],
          'districts':sorted(districts),'bytes':total}
    text='/* Derived from OpenStreetMap, ODbL 1.0; see docs/MAP_DATA.md. */\n(function(root){\n  "use strict";\n  const G=root.NightCourier=root.NightCourier||{};\n  G.CITY_REGION='
    text+=json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n})(globalThis);\n'
    (ROOT/'public/js/city-region-data.js').write_text(text,encoding='utf8')
    print('Region',data['bounds'],'land polygons',len(land),'districts',len(data['districts']),'total bytes',total+len(text.encode()),flush=True)

if __name__=='__main__':build(Path(sys.argv[1]))
