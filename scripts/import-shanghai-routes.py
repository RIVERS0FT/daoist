"""Append real OSM routes and new delivery IDs; preserve every published coordinate.

Select a connected corridor network through Shanghai delivery sites from the full
walkable graph. Every retained segment is an original shared-node OSM segment.
"""
from collections import defaultdict
import base64
import gzip
import hashlib
import heapq
import importlib.util
import json
import math
import pickle
from pathlib import Path
import sys
import osmium
from shapely.geometry import Point
from shapely.prepared import prep

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('region',ROOT/'scripts/import-shanghai-region.py')
region=importlib.util.module_from_spec(spec);spec.loader.exec_module(region)
ALLOWED=set(region.WIDTHS)-{'motorway','motorway_link','trunk','trunk_link','track'}

class Roads(osmium.SimpleHandler):
    def __init__(self):super().__init__();self.nodes={};self.edges={};self.ferries=[]
    def way(self,w):
        tags=dict(w.tags);kind=tags.get('highway')
        if tags.get('route')=='ferry':self.ferries.append([w.id,len(w.nodes)])
        if kind not in ALLOWED or tags.get('access') in ('private','no') or tags.get('foot')=='no' or tags.get('area')=='yes':return
        previous=None
        for n in w.nodes:
            if not n.location.valid():previous=None;continue
            p=tuple(round(v,2) for v in region.project(n.lon,n.lat));self.nodes[n.ref]=p
            if previous and previous[1]!=p:
                a=previous[0];self.edges[tuple(sorted((a,n.ref)))]=(a,n.ref,kind,w.id)
            previous=(n.ref,p)

