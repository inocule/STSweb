# RooME Dorm Finder Backend

This is the backend service for RooME Dorm Finder, featuring an Express REST API, a PostgreSQL database, a custom raw TCP chat server, and a WebSocket-to-TCP bridge gateway.

## Table of Contents

1. Architecture Overview
2. Setup and Installation
3. Core Database Schema and Bootstrap
4. JWT and Role-Based Authentication Middleware
5. Geospatial Filtering (Haversine Formula)
6. Complex Querying: Active Conversations & Unread Counts
7. Raw TCP Chat Server (Line-buffered JSON Protocol)
8. WebSocket to TCP Gateway Bridge

---

## 1. Architecture Overview

The backend uses a hybrid architecture designed for both standard HTTP CRUD features and high-performance, real-time messaging:

* **REST API (Express)**: Handles standard resources such as user authentication, dorm management, and historical message retrieval.
* **PostgreSQL (pg)**: Serves as the persistent data store with optimized indices for spatial sorting and read-status tracking.
* **TCP Chat Server (net)**: A highly efficient, raw TCP socket server that manages active chat connections, parses custom JSON frames, and handles real-time private messages.
* **WebSocket Gateway (ws)**: A bridge that runs alongside the HTTP server, upgrading client WebSocket requests and tunneling their traffic to the TCP chat server.

---

## 2. Setup and Installation

### Prerequisites
* Node.js (version 18 or higher)
* PostgreSQL Database instance

### Environment Variables
Copy `.env.example` to `.env` and configure the following variables:
* `DATABASE_URL`: Connection string for PostgreSQL (supports SSL for Supabase or Render in production).
* `JWT_SECRET`: Signing key for JSON Web Tokens.
* `FRONTEND_URL`: URL of the frontend application (for CORS configuration).
* `NODE_ENV`: Runs in `development` or `production`.

### Running the Server
```bash
# Install dependencies
npm install

# Run in development mode (with nodemon auto-restart)
npm run dev

# Run in production mode
npm start
```

---

## 3. Core Database Schema and Bootstrap

File: `db/database.js`

The database relies on a `pg.Pool` connection pool. On startup, it bootstraps the database by defining the tables, constraints, check conditions, and partial indexes to optimize message retrieval.

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      role       TEXT        NOT NULL CHECK (role IN ('student', 'owner')),
      avatar     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dorms (
      id          SERIAL PRIMARY KEY,
      owner_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT        NOT NULL,
      description TEXT,
      price       NUMERIC     NOT NULL,
      lat         NUMERIC     NOT NULL,
      lng         NUMERIC     NOT NULL,
      status      TEXT        NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'full')),
      amenities   JSONB       NOT NULL DEFAULT '[]',
      image_url   TEXT,
      address     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      dorm_id     INTEGER     REFERENCES dorms(id)    ON DELETE SET NULL,
      sender_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text        TEXT        NOT NULL,
      read        BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_dorms_owner   ON dorms    (owner_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (sender_id, receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (receiver_id, read) WHERE read = FALSE;
  `);
}
```

---

## 4. JWT and Role-Based Authentication Middleware

File: `middleware/authenticate.js`

Requests are authenticated by extracting the Bearer Token from the `Authorization` header. Standard routes are protected using `authenticate`, while specific listings routes require the `requireRole` middleware to restrict access to owners or students.

```javascript
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'roome_secret_key_2025';

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden - insufficient role' });
    }
    next();
  };
}
```

---

## 5. Geospatial Filtering (Haversine Formula)

File: `routes/dorms.js`

The REST API allows searching and filtering dorms. When a user provides their coordinates (`lat`, `lng`) and a `maxDistance` parameter, the backend applies the Haversine mathematical formula in JavaScript to compute distances, filter candidates within range, and sort from nearest to farthest.

```javascript
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Inside the GET / route handler:
if (lat && lng && maxDistance) {
  const userLat = Number(lat), userLng = Number(lng), maxKm = Number(maxDistance);
  dorms = dorms
    .map(d => ({
      ...d,
      distance_km: Math.round(haversine(userLat, userLng, Number(d.lat), Number(d.lng)) * 10) / 10
    }))
    .filter(d => d.distance_km <= maxKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}
```

---

## 6. Complex Querying: Active Conversations & Unread Counts

File: `routes/messages.js`

To retrieve active message threads for a user, the application uses a structured PostgreSQL query featuring a `DISTINCT ON` subquery. It groups messages by sender, receiver, and dorm context, fetches the last message exchanged in each thread, links user names/images, and counts unread messages in a single database round-trip.

```javascript
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        conv.other_id,
        u.name          AS other_name,
        d.id            AS dorm_id,
        d.name          AS dorm_name,
        d.image_url     AS dorm_image,
        conv.last_message,
        conv.last_time,
        SUM(CASE WHEN m2.read = FALSE AND m2.receiver_id = $1 THEN 1 ELSE 0 END)::int AS unread
      FROM (
        -- Get the most recent message exchanged per user-pair and dorm thread
        SELECT DISTINCT ON (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), COALESCE(dorm_id, 0))
          CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END AS other_id,
          dorm_id,
          text        AS last_message,
          created_at  AS last_time
        FROM messages
        WHERE sender_id = $3 OR receiver_id = $4
        ORDER BY LEAST(sender_id, receiver_id),
                 GREATEST(sender_id, receiver_id),
                 COALESCE(dorm_id, 0),
                 created_at DESC
      ) conv
      JOIN users u ON u.id = conv.other_id
      LEFT JOIN dorms d ON d.id = conv.dorm_id
      -- Join back to messages to calculate unread message counts
      JOIN messages m2
        ON (m2.sender_id = $5 OR m2.receiver_id = $6)
        AND (CASE WHEN m2.sender_id = $7 THEN m2.receiver_id ELSE m2.sender_id END) = conv.other_id
        AND m2.dorm_id IS NOT DISTINCT FROM conv.dorm_id
      GROUP BY conv.other_id, u.name, d.id, d.name, d.image_url, conv.last_message, conv.last_time
      ORDER BY conv.last_time DESC
    `, [uid, uid, uid, uid, uid, uid, uid]);
    res.json(rows);
  } catch (err) {
    console.error('[messages/conversations]', err);
    res.status(500).json({ error: 'Server error' });
  }
});
```

---

## 7. Raw TCP Chat Server (Line-buffered JSON Protocol)

File: `chat/tcp-server.js`

Real-time message routing is handled by a raw Node.js TCP server. Clients send stringified JSON frames ending with a newline character (`\n`). The server uses a buffer accumulator to parse incomplete chunks, verifies incoming JWT tokens for authentication, routes messages instantly to online target sockets, and automatically delivers offline-queued messages when a user connects.

```javascript
const net = require('net');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/database');
const { JWT_SECRET } = require('../middleware/authenticate');

