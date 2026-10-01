"""Player appearance selection through real new-game, save and import controls.

python tests/browser-player-appearance.py --root public
All cases use isolated browser contexts, a subpath origin, real storage and the
real game clock. The harness only observes game state and DOM node identity.
It never edits gameplay resources, position, time or player saves.
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
APPEARANCES = ['male-rider', 'male-rider-steady']
CAPTURE = r'''addEventListener('DOMContentLoaded', () => {
  const G=NightCourier,render=G.CityMap.prototype.render,frame=G.GameClock.prototype.frame;
  G.CityMap.prototype.render=function(s){window.__appearanceMap=this;return render.call(this,s);};
  G.GameClock.prototype.frame=function(...args){window.__appearanceClock=this;return frame.apply(this,args);};
});
//# sourceURL=player-appearance-harness.js
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
            route.fulfill(json={'aiConfigured': False, 'message': 'Appearance test: AI unavailable'})
            return
        if not parsed.path.startswith('/daoist/'):
            route.fulfill(status=404, body='Not found')
            return
        relative = unquote(parsed.path).removeprefix('/daoist/') or 'index.html'
        target = (directory / relative).resolve()
        if (not target.is_relative_to(directory) or not target.is_file()
                or (missing and relative.startswith('art/') and relative.endswith('.png'))):
            route.fulfill(status=404, body='Not found')
            return
        headers = {'Content-Security-Policy': csp} if sandbox and relative == 'index.html' else {}
        route.fulfill(body=target.read_bytes(),
                      content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream',
                      headers=headers)
    page.route('**/*', handler)


def current(page):
    return page.evaluate('() => structuredClone(__appearanceMap.s)')


def snapshot(page):
    return page.evaluate('() => JSON.stringify(__appearanceMap.s)')


def stored(page):
    return page.evaluate('() => JSON.parse(localStorage.getItem(NightCourier.STORAGE_KEY)).saves')


def loaded(page, selector, count=1):
    page.wait_for_function('''({selector,count}) => {
      const images=[...document.querySelectorAll(selector)];
      return images.length===count&&images.every(img=>img.complete&&img.naturalWidth>0&&!img.hidden);
    }''', arg={'selector': selector, 'count': count})


def no_overflow(page, label):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{label}: page overflow'
    if page.locator('#panel[open]').count():
        for selector in ('#panel', '.panel-body', '#new-game-form'):
            locator = page.locator(selector)
            if locator.count():
                assert locator.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'{label}: {selector} overflow'


def reachable(locator, label):
    locator.scroll_into_view_if_needed()
    geometry = locator.evaluate('''el => {
      const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {width:b.width,height:b.height,top:b.top,bottom:b.bottom,
        inViewport:b.top>=0&&b.bottom<=innerHeight+1&&b.left>=0&&b.right<=innerWidth+1,
        hit:!!hit&&(hit===el||el.contains(hit))};
    }''')
    assert geometry['width'] >= 44 and geometry['height'] >= 44, f'{label}: small hit area {geometry}'
    assert geometry['inViewport'] and geometry['hit'], f'{label}: inaccessible control {geometry}'
    return geometry


def open_form(page, missing=False):
    page.locator('[data-ui="new-game"]').click()
    page.wait_for_selector('#new-game-form')
    radios = page.locator('#new-game-form input[name="appearanceId"]')
    assert radios.evaluate_all('(els) => els.map(el => el.value)') == APPEARANCES
    assert page.locator('input[name="appearanceId"][value="male-rider"]').is_checked()
    assert not page.locator('input[name="appearanceId"][value="male-rider-steady"]').is_checked()
    assert not page.locator('input[name="appearanceId"][value="female-rider"]').count(), 'Female appearance remains selectable'
    assert page.evaluate('NightCourier.Art.playerPortrait("female-rider")===null'), 'Removed female portrait remains whitelisted'
    assert page.locator('input[name="mode"][value="classic"]').is_checked()
    labels = []
    for appearance in APPEARANCES:
        radio = page.locator(f'input[name="appearanceId"][value="{appearance}"]')
        label = radio.locator('xpath=ancestor::label[1]')
        text = label.inner_text().strip()
        assert text, f'{appearance}: selection lost its readable label'
        reachable(label, f'{appearance} label')
        image = f'#new-game-form img[data-player-appearance="{appearance}"]'
        assert page.locator(image).count() == 1, f'{appearance}: selection lacks its own portrait'
        if not missing:
            loaded(page, image)
            expected = page.evaluate('(id) => NightCourier.Art.playerPortrait(id)', appearance)
            assert page.locator(image).get_attribute('src') == expected, f'{appearance}: incorrect whitelist art'
        labels.append(text)
    assert labels[0] != labels[1], 'Appearance choices have indistinguishable labels'
    no_overflow(page, 'appearance form')
    reachable(page.locator('#new-game-form button[type="submit"]'), 'create game')
    return labels


def select_with_keyboard(page, appearance):
    male = page.locator('input[name="appearanceId"][value="male-rider"]')
    male.focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('input[name="appearanceId"][value="male-rider-steady"]').is_checked(), 'ArrowRight did not select steady rider'
    page.keyboard.press('ArrowLeft')
    assert male.is_checked(), 'ArrowLeft did not restore default rider'
    if appearance == 'male-rider-steady':
        page.keyboard.press('ArrowRight')
    assert page.locator(f'input[name="appearanceId"][value="{appearance}"]').is_checked()


def create_game(page, name, appearance, mode, method='click', missing=False):
    open_form(page, missing)
    # Required-name validation must not create a partial save or discard choices.
    page.locator('#new-game-form button[type="submit"]').click()
    assert page.locator('#new-game-form').is_visible(), 'Empty name created a game'
    page.fill('#player-name-input', name)
    select_with_keyboard(page, appearance)
    page.check('input[name="mode"][value="ai"]')
    assert page.locator(f'input[name="appearanceId"][value="{appearance}"]').is_checked(), 'Mode selection reset appearance'
    page.check(f'input[name="mode"][value="{mode}"]')
    page.wait_for_timeout(180)
    assert page.input_value('#player-name-input') == name, 'Async UI refresh erased name'
    assert page.locator(f'input[name="appearanceId"][value="{appearance}"]').is_checked()
    if method == 'Enter':
        page.locator('#player-name-input').focus()
        page.keyboard.press('Enter')
    else:
        reachable(page.locator('#new-game-form button[type="submit"]'), 'create selected player')
        page.locator('#new-game-form button[type="submit"]').click()
    page.wait_for_selector('#game-screen:not([hidden])')
    page.wait_for_function('!!window.__appearanceMap && !!window.__appearanceClock')
    result = current(page)
    assert result['appearanceId'] == appearance and result['mode'] == mode and result['name'] == name
    assert not page.evaluate('__appearanceClock.paused'), 'New game failed to start its real clock'
    return result


def pause(page):
    if not page.evaluate('__appearanceClock.reasons.has("manual")'):
        page.locator('[data-ui="pause"]').click()
    page.wait_for_function('__appearanceClock.reasons.has("manual")')
    page.wait_for_timeout(150)


def close_panel(page):
    page.locator('#panel [data-ui="close"]').click()
    page.wait_for_function('!document.querySelector("#panel").open')


def assert_portraits(page, appearance, name, missing=False):
    selector = f'.avatar img[data-player-appearance="{appearance}"]'
    assert page.locator(selector).count() == 1
    if missing:
        page.wait_for_function('(selector) => document.querySelector(selector).complete', arg=selector)
        assert not page.locator(selector).is_visible(), 'Broken HUD image remains visible'
        assert name[0] in page.locator('.avatar').inner_text(), 'Missing HUD image lost name fallback'
    else:
        loaded(page, selector)
        expected = page.evaluate('(s) => NightCourier.Art.playerPortrait(s)', current(page))
        assert page.locator(selector).get_attribute('src') == expected
    assert page.locator('.player-name').inner_text() == name
    before = snapshot(page)
    page.locator('.identity[data-panel="character"]').click()
    page.wait_for_selector('#panel[open]')
    assert page.locator('#panel-title').inner_text() == name
    panel_image = f'#panel img[data-player-appearance="{appearance}"]'
    assert page.locator(panel_image).count() == 1, 'Character panel lacks chosen portrait'
    if missing:
        page.wait_for_function('(selector) => document.querySelector(selector).complete', arg=panel_image)
        assert not page.locator(panel_image).is_visible(), 'Broken character image remains visible'
    else:
        loaded(page, panel_image)
        assert page.locator(panel_image).get_attribute('src') == expected
        portrait_geometry = page.locator(panel_image).evaluate('''el => {
          const b=el.getBoundingClientRect();return {fit:getComputedStyle(el).objectFit,
            sourceRatio:el.naturalWidth/el.naturalHeight,boxRatio:b.width/b.height};
        }''')
        assert (portrait_geometry['fit'] == 'contain'
                or (portrait_geometry['fit'] == 'cover'
                    and abs(portrait_geometry['sourceRatio'] / portrait_geometry['boxRatio'] - 1) < .015)), \
            f'Character portrait is cropped: {portrait_geometry}'
    assert page.locator('[data-ui="export-current"]').is_enabled()
    no_overflow(page, 'character panel')
    assert snapshot(page) == before, 'Portrait UI changed paused gameplay state'
    close_panel(page)
    assert snapshot(page) == before, 'Closing portrait UI changed paused gameplay state'


def real_clock_and_stable_image(page, appearance):
    loaded(page, f'.avatar img[data-player-appearance="{appearance}"]')
    page.evaluate('window.__appearanceAvatar=document.querySelector(".avatar img")')
    before = current(page)
    page.wait_for_timeout(550)
    after = current(page)
    assert after['minutes'] > before['minutes'], 'The real game clock did not advance'
    assert after['appearanceId'] == appearance, 'Real clock changed cosmetic selection'
    assert after['player'] == before['player'] and after['vehicle'] == before['vehicle'], 'Idle portrait UI changed resources'
    assert after['position'] == before['position'] and after['location'] == before['location'], 'Idle portrait UI moved player'
    assert page.evaluate('__appearanceAvatar===document.querySelector(".avatar img")'), 'HUD refresh recreated player image every tick'


def roundtrip(page, appearance, name, mode):
    before = current(page)
    own_id = before['id']
    own_save = next(s for s in stored(page) if s['id'] == own_id)
    assert own_save['appearanceId'] == appearance and own_save['mode'] == mode
    page.locator('.identity[data-panel="character"]').click()
    with page.expect_download() as download_info:
        page.locator('[data-ui="export-current"]').click()
    download = download_info.value
    assert download.failure() is None
    exported_bytes = Path(download.path()).read_bytes()
    exported = json.loads(exported_bytes)
    assert len(exported['saves']) == 1
    assert exported['saves'][0]['appearanceId'] == appearance and exported['saves'][0]['mode'] == mode
    close_panel(page)
    page.locator('[data-ui="home"]').click()
    page.wait_for_selector('#start-screen:not([hidden])')
    count_before = len(stored(page))
    page.reload()
    page.wait_for_selector(f'[data-ui="load"][data-id="{own_id}"]')
    page.locator(f'[data-ui="load"][data-id="{own_id}"]').click()
    page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
    loaded_state = current(page)
    for key in ('appearanceId', 'name', 'mode', 'minutes', 'position', 'location', 'player', 'vehicle', 'stats', 'inventory'):
        assert loaded_state[key] == before[key], f'Reload changed {key}'
    assert_portraits(page, appearance, name)
    page.locator('[data-ui="home"]').click()
    page.locator('#import-file').set_input_files({'name': 'appearance-roundtrip.json',
                                                'mimeType': 'application/json', 'buffer': exported_bytes})
    page.wait_for_function('(count) => document.querySelectorAll(".save-card").length===count', arg=count_before + 1)
    imported = [s for s in stored(page) if s['id'] != own_id and s['name'] == name]
    assert len(imported) == 1, 'Import did not create one new copy'
    copy = imported[0]
    assert copy['id'] != own_id and copy['appearanceId'] == appearance and copy['mode'] == mode
    original = next(s for s in stored(page) if s['id'] == own_id)
    assert original['appearanceId'] == appearance and original['minutes'] == before['minutes'], 'Import overwrote original save'
    page.locator(f'[data-ui="load"][data-id="{copy["id"]}"]').click()
    page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
    for key in ('appearanceId', 'name', 'mode', 'minutes', 'position', 'location', 'player', 'vehicle', 'stats', 'inventory'):
        assert current(page)[key] == before[key], f'Import changed {key}'
    assert_portraits(page, appearance, name)
    page.locator('[data-ui="home"]').click()
    return {'appearance': appearance, 'mode': mode, 'export_import': True, 'reload_paused': True}


def run_viewport(browser, directory, output, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  has_touch=width < 600, is_mobile=width < 600, accept_downloads=True)
    page = context.new_page()
    requests, errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    serve(page, directory, requests)
    page.add_init_script(CAPTURE)
    page.goto(BASE)
    cases = []
    for appearance, mode, method in [('male-rider', 'classic', 'click'), ('male-rider-steady', 'ai', 'Enter')]:
        name = '青岚行者' if appearance == 'male-rider' else '稳行骑手'
        if appearance == 'male-rider':
            open_form(page)
            page.locator('.panel-body').evaluate('(el) => el.scrollTop=0')
            page.screenshot(path=str(output / f'new-game-{width}x{height}.png'))
            close_panel(page)
        create_game(page, name, appearance, mode, method)
        real_clock_and_stable_image(page, appearance)
        pause(page)
        assert_portraits(page, appearance, name)
        page.locator('.identity[data-panel="character"]').click()
        page.screenshot(path=str(output / f'{appearance}-{width}x{height}.png'))
        close_panel(page)
        cases.append(roundtrip(page, appearance, name, mode))
    assert not errors, errors
    assert not any(urlparse(r['url']).netloc != 'daoist.test' for r in requests), 'Appearance contacted an external image provider'
    assert not any('female-rider' in r['url'] for r in requests), 'Removed female artwork was requested'
    no_overflow(page, 'save list')
    context.close()
    print(f'PASS {width}x{height}: keyboard/click selection, real clock, stable HUD, save/reload/export/import', flush=True)
    return {'viewport': {'width': width, 'height': height}, 'cases': cases, 'page_errors': errors}


def resilience_case(browser, directory, output, missing=False, sandbox=False):
    context = browser.new_context(viewport={'width': 375, 'height': 812}, has_touch=True, is_mobile=True)
    page = context.new_page()
    requests, errors, blocked_forms = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: blocked_forms.append(message.text) if 'Blocked form submission' in message.text else None)
    serve(page, directory, requests, missing, sandbox)
    page.add_init_script(CAPTURE)
    page.goto(BASE)
    create_game(page, '雨巷行者', 'male-rider-steady', 'ai', 'Enter', missing)
    pause(page)
    assert_portraits(page, 'male-rider-steady', '雨巷行者', missing)
    if sandbox:
        assert page.locator('#storage-warning').is_visible(), 'Real CSP sandbox did not show storage fallback'
    no_overflow(page, 'resilient portrait')
    page.screenshot(path=str(output / ('missing-images.png' if missing else 'sandbox.png')))
    assert not errors, errors
    assert not blocked_forms, blocked_forms
    context.close()
    label = 'missing PNG fallback' if missing else 'real CSP sandbox'
    print(f'PASS {label}: appearance/name/mode retained, real controls usable', flush=True)
    return {'case': label, 'passed': True, 'page_errors': errors, 'blocked_forms': blocked_forms}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public')
    parser.add_argument('--output', default='artifacts/player-appearance')
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
            report = [run_viewport(browser, directory, output, w, h) for w, h in [(1440, 1000), (375, 812)]]
            report += [resilience_case(browser, directory, output, missing=True),
                       resilience_case(browser, directory, output, sandbox=True)]
        except Exception as error:
            evidence = {'error': str(error), 'pages': []}
            for context in browser.contexts:
                for page in context.pages:
                    viewport = page.viewport_size or {}
                    label = f'{viewport.get("width",0)}x{viewport.get("height",0)}'
                    page.screenshot(path=str(output / f'failure-{label}.png'))
                    evidence['pages'].append({'viewport': viewport, 'url': page.url,
                                              'panel': page.locator('#panel').inner_text()})
            (output / 'failure.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf8')
            raise
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('2 viewports and missing-image/CSP cases passed', flush=True)


if __name__ == '__main__':
    main()
