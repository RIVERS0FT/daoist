"""Offline art integration, disclosure boundaries and responsive controls.

python tests/browser-art-integration.py --root public
Uses the real game clock and storage. Late-game checks load explicit isolated,
schema-validated fixtures; they do not stand in for progression tests.
"""
import argparse
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://daoist.test/daoist/'
KEYS = ['delivery', 'cultivation', 'alchemy', 'auction', 'sect', 'system',
        'inventory', 'bonds', 'vehicle', 'rest', 'regions', 'help']
CAPTURE = r'''addEventListener('DOMContentLoaded', () => {
  const G=NightCourier,render=G.CityMap.prototype.render,frame=G.GameClock.prototype.frame;
  G.CityMap.prototype.render=function(s){window.__artMap=this;return render.call(this,s);};
  G.GameClock.prototype.frame=function(...args){window.__artClock=this;return frame.apply(this,args);};
});
//# sourceURL=art-integration-harness.js
'''


def serve(page, directory, requests, missing=False, sandbox=False):
    csp = (f"sandbox allow-scripts allow-pointer-lock; default-src 'none'; "
           f"script-src {BASE} 'unsafe-inline' 'wasm-unsafe-eval'; "
           f"style-src {BASE} 'unsafe-inline'; img-src {BASE} data: blob:; "
           f"font-src {BASE} data:; connect-src {BASE}; form-action 'none'; "
           "base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'")

    def handler(route):
        request = route.request
        parsed = urlparse(request.url)
        requests.append({'url': request.url, 'type': request.resource_type})
        if parsed.netloc != 'daoist.test':
            route.abort()
            return
        if parsed.path == '/api/health':
            route.fulfill(json={'aiConfigured': False, 'message': 'Art integration: classic mode'})
            return
        if not parsed.path.startswith('/daoist/'):
            route.fulfill(status=404, body='Not found')
            return
        relative = unquote(parsed.path).removeprefix('/daoist/') or 'index.html'
        target = (directory / relative).resolve()
        if not target.is_relative_to(directory) or not target.is_file() or (missing and relative.startswith('art/') and relative.endswith('.png')):
            route.fulfill(status=404, body='Not found')
            return
        headers = {'Content-Security-Policy': csp} if sandbox and relative == 'index.html' else {}
        route.fulfill(body=target.read_bytes(),
                      content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream',
                      headers=headers)
    page.route('**/*', handler)


def snapshot(page):
    return page.evaluate('() => JSON.stringify(__artMap.s)')


def loaded(page, selector, count=1):
    page.wait_for_function('''({selector,count}) => {
      const images=[...document.querySelectorAll(selector)];
      return images.length===count&&images.every(img=>img.complete&&img.naturalWidth>0);
    }''', arg={'selector': selector, 'count': count})


def no_overflow(page, label):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{label}: page overflow'
    if page.locator('#panel[open]').count():
        assert page.locator('#panel').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'{label}: dialog overflow'
        assert page.locator('.panel-body').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'{label}: panel content overflow'


def new_game(page):
    page.locator('[data-ui="new-game"]').click()
    page.fill('#player-name-input', '画中旅人')
    page.locator('#new-game-form button[type="submit"]').click()
    page.wait_for_selector('#game-screen:not([hidden])')
    page.wait_for_function('!!window.__artMap && !!window.__artClock')
    page.locator('[data-ui="pause"]').click()
    page.wait_for_timeout(150)
    assert page.evaluate('__artClock.reasons.has("manual")')


def close_panel(page):
    page.locator('#panel [data-ui="close"]').click()
    page.wait_for_function('!document.querySelector("#panel").open')
    assert_nav_state(page)


def assert_nav_state(page, expected=None):
    rows = page.locator('#game-nav .nav-btn').evaluate_all('''buttons => buttons.map(button=>({
      panel:button.dataset.panel,active:button.classList.contains('active'),
      expanded:button.getAttribute('aria-expanded')
    }))''')
    for row in rows:
        selected = row['panel'] == expected
        assert row['active'] == selected, f'Navigation active state disagrees with displayed panel: {row}'
        assert row['expanded'] == ('true' if selected else 'false'), f'Navigation disclosure state disagrees with displayed panel: {row}'


