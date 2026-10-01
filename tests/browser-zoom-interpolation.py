"""Real RAF zoom interpolation and pointer/touch regression in two viewports.

python tests/browser-zoom-interpolation.py --root public
Uses isolated new games, the real map renderer and a manually paused game clock.
"""
import argparse
import importlib.util
import json
import math
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
spec = importlib.util.spec_from_file_location('performance', ROOT / 'tests/browser-performance.py')
performance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(performance)

ZOOM_PROBE = r'''(() => {
  window.__zoomBegin = ({x, y, duration = 600}) => {
    const m = __perfMap, map = m.map, point = L.point(x, y);
    const anchor = map.containerPointToLatLng(point), start = performance.now();
    const before = JSON.stringify(m.s), rows = [];
    let created = 0;
    const original = m.baseOverlay.createTile;
    m.baseOverlay.createTile = function(...args) {
      created++;
      return original.apply(this, args);
    };
    const rect = selector => {
      const b = m.el.querySelector(selector).getBoundingClientRect();
      return {width: b.width, height: b.height};
    };
    const sample = () => {
      const p = map.latLngToContainerPoint(anchor);
      rows.push({ms: performance.now() - start, zoom: map.getZoom(),
        tileZoom: m.baseOverlay._tileZoom, created, anchorError: p.distanceTo(point),
        point: rect('.service-point .point-core'), hit: rect('.service-point .point-hit'),
        player: rect('.player-core')});
    };
    sample();
    window.__zoomResult = new Promise(resolve => {
      const frame = () => {
        sample();
        if (performance.now() - start < duration) requestAnimationFrame(frame);
        else {
          m.baseOverlay.createTile = original;
          resolve({rows, before, after: JSON.stringify(m.s),
            moving: !!m.moving, tween: !!m.zoomTween, final: map.getZoom()});
        }
      };
      requestAnimationFrame(frame);
    });
  };
})();
//# sourceURL=zoom-interpolation-harness.js
'''


def ready(page):
    page.wait_for_function('!__perfMap.baseOverlay.isLoading()', timeout=45000)
    page.wait_for_timeout(120)


def begin(page, x=None, y=None, duration=650):
    size = page.evaluate('() => ({width: __perfMap.el.clientWidth, height: __perfMap.el.clientHeight})')
    page.evaluate('options => __zoomBegin(options)', {
        'x': size['width'] / 2 if x is None else x,
        'y': size['height'] / 2 if y is None else y,
        'duration': duration,
    })


def result(page):
    return page.evaluate('window.__zoomResult')


def assert_interpolated(sample, label, anchor=True, output=None):
    try:
        return check_interpolated(sample, label, anchor)
    except AssertionError:
        directory = output or ROOT / 'artifacts/zoom-interpolation'
        directory.mkdir(parents=True, exist_ok=True)
        name = re.sub(r'[^a-zA-Z0-9_-]+', '-', label)
        (directory / f'{name}-failure.json').write_text(
            json.dumps(sample, ensure_ascii=False, indent=2), encoding='utf8')
        raise


def check_interpolated(sample, label, anchor=True):
    rows = sample['rows']
    start, end = rows[0]['zoom'], sample['final']
    assert abs(end - start) > .01, f'{label}: no zoom movement'
    low, high = sorted([start, end])
    intermediate = [r for r in rows if low + 1e-5 < r['zoom'] < high - 1e-5]
    assert len({round(r['zoom'], 6) for r in intermediate}) >= 3, f'{label}: missing intermediate RAF zoom values'
    assert all(low - 1e-7 <= r['zoom'] <= high + 1e-7 for r in rows), f'{label}: overshoot'
    direction = 1 if end > start else -1
    assert all(direction * (b['zoom'] - a['zoom']) >= -1e-7 for a, b in zip(rows, rows[1:])), f'{label}: zoom reversed'
    if anchor:
        assert max(r['anchorError'] for r in rows) <= 1, f'{label}: pointer anchor drift'
    for glyph, expected in [('point', 36), ('hit', 48), ('player', 30)]:
        for dimension in ('width', 'height'):
            assert max(abs(r[glyph][dimension] - expected) for r in rows) < .2, f'{label}: {glyph} changed screen size'
    assert all(r['created'] == 0 for r in intermediate), f'{label}: generated replacement tiles during interpolation'
    assert rows[-1]['tileZoom'] == math.floor(end + .5), f'{label}: final tile zoom not committed'
    assert not sample['moving'] and not sample['tween'], f'{label}: interpolation did not settle'
    assert sample['before'] == sample['after'], f'{label}: map zoom mutated paused gameplay'
    return {'intermediate_values': len({round(r['zoom'], 6) for r in intermediate}),
            'max_anchor_error_px': round(max(r['anchorError'] for r in rows), 4),
            'final_tile_zoom': rows[-1]['tileZoom'], 'tiles_created_at_endpoint': rows[-1]['created']}


