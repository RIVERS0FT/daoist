"""Real RAF + whole-page CPU/renderer performance check; no mocked clock or storage.

python tests/browser-performance.py --root public --output artifacts/performance
Use --headed to profile a visible local browser, --cpu-rate 4 for a slower CPU.
Optional --scenes start-art,npc-art,inventory-art,player-appearance use isolated,
validated saves and real UI.
"""
import argparse
import json
import mimetypes
import os
import re
import time
from pathlib import Path
from urllib.parse import unquote,urlparse
from playwright.sync_api import sync_playwright
from frame_metrics import summarize_trace

ROOT=Path(__file__).resolve().parents[1]
BASE='https://daoist.test/daoist/'
PROBE=r'''(()=>{
  let capture=null;
  const observer=new PerformanceObserver(list=>{if(capture)for(const e of list.getEntries())capture.longTasks.push({start:e.startTime,duration:e.duration});});
  observer.observe({type:'longtask',buffered:false});
  const read=()=>{const G=NightCourier,m=window.__perfMap,s=m?.s;return s?{minutes:s.minutes,position:G.playerPoint(s),distance:s.stats.distance,activity:s.activity?.phase,saves:window.__perfSaves||0}:null;};
  window.__perfStart=()=>{capture={raf:[],longTasks:[],before:read()};};
  window.__perfStop=()=>{const result=capture;result.after=read();capture=null;return result;};
  function sample(t){if(capture){performance.mark('nc-frame');capture.raf.push(t);}requestAnimationFrame(sample);}
  requestAnimationFrame(sample);
  addEventListener('DOMContentLoaded',()=>{
    const G=NightCourier,render=G.CityMap.prototype.render;
    G.CityMap.prototype.render=function(s){window.__perfMap=this;return render.call(this,s);};
    const write=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k===G.STORAGE_KEY)window.__perfSaves=(window.__perfSaves||0)+1;return write.call(this,k,v);};
  });
})();
//# sourceURL=performance-harness.js
'''