def nav_geometry(page, panel_keys):
    rows = page.locator('#game-nav .nav-btn').evaluate_all('''buttons => buttons.map(button=>{
      const b=button.getBoundingClientRect(),emblem=button.querySelector('.nav-emblem');
      const label=button.querySelector('.nav-label')||button.lastElementChild;
      const e=emblem?.getBoundingClientRect(),style=emblem&&getComputedStyle(emblem);
      const range=document.createRange();range.selectNodeContents(label);
      const text=range.getBoundingClientRect(),labelStyle=getComputedStyle(label);
      return {panel:button.dataset.panel,width:b.width,height:b.height,
        emblem:e?{width:e.width,height:e.height,radius:style.borderRadius,clip:style.clipPath}:null,
        label:label.textContent.trim(),fontSize:parseFloat(labelStyle.fontSize),
        labelVisible:labelStyle.visibility!=='hidden'&&labelStyle.display!=='none'&&text.width>0&&text.height>0,
        labelFits:text.left>=b.left-1&&text.right<=b.right+1&&text.top>=b.top-1&&text.bottom<=b.bottom+1,
        icon:emblem?.querySelector('img')?.getAttribute('src')};
    })''')
    assert [row['panel'] for row in rows] == panel_keys, 'Full-progress fixture must retain exactly ten existing navigation entries'
    for row in rows:
        assert row['width'] >= 44 and row['height'] >= 44, f'Navigation hit area too small: {row}'
        emblem = row['emblem']
        assert emblem and emblem['width'] > 0 and abs(emblem['width'] - emblem['height']) < .5, f'Navigation emblem is not square: {row}'
        radius = emblem['radius'].split()[0]
        circular = emblem['clip'].startswith('circle(')
        if radius.endswith('%'):
            circular = circular or float(radius[:-1]) >= 50
        elif radius.endswith('px'):
            circular = circular or float(radius[:-2]) >= emblem['width'] / 2 - .5
        assert circular, f'Navigation emblem lacks a circular border or clip: {row}'
        assert row['icon'] == f'art/icons/{row["panel"]}-v1.png', f'Navigation changed existing artwork: {row}'
        assert row['label'] and row['fontSize'] >= 10 and row['labelVisible'] and row['labelFits'], f'Navigation label is clipped or unreadable: {row}'
    return rows


def nav_layout(page):
    layout = page.evaluate('''()=>{
      const box=selector=>{
        const el=document.querySelector(selector),b=el.getBoundingClientRect(),style=getComputedStyle(el);
        return {x:b.x,y:b.y,width:b.width,height:b.height,
          visible:!el.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&b.width>0&&b.height>0};
      };
      const region=document.querySelector('.region-chip'),b=region.getBoundingClientRect();
      const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {nav:box('#game-nav'),action:box('#action-bar'),log:box('#log-panel'),
        region:box('.region-chip'),regionHitOwnElement:!!hit&&region.contains(hit),
        regionHit:hit?.id||hit?.className||hit?.tagName};
    }''')
    nav = layout['nav']
    for name in ('action', 'log'):
        other = layout[name]
        if not other['visible']:
            continue
        overlap_x = min(nav['x'] + nav['width'], other['x'] + other['width']) - max(nav['x'], other['x'])
        overlap_y = min(nav['y'] + nav['height'], other['y'] + other['height']) - max(nav['y'], other['y'])
        assert overlap_x <= 1 or overlap_y <= 1, f'Navigation overlaps visible {name} panel: {layout}'
    assert layout['regionHitOwnElement'], f'Region entry is covered at its actual click point: {layout}'
    return layout


def fixture(page, edit):
    # The same real save/load boundary used by browser-smoke.py, without mocks
    # for storage permissions or state sanitization.
    if page.locator('#panel[open] [data-ui="close"]').count():
        close_panel(page)
    if page.locator('#panel[open]').count():
        page.evaluate('document.querySelector("[data-ui=home]").click()')
    else:
        page.locator('[data-ui="home"]').click()
    page.evaluate('''edit => {
      const G=NightCourier,key=G.STORAGE_KEY,index=JSON.parse(localStorage.getItem(key));
      const s=index.saves[0];
      // Only authored test fixture code is evaluated, never application data.
      const change=new Function('G','s',edit);change(G,s);
      index.saves[0]=G.sanitizeSave(s);
      localStorage.setItem(key,JSON.stringify(index));
      dispatchEvent(new StorageEvent('storage',{key}));
    }''', edit)
    page.locator('[data-ui="load"]').first.click()
    page.wait_for_selector('#game-screen:not([hidden])')
    assert page.evaluate('__artClock.paused'), 'Loaded art fixture was not paused'


