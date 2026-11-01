#!/usr/bin/env python3
"""Smoke + security test: WhatsApp clone (server + client).
Run: python3 smoke_test.py   (needs: npm install done, python3 playwright)
Checks: login with PIN, group + private message, private chat is not visible to a 3rd user,
wrong PIN cannot take someone's name, raw socket tricks don't leak data or crash the server,
HTML in a name doesn't run, no console errors."""
import os, sys, time, socket, subprocess, signal, tempfile, shutil
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
fails = []
def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok: fails.append(what)

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

# run on a temp copy so test data never touches the real data/ folder
work = tempfile.mkdtemp(prefix="wa_test_")
for item in ("server.js", "package.json", "public", "node_modules"):
    src = os.path.join(HERE, item)
    if os.path.isdir(src):
        if item == "node_modules": os.symlink(src, os.path.join(work, item))
        else: shutil.copytree(src, os.path.join(work, item))
    else: shutil.copy(src, work)
os.makedirs(os.path.join(work, "data"))
port = free_port()
log = open(os.path.join(work, "server.log"), "w")
srv = subprocess.Popen(["node", "server.js"], cwd=work, env={**os.environ, "PORT": str(port)},
                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
URL = f"http://127.0.0.1:{port}/"
try:
    for _ in range(50):
        try: socket.create_connection(("127.0.0.1", port), 0.2).close(); break
        except OSError: time.sleep(0.1)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        errs = []
        def page(name):
            p = b.new_context().new_page()
            p.on("pageerror", lambda e: errs.append(f"{name}: {e}"))
            p.on("console", lambda m: errs.append(f"{name}: {m.text}") if m.type == "error" else None)
            p.goto(URL); return p
        def login(p, name, pin):
            p.fill("#name-input", name); p.fill("#pin-input", pin); p.click("#login-form button")
            p.wait_for_timeout(600)
        A = page("alice"); login(A, "Alice", "1111")
        Bp = page("bob"); login(Bp, "Bob", "2222")
        check(A.is_hidden("#login") and Bp.is_hidden("#login"), "Alice + Bob login with PIN")
        A.fill("#msg-input", "hello group"); A.click(".send-btn"); Bp.wait_for_timeout(600)
        check("hello group" in Bp.inner_text("#messages"), "group message reaches Bob")
        A.click("#chat-list li:has-text('Bob')"); A.fill("#msg-input", "secret for bob"); A.click(".send-btn")
        Bp.wait_for_timeout(600); Bp.click("#chat-list li:has-text('Alice')"); Bp.wait_for_timeout(300)
        check("secret for bob" in Bp.inner_text("#messages"), "private message reaches Bob")
        A.wait_for_timeout(800)
        check("seen" in (A.inner_html("#messages")), "blue ticks (seen) come back to Alice")
        # attacker tries Bob's name with a wrong PIN
        E = page("eve"); login(E, "Bob", "9999")
        check(not E.is_hidden("#login") and "PIN" in E.inner_text("#login-error"), "wrong PIN cannot take Bob's name")
        # attacker as a new user: must not see the private chat
        login(E, "Eve", "3333")
        E.wait_for_timeout(500)
        hist = E.evaluate("JSON.stringify(Object.values(chats).flat().map(m=>m.text))")
        check("secret for bob" not in hist, "Eve (3rd user) cannot see Alice<->Bob private chat")
        # raw socket tricks from the browser console
        r = E.evaluate("""async () => {
            const s = io(); const got = [];
            s.on('history', h => got.push(...h)); s.on('chat message', m => got.push(m));
            s.emit('join', 'Bob');                      // old style, no PIN
            s.emit('join', {name:'Bob'});               // no PIN
            s.emit('chat message', {to:'Bob'});         // no text: server must not crash
            s.emit('chat message', 'x');
            s.emit('delivered', null); s.emit('seen', {}); s.emit('typing', null);
            await new Promise(r => setTimeout(r, 800));
            return JSON.stringify(got);
        }""")
        check("secret for bob" not in r, "socket join without PIN gets no history")
        check(srv.poll() is None, "server still running after bad input")
        # HTML in a name must not run
        X = page("xss"); login(X, "<img src=x onerror=window.pwn=1>", "4444")
        X.fill("#msg-input", "hi"); X.click(".send-btn"); A.click("#chat-list li >> nth=0"); A.wait_for_timeout(700)
        check(not A.evaluate("!!window.pwn"), "HTML/JS in a user name does not run")
        real = [e for e in errs if "favicon" not in e]
        check(not real, "no console errors " + (str(real[:3]) if real else ""))
        b.close()
finally:
    os.killpg(srv.pid, signal.SIGTERM); log.close()
    shutil.rmtree(work, ignore_errors=True)
print("RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILED")
sys.exit(1 if fails else 0)
