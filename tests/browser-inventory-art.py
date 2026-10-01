"""Item artwork, current inventory rules and four-view responsive regression.

python tests/browser-inventory-art.py
Uses the real createApp server, current sanitizer and G.perform. Browser
contexts are disposable and never read the user's browser profile or saves.
"""
import argparse
from html import escape
import importlib.util
import json
import os
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wukong_ui', ROOT / 'tests/browser-wukong-ui.py')
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)


def asset_gallery(browser, base, output, manifest, allow_missing=False):
    """Artifact-only contact sheet; artwork continues through the real server."""
    tiles = []
    for asset in manifest['assets']:
        source = escape('../../' + asset['path'], quote=True)
        tiles.append(f'''<article class="tile"><h2>{escape(asset['label'])}</h2>
          <p>{escape(asset['id'])}</p><div class="sizes">
          <figure><img src="{source}" width="128" height="128"><figcaption>128 px</figcaption></figure>
          <figure><img src="{source}" width="64" height="64"><figcaption>64 px</figcaption></figure>
          </div></article>''')
    markup = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
      <title>行囊物件原稿审查</title><style>
      *{box-sizing:border-box}body{margin:0;padding:24px;background:#141811;color:#e3d9bd;
        font:14px/1.5 "Microsoft YaHei",sans-serif}h1{margin:0 0 6px;font-size:28px}
      .note{margin:0 0 24px;color:#bbaa85}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
      .tile{border:1px solid #6c5d38;background:#20231a;padding:12px}.tile h2{margin:0;font-size:17px}
      .tile p{margin:3px 0 10px;font:11px/1.5 monospace;color:#bbaa85}
      .sizes{display:flex;gap:16px;align-items:flex-end}figure{margin:0;text-align:center}
      img{display:block;object-fit:contain;background:radial-gradient(circle,#33382a,#171b13);
        border:1px solid #4f4c36}figcaption{margin-top:4px;color:#bbaa85;font-size:11px}
      </style><h1>行囊物件 · 37 张独立原稿</h1>
      <p class="note">每项并排展示 128 px 缩略与 64 px 实际图标；仅用于制作审查，不属于游戏页面。</p>
      <main class="grid">''' + ''.join(tiles) + '</main></html>'
    (output / 'gallery.html').write_text(markup, encoding='utf8')
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page = context.new_page()
    served = markup.replace('src="../../public/', 'src="' + escape(base, quote=True))
    page.route('**/__inventory-gallery__.html', lambda route: route.fulfill(
        body=served, content_type='text/html; charset=utf-8'))
    page.goto(base + '__inventory-gallery__.html')
    page.wait_for_function('() => [...document.images].every(img=>img.complete)', timeout=30000)
    evidence = page.locator('.tile').evaluate_all('''tiles=>tiles.map(tile=>({
      id:tile.querySelector('p').textContent,label:tile.querySelector('h2').textContent,
      loaded:[...tile.querySelectorAll('img')].every(img=>img.naturalWidth===1254&&img.naturalHeight===1254)
    }))''')
    if not allow_missing:
        assert len(evidence) == 37 and all(row['loaded'] for row in evidence), evidence
    else:
        page.locator('img').evaluate_all('imgs=>imgs.forEach(img=>{if(!img.naturalWidth)img.style.visibility="hidden";})')
    page.screenshot(path=str(output / ('gallery-partial.png' if allow_missing else 'gallery.png')), full_page=True)
    context.close()
    return evidence


def load_all_images(page, missing):
    body = page.locator('.panel-body')
    size = body.evaluate('el=>({height:el.clientHeight,max:el.scrollHeight-el.clientHeight})')
    step = max(40, int(size['height'] * .7))
    for top in range(0, size['max'] + step, step):
        body.evaluate('(el,top)=>{el.scrollTop=top;}', top)
        page.wait_for_timeout(25)
    page.wait_for_function('''missing => [...document.querySelectorAll('img[data-item-art]')].every(
      img=>missing?img.hidden&&img.complete:img.complete&&img.naturalWidth===1254&&img.naturalHeight===1254
    )''', arg=missing, timeout=30000)


def all_fixture(page):
    ui.close_panel(page)
    page.locator('[data-ui="home"]').click()
    page.evaluate('''()=>{
      const G=NightCourier,key=G.STORAGE_KEY,index=JSON.parse(localStorage.getItem(key)),s=index.saves[0];
      s.player.realm=4;s.player.realmLevel=1;s.stats.delivered=60;s.stats.trained=1;
      s.flags.firstOrder=true;s.flags.systemAwakened=true;s.flags.storyStreetVein=true;s.claimed=['q1'];
      s.unlockedFeatures=G.FEATURE_UNLOCKS.map(f=>f.id);s.unlockNotices=[];
      s.pending=null;s.eventResult=null;s.placeUnlock=null;s.activity=null;s.activeOrder=null;
      s.unlockedPlaces=G.PLACES.filter(p=>p.permanent).map(p=>p.id);s.bonds.lu.met=true;
      for(const item of G.ITEMS.filter(i=>!i.unique))s.inventory[item.id]=9999;
      s.learned=G.TECHNIQUES.filter(t=>t.source==='system').map(t=>t.id);
      s.equipment=G.ITEMS.filter(i=>i.type==='equipment').map(i=>i.id);
      for(const d of G.SECTS){
        const v=G.sectState(s,d.id),manuals=G.TECHNIQUES.filter(t=>t.source===d.id).map(t=>t.id);
        const paid=d.ranks.slice(1,4).reduce((n,r)=>n+r.cost,0)+manuals.reduce((n,id)=>n+G.technique(id).cost,0);
        Object.assign(v,{invited:true,member:false,joinedAt:s.minutes,rank:3,earned:5000,
          contribution:5000-paid,completed:30,manuals});
        if(d.id!=='tingyu')s.sectWorld.stories[d.id]=[0];
      }
      index.saves[0]=G.sanitizeSave(s);
      localStorage.setItem(key,JSON.stringify(index));dispatchEvent(new StorageEvent('storage',{key}));
    }''')
    page.locator('[data-ui="load"]').first.click()
    page.wait_for_selector('#game-screen:not([hidden])')
    assert page.evaluate('__wukongClock.paused')


def card_evidence(page, missing):
    return page.locator('.inventory-card').evaluate_all('''(cards,missing)=>cards.map(card=>{
      const G=NightCourier,id=card.dataset.itemId,item=G.ITEMS.find(i=>i.id===id);
      const image=card.querySelector('img[data-item-art]'),fallback=card.querySelector('.inventory-art-fallback');
      const asset=G.Art.item(id),title=card.querySelector('.inventory-name');
      const count=card.querySelector('[data-item-count]'),tier=card.querySelector('[data-item-tier]');
      const expectedTier=item.tier||G.alchemyMaterial(id)?.tier;
      const box=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
      const textFits=el=>{const range=document.createRange();range.selectNodeContents(el);const b=range.getBoundingClientRect(),c=card.getBoundingClientRect();return b.left>=c.left-1&&b.right<=c.right+1;};
      return {id,name:item.name,type:item.type,title:title.textContent,
        titleFits:textFits(title),count:count?Number(count.dataset.itemCount):null,
        expectedCount:item.unique?null:__wukongMap.s.inventory[id],countFits:!count||textFits(count),
        tier:tier?Number(tier.dataset.itemTier):null,expectedTier:expectedTier||null,
        tierFits:!tier||textFits(tier),path:image?.getAttribute('src'),expectedPath:asset.path,
        key:asset.key,imageLoaded:image.complete&&image.naturalWidth>0,
        fallbackVisible:!fallback.hidden,imageHidden:image.hidden,
        decorative:image.getAttribute('alt')===''&&image.getAttribute('aria-hidden')==='true',
        pointerEvents:getComputedStyle(image).pointerEvents,artBox:box(card.querySelector('.inventory-art')),
        use:[...card.querySelectorAll('[data-act="use"]')].map(button=>({box:box(button)}))};
    })''', missing)


def use_initial_qi(page, label):
    # Expect the authoritative command's full deterministic result rather than
    # repeating its resource rules. updatedAt is a real wall-clock write stamp.
    expected = page.evaluate('''()=>{
      const G=NightCourier,before=G.clone(__wukongMap.s),r=G.perform(before,'use',{id:'qi'});
      if(!r.ok)throw new Error(r.error);
      delete r.state.updatedAt;return r.state;
    }''')
    page.locator('.inventory-card[data-item-id="qi"] [data-act="use"]').click()
    after = json.loads(ui.state(page))
    after.pop('updatedAt', None)
    assert after == expected, f'{label}: using initial pill disagrees with G.perform'
    assert not page.locator('.inventory-card[data-item-id="qi"]').count(), 'Consumed pill card remained'
    assert not page.locator('#game-nav [data-panel="bonds"]').count(), 'Item use disclosed unmet NPC'
    return {'inventory_qi': after['inventory']['qi'], 'qi': after['player']['qi'], 'authoritative_match': True}


def run_case(browser, base, output, width, height, missing=False):
    label = f'{width}x{height}' + ('-missing' if missing else '')
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  has_touch=width < 900, is_mobile=width < 600)
    page = context.new_page()
    errors, responses, portraits = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: portraits.append(request.url)
            if 'lin-office' in request.url or 'zhou-rider' in request.url else None)
    page.on('response', lambda response: responses.append({'url': response.url, 'status': response.status})
            if '/art/items/' in response.url else None)
    if missing:
        page.route('**/art/items/*.png', lambda route: route.fulfill(status=404, body='Not found'))
    page.add_init_script(ui.CAPTURE)
    page.goto(base)
    assert page.evaluate('localStorage.getItem(NightCourier.STORAGE_KEY)===null'), 'Non-isolated storage'
    page.locator('[data-ui="new-game"]').click()
    page.fill('#player-name-input', '行囊画卷')
    page.locator('#new-game-form button[type="submit"]').click()
    page.wait_for_selector('#game-screen:not([hidden])')
    page.wait_for_function('() => !!window.__wukongMap&&!!window.__wukongClock')
    page.locator('[data-ui="pause"]').click()
    before = ui.state(page)
    page.locator('#game-nav [data-panel="inventory"]').click()
    page.wait_for_selector('#panel[open] .inventory-card')
    assert page.locator('.inventory-card').count() == 3, 'Initial inventory was changed for artwork'
    assert page.evaluate('Object.values(__wukongMap.s.bonds).every(b=>!b.met)'), 'Initial art met an NPC'
    assert not portraits, 'Initial inventory requested an unmet NPC portrait'
    load_all_images(page, missing)
    initial = card_evidence(page, missing)
    ui.geometry(page, label + ' initial inventory')
    page.screenshot(path=str(output / f'initial-{label}.png'))
    assert ui.state(page) == before, 'Artwork or scrolling changed the new game'
    used = use_initial_qi(page, label)
    assert not portraits, 'Pill use requested an unmet NPC portrait'
    ui.close_panel(page)
    page.locator('#game-nav [data-panel="inventory"]').click()
    all_fixture(page)
    before = ui.state(page)
    page.locator('#game-nav [data-panel="inventory"]').click()
    page.wait_for_selector('#panel[open] .inventory-card')
    assert page.locator('.inventory-card').count() == 213, 'Full sanitized ownership fixture did not restore'
    load_all_images(page, missing)
    cards = card_evidence(page, missing)
    for card in initial + cards:
        assert card['name'] in card['title'] and card['titleFits'], f'{label}: title clipped: {card}'
        assert card['count'] == card['expectedCount'] and card['countFits'], f'{label}: quantity clipped/wrong: {card}'
        assert card['tier'] == card['expectedTier'] and card['tierFits'], f'{label}: tier clipped/wrong: {card}'
        assert card['path'] == card['expectedPath'] and card['decorative'], f'{label}: image lookup/semantics: {card}'
        assert card['pointerEvents'] == 'none', f'{label}: image consumes clicks: {card}'
        assert card['imageLoaded'] != missing and card['fallbackVisible'] == missing and card['imageHidden'] == missing, f'{label}: image/fallback: {card}'
        assert card['artBox']['width'] >= 40 and card['artBox']['height'] >= 40, f'{label}: unreadably small image'
        for button in card['use']:
            assert button['box']['width'] >= 44 and button['box']['height'] >= 44, f'{label}: pill use hit area too small'
    assert len({card['key'] for card in cards}) == 37, 'Full inventory did not use every authored image'
    assert len([card for card in cards if card['type'] == 'technique']) == 36
    assert len([card for card in cards if card['type'] == 'equipment']) == 2
    measured = ui.geometry(page, label + ' full inventory')
    for kind, expression in [('pills', '.inventory-card'),
                             ('herbs', '.inventory-card[data-item-id="herb"]'),
                             ('techniques', '.inventory-card[data-item-id="breathing"]'),
                             ('equipment', '.inventory-card[data-item-id="jade"]')]:
        page.locator(expression).first.scroll_into_view_if_needed()
        page.screenshot(path=str(output / f'{kind}-{label}.png'))
    page.keyboard.press('Escape')
    page.wait_for_function('() => !document.querySelector("#panel").open')
    assert ui.state(page) == before, 'Full inventory viewing changed paused gameplay'
    requested = {row['url'].rsplit('/', 1)[-1] for row in responses}
    assert len(requested) == 37, f'{label}: not all 37 images requested'
    assert all(row['status'] == (404 if missing else 200) for row in responses), responses
    assert not errors, errors
    assert not portraits, 'Inventory requested a portrait for an unmet character'
    context.close()
    print(f'PASS {label}: 213 items / 37 images, 36 techniques, quantities/tiers, G.perform use and fallback', flush=True)
    return {'viewport': label, 'passed': True, 'missing': missing, 'errors': errors,
            'initial': initial, 'cards': cards, 'use': used, 'responses': responses, 'geometry': measured}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url')
    parser.add_argument('--output', default='artifacts/inventory-art')
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    if not output.is_relative_to(ROOT / 'artifacts'):
        parser.error('--output must be inside artifacts/')
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'docs/item-prompts.json').read_text(encoding='utf8'))
    with ui.local_server(args.url) as base, sync_playwright() as p:
        http = []
        for asset in manifest['assets']:
            path = asset['path'].removeprefix('public/')
            with urlopen(base + path, timeout=15) as response:
                data = response.read()
                assert response.status == 200 and response.headers.get_content_type() == 'image/png'
                assert data.startswith(b'\x89PNG\r\n\x1a\n')
                http.append({'path': path, 'status': response.status, 'bytes': len(data)})
        options = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = p.chromium.launch(**options)
        try:
            gallery = asset_gallery(browser, base, output, manifest)
            cases = [run_case(browser, base, output, w, h) for w, h in ui.VIEWPORTS]
            cases += [run_case(browser, base, output, w, h, missing=True)
                      for w, h in [(1440, 1000), (320, 740)]]
        except Exception as error:
            (output / 'failure.json').write_text(json.dumps({'error': str(error)}, ensure_ascii=False, indent=2), encoding='utf8')
            for context in browser.contexts:
                for page in context.pages:
                    size = page.viewport_size
                    page.screenshot(path=str(output / f'failure-{size["width"]}x{size["height"]}.png'))
            raise
        finally:
            browser.close()
    (output / 'report.json').write_text(json.dumps({'http': http, 'gallery': gallery, 'cases': cases}, ensure_ascii=False, indent=2), encoding='utf8')
    print('4 viewports plus 2 complete item-image 404 cases passed', flush=True)


if __name__ == '__main__':
    main()
