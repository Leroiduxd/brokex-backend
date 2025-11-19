// index.js (CommonJS)
const http = require('http');
const express = require('express');
const cors = require('cors');

const proofRouter = require('./services/proof');
const historyRouter = require('./services/history');
const { attachPriceWSS, rebalanceScheduler } = require('./services/wsBridge');
const { attachRawWSS } = require('./services/supraRawWS'); // 👈 NEW

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

// HTTP server (WSS attaché sur le même port)
const server = http.createServer(app);

// 1) WSS "propre" existant
attachPriceWSS(server);

// 2) NOUVEAU WSS "brut" Supra
attachRawWSS(server);

// Démarre le scheduler (rebalance horaires + refresh REST)
rebalanceScheduler();

server.listen(PORT, () => {
  console.log(`🚀 REST+WSS listening on http://127.0.0.1:${PORT}`);
  console.log(`   - GET /proof?pairs=0,1,2`);
  console.log(`   - GET /history?pair=1&interval=3600`);
  console.log(`   - WSS /ws/prices (snapshot mix Supra+REST)`);
  console.log(`   - WSS /ws/raw (flux brut Supra enrichi pairId/pairName)`);
});

