// services/supraRawWS.js
// WebSocket brut vers Supra + WSS local /ws/raw
const { WebSocketServer, WebSocket } = require('ws');

// ⚠️ Clé Supra
const SUPRA_API_KEY =
  process.env.SUPRA_API_KEY ||
  '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2';

const WS_URL = 'wss://prod-kline-ws.supra.com';
const RESOLUTION = 1;

// Même liste de paires que ton gateway
const PAIRS = [
  'aapl_usd','amzn_usd','coin_usd','goog_usd','gme_usd','intc_usd','ko_usd','mcd_usd','msft_usd','ibm_usd',
  'meta_usd','nvda_usd','tsla_usd','aud_usd','eur_usd','gbp_usd','nzd_usd','usd_cad','usd_chf','usd_jpy',
  'xag_usd','xau_usd','btc_usdt','eth_usdt','sol_usdt','xrp_usdt','avax_usdt','doge_usdt','trx_usdt',
  'ada_usdt','sui_usdt','link_usdt','nike_usd','spdia_usd','qqqm_usd','iwm_usd'
];

// Mapping ID -> pair
const PAIR_MAP = {
  6004:'aapl_usd',6005:'amzn_usd',6010:'coin_usd',6003:'goog_usd',
  6011:'gme_usd',6009:'intc_usd',6059:'ko_usd',6068:'mcd_usd',
  6001:'msft_usd',6066:'ibm_usd',6006:'meta_usd',6002:'nvda_usd',
  6000:'tsla_usd',5010:'aud_usd',5000:'eur_usd',5002:'gbp_usd',
  5013:'nzd_usd',5011:'usd_cad',5012:'usd_chf',5001:'usd_jpy',
  5501:'xag_usd',5500:'xau_usd',0:'btc_usdt',1:'eth_usdt',
  10:'sol_usdt',14:'xrp_usdt',5:'avax_usdt',3:'doge_usdt',
  15:'trx_usdt',16:'ada_usdt',90:'sui_usdt',2:'link_usdt',
  6034:'nike_usd',6113:'spdia_usd',6114:'qqqm_usd',6115:'iwm_usd'
};

// Pair -> ID (pour enrichir les ticks)
const REVERSE_MAP = {};
for (const id in PAIR_MAP) {
  const pair = PAIR_MAP[id];
  REVERSE_MAP[pair] = Number(id);
}

let wssRaw = null;
let supraWS = null;

function log(...args) {
  console.log('[SupraRaw]', ...args);
}

function connectSupraAndBridge() {
  if (supraWS) {
    try { supraWS.close(); } catch {}
    supraWS = null;
  }

  log('Connecting to Supra WS:', WS_URL);

  supraWS = new WebSocket(WS_URL, {
    headers: { 'x-api-key': SUPRA_API_KEY }
  });

  supraWS.on('open', () => {
    log('Connected. Subscribing to', PAIRS.length, 'pairs.');

    const msg = {
      action: 'subscribe',
      channels: [
        {
          name: 'ohlc_datafeed',
          resolution: RESOLUTION,
          tradingPairs: PAIRS
        }
      ]
    };

    supraWS.send(JSON.stringify(msg));
  });

  supraWS.on('message', (buf) => {
    if (!wssRaw) return; // personne à servir

    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch (e) {
      log('Non-JSON message from Supra:', buf.toString());
      return;
    }

    if (msg.event === 'ohlc_datafeed' && Array.isArray(msg.payload)) {
      // Enrichir chaque tick avec pairId + pairName
      const enrichedPayload = msg.payload.map((tick) => {
        const p = tick.tradingPair;
        const pairId = REVERSE_MAP[p] ?? null;
        const pairName = p
          ? p.toUpperCase().replace('_USD', '/USD').replace('_USDT', '/USDT')
          : null;

        return {
          ...tick,
          pairId,
          pairName
        };
      });

      const out = JSON.stringify({
        event: msg.event,
        payload: enrichedPayload
      });

      // Broadcast brut à tous les clients /ws/raw
      wssRaw.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(out);
        }
      });
    } else {
      // Autres messages Supra (erreurs etc.) → on peut les forward aussi si tu veux
      const out = JSON.stringify(msg);
      wssRaw.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(out);
        }
      });
    }
  });

  supraWS.on('close', () => {
    log('Supra WS closed. Reconnecting in 3s...');
    setTimeout(connectSupraAndBridge, 3000);
  });

  supraWS.on('error', (err) => {
    log('Supra WS error:', err.message || err);
  });
}

/**
 * Monte un nouveau WebSocket local sur /ws/raw
 * qui renvoie les messages Supra enrichis (pairId + pairName)
 */
function attachRawWSS(server) {
  wssRaw = new WebSocketServer({
    server,
    path: '/ws/raw'
  });

  log('✅ Local raw WSS mounted at /ws/raw');

  wssRaw.on('connection', (socket) => {
    log('Client connected on /ws/raw');
    socket.send(JSON.stringify({
      type: 'welcome',
      msg: 'Supra raw stream. You will receive event=ohlc_datafeed.'
    }));
  });

  // Démarre la connexion Supra si ce n'est pas déjà fait
  connectSupraAndBridge();
}

module.exports = { attachRawWSS };
