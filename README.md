# 💬 WhatsApp Clone — Node.js + Express + Socket.IO

**Hindi / Hinglish:** Ye ek WhatsApp jaisa **realtime chat app** hai jo humne YouTube video mein bilkul shuru se, step by step banaya hai. Do browser windows kholo, do alag naam se login karo, aur messages turant (live) ek doosre tak pahunchenge — ticks, typing... aur online users ke saath.

**English:** A WhatsApp-style realtime chat app built from scratch in the Tech Bro Z YouTube video. Open two browser windows, log in with two names, and chat live — with ticks, a typing indicator and an online-users list.

🎬 **YouTube video (Hindi):** link soon — [@techbrozdeveloper](https://www.youtube.com/@techbrozdeveloper)

![WhatsApp Clone screenshot](screenshots/app.png)

---

## ✨ Features

- 🔐 Login with your name + auto avatar (naam likho, chat shuru)
- 👥 Group chat ("Dosti Group 🔥") — sabko ek saath message
- 🔒 Private chat — sirf ek dost ke saath (har user ka apna room)
- 🟢 Online users list (kaun abhi online hai)
- ✍️ "typing..." indicator
- ✓ ✓✓ Ticks — sent, delivered aur **blue (read)**, bilkul WhatsApp jaise
- 💾 Messages save hote hain (`data/messages.json`) — server restart ke baad bhi chat wapas
- 😀 Emoji picker

## 🛠 Tech Stack

| Part | Kya use kiya |
|------|--------------|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js + Express (static files serve karta hai) |
| Realtime | Socket.IO (WebSocket) |
| Storage | Simple JSON file (`data/messages.json`) — no database needed |

## 🚀 Setup — kaise chalayein (step by step)

**Zaroori:** [Node.js](https://nodejs.org) 18 ya usse naya version, aur [Git](https://git-scm.com).
Check karo: `node -v` aur `git --version`

```bash
# 1. Code download karo (clone)
git clone https://github.com/nm621532-byte/whatsapp-clone-techbroz.git

# 2. Folder ke andar jao
cd whatsapp-clone-techbroz

# 3. Packages install karo (express + socket.io)
npm install

# 4. Server start karo
npm start
```

Terminal mein dikhega: `Server chal raha hai: http://localhost:3000`

5. Browser mein kholo 👉 **http://localhost:3000**
6. Ek **doosri window** (ya incognito) mein **http://127.0.0.1:3000** kholo, alag naam se login karo — aur do users ke beech chat karo! 🎉

> Git nahi hai? GitHub page pe green **Code** button → **Download ZIP** dabao, unzip karo, phir step 2 se shuru karo.

### 🐞 Common errors (aur fix)

- **`Cannot GET /`** → server `public` folder serve nahi kar raha; `server.js` mein `express.static` line check karo.
- **`EADDRINUSE: address already in use :::3000`** → port 3000 pe pehle se kuch chal raha hai. Purana server band karo (Ctrl + C) ya doosre port pe chalao:
  - Mac/Linux: `PORT=4000 npm start`
  - Windows (PowerShell): `$env:PORT=4000; npm start`
- **`Cannot find module 'express'`** → `npm install` chalana bhool gaye 🙂

## 📁 Folder Structure

```
whatsapp-clone-techbroz/
├── server.js          # Node.js + Express + Socket.IO server (rooms, ticks, typing, save)
├── package.json       # project info + dependencies (express, socket.io)
├── package-lock.json  # exact dependency versions
├── data/
│   └── messages.json  # saved chat messages (starts empty: [])
├── public/            # frontend (browser mein chalta hai)
│   ├── index.html     # login screen + chat layout
│   ├── style.css      # WhatsApp jaisa design
│   └── app.js         # socket events, chat list, ticks, emoji
└── screenshots/
    └── app.png
```

## 🧠 Kaise kaam karta hai (short mein)

Server = post office, WebSocket = phone call. Browser ek baar server se **connected** rehta hai (Socket.IO), isliye message bhejte hi server use turant sahi insaan (group ya private room) tak forward kar deta hai — page refresh ki zarurat nahi.

## 🏠 Homework

- Image bhejne ka feature jodo 📷
- App ko deploy karo (Render / Railway) aur doston ko link bhejo
- Comment mein batao kya banaya! 👇

---

## 🙌 Credit

Made by **Tech Bro Z** — YouTube [@techbrozdeveloper](https://www.youtube.com/@techbrozdeveloper), Instagram [@tech_bro_z_1](https://www.instagram.com/tech_bro_z_1/)

Har Sunday ek naye famous app ka full project! ⭐ Repo pasand aaye to **star** karo aur channel **subscribe** karo 🔥

Licensed under the [MIT License](LICENSE) — free to learn, use and modify.
