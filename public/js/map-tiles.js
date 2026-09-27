/* Rasterize the trusted static SVG into bounded local tiles, never a world-sized GPU surface. */
(function(root){
  'use strict';const G=root.NightCourier;
  G.CityTiles=root.L.GridLayer.extend({
    // Paint a real gutter in world coordinates; stretching a tile hides gaps but
    // shifts roads. Keep Leaflet's grid step unchanged and overlap only gutters.
    tilePadding:2,
    _initTile(tile){
      root.L.GridLayer.prototype._initTile.call(this,tile);
      const size=this.getTileSize(),pad=this.tilePadding;
      tile.style.width=`${size.x+2*pad}px`;tile.style.height=`${size.y+2*pad}px`;
      tile.style.marginLeft=tile.style.marginTop=`${-pad}px`;
    },
    initialize(svg,options){
      root.L.setOptions(this,options);this.svg=svg;this.ops=[];this.cache=new Map();this.cacheBytes=0;this.styleVersion=0;this.jobs=[];
      this.region=G.CITY_REGION&&options.region!==false?new G.CityRegion(svg.closest('.city-map')):null;
      const layer=svg.querySelector('.base-layer');
      for(const element of layer.querySelectorAll('path,rect,text')){
        if(element.getAttribute('fill')?.startsWith('url('))continue;
        const b=element.getBBox(),matrix=element.transform.baseVal.consolidate()?.matrix||new DOMMatrix();
        const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
        const box={left:Math.min(...corners.map(p=>p.x))-30,right:Math.max(...corners.map(p=>p.x))+30,top:Math.min(...corners.map(p=>p.y))-30,bottom:Math.max(...corners.map(p=>p.y))+30};
        let path=null;if(element.tagName==='path')path=new Path2D(element.getAttribute('d'));
        else if(element.tagName==='rect'){path=new Path2D();path.rect(b.x,b.y,b.width,b.height);}
        const roads=element.dataset.roadKind?G.CORE_ROAD_EDGES.filter(e=>e.kind===element.dataset.roadKind).map(e=>({a:G.ROAD_NODES[e.from],b:G.ROAD_NODES[e.to]})):null;
        this.ops.push({element,box,matrix,path,roads});
      }
      this.on('tileunload',({tile})=>{
        tile.cancelled=true;
        if(!tile.painted||tile.styleVersion!==this.styleVersion){tile.width=tile.height=0;return;}
        this.cache.set(tile.cacheKey,tile);this.cacheBytes+=tile.width*tile.height*4;
        while(this.cacheBytes>48*1024*1024){const [key,old]=this.cache.entries().next().value;this.cache.delete(key);this.cacheBytes-=old.width*old.height*4;old.width=old.height=0;}
      });
    },
    refreshStyle(){this.styleVersion++;this.styles=new Map();for(const tile of this.cache.values())tile.width=tile.height=0;this.cache.clear();this.cacheBytes=0;this.redraw();},
    createTile(coords,done){
      const key=`${coords.z}:${coords.x}:${coords.y}`,cached=this.cache.get(key);
      if(cached){this.cache.delete(key);this.cacheBytes-=cached.width*cached.height*4;cached.cancelled=false;root.requestAnimationFrame(()=>{if(!cached.cancelled)done(null,cached);});return cached;}
      const tile=document.createElement('canvas');
      tile.cacheKey=key;tile.styleVersion=this.styleVersion;
      const queue=features=>{if(tile.cancelled||tile.styleVersion!==this.styleVersion)return;tile.regionFeatures=features;this.jobs.push({tile,coords,done});this.schedule();};
      if(this.region)this.region.prepare(coords,this.getTileSize().x,this.tilePadding).then(queue,error=>{console.error(error);done(error,tile);});else queue([]);
      return tile;
    },
    schedule(){
      if(this.paintFrame!=null)return;
      this.paintFrame=root.requestAnimationFrame(()=>{
        this.paintFrame=null;let job;
        while(this.jobs.length){const next=this.jobs.shift();if(!next.tile.cancelled&&next.tile.styleVersion===this.styleVersion){job=next;break;}}
        if(job){try{this.paintTile(job.tile,job.coords);job.tile.painted=true;job.done(null,job.tile);}catch(error){job.done(error,job.tile);}}
        if(this.jobs.length)this.schedule();
      });
    },
    paintTile(tile,coords){
      const size=this.getTileSize().x,pad=this.tilePadding,dpr=2,scale=2**coords.z;
      tile.width=tile.height=(size+2*pad)*dpr;tile.setAttribute('aria-hidden','true');
      const ctx=tile.getContext('2d',{willReadFrequently:true}),x=(coords.x*size-pad)/scale,y=(coords.y*size-pad)/scale,span=(size+2*pad)/scale;
      ctx.scale(dpr*scale,dpr*scale);ctx.translate(-x,-y);
      if(this.region){this.region.draw(ctx,tile.regionFeatures,x,y,span,scale);tile.regionFeatures=null;return;}
      tile.regionFeatures=null;
      if(!this.styles)this.styles=new Map();
      for(const op of this.ops){
        const {element,box,matrix,roads}=op;let path=op.path;
        if(box.right<x||box.left>x+span||box.bottom<y||box.top>y+span)continue;
        const cls=element.getAttribute('class'),key=element.tagName==='text'?element:cls?`${cls}:${element.getAttribute('stroke-width')||''}`:element.parentElement;
        let style=this.styles.get(key);
        if(!style){
          const s=getComputedStyle(element);let opacity=1;
          for(let node=element;node&&node!==this.svg;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
          style={fill:s.fill,stroke:s.stroke,width:parseFloat(s.strokeWidth),opacity,font:s.font,spacing:s.letterSpacing,anchor:s.textAnchor,baseline:s.dominantBaseline,minor:element.classList.contains('minor-label')};this.styles.set(key,style);
        }
        if(style.minor&&this.svg.closest('.city-map').dataset.detail==='overview')continue;
        if(roads){
          path=new Path2D();const pad=style.width;
          for(const {a,b} of roads)if(Math.max(a.x,b.x)+pad>=x&&Math.min(a.x,b.x)-pad<=x+span&&Math.max(a.y,b.y)+pad>=y&&Math.min(a.y,b.y)-pad<=y+span){path.moveTo(a.x,a.y);path.lineTo(b.x,b.y);}
        }
        ctx.save();ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
        ctx.globalAlpha=style.opacity;ctx.fillStyle=style.fill;ctx.strokeStyle=style.stroke;ctx.lineWidth=style.width;ctx.lineCap=ctx.lineJoin='round';
        if(path){if(style.fill!=='none')ctx.fill(path);if(style.stroke!=='none')ctx.stroke(path);}
        else{
          ctx.font=style.font;ctx.letterSpacing=style.spacing;ctx.textAlign=style.anchor==='middle'?'center':style.anchor==='end'?'right':'left';ctx.textBaseline=style.baseline==='central'?'middle':'alphabetic';
          const tx=Number(element.getAttribute('x')||0),ty=Number(element.getAttribute('y')||0);
          if(style.stroke!=='none')ctx.strokeText(element.textContent,tx,ty);
          if(style.fill!=='none')ctx.fillText(element.textContent,tx,ty);
        }
        ctx.restore();
      }
      // A tiny repeating paper texture avoids drawing one DOM object per speck.
      if(!this.grain){const c=document.createElement('canvas');c.width=c.height=9;const p=c.getContext('2d');p.fillStyle=getComputedStyle(this.svg.querySelector('#paper-grain circle')).fill;p.globalAlpha=.08;p.beginPath();p.arc(2,3,.45,0,Math.PI*2);p.fill();this.grain=c;}
      ctx.fillStyle=ctx.createPattern(this.grain,'repeat');ctx.fillRect(Math.max(0,x),Math.max(0,y),Math.max(0,Math.min(x+span,G.WORLD.width)-Math.max(0,x)),Math.max(0,Math.min(y+span,G.WORLD.height)-Math.max(0,y)));
    }
  });
})(globalThis);
