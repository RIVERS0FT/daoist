/* Leaflet renders local OSM geometry in metre coordinates. */
(function(root){
  'use strict';const G=root.NightCourier;
  // Leaflet rounds overlay corners to pixels. At whole-city scale the original
  // district SVG is only a few pixels wide; rounding would shrink its markers.
  const MeterSvgOverlay=root.L.SVGOverlay.extend({_reset(){
    const origin=this._map.getPixelOrigin(),nw=this._map.project(this._bounds.getNorthWest()).subtract(origin),se=this._map.project(this._bounds.getSouthEast()).subtract(origin),size=se.subtract(nw);
    root.L.DomUtil.setPosition(this._image,nw);this._image.style.width=`${size.x}px`;this._image.style.height=`${size.y}px`;
  }});
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shape={home:'M-8 0 0-7 8 0M-5-1V8H5V-1M-1 8V3H2V8',garage:'M-6-7a5 5 0 0 0 6 6L7 6 4 9-3 2a5 5 0 0 0-6-6l4 1 2-2z',clinic:'M-2-8H2V-2H8V2H2V8H-2V2H-8V-2H-2Z',book:'M0-5Q-4-9-9-6V7Q-4 4 0 8Q4 4 9 7V-6Q4-9 0-5V8',temple:'M-10 0H10M-7-4H7M-3-8H3M0-11V-8M-7 0V8M7 0V8M-10 8H10M-2 8V3H2V8',leaf:'M-7 8Q-9-8 9-8Q9 7-7 8M-7 8 5-4',market:'M-8-2H8L6-7H-6ZM-7-2V8H7V-2M-2 8V2H3V8',delivery:'M-7-5H7V7H-7ZM-7-5-3-8H3L7-5M0-5V1'};
  G.CityMap=class{
    constructor(el,onSelect){
      this.el=el;this.onSelect=onSelect;this.s=null;this.scale=.7;this.tx=0;this.ty=0;this.selected=null;
      this.motionMedia=root.matchMedia?.('(prefers-reduced-motion: reduce)');
      el.innerHTML=`<svg class="city-svg" xmlns="http://www.w3.org/2000/svg" aria-label="青岚城交互地图，使用方向键平移，加减号缩放" role="group"><defs><pattern id="paper-grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".45" fill="var(--map-ink)" opacity=".08"/></pattern><pattern id="water-lines" width="40" height="28" patternUnits="userSpaceOnUse"><path d="M3 14h13m8 0h5" stroke="var(--map-water-line)" stroke-width=".8" opacity=".55"/></pattern><pattern id="park-lines" width="16" height="16" patternUnits="userSpaceOnUse"><path d="m4 8 2-3 2 3m-2-3v6" fill="none" stroke="var(--map-tree)" stroke-width=".7" opacity=".5"/></pattern><filter id="point-shadow" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#343f38" flood-opacity=".14"/></filter></defs><g class="world-layer"><g class="base-layer" aria-hidden="true"></g><g class="trail-layer" aria-hidden="true"></g><g class="points-layer"></g><g class="discovery-layer" aria-hidden="true"></g><g class="player-layer"></g></g></svg><div class="map-scale" aria-label="地图比例尺"><span class="map-north" aria-hidden="true">↑ 北</span><span class="scale-distance"></span><i></i></div>`;
      this.svg=el.querySelector('svg');this.layer=el.querySelector('.world-layer');this.buildBase();
      this.regionHint=document.createElement('div');this.regionHint.className='map-region-hint';this.regionHint.setAttribute('role','status');el.append(this.regionHint);
      // Keep the large static street drawing outside the animated marker SVG.
      this.baseSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      this.baseSvg.setAttribute('class','city-svg city-base-svg');this.baseSvg.setAttribute('aria-hidden','true');
      this.baseSvg.setAttribute('viewBox',`0 0 ${G.WORLD.width} ${G.WORLD.height}`);
      const baseDefs=document.createElementNS('http://www.w3.org/2000/svg','defs');
      baseDefs.append(this.svg.querySelector('#paper-grain'));this.baseSvg.append(baseDefs,this.svg.querySelector('.base-layer'));
      this.svg.setAttribute('viewBox',`0 0 ${G.WORLD.width} ${G.WORLD.height}`);
      this.extent=G.CITY_REGION?.bounds||[0,0,G.WORLD.width,G.WORLD.height];
      const [left,top,right,bottom]=this.extent,regionBounds=[[-bottom,left],[-top,right]];
      this.map=root.L.map(el,{crs:root.L.CRS.Simple,zoomControl:false,attributionControl:false,keyboard:false,
        minZoom:-12,maxZoom:Math.log2(2.8),zoomSnap:0,zoomDelta:.5,zoomAnimation:false,fadeAnimation:false,doubleClickZoom:false,
        inertia:!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches,bounceAtZoomLimits:false,
        maxBounds:[[-bottom-600,left-600],[-top+600,right+600]],maxBoundsViscosity:.8});
      this.map.setView([-G.WORLD.height/2,G.WORLD.width/2],Math.log2(.7),{animate:false});
      const bounds=[[-G.WORLD.height,0],[0,G.WORLD.width]];
      el.append(this.baseSvg);
      this.baseOverlay=new G.CityTiles(this.baseSvg,{tileSize:192,minZoom:-12,maxZoom:2,keepBuffer:1,bounds:regionBounds,noWrap:true,updateWhenIdle:true,updateWhenZooming:false}).addTo(this.map);
      this.baseSvg.style.display='none';
      this.overlay=new MeterSvgOverlay(this.svg,bounds,{interactive:true}).addTo(this.map);
      this.bind();
      this.map.on('movestart',()=>{this.moving=true;});
      this.map.on('zoom',()=>this.transform());
      this.map.on('moveend',()=>{this.moving=false;this.transform();if(this.zoomStyleChanged){this.zoomStyleChanged=false;this.baseOverlay.refreshStyle();}});
      this.map.on('viewprereset',()=>this.cancelZoom());
      this.map.on('resize',()=>this.transform());
      this.observer=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;this.cancelZoom();const initial=!this.width;this.width=w;this.height=h;this.map.invalidateSize({pan:true,animate:false});this.map.setMinZoom(Math.log2(this.minScale()));if(initial){if(this.s)this.center();else this.fit();}else this.transform();});this.observer.observe(el);
    }
    buildBase(){
      this.el.querySelector('.base-layer').innerHTML=G.MapArtwork.render();
    }
    offerProgress(s,order){return G.clamp(G.orderOfferRemaining(s,order)/G.orderOfferLifetime(order),0,1);}
    point(p,order,status='service',enter=false){
      const at=p,task=status!=='service',offer=status==='offer',glyph=task?'delivery':p.kind,w=p.name.length*12+20,circ=150.8;
      const ratio=offer?this.offerProgress(this.s,order):1,dash=(circ*(1-ratio)).toFixed(2);
      const discovery=G.placeUnlocked(this.s,p.id)?'':'，首次送达后解锁地点';
      const aria=offer?`${p.name}，可接配送任务，${G.durationText(G.orderOfferRemaining(this.s,order))}后消失${discovery}`:status==='active'?`${p.name}，已接配送订单，无送达时限${discovery}`:p.name;
      const ring=offer?`<circle class="order-expiry-track" cx="0" cy="0" r="24"/><circle class="order-expiry-ring" cx="0" cy="0" r="24" transform="rotate(-90 0 0)" stroke-dasharray="${circ}" stroke-dashoffset="${dash}"/>`:'';
      return `<g class="map-point ${offer?'order-point':status==='active'?'active-order-point':'service-point'} ${this.selected===p.id?'selected':''}" transform="translate(${at.x} ${at.y})" data-key="${escape(p.id)}" data-status="${status}" data-discovered="${G.placeUnlocked(this.s,p.id)}" data-order-id="${order?escape(order.id):''}" data-place="${escape(p.id)}" role="button" tabindex="0" aria-label="${escape(aria)}"><g class="point-screen" transform="scale(${1/this.scale})"><circle class="point-hit" r="24" fill="transparent"/><g class="point-visual ${offer&&enter?'order-entering':''}"><circle class="point-halo" r="29" opacity=".12"/>${ring}<circle class="point-core" r="18" stroke-width="1.5" filter="url(#point-shadow)"/><path class="point-glyph" d="${shape[glyph]||shape.delivery}" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><g class="point-label" data-width="${w}"><rect x="${-w/2}" y="29" width="${w}" height="24" rx="3"/><text y="45" text-anchor="middle">${escape(p.name)}</text></g>${task?`<circle class="point-badge" cx="16" cy="-16" r="8"/><text class="point-badge-text" x="16" y="-13" text-anchor="middle">${status==='active'?'✓':order.coins}</text>`:''}</g></g></g>`;
    }
    removePoint(node){
      if(node.classList.contains('order-leaving'))return;
      node.classList.add('order-leaving');node.removeAttribute('data-place');node.setAttribute('tabindex','-1');node.setAttribute('aria-hidden','true');
      const remove=()=>{if(node.isConnected)node.remove();};
      if(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){remove();return;}
      node.addEventListener('animationend',remove,{once:true});root.setTimeout(remove,420);
    }
    updateOrders(s){
      const circ=150.8,byId=new Map(s.orders.map(o=>[o.id,o]));
      for(const node of this.el.querySelectorAll('.order-point[data-order-id]')){
        const order=byId.get(node.dataset.orderId);if(!order)continue;
        const ratio=this.offerProgress(s,order),ring=node.querySelector('.order-expiry-ring');
        const offset=(circ*(1-ratio)).toFixed(2);if(ring&&ring.getAttribute('stroke-dashoffset')!==offset)ring.setAttribute('stroke-dashoffset',offset);
        const p=G.place(order.target),label=`${p.name}，可接配送任务，${G.durationText(G.orderOfferRemaining(s,order))}后消失${G.placeUnlocked(s,p.id)?'':'，首次送达后解锁地点'}`;
        if(node.getAttribute('aria-label')!==label)node.setAttribute('aria-label',label);
      }
    }
    render(s){
      if(this.s?.id!==s?.id)this.el.querySelector('.discovery-layer').replaceChildren();
      this.s=s;if(!s)return;this.updateNight(s);
      const chapter=G.chapterNumber(s);
      if(this.baseOverlay.region&&this.baseOverlay.region.chapter!==chapter){this.baseOverlay.region.chapter=chapter;this.baseOverlay.refreshStyle();}
      this.el.dataset.chapter=chapter;
      this.updateRegionHint();
      const desired=new Map(G.visibleServicePlaces(s).map(p=>[p.id,{p,order:null,status:'service'}]));
      for(const order of s.orders)if(G.regionPlaceOpen(s,order.target))desired.set(order.target,{p:G.place(order.target),order,status:'offer'});
      if(s.activeOrder&&G.regionPlaceOpen(s,s.activeOrder.target))desired.set(s.activeOrder.target,{p:G.place(s.activeOrder.target),order:s.activeOrder,status:'active'});
      const layer=this.el.querySelector('.points-layer'),seen=new Set();
      for(const node of [...layer.querySelectorAll('.map-point:not(.order-leaving)')]){
        const id=node.dataset.key,d=desired.get(id);
        if(!d){if(['offer','active'].includes(node.dataset.status))this.removePoint(node);else node.remove();continue;}
        const sameOrder=(node.dataset.orderId||'')===(d.order?.id||'');
        if(node.dataset.status!==d.status||!sameOrder||node.dataset.discovered!==String(G.placeUnlocked(s,id))){
          if(['offer','active'].includes(node.dataset.status)&&d.status!=='active')this.removePoint(node);else node.remove();
          layer.insertAdjacentHTML('beforeend',this.point(d.p,d.order,d.status,d.status==='offer'));
        }else node.classList.toggle('selected',this.selected===id);
        seen.add(id);
      }
      for(const [id,d] of desired)if(!seen.has(id)&&!layer.querySelector(`.map-point:not(.order-leaving)[data-key="${id}"]`))layer.insertAdjacentHTML('beforeend',this.point(d.p,d.order,d.status,d.status==='offer'));
      this.updateOrders(s);
      const player=G.playerPoint(s);
      this.el.querySelector('.player-layer').innerHTML=`<g class="player-marker" transform="translate(${player.x} ${player.y})" role="img" aria-label="玩家${escape(s.name)}位于${escape(G.locationName(s))}"><g class="player-screen" transform="scale(${1/this.scale})"><circle class="player-ground" r="5"/><path class="player-stem" d="M0-26V-6"/><g transform="translate(0 -40)"><circle class="player-pulse" r="22"/><circle class="player-core" r="15"/><path class="player-heading" d="m0-8 7 14-7-3-7 3Z"/></g></g></g>`;
      this.renderTrail();this.scheduleLabels();
    }
    celebrateUnlock(id){
      if(!this.s||!G.placeUnlocked(this.s,id))return;
      const p=G.place(id),layer=this.el.querySelector('.discovery-layer');
      layer.innerHTML=`<g class="place-discovery" transform="translate(${p.x} ${p.y})"><g class="place-discovery-visual"><circle class="discovery-ring" r="27"/><circle class="discovery-ring outer" r="39"/><path class="discovery-check" d="m-8 0 5 5 12-13"/></g></g>`;
      const node=layer.firstElementChild,remove=()=>node?.remove();
      node.addEventListener('animationend',e=>{if(e.target.classList.contains('place-discovery-visual'))remove();});
      // Cleanup also works when reduced motion disables CSS animation.
      root.setTimeout(remove,1400);
    }
    renderTrail(){
      if(!this.s)return;let trail='';
      const a=this.s.activity;
      // 已完成路线只保留在状态中用于存档/记录，不继续画在地图上。
      let route=this.selected?G.routeFrom(this.s,this.selected):a?.phase==='travel'?a.route:null;
      if(!this.selected&&a?.phase==='travel'){
        let length=0;const points=[G.playerPoint(this.s)];
        for(let i=1;i<a.route.points.length;i++){
          const p=a.route.points[i-1],q=a.route.points[i];length+=G.roadDistance(p,q);
          if(length>a.travelled+1e-8)points.push(q);
        }
        route={points};
      }
      if(route?.points.length>1){const d=G.MapArtwork.line(route.points),status=this.selected?'preview':'active';trail=`<path class="route-casing ${status}" d="${d}"/><path class="route-line ${status}" d="${d}"/>`;}
      if(this.trailMarkup!==trail){this.el.querySelector('.trail-layer').innerHTML=trail;this.trailMarkup=trail;}
    }
    updatePosition(s){
      this.s=s;const marker=this.el.querySelector('.player-marker');if(!marker)return this.render(s);
      const p=G.playerPoint(s),position=`translate(${p.x} ${p.y})`,label=`玩家${s.name}位于${G.locationName(s)}`;
      if(marker.getAttribute('transform')!==position)marker.setAttribute('transform',position);
      if(marker.getAttribute('aria-label')!==label)marker.setAttribute('aria-label',label);
      this.updateNight(s);this.updateOrders(s);this.renderTrail();
    }
    updateNight(s){const night=String(G.isNight(s));if(this.el.dataset.night!==night){this.el.dataset.night=night;this.baseOverlay.refreshStyle();}}
    select(id){if(id&&G.regionBlock(this.s,id))return;this.selected=id;this.render(this.s);}
    fitScale(){const [left,top,right,bottom]=this.extent;return Math.max(.0001,Math.min(this.el.clientWidth/(right-left),Math.max(1,this.el.clientHeight-95)/(bottom-top))*.97);}
    minScale(){return Math.min(.2,this.fitScale());}
    scheduleLabels(){
      if(this.moving||this.labelFrame!=null)return;
      this.labelFrame=root.requestAnimationFrame(()=>{this.labelFrame=null;if(!this.moving)this.layoutLabels();});
    }
    layoutLabels(){
      const origin=this.map.latLngToContainerPoint([0,0]);this.tx=origin.x;this.ty=origin.y;
      const nodes=[...this.el.querySelectorAll('.map-point:not(.order-leaving)')],w=this.el.clientWidth,h=this.el.clientHeight;
      const screen=nodes.map(node=>{const p=G.place(node.dataset.key);return {node,x:p.x*this.scale+this.tx,y:p.y*this.scale+this.ty};});
      const overlap=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
      const occupied=screen.map(p=>({x:p.x-25,y:p.y-25,w:50,h:50}));
      if(this.s){const p=G.playerPoint(this.s);occupied.push({x:p.x*this.scale+this.tx-20,y:p.y*this.scale+this.ty-62,w:40,h:42});}
      const rank=p=>p.node.classList.contains('selected')?0:p.node.dataset.status==='active'?1:p.node.dataset.status==='service'?2:3;
      screen.sort((a,b)=>rank(a)-rank(b));
      for(const p of screen){
        const label=p.node.querySelector('.point-label'),lw=Number(label.dataset.width);
        const candidate=[{dx:0,dy:0},{dx:0,dy:-82},{dx:lw/2+31,dy:-41},{dx:-lw/2-31,dy:-41}].find(({dx,dy})=>{
          const box={x:p.x-lw/2+dx,y:p.y+29+dy,w:lw,h:24};
          return box.x>=4&&box.y>=4&&box.x+lw<=w-4&&box.y+24<=h-4&&!occupied.some(o=>overlap(box,o));
        });
        label.classList.toggle('label-hidden',!candidate);
        const {dx,dy}=candidate||{dx:0,dy:0},position=`translate(${dx} ${dy})`;
        if(label.getAttribute('transform')!==position)label.setAttribute('transform',position);
        if(candidate)occupied.push({x:p.x-lw/2+dx,y:p.y+29+dy,w:lw,h:24});
      }
    }
    transform(){
      this.scale=2**this.map.getZoom();const origin=this.map.latLngToContainerPoint([0,0]);this.tx=origin.x;this.ty=origin.y;
      this.updateRegionHint();
      if(this.viewScale!==this.scale){
        this.viewScale=this.scale;this.el.dataset.zoom=this.scale.toFixed(2);
        const detail=this.scale<.5?'overview':this.scale<.8?'city':'street';if(this.el.dataset.detail!==detail){const overviewChanged=(this.el.dataset.detail==='overview')!==(detail==='overview');this.el.dataset.detail=detail;if(overviewChanged&&!this.baseOverlay.region){if(this.moving)this.zoomStyleChanged=true;else this.baseOverlay.refreshStyle();}}
        for(const node of this.el.querySelectorAll('.point-screen,.player-screen'))node.setAttribute('transform',`scale(${1/this.scale})`);
        this.updateScale();
      }
      this.scheduleLabels();
    }
    updateScale(){
      const target=90*G.WORLD.metersPerUnit/this.scale,power=10**Math.floor(Math.log10(target)),meters=[1,2,5,10].map(v=>v*power).filter(v=>v<=target*(1+1e-12)).at(-1);
      const ruler=this.el.querySelector('.map-scale');ruler.querySelector('.scale-distance').textContent=meters>=1000?`${meters/1000} 千米`:`${meters} 米`;ruler.setAttribute('aria-label','地图比例尺，一地图单位为一米');ruler.style.setProperty('--scale-width',`${meters/G.WORLD.metersPerUnit*this.scale}px`);
    }
    updateRegionHint(){
      if(!this.s)return;const center=this.map.getCenter(),r=G.regionAt({x:center.lng,y:-center.lat}),locked=r&&r.chapter>G.chapterNumber(this.s);
      this.regionHint.hidden=!locked;const text=locked?`${r.name} · 第${r.chapter}章开放 · 暂不可进入`:'';
      if(this.regionHint.textContent!==text)this.regionHint.textContent=text;
    }
    fit(){const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h)return;this.cancelZoom();const [left,top,right,bottom]=this.extent;this.map.invalidateSize({pan:false});this.map.setView([-(top+bottom)/2-47.5/this.fitScale(),(left+right)/2],Math.log2(this.fitScale()),{animate:false});this.transform();}
    center(){if(!this.s||!this.el.clientWidth||!this.el.clientHeight)return;this.cancelZoom();const p=G.playerPoint(this.s),scale=Math.max(this.el.clientWidth<800?.95:.7,this.scale);this.map.invalidateSize({pan:false});this.map.setView([-p.y+this.el.clientHeight*.02/scale,p.x+this.el.clientWidth*.02/scale],Math.log2(scale),{animate:false});this.transform();}
    cancelZoom(){
      const wheel=this.map.scrollWheelZoom;root.clearTimeout(wheel._timer);wheel._delta=0;wheel._startTime=null;
      if(!this.zoomTween)return;
      root.cancelAnimationFrame(this.zoomFrame);this.zoomFrame=null;this.zoomTween=null;
      // Commit the displayed view once; intermediate frames only transform old tiles.
      this.map.fire('zoom');this.map._moveEnd(true);
    }
    zoom(mult,x=this.el.clientWidth/2,y=this.el.clientHeight/2){
      if(!Number.isFinite(mult)||mult<=0||!Number.isFinite(x)||!Number.isFinite(y))return;
      const map=this.map,from=map.getZoom(),delta=Math.log2(mult),previous=this.zoomTween;
      const base=previous&&Math.sign(delta)===Math.sign(previous.zoom-from)?previous.zoom:from;
      const zoom=G.clamp(base+delta,Math.log2(this.minScale()),Math.log2(2.8));
      if(Math.abs(zoom-from)<1e-9){this.cancelZoom();return;}
      map._stop();root.cancelAnimationFrame(this.zoomFrame);
      // L.Point is a container pixel position; an array would mean a LatLng.
      const point=root.L.point(x,y),anchor=map.containerPointToLatLng(point),offset=point.subtract(map.getSize().divideBy(2));
      const centerAt=z=>map._limitCenter(map.unproject(map.project(anchor,z).subtract(offset),z),z,map.options.maxBounds);
      const tween=this.zoomTween={from,zoom,start:root.performance.now()};
      if(!previous)map._moveStart(true,false);
      const frame=now=>{
        if(this.zoomTween!==tween)return;
        const t=this.motionMedia?.matches?1:G.clamp((now-tween.start)/180,0,1);
        const z=from+(zoom-from)*(1-(1-t)**3),center=centerAt(z);
        if(t<1){
          // Use Leaflet's continuous pinch path: scale both layers without fetching
          // or painting a fresh tile level at each fractional zoom value.
          map._move(center,z,{pinch:true,round:false});this.zoomFrame=root.requestAnimationFrame(frame);
        }else{
          this.zoomTween=null;this.zoomFrame=null;
          if(map.getZoom()===zoom)map.fire('zoom');else map._move(centerAt(zoom),zoom);
          map._moveEnd(true);
        }
      };
      if(this.motionMedia?.matches)frame(tween.start+180);
      else this.zoomFrame=root.requestAnimationFrame(frame);
    }
    bind(){
      this.map.on('click',e=>{const point=e.originalEvent.target.closest?.('[data-place]');if(point)this.onSelect(point.dataset.place);});
      this.map.on('dblclick',e=>{this.zoom(2**(this.map.options.zoomDelta*(e.originalEvent.shiftKey?-1:1)),e.containerPoint.x,e.containerPoint.y);root.L.DomEvent.preventDefault(e.originalEvent);});
      for(const type of ['mousedown','touchstart'])this.el.addEventListener(type,()=>this.cancelZoom(),{capture:true,passive:true});
      const wheel=this.map.scrollWheelZoom;
      wheel._performZoom=()=>{
        const delta=wheel._delta/(4*this.map.options.wheelPxPerZoomLevel),amount=4*Math.log(2/(1+Math.exp(-Math.abs(delta))))/Math.LN2;
        wheel._delta=0;wheel._startTime=null;
        if(amount)this.zoom(2**(delta>0?amount:-amount),wheel._lastMousePos.x,wheel._lastMousePos.y);
      };
      this.el.addEventListener('keydown',e=>{const p=e.target.closest('[data-place]');if(p&&['Enter',' '].includes(e.key)){e.preventDefault();this.onSelect(p.dataset.place);return;}const pans={ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-70],ArrowDown:[0,70]};if(pans[e.key]){this.cancelZoom();this.map.panBy(pans[e.key],{animate:false});}else if(e.key==='+'||e.key==='=')this.zoom(1.2);else if(e.key==='-')this.zoom(1/1.2);else if(e.key==='Home')this.fit();else return;e.preventDefault();});
    }
  };
})(globalThis);