def open_panel_unchanged(page, selector, label):
    before = snapshot(page)
    requested = page.locator(selector).get_attribute('data-panel')
    page.locator(selector).click()
    page.wait_for_selector('#panel[open]')
    page.wait_for_timeout(140)
    assert page.evaluate('__artClock.reasons.has("panel")'), f'{label}: panel did not pause'
    assert snapshot(page) == before, f'{label}: opening visual UI mutated gameplay'
    assert_nav_state(page, requested if page.locator(f'#game-nav .nav-btn[data-panel="{requested}"]').count() else None)
    no_overflow(page, label)
    return before


FULL_FEATURES = '''
  s.stats.delivered=60;s.stats.trained=1;s.flags.firstOrder=true;s.flags.systemAwakened=true;
  s.player.realm=4;s.player.realmLevel=1;s.claimed=['q1'];
  s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);s.unlockNotices=[];
  s.pending=null;s.eventResult=null;s.placeUnlock=null;s.activity=null;s.activeOrder=null;
'''


def set_event(page, npc, met):
    edit = FULL_FEATURES + f'''
      const id={json.dumps(npc)},met={json.dumps(met)},n=G.NPCS.find(n=>n.id===id);
      Object.assign(s.bonds[id],{{met,stage:0,path:'none',affinity:0,trust:0,lastTalkDay:0}});
      if(met){{
        s.position=n.place;s.location=null;s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];
        const [title,text,...choices]=n.arc[0];
        s.pending={{id:'art-social-'+id,kind:'social',title,text,choices:G.clone(choices),npcId:id,
          npcAdvance:true,source:'classic',aiStatus:'skip',...(id==='zhou'?{{templateId:'zhou-arc-0'}}:{{}})}};
      }}else{{
        const e=G.EVENTS.find(e=>e.id==='delivery-npc-'+id),target='home';
        s.position=target;s.location=null;
        const ticket={{id:'art-ticket-'+id,target,title:'测试配送',desc:'已抵达的隔离票据',
          condition:'ordinary',expiresAt:s.minutes+20,reward:20,coins:2,npc:id}};
        s.pending={{...G.clone(e),id:'art-meeting-'+id,templateId:e.id,npcId:id,npcAdvance:false,
          source:'classic',aiStatus:'skip',delivery:ticket}};
      }}
    '''
    fixture(page, edit)
    page.wait_for_selector('#panel[open] .choice-list')


def leave_event(page):
    # Return-home remains an available top-bar action underneath a modal; use
    # the existing UI handler to retain an unread authored fixture unchanged.
    page.evaluate('document.querySelector("[data-ui=home]").click()')


