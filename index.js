// index.js (CommonJS)
const http = require('http');
const express = require('express');
const cors = require('cors');

const proofRouter = require('./services/proof');
const historyRouter = require('./services/history');

// 🟢 1. Service original /ws/prices (crypto + petit set)
const {
  attachPriceWSS,
  handlePriceUpgrade,
  rebalanceScheduler
} = require('./services/wsBridge');

// 🟢 2. Nouveau service /ws/pricesraw (RWA / Forex / Commodities)
const {
  attachPriceWSS: attachRawPriceWSS,
  handlePriceUpgrade: handleRawPriceUpgrade,
  rebalanceScheduler: rebalanceSchedulerRaw
} = require('./services/rawwsBridge');

// 🟢 3. Service /ws/raw (flux brut Supra enrichi)
const { attachRawWSS, handleRawUpgrade } = require('./services/supraRawWS');

const PORT = 3000; // port unique REST + WSS

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

// APIs REST
app.use(proofRouter);    // GET /proof
app.use(historyRouter);  // GET /history

// Healthcheck
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), v: 'gateway-cjs-1.0.0' });
});

// HTTP server
const server = http.createServer(app);

// ─────────────────────────────────────────────
// Initialisation des 3 WebSocketServer
// ─────────────────────────────────────────────

// Service original (wsBridge.js) → /ws/prices
attachPriceWSS();

// Nouveau service (rawwsBridge.js) → /ws/pricesraw
attachRawPriceWSS();

// Service raw existant → /ws/raw
attachRawWSS();

// ─────────────────────────────────────────────
// Routing des upgrades WebSocket selon le path
// ─────────────────────────────────────────────

server.on('upgrade', (req, socket, head) => {
  // === Endpoint Original : /ws/prices ===
  if (req.url === '/ws/prices') {
    return handlePriceUpgrade(req, socket, head);
  }

  // === Nouveau endpoint : /ws/pricesraw ===
  if (req.url === '/ws/pricesraw') {
    return handleRawPriceUpgrade(req, socket, head);
  }

  // === Endpoint "raw" existant ===
  if (req.url === '/ws/raw') {
    return handleRawUpgrade(req, socket, head);
  }

  // Autres chemins → on ferme
  socket.destroy();
});

// ─────────────────────────────────────────────
// Schedulers : WS Supra + REST refresh
// ─────────────────────────────────────────────

// Scheduler pour /ws/prices (crypto + petit set)
rebalanceScheduler();

// Scheduler pour /ws/pricesraw (RWA / Forex / Commodities)
rebalanceSchedulerRaw();

server.listen(PORT, () => {
  console.log(`🚀 REST+WSS listening on http://127.0.0.1:${PORT}`);
  console.log(`   - GET /proof?pairs=0,1,2`);
  console.log(`   - GET /history?pair=1&interval=3600`);
  console.log(`   - WSS /ws/prices      (Service WS Bridge original)`);
  console.log(`   - WSS /ws/pricesraw   (NOUVEAU Service Raw WS Bridge)`);
  console.log(`   - WSS /ws/raw         (Flux brut Supra enrichi pairId/pairName)`);
});

