/* Local OpenStreetMap vectors, styled as a city newspaper map. */
(function(root){
  'use strict';const G=root.NightCourier;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const line=points=>points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join('');
  const edgePath=edges=>edges.map(({from,to})=>line([G.ROAD_NODES[from],G.ROAD_NODES[to]])).join('');
  const width=kind=>({primary:21,primary_link:14,secondary:17,secondary_link:12,tertiary:13,tertiary_link:10,residential:9,living_street:8,unclassified:9,pedestrian:8,service:5,cycleway:4,footway:3,path:2.5}[kind]||5);
  // Source names are used only as stable keys; the game displays fictional toponyms.
  const roots=['青岚','长乐','听雨','月渡','松风','杏花','归云','星河','栖鹤','春山','流萤','竹影','白鹭','望舒','青禾','落霞','南烛','云汀','远岫','鸣蝉','清晖','照雪','浮灯','隐泉','澄溪','云锦','拂柳','寒露','问山','知秋','临风','拾光'];
  const streetNames=new Map([...new Set(G.CITY_DATA.roads.map(r=>r[1]).filter(Boolean))].sort().map((name,i)=>[name,`${roots[i%roots.length]}${i<roots.length?'':['东','西','南','北','上','下','中','新','旧','里'][Math.floor(i/roots.length)-1]||'外'}${/弄|巷/.test(name)?'巷':/支路|支弄/.test(name)?'支路':'路'}`]));
  G.MapArtwork={line,edgePath,render(){
    const data=G.CITY_DATA;
    let out=`<rect width="${G.WORLD.width}" height="${G.WORLD.height}" class="osm-ground"/>`;
    for(const kind of ['park','water','building']){
      out+=`<g class="osm-${kind}">`;
      for(const [type,id,ring] of data.polygons)if(type===kind)out+=`<path data-osm-way="${id}" d="${line(ring.map(([x,y])=>({x,y})))}Z"/>`;
      out+='</g>';
    }
    const groups=new Map();for(const edge of G.ROAD_EDGES){if(!groups.has(edge.kind))groups.set(edge.kind,[]);groups.get(edge.kind).push(edge);}
    const sorted=[...groups].sort(([a],[b])=>width(a)-width(b));
    out+='<g class="osm-roads" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    for(const [kind,edges] of sorted)out+=`<path class="osm-road-edge" d="${edgePath(edges)}" stroke-width="${width(kind)+2}"/>`;
    for(const [kind,edges] of sorted)out+=`<path class="osm-road ${width(kind)>12?'arterial':''}" data-road-kind="${kind}" d="${edgePath(edges)}" stroke-width="${width(kind)}"/>`;
    out+='</g><g class="street-labels osm-street-labels">';
    const occupied=[];
    const roads=data.roads.filter(r=>r[1]).sort((a,b)=>width(b[2])-width(a[2]));
    for(const [id,sourceName,kind,segments] of roads){
      const name=streetNames.get(sourceName);
      const candidates=segments.map(([a,b])=>[G.ROAD_NODES[a],G.ROAD_NODES[b]]).sort((a,b)=>G.roadDistance(...b)-G.roadDistance(...a));
      for(const [a,b] of candidates){
        if(G.roadDistance(a,b)<Math.max(65,name.length*15))continue;
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        if(occupied.some(p=>Math.hypot(p.x-x,p.y-y)<(p.name===name?280:100)))continue;
        let angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
        out+=`<text data-osm-way="${id}" class="${width(kind)<10?'minor-label':''}" transform="translate(${x} ${y}) rotate(${angle})" text-anchor="middle" dominant-baseline="central">${esc(name)}</text>`;
        occupied.push({x,y,name});break;
      }
    }
    out+='</g>';
    const project=(lat,lon)=>({x:(lon-data.bounds[1])/(data.bounds[3]-data.bounds[1])*data.width,y:(data.bounds[2]-lat)/(data.bounds[2]-data.bounds[0])*data.height});
    out+='<g class="osm-area-labels">';
    for(const [name,lat,lon] of [['听 雨 园',31.227,121.4918],['长 乐 里',31.2167,121.4826],['青 藤 坊',31.2178,121.4955],['月 渡 湾',31.2130,121.5010]]){
      const p=project(lat,lon);out+=`<text x="${p.x}" y="${p.y}">${name}</text>`;
    }
    out+='</g><text class="osm-river-label" x="2780" y="1390" transform="rotate(-26 2780 1390)">沧 江</text>';
    return out+`<rect width="${G.WORLD.width}" height="${G.WORLD.height}" fill="url(#paper-grain)" pointer-events="none"/>`;
  }};
})(globalThis);