def build(source):
    old=json.loads((ROOT/'public/js/city-data.js').read_text(encoding='utf8').split('G.CITY_DATA=',1)[1].rsplit(';',2)[0])
    roads=Roads();roads.apply_file(str(source),locations=True)
    # Published geometry always wins over later OSM edits.
    for osm_id,x,y in old['nodes']:roads.nodes[osm_id]=(x,y)
    for a,b,kind,way in old['edges']:
        a,b=old['nodes'][a][0],old['nodes'][b][0];roads.edges[tuple(sorted((a,b)))]=(a,b,kind,way)
    published={tuple(sorted((old['nodes'][a][0],old['nodes'][b][0]))) for a,b,*_ in old['edges']}
    def inside(node):
        x,y=roads.nodes[node];return 0<=x<=old['width'] and 0<=y<=old['height']
    roads.edges={key:edge for key,edge in roads.edges.items() if key in published or not (inside(edge[0]) and inside(edge[1]))}
    links=defaultdict(list)
    for a,b,*_ in roads.edges.values():
        length=math.dist(roads.nodes[a],roads.nodes[b]);links[a].append((b,length));links[b].append((a,length))
    start=old['nodes'][old['places']['home']][0];dist={start:0};prev={};heap=[(0,start)]
    while heap:
        cost,a=heapq.heappop(heap)
        if cost!=dist[a]:continue
        for b,length in links[a]:
            candidate=cost+length
            if candidate<dist.get(b,math.inf):dist[b]=candidate;prev[b]=a;heapq.heappush(heap,(candidate,b))
    print('Connected nodes',len(dist),'of',len(roads.nodes),'ferry ways',len(roads.ferries),flush=True)
    # Delivery stops follow a regular coverage grid, attached to actual road nodes.
    # Keep their IDs based on grid cells instead of enumeration order.
    cells={};cell_size=4000
    for osm_id in sorted(dist):
        x,y=roads.nodes[osm_id]
        if 0<=x<=old['width'] and 0<=y<=old['height']:continue
        cell=(math.floor(x/cell_size),math.floor(y/cell_size));cx,cy=((v+.5)*cell_size for v in cell)
        candidate=((x-cx)**2+(y-cy)**2,osm_id)
        if candidate<cells.get(cell,(math.inf,0)):cells[cell]=candidate
    targets={cell:value[1] for cell,value in cells.items()}
    boundary=pickle.loads(region.geometry_cache(source).read_bytes())[3]
    city=prep(boundary)
    targets={cell:node for cell,node in targets.items() if city.covers(Point(roads.nodes[node]))}
    selected=set(tuple(sorted((old['nodes'][a][0],old['nodes'][b][0]))) for a,b,*_ in old['edges'])
    for target in targets.values():
        node=target
        while node in prev:
            parent=prev[node];key=tuple(sorted((node,parent)))
            if key in selected:break
            selected.add(key);node=parent
    # Preserve local loops between neighbouring delivery districts. A tree only
    # rooted at home would force suburb-to-suburb trips through the old centre.
    def local_route(start,end):
        goal=roads.nodes[end];costs={start:0};parents={};heap=[(math.dist(roads.nodes[start],goal),0,start)]
        while heap:
            _,cost,a=heapq.heappop(heap)
            if cost!=costs[a]:continue
            if a==end:
                while a in parents:
                    b=parents[a];selected.add(tuple(sorted((a,b))));a=b
                return
            for b,length in links[a]:
                candidate=cost+length
                if candidate<costs.get(b,math.inf) and candidate<=20000:
                    costs[b]=candidate;parents[b]=a;heapq.heappush(heap,(candidate+math.dist(roads.nodes[b],goal),candidate,b))
    for (x,y),start in targets.items():
        for dx,dy in [(1,0),(0,1),(1,1),(1,-1)]:
            end=targets.get((x+dx,y+dy))
            if end:local_route(start,end)
    # Connect retained corridors wherever OSM actually joins them; no snap links.
    kept={node for edge in selected for node in edge}
    selected.update(key for key in roads.edges if key[0] in kept and key[1] in kept)
    base_ids={row[0]:i for i,row in enumerate(old['nodes'])};new_ids=sorted(kept-base_ids.keys())
    nodes=[[osm_id,*roads.nodes[osm_id]] for osm_id in new_ids];index={**base_ids,**{osm_id:i+len(base_ids) for i,osm_id in enumerate(new_ids)}}
    original=set(tuple(sorted((old['nodes'][a][0],old['nodes'][b][0]))) for a,b,*_ in old['edges'])
    edges=[[index[a],index[b],kind,way] for key in sorted(selected-original) for a,b,kind,way in [roads.edges[key]]]
    places=[]
    suffix=['新村','书院','茶舍','小筑','街坊','驿站','公馆','里巷']
    for (x,y),node in sorted(targets.items()):
        token=f'{x}:{y}';n=int.from_bytes(hashlib.sha256(token.encode()).digest()[:4],'big')
        places.append({'id':f'region-{x}-{y}'.replace('--','-m'),'name':region.NAMES[n%32]+region.NAMES[n//32%32]+suffix[n//1024%len(suffix)],'node':index[node]})
    data={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'nodes':nodes,'edges':edges,'places':places}
    (ROOT/'artifacts/shanghai-route-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    packed=bytearray()
    def integer(n):
        while n>=128:packed.append((n&127)|128);n>>=7
        packed.append(n)
    def signed(n):integer(n*2 if n>=0 else -n*2-1)
    integer(len(nodes));previous=[0,0,0]
    for osm_id,x,y in nodes:
        current=[osm_id,round(x*100),round(y*100)]
        for i,n in enumerate(current):signed(n-previous[i]);previous[i]=n
    kinds=sorted({e[2] for e in edges});integer(len(edges));previous=[0,0,0]
    for a,b,kind,way in edges:
        for i,n in enumerate([a,b,way]):signed(n-previous[i]);previous[i]=n
        integer(kinds.index(kind))
    encoded=base64.b64encode(gzip.compress(packed,9,mtime=0)).decode()
    content='/* OpenStreetMap derived road corridors, ODbL 1.0; see docs/MAP_DATA.md. */\n(function(root){\n  "use strict";const G=root.NightCourier;\n'
    content+=f'  const packed="{encoded}";\n'
    content+=f'  const kinds={json.dumps(kinds,separators=(",",":"))},places={json.dumps(places,ensure_ascii=False,separators=(",",":"))};\n'
    content+='  const bytes=root.fflate.gunzipSync(Uint8Array.from(atob(packed),c=>c.charCodeAt(0)));let offset=0;\n'
    content+='  const integer=()=>{let n=0,scale=1,b;do{b=bytes[offset++];n+=(b&127)*scale;scale*=128;}while(b&128);return n;},signed=()=>{const n=integer();return n%2?-(n+1)/2:n/2;};\n'
    content+='  const nodes=[],edges=[];let previous=[0,0,0];const count=integer();for(let i=0;i<count;i++){for(let j=0;j<3;j++)previous[j]+=signed();nodes.push([previous[0],previous[1]/100,previous[2]/100]);}\n'
    content+='  const edgeCount=integer();previous=[0,0,0];for(let i=0;i<edgeCount;i++){for(let j=0;j<3;j++)previous[j]+=signed();edges.push([previous[0],previous[1],kinds[integer()],previous[2]]);}\n'
    content+=f'  G.REGION_ROADS={{nodes,edges,places,sourceSHA256:"{data["sourceSHA256"]}"}};\n'
    content+='})(globalThis);\n'
    (ROOT/'public/js/city-routes.js').write_text(content,encoding='utf8')
    print(json.dumps({'new_nodes':len(nodes),'new_edges':len(edges),'new_places':len(places),'ferries':roads.ferries[:12]},ensure_ascii=False),flush=True)

if __name__=='__main__':build(Path(sys.argv[1]))
