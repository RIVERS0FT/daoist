"""Offline Chromium integration checks.

Build first: npm run build. Requires Python Playwright and Chromium. Uses the
actual bundled application with in-memory localStorage and explicitly mocked AI;
hosting probes separately use the real CSP sandbox without storage/fetch mocks.
Most cases drive GameClock with controlled timestamps; a separate case uses real
requestAnimationFrame. HTTP allowlist/CSP/AI proxy have independent Node tests.
"""
import json
import argparse
import time
import os
import sys
import mimetypes
from urllib.parse import urlparse, unquote
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('DAOIST_BROWSER_OUTPUT', str(ROOT / 'artifacts')))
OUT.mkdir(parents=True, exist_ok=True)
BOOT = r'''
window.__memory = new Map();
window.__storyRequests = [];
window.__aiConfigured = false; window.__aiDelay = 0; window.__aiFail = false;
window.__aiEvent = {title:'雨后的小灯',text:'巷口的店主在等一份热饭。',choices:[{label:'认真道谢',result:'店主也笑了。',effects:{qi:5}},{label:'请他喝一杯茶',result:'热茶驱散了寒意。',effects:{money:-5,karma:2}},{label:'留下祝福',result:'灯光亮了一点。',effects:{rep:1}}]};
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__memory.get(k)??null,setItem:(k,v)=>window.__memory.set(k,String(v)),removeItem:k=>window.__memory.delete(k),clear:()=>window.__memory.clear()}});
window.__nativeFetch=window.fetch.bind(window);
window.fetch = async (url,options={}) => {
 if(new URL(String(url),location.href).pathname.includes('/map/region/')) return window.__nativeFetch(url,options);
 if(String(url).endsWith('/api/health')) return new Response(JSON.stringify({aiConfigured:window.__aiConfigured}));
 if(String(url).endsWith('/api/story')){
  window.__storyRequests.push(JSON.parse(options.body));
  await new Promise((resolve,reject)=>{const t=setTimeout(resolve,window.__aiDelay);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));});});
  if(window.__aiFail) return new Response(JSON.stringify({error:'模拟接口失败'}),{status:503});
  return new Response(JSON.stringify({event:window.__aiEvent}));
 }
 throw new Error('Unexpected request in offline UI test');
};
'''
CONTROL = r'''
const G=NightCourier, original=G.GameClock.prototype.frame;
window.__now=10000;window.__wall=0;const wall=Date.now;
Date.now=()=>wall()+window.__wall;
G.GameClock.prototype.frame=function(){window.__clock=this;};
window.__pump=ms=>{
 const c=window.__clock;if(!c)throw new Error('Clock not initialized');
 original.call(c,window.__now);
 while(ms>0){const delta=Math.min(20,ms);window.__now+=delta;window.__wall+=delta;original.call(c,window.__now);ms-=delta;}
};
'''
CAPTURE = r'''
const G=NightCourier;
for(const name of ['render','updatePosition']){
 const old=G.CityMap.prototype[name];
 G.CityMap.prototype[name]=function(s){if(s)window.__live=G.clone(s);window.__map=this;return old.call(this,s);};
}
'''
results = []
reload_modes = []

def record(name):
    results.append({'name': name, 'passed': True})
    print('PASS', name, flush=True)

def current(page):
    return page.evaluate('window.__live')

def stored(page, name=None):
    return page.evaluate('(name)=>{const s=JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves;return name?s.find(x=>x.name===name):s[0];}', name)

def pump(page, ms):
    page.evaluate('(ms)=>window.__pump(ms)', ms)
    page.wait_for_timeout(120)  # Let the real render loop update the lightweight HUD.

def toggle(page):
    page.click('[data-ui="pause"]')

def new_game(page, name='云行', mode='classic'):
    page.click('[data-ui="new-game"]')
    page.fill('#player-name-input', name)
    page.check(f'input[name="mode"][value="{mode}"]')
    page.click('#new-game-form button[type="submit"]')
    page.wait_for_selector('#game-screen:not([hidden])')

def route_bundle(page, csp=None):
    def serve(route):
        relative = unquote(urlparse(route.request.url).path).removeprefix('/daoist/') or 'index.html'
        target = (ROOT / 'dist' / relative).resolve()
        if not target.is_relative_to((ROOT / 'dist').resolve()) or not target.is_file():
            route.fulfill(status=404, body='Not found')
            return
        headers = {'Content-Security-Policy': csp} if csp and relative == 'index.html' else {}
        route.fulfill(status=200, body=target.read_bytes(), content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream', headers=headers)
    page.route('https://daoist.test/daoist/**', serve)


def sandbox_new_game_checks(browser):
    # Match the production hosting restrictions without mocking storage or fetch.
    base = 'https://daoist.test/daoist/'
    csp = (f"sandbox allow-scripts allow-pointer-lock; default-src 'none'; "
           f"script-src {base} 'unsafe-inline' 'wasm-unsafe-eval'; "
           f"style-src {base} 'unsafe-inline'; img-src {base} data: blob:; "
           f"font-src {base} data:; connect-src {base}; form-action 'none'; "
           "base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'")
    for method, mode, width, height in [('click', 'classic', 1440, 1000), ('Enter', 'ai', 375, 812), ('click', 'classic', 667, 375)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width<900)
        page = ctx.new_page()
        errors, blocked_forms = [], []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.on('console', lambda message: blocked_forms.append(message.text) if 'Blocked form submission' in message.text else None)
        route_bundle(page, csp)
        page.goto(base, wait_until='load')
        assert page.evaluate("()=>{try{void localStorage;return false;}catch(e){return e.name==='SecurityError';}}")
        page.evaluate('() => {' + CAPTURE + '}')
        page.evaluate('''()=>{const original=NightCourier.newGame;window.__creations=0;NightCourier.newGame=(...args)=>{window.__creations++;return original(...args);};}''')
        page.click('[data-ui="new-game"]')
        page.click('#new-game-form button[type="submit"]')
        page.locator('#player-name-input').press('Enter')
        assert page.locator('#new-game-form').is_visible()
        assert page.evaluate('window.__creations') == 0
        page.fill('#player-name-input', '沙箱旅人')
        page.check(f'input[name="mode"][value="{mode}"]')
        page.locator('#player-name-input').dispatch_event('keydown', {'key': 'Enter', 'isComposing': True})
        assert page.evaluate('window.__creations') == 0
        if method == 'click':
            page.click('#new-game-form button[type="submit"]')
        else:
            page.locator('#player-name-input').press('Enter')
        page.wait_for_selector('.player-marker')
        toggle(page)
        assert current(page)['name'] == '沙箱旅人' and current(page)['mode'] == mode
        assert page.evaluate('window.__creations') == 1
        assert page.locator('#storage-warning').is_visible()
        assert page.evaluate("document.querySelector('#storage-warning').getBoundingClientRect().bottom<=document.querySelector('#game-header').getBoundingClientRect().top")
        for control in ['zoom-in', 'zoom-out', 'fit-map', 'locate']:
            page.click(f'[data-ui="{control}"]')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'sandbox-map-{width}.png'))
        page.click('[data-ui="home"]')
        assert page.locator('[data-ui="load"]').count() == 1
        assert not errors and not blocked_forms, (errors, blocked_forms)
        record(f'真实托管沙箱 {width}×{height}：{method} 开局校验、单次创建与提示不遮挡控制栏')
        ctx.close()


def setup(browser, width=1440, height=1000, ai=False, controlled=True):
    ctx = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width<600, device_scale_factor=1)
    page = ctx.new_page()
    page.set_default_timeout(7000)
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.add_init_script(BOOT + '\nwindow.__aiConfigured=' + json.dumps(ai) + ';')
    route_bundle(page)
    page.goto('https://daoist.test/daoist/', wait_until='load')
    if controlled:
        page.evaluate('() => {' + CONTROL + '}')
        page.wait_for_function('window.__clock != null')
    page.evaluate('() => {' + CAPTURE + '}')
    return ctx, page, errors

def select_order(page):
    # Candidate order is not guaranteed to be affordable after nine real deliveries.
    # Pick an existing feasible offer; never mutate resources or replace its ticket.
    target = page.evaluate("""()=>{const G=NightCourier,s=window.__live;
      return s.orders.find(o=>{const p=G.travelPlan(s,o.target);return !G.travelBlock(s,p)&&
        (o.condition!=='mystic'||s.player.mana>=8)&&
        (o.condition!=='careful'||s.player.stamina-p.stamina>=10);})?.target;}""")
    assert target, 'No affordable offer in the current test state'
    page.locator(f'.order-point[data-place="{target}"]').focus()
    page.keyboard.press('Enter')
    assert page.locator('[data-act="deliver"]').is_enabled()

def fixture(page, edits, unlock_gameplay=True):
    # Isolated pre-existing gameplay regressions explicitly open feature gates.
    # The progressive flow below opts out and starts from a genuine new save.
    edits = dict(edits)
    ack_result_ui(page)
    if unlock_gameplay:
        edits['unlockedFeatures'] = page.evaluate('NightCourier.FEATURE_UNLOCKS.map(f=>f.id)')
        edits['unlockedPlaces'] = page.evaluate('NightCourier.PLACES.filter(p=>!p.regional).map(p=>p.id)')
    if page.locator('#panel[open] [data-ui="close"]').count():
        page.click('#panel [data-ui="close"]')
    page.click('[data-ui="home"]')
    page.evaluate('''(edits)=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k));const s=x.saves[0];Object.assign(s,edits);localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''', edits)
    page.locator('[data-ui="load"]').first.click()

def forged_button(page, attrs):
    page.evaluate('''attrs=>{const b=document.createElement('button');for(const [k,v] of Object.entries(attrs))b.dataset[k]=v;document.body.append(b);b.click();b.remove();}''', attrs)

def finish_ui_activity(page):
    if not current(page)['activity']:
        return
    if page.evaluate("window.__clock.reasons.has('manual')"):
        toggle(page)
    page.select_option('#time-speed', '10')
    minutes = page.evaluate('NightCourier.activityRemaining(window.__live)')
    pump(page, int(minutes * 100 + 80))

def ack_result_ui(page):
    if current(page) and current(page).get('eventResult'):
        page.click('[data-act="ackResult"]')
    if current(page) and current(page).get('placeUnlock'):
        page.click('[data-act="ackPlaceUnlock"]')
    while current(page) and current(page).get('unlockNotices'):
        page.click('[data-act="ackUnlock"]')

def choose_ui(page):
    ack_result_ui(page)
    index = page.evaluate('window.__live.pending.choices.findIndex(c=>!NightCourier.choiceBlock(window.__live,c))')
    assert index >= 0
    page.click(f'[data-act="choose"][data-index="{index}"]')
    finish_ui_activity(page)
    ack_result_ui(page)

def settle_ui(page):
    for _ in range(12):
        ack_result_ui(page)
        if not current(page)['pending']:
            return
        choose_ui(page)
    raise AssertionError('Event chain did not finish')

def prepare_delivery_ui(page):
    settle_ui(page)
    if page.locator('#panel[open] [data-ui="close"]').count():
        page.click('#panel [data-ui="close"]')
    for panel, action, needed in [('rest', 'rest', current(page)['player']['stamina'] < 35 or not current(page)['orders']),
                                  ('vehicle', 'charge', current(page)['vehicle']['battery'] < 35)]:
        if needed:
            page.locator(f'#game-nav [data-panel="{panel}"]').click()
            page.locator(f'[data-act="{action}"]').click()
            finish_ui_activity(page)
            settle_ui(page)
    if page.locator('#panel[open] [data-ui="close"]').count():
        page.click('#panel [data-ui="close"]')

def complete_nine_ui(page):
    # Real new-game actions: no fixture writes to delivery count, flags or assets.
    for count in range(current(page)['stats']['delivered'] + 1, 10):
        prepare_delivery_ui(page)
        nearest_ui_delivery(page)
        settle_ui(page)
        assert current(page)['stats']['delivered'] == count
        assert current(page)['player']['coins'] == 0
        assert current(page)['flags']['systemAwakened'] is False
        assert page.locator('#game-nav [data-panel="system"]').count() == 0
        assert not page.evaluate('NightCourier.featureUnlocked(window.__live,"system")')
    assert page.evaluate('window.__live.orders.every(o=>!NightCourier.place(o.target).permanent)')
    assert '送达第十单' in page.locator('.chapter-chip strong').inner_text()
    record(f'{page.viewport_size["width"]}px 连续九次真实配送不解锁、不发币；第十单所有候选避开常驻地点')
    prepare_delivery_ui(page)

def nearest_ui_delivery(page):
    ack_result_ui(page)
    target = page.evaluate('''()=>{const G=NightCourier,s=window.__live;return [...s.orders].filter(o=>!G.travelBlock(s,G.travelPlan(s,o.target))).sort((a,b)=>G.travelPlan(s,a.target).meters-G.travelPlan(s,b.target).meters)[0].target;}''')
    page.locator(f'.order-point[data-place="{target}"]').focus()
    page.keyboard.press('Enter')
    assert page.locator('[data-act="deliver"]').is_enabled()
    page.click('[data-act="deliver"]')
    finish_ui_activity(page)

def location_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '送餐识路')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        # An offer may temporarily target a starting place; the map then renders
        # that place as an order-point instead of duplicating the service marker.
        # Assert the public map contract (one visible point per starting place),
        # not the incidental CSS class chosen for that frame.
        starting_points = page.locator('.map-point[data-place="home"], .map-point[data-place="garage"]')
        assert sorted(starting_points.evaluate_all('(els)=>els.map(e=>e.dataset.place)')) == ['garage', 'home']
        assert starting_points.evaluate_all('(els)=>els.every(e=>e.dataset.discovered === "true")')
        target = page.evaluate('''()=>{const G=NightCourier,s=window.__live;return s.orders.find(o=>G.place(o.target).permanent&&!G.placeUnlocked(s,o.target)).target;}''')
        page.locator('#game-nav [data-panel="rest"]').click()
        assert page.locator('[data-act="moveHome"]').count() == 0
        page.click('[data-ui="close"]')
        marker = page.locator(f'.order-point[data-place="{target}"]')
        assert '首次送达后解锁地点' in marker.get_attribute('aria-label')
        marker.focus();page.keyboard.press('Enter')
        assert '送达后解锁' in page.locator('#panel').inner_text()
        assert '消失时间只限制接单' not in page.locator('#panel').inner_text()
        assert '首次送达并完成事件选择后' not in page.locator('#panel').inner_text()
        assert page.locator('[data-act="travel"]').count() == 0
        assert page.locator('[data-act="meal"], [data-act="heal"], [data-act="visit"], [data-act="panel-vehicle"]').count() == 0
        before = current(page)
        forged_button(page, {'act':'travel','target':target})
        assert current(page) == before
        page.screenshot(path=str(OUT/f'location-locked-{width}.png'))
        record(f'{width}px 新档默认开放小屋和修车点，未知订单提示送达解锁且不展示当地服务或搬家入口')

        page.click('[data-act="deliver"]')
        pump(page, 200)
        assert current(page)['activity'] is not None
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        page.click('#action-bar [data-act="stop"]')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        page.click('#action-bar [data-act="resumeDelivery"]')
        finish_ui_activity(page)
        assert current(page)['position'] == target
        assert current(page)['pending']['delivery']['target'] == target
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        memory = page.evaluate('Array.from(window.__memory.entries())')
        assert not errors, errors
        ctx.close()
        ctx, page, errors = setup(browser, width, height)
        page.evaluate('''entries=>{window.__memory=new Map(entries);window.dispatchEvent(new StorageEvent('storage',{key:NightCourier.STORAGE_KEY}));}''', memory)
        page.locator('[data-ui="load"]').first.click()
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        choose_ui(page)
        assert target in current(page)['unlockedPlaces']
        assert len([l for l in current(page)['logs'] if l['tag']=='地点']) == 1
        page.wait_for_timeout(380)
        service = page.locator(f'.service-point[data-place="{target}"]')
        assert service.count() == 1 and service.get_attribute('data-discovered') == 'true'
        assert service.locator('.order-expiry-ring').count() == 0
        assert not page.locator('.trail-layer path').count()
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert target in current(page)['unlockedPlaces']
        assert current(page)['stats']['delivered'] == 1
        assert len([l for l in current(page)['logs'] if l['tag']=='地点']) == 1
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'location-discovered-{width}.png'))
        record(f'{width}px 实际配送中断续送与待选读档不提前解锁，结算后常驻且重载不重复奖励')

        page.click('[data-ui="home"]');new_game(page, '未抵达')
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        select_order(page)
        page.click('[data-act="deliver"]');pump(page, 100)
        page.click('#action-bar [data-act="stop"]')
        page.once('dialog', lambda dialog: dialog.accept())
        page.click('[data-ui="cancel-delivery"]')
        assert current(page)['activeOrder'] is None
        assert current(page)['unlockedPlaces'] == ['home', 'garage']
        assert current(page)['stats']['delivered'] == 0
        assert not errors, errors
        record(f'{width}px 新旧存档地点隔离，真实取消配送不开放目的地，页面无运行异常')
        ctx.close()

