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

// online users: socket.id -> naam
const users = {};

// ---- messages ko file mein save karna ----
const DATA_FILE = path.join(__dirname, 'data', 'messages.json');
let messages = [];
if (fs.existsSync(DATA_FILE)) {
  messages = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveMessages() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  messages = messages.slice(-500);
  fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
}

// ---- SECURITY: har naam ka apna PIN (password) ----
// Bina PIN ke koi bhi "Rahul" naam daal ke Rahul ki private chats padh leta.
// Ab pehli baar jo naam + PIN banata hai, wahi naam uska ho jata hai.
// PIN seedha save nahi hota — sirf uska hash (scrypt + salt) save hota hai.
const ACCOUNTS_FILE = path.join(__dirname, 'data', 'accounts.json');
let accounts = {};
if (fs.existsSync(ACCOUNTS_FILE)) {
  accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

function saveAccounts() {
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

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

// galat PIN baar baar try karne walon ko rokna (brute force)
const failed = {}; // naam -> { count, until }
function isLocked(name) {
  const f = failed[name];
  return f && f.until > Date.now();
}
function noteFail(name) {
  const f = failed[name] || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) { f.until = Date.now() + 60 * 1000; f.count = 0; } // 5 galti = 1 minute ruko
  failed[name] = f;
}

const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function onlineUsers() {
  return [...new Set(Object.values(users))];
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Naya user connect hua:', socket.id);

  socket.on('join', (data, reply) => {
    const done = typeof reply === 'function' ? reply : () => {};
    const name = data && typeof data.name === 'string' ? data.name.trim() : '';
    const pin = data && typeof data.pin === 'string' ? data.pin : '';
    if (!isText(name, 20) || name.toLowerCase() === 'group') return done({ ok: false, error: 'Naam sahi nahi hai (1-20 letters)' });
    if (pin.length < 4 || pin.length > 30) return done({ ok: false, error: 'PIN kam se kam 4 digit ka rakho' });
    if (isLocked(name)) return done({ ok: false, error: 'Bahut galat PIN. 1 minute baad try karo' });

    if (!accounts[name]) {
      // naya naam: is PIN ke saath register karo
      const salt = crypto.randomBytes(16).toString('hex');
      accounts[name] = { salt, hash: hashPin(pin, salt) };
      saveAccounts();
    } else if (!checkPin(name, pin)) {
      noteFail(name);
      return done({ ok: false, error: 'Ye naam kisi aur ka hai ya PIN galat hai' });
    }
    delete failed[name];

    users[socket.id] = name;
    socket.join(name); // har user ka apna private room
    done({ ok: true, name });
    io.emit('online users', onlineUsers());
    // sirf apni chats: group + jo mujhe aaye + jo maine bheje
    const myHistory = messages.filter(
      (m) => m.to === 'group' || m.to === name || m.from === name
    );
    socket.emit('history', myHistory);
  });

  socket.on('chat message', (data, ack) => {
    const name = users[socket.id]; // naam hamesha server se, client se nahi
    if (!name || !data || !isText(data.text, 1000) || typeof data.to !== 'string') return;
    if (data.to !== 'group' && !accounts[data.to]) return; // anjaan user ko nahi
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
      socket.broadcast.emit('chat message', msg);
    } else {
      socket.to(msg.to).emit('chat message', msg);
    }
    if (typeof ack === 'function') ack(msg); // sender ko: server tak pahunch gaya (ek tick)
  });

  socket.on('delivered', (id) => {
    const me = users[socket.id];
    const msg = messages.find((m) => m.id === id);
    // sirf wahi "delivered" bol sakta hai jisko message aaya
    if (me && msg && (msg.to === me || (msg.to === 'group' && msg.from !== me))) updateStatus(id, 'delivered');
  });

  socket.on('seen', (friend) => {
    const me = users[socket.id];
    if (!me || typeof friend !== 'string') return;
    messages
      .filter((m) => m.from === friend && m.to === me && m.status !== 'seen')
      .forEach((m) => updateStatus(m.id, 'seen'));
  });

  socket.on('typing', (data) => {
    const name = users[socket.id];
    if (!name || !data || typeof data.to !== 'string') return;
    const info = { from: name, to: data.to, typing: !!data.typing };
    if (data.to === 'group') {
      socket.broadcast.emit('typing', info);
    } else {
      socket.to(data.to).emit('typing', info);
    }
  });

  socket.on('disconnect', () => {
    console.log('User chala gaya:', users[socket.id] || socket.id);
    delete users[socket.id];
    io.emit('online users', onlineUsers());
  });
});

function updateStatus(id, status) {
  const msg = messages.find((m) => m.id === id);
  if (!msg) return;
  const order = ['sent', 'delivered', 'seen'];
  if (order.indexOf(status) <= order.indexOf(msg.status)) return;
  msg.status = status;
  saveMessages();
  io.to(msg.from).emit('status', { id: msg.id, status });
}

server.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
