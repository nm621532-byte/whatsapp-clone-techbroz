const { io } = require('socket.io-client');
const [BASE, A, B, C, PIN_C] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, what) => console.log((ok ? 'PASS ' : 'FAIL ') + what);
const conn = () => io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
const ask = (s, ev, data) => new Promise((r) => { s.emit(ev, data, r); setTimeout(() => r('timeout'), 6000); });
(async () => {
  // 1) unauthenticated socket must not receive anything
  const anon = conn(); const seen = [];
  anon.onAny((ev, d) => seen.push(ev));
  await new Promise((r) => anon.on('connect', r));
  check(anon.io.engine.transport.name === 'websocket', 'raw websocket transport connects');
  // 2) C logs in, tries IDOR tricks
  const c = conn(); const cgot = [];
  c.onAny((ev, d) => cgot.push([ev, d]));
  await new Promise((r) => c.on('connect', r));
  const res = await ask(c, 'join', { name: C, pin: PIN_C });
  check(res && res.ok, 'C raw login ok');
  await sleep(500);
  const hist = cgot.find((x) => x[0] === 'history');
  const bad = hist ? hist[1].filter((m) => m.to !== 'group' && m.from !== C && m.to !== C) : ['nohist'];
  check(hist && bad.length === 0, 'history has no one else\'s private msgs ' + JSON.stringify(bad).slice(0, 300));
  c.emit('seen', A); c.emit('seen', B);
  c.emit('delivered', '1-abc'); c.emit('delivered', { $ne: 1 });
  c.emit('typing', { to: B, typing: true });
  const r1 = await ask(c, 'chat message', { to: 'nobody_xyz', text: 'hi' });
  check(r1 === null, 'message to unknown user refused');
  const r2 = await ask(c, 'chat message', { to: 'group', text: { a: 1 } });
  check(r2 === null, 'non-string message refused');
  const r3 = await ask(c, 'chat message', { to: 'group', text: 'x'.repeat(5000) });
  check(r3 === null, 'oversized message refused');
  // join with garbage
  const g = await ask(c, 'join', { name: '<script>alert(1)</script>', pin: '1234' });
  check(g && !g.ok, 'HTML/script name refused at signup');
  const g2 = await ask(c, 'join', null);
  check(g2 && !g2.ok, 'null join refused, server alive');
  const rs = await ask(c, 'resume', 'f'.repeat(64));
  check(rs && !rs.ok, 'forged session token refused');
  // 3) brute force PIN on A (other socket)
  const x = conn(); await new Promise((r) => x.on('connect', r));
  let locked = false;
  for (let i = 0; i < 7; i++) {
    const rr = await ask(x, 'join', { name: A, pin: '00' + i + '0' });
    if (rr && rr.error && rr.error.includes('minute')) locked = true;
  }
  check(locked, 'PIN brute force locked after 5 wrong tries');
  // 4) flood
  let refused = 0;
  for (let i = 0; i < 25; i++) { const m = await ask(c, 'chat message', { to: C, text: 'f' + i }); if (m === null) refused++; }
  check(refused >= 4, `message flood rate-limited (${refused}/25 refused)`);
  await sleep(500);
  check(seen.length === 0, 'unauthenticated socket received nothing (' + seen.join(',') + ')');
  // HTTP: data files not reachable
  for (const pth of ['data/messages.json', 'data/accounts.json', 'server.js', '../data/accounts.json', 'socket.io/?EIO=4&transport=polling']) {
    const resp = await fetch(BASE + pth);
    const t = await resp.text();
    if (pth.startsWith('socket.io')) continue;
    check(resp.status === 404 || !/salt|hash|require\(/.test(t), `HTTP ${pth} not exposed (${resp.status})`);
  }
  anon.close(); c.close(); x.close();
  console.log('ATTACK_DONE');
  process.exit(0);
})().catch((e) => { console.log('FAIL attack crashed ' + e); process.exit(1); });
