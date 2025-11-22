// services/wsBridge.js (CommonJS)
const { WebSocketServer, WebSocket } = require('ws');
const fetch = require('node-fetch');

// === CONFIG en dur ===
const SUPRA_API_KEY = '4b8e7f3a1d9c6b2e5f0a8d7e1c4b9f2a3d5e6c7f8a0b1d3e2f4c5a9b7d0e8'; // <-- mets TA clé
const REST_BASE = 'https://prod-kline-rest.supra.com';
const WS_URL = 'wss://prod-kline-ws.supra.com';

const RESOLUTION = 1;
const CHUNK_SIZE = 30;
const REFRESH_MS = 2 * 60 * 1000; // re-évalue horaires toutes les 2 min
const MIN_GAP_MS = 250;

const PAIRS = [
  'aapl_usd','amzn_usd','coin_usd','goog_usd','gme_usd','intc_usd','ko_usd','mcd_usd','msft_usd','ibm_usd',
  'meta_usd','nvda_usd','tsla_usd','aud_usd','eur_usd','gbp_usd','nzd_usd','usd_cad','usd_chf','usd_jpy',
  'xag_usd','xau_usd','btc_usdt','eth_usdt','sol_usdt','xrp_usdt','avax_usdt','doge_usdt','trx_usdt',
  'ada_usdt','sui_usdt','link_usdt','orcle_usd','wti_usd','nike_usd','spdia_usd','qqqm_usd','iwm_usd'
];

const ALIASES = { orcle_usd: 'orcl_usd', nike_usd: 'nke_usd', spdia_usd: 'dia_usd' };
const normalize = (t) => ALIASES[t] || t;

const META = {
  aapl_usd:{id:6004,name:'APPLE INC.'},amzn_usd:{id:6005,name:'AMAZON'},coin_usd:{id:6010,name:'COINBASE'},
  goog_usd:{id:6003,name:'ALPHABET INC.'},gme_usd:{id:6011,name:'GAMESTOP CORP.'},intc_usd:{id:6009,name:'INTEL CORPORATION'},
  ko_usd:{id:6059,name:'COCA-COLA CO'},mcd_usd:{id:6068,name:"MCDONALD'S CORP"},msft_usd:{id:6001,name:'MICROSOFT CORP'},
  ibm_usd:{id:6066,name:'IBM'},meta_usd:{id:6006,name:'META PLATFORMS INC.'},nvda_usd:{id:6002,name:'NVIDIA CORP'},
  tsla_usd:{id:6000,name:'TESLA INC'},aud_usd:{id:5010,name:'AUSTRALIAN DOLLAR'},eur_usd:{id:5000,name:'EURO'},
  gbp_usd:{id:5002,name:'GREAT BRITAIN POUND'},nzd_usd:{id:5013,name:'NEW ZEALAND DOLLAR'},usd_cad:{id:5011,name:'CANADIAN DOLLAR'},
  usd_chf:{id:5012,name:'SWISS FRANC'},usd_jpy:{id:5001,name:'JAPANESE YEN'},xag_usd:{id:5501,name:'SILVER'},
  xau_usd:{id:5500,name:'GOLD'},wti_usd:{id:5503,name:'WEST TEXAS INTERMEDIATE CRUDE'},btc_usdt:{id:0,name:'BITCOIN'},
  eth_usdt:{id:1,name:'ETHEREUM'},sol_usdt:{id:10,name:'SOLANA'},xrp_usdt:{id:14,name:'RIPPLE'},avax_usdt:{id:5,name:'AVALANCHE'},
  doge_usdt:{id:3,name:'DOGECOIN'},trx_usdt:{id:15,name:'TRON'},ada_usdt:{id:16,name:'CARDANO'},sui_usdt:{id:90,name:'SUI'},
  link_usdt:{id:2,name:'CHAINLINK'},orcl_usd:{id:6038,name:'ORACLE CORPORATION'},dia_usd:{id:6113,name:'SPDR DOW JONES (DIA)'},
  qqqm_usd:{id:6114,name:'NASDAQ-100 ETF (QQQM)'},iwm_usd:{id:6115,name:'ISHARES RUSSELL 2000 ETF (IWM)'},
  nke_usd:{id:6034,name:'NIKE INC'}
};

