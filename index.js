// index.js (CommonJS)
const http = require('http');
const express = require('express');
const cors = require('cors');

const proofRouter = require('./services/proof');
const historyRouter = require('./services/history');

// 🟢 1. IMPORT pour /ws/prices (Logique Originale)
const { 
    attachPriceWSS, 
    handlePriceUpgrade, 
    rebalanceScheduler 
} = require('./services/wsBridge');

// 🟢 2. IMPORT pour /ws/pricesraw (Nouveau Service)
const { 
    attachPriceWSS: attachRawPriceWSS, 
    handlePriceUpgrade: handleRawPriceUpgrade 
} = require('./services/rawwsBridge'); // <-- Assurez-vous que ce chemin est correct

// Ancienne import de 'supraRawWS' (pour /ws/raw)
const { attachRawWSS, handleRawUpgrade } = require('./services/supraRawWS');


const PORT = 3000; // port unique REST + WSS

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

// APIs REST
app.use(proofRouter);    // GET /proof
app.use(historyRouter);  // GET /history

// Healthcheck
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), v: 'gateway-cjs-1.0.0' });
});

// HTTP server
const server = http.createServer(app);

// Initialise les deux WebSocketServer (sans leur donner `server` directement)
// Le service original (wsBridge.js)
attachPriceWSS(); 
// Le nouveau service (rawwsBridge.js)
attachRawPriceWSS(); // 🟢 Initialisation du nouveau WSS
// Le service raw existant
attachRawWSS();

// Route les upgrades WebSocket selon le path
server.on('upgrade', (req, socket, head) => {
  
  // === Endpoint Original : /ws/prices ===
  if (req.url === '/ws/prices') {
    return handlePriceUpgrade(req, socket, head);
  }

  // 🟢 NOUVEL ENDPOINT : /ws/pricesraw
  if (req.url === '/ws/pricesraw') {
    return handleRawPriceUpgrade(req, socket, head); // 🟢 Pointe vers le handler du nouveau fichier
  }
  
  // === Endpoint "raw" existant ===
  if (req.url === '/ws/raw') {
    return handleRawUpgrade(req, socket, head);
  }

  // Autres chemins → on ferme
  socket.destroy();
});

// Scheduler (Supra WS + REST refresh) - Le scheduler est géré par l'un des services (wsBridge.js dans notre cas)
rebalanceScheduler();

server.listen(PORT, () => {
  console.log(`🚀 REST+WSS listening on http://127.0.0.1:${PORT}`);
  console.log(`   - GET /proof?pairs=0,1,2`);
  console.log(`   - GET /history?pair=1&interval=3600`);
  console.log(`   - WSS /ws/prices (Service WS Bridge original)`);
  console.log(`   - WSS /ws/pricesraw (NOUVEAU Service Raw WS Bridge)`); // 🟢 Mis à jour
  console.log(`   - WSS /ws/raw (flux brut Supra enrichi pairId/pairName)`);
});
