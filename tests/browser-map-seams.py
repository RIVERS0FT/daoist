"""Pixel regression for canvas gutters at fractional zoom / display scaling.

Uses actual source scripts and Leaflet, plus a uniform calibration surface. A
browser screenshot is sampled, so CSS/compositor gaps cannot hide behind canvas
getImageData. Requires Playwright and Pillow; --url checks the real local server.
"""
import argparse
from io import BytesIO
import json
import os
import time
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('performance',ROOT/'tests/browser-performance.py')
performance=importlib.util.module_from_spec(spec);spec.loader.exec_module(performance)
parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--root',default='public')
args=parser.parse_args();output=ROOT/'artifacts/map-seams';output.mkdir(exist_ok=True,parents=True)
results=[]
def wait_ready(page,predicate):
    deadline=time.monotonic()+45
    while not page.evaluate(predicate):
        assert time.monotonic()<deadline,'Map painting timed out'
        page.wait_for_timeout(30)

with sync_playwright() as p:
    kwargs={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**kwargs)
    for dpr in [1,1.25,2]:
        context=browser.new_context(viewport={'width':800,'height':600},device_scale_factor=dpr)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        if not args.url:performance.serve(page,(ROOT/args.root).resolve())
        page.goto(args.url or performance.BASE)
        page.evaluate('''()=>{
          const el=document.createElement('div');el.id='seam-fixture';el.className='city-map';
          Object.assign(el.style,{position:'fixed',inset:'0',width:'800px',height:'600px',zIndex:9999,background:'#ff00ff'});document.body.append(el);
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
          svg.innerHTML='<defs><pattern id="paper-grain"><circle fill="transparent"/></pattern></defs><g class="base-layer"><rect width="3137" height="3224" fill="#315b72" stroke="none"/></g>';
          el.append(svg);
          const map=L.map(el,{crs:L.CRS.Simple,zoomControl:false,attributionControl:false,zoomSnap:0,zoomAnimation:false,fadeAnimation:false,minZoom:-10});
          map.setView([-1500,1500],0);
          const tiles=new NightCourier.CityTiles(svg,{tileSize:192,minZoom:-10,region:false}).addTo(map);
          svg.style.display='none';window.__seams={map,tiles};
        }''')
        for scale in [.57,.7,.93,1.13,1.37]:
            page.evaluate('(s)=>{__seams.map.setZoom(Math.log2(s),{animate:false});__seams.map.panBy([17,-23],{animate:false});}',scale)
            wait_ready(page,'() => !__seams.tiles.isLoading()')
            page.wait_for_timeout(100)
            screenshot=page.screenshot();im=Image.open(BytesIO(screenshot)).convert('RGB')
            pixels=im.crop((round(40*dpr),round(40*dpr),round(760*dpr),round(560*dpr)))
            bad=sum(max(abs(a-b) for a,b in zip(color,(49,91,114)))>2 for color in pixels.getdata())
            results.append({'dpr':dpr,'scale':scale,'seam_pixels':bad})
            if bad:(output/f'failed-{dpr}-{scale}.png').write_bytes(screenshot)
            assert bad==0,results[-1]
        assert not errors,errors
        context.close()
    # Regression for the old detailed-centre rectangle: at the same zoom,
    # buildings must remain present across its former north/west/east borders.
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if not args.url:performance.serve(page,(ROOT/args.root).resolve())
    page.add_init_script(performance.PROBE);page.goto(args.url or performance.BASE)
    page.click('[data-ui="new-game"]');page.fill('#player-name-input','Map seam check')
    page.click('#new-game-form button[type="submit"]');page.wait_for_selector('.player-marker')
    page.click('[data-ui="pause"]')
    page.evaluate('''()=>{const G=NightCourier,m=__perfMap,s=m.s;
      s.player.realm=9;s.stats.delivered=150;s.flags.systemAwakened=true;s.flags.firstOrder=true;
      s.bonds.lin.met=true;s.bonds.chen.met=true;for(const key of G.STORY_FLAG_KEYS)s.flags[key]=true;m.render(s);
    }''')
    detail_results=[]
    for scale in [.09,.18]:
        for night in [False,True]:
            page.evaluate('''({scale,night})=>{
              const m=__perfMap;m.s.minutes=night?1400:480;m.render(m.s);
              m.map.setView([-1500,1500],Math.log2(scale),{animate:false});
            }''',{'scale':scale,'night':night})
            wait_ready(page,'() => !__perfMap.baseOverlay.isLoading()');page.wait_for_timeout(100)
            ruler=page.locator('.scale-distance').inner_text()
            assert 'undefined' not in ruler and 'NaN' not in ruler,ruler
            im=Image.open(BytesIO(page.screenshot())).convert('RGB')
            im.save(output/f'unified-{"night" if night else "day"}-{scale}.png')
            # Fixed geographic samples on real built-up blocks. UI overlays
            # are outside these boxes at both tested scales.
            boxes=page.evaluate('''()=>[[-1600,500,-600,1500],[500,-1500,1500,-500],[3700,700,4700,1700],[500,500,1300,1300]].map(b=>{
              const m=__perfMap.map,e=m.getContainer().getBoundingClientRect(),
              a=m.latLngToContainerPoint([-b[1],b[0]]),z=m.latLngToContainerPoint([-b[3],b[2]]);
              return [e.x+a.x,e.y+a.y,e.x+z.x,e.y+z.y];
            })''')
            expected=(52,75,66) if night else (216,209,195)
            counts=[]
            for box in boxes:
                crop=im.crop(tuple(round(v) for v in box))
                count=sum(max(abs(a-b) for a,b in zip(color,expected))<=3 for color in crop.getdata())
                assert count>20,{'scale':scale,'night':night,'box':box,'building_pixels':count}
                counts.append(count)
            detail_results.append({'scale':scale,'night':night,'building_pixels':counts})
    assert not errors,errors
    context.close();browser.close()
(output/'report.json').write_text(json.dumps(results,indent=2),encoding='utf8')
(output/'detail-report.json').write_text(json.dumps(detail_results,indent=2),encoding='utf8')
print(f'{len(results)} fractional zoom / DPR cases: no visible seam pixels; {len(detail_results)} day/night cases: buildings across former centre boundaries')
