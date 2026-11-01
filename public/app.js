// ---- Socket se connect ----
const socket = io();

let me = null;            // mera naam
let activeChat = 'group'; // abhi kaunsi chat khuli hai
let online = [];          // online users ke naam
let contacts = [];        // sab registered users
let chats = { group: [] }; // chat -> messages
let unread = {};
const typingIn = {};      // chat -> kaun type kar raha hai
const TOKEN_KEY = 'wa_clone_token';

const $ = (sel) => document.querySelector(sel);

function showLogin(msg) {
  me = null;
  $('#loading').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#login-error').textContent = msg || '';
}

function loggedIn(name) {
  me = name;
  $('#loading').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#my-name').textContent = me;
  setAvatar($('#my-avatar'), me);
  if (!chats[activeChat]) activeChat = 'group';
  openChat(activeChat, true);
}

// ---- Login (naam + PIN) ----
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name-input').value.trim();
  const pin = $('#pin-input').value;
  if (!name) return;
  $('#login-error').textContent = '';
  $('#login-btn').disabled = true;
  // naam + PIN server check karega; sahi hua tabhi chat khulegi
  socket.emit('join', { name, pin }, (res) => {
    $('#login-btn').disabled = false;
    if (!res || !res.ok) {
      $('#login-error').textContent = (res && res.error) || 'Login nahi hua';
      return;
    }
    localStorage.setItem(TOKEN_KEY, res.token); // reload pe dobara PIN na maange
    $('#pin-input').value = '';
    loggedIn(res.name);
  });
});

// connect / reconnect: token ho to apne aap login
socket.on('connect', () => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return showLogin();
  socket.emit('resume', token, (res) => {
    if (res && res.ok) loggedIn(res.name);
    else {
      if (!res || !res.error) localStorage.removeItem(TOKEN_KEY);
      showLogin(res && res.error);
    }
  });
});

$('#logout-btn').onclick = () => {
  socket.emit('logout', localStorage.getItem(TOKEN_KEY));
  localStorage.removeItem(TOKEN_KEY);
  chats = { group: [] };
  unread = {};
  document.body.classList.remove('in-chat');
  showLogin();
};

// ---- Helpers ----
function colorFor(name) {
  const colors = ['#e542a3', '#1f7aec', '#ff8a00', '#00a884', '#8e44ad', '#e74c3c'];
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return colors[sum % colors.length];
}

