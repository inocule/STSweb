// chat/tcp-server.js
// Raw TCP chat server using Node.js built-in `net` module.
// The ws-gateway.js bridges browser WebSocket connections to this TCP server.

const net = require('net');
const db = require('../db/database');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/authenticate');

// Map: userId → { socket, name }
const clients = new Map();

const TCP_PORT = 4001;

const server = net.createServer((socket) => {
  let userId = null;
  let buffer = '';

  socket.setEncoding('utf8');

  // ── Handle incoming TCP data ──────────────────────────────────────────────
  socket.on('data', (chunk) => {
    buffer += chunk;
    // Messages are newline-delimited JSON
    let boundary;
    while ((boundary = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!raw) continue;

      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }

      // ── Auth ──────────────────────────────────────────────────────────────
      if (msg.type === 'auth') {
        try {
          const payload = jwt.verify(msg.token, JWT_SECRET);
          userId = payload.id;
          clients.set(userId, { socket, name: payload.name });
          send(socket, { type: 'auth_ok', userId, name: payload.name });
          console.log(`[TCP] User ${payload.name} (${userId}) connected`);

          // Deliver queued unread messages
          const unread = db.prepare(`
            SELECT m.*, u.name as sender_name FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE receiver_id = ? AND read = 0 ORDER BY created_at ASC
          `).all(userId);
          if (unread.length) {
            send(socket, { type: 'queued', messages: unread });
            db.prepare('UPDATE messages SET read=1 WHERE receiver_id=? AND read=0').run(userId);
          }
        } catch {
          send(socket, { type: 'error', message: 'Invalid token' });
          socket.destroy();
        }
        return;
      }

      if (!userId) {
        send(socket, { type: 'error', message: 'Not authenticated' });
        return;
      }

      // ── Private message ───────────────────────────────────────────────────
      if (msg.type === 'message') {
        const { to, text, dormId } = msg;
        if (!to || !text) return;

        // Persist to DB
        const result = db.prepare(
          'INSERT INTO messages (sender_id, receiver_id, dorm_id, text) VALUES (?,?,?,?)'
        ).run(userId, to, dormId || null, text);

        const saved = db.prepare(`
          SELECT m.*, u.name as sender_name FROM messages m
          JOIN users u ON u.id = m.sender_id WHERE m.id = ?
        `).get(result.lastInsertRowid);

        const packet = { type: 'message', ...saved };

        // Deliver to recipient if online
        const recipient = clients.get(to);
        if (recipient) {
          send(recipient.socket, packet);
        }
        // Echo back to sender with confirmation
        send(socket, { ...packet, type: 'message_sent' });
      }

      // ── Typing indicator ──────────────────────────────────────────────────
      if (msg.type === 'typing') {
        const recipient = clients.get(msg.to);
        if (recipient) {
          send(recipient.socket, { type: 'typing', from: userId });
        }
      }
    }
  });

  socket.on('end', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`[TCP] User ${userId} disconnected`);
    }
  });

  socket.on('error', (err) => {
    if (userId) clients.delete(userId);
    console.error(`[TCP] Socket error for user ${userId}:`, err.message);
  });
});

function send(socket, obj) {
  try {
    socket.write(JSON.stringify(obj) + '\n');
  } catch {}
}

server.listen(TCP_PORT, '127.0.0.1', () => {
  console.log(`[TCP] Chat server listening on port ${TCP_PORT}`);
});

module.exports = { server, clients };
