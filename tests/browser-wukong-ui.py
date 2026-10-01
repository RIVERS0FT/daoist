"""Black Myth inspired presentation regression against the real local server.

python tests/browser-wukong-ui.py
Each case has a separate temporary browser context. Fixtures pass the current
save sanitizer and never touch an existing browser profile or gameplay UI data.
The script owns an ephemeral createApp server unless --url is supplied.
"""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ART = ['panel-corners', 'title-ornament', 'divider']
VIEWPORTS = [(1440, 1000), (375, 812), (320, 740), (812, 375)]
CAPTURE = r'''addEventListener('DOMContentLoaded', () => {
  const G=NightCourier,render=G.CityMap.prototype.render,frame=G.GameClock.prototype.frame;
  G.CityMap.prototype.render=function(s){window.__wukongMap=this;return render.call(this,s);};
  G.GameClock.prototype.frame=function(...args){window.__wukongClock=this;return frame.apply(this,args);};
});
//# sourceURL=wukong-ui-harness.js
'''


@contextmanager
def local_server(url):
    if url:
        yield url.rstrip('/') + '/'
        return
    code = """import {createApp} from './server.mjs';
const {server}=createApp({host:'127.0.0.1',port:0,aiUrl:'',aiKey:'',aiModel:''});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/'));
"""
    process = subprocess.Popen(['node', '--input-type=module', '--eval', code],
                               cwd=ROOT, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line) for line in process.stdout],
                     daemon=True).start()
    try:
        base = lines.get(timeout=45).strip()
        assert base.startswith('http://127.0.0.1:'), f'createApp did not start: {base}'
        yield base
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        process.stdout.close()


def state(page):
    return page.evaluate('() => JSON.stringify(__wukongMap.s)')


def map_ready(page):
    page.wait_for_function('() => !__wukongMap.baseOverlay.isLoading()', timeout=45000)


def geometry(page, label):
    result = page.evaluate('''() => {
      const box=selector=>{
        const el=document.querySelector(selector),b=el.getBoundingClientRect();
        return {x:b.x,y:b.y,width:b.width,height:b.height,
          scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
          scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
      };
      const dialog=document.querySelector('#panel');
      const out={viewport:{width:innerWidth,height:innerHeight},
        pageWidth:document.documentElement.scrollWidth};
      if(dialog.open){
        out.panel=box('#panel');out.body=box('.panel-body');out.head=box('.panel-head');
        const close=dialog.querySelector('[data-ui="close"]');
        if(close){
          out.close=box('#panel [data-ui="close"]');
          const b=close.getBoundingClientRect();
          const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          out.closeHit=!!hit&&close.contains(hit);
        }
      }
      return out;
    }''')
    assert result['pageWidth'] <= result['viewport']['width'] + 1, f'{label}: page overflow: {result}'
    if 'panel' in result:
        panel = result['panel']
        assert panel['x'] >= -1 and panel['y'] >= -1, f'{label}: panel outside viewport: {result}'
        assert panel['x'] + panel['width'] <= result['viewport']['width'] + 1, f'{label}: panel right edge: {result}'
        assert panel['y'] + panel['height'] <= result['viewport']['height'] + 1, f'{label}: panel bottom edge: {result}'
        for name in ('panel', 'body'):
            row = result[name]
            assert row['scrollWidth'] <= row['clientWidth'] + 1, f'{label}: {name} overflow: {result}'
        assert result['body']['clientHeight'] > 24, f'{label}: no usable scroll body: {result}'
        if 'close' in result:
            assert result['closeHit'], f'{label}: close obscured by ornament/layout: {result}'
    return result


def scroll_panel(page, label, require_scroll=False):
    body = page.locator('.panel-body')
    before = body.evaluate('(el) => ({max:el.scrollHeight-el.clientHeight,top:el.scrollTop})')
    if require_scroll:
        assert before['max'] > 0, f'{label}: expected long content to scroll'
    if before['max'] > 0:
        box = body.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.wheel(0, before['max'] + 200)
        page.wait_for_timeout(160)
        assert body.evaluate('(el) => el.scrollTop > 0'), f'{label}: wheel could not scroll'
        body.evaluate('(el) => {el.scrollTop=el.scrollHeight;}')
        assert body.evaluate('(el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2'), f'{label}: end unreachable'
    return before['max']


def close_panel(page):
    page.locator('#panel [data-ui="close"]').click()
    page.wait_for_function('!document.querySelector("#panel").open')


def open_panel(page, selector, label, output, shot):
    before = state(page)
    page.locator(selector).scroll_into_view_if_needed()
    page.locator(selector).click()
    page.wait_for_selector('#panel[open]')
    page.wait_for_timeout(90)
    assert page.evaluate('__wukongClock.reasons.has("panel")'), f'{label}: missing panel pause'
    assert state(page) == before, f'{label}: presentation changed gameplay'
    measured = geometry(page, label)
    page.screenshot(path=str(output / f'{shot}.png'))
    return before, measured


