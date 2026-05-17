// server.js — Main Express entry point
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Start TCP chat server first (before WS gateway)
require('./chat/tcp-server');

const app = express();
const server = http.createServer(app);

// Start WebSocket gateway attached to the HTTP server
const { startWsGateway } = require('./chat/ws-gateway');
startWsGateway(server);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve uploaded dorm images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/dorms',    require('./routes/dorms'));
app.use('/api/messages', require('./routes/messages'));

// ─── Serve Frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all: serve index.html for any unmatched route (Express 5 syntax)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🏠 RooME server running at http://localhost:${PORT}`);
  console.log(`   → REST API : http://localhost:${PORT}/api`);
  console.log(`   → WS Chat  : ws://localhost:${PORT}/ws`);
  console.log(`   → Frontend : http://localhost:${PORT}\n`);
});