def system_name_browser_checks(browser):
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        ctx, page, errors = setup(browser, width, height, ai=mode=='ai')
        new_game(page, '首章旅人', mode)
        assert page.locator('.chapter-chip strong').inner_text() == '已送达 0 / 9 单'
        assert page.locator('.chapter-chip span').first.inner_text() == '第一章 · 解锁外卖系统'
        assert page.locator('#game-nav [data-panel="system"]').count() == 0
        assert page.evaluate("NightCourier.storyStage(window.__live).id") == 'mortal'
        page.screenshot(path=str(OUT/f'opening-chapter-{width}.png'))
        complete_nine_ui(page)
        nearest_ui_delivery(page)
        assert current(page)['pending']['templateId'] == 'system-awakening'
        assert page.locator('#panel-title').inner_text() == '第一章 · 解锁外卖系统'
        assert '等待你的回应' in page.locator('#panel').inner_text()
        assert page.evaluate("NightCourier.storyStage(window.__live).id") == 'mortal'
        assert current(page)['stats']['delivered'] == 9 and current(page)['player']['coins'] == 0
        assert current(page)['pending']['source'] == 'classic'
        assert current(page)['pending']['aiStatus'] == 'skip'
        record(f'{width}px {mode} 新档显示第一章解锁外卖系统，真实到达仍待绑定且不提前跳章')

        # Restore an uncompleted tenth-order snapshot; canonical story replaces stale text.
        before = current(page)
        page.evaluate("""()=>{const key=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(key));
          x.saves[0].pending.title='第一声「叮」';x.saves[0].pending.text='万家灯火系统，已绑定。';
          localStorage.setItem(key,JSON.stringify(x));}""")
        memory = page.evaluate('Array.from(window.__memory.entries())')
        assert not errors, errors
        ctx.close()
        ctx, page, errors = setup(browser, width, height, ai=mode=='ai')
        page.evaluate("""entries=>{window.__memory=new Map(entries);window.dispatchEvent(new StorageEvent('storage',{key:NightCourier.STORAGE_KEY}));}""", memory)
        page.locator('.save-card').filter(has_text='首章旅人').locator('[data-ui="load"]').click()
        assert page.locator('#panel-title').inner_text() == '第一章 · 解锁外卖系统'
        assert '等待你的回应' in page.locator('#panel').inner_text()
        assert current(page)['pending']['id'] == before['pending']['id']
        assert current(page)['pending']['delivery'] == before['pending']['delivery']
        assert current(page)['player'] == before['player']
        assert page.evaluate("NightCourier.storyStage(window.__live).id") == 'mortal'
        assert page.evaluate("window.__clock.reasons.has('manual')")
        record(f'{width}px 未结算第十单快照在新文档中恢复为外卖系统剧情，资产与票据保留且仍停留第一章')

        page.evaluate('window.__openingSpeed=document.querySelector("#time-speed")')
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['eventResult']['title'] == '第一章 · 解锁外卖系统'
        assert '外卖系统' in current(page)['eventResult']['text']
        assert page.evaluate("NightCourier.storyStage(window.__live).id") == 'bound'
        assert current(page)['stats']['delivered'] == 10 and current(page)['player']['coins'] == 0
        at = current(page)['minutes']
        page.click('[data-act="ackResult"]')
        if current(page).get('placeUnlock'):
            page.click('[data-act="ackPlaceUnlock"]')
        seen = 0
        while current(page).get('unlockNotices'):
            notice = current(page)['unlockNotices'][0]
            if notice['kind'] == 'feature' and notice['id'] == 'system':
                seen += 1
                assert page.locator('#unlocked-item-name').inner_text() == '外卖系统'
                assert '第一章「解锁外卖系统」已完成' in page.locator('#panel').inner_text()
                assert '第二章开始' not in page.locator('#panel').inner_text()
                page.screenshot(path=str(OUT/f'opening-system-unlock-{width}.png'))
            page.click('[data-act="ackUnlock"]')
        assert seen == 1
        assert current(page)['minutes'] == at and current(page)['player']['coins'] == 0
        assert page.evaluate('window.__openingSpeed===document.querySelector("#time-speed")')
        system = page.locator('#game-nav [data-panel="system"]')
        assert system.inner_text().strip() == '外卖系统'
        assert page.locator('.currency[data-panel="system"]').get_attribute('title') == '打开外卖系统'
        system.click()
        assert page.locator('#panel-title').inner_text() == '外卖系统'
        assert '初入仙途' in page.locator('#panel').inner_text()
        assert page.locator('[role="tablist"]').get_attribute('aria-label') == '外卖系统分类'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'opening-system-panel-{width}.png'))
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="help"]').click()
        assert '第一章「解锁外卖系统」' in page.locator('#panel').inner_text()
        assert '第二章「初入仙途」' in page.locator('#panel').inner_text()
        assert not page.evaluate("NightCourier.featureUnlocked(window.__live,'cultivation')")
        record(f'{width}px 解锁提示归属第一章，第二章为初入仙途且修行仍需委托领奖')
        assert not errors, errors
        record(f'{width}px 完成第一章后一次性解锁外卖系统；弹窗、导航、标题与帮助同名，第十单仍无币')
        ctx.close()

def progressive_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '渐进旅人')
        nav = lambda: page.locator('#game-nav [data-panel]').evaluate_all('(els)=>els.map(b=>b.dataset.panel)')
        initial = ['inventory', 'vehicle', 'rest', 'help']
        assert nav() == initial
        assert page.locator('.currency[data-panel="system"]').is_hidden()
        assert page.locator('.chapter-chip').evaluate('(e)=>e.tagName') == 'DIV'
        page.screenshot(path=str(OUT/f'progressive-start-{width}.png'))
        before = current(page)
        for attrs in [{'panel':'system'}, {'panel':'cultivation'}, {'act':'panel-alchemy'}]:
            forged_button(page, attrs)
            assert not page.locator('#panel').evaluate('(e)=>e.open')
            assert current(page) == before
            assert not page.evaluate("window.__clock.reasons.has('panel')")
        # Previously discovered location fixture: no feature or inventory grants.
        fixture(page, {'position':'market','location':None,'unlockedPlaces':['home','garage','market']}, unlock_gameplay=False)
        page.locator('[data-place="market"]').focus();page.keyboard.press('Enter')
        assert page.locator('[data-act="panel-alchemy"]').count() == 0
        assert page.locator('[data-act="meal"]').count() == 1
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 0
        assert page.locator('[data-act="charge"]').count() == 1
        fixture(page, {'position':'home','location':None}, unlock_gameplay=False)
        page.evaluate('window.__stableSpeed=document.querySelector("#time-speed")')
        record(f'{width}px 真实新档仅四个基础按钮；隐藏快捷入口不能绕过，生存操作保留')

        complete_nine_ui(page)
        nearest_ui_delivery(page)
        assert current(page)['pending']['templateId'] == 'system-awakening'
        assert current(page)['pending']['title'] == '第一章 · 解锁外卖系统'
        assert '等待你的回应' in page.locator('.event-text').inner_text()
        assert page.evaluate('NightCourier.storyStage(window.__live).chapter') == '第一章'
        assert page.evaluate('NightCourier.storyStage(window.__live).title') == '解锁外卖系统'
        page.screenshot(path=str(OUT/f'chapter-one-awakening-{width}.png'))
        record(f'{width}px 第一章为解锁外卖系统；第十单待选仍未绑定，剧情标题与章节一致')
        assert 'system' not in nav()
        assert current(page)['stats']['delivered'] == 9
        choose_ui(page)
        assert current(page)['stats']['delivered'] == 10
        assert 'system' in nav() and 'cultivation' not in nav() and 'alchemy' not in nav()
        assert page.locator('.currency[data-panel="system"]').is_visible()
        assert page.evaluate('window.__stableSpeed===document.querySelector("#time-speed")')
        record(f'{width}px 第十单真实到达不提前解锁，选择结算后系统导航与顶部入口一起出现')

        page.locator('#game-nav [data-panel="system"]').click()
        assert page.evaluate('NightCourier.storyStage(window.__live).chapter') == '第二章'
        assert '第二章 · 初入仙途' in page.locator('#panel').inner_text()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 0
        assert page.locator('[data-act="buy"][data-id="foundation"]').count() == 0
        page.click('[data-ui="system-tab"][data-id="quests"]')
        assert page.locator('[data-act="claim"][data-id="q2"]').count() == 0
        page.click('[data-act="claim"][data-id="q1"]')
        assert 'cultivation' in nav() and 'alchemy' not in nav()
        assert page.locator('#unlocked-item-name').inner_text() == '修行'
        ack_result_ui(page)
        page.locator('#game-nav [data-panel="system"]').click()
        page.click('[data-ui="system-tab"][data-id="quests"]')
        assert page.locator('[data-act="claim"][data-id="q2"]').count() == 1
        quest_cards = page.locator('.quest-card').evaluate_all("""els=>els.map(e=>({title:e.querySelector('h3').textContent, complete:e.classList.contains('complete'), top:e.getBoundingClientRect().top}))""")
        unfinished_tops = [card['top'] for card in quest_cards if not card['complete']]
        completed_tops = [card['top'] for card in quest_cards if card['complete']]
        assert unfinished_tops and completed_tops and max(unfinished_tops) < min(completed_tops)
        record(f'{width}px 委托页未完成任务保持在上方，已完成任务统一排到底部')
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="cultivation"]').click()
        assert page.locator('[data-act="cultivate"]').count() == 1
        assert page.locator('[data-act="breakthrough"]').count() == 0
        before = current(page)
        forged_button(page, {'act':'cultivate','kind':'meditate'})
        assert current(page) == before
        page.click('[data-act="cultivate"][data-kind="breath"]')
        pump(page, 500)
        assert current(page)['activity']['elapsed'] > 0
        assert not page.evaluate("NightCourier.featureUnlocked(window.__live,'practice')")
        halfway = current(page)
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert current(page)['activity']['elapsed'] == halfway['activity']['elapsed']
        assert not page.evaluate("NightCourier.featureUnlocked(window.__live,'practice')")
        finish_ui_activity(page)
        for _ in range(12):
            ack_result_ui(page)
            if current(page)['pending'] and current(page)['pending']['templateId'] == 'story-street-vein':
                break
            assert current(page)['pending'], 'Route story should follow the next completed world action'
            choose_ui(page)
        assert current(page)['stats']['trained'] == 1
        assert page.evaluate("NightCourier.featureUnlocked(window.__live,'practice')")
        assert current(page)['stats']['delivered'] == 10
        assert current(page)['pending']['templateId'] == 'story-street-vein'
        assert 'alchemy' not in nav()
        record(f'{width}px 领奖开放吐纳；途中读档不提前开放，完成后才出现进阶与后续主线')
        choose_ui(page)
        assert 'alchemy' in nav()
        page.locator('#game-nav [data-panel="cultivation"]').click()
        assert page.locator('[data-act="cultivate"]').count() == 3
        assert page.locator('[data-act="breakthrough"]').count() == 1
        assert page.locator('[data-act="panel-alchemy"]').count() == 1
        page.click('[data-ui="close"]')
        assert current(page)['alchemy']['cauldron'] == 0
        assert len(current(page)['alchemy']['formulas']) == 12
        page.screenshot(path=str(OUT/f'progressive-alchemy-open-{width}.png'))
        page.locator('#game-nav [data-panel="alchemy"]').click()
        text = page.locator('#panel').inner_text()
        hidden_names = page.evaluate('NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)')
        assert all(name not in text for name in hidden_names)
        assert '丹火与药香' in text
        assert page.locator('[data-act="cultivate"]').count() == 0
        page.click('[data-ui="close"]')
        record(f'{width}px 解锁后完成路线主线才出现独立炼药导航，未获得丹方仍隐藏')

        # Higher-stage UI fixtures: thresholds are tested independently in Node.
        edits = current(page)
        edits['stats']['delivered'] = 4
        edits['flags']['systemAwakened'] = False  # Explicit legacy-owned threshold fixture.
        edits['unlockedFeatures'] = [f for f in edits['unlockedFeatures'] if f != 'upgrades']
        edits['position'] = 'garage';edits['location'] = None
        edits['bonds']['chen']['met'] = True
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 5
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="vehicle"]').click()
        assert page.locator('[data-act="upgrade"]').count() == 3
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '陈默' in page.locator('#panel').inner_text()
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="system"]').click()
        assert page.evaluate('NightCourier.storyStage(window.__live).chapter') == '第二章'
        assert '第二章 · 初入仙途' in page.locator('#panel').inner_text()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 20
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="system"]').click()
        assert page.locator('[data-ui="system-tab"][data-id="endings"]').count() == 1
        page.click('[data-ui="system-tab"][data-id="endings"]')
        assert page.locator('[data-ui="confirm-ending"]').count() == 5
        page.click('[data-ui="close"]')
        assert len(nav()) == 9
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#game-nav .nav-btn').evaluate_all('(buttons)=>buttons.every(b=>b.getBoundingClientRect().width>=44)')
        page.screenshot(path=str(OUT/f'progressive-all-nav-{width}.png'))
        record(f'{width}px 羁绊、5单升级与20单归途按条件出现；全导航可滚动且不撑宽页面')

        page.click('[data-ui="home"]')
        new_game(page, '新的起点')
        assert nav() == initial
        assert page.locator('.currency[data-panel="system"]').is_hidden()
        assert current(page)['unlockedFeatures'] == []
        page.click('[data-ui="home"]')
        page.locator('.save-card').filter(has_text='渐进旅人').locator('[data-ui="load"]').click()
        assert len(nav()) == 9
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert not errors, errors
        record(f'{width}px 从已开放存档切到新档不残留按钮或归途页，旧档重载保留解锁与暂停')
        ctx.close()

def auction_browser_checks(browser):
    def reload_snapshot(ctx, page, errors, width, height):
        # A fresh document/process gets only the persisted localStorage snapshot.
        # This models a reload while a non-closable decision dialog is open.
        assert not errors, errors
        memory = page.evaluate('Array.from(window.__memory.entries())')
        ctx.close()
        ctx, page, errors = setup(browser, width, height, ai=True)
        page.evaluate('''entries=>{window.__memory=new Map(entries);window.dispatchEvent(new StorageEvent('storage',{key:NightCourier.STORAGE_KEY}));}''', memory)
        page.locator('.save-card').filter(has_text='万宝来客').locator('[data-ui="load"]').click()
        return ctx, page, errors

    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height, ai=True)
        new_game(page, '万宝来客', 'ai')
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        before = current(page)
        for attrs in [{'panel':'auction'}, {'act':'panel-auction'}, {'act':'auctionCatalog'}]:
            forged_button(page, attrs)
            assert current(page) == before
            assert not page.locator('#panel').evaluate('(e)=>e.open')
        # Isolate the unlock threshold and route without replaying nine unrelated deliveries.
        edits = current(page)
        edits['unlockedFeatures'] = ['system', 'cultivation', 'alchemy']
        edits['unlockedPlaces'] = ['home', 'garage', 'market']
        edits['stats']['delivered'] = 9
        edits['player']['money'] = 10000
        edits['flags'].update({'firstOrder':True, 'storyStreetVein':True})
        edits['minutes'] = 1000
        fixture(page, edits, unlock_gameplay=False)
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        edits = current(page);edits['stats']['delivered'] = 10
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="auction"]').click()
        assert page.locator('[data-act="auctionCatalog"]').count() == 0
        assert page.locator('[data-act="travel"][data-target="market"]').count() == 1
        page.click('[data-act="travel"][data-target="market"]')
        assert current(page)['activity']['phase'] == 'travel'
        assert current(page)['position'] == 'home'
        finish_ui_activity(page)
        assert current(page)['position'] == 'market'
        assert current(page)['minutes'] < 1080
        page.locator('#game-nav [data-panel="auction"]').click()
        page.click('[data-act="auctionCatalog"]')
        assert page.locator('[data-auction-lot]').count() == 3
        assert page.locator('[data-act="auctionBid"]').count() == 6
        assert page.locator('[data-act="auctionBid"]').evaluate_all('(els)=>els.every(e=>e.disabled)')
        assert '尚未开拍' in page.locator('#panel').inner_text()
        record(f'{width}px 拍卖入口9/10单边界、隐藏指令拒绝、真实到场与日间图录不可举牌')

        edits = current(page);edits['minutes'] = 1080
        info = page.evaluate('NightCourier.auctionLotInfo(window.__live.auction.lots[0])')
        for rival in edits['auction']['lots'][0]['rivals']:
            rival['ceiling'] = info['opening'] + info['step'] * 8
        fixture(page, edits, unlock_gameplay=False)
        page.evaluate('window.__auctionSpeed=document.querySelector("#time-speed")')
        page.locator('#game-nav [data-panel="auction"]').click()
        old = current(page)
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="auction"]').click()
        assert current(page)['auction'] == old['auction']
        assert current(page)['seed'] == old['seed']
        page.locator('[data-auction-lot]').nth(0).locator('[data-act="auctionBid"][data-raise="1"]').click()
        started = current(page)
        assert started['minutes'] == old['minutes']
        assert started['player']['money'] == old['player']['money'] - info['opening']
        assert started['inventory'] == old['inventory']
        assert started['activity']['kind'] == 'auction'
        assert page.locator('#action-bar [data-act="stop"]').is_hidden()
        if page.evaluate("window.__clock.reasons.has('manual')"):
            toggle(page)
        page.select_option('#time-speed', '1')
        pump(page, 2000)
        halfway = current(page)
        assert 1.9 < halfway['activity']['elapsed'] < 2.1
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        loaded = current(page)
        assert loaded['activity']['elapsed'] == halfway['activity']['elapsed']
        assert loaded['player']['money'] == halfway['player']['money']
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        finish_ui_activity(page)
        decision = current(page)
        assert decision['pending']['kind'] == 'auction'
        assert decision['pending']['aiStatus'] == 'skip'
        assert decision['player']['money'] == old['player']['money']
        assert page.locator('[data-act="choose"]').count() == 3
        assert page.locator('.ai-status').count() == 0
        assert page.evaluate('window.__auctionSpeed===document.querySelector("#time-speed")')
        page.screenshot(path=str(OUT/f'auction-decision-{width}.png'))
        ctx, page, errors = reload_snapshot(ctx, page, errors, width, height)
        assert current(page)['pending']['id'] == decision['pending']['id']
        assert current(page)['auction'] == decision['auction']
        page.click('[data-act="choose"][data-index="2"]')
        assert current(page)['auction']['lots'][0]['status'] == 'lost'
        assert current(page)['player']['money'] == old['player']['money']
        assert '万宝拍卖场' in page.locator('#panel-title').inner_text()
        record(f'{width}px 实际冻结现金和5分钟竞价、途中重载、超价全额退款与免费退出，AI不改拍卖')

        edits = current(page)
        info = page.evaluate('NightCourier.auctionLotInfo(window.__live.auction.lots[1])')
        for rival in edits['auction']['lots'][1]['rivals']:
            rival['ceiling'] = info['opening']
        fixture(page, edits, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="auction"]').click()
        old = current(page);lot = old['auction']['lots'][1]
        page.locator('[data-auction-lot]').nth(1).locator('[data-act="auctionBid"][data-raise="3"]').click()
        finish_ui_activity(page)
        won = current(page)
        assert won['auction']['lots'][1]['status'] == 'won'
        assert won['auction']['wins'] == 1
        assert won['inventory'][lot['item']] == old['inventory'].get(lot['item'], 0) + lot['count']
        assert won['player']['money'] == old['player']['money'] - info['opening'] - 2*info['step']
        assert page.locator('#panel').evaluate('(e)=>e.open')
        assert '已竞得' in page.locator('[data-auction-lot]').nth(1).inner_text()
        forged_button(page, {'act':'auctionBid','id':lot['id'],'raise':'1'})
        assert current(page)['auction'] == won['auction']
        assert current(page)['inventory'] == won['inventory']
        ctx, page, errors = reload_snapshot(ctx, page, errors, width, height)
        page.locator('#game-nav [data-panel="auction"]').click()
        assert current(page)['inventory'] == won['inventory']
        assert current(page)['player']['money'] == won['player']['money']
        text = page.locator('#panel').inner_text()
        hidden = page.evaluate('NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)')
        assert all(name not in text for name in hidden)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('[data-act="auctionBid"]').evaluate_all('(els)=>els.every(e=>e.getBoundingClientRect().width>=44)')
        page.locator('[data-auction-lot]').nth(1).scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'auction-won-{width}.png'))
        record(f'{width}px 实际加价成交、拍品入库不重扣、重复提交拒绝、读档不重发与窄屏排版')

        page.click('[data-ui="close"]')
        page.click('[data-ui="home"]')
        new_game(page, '另一段旅程')
        assert page.locator('#game-nav [data-panel="auction"]').count() == 0
        assert current(page)['auction']['day'] == 0
        assert current(page)['auction']['wins'] == 0
        page.click('[data-ui="home"]')
        page.locator('.save-card').filter(has_text='万宝来客').locator('[data-ui="load"]').click()
        assert current(page)['auction']['wins'] == 1
        assert page.locator('#game-nav [data-panel="auction"]').count() == 1
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        assert not errors, errors
        record(f'{width}px 新档不继承拍卖图录或导航，旧档保留拍品和默认暂停')
        ctx.close()

