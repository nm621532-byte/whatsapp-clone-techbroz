// ---- Socket se connect ----
const socket = io();

let me = null;            // mera naam
let activeChat = 'group'; // abhi kaunsi chat khuli hai
let online = [];          // online users ke naam
const chats = { group: [] }; // chat -> messages
const unread = {};
const typingIn = {};      // chat -> kaun type kar raha hai

const $ = (sel) => document.querySelector(sel);

// ---- Login ----
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name-input').value.trim();
  if (!name) return;
  me = name;
  socket.emit('join', me);
  $('#login').style.display = 'none';
  $('#my-name').textContent = me;
  setAvatar($('#my-avatar'), me);
  openChat('group');
});

// ---- Helpers ----
function colorFor(name) {
  const colors = ['#e542a3', '#1f7aec', '#ff8a00', '#00a884', '#8e44ad', '#e74c3c'];
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return colors[sum % colors.length];
}

function setAvatar(el, name) {
  el.textContent = name[0].toUpperCase();
  el.style.background = colorFor(name);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function chatKeyOf(msg) {
  if (msg.to === 'group') return 'group';
  return msg.from === me ? msg.to : msg.from;
}

function ticks(status) {
  if (status === 'seen') return '<span class="tick seen">✓✓</span>';
  if (status === 'delivered') return '<span class="tick">✓✓</span>';
  return '<span class="tick">✓</span>';
}

// ---- Message add karna ----
function addMessage(msg) {
  const key = chatKeyOf(msg);
  if (!chats[key]) chats[key] = [];
  chats[key].push(msg);
  if (key === activeChat) {
    renderMessages();
  } else if (msg.from !== me) {
    unread[key] = (unread[key] || 0) + 1;
  }
  renderChatList();
}

// ---- Messages screen pe dikhana ----
function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  for (const msg of chats[activeChat] || []) {
    const div = document.createElement('div');
    const mine = msg.from === me;
    div.className = 'msg ' + (mine ? 'out' : 'in');

    let html = '';
    if (!mine && activeChat === 'group') {
      html += `<div class="sender" style="color:${colorFor(msg.from)}">${msg.from}</div>`;
    }
    html += `<div class="text"></div>`;
    html += `<div class="meta">${formatTime(msg.time)}${mine ? ticks(msg.status) : ''}</div>`;
    div.innerHTML = html;
    div.querySelector('.text').textContent = msg.text; // safe: HTML nahi chalega
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

// ---- Left side chat list ----
function renderChatList() {
  const list = $('#chat-list');
  list.innerHTML = '';
  const others = online.filter((n) => n !== me);
  const keys = ['group', ...new Set([...others, ...Object.keys(chats).filter((k) => k !== 'group')])];

  for (const key of keys) {
    const msgs = chats[key] || [];
    const last = msgs[msgs.length - 1];
    const li = document.createElement('li');
    li.className = 'chat-item' + (key === activeChat ? ' active' : '');

    const title = key === 'group' ? 'Dosti Group 🔥' : key;
    let lastText = last ? last.text : 'Hi bolo 👋';
    if (typingIn[key]) lastText = typingIn[key] + ' typing...';

    li.innerHTML = `
      <div class="avatar"></div>
      <div class="info">
        <div class="top"><span class="name"></span><span class="time">${last ? formatTime(last.time) : ''}</span></div>
        <div class="top"><span class="last ${typingIn[key] ? 'typing' : ''}"></span>
        ${unread[key] ? `<span class="badge">${unread[key]}</span>` : ''}</div>
      </div>`;
    li.querySelector('.name').textContent = title;
    li.querySelector('.last').textContent = lastText;

    const av = li.querySelector('.avatar');
    if (key === 'group') av.textContent = '👥';
    else setAvatar(av, key);
    if (key !== 'group' && online.includes(key)) {
      li.insertAdjacentHTML('beforeend', '<span class="online-dot"></span>');
    }

    li.onclick = () => openChat(key);
    list.appendChild(li);
  }
}

// ---- Chat kholna ----
function openChat(key) {
  activeChat = key;
  unread[key] = 0;
  $('#chat-name').textContent = key === 'group' ? 'Dosti Group 🔥' : key;
  if (key === 'group') {
    $('#chat-avatar').textContent = '👥';
    $('#chat-avatar').style.background = '#6b7c85';
  } else {
    setAvatar($('#chat-avatar'), key);
  }
  updateHeaderStatus();
  renderMessages();
  renderChatList();
  if (key !== 'group') socket.emit('seen', key);
}

function updateHeaderStatus() {
  let status;
  if (typingIn[activeChat]) {
    status = activeChat === 'group' ? typingIn[activeChat] + ' typing...' : 'typing...';
  } else if (activeChat === 'group') {
    status = online.join(', ');
  } else {
    status = online.includes(activeChat) ? 'online' : 'offline';
  }
  $('#chat-status').textContent = status;
}

// ---- Message bhejna ----
$('#send-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#msg-input');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat message', { to: activeChat, text }, (msg) => addMessage(msg));
  input.value = '';
  socket.emit('typing', { to: activeChat, typing: false });
  $('#emoji-panel').classList.add('hidden');
});

// ---- Typing indicator ----
let typingTimer;
$('#msg-input').addEventListener('input', () => {
  socket.emit('typing', { to: activeChat, typing: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing', { to: activeChat, typing: false });
  }, 1500);
});

// ---- Emoji panel ----
const emojis = ['😀', '😂', '😍', '😎', '🤔', '😭', '👍', '🙏', '🔥', '❤️', '🎉', '💯'];
for (const em of emojis) {
  const span = document.createElement('span');
  span.textContent = em;
  span.onclick = () => {
    $('#msg-input').value += em;
    $('#msg-input').focus();
  };
  $('#emoji-panel').appendChild(span);
}
$('#emoji-btn').onclick = () => $('#emoji-panel').classList.toggle('hidden');

// ---- Server se aane wale events ----
socket.on('chat message', (msg) => {
  addMessage(msg);
  socket.emit('delivered', msg.id);
  if (chatKeyOf(msg) === activeChat && msg.to !== 'group') {
    socket.emit('seen', msg.from);
  }
});

socket.on('history', (msgs) => {
  msgs.forEach((m) => {
    const key = chatKeyOf(m);
    if (!chats[key]) chats[key] = [];
    chats[key].push(m);
  });
  renderMessages();
  renderChatList();
});

socket.on('online users', (list) => {
  online = list;
  renderChatList();
  updateHeaderStatus();
});

socket.on('typing', (data) => {
  const key = data.to === 'group' ? 'group' : data.from;
  if (data.typing) typingIn[key] = data.from;
  else delete typingIn[key];
  renderChatList();
  updateHeaderStatus();
});

socket.on('status', ({ id, status }) => {
  for (const key in chats) {
    const msg = chats[key].find((m) => m.id === id);
    if (msg) msg.status = status;
  }
  renderMessages();
});
