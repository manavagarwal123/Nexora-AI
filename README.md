# 🚀 Nexora AI — Real-Time Chat Application

> A full-stack, production-grade real-time messaging platform with group chats, private DMs, AI-powered smart replies, and a premium glassmorphism UI — built from the ground up with WebSockets and Node.js.

<br/>

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Frontend-6c5ce7?style=for-the-badge&logo=netlify)](https://your-nexora-frontend.netlify.app)
[![Backend](https://img.shields.io/badge/Backend-Render-00d2be?style=for-the-badge&logo=render)](https://your-nexora-backend.onrender.com)
[![License](https://img.shields.io/badge/License-MIT-a29bfe?style=for-the-badge)](LICENSE)

---

## 🌐 Live Demo

| Service    | URL                                        |
|------------|--------------------------------------------|
| Frontend   | `https://your-nexora-frontend.netlify.app` |
| Backend    | `https://your-nexora-backend.onrender.com` |

> **Note:** The backend is hosted on Render's free tier — it may take ~30s to cold-start on the first connection.

---

## 📌 Project Description

**Nexora AI** is a real-time communication platform that supports private messaging and group chat, built with a persistent WebSocket server and a secure authentication layer. The frontend is designed with a modern glassmorphism aesthetic and adapts seamlessly between desktop and mobile devices.

The project demonstrates production-grade patterns — session reconnection, message delivery tracking, browser notifications, and AI-assisted replies — all without any frontend framework dependencies.

---

## ✨ Features

### 💬 Messaging
- **Real-time private chat** between any two users via WebSockets
- **Group chat** with create, join, and leave functionality
- **Message status indicators** — Sent ✓, Delivered ✓✓, Seen ✓✓ (in blue)
- **Typing indicators** with animated dots in the chat header

### 🔐 Authentication
- Secure **login / signup** with server-side password hashing (`bcrypt`)
- **Session persistence** via `localStorage` — users stay logged in across page refreshes without re-entering credentials
- Duplicate session detection — multiple tabs / devices are handled gracefully

### 🤖 AI Smart Replies
- Context-aware **AI reply suggestions** generated on the frontend
- Suggestions update dynamically based on received message content
- One-tap insertion into the message input

### 🔔 Notifications
- **Browser push notifications** (with permission) for new messages when the tab is in the background
- **In-app toast notifications** with smooth slide-in animations
- Notification sound for incoming messages

### 📱 Responsive Design
- **Mobile-first layout** — sidebar becomes a slide-in drawer on small screens
- Hamburger menu with smooth overlay backdrop
- Touch-friendly tap targets throughout
- Keyboard-safe layout on iOS / Android using `100svh`

### 👥 Group Management
- Create named groups and share invite IDs
- Add / remove members in real-time
- Admin controls for group creators
- Live member count updates in the header

### 🔗 Connect by ID
- Instantly start a private chat by entering any user's unique Connection ID
- No contact list required — shareable and frictionless

---

## 🛠 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| HTML5 / CSS3 | Structure and glassmorphism UI |
| Vanilla JavaScript (ES6+) | All client-side logic and WebSocket management |
| CSS Custom Properties + Flexbox/Grid | Design system and responsive layout |
| Web Notifications API | Browser push notifications |
| LocalStorage API | Session persistence |

### Backend
| Technology | Purpose |
|---|---|
| Node.js | Runtime environment |
| `ws` (WebSocket library) | Real-time bidirectional communication |
| `bcrypt` | Secure password hashing |
| `fs` / JSON files | Lightweight persistent user + group storage |

### Deployment
| Service | Role |
|---|---|
| [Netlify](https://netlify.com) | Static frontend hosting with CDN |
| [Render](https://render.com) | WebSocket-compatible backend hosting |

---

## 📁 Project Structure

```
nexora-ai/
├── client/                  # Frontend (deployed to Netlify)
│   ├── index.html           # App shell and all UI screens
│   ├── style.css            # Full design system — glassmorphism + responsive
│   └── script.js            # WebSocket client, auth, chat logic, AI replies
│
├── server/                  # Backend (deployed to Render)
│   ├── server.js            # WebSocket server — auth, messaging, groups
│   ├── users.json           # Persisted user records (hashed passwords)
│   └── groups.json          # Persisted group data
│
├── README.md
└── runapp.txt               # Local run instructions
```

---

## ⚙️ Local Setup

### Prerequisites
- Node.js v18+
- npm

### 1. Clone the repository
```bash
git clone https://github.com/your-username/nexora-ai.git
cd nexora-ai
```

### 2. Install backend dependencies
```bash
cd server
npm install
```

### 3. Start the WebSocket server
```bash
node server.js
# Server starts on ws://localhost:8080
```

### 4. Open the frontend
Open `client/index.html` directly in your browser, **or** serve it with a local server:

```bash
# Using Python
cd client
python3 -m http.server 3000

# Using VS Code → install "Live Server" extension and click "Go Live"
```

> **Important:** Ensure the WebSocket URL in `client/script.js` points to `ws://localhost:8080` for local development. Change it to your Render backend URL before deploying.

---

## 🏆 Why This Project Stands Out

| Aspect | What It Demonstrates |
|---|---|
| **No framework dependency** | Deep understanding of the DOM, events, and state management in vanilla JS |
| **WebSocket architecture** | Hands-on experience with real-time, bidirectional communication protocols |
| **Security awareness** | Password hashing with `bcrypt`, session validation, duplicate connection handling |
| **Production UX patterns** | Session persistence, auto-reconnect, offline indicators, message delivery tracking |
| **Responsive engineering** | Mobile-first CSS system with drawer navigation, keyboard-safe layout, and touch targets |
| **Full deployment pipeline** | Frontend on Netlify, backend on Render — demonstrates real-world deployment skills |
| **Clean code architecture** | Separation of concerns, modular JS functions, consistent design tokens in CSS |

---

## 🔮 Future Improvements

- [ ] **End-to-end encryption** using the Web Crypto API
- [ ] **File / image sharing** support in chats
- [ ] **Message reactions** (emoji reactions on bubbles)
- [ ] **Read receipts in groups** (per-member seen status)
- [ ] **User profile pages** with configurable avatars and status
- [ ] **Push notifications** via Service Workers (PWA support)
- [ ] **Database migration** from JSON files to MongoDB/PostgreSQL for scalability
- [ ] **Rate limiting and abuse protection** on the WebSocket server
- [ ] **OAuth integration** (Google / GitHub login)

---

## 👤 Author

**Manav Agarwal**

- GitHub: [@manavagarwal](https://github.com/manavagarwal)
- LinkedIn: [linkedin.com/in/manavagarwal](https://linkedin.com/in/manavagarwal)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ by Manav Agarwal &nbsp;|&nbsp; Star ⭐ this repo if you found it useful!
</p>