const CRYPTO = ['btc_usdt','eth_usdt','sol_usdt','xrp_usdt','avax_usdt','doge_usdt','trx_usdt','ada_usdt','sui_usdt','link_usdt'];
const FOREX = ['aud_usd','eur_usd','gbp_usd','nzd_usd','usd_cad','usd_chf','usd_jpy'];
const COMMODITIES = ['xau_usd','xag_usd','wti_usd'];
const US_EQ = ['aapl_usd','amzn_usd','coin_usd','goog_usd','gme_usd','intc_usd','ko_usd','mcd_usd','msft_usd','ibm_usd','meta_usd','nvda_usd','tsla_usd','orcl_usd','nke_usd'];
const US_ETF = ['dia_usd','qqqm_usd','iwm_usd'];

const WD = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
const TZ_PARIS = 'Europe/Paris';
const TZ_NY = 'America/New_York';

const state = {};
let currentWSSet = [];
let supraWS = null;
let wss = null;

// 🔻 Watchdog d’inactivité Supra
let supraWSLastActivity = 0;
let supraWSInactivityTimer = null;
const SUPRA_INACTIVITY_LIMIT_MS = 2000; // 2 secondes sans data = on reconnecte

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function clearSupraInactivityTimer() {
  if (supraWSInactivityTimer) {
    clearInterval(supraWSInactivityTimer);
    supraWSInactivityTimer = null;
  }
}

function partsFromTZ(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(date);
  const wdStr = parts.find(p => p.type === 'weekday')?.value;
  const hour = +parts.find(p => p.type === 'hour')?.value;
  const minute = +parts.find(p => p.type === 'minute')?.value;
  return { wd: WD[wdStr] ?? 0, hour, minute };
}

function isUsEquityOpen(d = new Date()) {
  const { wd, hour, minute } = partsFromTZ(d, TZ_NY);
  if (wd <= 0 || wd === 6) return false; // dimanche ou samedi
  const m = hour * 60 + minute;
  return m >= 9 * 60 + 30 && m < 16 * 60 + 30; // 9h30–16h30 NY
}

function isForexLikeOpen(d = new Date()) {
  const { wd, hour } = partsFromTZ(d, TZ_PARIS);
  if (wd === 0) return hour >= 22;      // dimanche 22h+
  if (wd >= 1 && wd <= 4) return true;  // lundi–jeudi H24
  if (wd === 5) return hour < 23;       // vendredi jusqu’à 23h
  return false;
}

const isCryptoOpen = () => true;

function initCache(p) {
  if (!state[p]) {
    const m = META[p] || { id: null, name: 'UNKNOWN' };
    state[p] = { id: m.id ?? null, name: m.name || 'UNKNOWN' };
  }
}

function upsertFromWS(item) {
  const p = normalize(item.tradingPair || '');
  if (!p) return;
  initCache(p);
  const live = item.currentPrice ?? item.close;
  if (live != null) state[p].wsPriceStr = String(live);
  if (item.time != null) state[p].wsTime = String(item.time);
  if (item.timestamp) state[p].wsTimestamp = item.timestamp;
}

async function fetchLatestREST(p) {
  try {
    const r = await fetch(`${REST_BASE}/latest?trading_pair=${p}`, { headers: { 'x-api-key': SUPRA_API_KEY } });
    if (!r.ok) {
      if (r.status === 429) console.warn(`[REST] 429 ${p}`);
      else console.warn(`[REST] ${r.status} ${p}`);
      return;
    }
    const raw = await r.json().catch(() => ({}));
    const d = Array.isArray(raw?.instruments) ? raw.instruments[0] : null;
    if (!d) return;
    if (d.currentPrice != null) state[p].restPriceStr = String(d.currentPrice);
    if (d['24h_high'] != null)   state[p].h24 = String(d['24h_high']);
    if (d['24h_low']  != null)   state[p].l24 = String(d['24h_low']);
    if (d['24h_change'] != null) state[p].ch24 = String(d['24h_change']);
    if (d.timestamp) state[p].restTimestamp = d.timestamp;
    if (d.time != null) state[p].restTime = String(d.time);
  } catch (e) {
    console.error(`[REST] ${p}:`, e?.message);
  }
}