def fixture(page, kind):
    # Return through the application's own menu handler before setting one
    # explicitly authored, sanitized fixture in this disposable context.
    if page.locator('#panel[open] [data-ui="close"]').count():
        close_panel(page)
    page.evaluate('document.querySelector("[data-ui=home]").click()')
    page.evaluate('''kind => {
      const G=NightCourier,key=G.STORAGE_KEY,index=JSON.parse(localStorage.getItem(key));
      const s=index.saves[0];
      s.pending=null;s.eventResult=null;s.placeUnlock=null;s.activity=null;s.activeOrder=null;
      s.unlockNotices=[];
      if(kind==='inventory'){
        for(const item of G.ITEMS.filter(i=>!i.unique))s.inventory[item.id]=1;
      }else if(kind==='event'){
        const e=G.EVENTS.find(e=>e.id==='paper-crane');
        s.pending={...G.clone(e),id:'wukong-event-fixture',templateId:e.id,source:'classic',aiStatus:'skip'};
      }else if(kind==='logs'){
        s.logs=Array.from({length:80},(_,i)=>({id:'wukong-log-'+i,at:s.minutes,tag:'行旅',
          text:'青岚城灯火渐起，沿路的人间烟火与风声一同写入这段旅程。'.repeat(6)}));
      }
      index.saves[0]=G.sanitizeSave(s);
      localStorage.setItem(key,JSON.stringify(index));
      dispatchEvent(new StorageEvent('storage',{key}));
    }''', kind)
    page.locator('[data-ui="load"]').first.click()
    page.wait_for_selector('#game-screen:not([hidden])')
    assert page.evaluate('__wukongClock.paused'), 'Loaded fixture must be paused'


