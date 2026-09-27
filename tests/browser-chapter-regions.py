"""Territory fog, chapter access and UI regression; isolated saves only."""
import importlib.util,json,os,sys,time
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tests'))
spec=importlib.util.spec_from_file_location('perf',ROOT/'tests/browser-performance.py');perf=importlib.util.module_from_spec(spec);spec.loader.exec_module(perf)
OUT=ROOT/'artifacts/chapter-regions';OUT.mkdir(parents=True,exist_ok=True)
def ready(page):
 deadline=time.monotonic()+45
 while not page.evaluate('()=>!__perfMap.baseOverlay.isLoading()'):
  assert time.monotonic()<deadline,'Map loading timed out';page.wait_for_timeout(40)
results=[]
with sync_playwright() as p:
 kwargs={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**kwargs)
 for width,height in [(1440,1000),(375,812)]:
  ctx=browser.new_context(viewport={'width':width,'height':height});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  if '--url' not in sys.argv:perf.serve(page,ROOT/(sys.argv[sys.argv.index('--root')+1] if '--root' in sys.argv else 'public'))
  page.add_init_script(perf.PROBE);page.goto(sys.argv[sys.argv.index('--url')+1] if '--url' in sys.argv else perf.BASE)
  page.click('[data-ui="new-game"]');page.fill('#player-name-input','章节地图');page.click('#new-game-form button[type="submit"]');page.wait_for_selector('.player-marker');page.click('[data-ui="pause"]');ready(page)
  assert page.locator('.region-chip').inner_text().endswith('1 / 12 区')
  before=page.evaluate('()=>JSON.stringify(__perfMap.s)')
  page.click('[data-panel="chapters"]');assert page.locator('.chapter-region').count()==12;assert page.locator('.chapter-region[data-open="true"]').count()==1
  page.screenshot(path=str(OUT/f'chapters-{width}.png'));page.click('#panel [data-ui="close"]')
  page.click('[data-ui="fit-map"]');ready(page);page.screenshot(path=str(OUT/f'overview-{width}.png'))
  assert page.evaluate('()=>JSON.stringify(__perfMap.s)')==before
  # A real outer delivery district must contain no street pixels before opening.
  target=page.evaluate('()=>{const G=NightCourier,p=G.PLACES.find(p=>G.placeRegion(p.id).chapter===6);return {x:p.x,y:p.y,id:p.id};}')
  page.evaluate('p=>{__perfMap.map.setView([-p.y,p.x],Math.log2(.7),{animate:false});}',target);ready(page)
  assert page.locator('.map-region-hint').is_visible();assert '第6章开放' in page.locator('.map-region-hint').inner_text()
  image=Image.open(BytesIO(page.screenshot())).convert('RGB');box=page.locator('#city-map').bounding_box();cx=round(box['x']+box['width']/2);cy=round(box['y']+box['height']/2)
  def colors(im):return set(im.crop((cx-25,cy-25,cx+25,cy+25)).getdata())
  assert colors(image)=={(228,227,216)},colors(image)
  page.screenshot(path=str(OUT/f'locked-{width}.png'))
  blocked=page.evaluate('id=>{const G=NightCourier,s=__perfMap.s,r=G.perform(s,"travel",{target:id});return {ok:r.ok,same:r.state===s,error:r.error};}',target['id'])
  assert not blocked['ok'] and blocked['same'] and '未开放' in blocked['error']
  # Read-only preview must not mutate gameplay or open a territory.
  assert page.evaluate('()=>JSON.stringify(__perfMap.s)')==before
  # Isolated late-game fixture exercises repaint at identical camera position.
  page.evaluate('''()=>{const G=NightCourier,m=__perfMap,s=m.s;s.player.realm=9;s.stats.delivered=150;
    s.flags.systemAwakened=true;s.flags.firstOrder=true;s.bonds.lin.met=true;s.bonds.chen.met=true;
    for(const k of G.STORY_FLAG_KEYS)s.flags[k]=true;m.render(s);m.transform();}''');ready(page)
  assert page.locator('#city-map').get_attribute('data-chapter')=='12';assert page.locator('.map-region-hint').is_hidden()
  image=Image.open(BytesIO(page.screenshot())).convert('RGB');assert len(colors(image))>4
  page.screenshot(path=str(OUT/f'opened-{width}.png'))
  assert not errors,errors;results.append({'viewport':f'{width}x{height}','regions':12,'initial_open':1,'fog_hidden_after_unlock':True,'errors':errors});ctx.close()
 browser.close()
(OUT/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print('2 viewports: territory list, no-spoiler fog, locked travel, read-only map preview, chapter repaint passed')