async function fetchOnceREST(pairs) {
  for (const raw of pairs) {
    const p = normalize(raw);
    initCache(p);
    await fetchLatestREST(p);
    await sleep(MIN_GAP_MS);
  }
}

function isPairOpen(p) {
  return currentWSSet.includes(p);
}

function buildPageForPair(p) {
  const meta = META[p] || { id: null, name: 'UNKNOWN' };
  const s = state[p] || {};
  const open = isPairOpen(p);
  const price = open ? (s.wsPriceStr ?? s.restPriceStr) : (s.restPriceStr ?? s.wsPriceStr);
  const time = s.wsTime ?? s.restTime;
  const ts = s.wsTimestamp ?? s.restTimestamp;
  const haveAny = price || s.h24 || s.l24 || s.ch24 || time || ts;
  const instruments = haveAny ? [{
    time: time ? String(time) : undefined,
    timestamp: ts || undefined,
    currentPrice: price ? String(price) : undefined,
    '24h_high': s.h24 ?? undefined,
    '24h_low': s.l24 ?? undefined,
    '24h_change': s.ch24 ?? undefined,
    tradingPair: p
  }] : [];
  return {
    id: meta.id ?? null,
    name: meta.name || 'UNKNOWN',
    currentPage: 1,
    totalPages: 1,
    totalRecords: instruments.length,
    pageSize: 1,
    instruments
  };
}

function buildSnapshot() {
  const out = {};
  for (const raw of PAIRS) {
    const p = normalize(raw);
    out[p] = buildPageForPair(p);
  }
  return JSON.stringify(out);
}

function setsDiff(a, b) {
  const A = new Set(a), B = new Set(b);
  const add = [...B].filter(x => !A.has(x));
  const del = [...A].filter(x => !B.has(x));
  return { add, del, changed: add.length || del.length };
}

function computeOpenSets() {
  const openPairs = new Set();
  const closedPairs = new Set();
  const openCrypto = isCryptoOpen();
  const openFx = isForexLikeOpen();
  const openEq = isUsEquityOpen();

  for (const p of CRYPTO) (openCrypto ? openPairs : closedPairs).add(normalize(p));
  for (const p of [...FOREX, ...COMMODITIES]) (openFx ? openPairs : closedPairs).add(normalize(p));
  for (const p of [...US_EQ, ...US_ETF]) (openEq ? openPairs : closedPairs).add(normalize(p));

  for (const raw of PAIRS) {
    const p = normalize(raw);
    if (!openPairs.has(p) && !closedPairs.has(p)) closedPairs.add(p);
  }

  return { open: [...openPairs], closed: [...closedPairs] };
}

/**
 * Connexion au WebSocket Supra avec watchdog d’inactivité.
 * Si > 2s sans message, on ferme et on rouvre avec les mêmes paires.
 */
