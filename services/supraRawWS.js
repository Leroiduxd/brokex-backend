// services/supraRawWS.js
// WebSocket Supra BRUT + enrichissement pairName / pairId

const WebSocket = require("ws");

const SUPRA_API_KEY =
  process.env.SUPRA_API_KEY ||
  "PASTE_YOUR_SUPRA_API_KEY_HERE"; // ⚠️ Mets ta clé ici si besoin

const WS_URL = "wss://prod-kline-ws.supra.com";

// === Toutes tes paires à streamer ===
const PAIRS = [
  "aapl_usd","amzn_usd","coin_usd","goog_usd","gme_usd","intc_usd","ko_usd","mcd_usd","msft_usd","ibm_usd",
  "meta_usd","nvda_usd","tsla_usd","aud_usd","eur_usd","gbp_usd","nzd_usd","usd_cad","usd_chf","usd_jpy",
  "xag_usd","xau_usd","btc_usdt","eth_usdt","sol_usdt","xrp_usdt","avax_usdt","doge_usdt","trx_usdt",
  "ada_usdt","sui_usdt","link_usdt","nike_usd","spdia_usd","qqqm_usd","iwm_usd"
];

// === Mapping ID -> Pair ===
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

// === Mapping Pair -> ID (utilisé pour enrichir les ticks)
const REVERSE_MAP = {};
for (const id in PAIR_MAP) {
  const p = PAIR_MAP[id];
  REVERSE_MAP[p] = Number(id);
}

/**
 * Connecte au WebSocket Supra et appelle onTick() à chaque update
 */
function startSupraRawWS(onTick) {
  const ws = new WebSocket(WS_URL, {
    headers: { "x-api-key": SUPRA_API_KEY }
  });

  ws.on("open", () => {
    console.log("[SupraRawWS] Connected. Subscribing...");

    const msg = {
      action: "subscribe",
      channels: [
        {
          name: "ohlc_datafeed",
          resolution: 1,     // 1 minute / 1 seconde selon leur infra
          tradingPairs: PAIRS
        }
      ]
    };

    ws.send(JSON.stringify(msg));
  });

  ws.on("message", (buf) => {
    let message;
    try {
      message = JSON.parse(buf.toString());
    } catch (e) {
      console.error("[SupraRawWS] Non-JSON:", buf.toString());
      return;
    }

    if (message.event === "ohlc_datafeed") {
      for (const tick of message.payload) {
        const p = tick.tradingPair;

        // Ajout des infos supplémentaires
        const pairId = REVERSE_MAP[p] ?? null;
        const pairName = p ? p.toUpperCase().replace("_USD", "/USD").replace("_USDT","/USDT") : null;

        const enriched = {
          ...tick,
          pairId,
          pairName
        };

        onTick(enriched);
      }
    }
  });

  ws.on("close", () => {
    console.log("[SupraRawWS] Closed. Reconnecting in 3s...");
    setTimeout(() => startSupraRawWS(onTick), 3000);
  });

  ws.on("error", (err) => {
    console.error("[SupraRawWS] Error:", err.message);
  });
}

module.exports = { startSupraRawWS };
