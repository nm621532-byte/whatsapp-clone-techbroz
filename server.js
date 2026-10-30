const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
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

function onlineUsers() {
  return [...new Set(Object.values(users))];
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Naya user connect hua:', socket.id);

  socket.on('join', (name) => {
    users[socket.id] = name;
    socket.join(name); // har user ka apna private room
    io.emit('online users', onlineUsers());
    const myHistory = messages.filter(
      (m) => m.to === 'group' || m.to === name || m.from === name
    );
    socket.emit('history', myHistory);
  });

  socket.on('chat message', (data, ack) => {
    const name = users[socket.id];
    if (!name || !data.text.trim()) return;
    const msg = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 6),
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
    ack(msg); // sender ko: server tak pahunch gaya (ek tick)
  });

  socket.on('delivered', (id) => updateStatus(id, 'delivered'));

  socket.on('seen', (friend) => {
    const me = users[socket.id];
    messages
      .filter((m) => m.from === friend && m.to === me && m.status !== 'seen')
      .forEach((m) => updateStatus(m.id, 'seen'));
  });

  socket.on('typing', (data) => {
    const name = users[socket.id];
    if (!name) return;
    const info = { from: name, to: data.to, typing: data.typing };
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
