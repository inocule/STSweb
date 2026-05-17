// chat/ws-gateway.js
// WebSocket ↔ TCP bridge: browsers connect via WS (port 4000) and this
// gateway tunnels their messages to/from the internal TCP chat server (port 4001).

const WebSocket = require('ws');
const net = require('net');

const WS_PORT = 4000;
const TCP_PORT = 4001;

function startWsGateway(httpServer) {
  // Attach to existing HTTP server (shares port 3000) under /ws path
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Browser client connected');

    // Open a TCP connection to the chat server for this browser client
    const tcp = net.createConnection({ port: TCP_PORT, host: '127.0.0.1' });
    let tcpBuffer = '';

    // ── Browser → TCP ─────────────────────────────────────────────────────
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        tcp.write(JSON.stringify(msg) + '\n');
      } catch {}
    });

    // ── TCP → Browser ─────────────────────────────────────────────────────
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

    // ── Cleanup ───────────────────────────────────────────────────────────
    ws.on('close', () => {
      console.log('[WS] Browser client disconnected');
      tcp.destroy();
    });

    tcp.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    tcp.on('error', (err) => {
      console.error('[WS-TCP] TCP error:', err.message);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    ws.on('error', (err) => {
      console.error('[WS] WebSocket error:', err.message);
      tcp.destroy();
    });
  });

  console.log(`[WS] Gateway ready at ws://localhost:3000/ws`);
  return wss;
}

module.exports = { startWsGateway };