def run_viewport(browser, directory, output, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  has_touch=width < 900, is_mobile=width < 600)
    page = context.new_page()
    requests, errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    serve(page, directory, requests)
    page.add_init_script(CAPTURE)
    page.goto(BASE)
    loaded(page, 'img.hero-art-image')
    loaded(page, 'img.game-brand-icon')
    assert page.locator('link[rel="icon"]').get_attribute('href') == 'art/game-icon-v1.png'
    assert page.locator('img.hero-art-image').get_attribute('src') == 'art/night-courier-keyart-v1.png'
    assert page.locator('img.game-brand-icon').get_attribute('src') == 'art/game-icon-v1.png'
    no_overflow(page, 'start')
    page.screenshot(path=str(output / f'start-{width}x{height}.png'), full_page=True)
    new_game(page)
    assert not page.locator('#game-nav [data-panel="bonds"]').count(), 'New game leaked NPC gallery'
    assert not page.locator('#game-nav [data-panel="cultivation"],#game-nav [data-panel="alchemy"],#game-nav [data-panel="system"],#game-nav [data-panel="auction"],#game-nav [data-panel="sect"]').count(), 'Art prematurely unlocked features'
    assert not any('lin-office' in r['url'] or 'zhou-rider' in r['url'] for r in requests), 'Unmet portrait requested at start'
    page.evaluate('window.__locationArtNode=document.querySelector(".location-chip img")')
    page.wait_for_timeout(350)
    assert page.evaluate('!!__locationArtNode&&__locationArtNode===document.querySelector(".location-chip img")'), 'Unchanged live HUD recreated its PNG every tick'
    before = open_panel_unchanged(page, '#game-nav [data-panel="help"]', 'new help')
    assert page.locator('#panel-title').inner_text().strip()
    close_panel(page)
    assert snapshot(page) == before

    # Complete whitelist fixture: all 21 known characters, only two available
    # portrait assets. It checks the other 19 readable letter avatars together.
    fixture(page, FULL_FEATURES + 'for(const b of Object.values(s.bonds))b.met=true;')
    panel_keys = [key for key in KEYS if key not in ('delivery', 'regions')]
    nav_rows = nav_geometry(page, panel_keys)
    layout = nav_layout(page)
    assert_nav_state(page)
    before = snapshot(page)
    for key in panel_keys:
        entry = page.locator(f'#game-nav [data-panel="{key}"]')
        entry.scroll_into_view_if_needed()
        entry.hover()
        page.wait_for_timeout(30)
    page.wait_for_timeout(140)
    assert snapshot(page) == before, 'Hovering and scrolling navigation changed paused gameplay'
    assert_nav_state(page)
    for key in panel_keys:
        selector = f'#game-nav [data-panel="{key}"]'
        image = f'{selector} img.game-icon[data-art-icon="{key}"]'
        loaded(page, image)
        assert page.locator(image).get_attribute('src') == f'art/icons/{key}-v1.png'
        before = open_panel_unchanged(page, selector, key)
        if key == 'bonds':
            assert page.locator('[data-npc-id]').count() == 21
            for npc, path in [('lin', 'lin-office'), ('zhou', 'zhou-rider')]:
                selector = f'[data-npc-id="{npc}"] .npc-portrait img[data-npc-portrait="{npc}"]'
                page.locator(selector).scroll_into_view_if_needed()
                loaded(page, selector)
                assert page.locator(selector).get_attribute('src') == f'art/{path}-v1.png'
                assert page.locator(selector).evaluate('el=>getComputedStyle(el).objectFit') == 'contain', 'Portrait cuts off authored half-body'
                page.screenshot(path=str(output / f'{npc}-{width}x{height}.png'))
            assert page.locator('.npc-card:not([data-npc-id="lin"]):not([data-npc-id="zhou"]) .npc-avatar').count() == 19
            assert page.locator('.npc-portrait img').count() == 2, 'Other NPC reused a named portrait'
        close_panel(page)
        assert snapshot(page) == before, f'{key}: art changed paused state'

    loaded(page, '.region-chip img[data-art-icon="regions"]')
    # Reach the final navigation item through the actual scroll container, with
    # its hit area retained on 320/375 px portrait and the 812 px landscape.
    page.locator('#game-nav [data-panel="help"]').scroll_into_view_if_needed()
    nav_hit = page.locator('#game-nav [data-panel="help"]').evaluate('''el=>{
      const b=el.getBoundingClientRect(),n=el.closest('nav').getBoundingClientRect();
      return {width:b.width,height:b.height,left:b.left,right:b.right,navLeft:n.left,navRight:n.right};
    }''')
    assert nav_hit['width'] >= 44 and nav_hit['height'] >= 44, 'Help navigation lost minimum hit area'
    assert nav_hit['left'] >= nav_hit['navLeft'] - 1 and nav_hit['right'] <= nav_hit['navRight'] + 1, 'Last navigation entry cannot be reached'
    before = open_panel_unchanged(page, '#game-nav [data-panel="help"]', 'final navigation entry')
    page.keyboard.press('Escape')
    page.wait_for_function('!document.querySelector("#panel").open')
    assert_nav_state(page)
    assert snapshot(page) == before
    before = open_panel_unchanged(page, '.region-chip[data-panel="chapters"]', 'regions')
    assert page.locator('[data-region]').count() == 16
    close_panel(page)
    assert snapshot(page) == before
    target = page.evaluate('__artMap.s.orders[0].target')
    # Keyboard activation preserves a real map place handler even where an
    # address is off the current camera viewport.
    page.locator(f'.map-point[data-place="{target}"]').focus()
    before = snapshot(page)
    page.keyboard.press('Enter')
    page.wait_for_selector('#panel[open]')
    assert_nav_state(page)
    loaded(page, '#panel .order-box h3 img[data-art-icon="delivery"]')
    assert page.locator('[data-act="deliver"]').is_visible()
    assert snapshot(page) == before
    close_panel(page)
    no_overflow(page, 'full navigation')
    page.screenshot(path=str(output / f'game-{width}x{height}.png'))

    fixture(page, FULL_FEATURES + '''
      for(const b of Object.values(s.bonds))b.met=false;
      s.bonds.zhou={met:true,stage:9,path:'enemy',affinity:0,trust:0,lastTalkDay:0};
    ''')
    before = open_panel_unchanged(page, '#game-nav [data-panel="bonds"]', 'enemy')
    assert page.locator('[data-npc-id="zhou"] .npc-avatar').is_visible()
    assert not page.locator('img[data-npc-portrait="zhou"]').count(), 'Enemy uses friendly portrait'
    assert page.locator('[data-npc-id="zhou"] .tag').inner_text() == '仇人'
    close_panel(page)
    assert snapshot(page) == before

    fixture(page, FULL_FEATURES + '''
      const n=G.NPCS.find(n=>n.id==='zhou');
      s.bonds.zhou={met:true,stage:9,path:'enemy',affinity:0,trust:0,lastTalkDay:0};
      s.position=n.place;s.location=null;s.unlockedPlaces=[...new Set([...s.unlockedPlaces,n.place])];
      const [title,text,...choices]=n.arc[9];
      s.pending={id:'art-enemy-zhou',templateId:'zhou-arc-9',kind:'social',title,text,
        choices:G.clone(choices),npcId:'zhou',npcAdvance:true,source:'classic',aiStatus:'skip'};
    ''')
    page.wait_for_selector('#panel[open] .choice-list')
    before = snapshot(page)
    event_title = page.locator('#panel-title').inner_text()
    # Exercise the existing navigation handler during an unread mandatory
    # event. It must keep the real event selected rather than decorating the
    # originally requested help button as though help had opened.
    page.evaluate('document.querySelector("#game-nav [data-panel=help]").click()')
    assert page.locator('#panel-title').inner_text() == event_title
    assert_nav_state(page)
    assert not page.locator('.npc-event-portrait img[data-npc-portrait="zhou"]').count(), 'Enemy event uses friendly portrait'
    assert page.locator('.choice:not(:disabled)').count() >= 1
    page.wait_for_timeout(180)
    assert snapshot(page) == before

    event_checks = []
    for npc in ('lin', 'zhou'):
        for met in (False, True):
            request_start = len(requests)
            set_event(page, npc, met)
            before = snapshot(page)
            selector = f'.npc-event-portrait img[data-npc-portrait="{npc}"]'
            if met:
                page.locator(selector).scroll_into_view_if_needed()
                loaded(page, selector)
            else:
                assert not page.locator(selector).count(), f'{npc}: initial encounter exposes portrait'
                assert not any(('lin-office' if npc == 'lin' else 'zhou-rider') in r['url'] for r in requests[request_start:]), 'Initial encounter requested portrait'
            assert page.locator('.choice:not(:disabled)').count() >= 1
            page.locator('.choice:not(:disabled)').first.scroll_into_view_if_needed()
            no_overflow(page, f'{npc} event {met}')
            page.wait_for_timeout(180)
            assert snapshot(page) == before, 'NPC illustration advanced event or time'
            event_checks.append({'npc': npc, 'met': met})
            leave_event(page)
            # The next fixture expects an active game so load the unread event;
            # it will return to the menu before replacing that isolated fixture.
            page.locator('[data-ui="load"]').first.click()

    assert not errors, errors
    assert all(urlparse(r['url']).netloc == 'daoist.test' for r in requests), 'External asset request'
    assert all(urlparse(r['url']).path.startswith('/daoist/') for r in requests if r['type'] == 'image'), 'Image lost /daoist prefix'
    context.close()
    print(f'PASS {width}x{height}: start art, 12 uses, disclosure, 21 NPC fallback, paused state, event choices', flush=True)
    return {'viewport': f'{width}x{height}', 'icon_uses': KEYS, 'npc_cards': 21,
            'navigation': nav_rows, 'navigation_layout': layout, 'hover_scroll_state_unchanged': True,
            'npc_events': event_checks, 'enemy_event_no_friendly_portrait': True,
            'same_origin_subpath': True, 'page_errors': errors}