const clients = new Map(); // userId -> { socket, name }

const server = net.createServer((socket) => {
  let userId = null;
  let buffer = '';

  socket.setEncoding('utf8');

  socket.on('data', (chunk) => {
    buffer += chunk;
    let boundary;
    // Process line-delimited JSON chunks
    while ((boundary = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (!raw) continue;

      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }

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

      if (msg.type === 'message') {
        handleMessage(socket, userId, msg);
      }

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
});

async function handleAuth(socket, msg) {
  try {
    const payload = jwt.verify(msg.token, JWT_SECRET);
    const uid = payload.id;
    clients.set(uid, { socket, name: payload.name });
    send(socket, { type: 'auth_ok', userId: uid, name: payload.name });

    // Fetch and deliver unread queued messages
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

function send(socket, obj) {
  try { socket.write(JSON.stringify(obj) + '\n'); } catch {}
}
```

---

## 8. WebSocket to TCP Gateway Bridge

File: `chat/ws-gateway.js`

Since web browsers cannot open raw TCP sockets natively, the server runs a WebSocket-to-TCP bridge. It attaches to the Express HTTP/HTTPS server under the `/ws` path, accepts WebSocket client connections, instantiates a corresponding internal TCP connection, and bridges messages seamlessly in both directions using newline packetization.

```javascript
const WebSocket = require('ws');
const net = require('net');

const TCP_PORT = 4001;

function startWsGateway(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Browser client connected');

    // Create unique internal TCP connection for this WebSocket client
    const tcp = net.createConnection({ port: TCP_PORT, host: '127.0.0.1' });
    let tcpBuffer = '';

    // Route Browser WebSocket messages to TCP Socket
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        tcp.write(JSON.stringify(msg) + '\n');
      } catch {}
    });

    // Route TCP Socket packets to Browser WebSocket
    tcp.on('data', (chunk) => {
      tcpBuffer += chunk.toString();
      let boundary;
      while ((boundary = tcpBuffer.indexOf('\n')) !== -1) {
        const raw = tcpBuffer.slice(0, boundary).trim();
        tcpBuffer = tcpBuffer.slice(boundary + 1);
        if (!raw) continue;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(raw);
        }
      }
    });

    // Handle standard cleanups and errors
    ws.on('close', () => {
      console.log('[WS] Browser client disconnected');
      tcp.destroy();
    });

    tcp.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });
  });

  return wss;
}
```