function openSupraWS(pairs) {
  // Nettoyer ancienne connexion & timer
  try {
    if (supraWS) supraWS.close();
  } catch {}
  clearSupraInactivityTimer();

  currentWSSet = [...pairs];
  supraWS = new WebSocket(WS_URL, { headers: { 'x-api-key': SUPRA_API_KEY } });

  // Référence locale pour éviter les effets de bord en cas de reconnexion
  const thisWS = supraWS;

  thisWS.on('open', () => {
    // Si entre-temps une nouvelle connexion a été créée, on ignore celle-ci
    if (supraWS !== thisWS) {
      console.log('[SupraWS] open (stale) -> ignored');
      return;
    }

    console.log(`[SupraWS] Open. Subscribing to ${pairs.length} pairs.`);
    supraWSLastActivity = Date.now(); // on vient d'ouvrir

    // Abonnements
    for (const g of chunk(pairs, CHUNK_SIZE)) {
      const msg = {
        action: 'subscribe',
        channels: [{
          name: 'ohlc_datafeed',
          resolution: RESOLUTION,
          tradingPairs: g
        }]
      };
      thisWS.send(JSON.stringify(msg));
    }

    // Watchdog d'inactivité : si > 2s sans message, on reconnecte
    supraWSInactivityTimer = setInterval(() => {
      // Si cette connexion n'est plus la connexion active, on ignore
      if (supraWS !== thisWS) return;
      if (!thisWS || thisWS.readyState !== WebSocket.OPEN) return;

      const diff = Date.now() - supraWSLastActivity;
      if (diff > SUPRA_INACTIVITY_LIMIT_MS) {
        console.warn(`[SupraWS] No data for ${diff} ms, attempting reconnect...`);
        clearSupraInactivityTimer();
        try { thisWS.terminate(); } catch {}
        // on ré-ouvre avec le même set de paires
        openSupraWS(currentWSSet);
      }
    }, 500); // check toutes les 500ms
  });

  thisWS.on('message', (buf) => {
    // Ignorer les vieux sockets
    if (supraWS !== thisWS) return;

    // On a reçu un message -> on reset le timer d'inactivité
    supraWSLastActivity = Date.now();

    try {
      const msg = JSON.parse(buf.toString());
      if (msg.event === 'ohlc_datafeed' && Array.isArray(msg.payload)) {
        for (const k of msg.payload) upsertFromWS(k);
        const payload = buildSnapshot();
        if (wss) {
          wss.clients.forEach((c) => {
            if (c.readyState === WebSocket.OPEN) {
              try { c.send(payload); } catch {}
            }
          });
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  thisWS.on('error', (e) => {
    if (supraWS !== thisWS) return; // vieux socket, on s'en fout
    console.error('[SupraWS] error:', e?.message || e);
    clearSupraInactivityTimer();
  });

  thisWS.on('close', () => {
    if (supraWS !== thisWS) {
      console.log('[SupraWS] closed (stale) -> ignored');
      return;
    }
    console.log('[SupraWS] closed (active).');
    clearSupraInactivityTimer();
    currentWSSet = [];
  });
}

async function rebalance() {
  console.log('[Rebalance] evaluate market hours...');
  const { open, closed } = computeOpenSets();
  const { changed } = setsDiff(currentWSSet, open);

  if (changed) {
    console.log(`[Rebalance] WS set changed -> resubscribe (${open.length} pairs)`);
    openSupraWS(open);
  } else {
    currentWSSet = open;
  }

  const all = [...closed, ...open];
  if (all.length) {
    console.log(`[Rebalance] REST refresh for ${all.length} pairs`);
    await fetchOnceREST(all);
  }
}

/**
 * Initialise le WebSocketServer pour /ws/prices (sans attacher le server ici)
 * → endpoint inchangé pour les clients : ws://.../ws/prices
 */
function attachPriceWSS() {
  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: {
      zlibDeflateOptions: { level: 9 },
      zlibInflateOptions: { chunkSize: 1024 },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      threshold: 0
    }
  });

  console.log('✅ WSS mounted at /ws/prices');

  wss.on('connection', (ws) => {
    console.log('🟢 WS client connected');
    try { ws.send(buildSnapshot()); } catch {}
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Tick global (1s)
  setInterval(() => {
    const payload = buildSnapshot();
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) {
        try { c.send(payload); } catch {}
      }
    });
  }, 1000);

  // Heartbeat (pour tes clients, pas pour Supra)
  setInterval(() => {
    wss.clients.forEach((c) => {
      if (c.isAlive === false) c.terminate();
      c.isAlive = false;
      try { c.ping(); } catch {}
    });
  }, 30000);
}

/**
 * Handler d'upgrade pour /ws/prices
 * Appelé depuis server.on('upgrade') dans index.js
 */
function handlePriceUpgrade(req, socket, head) {
  if (!wss) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
}

function rebalanceScheduler() {
  (async () => { await rebalance(); })();
  setInterval(rebalance, REFRESH_MS);
}

module.exports = {
  attachPriceWSS,
  handlePriceUpgrade,
  rebalanceScheduler
};

