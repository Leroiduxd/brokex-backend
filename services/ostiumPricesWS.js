// services/ostiumPricesWS.js (CommonJS)
const WebSocket = require('ws');

let wss = null;
let interval = null;
let lastPayload = null;
let isFetching = false;

const OSTIUM_URL = 'https://metadata-backend.ostium.io/PricePublish/latest-prices';

async function fetchLatestPrices() {
  if (isFetching) return;
  isFetching = true;

  try {
    const res = await fetch(OSTIUM_URL, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Ostium API HTTP ${res.status}`);
    }

    const data = await res.json();

    // Payload envoyé aux clients
    lastPayload = JSON.stringify({
      type: 'ostium_latest_prices',
      ts: Date.now(),
      source: 'ostium',
      data
    });

    if (!wss) return;

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(lastPayload);
      }
    }
  } catch (err) {
    const errorPayload = JSON.stringify({
      type: 'ostium_latest_prices_error',
      ts: Date.now(),
      source: 'ostium',
      error: err.message
    });

    if (wss) {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(errorPayload);
        }
      }
    }

    console.error('[ostiumPricesWS] fetch error:', err.message);
  } finally {
    isFetching = false;
  }
}

function attachOstiumPriceWSS() {
  if (wss) return wss;

  wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', (ws) => {
    console.log('[ostiumPricesWS] client connected');

    // Envoie immédiatement le dernier payload si dispo
    if (lastPayload && ws.readyState === WebSocket.OPEN) {
      ws.send(lastPayload);
    }

    ws.on('message', (msg) => {
      // optionnel : ping custom ou commandes futures
      // console.log('[ostiumPricesWS] client message:', msg.toString());
    });

    ws.on('close', () => {
      console.log('[ostiumPricesWS] client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[ostiumPricesWS] client error:', err.message);
    });
  });

  return wss;
}

function handleOstiumPriceUpgrade(req, socket, head) {
  if (!wss) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
}

function startOstiumPriceScheduler() {
  if (interval) return;

  // premier fetch immédiat
  fetchLatestPrices();

  // puis toutes les 1 seconde
  interval = setInterval(fetchLatestPrices, 1000);

  console.log('[ostiumPricesWS] scheduler started (1 req/sec)');
}

module.exports = {
  attachOstiumPriceWSS,
  handleOstiumPriceUpgrade,
  startOstiumPriceScheduler
};
