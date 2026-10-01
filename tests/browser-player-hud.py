"""Circular half-body player portrait and live status HUD at narrow viewports.

python tests/browser-player-hud.py --root public
Uses isolated contexts, real RAF/game clock/storage and actual UI commands.
The unlocked-resource scene loads an explicit schema-validated test fixture.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('appearance_browser', ROOT / 'tests/browser-player-appearance.py')
APPEARANCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APPEARANCE)
VIEWPORTS = [(1440, 1000), (375, 812), (812, 375), (320, 568)]
LONG_NAME = '青岚城里认真送达每一份热饭的人'
RESOURCE_KEYS = [('气血', 'health', 'health'), ('体力', 'stamina', 'stamina'),
                 ('灵力', 'mana', 'mana'), ('电量', 'battery', 'battery')]


def assert_resources(page, cultivation=False):
    state = APPEARANCE.current(page)
    caps = page.evaluate('(s) => NightCourier.limits(s)', state)
    rows = page.locator('.player-hud .resource-row .resource')
    assert rows.count() == 4, 'Left player HUD does not contain the four status resources'
    evidence = []
    previous_y = None
    for index, (label, key, cap_key) in enumerate(RESOURCE_KEYS):
        row = rows.nth(index)
        value = state['vehicle']['battery'] if key == 'battery' else state['player'][key]
        maximum = caps[cap_key]
        assert row.locator('.resource-name').inner_text() == label
        assert row.locator('.resource-value').inner_text() == f'{int(value + 1e-8)}/{maximum}', f'{label}: text differs from engine'
        progress = row if row.get_attribute('role') == 'progressbar' else row.locator('[role="progressbar"]')
        assert progress.count() == 1, f'{label}: lacks a unique semantic progressbar'
        assert float(progress.get_attribute('aria-valuemin')) == 0
        assert float(progress.get_attribute('aria-valuemax')) == maximum, f'{label}: incorrect semantic maximum'
        assert float(progress.get_attribute('aria-valuenow')) == int(value + 1e-8), f'{label}: semantic value differs from engine'
        width = row.locator('.resource-track i').evaluate('(el) => parseFloat(el.style.width)')
        expected_width = min(100, value / maximum * 100)
        assert abs(width - expected_width) < .02, f'{label}: bar differs from engine ({width} vs {expected_width})'
        visible = row.is_visible()
        assert visible == (cultivation or key != 'mana'), f'{label}: visibility bypasses actual cultivation gate'
        if visible:
            assert row.locator('.resource-track').is_visible(), f'{label}: narrow-screen CSS removed status bar'
            geometry = row.bounding_box()
            track = row.locator('.resource-track').bounding_box()
            assert track['width'] >= 12 and track['height'] >= 12, f'{label}: status track is thinner than the readable HUD design'
            value_geometry = row.locator('.resource-value').evaluate('''el=>{
              const box=el.getBoundingClientRect(),track=el.parentElement.querySelector('.resource-track').getBoundingClientRect();
              const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();
              const bounds=b=>({left:b.left,right:b.right,top:b.top,bottom:b.bottom});
              return {box:bounds(box),text:bounds(text),track:bounds(track)};
            }''')
            for part in ('box', 'text'):
                bounds, enclosing = value_geometry[part], value_geometry['track']
                assert bounds['left'] >= enclosing['left'] - 1 and bounds['right'] <= enclosing['right'] + 1 \
                    and bounds['top'] >= enclosing['top'] - 1 and bounds['bottom'] <= enclosing['bottom'] + 1, \
                    f'{label}: {part} numeric value extends outside its status bar: {value_geometry}'
            if previous_y is not None:
                assert geometry['y'] > previous_y, 'Status resources are not stacked beside the portrait'
            previous_y = geometry['y']
        evidence.append({'label': label, 'value': value, 'maximum': maximum, 'percent': width, 'visible': visible})
    return evidence


def luminance(rgb):
    channels = [value / 255 for value in rgb]
    linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
              for value in channels]
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]


def contrast(first, second):
    high, low = sorted([luminance(first), luminance(second)], reverse=True)
    return (high + .05) / (low + .05)


def assert_hud_visuals(page):
    # Check the computed palette relationships and contrast, not particular
    # hex colors. The gradient endpoints bound the range used by this design.
    visual = page.evaluate(r'''()=>{
      const colors=css=>[...css.matchAll(/rgba?\(([^)]+)\)/g)].map(match=>
        match[1].split(/[,\s/]+/).filter(Boolean).slice(0,3).map(Number));
      const hud=document.querySelector('.player-hud'),style=getComputedStyle(hud),
        ink=getComputedStyle(hud.querySelector('.player-name')).color;
      return {paper:colors(style.backgroundImage),ink:colors(ink)[0],
        frame:style.borderStyle,innerFrame:getComputedStyle(hud,'::before').borderStyle,
        rows:[...hud.querySelectorAll('.resource')].map(row=>{
          const fill=getComputedStyle(row.querySelector('.resource-track i')),
            track=getComputedStyle(row.querySelector('.resource-track')),
            text=getComputedStyle(row.querySelector('.resource-value')),
            label=getComputedStyle(row.querySelector('.resource-name'));
          return {name:row.querySelector('.resource-name').textContent,
            fill:colors(fill.backgroundImage),track:colors(track.backgroundColor)[0],
            text:colors(text.color)[0],label:colors(label.color)[0],shadow:text.textShadow};
        })};
    }''')
    assert len(visual['paper']) >= 2, 'Player HUD lacks its paper-colored gradient background'
    assert all(luminance(color) > .4 for color in visual['paper']), 'Player HUD paper background is too dark'
    assert luminance(visual['ink']) < .2, 'Player identity does not use readable dark ink'
    visual['name_contrast'] = min(contrast(visual['ink'], paper) for paper in visual['paper'])
    assert visual['name_contrast'] >= 4.5, f'Player name lacks contrast against paper: {visual}'
    assert visual['frame'] == 'solid' and visual['innerFrame'] == 'solid', 'Paper HUD lost its double frame'
    first_colors = []
    for row in visual['rows']:
        assert row['fill'], f'{row["name"]}: missing colored fill gradient'
        first_colors.append(row['fill'][0])
        row['label_contrast'] = min(contrast(row['label'], paper) for paper in visual['paper'])
        row['value_contrast'] = min(contrast(row['text'], background)
                                    for background in row['fill'] + [row['track']])
        assert row['label_contrast'] >= 4.5, f'{row["name"]}: dark resource label lacks paper contrast: {row}'
        assert row['value_contrast'] >= 4.5, f'{row["name"]}: centered numeric value lacks fill contrast: {row}'
    assert len({tuple(color) for color in first_colors}) == 4, 'Four resources have indistinguishable fill colors'
    red, green, blue, gold = first_colors
    assert red[0] > red[1] and red[0] > red[2], f'Health bar does not use a red-dominant palette: {red}'
    assert green[1] > green[0] and green[1] > green[2], f'Stamina bar does not use a green-dominant palette: {green}'
    assert blue[2] > blue[0] and blue[2] > blue[1], f'Mana bar does not use a blue-dominant palette: {blue}'
    assert gold[0] > gold[1] > gold[2], f'Battery bar does not use a gold-dominant palette: {gold}'
    return visual


def assert_portrait(page, appearance, missing=False):
    selector = f'.player-hud .player-portrait-button .avatar img[data-player-appearance="{appearance}"]'
    image = page.locator(selector)
    assert image.count() == 1, 'Left HUD does not show this save\'s selected portrait'
    frame = page.locator('.player-hud .avatar').evaluate('''el=>{
      const box=el.getBoundingClientRect(),style=getComputedStyle(el),button=el.closest('button'),
        buttonBox=button.getBoundingClientRect(),buttonStyle=getComputedStyle(button);
      const corners=css=>['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(key=>css[key]);
      return {width:box.width,height:box.height,radii:corners(style),overflowX:style.overflowX,
        overflowY:style.overflowY,buttonWidth:buttonBox.width,buttonHeight:buttonBox.height,
        buttonRadii:corners(buttonStyle)};
    }''')
    assert abs(frame['width'] - frame['height']) < .5, f'HUD portrait frame is not square: {frame}'
    assert abs(frame['buttonWidth'] - frame['buttonHeight']) < .5, f'HUD portrait border is not square: {frame}'
    for radii, size in [(frame['radii'], frame['width']), (frame['buttonRadii'], frame['buttonWidth'])]:
        for radius in radii:
            for axis in radius.split():
                circular = (axis.endswith('%') and float(axis[:-1]) >= 50) \
                    or (axis.endswith('px') and float(axis[:-2]) >= size / 2 - .5)
                assert circular, f'HUD portrait border is not circular: {frame}'
    assert frame['overflowX'] in ('hidden', 'clip') and frame['overflowY'] in ('hidden', 'clip'), \
        f'Circular frame does not crop overflowing portrait artwork: {frame}'
    assert frame['width'] >= 64 and frame['height'] >= 64, f'Half-body portrait remains too small: {frame}'
    if page.viewport_size['width'] >= 1100:
        assert frame['width'] >= 90, f'Desktop half-body portrait is too small: {frame}'
    if missing:
        page.wait_for_function('(selector) => document.querySelector(selector).complete', arg=selector)
        assert not image.is_visible(), 'Broken portrait remains visible'
        assert page.locator('.player-hud .avatar-fallback').is_visible(), 'Missing art lost readable name fallback'
    else:
        APPEARANCE.loaded(page, selector)
        geometry = image.evaluate('''el=>{
          const b=el.getBoundingClientRect(),avatar=el.closest('.avatar').getBoundingClientRect();
          return {fit:getComputedStyle(el).objectFit,position:getComputedStyle(el).objectPosition,width:b.width,height:b.height,
            avatarWidth:avatar.width,avatarHeight:avatar.height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight};
        }''')
        assert geometry['fit'] == 'cover', f'Half-body HUD does not fill its circular frame: {geometry}'
        assert geometry['position'] == '50% 0%', f'HUD crop does not preserve the top-centered head: {geometry}'
        assert abs(geometry['width'] - geometry['height']) < .5, f'HUD image does not fill a square circle: {geometry}'
        assert geometry['width'] >= geometry['avatarWidth'] - 2.1 and geometry['height'] >= geometry['avatarHeight'] - 2.1, \
            f'Half-body image does not fill its circular frame: {geometry}'
        assert abs(geometry['naturalWidth'] / geometry['naturalHeight'] - .75) < .01, \
            f'HUD changed the original 3:4 portrait asset instead of cropping it in CSS: {geometry}'
        expected = page.evaluate('(id) => NightCourier.Art.playerPortrait(id)', appearance)
        assert image.get_attribute('src') == expected
    assert page.locator('.player-hud .identity').get_attribute('data-panel') == 'character'
    assert page.locator('.player-hud .player-portrait-button').get_attribute('data-panel') == 'character'


def layout(page, label):
    APPEARANCE.no_overflow(page, label)
    boxes = page.evaluate('''()=>{
      const read=selector=>{
        const el=document.querySelector(selector),b=el?.getBoundingClientRect();
        if(!b)return {selector,visible:false};const css=getComputedStyle(el);
        return {selector,x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,
          visible:!el.hidden&&css.display!=='none'&&css.visibility!=='hidden'&&b.width>0&&b.height>0};
      };
      return ['#game-header','.player-hud','.player-hud .resource-row','.map-stage',
        '.map-controls','#map-caption','#game-nav','#action-bar','[data-ui="pause"]',
        '.clock-wrap','.currency-group','.header-home'].map(read);
    }''')
    by_selector = {box['selector']: box for box in boxes}
    header = by_selector['#game-header']
    hud = by_selector['.player-hud']
    assert hud['visible'] and hud['x'] < page.viewport_size['width'] * .25, 'Player portrait HUD is not on the left'
    assert hud['bottom'] <= header['bottom'] + 1, f'{label}: portrait/status spill below header'
    assert by_selector['.map-stage']['y'] >= header['bottom'] - 1, f'{label}: map begins behind tall portrait header'
    for selector in ('.map-controls', '#map-caption', '#game-nav', '#action-bar'):
        other = by_selector[selector]
        assert other['visible'], f'{label}: {selector} was hidden'
        assert other['y'] >= header['bottom'] - 1, f'{label}: header obscures {selector}: {boxes}'
        assert other['bottom'] <= page.viewport_size['height'] + 1, f'{label}: {selector} outside viewport'
    for first, second in [('#map-caption', '#action-bar'), ('.map-controls', '#action-bar'), ('.map-controls', '#game-nav'),
                          ('#action-bar', '#game-nav'), ('.player-hud', '.clock-wrap'),
                          ('.player-hud', '.currency-group'), ('.clock-wrap', '.header-home')]:
        a, b = by_selector[first], by_selector[second]
        if not a['visible'] or not b['visible']:
            continue
        overlap_x = min(a['right'], b['right']) - max(a['x'], b['x'])
        overlap_y = min(a['bottom'], b['bottom']) - max(a['y'], b['y'])
        assert overlap_x <= 1 or overlap_y <= 1, f'{label}: {first} overlaps {second}: {boxes}'
    selectors = ['.player-portrait-button[data-panel="character"]', '.identity[data-panel="character"]', '[data-ui="pause"]', '#time-speed',
                 '[data-ui="home"]', '.region-chip', '.location-chip',
                 '[data-ui="zoom-in"]', '[data-ui="zoom-out"]', '[data-ui="locate"]', '[data-ui="fit-map"]']
    for selector in selectors:
        locator = page.locator(selector)
        hit = locator.evaluate('''el=>{
          const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          return {width:b.width,height:b.height,x:b.x,y:b.y,right:b.right,bottom:b.bottom,
            own:!!hit&&(hit===el||el.contains(hit)),hit:hit?.id||hit?.className||hit?.tagName};
        }''')
        assert locator.is_visible() and hit['width'] > 0 and hit['height'] > 0, f'{label}: {selector} invisible'
        assert hit['own'], f'{label}: {selector} click point is covered: {hit}'
        assert hit['x'] >= -1 and hit['y'] >= -1 and hit['right'] <= page.viewport_size['width'] + 1 \
            and hit['bottom'] <= page.viewport_size['height'] + 1, f'{label}: {selector} outside viewport: {hit}'
    help_button = page.locator('#game-nav [data-panel="help"]')
    help_button.scroll_into_view_if_needed()
    hit = help_button.evaluate('''el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return !!hit&&(hit===el||el.contains(hit));}''')
    assert hit, f'{label}: scrollable navigation help is covered'
    return boxes


def controls_and_live_nodes(page, appearance):
    before = APPEARANCE.snapshot(page)
    page.locator('#time-speed').focus()
    page.keyboard.press('ArrowDown')
    page.keyboard.press('Tab')
    assert page.locator('#time-speed').input_value() == '3', 'Native time-speed keyboard selection failed'
    assert page.evaluate('__appearanceClock.speed') == 3
    assert APPEARANCE.snapshot(page) == before, 'Changing paused UI speed mutated world state'
    page.evaluate('''window.__hudNodes={avatar:document.querySelector('.avatar img'),
      rows:[...document.querySelectorAll('.resource-row .resource')],
      tracks:[...document.querySelectorAll('.resource-track')],speed:document.querySelector('#time-speed')};''')
    page.locator('[data-ui="pause"]').click()
    page.wait_for_function('!__appearanceClock.paused')
    start = APPEARANCE.current(page)
    page.wait_for_timeout(420)
    APPEARANCE.pause(page)
    end = APPEARANCE.current(page)
    assert end['minutes'] > start['minutes'], 'Pause/resume failed to advance the real game clock'
    assert page.evaluate('''()=>__hudNodes.avatar===document.querySelector('.avatar img')
      &&__hudNodes.speed===document.querySelector('#time-speed')
      &&__hudNodes.rows.every((node,i)=>node===document.querySelectorAll('.resource-row .resource')[i])
      &&__hudNodes.tracks.every((node,i)=>node===document.querySelectorAll('.resource-track')[i])'''), 'Live HUD refresh recreated portrait/status/select nodes'
    assert_portrait(page, appearance)
    APPEARANCE.assert_portraits(page, appearance, end['name'])
    return {'real_minutes': end['minutes'] - start['minutes'], 'node_identity_preserved': True}


def real_travel_resource_update(page, cultivation=False, screenshot=None):
    target = page.evaluate('''()=>{
      const G=NightCourier,s=__appearanceMap.s;
      return s.orders.map(o=>({o,plan:G.travelPlan(s,o.target)}))
        .filter(({o,plan})=>!G.travelBlock(s,plan)&&plan.minutes>2
          &&(o.condition!=='mystic'||s.player.mana>=8)
          &&(o.condition!=='careful'||s.player.stamina-plan.stamina>=10))
        .sort((a,b)=>b.plan.minutes-a.plan.minutes)[0]?.o.target;
    }''')
    assert target, 'No real affordable route available for HUD resource synchronization'
    page.locator(f'.order-point[data-place="{target}"]').focus()
    page.keyboard.press('Enter')
    page.locator('[data-act="deliver"]').click()
    page.wait_for_function('!!__appearanceMap.s.activity')
    before = APPEARANCE.current(page)
    page.locator('[data-ui="pause"]').click()
    page.wait_for_timeout(450)
    APPEARANCE.pause(page)
    after = APPEARANCE.current(page)
    assert after['stats']['distance'] > before['stats']['distance'], 'HUD route test did not move along a real route'
    assert after['player']['stamina'] < before['player']['stamina'], 'Real route did not consume stamina'
    assert after['vehicle']['battery'] < before['vehicle']['battery'], 'Real route did not consume battery'
    fractional = {key: value for key, value in [('stamina', after['player']['stamina']),
                                               ('battery', after['vehicle']['battery'])]
                  if abs(value - round(value)) > 1e-6}
    assert fractional, 'Real travel did not produce fractional resources for the stable-width boundary'
    rows = assert_resources(page, cultivation=cultivation)
    layout(page, 'real travel')
    stability = paused_fill_stability(page)
    if screenshot:
        page.screenshot(path=str(screenshot))
    if page.locator('[data-act="stop"]:visible').count():
        page.locator('[data-act="stop"]').click()
    return {'meters': after['stats']['distance'] - before['stats']['distance'], 'resources': rows,
            'fractional_resources': fractional, 'paused_fill_stability': stability}


def paused_fill_stability(page):
    # Observe only the four resource fills. Repeated writes of the same serialized
    # CSS width still produce mutation records, so equality of final width is not
    # sufficient evidence that stable renderLive ticks avoided redundant writes.
    assert page.evaluate('__appearanceClock.reasons.has("manual")'), 'Stable-fill probe must remain manually paused'
    before = APPEARANCE.snapshot(page)
    page.evaluate('''()=>{
      const fills=[...document.querySelectorAll('.player-hud .resource-track i')];
      const probe=window.__hudFillProbe={fills,writes:[],observers:[],rafSamples:0,
        before:fills.map(el=>el.getAttribute('style')),active:true,request:null};
      for(const [index,fill] of fills.entries()){
        const observer=new MutationObserver(records=>{
          for(const record of records)probe.writes.push({index,old:record.oldValue,
            current:record.target.getAttribute('style')});
        });
        observer.observe(fill,{attributes:true,attributeFilter:['style'],attributeOldValue:true});
        probe.observers.push(observer);
      }
      const sample=()=>{if(!probe.active)return;probe.rafSamples++;probe.request=requestAnimationFrame(sample);};
      probe.request=requestAnimationFrame(sample);
    }''')
    page.wait_for_timeout(620)
    evidence = page.evaluate('''()=>{
      const p=__hudFillProbe;p.active=false;cancelAnimationFrame(p.request);
      p.observers.forEach(observer=>observer.disconnect());
      return {writes:p.writes,raf_samples:p.rafSamples,before:p.before,
        after:p.fills.map(el=>el.getAttribute('style'))};
    }''')
    assert evidence['raf_samples'] >= 3, 'Paused-fill probe did not observe real browser frames'
    assert APPEARANCE.snapshot(page) == before, 'Stable-fill probe changed manually paused gameplay'
    assert not evidence['writes'], f'Unchanged fractional resources rewrote fill style on stable live ticks: {evidence}'
    assert evidence['after'] == evidence['before'], 'Stable live ticks changed fractional resource widths'
    return evidence


def unlocked_resource_fixture(page, appearance):
    # Explicit test scene, not a progression shortcut or player-save migration.
    if page.locator('#panel[open]').count():
        APPEARANCE.close_panel(page)
    page.locator('[data-ui="home"]').click()
    fixture_id = page.evaluate('''appearance=>{
      const G=NightCourier,s=G.newGame('状态条专项隔离场景','classic',20261001,appearance);
      s.stats.delivered=60;s.stats.trained=1;s.flags.firstOrder=true;s.flags.systemAwakened=true;
      s.player.realm=4;s.player.realmLevel=1;s.claimed=['q1'];
      s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);s.unlockNotices=[];
      s.player.health=77;s.player.stamina=63;s.player.mana=23;s.vehicle.battery=31;
      s.pending=null;s.eventResult=null;s.placeUnlock=null;s.activity=null;s.activeOrder=null;
      const clean=G.sanitizeSave(s),store=G.createStore(localStorage);store.load();
      const result=store.upsert(clean);if(!result.ok)throw new Error(result.error);
      dispatchEvent(new StorageEvent('storage',{key:G.STORAGE_KEY}));return clean.id;
    }''', appearance)
    page.locator(f'[data-ui="load"][data-id="{fixture_id}"]').click()
    page.wait_for_selector('#game-screen[data-paused="true"]:not([hidden])')
    assert page.evaluate('NightCourier.featureUnlocked(__appearanceMap.s,"cultivation")'), 'Fixture did not unlock actual cultivation rule'
    before = APPEARANCE.snapshot(page)
    rows = assert_resources(page, cultivation=True)
    visual = assert_hud_visuals(page)
    geometry = layout(page, 'four unlocked status bars')
    page.locator('#game-nav [data-panel="help"]').click()
    page.wait_for_selector('#panel[open]')
    assert APPEARANCE.snapshot(page) == before, 'Full navigation changed paused fixture'
    APPEARANCE.close_panel(page)
    assert APPEARANCE.snapshot(page) == before
    return {'resources': rows, 'visual': visual, 'layout': geometry}


def run_viewport(browser, directory, output, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  has_touch=width < 1100, is_mobile=width < 600)
    page = context.new_page()
    requests, errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    APPEARANCE.serve(page, directory, requests)
    page.add_init_script(APPEARANCE.CAPTURE)
    page.goto(APPEARANCE.BASE)
    evidence = {'viewport': {'width': width, 'height': height}, 'appearances': []}
    for appearance in APPEARANCE.APPEARANCES:
        APPEARANCE.create_game(page, LONG_NAME, appearance, 'classic')
        APPEARANCE.pause(page)
        assert page.locator('.player-name').inner_text() == LONG_NAME
        assert_portrait(page, appearance)
        resources = assert_resources(page)
        visual = assert_hud_visuals(page)
        geometry = layout(page, f'{appearance} long name')
        if appearance == 'male-rider':
            page.evaluate('window.__hudContainer=document.querySelector(".avatar")')
        else:
            assert page.evaluate('__hudContainer===document.querySelector(".avatar")'), 'Switching saves recreated the HUD outer portrait container'
        live = controls_and_live_nodes(page, appearance)
        page.screenshot(path=str(output / f'{appearance}-{width}x{height}.png'))
        travel = real_travel_resource_update(page,
            screenshot=output / f'travel-{appearance}-{width}x{height}.png')
        evidence['appearances'].append({'id': appearance, 'resources': resources, 'visual': visual, 'layout': geometry,
                                        'live': live, 'travel': travel})
        page.locator('[data-ui="home"]').click()
    # Load through the real current-schema store to test all four visible bars.
    APPEARANCE.create_game(page, '状态条场景起点', 'male-rider', 'classic')
    APPEARANCE.pause(page)
    evidence['unlocked'] = unlocked_resource_fixture(page, 'male-rider-steady')
    page.screenshot(path=str(output / f'unlocked-resources-{width}x{height}.png'))
    if width >= 1100:
        page.locator('.player-hud').screenshot(path=str(output / 'hud-preview.png'))
    evidence['unlocked_travel'] = real_travel_resource_update(page, cultivation=True,
        screenshot=output / f'unlocked-travel-{width}x{height}.png')
    assert not errors, errors
    evidence['page_errors'] = errors
    context.close()
    print(f'PASS {width}x{height}: circular half-body portraits, long name, live status/controls, no occlusion, real route resources', flush=True)
    return evidence


def missing_image_case(browser, directory, output):
    context = browser.new_context(viewport={'width': 375, 'height': 812}, has_touch=True, is_mobile=True)
    page = context.new_page()
    requests, errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    APPEARANCE.serve(page, directory, requests, missing=True)
    page.add_init_script(APPEARANCE.CAPTURE)
    page.goto(APPEARANCE.BASE)
    APPEARANCE.create_game(page, '雨巷行者', 'male-rider-steady', 'classic', missing=True)
    APPEARANCE.pause(page)
    assert_portrait(page, 'male-rider-steady', missing=True)
    assert_resources(page)
    assert_hud_visuals(page)
    layout(page, 'missing portrait fallback')
    APPEARANCE.assert_portraits(page, 'male-rider-steady', '雨巷行者', missing=True)
    page.screenshot(path=str(output / 'missing-image-fallback.png'))
    assert not errors, errors
    context.close()
    print('PASS missing portrait fallback: status bars, name and controls remain available', flush=True)
    return {'case': 'missing portrait fallback', 'passed': True, 'page_errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public')
    parser.add_argument('--output', default='artifacts/player-hud')
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
            report = [run_viewport(browser, directory, output, w, h) for w, h in VIEWPORTS]
            report.append(missing_image_case(browser, directory, output))
        except Exception as error:
            evidence = {'error': str(error), 'pages': []}
            for context in browser.contexts:
                for page in context.pages:
                    viewport = page.viewport_size or {}
                    label = f'{viewport.get("width",0)}x{viewport.get("height",0)}'
                    page.screenshot(path=str(output / f'failure-{label}.png'))
                    evidence['pages'].append({'viewport': viewport, 'url': page.url,
                                              'header': page.locator('#game-header').inner_text(),
                                              'panel': page.locator('#panel').inner_text()})
            (output / 'failure.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf8')
            raise
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('4 viewports and missing-image case passed', flush=True)


if __name__ == '__main__':
    main()