def camera(page):
    return page.evaluate('() => {const m = __perfMap, c = m.map.getCenter(); return {zoom:m.map.getZoom(), lat:c.lat, lng:c.lng, tween:!!m.zoomTween};}')


def map_pointer(page):
    # Avoid an order, service marker or overlapping UI so a genuine double
    # click/drag tests the map camera without opening a gameplay panel.
    return page.evaluate('''() => {
      const m=__perfMap,b=m.el.getBoundingClientRect();
      for(const [rx,ry] of [[.37,.43],[.62,.38],[.41,.62],[.54,.51],[.26,.56]]) {
        const clientX=Math.round(b.x+b.width*rx),clientY=Math.round(b.y+b.height*ry);
        const x=clientX-b.x,y=clientY-b.y,target=document.elementFromPoint(clientX,clientY);
        if(target&&m.el.contains(target)&&!target.closest('[data-place],button'))
          return {x,y,clientX,clientY};
      }
      throw new Error('No clear map pointer location');
    }''')


def run_viewport(browser, directory, output, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  device_scale_factor=1, has_touch=True, is_mobile=width < 600)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    performance.serve(page, directory)
    page.add_init_script(performance.PROBE)
    page.add_init_script(ZOOM_PROBE)
    page.goto(performance.BASE)
    page.click('[data-ui="new-game"]')
    page.fill('#player-name-input', '缩放插值')
    page.click('#new-game-form button[type="submit"]')
    page.wait_for_selector('.player-marker')
    page.click('[data-ui="pause"]')
    page.wait_for_timeout(450)  # Let the initial order appearance animation finish.
    ready(page)
    before = page.evaluate('() => JSON.stringify(__perfMap.s)')
    checks = {}

    for direction in ('in', 'out'):
        begin(page)
        page.locator(f'[data-ui="zoom-{direction}"]').click()
        checks[f'button_{direction}'] = assert_interpolated(result(page), f'{width} button {direction}', output=output)
        ready(page)

    for key, direction, sign in [('Shift+Equal', 'plus', 1), ('Minus', 'minus', -1)]:
        # Focus the map container directly, leaving every place unselected.
        # Shift+Equal dispatches a genuine "+" key on Chromium's keyboard.
        page.locator('#city-map').focus()
        assert page.evaluate("document.activeElement.id === 'city-map'"), f'{width}: map did not receive keyboard focus'
        begin(page)
        page.keyboard.press(key)
        sample = result(page)
        checks[f'keyboard_{direction}'] = assert_interpolated(sample, f'{width} keyboard {direction}', output=output)
        assert abs(sample['final']-sample['rows'][0]['zoom']-sign*math.log2(1.2)) < 1e-7, f'{width}: keyboard zoom applied the wrong increment'
        assert not page.locator('#panel').evaluate('dialog => dialog.open'), f'{width}: keyboard zoom selected a place'
        ready(page)

    # A large zoom crosses integer tile levels while retaining one painted level
    # throughout the animation, including the overview/street style boundary.
    page.evaluate('() => {const m=__perfMap; m.map.setView(m.map.getCenter(), Math.log2(.4), {animate:false});}')
    ready(page)
    begin(page)
    page.evaluate('__perfMap.zoom(2.5)')
    checks['crossing_detail_threshold'] = assert_interpolated(result(page), f'{width} detail threshold', output=output)
    ready(page)

    # Real wheel events use a point away from the center, exercising the screen
    # point/LatLng distinction in Leaflet's setZoomAround interface.
    box = page.locator('#city-map').bounding_box()
    client_x, client_y = round(box['x']+box['width']*.37), round(box['y']+box['height']*.43)
    x, y = client_x-box['x'], client_y-box['y']
    page.mouse.move(client_x, client_y)
    begin(page, x, y, duration=800)
    page.mouse.wheel(0, -70)
    checks['wheel_pointer'] = assert_interpolated(result(page), f'{width} wheel', output=output)
    ready(page)

    for shift in (False, True):
        pointer = map_pointer(page)
        begin(page, pointer['x'], pointer['y'])
        if shift:
            page.keyboard.down('Shift')
        try:
            page.mouse.dblclick(pointer['clientX'], pointer['clientY'], delay=35)
        finally:
            if shift:
                page.keyboard.up('Shift')
        label = 'shift_double_click' if shift else 'double_click'
        checks[label] = assert_interpolated(result(page), f'{width} {label}', output=output)
        assert not page.locator('#panel').evaluate('dialog => dialog.open'), f'{width}: double click selected a place'
        ready(page)

    # Multiple inputs in one direction accumulate their complete requested
    # increments, rather than replacing an unfinished first increment.
    page.evaluate('() => {const m=__perfMap;m.map.setView(m.map.getCenter(), Math.log2(.7), {animate:false});}')
    ready(page)
    begin(page)
    page.evaluate('''() => {
      const m=__perfMap;
      window.__zoomCumulativeExpected=m.map.getZoom()+2*Math.log2(1.2);
      m.zoom(1.2);
      requestAnimationFrame(()=>requestAnimationFrame(()=>m.zoom(1.2)));
    }''')
    cumulative = result(page)
    assert abs(cumulative['final'] - page.evaluate('__zoomCumulativeExpected')) < 1e-7, f'{width}: same-direction input lost a zoom increment'
    checks['same_direction_accumulation'] = assert_interpolated(cumulative, f'{width} cumulative input', anchor=False, output=output)
    ready(page)

    # Opposite inputs arrive while the first animation is visibly progressing.
    reverse = page.evaluate('''() => new Promise(resolve => {
      const m=__perfMap, z=m.map.getZoom(), samples=[];
      m.zoom(1.25);
      let frames=0;
      const step=()=>{
        samples.push(m.map.getZoom());
        if (++frames === 3) {
          const mid=m.map.getZoom();m.zoom(.8);
          setTimeout(()=>resolve({start:z, mid, end:m.map.getZoom(), samples,
            tween:!!m.zoomTween, tileZoom:m.baseOverlay._tileZoom}), 300);
        } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    })''')
    assert reverse['mid'] > reverse['start'] + 1e-4, f'{width}: reverse input did not interrupt a visible animation'
    assert abs(reverse['end'] - (reverse['mid'] + math.log2(.8))) < 1e-7, f'{width}: opposite input did not retarget the displayed scale'
    assert reverse['end'] < reverse['mid'], f'{width}: reverse input continued toward the old target'
    assert not reverse['tween'] and reverse['tileZoom'] == math.floor(reverse['end'] + .5)
    checks['reverse_input'] = True
    ready(page)

    pointer = map_pointer(page)
    page.mouse.move(pointer['clientX'], pointer['clientY'])
    drag_target = page.evaluate('() => {const m=__perfMap,z=m.map.getZoom()+Math.log2(1.25);m.zoom(1.25);return z;}')
    page.mouse.down()
    interrupted = camera(page)
    assert not interrupted['tween'] and interrupted['zoom'] < drag_target-1e-4, f'{width}: mouse drag did not interrupt pending zoom'
    page.mouse.move(pointer['clientX']+32, pointer['clientY']+15, steps=4)
    page.mouse.up()
    page.wait_for_timeout(300)
    assert abs(camera(page)['zoom'] - interrupted['zoom']) < 1e-7, f'{width}: stale zoom resumed during drag'
    assert not page.locator('#panel').evaluate('dialog => dialog.open'), f'{width}: drag selected a place'
    checks['drag_cancels_animation'] = True
    ready(page)

    # Resize the actual map container while its tween is active. This runs the
    # browser's real ResizeObserver without a synthetic resize notification or
    # an artificial RAF clock, and keeps the viewport fixture reproducible.
    resized = page.evaluate('''() => new Promise((resolve,reject) => {
      const m=__perfMap,width=m.el.clientWidth,target=m.map.getZoom()+Math.log2(1.25);
      m.zoom(1.25);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const active=!!m.zoomTween;m.el.style.right='24px';const started=performance.now();
        const check=()=>{
          if(m.el.clientWidth!==width&&!m.zoomTween) {
            const c=m.map.getCenter();
            resolve({active,target,zoom:m.map.getZoom(),lat:c.lat,lng:c.lng,tween:!!m.zoomTween});
          } else if(performance.now()-started>2000) reject(new Error('Container resize did not cancel zoom'));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }));
    })''')
    assert resized['active'] and resized['zoom'] < resized['target']-1e-4, f'{width}: resize allowed the old target to finish'
    page.wait_for_timeout(300)
    settled = camera(page)
    assert all(abs(settled[k]-resized[k]) < 1e-7 for k in ('zoom','lat','lng')), f'{width}: stale zoom overwrote resized view'
    checks['resize_cancels_animation'] = True
    page.evaluate("__perfMap.el.style.right=''")
    ready(page)

    for action in ('fit', 'center'):
        cancelled = page.evaluate('''action => new Promise(resolve => {
          const m=__perfMap;m.zoom(1.25);
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            const active=!!m.zoomTween;m[action]();const c=m.map.getCenter();
            resolve({active, zoom:m.map.getZoom(), lat:c.lat, lng:c.lng, tween:!!m.zoomTween});
          }));
        })''', action)
        assert cancelled['active'] and not cancelled['tween'], f'{width}: {action} did not cancel the animation'
        page.wait_for_timeout(300)
        settled = camera(page)
        assert all(abs(settled[k] - cancelled[k]) < 1e-7 for k in ('zoom', 'lat', 'lng')), f'{width}: stale animation overwrote {action}'
        checks[f'{action}_cancels_animation'] = True
        ready(page)

    if width < 600:
        # Native two-finger movement follows its physical scale directly. It
        # should neither enqueue a wheel tween nor dispatch an order click.
        box = page.locator('#city-map').bounding_box()
        cx, cy = box['x'] + box['width'] * .5, box['y'] + box['height'] * .45
        cdp = context.new_cdp_session(page)
        initial = camera(page)['zoom']
        def touches(radius):
            return [{'id': 1, 'x': cx-radius, 'y': cy}, {'id': 2, 'x': cx+radius, 'y': cy}]
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': touches(30)})
        values = []
        for radius in (34, 40, 46, 52):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': touches(radius)})
            page.wait_for_timeout(35)
            values.append(camera(page)['zoom'])
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        page.wait_for_timeout(120)
        assert len({round(z, 6) for z in values}) >= 3 and values[-1] > initial + .4, 'Two-finger scaling lost continuous movement'
        assert not page.locator('#panel').evaluate('dialog => dialog.open'), 'Pinch dispatched a place click'
        assert not camera(page)['tween'], 'Pinch left a wheel/button tween running'
        assert page.evaluate('__perfMap.baseOverlay._tileZoom') == math.floor(camera(page)['zoom'] + .5)
        checks['native_pinch_no_click'] = True
        ready(page)

    page.emulate_media(reduced_motion='reduce')
    reduced = page.evaluate('''() => {
      const m=__perfMap,start=m.map.getZoom(),target=Math.min(m.map.getMaxZoom(),start+Math.log2(1.25));
      m.zoom(1.25);return {target, zoom:m.map.getZoom(), tween:!!m.zoomTween};
    }''')
    assert abs(reduced['zoom'] - reduced['target']) < 1e-7 and not reduced['tween'], 'Reduced motion did not apply zoom immediately'
    page.wait_for_timeout(250)
    assert abs(camera(page)['zoom'] - reduced['target']) < 1e-7
    checks['reduced_motion_immediate'] = True
    assert page.evaluate('() => JSON.stringify(__perfMap.s)') == before, 'Paused gameplay changed during camera-only interactions'
    assert not errors, errors
    output.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output / f'{width}x{height}.png'))
    context.close()
    return {'viewport': f'{width}x{height}', 'checks': checks, 'page_errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='public')
    parser.add_argument('--output', default='artifacts/zoom-interpolation')
    args = parser.parse_args()
    directory = (ROOT / args.root).resolve()
    output = (ROOT / args.output).resolve()
    if not output.is_relative_to(ROOT / 'artifacts'):
        parser.error('--output must be inside artifacts/')
    with sync_playwright() as p:
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        try:
            report = [run_viewport(browser, directory, output, w, h) for w, h in [(1440, 1000), (375, 812)]]
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print('2 viewports: interpolated buttons/keyboard/wheel/double click, fixed markers, stable anchors, tile reuse, input accumulation/reversal, camera/drag/resize cancellation, pinch and reduced motion passed')


if __name__ == '__main__':
    main()
