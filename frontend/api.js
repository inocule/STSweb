// frontend/api.js — Shared API & Auth utilities

const API_BASE = 'http://localhost:3000/api';
const WS_URL   = 'ws://localhost:3000/ws';

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('roome_token'); }
function getUser()  {
  try { return JSON.parse(localStorage.getItem('roome_user')); } catch { return null; }
}
function saveAuth(token, user) {
  localStorage.setItem('roome_token', token);
  localStorage.setItem('roome_user', JSON.stringify(user));
}
function logout() {
  localStorage.removeItem('roome_token');
  localStorage.removeItem('roome_user');
  window.location.href = '/signin.html';
}

// Guard: redirect if not logged in or wrong role
function requireAuth(role) {
  const user = getUser();
  const token = getToken();
  if (!user || !token) { window.location.href = '/signin.html'; return null; }
  if (role && user.role !== role) {
    window.location.href = user.role === 'owner' ? '/dashboard-owner.html' : '/dashboard-student.html';
    return null;
  }
  return user;
}

// ─── API Fetch Wrapper ────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Update Navbar based on auth state ───────────────────────────────────────

function updateNavbar() {
  const user = getUser();
  const signinBtn = document.querySelector('.signin-btn');
  if (!signinBtn) return;

  if (user) {
    signinBtn.textContent = user.role === 'owner' ? '⚡ Dashboard' : '👤 My Account';
    signinBtn.onclick = () => {
      window.location.href = user.role === 'owner' ? '/dashboard-owner.html' : '/dashboard-student.html';
    };

    // Add logout link next to button
    const existing = document.getElementById('logout-nav-btn');
    if (!existing) {
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'logout-nav-btn';
      logoutBtn.textContent = 'Log Out';
      logoutBtn.style.cssText = 'background:transparent;border:1px solid #8B0023;color:#8B0023;padding:15px 20px;border-radius:12px;font-size:18px;cursor:pointer;margin-left:10px;transition:0.3s;';
      logoutBtn.onmouseenter = () => { logoutBtn.style.background='#8B0023'; logoutBtn.style.color='white'; };
      logoutBtn.onmouseleave = () => { logoutBtn.style.background='transparent'; logoutBtn.style.color='#8B0023'; };
      logoutBtn.onclick = logout;
      signinBtn.parentNode.insertBefore(logoutBtn, signinBtn.nextSibling);
    }
  }
}

// ─── WebSocket Chat Client ────────────────────────────────────────────────────

class ChatClient {
  constructor(onMessage, onTyping, onConnect) {
    this.onMessage = onMessage;
    this.onTyping = onTyping;
    this.onConnect = onConnect;
    this.ws = null;
    this.authenticated = false;
    this.reconnectDelay = 1000;
  }

  connect() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      const token = getToken();
      this.ws.send(JSON.stringify({ type: 'auth', token }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'auth_ok') {
          this.authenticated = true;
          this.reconnectDelay = 1000;
          if (this.onConnect) this.onConnect(msg);
          if (msg.messages) msg.messages.forEach(m => this.onMessage(m));
        } else if (msg.type === 'queued') {
          msg.messages.forEach(m => this.onMessage(m));
        } else if (msg.type === 'message' || msg.type === 'message_sent') {
          this.onMessage(msg);
        } else if (msg.type === 'typing') {
          if (this.onTyping) this.onTyping(msg.from);
        }
      } catch {}
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
    };

    this.ws.onerror = () => this.ws.close();
  }

  send(to, text, dormId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'message', to, text, dormId }));
    }
  }

  sendTyping(to) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'typing', to }));
    }
  }
}
