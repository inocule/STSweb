// server.js — Main Express entry point (production-ready)
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');
const { initDb } = require('./db/database');

const app    = express();
const server = http.createServer(app);

// ─── Allowed Origins ──────────────────────────────────────────────────────────
// FRONTEND_URL is set in Render env vars (your Vercel URL)
const allowedOrigins = [
  process.env.FRONTEND_URL,          // e.g. https://roome.vercel.app
  'http://localhost:3000',           // local dev (backend serves frontend)
  'http://localhost:5500',           // VS Code Live Server
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());

// Serve uploaded dorm images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/dorms',    require('./routes/dorms'));
app.use('/api/messages', require('./routes/messages'));

// ─── Health check (Render uses this) ─────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── Serve Frontend (only in local/monorepo mode) ────────────────────────────
// On Vercel+Render the frontend is served by Vercel; skip static serving there.
if (!process.env.FRONTEND_URL) {
  app.use(express.static(path.join(__dirname, '../frontend')));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  await initDb();           // connect to Postgres + create schema

  // Start TCP chat server (must happen after DB is ready)
  require('./chat/tcp-server');

  // Attach WebSocket gateway to the HTTP server
  const { startWsGateway } = require('./chat/ws-gateway');
  startWsGateway(server);

  server.listen(PORT, () => {
    console.log(`\n🏠 RooME server running at http://localhost:${PORT}`);
    console.log(`   → REST API : http://localhost:${PORT}/api`);
    console.log(`   → WS Chat  : ws://localhost:${PORT}/ws`);
    console.log(`   → Env      : ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
