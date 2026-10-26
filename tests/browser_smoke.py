"""Optional browser checks. Requires Python Playwright + Chromium and a server on :4173.

Run: python3 tests/browser_smoke.py /tmp/shampurik-artifacts
No browser policies, network policy, credentials or user profiles are changed.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
artifacts = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shampurik-artifacts')
artifacts.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path='/usr/bin/chromium',
        headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-crashpad-for-testing',
              '--single-process', '--no-zygote'],
    )
    try:
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:4173', wait_until='networkidle', timeout=20000)
        assert '397' in page.locator('#metric-revenue').inner_text()
        assert page.locator('#dish-table tr').count() == 6

        initial = page.locator('#metric-increase').inner_text()
        page.locator('#ingredient-pork').fill('700')
        page.locator('#ingredient-pork').press('Tab')
        assert page.locator('#metric-increase').inner_text() != initial
        updated = page.locator('#metric-increase').inner_text()
        page.locator('#ingredient-pork').fill('-1')
        page.locator('#ingredient-pork').press('Tab')
        assert page.locator('#status-message').get_attribute('role') == 'alert'
        assert page.locator('#metric-increase').inner_text() == updated
        page.locator('#reset-demo').click()
        assert page.locator('#metric-increase').inner_text() == initial

        page.locator('#food-cost-target').fill('50')
        page.locator('#food-cost-target').dispatch_event('input')
        assert page.locator('#target-value').inner_text() == '50'
        page.locator('#dish-search').fill('ничего-нет')
        assert page.locator('#dish-table tr').count() == 0
        assert page.locator('#empty-search').is_visible()
        page.locator('#dish-search').fill('куриц')
        assert page.locator('#dish-table tr').count() == 2

        with page.expect_download() as event:
            page.locator('#export-csv').click()
        csv_path = artifacts / 'demo-report.csv'
        event.value.save_as(csv_path)
        csv_text = csv_path.read_text(encoding='utf-8-sig')
        assert 'Шашлык из свинины' in csv_text and 'Это не чистая прибыль.' in csv_text

        page.locator('#import-json').set_input_files({
            'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{broken',
        })
        assert 'корректным JSON' in page.locator('#status-message').inner_text()
        assert '397' in page.locator('#metric-revenue').inner_text()
        data = json.loads((root / 'samples/mangal-demo.json').read_text())
        data['name'] = '<img src=x onerror="window._xss=1">'
        data['dishes'][0]['name'] = '<img src=x onerror="window._xss=1">'
        page.locator('#import-json').set_input_files({
            'name': 'test.json', 'mimeType': 'application/json',
            'buffer': json.dumps(data).encode(),
        })
        assert page.locator('#workspace-name').inner_text() == data['name']
        assert page.locator('img').count() == 0
        assert not page.evaluate('Boolean(window._xss)')
        assert 'вашего файла' in page.locator('.dataset-note').inner_text()

        page.locator('#reset-demo').click()
        page.locator('.pilot-banner [data-open-pilot]').click()
        assert page.locator('#pilot-dialog').is_visible()
        assert page.locator('#pilot-contact').get_attribute('href') == 'https://t.me/hambinst'
        page.keyboard.press('Escape')
        assert not page.locator('#pilot-dialog').is_visible()

        page.reload(wait_until='networkidle')
        page.screenshot(path=str(artifacts / 'demo-desktop.png'), full_page=True)
        page.pdf(path=str(artifacts / 'shampurik-demo-report.pdf'), format='A4', landscape=True, print_background=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(artifacts / 'demo-mobile.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow at 390px'
        page.set_viewport_size({'width': 320, 'height': 760})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow at 320px'
        assert not errors, errors
        print('Browser checks passed: calculations, validation, search, imports, XSS, CSV, modal, 390/320px, PDF.')
    finally:
        browser.close()