def result_browser_checks(browser):
    # Load all shipped files under a subpath with real browser localStorage.
    # page.reload re-reads the multi-file bundle and saved receipt.
    for width, height in [(1440, 1000), (390, 844), (320, 740)]:
        ctx = browser.new_context(viewport={'width':width,'height':height}, has_touch=width<600)
        page = ctx.new_page();page.set_default_timeout(7000)
        errors=[];page.on('pageerror', lambda err: errors.append(str(err)))
        route_bundle(page)
        def boot(reload=False):
            if reload: page.reload(wait_until='load')
            else: page.goto('https://daoist.test/daoist/', wait_until='load')
            page.evaluate('() => {'+CONTROL+'}')
            page.wait_for_function('window.__clock != null')
            page.evaluate('() => {'+CAPTURE+'}')
        boot();reload_modes.append({'width':width,'mode':'native-reload-local-assets-real-storage'})
        print('Reload mode:',reload_modes[-1],flush=True)
        new_game(page, '结果阅读')
        nearest_ui_delivery(page)
        before=current(page);event=before['pending']
        page.click('[data-act="choose"][data-index="0"]')
        receipt=current(page)['eventResult'];settled=stored(page)
        assert receipt['text']==event['choices'][0]['result']
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert event['choices'][0]['label'] in page.locator('.result-selection').inner_text()
        assert page.locator('.result-delivery').count()==1
        assert page.locator('[data-act="choose"]').count()==0
        assert page.locator('[data-ui="close"]').count()==0
        assert page.locator('[data-act="ackResult"]').evaluate('(e)=>e===document.activeElement')
        pump(page, 30000);page.keyboard.press('Escape')
        assert current(page)['minutes']==settled['minutes']
        assert page.locator('#panel[open]').count()==1
        assert page.locator('.event-result').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('[data-act="ackResult"]').bounding_box()['height']>=44
        page.screenshot(path=str(OUT/f'event-result-{width}.png'))
        record(f'{width}px 选择后展示剧情及独立配送结算；自动聚焦、Esc 不跳过、阅读暂停、布局无横向溢出')
        boot(True);page.locator('[data-ui="load"]').first.click()
        reloaded=current(page)
        assert reloaded['eventResult']==receipt
        assert reloaded['player']==settled['player']
        assert reloaded['stats']==settled['stats']
        assert reloaded['minutes']==settled['minutes']
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert page.evaluate("window.__clock.reasons.has('manual')")
        pump(page, 10000)
        page.keyboard.press('Enter')
        ack_result_ui(page)
        assert current(page)['eventResult'] is None
        assert current(page)['player']==settled['player']
        assert current(page)['stats']==settled['stats']
        assert current(page)['minutes']==settled['minutes']
        assert page.locator('#panel[open]').count()==0
        again=current(page)
        forged_button(page, {'act':'ackResult','id':receipt['id']})
        forged_button(page, {'act':'choose','event':event['id'],'index':'0'})
        assert current(page)==again
        pump(page, 10000);assert current(page)['minutes']==settled['minutes']
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['eventResult'] is None
        record(f'{width}px 重载保留未读结果且不重奖；Enter 确认、重复提交拒绝、已读状态保存、手动暂停保留')

        # Legacy-owned system fixture with an arrived catalog delivery. Commit,
        # elapsed work, reload and completion all go through the real UI/engine.
        edits=page.evaluate('''()=>{const G=NightCourier,s=window.__live,e=G.EVENTS.find(e=>e.id==='delivery-spare-chopsticks');return {
            flags:{...s.flags,firstOrder:true},position:'clinic',location:null,orders:[],activity:null,eventResult:null,
            player:{...s.player,money:200,stamina:80},stats:{...s.stats,delivered:2},unlockedFeatures:['system'],
            pending:{...G.clone(e),id:'browser-timed',templateId:e.id,source:'classic',aiStatus:'skip',
            delivery:{id:'browser-order',title:'送给邻居的热饭',target:'clinic',desc:'当面交付',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:'lin'}}};}''')
        fixture(page,edits,unlock_gameplay=False)
        before=current(page);page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['eventResult'] is None
        assert current(page)['player']['money']==194
        assert current(page)['stats']['delivered']==2
        toggle(page);page.select_option('#time-speed','1');pump(page,1000)
        assert 0<current(page)['activity']['elapsed']<3
        # A browser reload triggers pagehide saving of a partially completed choice.
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['activity']['kind']=='choice'
        assert current(page)['eventResult'] is None
        assert current(page)['player']['money']==194
        finish_ui_activity(page)
        timed=current(page);receipt=timed['eventResult']
        assert receipt['duration']==4
        assert receipt['changes'][0]=={'key':'player.money','delta':-6}
        assert timed['stats']['delivered']==3
        assert timed['player']['money']==224
        assert timed['pending']['templateId']=='story-street-vein'
        assert page.locator('.result-text').inner_text()==receipt['text']
        assert '4 个游戏分钟' in page.locator('.event-result').inner_text()
        assert page.locator('[data-act="ackResult"]').inner_text()=='继续剧情'
        boot(True);page.locator('[data-ui="load"]').first.click()
        assert current(page)['eventResult']==receipt
        assert current(page)['pending']['templateId']=='story-street-vein'
        page.click('[data-act="ackResult"]')
        ack_result_ui(page)
        assert page.locator('.choice').count()==3
        assert current(page)['pending']['templateId']=='story-street-vein'
        assert current(page)['stats']['delivered']==3
        assert current(page)['player']['money']==224
        page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['eventResult']['title']=='地图上多出来的一条线'
        assert page.locator('.result-delivery').count()==0
        page.click('[data-act="ackResult"]')
        record(f'{width}px 耗时选择重载后继续、不重复扣费；三单结果先于主线，主线选择也有结果')

        if width==320:
            edits=page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live),e=G.EVENTS.find(e=>e.id==='rain');
              s.mode='ai';s.pending={...G.clone(e),id:'browser-ai-text',templateId:e.id,source:'classic',aiStatus:'unrequested'};
              const text='<img src=x onerror="window.__injected=1">'+ '一段很长的结果'.repeat(24);
              const ai=G.applyAIEvent(s,s.pending.id,{title:'结果里的文字',text:'认真读完再继续。',choices:[
                {label:'阅读',result:text,effects:{qi:5}},{label:'停留',result:'你记下了这句话。',effects:{}},{label:'道别',result:'你重新上路。',effects:{}}]});
              return {pending:ai.pending,mode:'ai'};}''')
            fixture(page,edits,unlock_gameplay=False)
            page.click('[data-act="choose"][data-index="0"]')
            assert '<img' in page.locator('.result-text').inner_text()
            assert page.locator('.result-text img').count()==0
            assert page.evaluate('window.__injected===undefined')
            assert page.locator('.event-result').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
            assert page.locator('[data-act="ackResult"]').is_enabled()
            record('320px AI 长结果安全转义、自动换行，无脚本执行或按钮遮挡')
            page.click('[data-act="ackResult"]')
            edits=page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live),e=G.EVENTS.find(e=>e.id==='rain');
              s.player.health=1;s.pending={...G.clone(e),id:'browser-rescue',templateId:e.id,source:'classic',aiStatus:'unrequested'};
              const ai=G.applyAIEvent(s,s.pending.id,{title:'紊乱的灵息',text:'灵息忽然紊乱。',choices:[
                {label:'尝试',result:'你失去了力气，路人开始呼救。',effects:{health:-10}},
                {label:'停下',result:'灵息平静了。',effects:{}},{label:'退后',result:'你避开了紊流。',effects:{}}]});
              return {pending:ai.pending,player:ai.player,mode:'ai'};}''')
            fixture(page,edits,unlock_gameplay=False)
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['activity']['kind']=='rescue'
            assert current(page)['eventResult'] is not None
            assert page.locator('[data-act="ackResult"]').is_enabled()
            t=current(page)['minutes'];pump(page,5000);assert current(page)['minutes']==t
            page.click('[data-act="ackResult"]')
            assert current(page)['eventResult'] is None
            record('受伤救助与未读结果可共存，确认按钮可用，阅读后才继续救助')
        assert not errors,errors
        ctx.close()