def run_viewport(browser, base, output, width, height, missing=False):
    label = f'{width}x{height}' + ('-missing' if missing else '')
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  has_touch=width < 900, is_mobile=width < 600)
    page = context.new_page()
    errors, images, details = [], [], {}
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: images.append({'url': response.url, 'status': response.status})
            if '/art/ui/' in response.url and '-v2.png' in response.url else None)
    if missing:
        for name in ART:
            page.route(f'**/art/ui/{name}-v2.png', lambda route: route.fulfill(status=404, body='Not found'))
    page.add_init_script(CAPTURE)
    page.goto(base)
    assert page.evaluate('localStorage.getItem(NightCourier.STORAGE_KEY) === null'), 'Context was not isolated'
    details['start'] = geometry(page, label + ' start')
    page.screenshot(path=str(output / f'start-{label}.png'), full_page=True)
    page.locator('[data-ui="new-game"]').click()
    page.wait_for_selector('#panel[open]')
    details['new'] = geometry(page, label + ' new')
    scroll_panel(page, label + ' new')
    page.screenshot(path=str(output / f'new-{label}.png'))
    page.fill('#player-name-input', '墨色行旅')
    page.locator('#new-game-form button[type="submit"]').click()
    page.wait_for_selector('#game-screen:not([hidden])')
    page.wait_for_function('!!window.__wukongMap && !!window.__wukongClock')
    page.locator('[data-ui="pause"]').click()
    assert page.evaluate('__wukongClock.reasons.has("manual")')
    map_ready(page)
    assert not page.locator('#game-nav [data-panel="cultivation"],#game-nav [data-panel="alchemy"],#game-nav [data-panel="system"]').count(), 'UI unlocked gameplay'
    details['game'] = geometry(page, label + ' game')
    page.screenshot(path=str(output / f'game-{label}.png'))

    for key in ('help', 'vehicle', 'inventory'):
        before, measured = open_panel(page, f'#game-nav [data-panel="{key}"]',
                                      label + ' ' + key, output, f'{key}-{label}')
        details[key] = measured
        details[key]['scroll_max'] = scroll_panel(page, label + ' ' + key, require_scroll=key == 'help')
        if key == 'help':
            page.screenshot(path=str(output / f'help-bottom-{label}.png'))
            page.keyboard.press('Escape')
            page.wait_for_function('!document.querySelector("#panel").open')
        else:
            close_panel(page)
        assert state(page) == before, f'{label} {key}: scrolling/closing changed gameplay'

    fixture(page, 'inventory')
    before, measured = open_panel(page, '#game-nav [data-panel="inventory"]',
                                  label + ' full inventory', output, f'inventory-full-{label}')
    details['inventory_full'] = measured
    details['inventory_full']['items'] = page.locator('#panel .card').count()
    details['inventory_full']['scroll_max'] = scroll_panel(page, label + ' inventory', require_scroll=True)
    close_panel(page)
    assert state(page) == before

    before, measured = open_panel(page, '.region-chip[data-panel="chapters"]',
                                  label + ' regions', output, f'regions-{label}')
    assert page.locator('[data-region]').count() == 16
    assert page.locator('[data-region][data-open="true"]').count() == 1
    measured['scroll_max'] = scroll_panel(page, label + ' regions', require_scroll=True)
    details['regions'] = measured
    close_panel(page)
    assert state(page) == before

    # Text-only DOM stress does not write a name, balance, position, reward or
    # time into the game's UI. It checks the header layout with a long caption.
    before, measured = open_panel(page, '#game-nav [data-panel="help"]',
                                  label + ' long heading', output, f'heading-before-{label}')
    page.locator('#panel-title').evaluate("el => {el.textContent='青岚长夜，千山万水之间的人间修行与归途'.repeat(3);}")
    details['long_heading'] = geometry(page, label + ' long heading')
    page.screenshot(path=str(output / f'heading-long-{label}.png'))
    close_panel(page)
    assert state(page) == before

    fixture(page, 'logs')
    before = state(page)
    heading = page.locator('#log-panel [data-ui="logs"]')
    if heading.get_attribute('aria-expanded') == 'false':
        heading.click()
    page.locator('#log-panel [data-ui="expand-logs"]').click()
    body = page.locator('#log-panel .log-body')
    box = body.bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.wheel(0, 3000)
    page.wait_for_timeout(160)
    assert body.evaluate('el=>el.scrollTop>0'), f'{label}: logs cannot scroll'
    logbox = page.locator('#log-panel').bounding_box()
    assert logbox['x'] + logbox['width'] <= width + 1 and logbox['y'] + logbox['height'] <= height + 1, f'{label}: log outside viewport'
    assert logbox['x'] + logbox['width'] >= width - 35, f'{label}: logs lost right anchor'
    details['logs'] = {'box': logbox, 'entries': page.locator('.log-entry').count()}
    geometry(page, label + ' logs')
    page.screenshot(path=str(output / f'logs-{label}.png'))
    page.locator('#log-panel [data-ui="logs"]').click()
    assert not page.locator('#log-panel .log-body').count()
    assert state(page) == before

    fixture(page, 'event')
    page.wait_for_selector('#panel[open] .choice-list')
    before = state(page)
    details['event'] = geometry(page, label + ' event')
    assert page.locator('#panel .choice').count() == 3
    details['event']['scroll_max'] = scroll_panel(page, label + ' event')
    page.keyboard.press('Escape')
    assert page.locator('#panel[open]').count(), 'Presentation made unread event dismissible'
    assert state(page) == before
    page.screenshot(path=str(output / f'event-{label}.png'))
    page.locator('#panel .choice').last.click()
    page.wait_for_selector('#panel[open] [data-act="ackResult"]')
    details['result'] = geometry(page, label + ' result')
    page.locator('[data-act="ackResult"]').click()
    page.wait_for_function('!document.querySelector("#panel").open')
    assert not errors, errors
    requested = {row['url'].rsplit('/', 1)[-1] for row in images}
    assert requested == {name + '-v2.png' for name in ART}, f'{label}: incomplete UI texture requests: {images}'
    assert all(row['status'] == (404 if missing else 200) for row in images), images
    context.close()
    print(f'PASS {label}: new/help/vehicle/inventory/regions/logs/event, scrolling and state boundaries', flush=True)
    return {'viewport': label, 'passed': True, 'missing_images': missing,
            'page_errors': errors, 'images': images, 'geometry': details}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Reuse an explicitly provided server without stopping it')
    parser.add_argument('--output', default='artifacts/wukong-ui')
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    if not output.is_relative_to(ROOT / 'artifacts'):
        parser.error('--output must be inside artifacts/')
    output.mkdir(parents=True, exist_ok=True)
    with local_server(args.url) as base, sync_playwright() as p:
        http = []
        for name in ART:
            path = f'art/ui/{name}-v2.png'
            with urlopen(base + path, timeout=15) as response:
                data = response.read()
                assert response.status == 200 and response.headers.get_content_type() == 'image/png'
                assert data.startswith(b'\x89PNG\r\n\x1a\n'), f'{path}: not PNG'
                http.append({'path': path, 'status': response.status, 'bytes': len(data)})
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        try:
            cases = [run_viewport(browser, base, output, w, h) for w, h in VIEWPORTS]
            cases += [run_viewport(browser, base, output, w, h, missing=True)
                      for w, h in [(1440, 1000), (320, 740)]]
        except Exception as error:
            evidence = {'error': str(error), 'pages': []}
            for context in browser.contexts:
                for page in context.pages:
                    viewport = page.viewport_size or {}
                    label = f'{viewport.get("width",0)}x{viewport.get("height",0)}'
                    page.screenshot(path=str(output / f'failure-{label}.png'))
                    evidence['pages'].append({'viewport': viewport, 'url': page.url})
            (output / 'failure.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf8')
            raise
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps({'http': http, 'cases': cases}, ensure_ascii=False, indent=2), encoding='utf8')
    print('4 viewports and 2 three-image 404 fallback cases passed', flush=True)


if __name__ == '__main__':
    main()