def serve(page,directory):
    def handler(route):
        path=unquote(urlparse(route.request.url).path)
        if path.endswith('/api/health'):
            route.fulfill(json={'aiConfigured':False,'message':'Performance test: classic mode'});return
        relative=path.removeprefix('/daoist/') or 'index.html';target=(directory/relative).resolve()
        if not target.is_relative_to(directory) or not target.is_file():
            route.fulfill(status=404,body='Not found');return
        route.fulfill(body=target.read_bytes(),content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
    page.route(BASE+'**',handler)


def wait_trace(page,complete):
    # CDP may export tens of MB after sampling has stopped. This deadline only
    # bounds trace delivery; scene duration, sampling and frame budgets stay fixed.
    deadline=time.monotonic()+60
    while not complete:
        if time.monotonic()>deadline:raise TimeoutError('Chromium trace did not finish')
        page.wait_for_timeout(50)


def prepare_art_scene(page,scene):
    # Keep unfinished travel/late-chapter state in its own real save. Artwork
    # fixtures start paused at home, without pending stories or notifications.
    close=page.locator('#panel[open] [data-ui="close"]')
    if close.count():close.click()
    if page.locator('#panel[open]').count():
        # A blocking story has no close control; use the existing home handler
        # during setup rather than choose a story branch to obtain a fixture.
        page.locator('#game-header [data-ui="home"]').evaluate('(button)=>button.click()')
    else:
        pause=page.locator('[data-ui="pause"]')
        if pause.get_attribute('aria-label')!='继续游戏':pause.click()
        page.locator('#game-header [data-ui="home"]').click()
    fixture=page.evaluate('''scene=>{
      const G=NightCourier,name=scene==='npc-art'?'人物帧长测试':scene==='player-appearance'?'形象帧长测试':'开始页帧长测试';
      const s=G.newGame(name,'classic',20261001,scene==='player-appearance'?'male-rider-steady':G.DEFAULT_APPEARANCE_ID);
      if(scene==='npc-art'){s.bonds.lin.met=true;s.bonds.zhou.met=true;}
      if(scene==='inventory-art'){
        for(const item of G.ITEMS.filter(item=>!item.unique))s.inventory[item.id]=1;
        s.learned=['breathing','lightstep'];s.equipment=['jade','robe'];
      }
      G.syncFeatureUnlocks(s,true);
      const clean=G.sanitizeSave(s),store=G.createStore(localStorage);store.load();
      const saved=store.upsert(clean);if(!saved.ok)throw new Error(saved.error);
      dispatchEvent(new StorageEvent('storage',{key:G.STORAGE_KEY}));
      return {id:clean.id,appearanceId:clean.appearanceId,met:G.visibleNPCs(clean).map(n=>n.id),features:clean.unlockedFeatures};
    }''',scene)
    page.locator(f'[data-ui="load"][data-id="{fixture["id"]}"]').click()
    page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
    assert page.locator('[data-npc-portrait]').count()==0,'Portrait was mounted before its measured scene'
    if scene=='npc-art':
        assert sorted(fixture['met'])==['lin','zhou'],fixture
        assert fixture['features']==['bonds'],fixture
    return fixture


def decode_art_image(locator):
    locator.scroll_into_view_if_needed()
    return locator.evaluate('''async img=>{
      await img.decode();
      if(!img.complete||!img.naturalWidth||img.hidden||img.closest('[hidden]'))throw new Error('Artwork failed to load: '+img.src);
      return {src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight};
    }''')


def scroll_art_container(page,selector):
    container=page.locator(selector)
    before=container.evaluate('(el)=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight})')
    box=container.bounding_box();page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
    page.mouse.wheel(0,420);page.wait_for_timeout(120)
    down=container.evaluate('(el)=>el.scrollTop')
    page.mouse.wheel(0,-420);page.wait_for_timeout(120)
    up=container.evaluate('(el)=>el.scrollTop')
    if before['max']>1:assert down!=before['top'] or up!=down,f'{selector}: scrollable artwork did not scroll'
    return {'before':before['top'],'down':down,'up':up,'max':before['max']}


def run_scene(page,cdp,scene,seconds,modules,output,budget):
    art_fixture=prepare_art_scene(page,scene) if scene in ('start-art','npc-art','inventory-art','player-appearance') else None
    art_checks={'fixture':art_fixture,'iterations':0,'images':[],'scrolls':[]} if art_fixture else None
    if scene=='player-appearance':
        art_checks['saved_count']=page.evaluate('JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves.length')
        art_checks['selected']=[]
    if scene.startswith('region-'):
        # Isolated late-chapter fixture: measure actual detailed territory, not
        # the cheaper fog surface of a new game's locked districts.
        page.evaluate('''()=>{const G=NightCourier,m=__perfMap,s=m.s;
          s.player.realm=9;s.player.realmLevel=1;s.stats.delivered=150;s.flags.systemAwakened=true;s.flags.firstOrder=true;
          s.bonds.lin.met=true;s.bonds.chen.met=true;for(const key of G.STORY_FLAG_KEYS)s.flags[key]=true;
          s.claimed=['q1'];G.syncFeatureUnlocks(s,true);s.unlockNotices=[];m.render(s);
        }''')
    if scene=='region-detail':
        page.evaluate('()=>{__perfMap.map.setView([-1500,1500],Math.log2(.09),{animate:false});}')
    if scene=='region-pan':
        page.evaluate('(()=>{const p=NightCourier.PLACES.find(p=>p.regional&&p.x>15000&&p.y>18000);__perfMap.map.setView([-p.y,p.x],Math.log2(.7),{animate:false});})()')
    if scene=='travel':
        page.locator('.map-point[data-place="garage"]').focus();page.keyboard.press('Enter')
    elif scene=='idle':
        page.click('[data-ui="pause"]');page.click('[data-ui="pause"]') # Reset autosave baseline through real controls.
    page.wait_for_timeout(350)
    page.wait_for_function('!window.__perfMap.baseOverlay.isLoading()')
    events=[];complete=[]
    on_data=lambda p:events.extend(p['value'])
    on_done=lambda p:complete.append(p)
    cdp.on('Tracing.dataCollected',on_data);cdp.on('Tracing.tracingComplete',on_done)
    cdp.send('Tracing.start',{'categories':'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline','transferMode':'ReportEvents'})
    cdp.send('Profiler.start');page.evaluate('window.__perfStart()')
    started=time.monotonic()
    try:
        if scene=='travel':
            # Start the real action inside capture: a short route can finish
            # while tracing/profiling is being prepared on a slower host.
            page.locator('[data-act="travel"]').click()
            page.wait_for_timeout(seconds*1000)
        elif scene=='probe-long-task':
            page.wait_for_timeout(350)
            page.evaluate('''()=>{setTimeout(()=>{const until=performance.now()+200;while(performance.now()<until){};},0);}''')
            page.wait_for_timeout(350)
        elif scene in ('pan','region-pan','region-detail'):
            box=page.locator('#city-map').bounding_box();x=box['x']+box['width']*.55;y=box['y']+box['height']*.35
            page.mouse.move(x,y);page.mouse.down();i=0
            while time.monotonic()-started<seconds:
                page.mouse.move(x+min(100,box['width']*.2)*(1 if i%2 else -1),y+(15 if i%2 else 0),steps=12);i+=1
            page.mouse.up()
        elif scene=='region-load':
            for x,y in [(-25000,-14000),(25000,30000),(10000,-45000)]:
                page.evaluate('([x,y])=>{__perfMap.map.setView([-y,x],Math.log2(.7),{animate:false});}',[x,y])
                page.wait_for_function('!__perfMap.baseOverlay.isLoading()',timeout=30000)
                page.wait_for_timeout(300)
            page.evaluate('__perfMap.center()')
            page.wait_for_function('!__perfMap.baseOverlay.isLoading()',timeout=30000)
        elif scene=='zoom':
            box=page.locator('#city-map').bounding_box();page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.55);i=0
            while time.monotonic()-started<seconds:
                page.mouse.wheel(0,70 if i%2 else -70);page.wait_for_timeout(250);i+=1
        elif scene=='panel':
            while time.monotonic()-started<seconds:
                page.locator('#game-nav [data-panel="help"]').click();page.wait_for_timeout(180)
                page.locator('#panel [data-ui="close"]').click();page.wait_for_timeout(180)
        elif scene=='start-art':
            while time.monotonic()-started<seconds or art_checks['iterations']<2:
                page.locator('#game-header [data-ui="home"]').click()
                art_checks['images'].append(decode_art_image(page.locator('.hero-illustration img')))
                art_checks['scrolls'].append(scroll_art_container(page,'#start-screen'))
                page.locator(f'[data-ui="load"][data-id="{art_fixture["id"]}"]').click()
                page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
                page.wait_for_function('!__perfMap.baseOverlay.isLoading()')
                page.wait_for_timeout(180);art_checks['iterations']+=1
        elif scene=='player-appearance':
            while time.monotonic()-started<seconds or art_checks['iterations']<2:
                avatar=page.locator(f'.avatar img[data-player-appearance="{art_fixture["appearanceId"]}"]')
                art_checks['images'].append(decode_art_image(avatar))
                avatar.evaluate('(img)=>{window.__perfAppearanceAvatar=img;}')
                page.locator('#game-header [data-ui="home"]').click()
                page.locator('[data-ui="new-game"]').click()
                page.wait_for_selector('#panel[open] #new-game-form')
                radios=page.locator('#new-game-form input[name="appearanceId"]')
                assert radios.count()==2,'The real form must contain two appearance choices'
                assert page.locator('#new-game-form input[name="appearanceId"][value="male-rider"]').is_checked()
                for appearance in ('male-rider','male-rider-steady'):
                    art_checks['images'].append(decode_art_image(page.locator(f'.appearance-preview [data-player-appearance="{appearance}"]')))
                page.evaluate('window.__perfAppearancePreviews=[...document.querySelectorAll(".appearance-preview [data-player-appearance]")]')
                for appearance in ('male-rider-steady','male-rider'):
                    radio=page.locator(f'#new-game-form input[name="appearanceId"][value="{appearance}"]')
                    radio.check();assert radio.is_checked(),f'Appearance selection failed: {appearance}'
                    assert page.locator('#new-game-form input[name="appearanceId"]:checked').count()==1
                    art_checks['selected'].append(appearance)
                art_checks['scrolls'].append(scroll_art_container(page,'.panel-body'))
                assert page.evaluate('''()=>{
                  const current=[...document.querySelectorAll('.appearance-preview [data-player-appearance]')];
                  return current.length===2&&current.every((img,i)=>img===__perfAppearancePreviews[i]&&img.isConnected&&!img.hidden);
                }'''),'Appearance selection or scroll recreated preview images'
                # Close without submitting: repeated profiling must not consume save slots.
                page.locator('#panel [data-ui="close"]').click()
                page.locator(f'[data-ui="load"][data-id="{art_fixture["id"]}"]').click()
                page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
                page.wait_for_function('!__perfMap.baseOverlay.isLoading()')
                art_checks['images'].append(decode_art_image(avatar))
                page.wait_for_timeout(180)
                assert page.evaluate('__perfAppearanceAvatar===document.querySelector(".avatar img")'),'Repeated form display recreated the HUD avatar'
                page.locator('#game-header .identity[data-panel="character"]').click()
                page.wait_for_selector('#panel[open] .character-appearance')
                art_checks['images'].append(decode_art_image(page.locator(f'.player-portrait [data-player-appearance="{art_fixture["appearanceId"]}"]')))
                art_checks['scrolls'].append(scroll_art_container(page,'.panel-body'))
                page.locator('#panel [data-ui="close"]').click()
                assert page.evaluate('__perfAppearanceAvatar===document.querySelector(".avatar img")'),'Character panel recreated the HUD avatar'
                assert page.evaluate('__perfMap.s.appearanceId')==art_fixture['appearanceId'],'The unsubmitted form changed the fixture appearance'
                assert page.evaluate('JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves.length')==art_checks['saved_count'],'Opening the form created an extra save'
                art_checks['iterations']+=1
            art_checks['preview_nodes_stable']=True;art_checks['avatar_node_stable']=True
        elif scene=='inventory-art':
            while time.monotonic()-started<seconds or art_checks['iterations']<2:
                page.locator('#game-nav [data-panel="inventory"]').click()
                page.wait_for_selector('#panel[open] .inventory-card')
                art_checks['cards']=page.locator('.inventory-card').count()
                assert art_checks['cards']>=175,'Inventory fixture must include all consumable types and materials'
                for item_id in ('qi','herb','fragment','breathing','jade','robe'):
                    art_checks['images'].append(decode_art_image(page.locator(f'[data-item-art="{item_id}"]')))
                art_checks['scrolls'].append(scroll_art_container(page,'.panel-body'))
                page.locator('#panel [data-ui="close"]').click()
                page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
                page.wait_for_timeout(180);art_checks['iterations']+=1
        elif scene=='npc-art':
            while time.monotonic()-started<seconds or art_checks['iterations']<2:
                page.locator('#game-nav [data-panel="bonds"]').click()
                page.wait_for_selector('#panel[open] .npc-card')
                assert sorted(page.locator('.npc-card').evaluate_all('(cards)=>cards.map(c=>c.dataset.npcId)'))==['lin','zhou']
                assert page.locator('[data-npc-portrait]').count()==2,'Both known portraits must be measured'
                for npc in ('lin','zhou'):
                    art_checks['images'].append(decode_art_image(page.locator(f'[data-npc-portrait="{npc}"]')))
                art_checks['scrolls'].append(scroll_art_container(page,'.panel-body'))
                page.locator('#panel [data-ui="close"]').click()
                page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
                page.wait_for_timeout(180);art_checks['iterations']+=1
        else:page.wait_for_timeout(seconds*1000)
        sample=page.evaluate('window.__perfStop()')
    finally:
        profile=cdp.send('Profiler.stop')['profile'];cdp.send('Tracing.end');wait_trace(page,complete)
        cdp.remove_listener('Tracing.dataCollected',on_data);cdp.remove_listener('Tracing.tracingComplete',on_done)
    summary=summarize_trace(events,profile,modules,sample['raf'],budget)
    summary.update({'scene':scene,'long_tasks':sample['longTasks'],'state_before':sample['before'],'state_after':sample['after']})
    if art_checks:
        for key in ('minutes','position','distance','activity'):
            assert sample['after'][key]==sample['before'][key],f'{scene}: artwork changed {key}'
        art_checks['gameplay_unchanged']=True;summary['art']=art_checks
    output.mkdir(parents=True,exist_ok=True)
    (output/f'{scene}.trace.json').write_text(json.dumps({'traceEvents':events}),encoding='utf8')
    (output/f'{scene}.cpuprofile').write_text(json.dumps(profile),encoding='utf8')
    (output/f'{scene}.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    assert len(summary['frames'])>=20,'Too few measured frames'
    if scene=='travel':assert sample['after']['distance']>sample['before']['distance'],'Travel must actually advance'
    if scene=='idle' and seconds>=11:assert sample['after']['saves']>sample['before']['saves'],'Autosave was not exercised'
    return summary


def write_report(report,output):
    (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    lines=['# Frame performance report','',
           'Module values are sampled self time; zero means not sampled. Browser thread work overlaps and must not be added to frame wall time.','',
           '| Viewport | Scene | FPS | P95 ms | P99 ms | Max ms | Over budget |',
           '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
    for s in report['scenarios']:
        f=s['frame_ms'];lines.append(f"| {s['viewport']} | {s['scene']} | {s['fps']} | {f['p95']} | {f['p99']} | {f['max']} | {s['over_budget_ratio']:.2%} |")
    for s in report['scenarios']:
        lines+=['',f"## {s['viewport']} / {s['scene']}",'',
                '| Source module | Total sampled ms | P95 per frame ms | Max per frame ms |',
                '| --- | ---: | ---: | ---: |']
        for name,v in s['modules'].items():lines.append(f"| {name} | {v['total_ms']} | {v['p95_frame_ms']} | {v['max_frame_ms']} |")
        lines+=['','| Browser category | Total ms | P95 per frame ms | Max per frame ms |','| --- | ---: | ---: | ---: |']
        for name,v in s['browser'].items():lines.append(f"| {name} | {v['total_ms']} | {v['p95_frame_ms']} | {v['max_frame_ms']} |")
    lines+=['','## Budget failures','',json.dumps(report['failures'],ensure_ascii=False)]
    (output/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf8')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',default='public');parser.add_argument('--output',default='artifacts/performance')
    parser.add_argument('--viewports',default='1440x1000,375x812');parser.add_argument('--scenes',default='idle,pan,zoom,travel,panel,region-pan,region-load,region-detail')
    parser.add_argument('--seconds',type=float,default=4);parser.add_argument('--cpu-rate',type=float,default=1)
    parser.add_argument('--headed',action='store_true');parser.add_argument('--report-only',action='store_true')
    args=parser.parse_args();directory=(ROOT/args.root).resolve();output=(ROOT/args.output).resolve()
    if not output.is_relative_to(ROOT/'artifacts'):parser.error('--output must be inside artifacts/')
    config=json.loads((ROOT/'tests/performance-budget.json').read_text(encoding='utf8'))
    modules=re.findall(r'<script src="([^"]+)"', (directory/'index.html').read_text(encoding='utf8'))
    report={'metadata':{'source':str(directory),'cpu_rate':args.cpu_rate,'headless':not args.headed,'budget':config,
                       'module_timing':'V8 sampled self time, native calls attributed to nearest source parent; zero means not sampled, not guaranteed free',
                       'frame_timing':'Actual RAF callback-entry interval from trace markers, aligned with CPU/browser work; RAF scheduling timestamp delta retained separately. Not physical display presentation time.',
                       'browser_timing':'Renderer spans are unioned per category. Raster and GPU-service thread CPU totals overlap and must not be added to wall time.'},'scenarios':[],'failures':[]}
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH');kwargs={'headless':not args.headed}
        if executable:kwargs['executable_path']=executable
        browser=p.chromium.launch(**kwargs);report['metadata']['browser']=browser.version
        try:
            for viewport in args.viewports.split(','):
                width,height=map(int,viewport.split('x'));context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
                page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                serve(page,directory);page.add_init_script(PROBE);page.goto(BASE)
                page.click('[data-ui="new-game"]');page.fill('#player-name-input','帧长测试');page.click('#new-game-form button[type="submit"]')
                page.wait_for_function('!!window.__perfMap');page.wait_for_timeout(750)
                cdp=context.new_cdp_session(page);cdp.send('Profiler.enable');cdp.send('Profiler.setSamplingInterval',{'interval':500})
                cdp.send('Emulation.setCPUThrottlingRate',{'rate':args.cpu_rate})
                if viewport==args.viewports.split(',')[0]:
                    witness=run_scene(page,cdp,'probe-long-task',1,modules,output/'self-test',config['frame_budget_ms'])
                    assert witness['frame_ms']['max']>config['max_ms'] and witness['long_tasks'],'A 200 ms task outside the map must trip the frame budget'
                    report['measurement_self_test']={'injected_block_ms':200,'observed_max_ms':witness['frame_ms']['max'],'caught':True}
                for scene in args.scenes.split(','):
                    result=run_scene(page,cdp,scene,max(11,args.seconds) if scene=='idle' else args.seconds,modules,output/viewport,config['frame_budget_ms'])
                    result['viewport']=viewport
                    checks={'p95_ms':result['frame_ms']['p95'],'max_ms':result['frame_ms']['max'],'over_budget_ratio':result['over_budget_ratio']}
                    failed=[f'{key}={value:.3f} > {config[key]}' for key,value in checks.items() if value>config[key]]
                    if failed:report['failures'].append({'viewport':viewport,'scene':scene,'reasons':failed})
                    report['scenarios'].append({k:v for k,v in result.items() if k!='frames'})
                    print(f"{viewport} {scene}: {result['fps']} FPS, p95 {result['frame_ms']['p95']} ms, max {result['frame_ms']['max']} ms; {'FAIL '+', '.join(failed) if failed else 'PASS'}",flush=True)
                assert not errors,errors
                page.screenshot(path=str(output/f'{viewport}.png'));context.close()
        finally:browser.close()
    output.mkdir(parents=True,exist_ok=True);write_report(report,output)
    print(f'Frame/module reports and Chrome traces: {output}',flush=True)
    if report['failures'] and not args.report_only:raise SystemExit(1)


if __name__=='__main__':main()