function setAvatar(el, name) {
  el.textContent = [...name][0].toUpperCase();
  el.style.background = colorFor(name);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function chatKeyOf(msg) {
  if (msg.to === 'group') return 'group';
  return msg.from === me ? msg.to : msg.from;
}

function tickEl(status) {
  const span = document.createElement('span');
  span.className = 'tick' + (status === 'seen' ? ' seen' : '');
  span.textContent = status === 'sent' ? '✓' : '✓✓';
  return span;
}

// ---- Message add karna ----
function addMessage(msg) {
  const key = chatKeyOf(msg);
  if (!chats[key]) chats[key] = [];
  if (chats[key].some((m) => m.id === msg.id)) return; // dobara nahi
  chats[key].push(msg);
  if (key === activeChat && document.body.classList.contains('in-chat')) {
    renderMessages();
  } else if (key === activeChat && !isMobile()) {
    renderMessages();
  } else if (msg.from !== me) {
    unread[key] = (unread[key] || 0) + 1;
  }
  renderChatList();
}

const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

// ---- Messages screen pe dikhana (sab textContent: HTML/script nahi chalega) ----
function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  for (const msg of chats[activeChat] || []) {
    const div = document.createElement('div');
    const mine = msg.from === me;
    div.className = 'msg ' + (mine ? 'out' : 'in');
    if (!mine && activeChat === 'group') {
      const s = document.createElement('div');
      s.className = 'sender';
      s.style.color = colorFor(msg.from);
      s.textContent = msg.from;
      div.appendChild(s);
    }
    const t = document.createElement('div');
    t.className = 'text';
    t.textContent = msg.text;
    div.appendChild(t);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = formatTime(msg.time);
    if (mine) meta.appendChild(tickEl(msg.status));
    div.appendChild(meta);
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

// ---- Left side chat list ----
function renderChatList() {
  const list = $('#chat-list');
  const q = $('#search-input').value.trim().toLowerCase();
  list.innerHTML = '';
  const people = [...online, ...Object.keys(chats), ...contacts].filter((k) => k !== 'group' && k !== me);
  let keys = ['group', ...new Set(people)];
  // jisme last message hai wo upar
  keys.sort((a, b) => {
    if (a === 'group') return -1;
    if (b === 'group') return 1;
    const la = (chats[a] || []).slice(-1)[0], lb = (chats[b] || []).slice(-1)[0];
    return (lb ? lb.time : 0) - (la ? la.time : 0) || (online.includes(b) - online.includes(a));
  });
  if (q) keys = keys.filter((k) => (k === 'group' ? 'dosti group' : k.toLowerCase()).includes(q));

  for (const key of keys) {
    const msgs = chats[key] || [];
    const last = msgs[msgs.length - 1];
    const li = document.createElement('li');
    li.className = 'chat-item' + (key === activeChat && !isMobile() ? ' active' : '');

    const av = document.createElement('div');
    av.className = 'avatar';
    if (key === 'group') { av.textContent = '👥'; av.style.background = '#6b7c85'; }
    else setAvatar(av, key);
    li.appendChild(av);

    const info = document.createElement('div');
    info.className = 'info';
    const top = document.createElement('div');
    top.className = 'top';
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = key === 'group' ? 'Dosti Group 🔥' : key;
    const tm = document.createElement('span');
    tm.className = 'time';
    tm.textContent = last ? formatTime(last.time) : '';
    top.append(nm, tm);

    const bottom = document.createElement('div');
    bottom.className = 'top';
    const lastEl = document.createElement('span');
    lastEl.className = 'last' + (typingIn[key] ? ' typing' : '');
    if (typingIn[key]) lastEl.textContent = (key === 'group' ? typingIn[key] + ' ' : '') + 'typing...';
    else if (last) {
      if (last.from === me) lastEl.appendChild(tickEl(last.status));
      lastEl.append((key === 'group' && last.from !== me ? last.from + ': ' : '') + last.text);
    } else lastEl.textContent = key === 'group' ? 'Sabke saath chat karo' : (online.includes(key) ? 'online — Hi bolo 👋' : 'Hi bolo 👋');
    bottom.appendChild(lastEl);
    if (unread[key]) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = unread[key];
      bottom.appendChild(b);
    }
    info.append(top, bottom);
    li.appendChild(info);

    if (key !== 'group' && online.includes(key)) {
      const dot = document.createElement('span');
      dot.className = 'online-dot';
      li.appendChild(dot);
    }
    li.onclick = () => openChat(key);
    list.appendChild(li);
  }
}

$('#search-input').addEventListener('input', renderChatList);

// ---- Chat kholna ----
function openChat(key, silent) {
  activeChat = key;
  if (!(silent && isMobile())) {
    document.body.classList.add('in-chat');
    unread[key] = 0;
  }
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
  if (key !== 'group' && document.body.classList.contains('in-chat')) socket.emit('seen', key);
}

$('#back-btn').onclick = () => {
  document.body.classList.remove('in-chat');
  $('#emoji-panel').classList.add('hidden');
  renderChatList();
};

function updateHeaderStatus() {
  let status;
  if (typingIn[activeChat]) {
    status = activeChat === 'group' ? typingIn[activeChat] + ' typing...' : 'typing...';
  } else if (activeChat === 'group') {
    status = online.length ? online.join(', ') : 'sab log';
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
  if (!text || !me) return;
  socket.emit('chat message', { to: activeChat, text }, (msg) => {
    if (msg) addMessage(msg);
    else $('#chat-status').textContent = 'Message nahi gaya, dobara try karo';
  });
  input.value = '';
  input.focus();
  socket.emit('typing', { to: activeChat, typing: false });
  $('#emoji-panel').classList.add('hidden');
});

// ---- Typing indicator ----
let typingTimer;
let typingSent = 0;
$('#msg-input').addEventListener('input', () => {
  if (Date.now() - typingSent > 1000) {
    socket.emit('typing', { to: activeChat, typing: true });
    typingSent = Date.now();
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing', { to: activeChat, typing: false });
    typingSent = 0;
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
  if (msg.from !== me) socket.emit('delivered', msg.id);
  const viewing = chatKeyOf(msg) === activeChat && (document.body.classList.contains('in-chat') || !isMobile());
  if (viewing && msg.to !== 'group' && msg.from !== me && !document.hidden) {
    socket.emit('seen', msg.from);
  }
});

socket.on('history', (msgs) => {
  chats = { group: [] }; // reconnect pe dobara na jude
  msgs.forEach((m) => {
    const key = chatKeyOf(m);
    if (!chats[key]) chats[key] = [];
    chats[key].push(m);
    // jo message mujhe aaye aur abhi "sent" hain, unhe delivered batao
    if (m.from !== me && m.status === 'sent') socket.emit('delivered', m.id);
  });
  renderMessages();
  renderChatList();
  if (activeChat !== 'group' && document.body.classList.contains('in-chat')) socket.emit('seen', activeChat);
});

socket.on('online users', (list) => {
  online = list;
  renderChatList();
  updateHeaderStatus();
});

socket.on('contacts', (list) => {
  contacts = Array.isArray(list) ? list : [];
  renderChatList();
});

socket.on('typing', (data) => {
  const key = data.to === 'group' ? 'group' : data.from;
  if (data.typing) {
    typingIn[key] = data.from;
    clearTimeout(typingIn['_t' + key]);
    typingIn['_t' + key] = setTimeout(() => { delete typingIn[key]; renderChatList(); updateHeaderStatus(); }, 4000);
  } else delete typingIn[key];
  renderChatList();
  updateHeaderStatus();
});

socket.on('status', ({ id, status }) => {
  for (const key in chats) {
    const msg = chats[key].find((m) => m.id === id);
    if (msg) msg.status = status;
  }
  renderMessages();
  renderChatList();
});

// app wapas khola (tab switch): khuli private chat ko "seen" karo
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && me && activeChat !== 'group' && document.body.classList.contains('in-chat')) {
    socket.emit('seen', activeChat);
  }
});
