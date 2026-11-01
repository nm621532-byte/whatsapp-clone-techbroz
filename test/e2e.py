#!/usr/bin/env python3
"""2-user smoke + security test. Usage: python3 e2e.py <base_url> [screenshot.png]"""
import sys, time, random, string, json, subprocess, os
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip('/') + '/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
HERE = os.path.dirname(os.path.abspath(__file__))
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what, flush=True)
    if not ok: fails.append(what)
suf = ''.join(random.choice(string.digits) for _ in range(4))
A, B, C = 'Asha' + suf, 'Bilal' + suf, 'Chotu' + suf
PIN_A, PIN_B, PIN_C = '4821', '7390', '1111'
phone = dict(bypass_csp=True, viewport={'width': 412, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True,
             user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')

with sync_playwright() as p:
    br = p.chromium.launch()
    errs = []
    def newpage():
        ctx = br.new_context(**phone)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('dialog', lambda d: (errs.append('DIALOG ' + d.message), d.dismiss()))
        return ctx, pg
    def login(pg, name, pin):
        pg.goto(BASE)
        pg.wait_for_selector('#name-input', state='visible', timeout=20000)
        pg.fill('#name-input', name); pg.fill('#pin-input', pin); pg.click('#login-btn')
    def open_chat(pg, title):
        if pg.is_visible('#back-btn'): pg.click('#back-btn')
        full = 'Dosti Group 🔥' if title == 'Dosti Group' else title
        pg.locator(f".chat-item:has(.name:text-is('{full}'))").first.click()
    ca, a = newpage(); cb, b = newpage()
    r = a.goto(BASE); check(r.status == 200, f'page loads 200 ({r.status})')
    check('nosniff' in (r.headers.get('x-content-type-options') or ''), 'security headers present')
    login(a, A, PIN_A); a.wait_for_selector('#login', state='hidden', timeout=15000)
    check(a.inner_text('#my-name') == A, 'A signed up + logged in')
    login(b, B, PIN_B); b.wait_for_selector('#login', state='hidden', timeout=15000)
    check(b.inner_text('#my-name') == B, 'B signed up + logged in')
    transport = a.evaluate('socket.io.engine.transport.name')
    print('transport:', transport)
    time.sleep(1)
    # group + typing
    open_chat(a, 'Dosti Group'); open_chat(b, 'Dosti Group')
    a.type('#msg-input', 'hel', delay=80)
    try:
        b.wait_for_function(f"document.querySelector('#chat-status').textContent.includes('{A} typing')", timeout=5000); ok = True
    except Exception: ok = False
    check(ok, 'typing indicator shows in group (B sees "A typing...")')
    a.fill('#msg-input', 'Hello group ' + suf); a.press('#msg-input', 'Enter')
    b.wait_for_selector(f".msg.in .text:text('Hello group {suf}')", timeout=8000)
    check(True, 'group message A -> B delivered live')
    check(b.locator('.msg.in .sender').last.inner_text() == A, 'group message shows sender name')
    try:
        a.wait_for_function("[...document.querySelectorAll('.msg.out .tick')].pop().textContent === '✓✓'", timeout=5000); ok = True
    except Exception: ok = False
    check(ok, 'A sees double tick (delivered) on group message')
    # private chat B -> A
    open_chat(b, A)
    b.type('#msg-input', 'se', delay=80)
    try:
        a.wait_for_function("document.querySelector('#chat-list').innerText.includes('typing')", timeout=5000); ok = True
    except Exception: ok = False
    check(ok, 'typing indicator shows for private chat (A chat list)')
    b.fill('#msg-input', 'Secret hi ' + suf); b.press('#msg-input', 'Enter')
    b.wait_for_selector('.msg.out .tick', timeout=5000)
    a.wait_for_function(f"document.querySelector('#chat-list').innerText.includes('Secret hi {suf}')", timeout=8000)
    check(a.locator(f".chat-item:has(.name:text-is('{B}')) .badge").count() == 1, 'A sees unread badge for private msg')
    open_chat(a, B)
    try:
        b.wait_for_function("[...document.querySelectorAll('.msg.out .tick')].pop().classList.contains('seen')", timeout=6000); ok = True
    except Exception: ok = False
    check(ok, 'B sees blue ticks after A opens chat (seen)')
    # XSS
    a.fill('#msg-input', '<img src=x onerror=alert(1)><b>bold</b>'); a.press('#msg-input', 'Enter')
    b.wait_for_selector(".msg.in .text:has-text('<img src=x')", timeout=8000)
    check(b.locator('.msg img, .msg b').count() == 0, 'HTML in message shown as text (no XSS)')
    if SHOT:
        time.sleep(0.5); b.screenshot(path=SHOT)
        b.click('#back-btn'); time.sleep(0.4); b.screenshot(path=SHOT.replace('.png', '_list.png'))
    # reload persists
    a.reload()
    try:
        a.wait_for_function(f"document.querySelector('#my-name').textContent === '{A}' && document.querySelector('#login').classList.contains('hidden')", timeout=15000)
    except Exception: pass
    check(a.inner_text('#my-name') == A, 'reload: A still logged in (session token)')
    open_chat(a, B)
    a.wait_for_selector(f".msg .text:text('Secret hi {suf}')", timeout=8000)
    check(True, 'reload: private history persists')
    open_chat(a, 'Dosti Group')
    a.wait_for_selector(f".msg .text:text('Hello group {suf}')", timeout=8000)
    check(True, 'reload: group history persists')
    # 3rd user
    cc, c = newpage()
    login(c, A.lower(), '9999'); c.wait_for_function("document.querySelector('#login-error').textContent.length > 0", timeout=8000)
    check(c.is_visible('#login'), 'wrong PIN (and case-variant name) cannot take A\'s name')
    login(c, C, PIN_C); c.wait_for_selector('#login', state='hidden', timeout=15000)
    time.sleep(1)
    body = c.evaluate("JSON.stringify(chats)")
    check(('Secret hi ' + suf) not in body and ('Hello group ' + suf) in body, 'C sees group history but NOT the A<->B private chat')
    # fresh logout removes session
    c.click('#back-btn') if c.is_visible('#back-btn') else None
    c.click('#logout-btn'); c.wait_for_selector('#login', state='visible', timeout=5000)
    c.reload(); c.wait_for_selector('#login', state='visible', timeout=10000)
    check(True, 'logout clears session (login shown after reload)')
    real = [e for e in errs if 'favicon' not in e]
    check(not real, 'no page errors / dialogs: ' + '; '.join(real[:3]))
    br.close()

# raw socket attacks (node + socket.io-client)
out = subprocess.run(['node', os.path.join(HERE, 'attack.js'), BASE, A, B, C, PIN_C], capture_output=True, text=True, timeout=90)
print(out.stdout.strip()); print(out.stderr.strip()[-800:])
for line in out.stdout.splitlines():
    if line.startswith('FAIL'): fails.append(line)
if 'ATTACK_DONE' not in out.stdout: fails.append('attack script did not finish')
print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL: {fails}')
print('USERS', A, B, C)
sys.exit(1 if fails else 0)