def resilience_checks(browser, directory, output, missing=False, sandbox=False):
    width, height = 375, 812
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True)
    page = context.new_page()
    requests, errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    serve(page, directory, requests, missing, sandbox)
    page.add_init_script(CAPTURE)
    page.goto(BASE)
    if sandbox:
        assert page.evaluate('() => {try{void localStorage;return false;}catch(e){return e.name==="SecurityError";}}')
        loaded(page, 'img.hero-art-image')
        loaded(page, 'img.game-brand-icon')
    else:
        page.wait_for_timeout(150)
        assert page.locator('[data-ui="new-game"]').inner_text().strip()
    no_overflow(page, 'resilient start')
    new_game(page)
    before = open_panel_unchanged(page, '#game-nav [data-panel="rest"]', 'resilient rest')
    assert page.locator('[data-act="rest"]').is_enabled()
    close_panel(page)
    assert snapshot(page) == before
    if missing:
        fixture(page, FULL_FEATURES + 's.bonds.lin.met=true;s.bonds.zhou.met=true;')
        before = open_panel_unchanged(page, '#game-nav [data-panel="bonds"]', 'missing portraits')
        for npc in ('lin', 'zhou'):
            card = page.locator(f'[data-npc-id="{npc}"]')
            card.scroll_into_view_if_needed()
            page.wait_for_timeout(120)
            assert card.locator('h3').inner_text().strip()
            assert card.locator('.npc-avatar').is_visible(), 'Missing image lost letter avatar'
            assert not card.locator('.npc-portrait').is_visible(), 'Broken portrait placeholder consumes space'
            assert card.locator('[data-act="visit"]').is_visible()
        assert snapshot(page) == before
        close_panel(page)
        # A real instantaneous transport change remains usable after every
        # decorative art request fails; resources, location and time stay put.
        before = json.loads(snapshot(page))
        open_panel_unchanged(page, '#game-nav [data-panel="vehicle"]', 'missing vehicle')
        page.locator('[data-act="transport"][data-mode="walk"]').click()
        assert page.evaluate('__artMap.s.transport') == 'walk'
        after = json.loads(snapshot(page))
        assert after['minutes'] == before['minutes'] and after['player'] == before['player'] and after['vehicle'] == before['vehicle']
        close_panel(page)
    else:
        assert page.locator('#storage-warning').is_visible(), 'Sandbox did not show storage fallback'
        loaded(page, '#game-nav [data-panel="rest"] img.game-icon')
    no_overflow(page, 'resilience')
    page.screenshot(path=str(output / ('missing-art.png' if missing else 'sandbox-art.png')))
    assert not errors, errors
    context.close()
    label = 'missing art fallback' if missing else 'real CSP sandbox'
    print(f'PASS {label}: controls usable, readable labels, no state/time mutation', flush=True)
    return {'case': label, 'passed': True, 'page_errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public')
    parser.add_argument('--output', default='artifacts/art-integration')
    args = parser.parse_args()
    directory = (ROOT / args.root).resolve()
    output = (ROOT / args.output).resolve()
    if not output.is_relative_to(ROOT / 'artifacts'):
        parser.error('--output must be inside artifacts/')
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        try:
            report = [run_viewport(browser, directory, output, w, h)
                      for w, h in [(1440, 1000), (375, 812), (320, 740), (812, 375)]]
            report += [resilience_checks(browser, directory, output, missing=True),
                       resilience_checks(browser, directory, output, sandbox=True)]
        except Exception as error:
            evidence = {'error': str(error), 'pages': []}
            for context in browser.contexts:
                for page in context.pages:
                    viewport = page.viewport_size or {}
                    label = f'{viewport.get("width",0)}x{viewport.get("height",0)}'
                    page.screenshot(path=str(output / f'failure-{label}.png'))
                    evidence['pages'].append(page.evaluate('''()=>{
                      const selectors=['#game-nav','.region-chip','#action-bar','#log-panel'];
                      return {viewport:{width:innerWidth,height:innerHeight},boxes:selectors.map(selector=>{
                        const el=document.querySelector(selector),b=el?.getBoundingClientRect();
                        if(!b)return {selector};
                        const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
                        return {selector,box:{x:b.x,y:b.y,width:b.width,height:b.height},
                          hit:hit?.id||hit?.className||hit?.tagName};
                      })};
                    }'''))
            (output / 'failure.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf8')
            raise
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('4 viewports and missing-image/CSP cases passed')


if __name__ == '__main__':
    main()
