// chat/tcp-server.js
// Raw TCP chat server using Node.js built-in `net` module.
// The ws-gateway.js bridges browser WebSocket connections to this TCP server.
// Now uses PostgreSQL (async pg) instead of SQLite.

const net = require('net');
const { pool } = require('../db/database');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/authenticate');

// Map: userId → { socket, name }
const clients = new Map();

const TCP_PORT = process.env.TCP_PORT || 4001;

const server = net.createServer((socket) => {
  let userId = null;
  let buffer = '';

  socket.setEncoding('utf8');

  // ── Handle incoming TCP data ──────────────────────────────────────────────
  socket.on('data', (chunk) => {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!raw) continue;

      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }

      // ── Auth ──────────────────────────────────────────────────────────────
      if (msg.type === 'auth') {
        handleAuth(socket, msg).then((uid) => {
          if (uid) userId = uid;
        });
        return;
      }

      if (!userId) {
        send(socket, { type: 'error', message: 'Not authenticated' });
        return;
      }

      // ── Private message ───────────────────────────────────────────────────
      if (msg.type === 'message') {
        handleMessage(socket, userId, msg);
      }

      // ── Typing indicator ──────────────────────────────────────────────────
      if (msg.type === 'typing') {
        const recipient = clients.get(msg.to);
        if (recipient) send(recipient.socket, { type: 'typing', from: userId });
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

// ─── Auth Handler ─────────────────────────────────────────────────────────────
async function handleAuth(socket, msg) {
  try {
    const payload = jwt.verify(msg.token, JWT_SECRET);
    const uid = payload.id;
    clients.set(uid, { socket, name: payload.name });
    send(socket, { type: 'auth_ok', userId: uid, name: payload.name });
    console.log(`[TCP] User ${payload.name} (${uid}) connected`);

    // Deliver queued unread messages
    const { rows: unread } = await pool.query(`
      SELECT m.*, u.name AS sender_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE receiver_id = $1 AND read = FALSE
      ORDER BY created_at ASC
    `, [uid]);

    if (unread.length) {
      send(socket, { type: 'queued', messages: unread });
      await pool.query('UPDATE messages SET read = TRUE WHERE receiver_id = $1 AND read = FALSE', [uid]);
    }
    return uid;
  } catch {
    send(socket, { type: 'error', message: 'Invalid token' });
    socket.destroy();
    return null;
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
async function handleMessage(socket, userId, msg) {
  try {
    const { to, text, dormId } = msg;
    if (!to || !text) return;

    const { rows: [saved] } = await pool.query(`
      WITH ins AS (
        INSERT INTO messages (sender_id, receiver_id, dorm_id, text)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      )
      SELECT ins.*, u.name AS sender_name
      FROM ins JOIN users u ON u.id = ins.sender_id
    `, [userId, to, dormId || null, text]);

    const packet = { type: 'message', ...saved };

    const recipient = clients.get(to);
    if (recipient) send(recipient.socket, packet);
    send(socket, { ...packet, type: 'message_sent' });
  } catch (err) {
    console.error('[TCP] handleMessage error:', err.message);
  }
}

function send(socket, obj) {
  try { socket.write(JSON.stringify(obj) + '\n'); } catch {}
}

server.listen(TCP_PORT, '127.0.0.1', () => {
  console.log(`[TCP] Chat server listening on port ${TCP_PORT}`);
});

module.exports = { server, clients };
