const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 }); // bahut bada data bhej ke server hang na kare
const PORT = process.env.PORT || 3000;

// data kahan save hoga (DATA_DIR env se badal sakte ho)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('File padh nahi paye:', file, e.message);
  }
  return fallback;
}
function saveJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // aadha likha file kabhi nahi bachega
}

// online users: socket.id -> naam
const users = {};

// ---- messages ko file mein save karna ----
const DATA_FILE = path.join(DATA_DIR, 'messages.json');
let messages = loadJSON(DATA_FILE, []);
function saveMessages() {
  messages = messages.slice(-2000);
  saveJSON(DATA_FILE, messages);
}

// ---- SECURITY: har naam ka apna PIN (password) ----
// Pehli baar jo naam + PIN banata hai, wahi naam uska ho jata hai.
// PIN seedha save nahi hota — sirf uska hash (scrypt + salt) save hota hai.
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
let accounts = loadJSON(ACCOUNTS_FILE, {});
const saveAccounts = () => saveJSON(ACCOUNTS_FILE, accounts);

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}
function checkPin(name, pin) {
  const acc = accounts[name];
  if (!acc) return false;
  const a = Buffer.from(hashPin(pin, acc.salt), 'hex');
  const b = Buffer.from(acc.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// "Rahul" aur "rahul" ek hi naam maana jayega (koi nakli Rahul na bane)
function findAccount(name) {
  const low = name.toLowerCase();
  return Object.keys(accounts).find((n) => n.toLowerCase() === low);
}

// ---- Login yaad rakhna (page reload pe dobara PIN na maange) ----
// Browser ko ek random token milta hai; server pe sirf uska hash save hota hai.
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
let sessions = loadJSON(SESSIONS_FILE, {}); // sha256(token) -> { name, exp }
const SESSION_DAYS = 30;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function newSession(name) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  for (const k in sessions) if (sessions[k].exp < now) delete sessions[k]; // purane hatao
  sessions[sha(token)] = { name, exp: now + SESSION_DAYS * 864e5 };
  saveJSON(SESSIONS_FILE, sessions);
  return token;
}

// ---- Rate limit: galat PIN baar baar try karne walon ko rokna (brute force) ----
function limiter(max, windowMs) {
  const hits = new Map(); // key -> [timestamps]
  const recent = (key) => (hits.get(key) || []).filter((t) => Date.now() - t < windowMs);
  // limit(key): ek try gino; limit khatam ho gayi to false
  const limit = (key) => {
    const list = recent(key);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(Date.now());
    hits.set(key, list);
    return true;
  };
  limit.blocked = (key) => recent(key).length >= max; // sirf dekho, gino mat
  setInterval(() => { for (const k of hits.keys()) if (!recent(k).length) hits.delete(k); }, windowMs).unref();
  return limit;
}
const loginPerIp = limiter(60, 10 * 60 * 1000);   // ek IP se 10 min mein 60 login try
const signupPerIp = limiter(20, 60 * 60 * 1000);  // ek IP se 1 ghante mein 20 naye account
const failPerName = limiter(5, 60 * 1000);        // ek naam pe 1 min mein 5 galat PIN
const msgPerSocket = limiter(20, 10 * 1000);      // 10 second mein 20 message (spam nahi)
const typingPerSocket = limiter(30, 10 * 1000);

function ipOf(socket) {
  const h = socket.handshake.headers;
  const fwd = (h['cf-connecting-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || socket.handshake.address;
}

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,19}$/u; // sirf letters, numbers, space . _ -
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const roomOf = (name) => 'u:' + name; // har user ka apna private room

function onlineUsers() {
  return [...new Set(Object.values(users))];
}
function sendPeople() {
  io.to('members').emit('online users', onlineUsers());
  io.to('members').emit('contacts', Object.keys(accounts));
}

// ---- HTTP: sirf public/ folder ki files, upar se security headers ----
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// user login ho gaya: room join karo, history bhejo
function enter(socket, name) {
  const old = users[socket.id];
  if (old) socket.leave(roomOf(old)); // pehle wale naam ke messages ab nahi aayenge
  users[socket.id] = name;
  socket.join(roomOf(name));
  socket.join('members');
  sendPeople();
  // sirf apni chats: group + jo mujhe aaye + jo maine bheje
  const myHistory = messages.filter((m) => m.to === 'group' || m.to === name || m.from === name);
  socket.emit('history', myHistory);
}

io.on('connection', (socket) => {
  const ip = ipOf(socket);

  socket.on('join', (data, reply) => {
    const done = typeof reply === 'function' ? reply : () => {};
    const raw = data && typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
    const pin = data && typeof data.pin === 'string' ? data.pin : '';
    if (!NAME_RE.test(raw) || raw.toLowerCase() === 'group') {
      return done({ ok: false, error: 'Naam sahi nahi hai (1-20 letters/numbers)' });
    }
    if (pin.length < 4 || pin.length > 30) return done({ ok: false, error: 'PIN kam se kam 4 digit ka rakho' });
    if (!loginPerIp(ip)) return done({ ok: false, error: 'Bahut zyada try. Thodi der baad try karo' });

    let name = findAccount(raw);
    if (!name) {
      if (!signupPerIp(ip)) return done({ ok: false, error: 'Bahut naye account. 1 ghante baad try karo' });
      name = raw;
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[name] = { salt, hash: hashPin(pin, salt), created: Date.now() };
      saveAccounts();
    } else {
      if (failPerName.blocked(name)) return done({ ok: false, error: 'Bahut galat PIN. 1 minute baad try karo' });
      if (!checkPin(name, pin)) {
        failPerName(name); // galti gino
        return done({ ok: false, error: 'Ye naam kisi aur ka hai ya PIN galat hai' });
      }
    }
    done({ ok: true, name, token: newSession(name) });
    enter(socket, name);
  });

  // page reload / internet wapas aaya: token se login
  socket.on('resume', (token, reply) => {
    const done = typeof reply === 'function' ? reply : () => {};
    if (typeof token !== 'string' || token.length !== 64) return done({ ok: false });
    if (!loginPerIp(ip + '#resume')) return done({ ok: false, error: 'Thodi der baad try karo' });
    const s = sessions[sha(token)];
    if (!s || s.exp < Date.now() || !accounts[s.name]) return done({ ok: false });
    done({ ok: true, name: s.name });
    enter(socket, s.name);
  });

  socket.on('logout', (token) => {
    if (typeof token === 'string') {
      const k = sha(token);
      if (sessions[k] && sessions[k].name === users[socket.id]) {
        delete sessions[k];
        saveJSON(SESSIONS_FILE, sessions);
      }
    }
    const name = users[socket.id];
    if (name) socket.leave(roomOf(name));
    socket.leave('members');
    delete users[socket.id];
    sendPeople();
  });

  socket.on('chat message', (data, ack) => {
    const done = typeof ack === 'function' ? ack : () => {};
    const name = users[socket.id]; // naam hamesha server se, client se nahi
    if (!name || !data || !isText(data.text, 1000) || typeof data.to !== 'string') return done(null);
    if (data.to !== 'group' && !accounts[data.to]) return done(null); // anjaan user ko nahi
    if (!msgPerSocket(socket.id)) return done(null);
    const msg = {
      id: Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      from: name,
      to: data.to,
      text: data.text.trim(),
      time: Date.now(),
      status: 'sent',
    };
    messages.push(msg);
    saveMessages();

    if (msg.to === 'group') {
      socket.to('members').emit('chat message', msg); // sirf login wale users
    } else {
      socket.to(roomOf(msg.to)).emit('chat message', msg);
      if (msg.to !== name) socket.to(roomOf(name)).emit('chat message', msg); // mera doosra phone/tab
    }
    done(msg); // sender ko: server tak pahunch gaya (ek tick)
  });

  socket.on('delivered', (id) => {
    const me = users[socket.id];
    if (!me || typeof id !== 'string') return;
    const msg = messages.find((m) => m.id === id);
    // sirf wahi "delivered" bol sakta hai jisko message aaya
    if (msg && (msg.to === me || (msg.to === 'group' && msg.from !== me))) updateStatus(msg, 'delivered');
  });

  socket.on('seen', (friend) => {
    const me = users[socket.id];
    if (!me || typeof friend !== 'string') return;
    messages
      .filter((m) => m.from === friend && m.to === me && m.status !== 'seen')
      .forEach((m) => updateStatus(m, 'seen'));
  });

  socket.on('typing', (data) => {
    const name = users[socket.id];
    if (!name || !data || typeof data.to !== 'string' || !typingPerSocket(socket.id)) return;
    const info = { from: name, to: data.to, typing: !!data.typing };
    if (data.to === 'group') socket.to('members').emit('typing', info);
    else if (accounts[data.to]) socket.to(roomOf(data.to)).emit('typing', info);
  });

  socket.on('disconnect', () => {
    delete users[socket.id];
    sendPeople();
  });
});

let saveTimer = null;
function updateStatus(msg, status) {
  const order = ['sent', 'delivered', 'seen'];
  if (order.indexOf(status) <= order.indexOf(msg.status)) return;
  msg.status = status;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveMessages, 300); // bahut baar file na likhe
  io.to(roomOf(msg.from)).emit('status', { id: msg.id, status });
}

server.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