def realm_browser_checks(browser):
    for width, height in [(1440, 1000), (390, 844)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '问道来客')
        assert '凡人' in page.locator('.identity small').inner_text()
        assert '凡人一重' not in page.locator('#game-header').inner_text()
        record(f'{width}px 新档状态栏仅显示凡人，不出现凡人重数')
        for realm, level, label, next_label in [
            (0, 1, '凡人', '炼气一重'), (5, 9, '化神九重', '炼虚一重'),
            (6, 9, '炼虚九重', '合体一重'), (7, 9, '合体九重', '大乘一重'),
            (8, 9, '大乘九重', '渡劫一重'), (9, 8, '渡劫八重', '渡劫九重'),
            (9, 9, '渡劫九重', None)
        ]:
            player = current(page)['player']
            player.update(realm=realm, realmLevel=level, mortalProgress=0, qi=9999, stamina=100)
            fixture(page, {'player': player})
            assert label in page.locator('.identity small').inner_text()
            page.click('.game-nav [data-panel="cultivation"]')
            text = page.locator('#panel').inner_text()
            assert label in text
            assert '凡人一重' not in text and '化神九重圆满' not in text
            if next_label:
                assert f'下一境：{next_label}' in text
                assert page.locator('[data-act="breakthrough"]').is_enabled()
            else:
                assert '渡劫九重圆满' in text
                assert page.locator('[data-act="breakthrough"]').count() == 0
                before = current(page)
                forged_button(page, {'act': 'breakthrough'})
                assert current(page) == before
                page.screenshot(path=str(OUT/f'realm-max-{width}.png'))
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
        record(f'{width}px 化神后四境、跨境下一阶与渡劫九重封顶显示正确，无横向溢出')
        assert page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live);s.schemaVersion=12;
          try{G.sanitizeSave(s);return false;}catch(e){return e.message.includes('不支持此存档版本');}}''')
        player = current(page)['player']
        player.update(realm=0, realmLevel=1, qi=80, stamina=100)
        fixture(page, {'player': player})
        page.click('.game-nav [data-panel="cultivation"]')
        text = page.locator('#panel').inner_text()
        assert '凡人九重' not in text and '凡人一重' not in text
        assert '下一境：炼气一重 · 需要 80 修为' in text
        page.screenshot(path=str(OUT/f'realm-current-{width}.png'))
        record(f'{width}px v12旧档明确拒绝，新版凡人需要80修为直接进入炼气')
        player = current(page)['player']
        player.update(realm=5, realmLevel=9, mortalProgress=0, qi=999, stamina=100)
        fixture(page, {'player': player})
        page.click('.game-nav [data-panel="cultivation"]')
        page.click('[data-act="breakthrough"]')
        before = current(page)
        assert before['activity']['kind'] == 'breakthrough'
        assert before['activity']['params']['need'] == 249
        assert before['player']['qi'] == 750
        page.click('[data-ui="home"]')
        page.locator('[data-ui="load"]').first.click()
        after = current(page)
        assert after['player'] == before['player'] and after['activity'] == before['activity']
        assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
        record(f'{width}px 化神九重可实际开始突破，重载保留投入与行动且默认暂停')
        assert not errors, errors
        ctx.close()

def place_unlock_browser_checks(browser):
    for width,height,motion in [(1440,1000,'no-preference'),(390,844,'no-preference'),(320,740,'reduce')]:
        ctx,page,errors=setup(browser,width,height)
        page.emulate_media(reduced_motion=motion)
        new_game(page,'街巷初识')
        edits=page.evaluate('''()=>{const G=NightCourier,s=window.__live,e=G.EVENTS.find(e=>e.id==='first-order');
          return {position:'clinic',location:null,orders:[],activity:null,eventResult:null,placeUnlock:null,
            unlockedPlaces:['home','garage'],stats:{...s.stats,delivered:0},flags:{...s.flags,firstOrder:true},
            pending:{...G.clone(e),id:'browser-place-unlock',templateId:e.id,source:'classic',aiStatus:'skip',
              delivery:{id:'browser-place-ticket',target:'clinic',title:'一碗热粥',desc:'送达医馆',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:null}}};}''')
        fixture(page,edits,unlock_gameplay=False)
        assert page.locator('#panel[open] .place-unlock-card').count()==0
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['placeUnlock']['place']=='clinic'
        assert page.locator('.event-result').count()==1
        assert page.locator('#panel[open] .place-unlock-card').count()==0
        page.click('[data-act="ackResult"]')
        assert page.locator('.place-unlock-card').count()==1
        assert page.locator('#panel').get_attribute('class').find('centered')>=0
        assert page.locator('#unlocked-place-name').inner_text()=='回春医馆'
        assert page.locator('.unlock-status').count()==0
        assert '永久解锁' not in page.locator('.place-unlock-card').inner_text()
        confirm=page.locator('[data-act="ackPlaceUnlock"]')
        assert confirm.is_enabled() and confirm.evaluate('(e)=>e===document.activeElement')
        assert confirm.bounding_box()['height']>=44
        snapshot=current(page)
        page.keyboard.press('Escape');pump(page,20000)
        assert current(page)==snapshot
        assert page.locator('#panel[open]').count()==1
        assert page.locator('.place-unlock-card').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        # A HUD refresh must not recreate the card or restart its animations.
        page.locator('.place-unlock-card').evaluate('(e)=>window.__unlockNode=e')
        pump(page,1000)
        assert page.locator('.place-unlock-card').evaluate('(e)=>e===window.__unlockNode')
        if motion=='reduce':
            assert page.locator('.unlock-shackle').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        page.screenshot(path=str(OUT/f'place-unlock-{width}.png'))
        record(f'{width}px 地点弹窗在结果之后展示；聚焦、暂停、Esc、布局与减少动态效果通过')
        # Switch through the saved menu: the unread notice survives; no new rewards.
        page.locator('[data-ui="home"]').evaluate('(e)=>e.click()')
        page.locator('[data-ui="load"]').first.click()
        assert current(page)['placeUnlock']==snapshot['placeUnlock']
        assert current(page)['player']==snapshot['player']
        assert page.locator('.place-unlock-card').count()==1
        page.keyboard.press('Enter')
        assert current(page)['placeUnlock'] is None
        assert page.locator('.feature-unlock-card').count()==0
        assert page.locator('#game-nav [data-panel="system"]').count()==0
        ack_result_ui(page)
        assert page.locator('#panel[open]').count()==0
        assert page.locator('.place-discovery').count()==1
        coords=page.evaluate("(()=>{const p=NightCourier.place('clinic');return `translate(${p.x} ${p.y})`;})()")
        assert page.locator('.place-discovery').get_attribute('transform')==coords
        page.evaluate('window.__map.zoom(1.2);window.__map.tx-=25;window.__map.transform()')
        assert page.locator('.place-discovery').get_attribute('transform')==coords
        assert current(page)['player']==snapshot['player'] and current(page)['minutes']==snapshot['minutes']
        assert page.evaluate("window.__clock.reasons.has('manual')")
        after=current(page)
        forged_button(page,{'act':'ackPlaceUnlock','id':'clinic'})
        assert current(page)==after
        page.wait_for_timeout(1500)
        assert page.locator('.place-discovery').count()==0
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert page.locator('#panel[open] .place-unlock-card').count()==0
        assert current(page)['placeUnlock'] is None
        record(f'{width}px 未确认提示可读档；确认不重奖、手动暂停保留、光环缩放不偏移且自动清理')
        # Same address again: receipt but no unlock replay.
        edits['unlockedPlaces']=['home','garage','clinic']
        edits['stats']['delivered']=1
        fixture(page,edits,unlock_gameplay=False)
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['placeUnlock'] is None
        ack_result_ui(page)
        assert page.locator('#panel[open] .place-unlock-card').count()==0
        assert not errors,errors
        ctx.close()


def unlock_notice_browser_checks(browser):
    for width,height,motion in [(1440,1000,'no-preference'),(390,844,'no-preference'),(320,740,'reduce')]:
        ctx,page,errors=setup(browser,width,height)
        page.emulate_media(reduced_motion=motion)
        new_game(page,'相逢与新途')
        edits=page.evaluate('''()=>{const G=NightCourier,s=window.__live,e=G.EVENTS.find(e=>e.id==='first-order');
          return {position:'clinic',location:null,orders:[],activity:null,eventResult:null,placeUnlock:null,unlockNotices:[],
            unlockedPlaces:['home','garage'],unlockedFeatures:[],stats:{...s.stats,delivered:0},flags:{...s.flags,firstOrder:true},
            pending:{...G.clone(e),id:'browser-new-bond',templateId:e.id,source:'classic',aiStatus:'skip',
              delivery:{id:'browser-bond-ticket',target:'clinic',title:'一碗热粥',desc:'送达医馆',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:2,npc:'lin'}}};}''')
        fixture(page,edits,unlock_gameplay=False)
        page.click('[data-act="choose"][data-index="0"]')
        assert page.locator('.event-result').count()==1
        page.click('[data-act="ackResult"]')
        assert page.locator('.place-unlock-card').count()==1
        assert page.locator('.unlock-status').count()==0
        page.click('[data-act="ackPlaceUnlock"]')
        assert page.locator('.bond-unlock-card').count()==1
        assert page.locator('#unlocked-item-name').inner_text()=='林晚'
        assert page.locator('#panel').evaluate('(e)=>e.classList.contains("centered") && e.classList.contains("unlock-panel")')
        assert page.locator('[data-act="ackUnlock"]').evaluate('(e)=>e===document.activeElement')
        assert page.locator('[data-act="ackUnlock"]').bounding_box()['height']>=44
        assert [n['kind']+':'+n['id'] for n in current(page)['unlockNotices']]==['bond:lin','feature:bonds']
        snapshot=current(page)
        page.keyboard.press('Escape');pump(page,2000)
        assert current(page)==snapshot
        assert page.locator('#panel[open]').count()==1
        assert '永久解锁' not in page.locator('.unlock-card').inner_text()
        assert page.locator('.unlock-card').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('.unlock-card').evaluate('(e)=>window.__unlockNode=e')
        pump(page,1000)
        assert page.locator('.unlock-card').evaluate('(e)=>e===window.__unlockNode')
        animation=page.locator('.bond-thread').evaluate('(e)=>getComputedStyle(e).animationName')
        assert animation==('none' if motion=='reduce' else 'bond-thread-in')
        page.screenshot(path=str(OUT/f'bond-unlock-{width}.png'))
        page.locator('[data-ui="home"]').evaluate('(e)=>e.click()')
        page.locator('[data-ui="load"]').first.click()
        assert current(page)['unlockNotices']==snapshot['unlockNotices']
        assert current(page)['player']==snapshot['player']
        assert page.locator('.bond-unlock-card').count()==1
        page.keyboard.press('Enter')
        assert page.locator('.feature-unlock-card').count()==1
        assert page.locator('#unlocked-item-name').inner_text()=='羁绊'
        animation=page.locator('.feature-spark').evaluate('(e)=>getComputedStyle(e).animationName')
        assert animation==('none' if motion=='reduce' else 'feature-light-in')
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT/f'feature-unlock-{width}.png'))
        assert page.locator('#game-nav [data-panel="system"]').count()==0
        assert page.locator('#game-nav [data-panel="bonds"]').count()==1
        assert page.locator('#game-nav [data-panel="cultivation"]').count()==0
        page.keyboard.press('Enter')
        assert page.locator('#panel[open]').count()==0
        done=current(page)
        assert done['unlockNotices']==[]
        for field in ['player','seed','minutes','orders','turn','bonds']:
            assert done[field]==snapshot[field],field
        # Restore deliberately assigns stable log IDs; content and count must not change.
        log_content=lambda logs:[{k:v for k,v in row.items() if k!='id'} for row in logs]
        assert log_content(done['logs'])==log_content(snapshot['logs'])
        assert page.evaluate("window.__clock.reasons.has('manual')")
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert page.locator('#panel[open]').count()==0
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert page.locator('.npc-card').count()==1
        assert page.locator('.npc-card h3').inner_text()=='林晚'
        page.click('[data-ui="close"]')
        record(f'{width}px 人物及功能弹窗按序展示，含动画、无胶囊、读档、单次确认及减少动态效果检查')
        # q1 can be claimed while already travelling: a notification must pause,
        # not stop, charge, restart or move the current action.
        busy=page.evaluate('''()=>{const G=NightCourier;let s=G.newGame('在途提示','classic',4567);
          s.stats.delivered=1;s.unlockedFeatures=['system'];G.syncFeatureUnlocks(s,true);s=G.perform(s,'travel',{target:'garage'}).state;
          s=G.advance(s,G.activityRemaining(s)*.25);s=G.perform(s,'claim',{id:'q1'}).state;
          return {minutes:s.minutes,position:s.position,location:s.location,activity:s.activity,player:s.player,
            stats:s.stats,claimed:s.claimed,unlockedFeatures:s.unlockedFeatures,unlockedPlaces:s.unlockedPlaces,
            unlockNotices:s.unlockNotices,pending:null,eventResult:null,placeUnlock:null,bonds:s.bonds};}''')
        fixture(page,busy,unlock_gameplay=False)
        assert page.locator('#unlocked-item-name').inner_text()=='修行'
        assert page.locator('#panel [data-act="stop"]').count()==0
        assert page.locator('[data-act="ackUnlock"]').is_enabled()
        before=current(page);pump(page,10000)
        assert current(page)==before
        page.keyboard.press('Enter')
        after=current(page)
        assert after['activity']==before['activity'] and after['location']==before['location']
        assert after['player']==before['player'] and after['minutes']==before['minutes']
        assert page.evaluate("window.__clock.reasons.has('manual')")
        remaining = page.evaluate('NightCourier.activityRemaining(window.__live)')
        toggle(page);pump(page,remaining*250)
        assert current(page)['minutes']>after['minutes']
        assert current(page)['activity']['travelled']>after['activity']['travelled']
        record(f'{width}px 行动途中功能解锁暂停阅读，确认保留手动暂停及原路线进度，继续后真实移动')
        assert not errors,errors
        ctx.close()


def story_chapter_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '章回旅人')
        first = '第一章 · 解锁外卖系统'
        second = '第二章 · 初入仙途'
        assert first in page.locator('.chapter-chip').inner_text()
        assert page.locator('#game-nav [data-panel="system"]').count() == 0
        page.screenshot(path=str(OUT/f'story-chapter-one-{width}.png'))
        complete_nine_ui(page)
        select_order(page)
        page.click('[data-act="deliver"]')
        assert first in page.locator('.chapter-chip').inner_text()
        finish_ui_activity(page)
        assert current(page)['pending']['templateId'] == 'system-awakening'
        assert first in page.locator('.chapter-chip').inner_text()
        assert '已绑定' not in page.locator('.event-text').inner_text()
        assert current(page)['stats']['delivered'] == 9
        record(f'{width}px 第一章解锁外卖系统：新档、出发和第十单待选均未提前进入第二章')

        page.click('[data-act="choose"][data-index="0"]')
        assert second in page.locator('.chapter-chip').inner_text()
        assert current(page)['player']['coins'] == 0
        assert '外卖系统，绑定完成' in page.locator('.result-text').inner_text()
        page.click('[data-act="ackResult"]')
        if current(page).get('placeUnlock'):
            page.click('[data-act="ackPlaceUnlock"]')
        seen_system = False
        while current(page).get('unlockNotices'):
            notice = current(page)['unlockNotices'][0]
            if notice['kind'] == 'feature' and notice['id'] == 'system':
                assert page.locator('#unlocked-item-name').inner_text() == '外卖系统'
                assert '第一章「解锁外卖系统」已完成' in page.locator('#unlocked-item-detail').inner_text()
                seen_system = True
                page.screenshot(path=str(OUT/f'story-system-unlock-{width}.png'))
            page.click('[data-act="ackUnlock"]')
        assert seen_system
        assert current(page)['player']['coins'] == 0
        record(f'{width}px 第十单结算进入第二章，结果与外卖系统解锁回执顺序正确且不补发币')

        nav = page.locator('#game-nav [data-panel="system"]')
        assert nav.inner_text().strip() == '外卖系统'
        nav.click()
        assert page.locator('#panel-title').inner_text() == '外卖系统'
        assert second in page.locator('#panel .tag.mint').inner_text()
        assert page.locator('[role="tablist"]').get_attribute('aria-label') == '外卖系统分类'
        assert page.locator('#panel').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
        page.screenshot(path=str(OUT/f'story-system-panel-{width}.png'))
        record(f'{width}px 外卖系统名称、编号章节与分类标签统一，面板无横向溢出')
        page.click('[data-ui="close"]')
        page.locator('#game-nav [data-panel="help"]').click()
        help_text = page.locator('#panel').inner_text()
        assert '第一章「解锁外卖系统」' in help_text and '第二章「初入仙途」' in help_text
        assert '万家灯火系统' not in help_text
        assert not errors, errors
        record(f'{width}px 帮助中的章节顺序与外卖币说明同步，页面无运行异常')
        ctx.close()


def delivery_coins_browser_checks(browser):
    for width, height in [(1200, 900), (320, 740)]:
        ctx, page, errors = setup(browser, width, height)
        new_game(page, '解锁之后')
        complete_nine_ui(page)
        select_order(page)
        assert '现金' in page.locator('.order-reward').inner_text()
        assert '外卖币' not in page.locator('.order-reward').inner_text()
        page.click('[data-act="deliver"]');finish_ui_activity(page)
        assert current(page)['pending']['templateId'] == 'system-awakening'
        assert current(page)['player']['coins'] == 0
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['stats']['delivered'] == 10
        assert current(page)['player']['coins'] == 0
        assert '外卖币' not in page.locator('.result-delivery').inner_text()
        page.screenshot(path=str(OUT/f'first-delivery-no-coins-{width}.png'))
        ack_result_ui(page)
        assert page.locator('.currency[data-panel="system"]').is_visible()
        assert page.locator('.currency[data-panel="system"] .currency-number').inner_text() == '0'
        record(f'{width}px 未解锁订单只展示现金；第十单结果不发币，解锁后余额仍为零')

        prepare_delivery_ui(page)
        select_order(page)
        assert '外卖币' in page.locator('.order-reward').inner_text()
        ticket = page.evaluate("()=>{const id=document.querySelector('[data-act=deliver]').dataset.id;return window.__live.orders.find(o=>o.id===id);}")
        page.click('[data-act="deliver"]');finish_ui_activity(page)
        settle_ui(page)
        assert current(page)['stats']['delivered'] == 11
        assert current(page)['player']['coins'] >= ticket['coins'] > 0
        assert '外卖币' in [log for log in current(page)['logs'] if log['tag']=='配送'][-1]['text']
        record(f'{width}px 系统开放后订单展示外卖币，后续送达按原奖励到账')

        # Restore a catalog delivery with an extra coin choice but no unlocked system.
        edits = page.evaluate("""()=>{const G=NightCourier,s=window.__live,e=G.EVENTS.find(e=>e.id==='coin');return {
          player:{...s.player,coins:0},stats:{...s.stats,delivered:0},unlockedFeatures:[],
          flags:{firstOrder:true,systemAwakened:false},position:'clinic',location:null,activity:null,activeOrder:null,orders:[],
          eventResult:null,placeUnlock:null,unlockNotices:[],
          pending:{...G.clone(e),id:'browser-coin-gate',templateId:e.id,source:'classic',aiStatus:'skip',
            delivery:{id:'browser-coin-ticket',target:'clinic',title:'灯火试单',desc:'当面交付',condition:'ordinary',expiresAt:s.minutes+30,reward:30,coins:3,npc:null}}
        };}""")
        fixture(page, edits, unlock_gameplay=False)
        assert '外卖币' not in page.locator('[data-act="choose"][data-index="0"] small').inner_text()
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['player']['coins'] == 0
        assert '外卖币' not in page.locator('.event-result').inner_text()
        assert not errors, errors
        record(f'{width}px 未解锁配送事件不预告或发放额外外卖币；读档结算与结果一致')
        ctx.close()


def sect_browser_checks(browser):
    for width,height in [(1200,900),(320,740)]:
        ctx,page,errors=setup(browser,width,height,ai=True)
        new_game(page,'山门行者','ai')
        assert page.locator('#game-nav [data-panel="sect"]').count()==0
        before=current(page)
        forged_button(page,{'panel':'sect'})
        assert current(page)==before and not page.locator('.sect-view').count()
        edits=page.evaluate('''()=>{const G=NightCourier,s=window.__live;return {
          player:{...s.player,realm:1,realmLevel:1},stats:{...s.stats,delivered:1},claimed:['q1'],
          flags:{...s.flags,firstOrder:true},bonds:{...s.bonds,lu:{...s.bonds.lu,met:true}},
          unlockedFeatures:['system','cultivation','practice','bonds'],unlockedPlaces:['home','garage','temple']
        };}''')
        fixture(page,edits,unlock_gameplay=False)
        page.click('#game-nav [data-panel="rest"]');page.click('[data-act="rest"]');finish_ui_activity(page)
        assert current(page)['pending']['templateId']=='story-sect-invitation'
        assert current(page)['pending']['aiStatus']=='skip'
        assert page.locator('#game-nav [data-panel="sect"]').count()==0
        page.click('[data-act="choose"][data-index="2"]')
        assert current(page)['sect']['invited'] and not current(page)['sect']['member']
        ack_result_ui(page)
        assert page.locator('#game-nav [data-panel="sect"]').is_visible()
        record(f'{width}px 宗门在固定引荐剧情结算后才显示，AI不改引荐，可保持散修')
        page.click('#game-nav [data-panel="sect"]')
        assert page.locator('[data-act="sectJoin"]').is_disabled()
        source=current(page)['position']
        page.click('.sect-view [data-act="travel"]');assert current(page)['position']==source
        finish_ui_activity(page);settle_ui(page)
        page.click('#game-nav [data-panel="sect"]');page.click('[data-act="sectJoin"]')
        assert not current(page)['sect']['member']
        # 真实 UI 存储往返：回菜单再载入，不伪装为原生浏览器 reload。
        page.select_option('#time-speed','10');pump(page,1000)
        page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert not current(page)['sect']['member'] and current(page)['activity']['kind']=='sectJoin'
        assert page.evaluate("window.__clock.reasons.has('manual')")
        finish_ui_activity(page)
        assert current(page)['sect']['member'] and page.locator('.sect-view').is_visible()
        record(f'{width}px 宗门需真实到场，入宗耗时、途中存读和默认暂停正确')
        page.click('[data-ui="sect-tab"][data-id="duties"]')
        page.click('[data-sect-duty="sweep"] [data-act="sectTask"]')
        assert current(page)['sect']['contribution']==0
        finish_ui_activity(page)
        assert current(page)['sect']['contribution']==8
        assert page.locator('[data-sect-duty="sweep"] [data-act="sectTask"]').is_disabled()
        page.click('[data-sect-duty="copy"] [data-act="sectTask"]');finish_ui_activity(page)
        assert current(page)['sect']['contribution']==20
        completed=page.locator('.sect-duties .complete').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().top)')
        available=page.locator('.sect-duties .card:not(.complete)').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().top)')
        assert max(available)<min(completed)
        page.click('[data-act="sectAccept"]')
        assert current(page)['sect']['commission'] is not None and current(page)['sect']['contribution']==20
        assert page.locator('[data-act="sectClaim"]').is_disabled()
        page.screenshot(path=str(OUT/f'sect-duties-{width}.png'))
        record(f'{width}px 执事真实计时发奖且每日仅一次，已领置底，外送委托不提前领奖')
        # 已晋升长老的白名单测试档，检查所有兑换的 UI 与后端一致性。
        edits=page.evaluate('''()=>{const s=window.__live;return {player:{...s.player,realm:3,realmLevel:1},
          sect:{...s.sect,rank:3,earned:600,contribution:400,completed:30}};}''')
        fixture(page,edits,unlock_gameplay=False)
        page.click('#game-nav [data-panel="sect"]');page.click('[data-ui="sect-tab"][data-id="library"]')
        before=current(page)
        page.click('[data-act="sectBuy"][data-id="rain-breath"]')
        after=current(page)
        assert after['sect']['contribution']==before['sect']['contribution']-30
        assert after['player']['coins']==before['player']['coins'] and after['player']['money']==before['player']['money']
        assert after['minutes']==before['minutes']
        assert page.locator('[data-sect-item="rain-breath"] [data-act="sectBuy"]').count()==0
        page.click('[data-act="sectBuy"][data-id="gentle-fire"]')
        assert len(current(page)['sect']['manuals'])==2
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('.sect-view').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        page.screenshot(path=str(OUT/f'sect-library-{width}.png'))
        record(f'{width}px 藏经阁只扣宗门贡献，典籍去重、效果与窄屏排版正确')
        page.click('[data-ui="sect-tab"][data-id="hall"]')
        page.on('dialog',lambda d:d.accept())
        page.click('[data-ui="sect-leave"]')
        assert not current(page)['sect']['member'] and current(page)['sect']['commission'] is None
        assert page.locator('[data-act="sectJoin"]').is_disabled()
        retained=current(page)['sect']
        page.click('[data-ui="close"]');page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
        assert current(page)['sect']==retained
        page.click('[data-ui="home"]');new_game(page,'另一路人')
        assert page.locator('#game-nav [data-panel="sect"]').count()==0
        assert current(page)['sect']['manuals']==[] and current(page)['sect']['contribution']==0
        assert not errors,errors
        record(f'{width}px 离宗确认、冷却、保留典籍、未交委托失效与多存档隔离正确')
        ctx.close()


def higher_story_browser_checks(browser):
    # Advanced-save fixtures establish preconditions, not simulated years of cultivation.
    # Each prompt, both additional deliveries, and timed responses use real UI actions.
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        for chapter_index in range(5):
            ctx, page, errors = setup(browser, width, height, ai=mode=='ai')
            new_game(page, '故城行者', mode)
            edits=page.evaluate('''i=>{
              const G=NightCourier,s=G.clone(window.__live),chapter=G.HIGHER_STORY_CHAPTERS[i];
              s.player.realm=chapter.realm;s.player.realmLevel=1;s.stats.delivered=chapter.deliveries;
              s.player.money=5000;s.player.mana=G.limits(s).mana;s.player.stamina=G.limits(s).stamina;
              s.flags.firstOrder=true;s.flags.systemAwakened=true;
              s.bonds.lin.met=true;s.bonds.chen.met=true;
              s.unlockedFeatures=['system','cultivation','practice'];s.claimed=['q1'];
              for(const e of G.EVENTS.filter(e=>e.kind==='story'&&e.flag&&!e.higherChapter&&e.id!=='story-sect-invitation'&&(!e.districtChapter||e.districtChapter<=10||i===4)))s.flags[e.flag]=true;
              for(const c of G.HIGHER_STORY_CHAPTERS.slice(0,i))for(const id of c.events)s.flags[G.EVENTS.find(e=>e.id===id).flag]=true;
              return s;
            }''', chapter_index)
            fixture(page, edits, unlock_gameplay=False)
            chapter=page.evaluate('i=>NightCourier.HIGHER_STORY_CHAPTERS[i]', chapter_index)
            label=chapter['chapter']+' · '+chapter['title']
            assert label in page.locator('.chapter-chip').inner_text()
            page.click('#game-nav [data-panel="system"]')
            assert label in page.locator('#panel').inner_text()
            page.click('[data-ui="close"]')
            page.click('#game-nav [data-panel="help"]')
            page.click('#higher-story-help summary')
            assert '第十六章' in page.locator('#higher-story-help').inner_text()
            assert '124' in page.locator('#higher-story-help').inner_text()
            page.click('[data-ui="close"]')
            page.click('#game-nav [data-panel="rest"]');page.click('[data-act="rest"]')
            assert current(page)['pending'] is None
            finish_ui_activity(page)
            first=current(page)['pending']
            assert first['templateId']==chapter['events'][0]
            assert first['source']=='classic' and first['aiStatus']=='skip'
            assert page.locator('#panel-title').inner_text()==first['title']
            before=current(page);pump(page, 5000);assert current(page)==before
            assert not page.evaluate('id=>NightCourier.storyEventComplete(window.__live,id)',first['templateId'])
            for idx in range(3):
                choice=page.locator(f'[data-act="choose"][data-index="{idx}"]')
                choice.scroll_into_view_if_needed()
                assert choice.is_visible() and choice.is_enabled()
                assert choice.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
            if width==320:
                page.screenshot(path=str(OUT/f'higher-chapter-{chapter_index+8}-320.png'))
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['eventResult']['text']==first['choices'][0]['result']
            assert current(page)['pending'] is None
            ack_result_ui(page)
            record(f'{width}px {label}：地图与系统章名、帮助条件、固定三选项及阅读暂停一致')

            # Complete two real deliveries without consuming the newly unlocked main prompt.
            for count in [chapter['deliveries']+1,chapter['deliveries']+2]:
                prepare_delivery_ui(page)
                nearest_ui_delivery(page)
                for _ in range(15):
                    ack_result_ui(page)
                    pending=current(page)['pending']
                    if not pending or pending['templateId']==chapter['events'][1]:
                        break
                    choose_ui(page)
                assert current(page)['stats']['delivered']==count
                if count==chapter['deliveries']+1:
                    assert current(page)['pending'] is None
            if current(page)['pending'] is None:
                page.click('#game-nav [data-panel="rest"]');page.click('[data-act="rest"]')
                finish_ui_activity(page)
            second=current(page)['pending']
            assert second['templateId']==chapter['events'][1]
            assert second['source']=='classic' and second['aiStatus']=='skip'
            before=current(page)
            page.click('[data-act="choose"][data-index="1"]')
            assert current(page)['activity']['kind']=='choice'
            assert current(page)['eventResult'] is None
            assert current(page)['player']['qi']==before['player']['qi']
            # In-flight save/load retains the exact timed response and costs, and pauses.
            active=current(page)
            page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
            assert current(page)['activity']==active['activity']
            assert current(page)['player']==active['player']
            assert page.evaluate("window.__clock.reasons.has('manual')")
            finish_ui_activity(page)
            result=current(page)
            assert result['eventResult']['text']==second['choices'][1]['result']
            assert result['pending'] is None and result['ending'] is None and result['gameOver'] is None
            assert abs(result['minutes']-before['minutes']-second['choices'][1]['duration'])<1e-6, (result['minutes'],before['minutes'])
            assert result['player']['coins']==before['player']['coins']
            assert result['player']['money']==before['player']['money']
            ack_result_ui(page)
            assert page.evaluate('id=>NightCourier.storyEventComplete(window.__live,id)',second['templateId'])
            assert current(page)['pending'] is None
            page.click('#game-nav [data-panel="system"]')
            assert label in page.locator('#panel').inner_text()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if chapter_index==4 and width==320:
                page.screenshot(path=str(OUT/'higher-chapter-twelve-system-320.png'))
            record(f'{width}px {label}：再送两单后进入收束，耗时选项读档后完成，不强制结局或补币')
            assert not errors,errors
            ctx.close()


def delivery_npc_browser_checks(browser):
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        ctx, page, errors = setup(browser, width, height, ai=mode=='ai')
        new_game(page, '沿途故人', mode)
        assert page.evaluate('NightCourier.NPCS.length') == 21
        assert page.evaluate('NightCourier.NEW_NPC_IDS.every(id=>!window.__live.bonds[id].met)')
        ids = page.evaluate('NightCourier.NEW_NPC_IDS')
        ages = {'lin': 24, 'shen': 20, 'su': 19, 'xu': 20, 'tang': 19, 'gu': 18, 'ye': 21, 'wen': 18, 'luo': 27}
        for npc_id in ids:
            # Post-tutorial fixture: choose an actual seeded offer, not a forged NPC ticket.
            data = page.evaluate('''id=>{const G=NightCourier,old=window.__live;
              for(let seed=1;seed<4000;seed++){
                const s=G.newGame('沿途故人',old.mode,seed);s.id=old.id;s.createdAt=old.createdAt;
                s.flags.firstOrder=true;s.stats.delivered=1;s.orders=[];G.refreshOrders(s);
                const o=s.orders.find(o=>o.npc===id&&!G.place(o.target).permanent&&
                  !G.travelBlock(s,G.travelPlan(s,o.target))&&
                  (o.condition!=='careful'||s.player.stamina-G.travelPlan(s,o.target).stamina>=10));
                if(o)return {state:s,ticket:o,npc:G.NPCS.find(n=>n.id===id)};
              }throw Error('No affordable natural NPC offer');}''', npc_id)
            fixture(page, data['state'], unlock_gameplay=False)
            assert current(page)['bonds'][npc_id]['met'] is False
            target = data['ticket']['target']
            assert target != data['npc']['place']
            page.locator(f'.order-point[data-place="{target}"]').focus()
            page.keyboard.press('Enter')
            page.click('[data-act="deliver"]')
            assert current(page)['bonds'][npc_id]['met'] is False
            finish_ui_activity(page)
            assert current(page)['pending']['templateId'] == f'delivery-npc-{npc_id}'
            if npc_id == 'luo':
                assert '活动策划师' in page.locator('#panel').inner_text()
                assert '退休' not in page.locator('#panel').inner_text()
            assert current(page)['pending']['source'] == 'classic'
            assert current(page)['pending']['aiStatus'] == 'skip'
            assert current(page)['bonds'][npc_id]['met'] is False
            assert page.locator('[data-act="choose"]').count() == 3
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if npc_id == 'xu':
                page.screenshot(path=str(OUT/f'npc-delivery-meeting-{width}.png'))
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['bonds'][npc_id]['met'] is True
            assert current(page)['bonds'][npc_id]['stage'] == 0
            assert current(page)['bonds'][npc_id]['path'] == 'none'
            assert current(page)['player']['coins'] == 0
            assert any(n['kind']=='bond' and n['id']==npc_id for n in current(page)['unlockNotices'])
            ack_result_ui(page)
            page.locator('#game-nav [data-panel="bonds"]').click()
            card = page.locator('.npc-card').filter(has_text=data['npc']['name'])
            assert card.count() == 1
            assert data['npc']['age'] == ages[npc_id]
            assert 18 <= data['npc']['age'] <= 27
            assert f"{ages[npc_id]}岁" in card.inner_text()
            if npc_id == 'luo':
                assert '活动策划师' in card.inner_text() and '场地' in card.inner_text()
                assert '退休' not in card.inner_text()
                card.scroll_into_view_if_needed()
                page.screenshot(path=str(OUT/f'npc-age-luo-{width}.png'))
            assert '常约在' in card.inner_text()
            assert '丹方传授 0/0' not in card.inner_text()
            record(f'{width}px {data["npc"]["name"]}：不同配送地址初遇，结算才弹人物通知，卡片年龄和常约地点正确')
            # Final-chapter fixture; full daily visit progression is covered in Node tests.
            for trust, index, relation in [(11, 0, 'friend'), (20, 1, 'romance')]:
                state = current(page)
                state.update(position=data['npc']['place'], location=None, pending=None,
                             activity=None, activeOrder=None, eventResult=None, placeUnlock=None,
                             unlockNotices=[], lastRoute=None)
                state['unlockedPlaces'] = list(dict.fromkeys(state['unlockedPlaces']+[data['npc']['place']]))
                state['bonds'][npc_id].update(met=True, affinity=60, trust=trust, stage=3, path='none', lastTalkDay=0)
                fixture(page, state, unlock_gameplay=False)
                page.locator('#game-nav [data-panel="bonds"]').click()
                page.locator(f'[data-act="visit"][data-id="{npc_id}"]').click()
                finish_ui_activity(page)
                assert current(page)['pending']['npcAdvance'] is True
                romance = page.locator('[data-act="choose"][data-index="1"]')
                assert romance.is_disabled() is (trust < 12)
                if trust < 12:
                    assert '需要信任 12' in page.locator('#panel').inner_text()
                if trust >= 12 and npc_id == 'xu':
                    page.screenshot(path=str(OUT/f'npc-romance-choice-{width}.png'))
                page.locator(f'[data-act="choose"][data-index="{index}"]').click()
                assert current(page)['bonds'][npc_id]['path'] == relation
                assert current(page)['bonds'][npc_id]['stage'] == 4
                ack_result_ui(page)
                page.locator('#game-nav [data-panel="bonds"]').click()
                card = page.locator('.npc-card').filter(has_text=data['npc']['name'])
                assert ('相伴' if relation=='romance' else '知己') in card.inner_text()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            record(f'{width}px {data["npc"]["name"]}：信任门槛、友情选择和明确表白均由真实UI结算')
        all_met = page.evaluate('''()=>{const G=NightCourier,s=G.newGame('沿途故人',window.__live.mode,4546);
          s.id=window.__live.id;s.unlockedFeatures=['bonds'];s.unlockedPlaces=G.PLACES.filter(p=>!p.regional).map(p=>p.id);
          for(const b of Object.values(s.bonds))b.met=true;return s;}''')
        fixture(page, all_met, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert page.locator('.npc-card').count() == 21
        # All NPC age labels share the canonical configuration; do not reveal hidden NPCs.
        all_npcs = page.evaluate('NightCourier.NPCS')
        assert {n['id']: n['age'] for n in all_npcs if n['id'] in ['chen','lu','zhou']} == {'chen': 42, 'lu': 58, 'zhou': 25}
        for npc in all_npcs:
            card = page.locator('.npc-card').filter(has_text=npc['name'])
            assert card.count() == 1 and f"{npc['age']}岁" in card.inner_text()
            if npc['id'] in ['chen', 'lu', 'zhou']:
                card.scroll_into_view_if_needed()
                page.screenshot(path=str(OUT/f"npc-age-{npc['id']}-{width}.png"))
        record(f'{width}px 全21位已识NPC有明确年龄；三位男性年龄与人设及卡片一致')
        women = page.evaluate('NightCourier.NPCS.filter(n=>n.romantic)')
        assert {n['id']: n['age'] for n in women} == ages
        for npc in women:
            card = page.locator('.npc-card').filter(has_text=npc['name'])
            assert card.count() == 1
            assert f"{ages[npc['id']]}岁" in card.inner_text()
            assert 18 <= ages[npc['id']] <= 27 and npc['gender'] == 'female'
            if npc['id'] in ['lin', 'shen', 'su', 'luo']:
                card.scroll_into_view_if_needed()
                page.screenshot(path=str(OUT/f"npc-age-{npc['id']}-{width}.png"))
        ordered = sorted(ages.values())
        mean = sum(ordered) / len(ordered)
        assert mean > ordered[len(ordered)//2]
        assert sum((age-mean)**3 for age in ordered) > 0
        record(f'{width}px 全部九位可攻略女性为18至27岁右偏分布，原三位卡片显示年龄且罗映秋为策划职业')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'twelve-npcs-{width}.png'))
        page.click('[data-ui="close"]')
        page.locator('[data-place="park"]').first.focus()
        page.keyboard.press('Enter')
        for npc_id in ['su', 'xu', 'luo']:
            assert page.locator(f'[data-act="visit"][data-id="{npc_id}"]').count() == 1
        assert not errors, errors
        record(f'{width}px 21位已识人物完整显示，同一常约地点的三人均可拜访')
        ctx.close()

def npc_profile_browser_checks(browser):
    for width, height, npc_id in [(1200, 900, 'lin'), (320, 740, 'luo'), (1200, 900, 'chen'), (320, 740, 'lu')]:
        ctx, page, errors = setup(browser, width, height, ai=True)
        new_game(page, '人设接线', 'ai')
        before = current(page)
        profiles = page.evaluate('NightCourier.npcPromptCatalog()')
        assert len(profiles) == 21
        assert all('半身像' in p['portrait']['positive'] for p in profiles)
        for p in profiles:
            age = p['profile']['age']
            assert isinstance(age, int) and age >= 18
            assert f'{age}岁' in p['portrait']['positive'] and f'{age}岁' in p['dialogue']
        assert current(page) == before
        assert page.locator('#game-nav [data-panel="bonds"]').count() == 0
        record(f'{width}px 静态包加载21人设及半身像提示词，查询不结识人物或改变状态')
        # Explicit already-friends fixture; exercise ordinary UI visit, not a forged request.
        state = page.evaluate("""id=>{const G=NightCourier,n=G.NPCS.find(n=>n.id===id),s=G.newGame('人设接线','ai',123);
          s.id=window.__live.id;s.position=n.place;s.location=null;s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];
          s.unlockedFeatures=['bonds'];Object.assign(s.bonds[id],{met:true,stage:4,path:'friend',affinity:60,trust:20});
          return s;}""", npc_id)
        fixture(page, state, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert page.locator('.npc-card').count() == 1
        page.locator(f'[data-act="visit"][data-id="{npc_id}"]').click()
        finish_ui_activity(page)
        page.wait_for_function('window.__storyRequests.length > 0')
        request = page.evaluate('window.__storyRequests.at(-1).context')
        assert request['npcId'] == npc_id
        assert request['relationship']['path'] == 'friend'
        assert request['relationship']['stage'] == 4
        assert request['systemUnlocked'] is False
        assert 'profile' not in request and 'roleplayPrompt' not in request
        page.wait_for_function("JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves[0].pending?.aiStatus === 'success'")
        assert current(page)['pending']['npcId'] == npc_id
        assert current(page)['bonds'][npc_id]['path'] == 'friend'
        assert current(page)['bonds'][npc_id]['stage'] == 4
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT/f'npc-profile-ai-{npc_id}-{width}.png'))
        record(f'{width}px 实际拜访调用AI时携带当前NPC ID及友情进度，模拟响应不改关系或章节')
        assert not errors, errors
        ctx.close()

def npc_career_browser_checks(browser):
    roles = {'lin': '行政秘书', 'shen': '编辑助理', 'su': '平面模特', 'xu': '知识区主播',
             'tang': '咖啡师', 'gu': '大学生', 'ye': '花艺师', 'wen': '插画师', 'luo': '活动策划师'}
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        ctx, page, errors = setup(browser, width, height, ai=mode == 'ai')
        new_game(page, '职业回归', mode)
        before = current(page)
        profiles = page.evaluate('NightCourier.npcPromptCatalog()')
        assert {p['profile']['id']: p['profile']['role'] for p in profiles if p['profile']['romantic']} == roles
        assert current(page) == before
        assert all(not b['met'] for b in before['bonds'].values())
        state = page.evaluate('''()=>{const G=NightCourier,s=G.newGame('职业回归',window.__live.mode,789);
          s.id=window.__live.id;s.unlockedFeatures=['bonds'];s.unlockedPlaces=G.PLACES.filter(p=>!p.regional).map(p=>p.id);
          for(const b of Object.values(s.bonds))Object.assign(b,{met:true,affinity:60,trust:20});
          return s;}''')
        fixture(page, state, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert page.locator('.npc-card').count() == 21
        npcs = page.evaluate('NightCourier.NPCS')
        for npc in npcs:
            card = page.locator('.npc-card').filter(has_text=npc['name'])
            assert npc['role'] in card.inner_text()
            assert f"{npc['age']}岁" in card.inner_text()
            if npc['id'] in ['xu', 'gu', 'su']:
                card.scroll_into_view_if_needed()
                page.screenshot(path=str(OUT/f"npc-career-{npc['id']}-{width}.png"))
        assert len({n['role'] for n in npcs}) == 21
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        record(f'{width}px 九位女性职业不同且含学生、模特、秘书和主播；21人年龄与提示词一致')
        page.click('[data-ui="close"]')
        def visit_fixture(npc_id, stage):
            current_state = page.evaluate('''args=>{const G=NightCourier,n=G.NPCS.find(n=>n.id===args.id),s=G.clone(window.__live);
              s.position=n.place;s.location=null;s.pending=null;s.activity=null;s.activeOrder=null;
              s.eventResult=null;s.placeUnlock=null;s.unlockNotices=[];s.lastRoute=null;
              Object.assign(s.bonds[n.id],{met:true,stage:args.stage,affinity:60,trust:20,path:'none',lastTalkDay:0});return s;}''', {'id': npc_id, 'stage': stage})
            fixture(page, current_state, unlock_gameplay=False)
            page.locator('#game-nav [data-panel="bonds"]').click()
            page.locator(f'[data-act="visit"][data-id="{npc_id}"]').click()
            finish_ui_activity(page)
        visit_fixture('xu', 0)
        assert current(page)['pending']['title'] == '开播前的提纲'
        assert current(page)['pending']['aiStatus'] == 'skip'
        assert page.locator('[data-act="choose"]').count() == 3
        assert '直播' in page.locator('#panel').inner_text()
        page.click('[data-act="choose"][data-index="0"]')
        assert current(page)['bonds']['xu']['stage'] == 1
        assert current(page)['bonds']['xu']['path'] == 'none'
        ack_result_ui(page)
        record(f'{width}px {mode} 真实拜访主播进入新职业固定剧情，选择只推进一段不自动恋爱')
        visit_fixture('xu', 2)
        assert current(page)['pending']['title'] == '镜头该朝向哪里'
        assert '收件信息' in page.locator('#panel').inner_text() or '餐袋信息' in page.locator('#panel').inner_text()
        page.screenshot(path=str(OUT/f'npc-career-streamer-story-{width}.png'))
        at = current(page)['minutes']
        page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['activity']['kind'] == 'choice'
        assert current(page)['bonds']['xu']['stage'] == 2
        finish_ui_activity(page)
        assert abs(current(page)['minutes'] - at - 10) < 1e-5
        assert current(page)['bonds']['xu']['stage'] == 3
        assert '个人信息' in current(page)['eventResult']['text']
        finished = current(page)
        ack_result_ui(page)
        assert current(page)['bonds']['xu'] == finished['bonds']['xu']
        assert current(page)['player'] == finished['player']
        record(f'{width}px 主播核对画面选择实际耗时10分钟；结果确认不重发好感或推进时间')
        for npc_id, title in [('gu', '校园地图上的箭头'), ('su', '镜头外的表情')]:
            visit_fixture(npc_id, 0)
            assert current(page)['pending']['title'] == title
            assert current(page)['pending']['source'] == 'classic'
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['bonds'][npc_id]['stage'] == 1
            ack_result_ui(page)
        assert page.evaluate('window.__storyRequests.length') == 0
        assert not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        record(f'{width}px 大学生和模特个人故事与职业同步，固定剧情不向AI发送替换请求')
        ctx.close()

def male_npc_browser_checks(browser):
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        ctx, page, errors = setup(browser, width, height, ai=mode=='ai')
        new_game(page, '男性扩员', mode)
        ids = page.evaluate('NightCourier.NEW_MALE_NPC_IDS')
        assert len(ids) == 9
        assert page.evaluate("NightCourier.NPCS.filter(n=>n.gender==='male').length") == 12
        assert page.evaluate("NightCourier.NPCS.filter(n=>n.romantic).length") == 9
        # Removed schemas are rejected; current rosters remain hidden until meeting.
        legacy = page.evaluate('''()=>{const G=NightCourier,s=G.clone(window.__live);
          s.schemaVersion=19;for(const id of G.NEW_MALE_NPC_IDS)delete s.bonds[id];return s;}''')
        assert page.evaluate('''s=>{try{NightCourier.sanitizeSave(s);return false;}catch(e){return e.message.includes('不支持此存档版本');}}''', legacy)
        fixture(page, current(page), unlock_gameplay=False)
        assert current(page)['schemaVersion'] == 25
        assert len(current(page)['bonds']) == 21
        assert all(not b['met'] for b in current(page)['bonds'].values())
        assert page.locator('#game-nav [data-panel="bonds"]').count() == 0
        assert page.evaluate("window.__clock.reasons.has('manual')")
        record(f'{width}px v19旧名单拒绝；当前21位人物保持隐藏，加载默认暂停')
        for npc_id in ids:
            # Seeded post-tutorial offers, without fabricating NPC recipients or granting resources.
            data = page.evaluate('''id=>{const G=NightCourier;
              for(let seed=1;seed<6000;seed++){
                const s=G.newGame('男性扩员',window.__live.mode,seed);s.id=window.__live.id;
                s.flags.firstOrder=true;s.stats.delivered=1;s.orders=[];G.refreshOrders(s);
                const o=s.orders.find(o=>o.npc===id&&!G.place(o.target).permanent&&
                  !G.travelBlock(s,G.travelPlan(s,o.target))&&
                  (o.condition!=='careful'||s.player.stamina-G.travelPlan(s,o.target).stamina>=10));
                if(o)return {state:s,ticket:o,npc:G.NPCS.find(n=>n.id===id)};
              }throw Error('No affordable natural male NPC offer');}''', npc_id)
            fixture(page, data['state'], unlock_gameplay=False)
            page.locator(f'.order-point[data-place="{data["ticket"]["target"]}"]').focus()
            page.keyboard.press('Enter')
            page.click('[data-act="deliver"]')
            assert not current(page)['bonds'][npc_id]['met']
            finish_ui_activity(page)
            assert current(page)['pending']['templateId'] == f'delivery-npc-{npc_id}'
            assert current(page)['pending']['source'] == 'classic'
            assert current(page)['pending']['aiStatus'] == 'skip'
            assert data['npc']['name'] in page.locator('#panel').inner_text()
            assert not current(page)['bonds'][npc_id]['met']
            if npc_id == 'han':
                page.screenshot(path=str(OUT/f'male-delivery-han-{width}.png'))
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['bonds'][npc_id]['met']
            assert current(page)['bonds'][npc_id]['stage'] == 0
            assert current(page)['player']['coins'] == 0
            assert any(n['kind']=='bond' and n['id']==npc_id for n in current(page)['unlockNotices'])
            ack_result_ui(page)
            # Established relationship fixtures isolate the third and final personal scenes.
            for stage in [2, 3]:
                state = page.evaluate('''args=>{const G=NightCourier,n=G.NPCS.find(n=>n.id===args.id),s=G.clone(window.__live);
                  s.position=n.place;s.location=null;s.lastRoute=null;s.pending=null;s.activity=null;s.activeOrder=null;
                  s.eventResult=null;s.placeUnlock=null;s.unlockNotices=[];
                  s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];
                  Object.assign(s.bonds[n.id],{met:true,stage:args.stage,affinity:60,trust:20,path:'none',lastTalkDay:0});return s;}''', {'id':npc_id,'stage':stage})
                fixture(page, state, unlock_gameplay=False)
                page.locator('#game-nav [data-panel="bonds"]').click()
                page.locator(f'[data-act="visit"][data-id="{npc_id}"]').click()
                finish_ui_activity(page)
                assert current(page)['pending']['npcId'] == npc_id
                assert current(page)['pending']['npcAdvance']
                assert page.locator('[data-act="choose"]').count() == 3
                at = current(page)['minutes']
                duration = current(page)['pending']['choices'][0].get('duration',0)
                if stage == 3:
                    assert all(c.get('path') == 'friend' for c in current(page)['pending']['choices'])
                    if npc_id == 'meng':
                        page.screenshot(path=str(OUT/f'male-friend-meng-{width}.png'))
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.click('[data-act="choose"][data-index="0"]')
                if stage == 2:
                    assert current(page)['activity']['kind'] == 'choice'
                    assert current(page)['bonds'][npc_id]['stage'] == 2
                    finish_ui_activity(page)
                    assert abs(current(page)['minutes']-at-duration) < 1e-5
                assert current(page)['bonds'][npc_id]['stage'] == stage+1
                if stage == 3:
                    assert current(page)['bonds'][npc_id]['path'] == 'friend'
                settled = current(page)
                ack_result_ui(page)
                assert current(page)['player'] == settled['player']
                assert current(page)['bonds'] == settled['bonds']
            page.locator('#game-nav [data-panel="bonds"]').click()
            card = page.locator('.npc-card').filter(has_text=data['npc']['name'])
            assert '知己' in card.inner_text()
            assert f"{data['npc']['age']}岁" in card.inner_text()
            assert data['npc']['role'] in card.inner_text()
            assert '0 / 0' not in card.inner_text()
            assert page.evaluate('window.__storyRequests.length') == 0
            record(f'{width}px {mode} {data["npc"]["name"]}实际异地初遇、第三段耗时、友情选择与年龄职业显示通过')
        all_met = page.evaluate('''()=>{const G=NightCourier,s=G.newGame('男性扩员',window.__live.mode,31);s.id=window.__live.id;
          s.unlockedFeatures=['bonds'];s.unlockedPlaces=G.PLACES.filter(p=>!p.regional).map(p=>p.id);for(const b of Object.values(s.bonds))b.met=true;return s;}''')
        fixture(page, all_met, unlock_gameplay=False)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert page.locator('.npc-card').count() == 21
        page.locator('.npc-card').filter(has_text='江临').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'male-roster-21-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.click('[data-ui="close"]')
        page.locator('[data-place="clinic"]').first.focus()
        page.keyboard.press('Enter')
        for npc_id in ['lin','han','yue']:
            assert page.locator(f'[data-act="visit"][data-id="{npc_id}"]').count() == 1
        assert not errors, errors
        record(f'{width}px 21人羁绊可滚动完整显示，共享地点林晚／韩远舟／岳长川均可拜访')
        ctx.close()

def zhou_story_browser_checks(browser):
    for width, height, mode in [(1200, 900, 'classic'), (320, 740, 'ai')]:
        ctx, page, errors = setup(browser, width, height, ai=mode == 'ai')
        new_game(page, '同路与歧路', mode)
        def zfixture(stage, **extra):
            data = page.evaluate('''stage=>{const G=NightCourier,s=G.newGame('同路与歧路',window.__live.mode,519);s.id=window.__live.id;
              s.position='market';s.location=null;s.unlockedPlaces.push('market');s.player.money=20000;s.player.realm=4;
              s.stats.delivered=44;s.flags.firstOrder=true;s.flags.systemAwakened=true;
              s.stats.trained=1;s.claimed=['q1'];s.bonds.lin.met=true;
              // Completed ninth-chapter progress; 44 deliveries cannot finish later district scenes.
              for(const e of G.EVENTS.filter(e=>e.kind==='story'&&e.flag&&!e.higherChapter&&e.id!=='story-sect-invitation'&&(!e.districtChapter||e.districtChapter<10)))s.flags[e.flag]=true;
              Object.assign(s.bonds.zhou,{met:true,stage,path:G.zhouPath(stage),affinity:stage>=9?0:60,trust:stage>=9?0:30});
              G.syncFeatureUnlocks(s,true);return G.sanitizeSave(s);}''', stage)
            data.update(extra)
            fixture(page, data, unlock_gameplay=False)
        def card():
            return page.locator('.npc-card').filter(has_text='周野')
        def visit(stage):
            zfixture(stage)
            page.locator('#game-nav [data-panel="bonds"]').click()
            page.locator('[data-act="visit"][data-id="zhou"]').click()
            finish_ui_activity(page)
            assert current(page)['pending']['templateId'] == f'zhou-arc-{stage}'
            assert current(page)['pending']['aiStatus'] == 'skip'
            assert page.locator('[data-act="choose"]').count() == 3
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        zfixture(0)
        page.locator('#game-nav [data-panel="bonds"]').click()
        text = card().inner_text()
        assert '骑手 · 25岁' in text and '夜班骑手' not in text
        assert '路人' in text and '故事 0/10' in text
        assert '蚀灯会' not in text and '修仙者' not in text and '丹方传授' not in text
        page.screenshot(path=str(OUT / f'zhou-rider-{width}.png'))
        record(f'{width}px 周野是25岁骑手，早期只显示路人和普通职业，不提前暴露身份')
        for stage, relation in [(1,'朋友'),(3,'兄弟')]:
            visit(stage)
            page.click('[data-act="choose"][data-index="0"]')
            assert current(page)['bonds']['zhou']['stage'] == stage + 1
            ack_result_ui(page)
            page.locator('#game-nav [data-panel="bonds"]').click()
            assert relation in card().inner_text()
            record(f'{width}px 第{stage+1}段选择实际结算后进入{relation}关系')
        visit(5)
        at = current(page)['minutes']
        page.click('[data-act="choose"][data-index="1"]')
        assert current(page)['activity']['kind'] == 'choice'
        assert current(page)['bonds']['zhou']['stage'] == 5
        finish_ui_activity(page)
        assert abs(current(page)['minutes'] - at - 10) < 1e-5
        assert current(page)['bonds']['zhou']['stage'] == 6
        ack_result_ui(page)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '修仙者' in card().inner_text() and '蚀灯会' not in card().inner_text()
        record(f'{width}px 第六段10分钟选择完成才记录修为揭露，尚未披露组织')
        visit(6)
        page.click('[data-act="choose"][data-index="0"]')
        ack_result_ui(page)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '蚀灯会' in card().inner_text() and '兄弟' in card().inner_text()
        record(f'{width}px 第七段证据剧情后更新组织信息，尚未提前断绝兄弟关系')
        visit(8)
        assert current(page)['bonds']['zhou']['path'] == 'brother'
        page.screenshot(path=str(OUT / f'zhou-betrayal-{width}.png'))
        # On narrow screens the last response must remain reachable by vertical scrolling.
        last_choice = page.locator('[data-act="choose"][data-index="2"]')
        last_choice.scroll_into_view_if_needed()
        assert last_choice.is_visible() and last_choice.is_enabled()
        if width == 320:
            page.screenshot(path=str(OUT / f'zhou-betrayal-options-{width}.png'))
        last_choice.click()
        assert current(page)['bonds']['zhou']['path'] == 'enemy'
        assert current(page)['bonds']['zhou']['affinity'] == 0 and current(page)['bonds']['zhou']['trust'] == 0
        ack_result_ui(page)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '仇人' in card().inner_text() and '丹方传授' not in card().inner_text()
        assert page.locator('[data-act="visit"][data-id="zhou"]').inner_text() == '改日再查'
        record(f'{width}px 决裂由明确选择结算，关系变为仇人、好感信任归零')
        visit(9)
        page.click('[data-act="choose"][data-index="0"]')
        ack_result_ui(page)
        page.locator('#game-nav [data-panel="bonds"]').click()
        assert '故事 10/10' in card().inner_text() and '仇人' in card().inner_text()
        assert page.locator('[data-act="visit"][data-id="zhou"]').is_disabled()
        assert page.locator('[data-act="visit"][data-id="zhou"]').inner_text() == '已反目'
        assert '不再接受友好拜访' in card().inner_text()
        page.screenshot(path=str(OUT / f'zhou-enemy-{width}.png'))
        record(f'{width}px 尾声完成后保留仇人，不再开放友好拜访')
        # A retained old ticket must still be deliverable, with hostile neutral dialogue.
        zfixture(10, orders=[{'id':'zhou-old-ticket','target':'stop-0','title':'旧订单','desc':'身份和目的地保留','condition':'ordinary','expiresAt':600,'reward':28,'coins':2,'npc':'zhou'}])
        page.locator('.order-point[data-place="stop-0"]').focus()
        page.keyboard.press('Enter')
        page.click('[data-act="deliver"]')
        finish_ui_activity(page)
        assert current(page)['pending']['templateId'] == 'delivery-zhou-enemy'
        page.click('[data-act="choose"][data-index="0"]')
        ack_result_ui(page)
        assert current(page)['stats']['delivered'] == 45
        assert current(page)['bonds']['zhou']['path'] == 'enemy' and current(page)['bonds']['zhou']['affinity'] == 0
        assert page.evaluate('window.__storyRequests.length') == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        record(f'{width}px 敌对旧订单仍真实送达，专属对白不恢复好感或关系，固定故事不调用AI')
        ctx.close()


def five_sects_browser_checks(browser):
    for width,height in [(1200,900),(320,740)]:
        for sect_id,place,duty,manual in [('jingang','park','iron-load','iron-skin'),('baicao','clinic','herbal-sort','fire-sense'),('lingxiao','market','sword-forms','sword-step'),('xuanwei','bookshop','mind-index','mind-lamp')]:
            ctx,page,errors=setup(browser,width,height,ai=True)
            new_game(page,'五宗试炼','ai')
            edits=page.evaluate('''(place)=>{const G=NightCourier,s=window.__live,flags={...s.flags,firstOrder:true,systemAwakened:true};
              for(const k of G.STORY_FLAG_KEYS.slice(0,6))flags[k]=true;
              for(const k of ['storyWestwardNote','storyRiverRelay'])flags[k]=true;
              return {position:place,location:null,player:{...s.player,realm:4,money:100000,coins:10000},stats:{...s.stats,delivered:42,trained:1},claimed:['q1'],flags,
                bonds:{...s.bonds,lin:{...s.bonds.lin,met:true},chen:{...s.bonds.chen,met:true}},
                unlockedPlaces:G.PLACES.filter(p=>p.permanent).map(p=>p.id),unlockedFeatures:G.FEATURE_UNLOCKS.filter(f=>f.id!=='sect').map(f=>f.id)};
            }''',place)
            fixture(page,edits,unlock_gameplay=False)
            assert page.locator('#game-nav [data-panel="sect"]').count()==0
            page.locator(f'[data-place="{place}"]').focus();page.keyboard.press('Enter')
            page.click(f'[data-act="sectStory"][data-sect-id="{sect_id}"]')
            assert current(page)['pending']['aiStatus']=='skip'
            assert not current(page)['sectWorld']['records'][sect_id]['invited']
            page.click('[data-act="choose"][data-index="0"]');ack_result_ui(page)
            assert current(page)['sectWorld']['records'][sect_id]['invited']
            assert not current(page)['sectWorld']['records'][sect_id]['member']
            page.click('#game-nav [data-panel="sect"]');page.select_option('#sect-select',sect_id)
            assert page.locator('#sect-select option').count()==5
            page.click('[data-ui="sect-tab"][data-id="hall"]');page.click('[data-act="sectJoin"]')
            assert not current(page)['sectWorld']['records'][sect_id]['member']
            finish_ui_activity(page);settle_ui(page)
            assert current(page)['sectWorld']['records'][sect_id]['member']
            page.select_option('#sect-select',sect_id)
            page.click('[data-ui="sect-tab"][data-id="duties"]')
            page.click(f'[data-sect-duty="{duty}"] [data-act="sectTask"]');finish_ui_activity(page);settle_ui(page)
            assert current(page)['sectWorld']['records'][sect_id]['completed']==1
            assert current(page)['sect']['earned']==0
            page.click('[data-ui="sect-tab"][data-id="story"]');page.click('[data-act="sectStory"]')
            title=page.locator('#panel-title').inner_text();page.click('[data-act="choose"][data-index="1"]')
            if current(page)['activity']:
                assert current(page)['sectWorld']['stories'][sect_id]==[0]
                page.click('[data-ui="home"]');page.locator('[data-ui="load"]').first.click()
                finish_ui_activity(page)
            ack_result_ui(page)
            assert len(current(page)['sectWorld']['stories'][sect_id])==2
            assert page.evaluate('window.__storyRequests.length')==0
            # Fund only this sect in a white-box fixture; then use actual buy UI.
            edits=page.evaluate('''id=>{const s=window.__live,w=structuredClone(s.sectWorld);w.records[id].earned=500;w.records[id].contribution=500;return {sectWorld:w};}''',sect_id)
            fixture(page,edits,unlock_gameplay=False)
            page.click('#game-nav [data-panel="sect"]');page.select_option('#sect-select',sect_id)
            page.click('[data-ui="sect-tab"][data-id="library"]');page.click(f'[data-act="sectBuy"][data-id="{manual}"]')
            assert manual in current(page)['sectWorld']['records'][sect_id]['manuals']
            assert page.locator(f'[data-sect-item="{manual}"] [data-act="sectBuy"]').count()==0
            page.click('[data-ui="sect-tab"][data-id="relations"]')
            assert page.locator('.sect-view details').count()==15
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('.sect-view').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
            page.screenshot(path=str(OUT/f'five-sects-{sect_id}-{width}.png'))
            assert not errors,errors
            record(f'{width}px {sect_id} 地点引荐、五宗选择、入宗执事、剧情中途读档、专属功法和十组关系可用且无AI请求')
            ctx.close()

def player_anchor_snapshot(page):
    # Inspect rendered geometry, not only the stored transform: SVG animation
    # origins and overlay rounding can move the visible marker independently.
    snapshot = page.evaluate('''()=>{
      const m=window.__map,p=NightCourier.playerPoint(window.__live),bounds=m.el.getBoundingClientRect();
      const projected=m.map.latLngToContainerPoint([-p.y,p.x]);
      const center=selector=>{const b=m.el.querySelector(selector).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width};};
      const pulse=m.el.querySelector('.player-pulse');
      for(const animation of pulse.getAnimations()){animation.pause();animation.currentTime=1500;}
      return {expected:{x:bounds.left+m.el.clientLeft+projected.x,y:bounds.top+m.el.clientTop+projected.y},
        ground:center('.player-ground'),core:center('.player-core'),pulse:center('.player-pulse'),hit:center('.point-hit')};
    }''')
    for axis in ['x', 'y']:
        assert abs(snapshot['ground'][axis]-snapshot['expected'][axis]) <= 1, snapshot
        assert abs(snapshot['pulse'][axis]-snapshot['core'][axis]) <= .1, snapshot
    assert abs(snapshot['core']['x']-snapshot['ground']['x']) <= .1, snapshot
    assert 0 <= snapshot['ground']['y']-snapshot['core']['y'] <= 64, snapshot
    assert abs(snapshot['hit']['width']-48) <= .3, snapshot
    assert abs(snapshot['core']['width']-30) <= .3, snapshot
    return snapshot


def tile_paint_checks(page):
    page.wait_for_function('!window.__map.baseOverlay.isLoading()')
    def pixels():
        return page.evaluate('''()=>{
          const G=NightCourier,b=window.__map.baseOverlay,z=b._tileZoom,scale=2**z,size=b.getTileSize().x;
          const pixels=[];
          for(const edge of G.ROAD_EDGES){
            const a=G.ROAD_NODES[edge.from],c=G.ROAD_NODES[edge.to],x=(a.x+c.x)/2,y=(a.y+c.y)/2;
            const tx=Math.floor(x*scale/size),ty=Math.floor(y*scale/size),tile=b._tiles[`${tx}:${ty}:${z}`]?.el;
            if(!tile?.painted)continue;
            const pad=b.tilePadding,dpr=tile.width/(size+2*pad),px=Math.floor((x*scale-tx*size+pad)*dpr),py=Math.floor((y*scale-ty*size+pad)*dpr);
            pixels.push([...tile.getContext('2d').getImageData(px,py,1,1).data]);if(pixels.length===100)break;
          }
          return pixels;
        }''')
    day=pixels()
    assert len(day)>=20 and sum(p[0]>230 and p[1]>230 and p[3]==255 for p in day)>len(day)*.6, (len(day),day[:8])
    page.evaluate('window.__map.updateNight({...window.__map.s,minutes:1200})')
    page.wait_for_function('!window.__map.baseOverlay.isLoading()')
    night=pixels()
    assert len(night)>=20 and sum(p[0]<160 and p[1]<180 and p[3]==255 for p in night)>len(night)*.6, (len(night),night[:8])
    page.evaluate('window.__map.updateNight(window.__map.s)')
    page.wait_for_function('!window.__map.baseOverlay.isLoading()')
    assert page.evaluate('window.__map.baseOverlay.cacheBytes <= 48*1024*1024')


def leaflet_browser_checks(browser):
    for width, height in [(1440,1000),(375,812),(320,740),(812,375)]:
        ctx, page, errors = setup(browser,width,height)
        new_game(page,'地图校验')
        before = current(page)
        assert page.evaluate('window.__map.map instanceof L.Map && L.version === "1.9.4" && window.__map.map.options.crs === L.CRS.Simple')
        assert page.evaluate("performance.getEntriesByType('resource').every(r=>r.name.startsWith('https://daoist.test/daoist/'))")
        page.evaluate('window.__base=document.querySelector(".base-layer");window.__map.fit()')
        page.wait_for_function('!window.__map.baseOverlay.isLoading()')
        assert page.evaluate('''()=>{const G=NightCourier,m=window.__map;return G.PLACES.every(q=>{const at=m.map.latLngToContainerPoint([-q.y,q.x]),back=m.map.containerPointToLatLng(at);return Math.abs(back.lng-q.x)*m.scale<=.51&&Math.abs(back.lat+q.y)*m.scale<=.51;});}''')
        player_anchor_snapshot(page)
        assert page.evaluate('window.__map.baseOverlay instanceof L.GridLayer')
        assert page.locator('.city-base-svg').evaluate('(e)=>getComputedStyle(e).display') == 'none'
        assert page.evaluate('''()=>{const tiles=[...document.querySelectorAll('.leaflet-tile-container canvas')];return tiles.length>0&&tiles.every(t=>t.width>0&&t.width<=1024&&t.height<=1024);}''')
        ruler = page.evaluate('''()=>{const el=document.querySelector('.map-scale'),text=el.querySelector('.scale-distance').textContent;return {pixels:parseFloat(getComputedStyle(el).getPropertyValue('--scale-width')),meters:parseFloat(text)*(text.includes('千米')?1000:1),scale:window.__map.scale,local:1,unit:NightCourier.WORLD.metersPerUnit};}''')
        assert abs(ruler['pixels']/ruler['scale']/ruler['local']*ruler['unit']-ruler['meters']) < 1e-6
        page.screenshot(path=str(OUT/f'leaflet-overview-{width}.png'))
        page.evaluate('window.__map.center()')
        marker_before = player_anchor_snapshot(page)
        for multiplier in [1.2, 1.2, 1/1.2]:
            page.evaluate('(multiplier)=>window.__map.zoom(multiplier)', multiplier)
            page.wait_for_function('!window.__map.zoomTween')
            marker_after = player_anchor_snapshot(page)
            for part in ['ground', 'core', 'hit']:
                assert abs(marker_after[part]['width']-marker_before[part]['width']) <= .3
        assert page.locator('.point-hit').first.bounding_box()['width'] >= 47
        assert page.evaluate('window.__base===document.querySelector(".base-layer")')
        assert current(page)==before
        # Position the actual home marker in the usable center, then use real input.
        page.evaluate('(()=>{const q=NightCourier.place("home");window.__map.map.panTo([-q.y,q.x],{animate:false});})()')
        if height<500:
            page.evaluate('window.__map.map.panBy([-150,60],{animate:false})')
        target=page.locator('.map-point[data-place="home"] .point-core')
        if width<600:
            target.tap()
        else:
            target.click()
        assert page.locator('#panel[open]').count()==1
        page.click('[data-ui="close"]')
        box=target.bounding_box()
        x,y=box['x']+box['width']/2,box['y']+box['height']/2
        # A pan should move Leaflet's pane without touching thousands of static
        # shapes or repeatedly re-running label collision/layout calculations.
        page.evaluate('''async()=>{
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const m=window.__map,oldLayout=m.layoutLabels;
          const counts={layouts:0,base:0,labels:0,view:0,moves:0};
          m.layoutLabels=function(...args){counts.layouts++;return oldLayout.apply(this,args);};
          const observers=[];
          const observe=(node,key,options)=>{const observer=new MutationObserver(records=>counts[key]+=records.length);observer.observe(node,options);observers.push({observer,key});};
          observe(m.el.querySelector('.base-layer'),'base',{attributes:true,childList:true,characterData:true,subtree:true});
          // Leaflet legitimately adds leaflet-drag-target to the grabbed glyph.
          // Watch screen scaling and labels, not unrelated input-state classes.
          for(const node of m.el.querySelectorAll('.point-screen'))observe(node,'labels',{attributes:true,attributeFilter:['transform']});
          for(const node of m.el.querySelectorAll('.point-label'))observe(node,'labels',{attributes:true,childList:true,characterData:true,subtree:true});
          observe(m.el,'view',{attributes:true,attributeFilter:['style','data-zoom','data-detail']});
          const moved=()=>counts.moves++;m.map.on('move',moved);
          window.__panProbe={read:()=>{for(const {observer,key} of observers)counts[key]+=observer.takeRecords().length;return {...counts};},
            stop:()=>{for(const {observer} of observers)observer.disconnect();m.layoutLabels=oldLayout;m.map.off('move',moved);}};
        }''')
        if width<600:
            cdp=ctx.new_cdp_session(page)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            for offset in [20,35,50,65]:
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+offset,'y':y+8}]})
        else:
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+65,y+8,steps=8)
        page.wait_for_timeout(60)
        pan_counts=page.evaluate('window.__panProbe.read()')
        assert pan_counts['moves'] >= 2, pan_counts
        assert pan_counts['layouts'] == 0 and pan_counts['labels'] == 0, pan_counts
        assert pan_counts['base'] == 0 and pan_counts['view'] == 0, pan_counts
        player_anchor_snapshot(page)
        if width<600:
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        else:
            page.mouse.up()
        page.evaluate('window.__map.map.stop()')
        page.wait_for_timeout(60)
        settled_counts=page.evaluate('window.__panProbe.read()')
        assert settled_counts['base'] == 0 and settled_counts['view'] == 0, settled_counts
        page.evaluate('window.__panProbe.stop()')
        assert not page.locator('#panel[open]').count(), 'Dragging a marker must not select it'
        page.locator('#city-map').focus()
        page.keyboard.press('ArrowRight')
        player_anchor_snapshot(page)
        if width in [1440, 375]:
            # Exercise Leaflet's native wheel/pinch handlers as well as the
            # application zoom buttons: they use different event sequences.
            input_before=current(page)
            marker_before=player_anchor_snapshot(page)
            scale_before=page.evaluate('window.__map.scale')
            viewport=page.locator('#city-map').bounding_box()
            cx,cy=viewport['x']+viewport['width']/2,viewport['y']+viewport['height']/2
            if width==1440:
                page.mouse.move(cx,cy)
                page.mouse.wheel(0,-240)
            else:
                cdp=ctx.new_cdp_session(page)
                def pinch_points(radius):
                    return [{'id':1,'x':cx-radius,'y':cy},{'id':2,'x':cx+radius,'y':cy}]
                cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':pinch_points(40)})
                for radius in [50,60,70]:
                    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':pinch_points(radius)})
                cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            page.wait_for_function('(scale)=>window.__map.scale>scale',arg=scale_before)
            page.wait_for_function('!window.__map.zoomTween')
            marker_after=player_anchor_snapshot(page)
            for part in ['ground','core','hit']:
                assert abs(marker_after[part]['width']-marker_before[part]['width']) <= .3
            assert current(page)==input_before
            gesture='真实滚轮' if width==1440 else '真实双指'
            record(f'{width}px {gesture}缩放改变视图，玩家锚点/光晕对齐、图标等大且世界状态不变')
        assert not page.locator('#panel[open]').count()
        assert current(page)['player']==before['player'] and current(page)['minutes']==before['minutes']
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.emulate_media(reduced_motion='reduce')
        assert page.locator('.player-pulse').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        if width in [1440,375]:
            page.evaluate('window.__map.center()')
            tile_paint_checks(page)
            # Full-city overview and an outer delivery district use real local
            # compressed resources, while the game state stays at its true point.
            state=current(page)
            page.evaluate('window.__map.fit()')
            page.wait_for_function('!window.__map.baseOverlay.isLoading()',timeout=45000)
            assert page.evaluate('window.__map.scale<.01 && NightCourier.PLACES.length===485')
            page.screenshot(path=str(OUT/f'city-region-overview-{width}.png'))
            page.evaluate('''()=>{const p=NightCourier.PLACES.find(p=>p.regional&&p.x>15000&&p.y>18000);window.__map.map.setView([-p.y,p.x],Math.log2(.7),{animate:false});}''')
            page.wait_for_function('!window.__map.baseOverlay.isLoading()',timeout=45000)
            assert page.evaluate('''()=>{const region=window.__map.baseOverlay.region;return region.chunks.size>0&&region.cacheBytes<=32*1024*1024;}''')
            assert current(page)==state
            page.screenshot(path=str(OUT/f'city-region-street-{width}.png'))
            page.evaluate('window.__map.center()')
            page.wait_for_function('!window.__map.baseOverlay.isLoading()',timeout=45000)
        page.screenshot(path=str(OUT/f'leaflet-map-{width}.png'))
        assert not errors,errors
        record(f'{width}px Leaflet本地资源、可视玩家锚点与光晕同心、缩放图标等大、拖动无逐帧标签/底图改写、点选与减少动态效果通过')
        ctx.close()


def core_browser_checks(browser):
    ctx, page, errors = setup(browser)
    page.screenshot(path=str(OUT/'start-desktop.png'))
    new_game(page)
    assert page.locator('.player-name').inner_text() == '云行'
    assert '外卖修仙录' not in page.locator('#game-header').inner_text()
    assert page.locator('.player-marker').count() == 1
    assert page.locator('.game-nav [data-panel="cultivation"]').count() == 0
    assert page.locator('.game-nav [data-panel="system"]').count() == 0
    assert page.locator('.game-nav [data-panel="bonds"]').count() == 0
    fixture(page, {})
    toggle(page)
    page.locator('.game-nav [data-panel="cultivation"]').click()
    assert '凡人' in page.locator('#panel').inner_text()
    assert '凡人一重' not in page.locator('#panel').inner_text()
    assert '炼气一重' in page.locator('#panel').inner_text()
    page.click('[data-ui="close"]')
    page.locator('.game-nav [data-panel="alchemy"]').click()
    assert '无药鼎' in page.locator('#panel').inner_text()
    assert '尚未获得任何丹方' in page.locator('#panel').inner_text()
    assert page.locator('[data-act="alchemy"]').count() == 0
    page.click('[data-ui="close"]')
    record('新档隐藏进阶导航；已开放夹具显示九重修行，炼药页不泄露未得丹方')
    page.screenshot(path=str(OUT/'game-desktop.png'))
    assert page.evaluate('NightCourier.PLACES.length') == 485
    assert page.locator('.map-point').count() <= 15
    assert page.evaluate('window.__map.baseOverlay.region instanceof NightCourier.CityRegion')
    page.wait_for_function('!window.__map.baseOverlay.isLoading()')
    assert page.locator('.leaflet-tile-container canvas').count()>0
    page.evaluate('window.__map.fit()')
    page.screenshot(path=str(OUT/'expanded-map-desktop.png'))
    page.evaluate('window.__map.center()')
    record('485 地点全市地图已绘制，新配送点保持动态显示')
    pump(page, 1200)
    assert abs(current(page)['minutes']-481.2) < 1e-5
    assert current(page)['position'] == 'home'
    toggle(page)
    before = stored(page)
    pump(page, 5000)
    assert current(page)['minutes'] == before['minutes']
    record('桌面开局姓名、空闲连续计时与全局暂停')

    select_order(page)
    page.screenshot(path=str(OUT/'order-desktop.png'))
    page.click('[data-act="deliver"]')
    accepted = stored(page)
    assert accepted['activity']['kind'] == 'deliver'
    assert accepted['position'] == before['position'] and accepted['minutes'] == before['minutes']
    assert accepted['stats']['delivered'] == 0 and not accepted['pending']
    pump(page, 500)
    assert current(page)['activity']['travelled'] == 0
    toggle(page)
    page.evaluate('window.__marker=document.querySelector(".player-marker")')
    pump(page, 300)
    halfway = current(page)
    assert halfway['position'] is None and halfway['activity']['travelled'] > 0
    assert page.evaluate('window.__marker===document.querySelector(".player-marker")')
    assert halfway['vehicle']['battery'] < before['vehicle']['battery']
    toggle(page)
    point = page.locator('.player-marker').get_attribute('transform')
    frozen = stored(page)
    pump(page, 2000)
    assert page.locator('.player-marker').get_attribute('transform') == point
    assert current(page)['minutes'] == frozen['minutes']
    page.screenshot(path=str(OUT/'moving-desktop.png'))
    record('接单不瞬移不提前结算，路程、位置、消耗与暂停同步')
    record('移动普通帧保留同一人物节点，不重建整张地图')

    page.click('[data-ui="home"]')
    page.click('[data-ui="load"]')
    assert page.locator('#game-screen').get_attribute('data-paused') == 'true'
    assert abs(current(page)['activity']['travelled']-frozen['activity']['travelled']) < 1e-6
    assert current(page)['location'] == frozen['location']
    pump(page, 2000)
    assert current(page)['minutes'] == frozen['minutes']
    record('途中自动存档恢复路线和小数进度，读档默认暂停')

    page.locator('.game-nav [data-panel="system"]').click()
    pump(page, 500)
    page.click('[data-act="sign"]')
    signed = stored(page)
    page.click('[data-act="buy"][data-id="qi"]')
    bought = stored(page)
    assert bought['minutes'] == frozen['minutes']
    assert bought['inventory']['qi'] == signed['inventory']['qi']+1
    assert bought['activity']['travelled'] == frozen['activity']['travelled']
    page.click('[data-ui="close"]')
    pump(page, 2000)
    assert current(page)['minutes'] == frozen['minutes']
    record('系统即时兑换不推进活动，关闭面板不会解除手动暂停')
    toggle(page)
    page.click('#action-bar [data-act="stop"]')
    stopped = stored(page)
    pump(page, 1000)
    assert current(page)['location'] == stopped['location']
    assert current(page)['minutes'] > stopped['minutes']
    assert current(page)['activeOrder']['id'] == accepted['activeOrder']['id']
    page.click('#action-bar [data-act="resumeDelivery"]')
    page.select_option('#time-speed', '10')
    pump(page, 20000)
    assert current(page)['pending'] and current(page)['stats']['delivered'] == 0
    assert page.locator('.trail-layer path').count() == 0
    record('到达目的地后已完成路线立即从地图消失')
    paused_at = current(page)['minutes']
    pump(page, 2000)
    assert current(page)['minutes'] == paused_at
    page.screenshot(path=str(OUT/'event-desktop.png'))
    page.click('[data-act="choose"][data-index="0"]')
    assert stored(page)['stats']['delivered'] == 1
    record('停车仍计订单期限，继续配送后事件暂停，交付只结算一次')
    ack_result_ui(page)

    # Running before opening a panel resumes after closing; rate controls affect time.
    page.select_option('#time-speed', '1')
    old = current(page)['minutes']
    page.locator('.game-nav [data-panel="inventory"]').click()
    pump(page, 1000)
    assert current(page)['minutes'] == old
    page.click('[data-ui="close"]')
    pump(page, 1000)
    assert abs(current(page)['minutes']-old-1) < 1e-5
    for speed in [3, 10]:
        page.select_option('#time-speed', str(speed))
        old = current(page)['minutes']
        pump(page, 1000)
        assert abs(current(page)['minutes']-old-speed) < 1e-5
    record('面板自动暂停并恢复先前状态，1/3/10 倍率推进完整模拟')

    # Visibility/pagehide are simulated; this is not a physical OS freeze.
    page.select_option('#time-speed', '1')
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    old = stored(page)['minutes']
    pump(page, 3000)
    assert abs(current(page)['minutes']-old-3) < 1e-5
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 2000)
    assert abs(current(page)['minutes']-old-5) < 1e-5
    assert page.locator('[data-ui="pause"]').inner_text() == '暂停'
    page.evaluate("window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'))")
    pump(page, 1000)
    assert abs(current(page)['minutes']-old-6) < 1e-5
    record('隐藏/返回与 pagehide/pageshow 不自动暂停，同一会话持续计时')
    toggle(page)
    old = current(page)['minutes']
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 3000)
    page.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}")
    pump(page, 1000)
    assert current(page)['minutes'] == old
    assert page.locator('[data-ui="pause"]').inner_text() == '继续'
    record('主动暂停后切后台再返回仍保持暂停')

    page.click('[data-ui="home"]')
    new_game(page, '青禾', 'ai')
    page.click('[data-ui="home"]')
    assert page.locator('.save-card').count() == 2
    page.locator('.save-card').filter(has_text='云行').locator('[data-ui="load"]').click()
    assert page.locator('.player-name').inner_text() == '云行'
    assert stored(page, '青禾')['mode'] == 'ai'
    assert stored(page, '云行')['mode'] == 'classic'
    record('多存档隔离，读取后保留各自剧情模式')
    page.evaluate('window.dispatchEvent(new StorageEvent("storage",{key:NightCourier.STORAGE_KEY}))')
    old = current(page)['minutes']
    toggle(page)
    pump(page, 2000)
    assert current(page)['minutes'] == old
    assert '另一标签页' in page.locator('#storage-warning').inner_text()
    record('另一标签页写入后冻结旧页面，暂停按钮不能绕过冲突')
    assert not errors, errors
    record('桌面流程无 JavaScript 运行时异常')
    ctx.close()

    # A world revision (such as the 15-minute order refresh) must not replace
    # the native speed select while the player is interacting with it.
    ctx, refresh, refresh_errors = setup(browser, 1200, 900)
    new_game(refresh, '时控')
    refresh.select_option('#time-speed', '10')
    refresh.locator('#time-speed').focus()
    refresh.evaluate("()=>{window.__speedSelect=document.querySelector('#time-speed');window.__timeControls=document.querySelector('.time-controls');}")
    timing = refresh.evaluate("()=>({now:window.__live.minutes,next:window.__live.orderRefreshAt})")
    assert timing['next'] > timing['now']
    pump(refresh, int(((timing['next']-timing['now'])/10+.2)*1000))
    assert current(refresh)['minutes'] >= timing['next']
    assert refresh.evaluate("()=>window.__speedSelect===document.querySelector('#time-speed')")
    assert refresh.evaluate("()=>window.__timeControls===document.querySelector('.time-controls')")
    assert refresh.evaluate("()=>document.activeElement===window.__speedSelect")
    assert refresh.locator('#time-speed').input_value() == '10'
    assert not refresh_errors, refresh_errors
    record('世界时间刷新不重建倍率选择框，焦点与当前倍率保持')
    ctx.close()

    ctx, craft, cerrors = setup(browser, 1200, 900)
    new_game(craft, '药童')
    craft.click('[data-ui="home"]')
    craft.evaluate('''()=>{const k=NightCourier.STORAGE_KEY,x=JSON.parse(localStorage.getItem(k)),s=x.saves[0];s.player.money=10000;s.alchemy.xp=999;s.unlockedFeatures=NightCourier.FEATURE_UNLOCKS.map(f=>f.id);s.unlockedPlaces=NightCourier.PLACES.filter(p=>!p.regional).map(p=>p.id);for(const m of NightCourier.ALCHEMY_MATERIALS)s.inventory[m.id]=10;localStorage.setItem(k,JSON.stringify(x));window.dispatchEvent(new StorageEvent('storage',{key:k}));}''')
    craft.locator('[data-ui="load"]').first.click()
    assert current(craft)['player']['money'] == 10000
    craft.locator('[data-place="market"]').focus();craft.keyboard.press('Enter')
    craft.click('[data-act="travel"][data-target="market"]')
    toggle(craft);craft.select_option('#time-speed', '10')
    travel_ms = int((craft.evaluate("NightCourier.travelPlan(window.__live,'market').minutes") / 10 + .25) * 1000)
    pump(craft, travel_ms)
    assert current(craft)['position'] == 'market'
    craft.locator('.game-nav [data-panel="alchemy"]').click()
    panel_text = craft.locator('#panel').inner_text()
    assert '尚未获得任何丹方' in panel_text
    assert craft.locator('[data-act="alchemy"]').count() == 0
    hidden_name = craft.evaluate("NightCourier.ALCHEMY_RECIPES[0].name")
    assert hidden_name not in panel_text
    craft.click('[data-act="cauldron"][data-id="1"]')
    assert stored(craft)['alchemy']['cauldron'] == 1
    before_formula_money = current(craft)['player']['money']
    craft.click('[data-act="formula"]')
    acquired = current(craft)['alchemy']['formulas']
    assert len(acquired) == 1
    assert craft.evaluate('(id)=>NightCourier.alchemyRecipe(id).acquisition.type', acquired[0]) == 'shop'
    assert current(craft)['player']['money'] < before_formula_money
    acquired_name = craft.evaluate("(id)=>NightCourier.alchemyRecipe(id).name", acquired[0])
    remaining_name = craft.evaluate("()=>NightCourier.ALCHEMY_RECIPES.find(r=>!window.__live.alchemy.formulas.includes(r.id)).name")
    panel_text = craft.locator('#panel').inner_text()
    assert acquired_name in panel_text
    assert '获取途径：商店购买' in panel_text
    assert remaining_name not in panel_text
    assert craft.locator('[data-act="alchemy"]').count() == 1
    assert craft.evaluate("NightCourier.ALCHEMY_MATERIALS.length") == 64
    assert craft.evaluate("NightCourier.ALCHEMY_RECIPES.length") == 108
    assert craft.evaluate("NightCourier.CAULDRONS.length - 1") == 24
    record('未获得丹方完全隐藏；长乐集购入未知残卷后才显示具体丹方')
    assert not cerrors, cerrors
    ctx.close()

    # Dedicated acquisition checks use the same real bundle and save reload path.
    for width, height in [(1200, 900), (320, 740)]:
        ctx, formula, ferrors = setup(browser, width, height)
        new_game(formula, '传方')
        edits = formula.evaluate("""()=>{const G=NightCourier,s=G.clone(window.__live);
          s.position='market';s.coordinates={x:G.place('market').x,y:G.place('market').y};
          s.player.realm=5;s.player.money=10000;
          s.alchemy.formulas=G.ALCHEMY_RECIPES.filter(r=>r.acquisition.type==='shop').map(r=>r.id);
          return s;}""")
        fixture(formula, edits)
        formula.locator('.game-nav [data-panel="alchemy"]').click()
        text = formula.locator('#panel').inner_text()
        assert '当前境界商店丹方已收齐' in text
        assert formula.locator('[data-act="formula"]').is_disabled()
        assert len(current(formula)['alchemy']['formulas']) == 36
        exclusive_names = formula.evaluate("NightCourier.ALCHEMY_RECIPES.filter(r=>r.acquisition.type!=='shop').map(r=>r.name)")
        assert all(name not in text for name in exclusive_names)
        assert formula.evaluate('document.documentElement.scrollWidth<=innerWidth')
        record(f'{width}px 商店收齐只得 36 张，剧情/羁绊内容仍隐藏，售罄按钮禁用')
        edits = current(formula)
        edits['alchemy']['formulas'] = []
        edits['bonds']['chen'].update({'met': True, 'stage': 1, 'trust': 3})
        fixture(formula, edits)
        formula.locator('.game-nav [data-panel="bonds"]').click()
        text = formula.locator('#panel').inner_text()
        assert '陈默' in text and '丹方传授 2/6' in text
        assert '完成第 2 章' in text and '信任 9' in text
        assert '林晚' not in text and '沈青禾' not in text
        assert formula.evaluate('document.documentElement.scrollWidth<=innerWidth')
        formula.screenshot(path=str(OUT/f'formula-bonds-{width}.png'))
        formula.click('[data-ui="close"]')
        formula.locator('.game-nav [data-panel="alchemy"]').click()
        text = formula.locator('#panel').inner_text()
        assert '获取途径：羁绊 · 陈默' in text
        hidden_names = formula.evaluate("NightCourier.ALCHEMY_RECIPES.filter(r=>!window.__live.alchemy.formulas.includes(r.id)).map(r=>r.name)")
        assert all(name not in text for name in hidden_names)
        record(f'{width}px 羁绊传授进度、下次条件及来源显示，未结识人物与未得丹方不泄露')
        assert not ferrors, ferrors
        ctx.close()

    ctx, story, serrs = setup(browser, 1200, 900)
    new_game(story, '传承')
    edits = story.evaluate("""()=>{const G=NightCourier,s=G.clone(window.__live),
      e=G.EVENTS.find(e=>e.id==='story-street-vein');
      s.flags.storyStreetVein=true;
      s.pending={...G.clone(e),id:'formula-story-browser',templateId:e.id,source:'classic',aiStatus:'skip'};
      return s;}""")
    fixture(story, edits)
    assert current(story)['alchemy']['formulas'] == []
    assert story.locator('[data-act="choose"]').count() == 3
    story.click('[data-act="choose"][data-index="0"]')
    assert len(current(story)['alchemy']['formulas']) == 6
    assert story.evaluate("window.__live.alchemy.formulas.every(id=>NightCourier.alchemyRecipe(id).acquisition.event==='story-street-vein')")
    before = current(story)
    fixture(story, before)
    assert current(story)['alchemy']['formulas'] == before['alchemy']['formulas']
    ack_result_ui(story)
    story.locator('.game-nav [data-panel="alchemy"]').click()
    assert '获取途径：剧情 · 地图上多出来的一条线' in story.locator('#panel').inner_text()
    assert not serrs, serrs
    record('剧情待选读档不提前领丹方，真实点击结算获得六张，重载不重复奖励')
    ctx.close()

    for width, height in [(390, 844), (320, 740)]:
        ctx, mobile, merrors = setup(browser, width, height)
        new_game(mobile, '行舟')
        fixture(mobile, {})
        toggle(mobile)
        pump(mobile, 100)
        mobile.screenshot(path=str(OUT/f'game-{width}.png'))
        mobile.click('[data-ui="fit-map"]')
        bounds = mobile.locator('.city-svg:not(.city-base-svg)').bounding_box()
        viewport = mobile.locator('#city-map').bounding_box()
        assert bounds['x'] >= viewport['x'] and bounds['x']+bounds['width'] <= viewport['x']+viewport['width']+.5
        assert bounds['y'] >= viewport['y'] and bounds['y']+bounds['height'] <= viewport['y']+viewport['height']+.5
        mobile.wait_for_function('!window.__map.baseOverlay.isLoading()')
        assert mobile.locator('.leaflet-tile-container canvas').count()>0
        assert mobile.evaluate('window.__map.baseOverlay.region.territories.length') == 16
        mobile.screenshot(path=str(OUT/f'map-overview-{width}.png'))
        before_position = current(mobile)['position']
        mobile.click('[data-ui="locate"]')
        assert current(mobile)['position'] == before_position
        record(f'{width}px 全城视图完整容纳新路网，定位及缩放不改变人物位置')
        assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
        mobile.evaluate('window.__map.fit()')
        assert mobile.evaluate('''()=>{const m=window.__map,[l,t,r,b]=m.extent,a=m.map.latLngToContainerPoint([-t,l]),c=m.map.latLngToContainerPoint([-b,r]);return a.x>=-.5&&a.y>=-.5&&c.x<=m.el.clientWidth+.5&&c.y<=m.el.clientHeight+.5;}''')
        mobile.screenshot(path=str(OUT/f'expanded-map-{width}.png'))
        mobile.evaluate('window.__map.center()')
        for selector in ['#game-nav', '#action-bar', '.time-controls']:
            box = mobile.locator(selector).bounding_box()
            assert box['x'] >= 0 and box['x']+box['width'] <= width+.5
            assert box['y'] >= 0 and box['y']+box['height'] <= height+.5
        mobile.locator('.game-nav [data-panel="system"]').click()
        mobile.screenshot(path=str(OUT/f'system-{width}.png'))
        panel = mobile.locator('#panel').bounding_box()
        assert panel['x'] >= 0 and panel['y'] >= 0 and panel['y']+panel['height'] <= height
        assert mobile.locator('[data-act="sign"]').is_visible()
        mobile.click('[data-ui="close"]')
        if width == 390:
            z = float(mobile.locator('#city-map').get_attribute('data-zoom'))
            cdp = ctx.new_cdp_session(mobile)
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':145,'y':420},{'x':245,'y':420}]})
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':110,'y':420},{'x':280,'y':420}]})
            cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            assert float(mobile.locator('#city-map').get_attribute('data-zoom')) > z
            assert not mobile.locator('#panel').evaluate('(d)=>d.open')
            record('双指缩放不误接单，缩放只改变视角')
        assert not merrors, merrors
        record(f'{width}px 手机视口：时间控制、行动栏、导航、面板无溢出或运行异常')
        ctx.close()

    ctx, expanded, xerrors = setup(browser)
    new_game(expanded, '新城骑手')
    assert expanded.evaluate('NightCourier.PLACES.length') == 485
    tile_paint_checks(expanded)
    assert expanded.locator('.city-name').inner_text() == '青岚城'
    names=expanded.evaluate('JSON.stringify([NightCourier.PLACES,NightCourier.MAP_REGIONS.map(r=>r.name)])')
    assert not any(name in names for name in ['上海','黄浦江','人民路','中华路','豫园'])
    expanded.screenshot(path=str(OUT/'map-overview-1440.png'))
    vehicle = current(expanded)['vehicle']; vehicle['battery'] = 0
    fixture(expanded, {'vehicle': vehicle})
    expanded.locator('.game-nav [data-panel="vehicle"]').click()
    assert expanded.locator('[data-act="charge"]').inner_text() == '充电 · ¥8 / 10 分钟'
    expanded.screenshot(path=str(OUT/'charge-panel.png'))
    expanded.click('[data-act="charge"]')
    accepted = stored(expanded)
    assert accepted['player']['money'] == 112 and accepted['activity']['duration'] == 10
    pump(expanded, 2000)
    assert current(expanded)['vehicle']['battery'] == 0  # Read/save manual pause remains independent.
    toggle(expanded); pump(expanded, 2500); toggle(expanded)
    assert abs(stored(expanded)['vehicle']['battery']-20) < 1e-5
    expanded.screenshot(path=str(OUT/'charging-paused.png'))
    expanded.click('[data-ui="home"]');expanded.locator('[data-ui="load"]').first.click()
    pump(expanded, 2000)
    assert abs(current(expanded)['vehicle']['battery']-20) < 1e-5
    toggle(expanded);pump(expanded, 7500);toggle(expanded)
    assert current(expanded)['activity'] is None and abs(current(expanded)['vehicle']['battery']-80) < 1e-5
    assert stored(expanded)['player']['money'] == 112
    record('充电界面 10 分钟/¥8，与实际进度、暂停和多次读档一致')

    # Offer points show a shrinking ring and animate both entry and removal.
    now = current(expanded)['minutes']
    fleeting = {'id':'fleeting-offer','target':'lingxi-20','title':'短驻热饭','desc':'这张单很快会从地图消失。','condition':'urgent','expiresAt':now+.25,'reward':30,'coins':2,'npc':None}
    fixture(expanded, {'orders':[fleeting], 'activeOrder':None, 'activity':None, 'pending':None})
    offer = expanded.locator('.order-point[data-order-id="fleeting-offer"]')
    assert offer.count() == 1
    assert offer.locator('.order-expiry-ring').count() == 1
    assert expanded.evaluate("""()=>getComputedStyle(document.querySelector('.order-point[data-order-id="fleeting-offer"] .point-visual')).animationName""") == 'orderPointIn'
    expanded.wait_for_timeout(380)
    centers = expanded.evaluate("""()=>{const p=document.querySelector('.order-point[data-order-id="fleeting-offer"]');const core=p.querySelector('.point-core').getBoundingClientRect(),ring=p.querySelector('.order-expiry-ring').getBoundingClientRect();return {core:[core.x+core.width/2,core.y+core.height/2],ring:[ring.x+ring.width/2,ring.y+ring.height/2]};}""")
    assert abs(centers['core'][0]-centers['ring'][0]) < .5
    assert abs(centers['core'][1]-centers['ring'][1]) < .5
    assert offer.locator('.order-expiry-ring').get_attribute('transform') == 'rotate(-90 0 0)'
    ring_before = float(offer.locator('.order-expiry-ring').get_attribute('stroke-dashoffset'))
    toggle(expanded);pump(expanded, 120);toggle(expanded)
    ring_after = float(offer.locator('.order-expiry-ring').get_attribute('stroke-dashoffset'))
    assert ring_after > ring_before
    # Capture removal styling in the same browser turn as the class change.
    # Cross-process polling can arrive after the 280ms animation on a busy runner.
    expanded.evaluate("""()=>{
      window.__offerExit=null;
      const observer=new MutationObserver(()=>{
        const point=document.querySelector('.order-leaving[data-order-id="fleeting-offer"]');
        if(!point)return;
        window.__offerExit={count:document.querySelectorAll('.order-leaving').length,
          animation:getComputedStyle(point.querySelector('.point-visual')).animationName,
          interactive:point.hasAttribute('data-place'),tabIndex:point.getAttribute('tabindex'),
          hidden:point.getAttribute('aria-hidden')};
        observer.disconnect();
      });
      observer.observe(document.querySelector('.points-layer'),{subtree:true,attributes:true,attributeFilter:['class']});
    }""")
    toggle(expanded);pump(expanded, 180);toggle(expanded)
    assert expanded.evaluate('window.__offerExit') == {'count':1,'animation':'orderPointOut','interactive':False,'tabIndex':'-1','hidden':'true'}
    expanded.wait_for_selector('.order-leaving', state='detached')
    assert expanded.locator('.order-leaving').count() == 0
    assert expanded.locator('[data-place="lingxi-20"]').count() == 0
    record('配送点用圆形进度显示消失时间，并在出现与消失时播放动画')

    # Exercise an actual new district order, not a permanent destination marker.
    now = current(expanded)['minutes']
    ticket = {'id':'new-zone-test','target':'lingxi-20','title':'山麓热饭','desc':'请送到门口。','condition':'ordinary','expiresAt':now+80,'reward':50,'coins':4,'npc':None}
    fixture(expanded, {'orders':[ticket], 'activeOrder':None, 'activity':None, 'pending':None})
    expected = expanded.evaluate('NightCourier.PLACES.filter(p=>p.permanent).length+1')
    assert expanded.locator('.map-point').count() == expected
    expanded.click('[data-ui="fit-map"]')
    expanded.locator('[data-place="lingxi-20"]').focus();expanded.keyboard.press('Enter')
    assert expanded.locator('#panel-title').inner_text() == '问山茶坊'
    assert '老城厢街巷' in expanded.locator('.panel-body').inner_text()
    expanded.screenshot(path=str(OUT/'new-district-order.png'))
    expanded.click('[data-act="deliver"]')
    money = stored(expanded)['player']['money']
    remaining = expanded.evaluate('NightCourier.activityRemaining(window.__live)')
    toggle(expanded);pump(expanded, remaining*350);toggle(expanded)
    assert stored(expanded)['position'] is None and stored(expanded)['activity']['travelled'] > 0
    assert stored(expanded)['player']['money'] == money
    expanded.click('[data-ui="home"]');expanded.locator('[data-ui="load"]').first.click()
    expanded.select_option('#time-speed', '10');toggle(expanded)
    pump(expanded, 8000)
    assert stored(expanded)['position'] == 'lingxi-20'
    assert stored(expanded)['pending']['delivery']['id'] == 'new-zone-test'
    expanded.click('[data-act="choose"][data-index="0"]')
    assert stored(expanded)['stats']['delivered'] == 1
    assert stored(expanded)['player']['money'] == money+50
    assert expanded.locator('[data-place="lingxi-20"]').count() == 0
    record('新区地址按订单显示，真实配送、途中读档和奖励结算后移除任务点')
    assert not xerrors, xerrors
    ctx.close()

    ctx, ai, aerrors = setup(browser, 1200, 900, ai=True)
    new_game(ai, '听雨', 'ai')
    flags = current(ai)['flags'];flags['firstOrder'] = True
    fixture(ai, {'position':'park','location':None,'flags':flags})
    toggle(ai)
    ai.select_option('#time-speed', '10')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]')
    pump(ai, 3200)
    ack_result_ui(ai)
    ai.wait_for_function("document.querySelector('#panel-title').textContent==='雨后的小灯'")
    assert stored(ai)['pending']['source'] == 'ai'
    at = stored(ai)['minutes'];pump(ai, 2000)
    assert current(ai)['minutes'] == at
    ai.click('[data-act="choose"][data-index="0"]')
    assert stored(ai)['pending'] is None
    record('AI 模拟成功返回受限事件，等待和阅读期间时间冻结')
    ack_result_ui(ai)
    ai.evaluate('window.__aiDelay=1200')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]');pump(ai, 3200)
    ack_result_ui(ai)
    ai.click('[data-act="choose"][data-index="0"]')
    pump(ai, 5000)
    settled = current(ai)
    ai.wait_for_timeout(1400)
    assert current(ai)['pending'] is None
    assert current(ai)['player'] == settled['player']
    record('提前选择经典选项后，迟到 AI 响应不覆盖状态或重复奖励')
    ack_result_ui(ai)
    ai.evaluate('window.__aiDelay=0;window.__aiFail=true')
    ai.locator('[data-place="park"]').focus();ai.keyboard.press('Enter')
    ai.click('[data-act="explore"]');pump(ai, 3200)
    ack_result_ui(ai)
    ai.wait_for_function("JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves[0].pending?.aiStatus==='fallback'")
    assert stored(ai)['pending']['source'] == 'classic'
    assert stored(ai)['mode'] == 'ai'
    record('AI 模拟失败回退经典事件，存档模式不改变')
    assert not aerrors, aerrors
    ctx.close()

    ctx, real, rerrors = setup(browser, 1024, 800, controlled=False)
    new_game(real, '实时时钟')
    real.wait_for_timeout(1250)
    assert current(real)['minutes'] > 481
    toggle(real)
    at = stored(real)['minutes']
    real.wait_for_timeout(300)
    assert current(real)['minutes'] == at
    select_order(real);real.click('[data-act="deliver"]')
    toggle(real);real.wait_for_timeout(200);toggle(real)
    assert stored(real)['activity']['travelled'] > 0
    assert not rerrors, rerrors
    record('真实 requestAnimationFrame：空闲流逝、移动与暂停实测')
    ctx.close()
    # Disable foreground rendering after startup: only the real background
    # interval can advance. Hidden status is simulated, timers are not mocked.
    ctx, bg, bgerrors = setup(browser, 1024, 800, controlled=False)
    new_game(bg, '后台时钟')
    bg.evaluate("()=>{window.requestAnimationFrame=()=>0;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}")
    bg.wait_for_timeout(200)
    at = current(bg)['minutes']
    bg.wait_for_timeout(2400)
    assert current(bg)['minutes'] >= at+1.5
    assert bg.locator('#game-screen').get_attribute('data-paused') == 'false'
    bg.locator('[data-ui="pause"]').evaluate('(button)=>button.click()')
    at = stored(bg)['minutes']
    bg.wait_for_timeout(1200)
    assert current(bg)['minutes'] == at
    assert not bgerrors, bgerrors
    record('真实后台定时器：无动画回调仍推进，手动暂停仍生效')
    ctx.close()


SUITES = {
    'sandbox_new_game': sandbox_new_game_checks,
    'leaflet': leaflet_browser_checks,
    'five_sects': five_sects_browser_checks,
    'zhou_story': zhou_story_browser_checks,
    'male_npc': male_npc_browser_checks,
    'npc_career': npc_career_browser_checks,
    'npc_profile': npc_profile_browser_checks,
    'delivery_npc': delivery_npc_browser_checks,
    'higher_story': higher_story_browser_checks,
    'story_chapter': story_chapter_browser_checks,
    'sect': sect_browser_checks,
    'delivery_coins': delivery_coins_browser_checks,
    'unlock_notice': unlock_notice_browser_checks,
    'place_unlock': place_unlock_browser_checks,
    'result': result_browser_checks,
    'realm': realm_browser_checks,
    'location': location_browser_checks,
    'auction': auction_browser_checks,
    'system_name': system_name_browser_checks,
    'progressive': progressive_browser_checks,
    'core': core_browser_checks,
}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', choices=['all', *SUITES], default='all')
    parser.add_argument('--map-only', action='store_true')
    parser.add_argument('--list-suites', action='store_true')
    args = parser.parse_args()
    if args.list_suites:
        print(json.dumps(list(SUITES)))
        sys.exit(0)
    selected = ['leaflet'] if args.map_only else list(SUITES) if args.suite == 'all' else [args.suite]
    durations = []
    started = time.monotonic()
    try:
        with sync_playwright() as p:
            executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
            kwargs = {'headless': True}
            if Path(executable).exists():
                kwargs['executable_path'] = executable
            browser = p.chromium.launch(**kwargs)
            for name in selected:
                before = len(results)
                stamp = time.monotonic()
                SUITES[name](browser)
                durations.append({'suite': name, 'seconds': round(time.monotonic()-stamp, 3), 'passed': len(results)-before})
            browser.close()
    except BaseException:
        (OUT/'browser-tests.json').write_text(json.dumps({'tests':results, 'passed':len(results), 'failed':1, 'durations':durations}, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    (OUT/'browser-tests.json').write_text(json.dumps({
        'mode':'offline Chromium bundle; controlled GameClock timestamps plus real-rAF and background-heartbeat probes; mocked storage and AI',
        'tests':results, 'passed':len(results), 'failed':0, 'receipt_reload_modes':reload_modes,
        'durations':durations, 'seconds':round(time.monotonic()-started, 3),
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(results)} browser checks passed.')
