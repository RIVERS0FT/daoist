/* Offline Shanghai scenery, streamed by region and scale; gameplay keeps its published graph. */
(function(root){
  'use strict';const G=root.NightCourier;
  const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  const pathOf=rings=>{const path=new Path2D();for(const ring of rings){if(ring.length<4)continue;path.moveTo(ring[0],ring[1]);for(let i=2;i<ring.length;i+=2)path.lineTo(ring[i],ring[i+1]);}return path;};
  // Clip ring coordinates to this tile before recording Canvas commands. Large
  // administrative seas otherwise make native Paint work dominate each frame.
  const clipRing=(ring,bounds)=>{
    let points=ring.slice(0,-1);
    for(const [axis,limit,sign] of [[0,bounds[0],1],[0,bounds[2],-1],[1,bounds[1],1],[1,bounds[3],-1]]){
      const out=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length],u=sign*(a[axis]-limit),v=sign*(b[axis]-limit);
        if(u>=0)out.push(a);
        if((u<0&&v>=0)||(u>=0&&v<0)){const t=u/(u-v);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      }points=out;if(!points.length)break;
    }return points.length>=3?[...points,points[0]].flat():[];
  };
  const nextFrame=()=>new Promise(resolve=>root.requestAnimationFrame(resolve));
  const decode=async bytes=>{
    let offset=0;const integer=()=>{let n=0,place=1,b;do{b=bytes[offset++];n+=(b&127)*place;place*=128;}while(b&128);return n;};
    const count=integer(),features=[],previous=[0,0],decoder=new TextDecoder();let until=performance.now()+3,previousId=0;
    for(let f=0;f<count;f++){
      const kind=integer(),width=integer()/2,key=previousId+integer();previousId=key;
      const paths=[],bounds=[Infinity,Infinity,-Infinity,-Infinity],ringCount=integer();
      for(let r=0;r<ringCount;r++){
        const size=integer(),ring=[];
        for(let i=0;i<size*2;i++){const n=integer(),axis=i%2,value=previous[axis]+(n%2?-(n+1)/2:n/2);previous[axis]=value;ring.push(value);bounds[axis]=Math.min(bounds[axis],value);bounds[axis+2]=Math.max(bounds[axis+2],value);}
        paths.push(ring);
      }
      const length=integer(),label=decoder.decode(bytes.subarray(offset,offset+length));offset+=length;
      const margin=label?500:(kind===4||kind===5)?width/2+1:1;
      bounds[0]-=margin;bounds[1]-=margin;bounds[2]+=margin;bounds[3]+=margin;
      features.push([kind,width,key,bounds,paths,label]);
      if(f%128===0&&performance.now()>until){await nextFrame();until=performance.now()+3;}
    }
    return features;
  };
  G.CityRegion=class{
    constructor(el){
      this.el=el;this.chunks=new Map();this.cacheBytes=0;this.land=G.CITY_REGION.land.map(pathOf);this.boundary=G.CITY_REGION.boundary.map(pathOf);
      this.baseURL=new URL('map/region/',document.baseURI);this.palette=null;this.chapter=1;this.labelLayouts=new Map();
      this.territories=G.MAP_REGIONS;
    }
    async load(file){
      const cached=this.chunks.get(file);if(cached){this.chunks.delete(file);this.chunks.set(file,cached);return cached.promise;}
      const entry={bytes:0};this.chunks.set(file,entry);
      entry.promise=(async()=>{
        const response=await fetch(new URL(file,this.baseURL));if(!response.ok)throw Error(`Map region unavailable: ${response.status}`);
        const {gzip}=await response.json(),bytes=Uint8Array.from(atob(gzip),c=>c.charCodeAt(0));
        const raw=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        const features=await decode(raw),bins=new Map(),wide=[];let until=performance.now()+3;
        for(let i=0;i<features.length;i++){
          const b=features[i][3],x0=Math.floor(b[0]/1024),x1=Math.floor(b[2]/1024),y0=Math.floor(b[1]/1024),y1=Math.floor(b[3]/1024);
          if((x1-x0+1)*(y1-y0+1)>64)wide.push(features[i]);
          else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x}:${y}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(features[i]);}
          if(i%128===0&&performance.now()>until){await nextFrame();until=performance.now()+3;}
        }
        entry.bytes=raw.length*8;this.cacheBytes+=entry.bytes;
        for(const [key,value] of this.chunks){if(this.cacheBytes<=32*1024*1024&&this.chunks.size<=8)break;if(key!==file&&value.bytes){this.chunks.delete(key);this.cacheBytes-=value.bytes;}}
        return {bins,wide};
      })().catch(error=>{this.chunks.delete(file);throw error;});
      return entry.promise;
    }
    async prepare(coords,size,pad){
      const scale=2**coords.z,bounds=[(coords.x*size-pad)/scale,(coords.y*size-pad)/scale,((coords.x+1)*size+pad)/scale,((coords.y+1)*size+pad)/scale];
      // A concave district or island can lie inside a tile whose corners all
      // belong elsewhere. Bounds provide a conservative loading check.
      if(!this.territories.some(r=>r.chapter<=this.chapter&&intersects(r.bounds,bounds)))return [];
      // One detail policy across the entire city, including the original centre.
      const level=G.CITY_REGION.levels[coords.z<=-7?'overview':coords.z<=-5?'district':'street'],files=new Set();
      // Labels and wide strokes can reach a tile from the adjacent data chunk.
      const margin=scale>=.08?500:16;
      for(let x=Math.floor((bounds[0]-margin)/level.size);x<=Math.floor((bounds[2]+margin)/level.size);x++)for(let y=Math.floor((bounds[1]-margin)/level.size);y<=Math.floor((bounds[3]+margin)/level.size);y++){const file=level.files[`${x}:${y}`];if(file)files.add(file);}
      const chunks=await Promise.all([...files].map(file=>this.load(file))),features=new Map();
      const add=f=>{if(intersects(f[3],bounds))features.set(f[2],f);};
      for(const chunk of chunks){
        chunk.wide.forEach(add);
        for(let x=Math.floor(bounds[0]/1024);x<=Math.floor(bounds[2]/1024);x++)for(let y=Math.floor(bounds[1]/1024);y<=Math.floor(bounds[3]/1024);y++)for(const f of chunk.bins.get(`${x}:${y}`)||[])add(f);
      }
      return [...features.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
    }
    colors(){
      const night=this.el.dataset.night==='true';
      if(this.palette?.night===night)return this.palette;
      return this.palette=night?{night,land:'#263934',water:'#264e53',park:'#334e38',building:'#344b42',edge:'#21382f',road:'#566658',text:'#d0d6ba'}:
        {night,land:'#ebe8dc',water:'#c5d9dc',park:'#d3dfc5',building:'#d8d1c3',edge:'#c4beb0',road:'#faf8ee',text:'#6a716b'};
    }
    draw(ctx,features,x,y,span,scale){
      const colors=this.colors();ctx.save();ctx.fillStyle=colors.night?'#243630':'#f3f0e7';ctx.fillRect(x,y,span,span);
      ctx.fillStyle=colors.water;for(const path of this.boundary)ctx.fill(path,'evenodd');
      ctx.fillStyle=colors.land;for(const path of this.land)ctx.fill(path,'evenodd');
      const roads=[];
      for(const feature of features){
        const [kind,width,,bounds,rings]=feature;
        if(!intersects(bounds,[x,y,x+span,y+span]))continue;
        const path=feature.path||(feature.path=pathOf(rings));
        if(kind===4){roads.push(feature);continue;}
        ctx.fillStyle=kind===1?colors.park:kind===2?colors.water:colors.building;
        if(kind===5){ctx.strokeStyle=colors.water;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke(path);}
        else{
          ctx.fill(path,'evenodd');
          if(kind===3&&scale>=.125){ctx.strokeStyle=colors.night?'#466050':'#beb6a7';ctx.lineWidth=.7;ctx.stroke(path);}
        }
      }
      ctx.lineJoin=ctx.lineCap='round';
      for(const casing of [true,false]){
        ctx.strokeStyle=casing?colors.edge:colors.road;
        for(const f of roads){ctx.lineWidth=Math.max(f[1],.6/scale)+(casing?2:0);ctx.stroke(f.path);}
      }
      // At street scale, overlay the playable corridors from the exact shared
      // route vertices; geographic background simplification never moves riders.
      if(scale>=.125){
        const paths=new Map(),widths={primary:21,secondary:17,tertiary:13,primary_link:14,secondary_link:12,tertiary_link:10,residential:9,living_street:8,unclassified:9,pedestrian:8,service:5,cycleway:4,footway:3,path:2.5};
        for(const edge of G.roadEdgesIn(x,y,x+span,y+span)){
          const width=widths[edge.kind]||5;let path=paths.get(width);if(!path){path=new Path2D();paths.set(width,path);}
          const a=G.ROAD_NODES[edge.from],b=G.ROAD_NODES[edge.to];path.moveTo(a.x,a.y);path.lineTo(b.x,b.y);
        }
        const sorted=[...paths].sort((a,b)=>a[0]-b[0]);
        for(const casing of [true,false]){ctx.strokeStyle=casing?colors.edge:colors.road;for(const [width,path] of sorted){ctx.lineWidth=width+(casing?2:0);ctx.stroke(path);}}
      }
      // Stable label positions do not depend on tile order or viewport movement.
      if(scale>=.08){
        ctx.font=`${Math.max(14,10/scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle=colors.text;ctx.strokeStyle=colors.road;ctx.lineWidth=3/scale;
        for(const f of roads){
          if(!f[5]||f[1]<8)continue;const ring=f[4][0],i=Math.floor((ring.length/2-1)/2)*2,j=Math.min(i+2,ring.length-2);
          const px=(ring[i]+ring[j])/2,py=(ring[i+1]+ring[j+1])/2;
          ctx.strokeText(f[5],px,py);ctx.fillText(f[5],px,py);
        }
      }
      // Solid map fog hides streets and buildings, while keeping the outline
      // and chapter requirement readable. These polygons also gate road edges.
      const viewport=[x,y,x+span,y+span];
      for(const r of this.territories)if(r.chapter>this.chapter&&intersects(r.bounds,viewport)){
        ctx.fillStyle=colors.night?'#1a2c28':'#e4e3d8';
        for(const polygon of r.polygons)ctx.fill(pathOf(polygon.map(ring=>clipRing(ring,viewport))),'evenodd');
      }
      if(scale<.08){ctx.strokeStyle=colors.night?'#41564e':'#bac4b9';ctx.lineWidth=.65/scale;for(const path of this.land)ctx.stroke(path);}
      for(const r of this.territories)if(intersects(r.bounds,viewport)){
        const border=new Path2D();
        for(const polygon of r.polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++){
          const a=ring[i-1],b=ring[i];if(!intersects([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],viewport))continue;
          border.moveTo(a[0],a[1]);border.lineTo(b[0],b[1]);
        }
        ctx.strokeStyle=colors.night?'#6a8074':'#9aab9b';ctx.lineWidth=1/scale;ctx.setLineDash([5/scale,5/scale]);ctx.stroke(border);ctx.setLineDash([]);
      }
      if(scale<=.08){
        const key=`${this.chapter}:${scale}`;ctx.font=`${13/scale}px system-ui`;
        let labels=this.labelLayouts.get(key);
        if(!labels){
          labels=[];
          for(const r of this.territories){
            const text=`${r.name} · ${r.chapter>this.chapter?`第${r.chapter}章开放`:'已开放'}`,[px,py]=r.seed,half=ctx.measureText(text).width/2+4/scale;
            const box=[px-half,py-10/scale,px+half,py+10/scale];
            if(!labels.some(label=>intersects(label.box,box)))labels.push({text,px,py,box});
          }
          this.labelLayouts.set(key,labels);if(this.labelLayouts.size>12)this.labelLayouts.delete(this.labelLayouts.keys().next().value);
        }
        for(const {text,px,py,box} of labels)if(intersects(box,viewport)){
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillStyle=colors.night?'#d0d6ba':'#43554b';ctx.strokeStyle=colors.night?'#1a2c28':'#e4e3d8';ctx.lineWidth=3/scale;
          ctx.strokeText(text,px,py);ctx.fillText(text,px,py);
        }
      }
      ctx.restore();
    }
  };
})(globalThis);
