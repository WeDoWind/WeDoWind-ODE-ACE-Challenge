"""Optional developer QA: pip install playwright; playwright install chromium.
No Python packages are needed to run the artwork itself.
Runs a temporary loopback server beneath the repository path prefix.
"""
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
FIELDS = ['wec_rotor_speed', 'wec_wind_speed', 'wec_active_power']

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def fixture(values=(6.2, 4.8, 214)):
    stamp = int(time.time() * 1000000)
    return {'series': {f: [v] for f, v in zip(FIELDS, values)},
            'series_quality': {f: ['Good'] for f in FIELDS},
            'series_observed_at': {f: [stamp] for f in FIELDS}}

def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT.parent)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/{ROOT.name}/site/creations/turbine-vortex/'
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1050})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        requests = []
        state = {'mode': 'valid'}

        def respond(route):
            requests.append(time.monotonic())
            if state['mode'] == 'offline':
                route.abort()
                return
            if state['mode'] == '429':
                route.fulfill(status=429, headers={'Retry-After': '5', 'Access-Control-Expose-Headers': 'Retry-After'}, body='rate limited')
                return
            data = fixture((0, 0, 0) if state['mode'] == 'zero' else (6.2, 4.8, 214))
            if state['mode'] == 'stale':
                data['series_observed_at'][FIELDS[1]] = [int((time.time() - 70) * 1000000)]
            if state['mode'] == 'invalid':
                data['series'][FIELDS[2]] = [None]
            route.fulfill(json=data)

        page.route('https://ace-api.duckdns.org/**', respond)
        page.goto(url)
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Live')")
        page.wait_for_timeout(1000)
        assert page.locator('#rpm').inner_text() == '6.20'
        page.evaluate("for(let i=0;i<30;i++) document.querySelector('#refresh').click()")
        page.wait_for_timeout(200)
        page.locator('#pause').click()
        page.wait_for_timeout(100)
        frozen = page.locator('canvas').evaluate('(c) => c.toDataURL()')
        page.wait_for_timeout(200)
        assert frozen == page.locator('canvas').evaluate('(c) => c.toDataURL()'), 'Pause did not stop motion'
        page.locator('#pause').click()
        page.locator('#pause').focus()
        page.keyboard.press('Tab')
        assert page.locator('#refresh').evaluate('b => b === document.activeElement')
        assert page.locator('#refresh').evaluate("b => getComputedStyle(b).outlineStyle") == 'solid'

        state['mode'] = 'stale'
        page.reload()
        requests.clear()  # A reload is a new running display with its own cooldown.
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Stale')")
        assert 'resting' in page.locator('#mode').inner_text()
        state['mode'] = 'invalid'
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Unavailable')")
        assert page.locator('#power').inner_text() == '214.0'
        state['mode'] = 'valid'
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Live')", timeout=15000)
        state['mode'] = 'offline'
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Unavailable')")
        state['mode'] = 'zero'
        page.wait_for_function("document.querySelector('#power').textContent === '0.0'", timeout=15000)
        assert page.locator('#status').inner_text().startswith('Live')
        state['mode'] = '429'
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Unavailable')")
        before = len(requests)
        limited_at = requests[-1]
        page.evaluate("for(let i=0;i<30;i++) document.querySelector('#refresh').click()")
        page.wait_for_timeout(200)
        state['mode'] = 'valid'
        page.wait_for_function("document.querySelector('#status').textContent.startsWith('Live')", timeout=15000)
        assert requests[before] - limited_at >= 4.9, f'Retry-After gap={requests[before] - limited_at:.3f}, gaps={[round(b-a,3) for a,b in zip(requests,requests[1:])]}'
        assert all(b - a >= 1.9 for a, b in zip(requests, requests[1:])), 'Requests too close'
        page.locator('#fullscreen').click()
        page.wait_for_function('document.fullscreenElement !== null')
        assert page.locator('.artwork').evaluate('el => Math.abs(el.getBoundingClientRect().height - innerHeight) < 2')
        page.screenshot(path=str(Path(tempfile.gettempdir()) / 'turbine-vortex-immersive-check.png'))
        page.locator('#fullscreen').click()
        page.wait_for_function('document.fullscreenElement === null')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(300)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
        page.screenshot(path=str(Path(tempfile.gettempdir()) / 'turbine-vortex-mobile-check.png'), full_page=True)
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function("document.querySelector('#pause').getAttribute('aria-pressed') === 'true'")
        assert page.locator('#pause').get_attribute('aria-pressed') == 'true'
        assert not errors, errors
        page.close()

        # Live browser verification and screenshot: no interception, no fixture readings.
        live = browser.new_page(viewport={'width': 1440, 'height': 1050})
        live.on('pageerror', lambda error: errors.append(str(error)))
        live.goto(url)
        live.wait_for_function("document.querySelector('#status').textContent.startsWith('Live')", timeout=30000)
        live.wait_for_timeout(8000)
        live.screenshot(path=str(ROOT / 'site/images/creations/turbine-vortex.png'), full_page=True)
        print('Live browser readings:', live.locator('.readings').inner_text())
        print('Screenshot:', ROOT / 'site/images/creations/turbine-vortex.png')
        assert not errors, errors
        browser.close()
    server.shutdown()
    print('PASS: prefix, live, immersion, narrow screen, focus, pause, reduced motion, zero, stale, invalid, offline, recovery, cooldown, Retry-After')

if __name__ == '__main__':
    run()
