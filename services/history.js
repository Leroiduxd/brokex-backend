// services/history.js (CommonJS)
const express = require('express');
const fetch = require('node-fetch'); // v2 (CJS)

const SUPRA_API_KEY = 'YOUR_SUPRA_API_KEY_HERE'; // <-- mets TA clé
const REST_BASE = 'https://prod-kline-rest.supra.com';
const HISTORY_BASE = `${REST_BASE}/history`;

const router = express.Router();

// Map assetId -> trading_pair
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

const cache = new Map(); // key=`pair-interval` -> { timestamp, data }

router.get('/history', async (req, res) => {
  const { pair, interval = 3600 } = req.query;
  if (!pair || isNaN(pair)) return res.status(400).json({ error: 'Missing or invalid "pair"' });

  const pairName = PAIR_MAP[Number(pair)];
  if (!pairName) return res.status(400).json({ error: `Unknown pair: ${pair}` });

  const cacheKey = `${pair}-${interval}`;
  const now = Date.now();
  const oneMinute = 60 * 1000;
  const cached = cache.get(cacheKey);

  const refreshCache = async () => {
    const startDate = now - 90 * 24 * 60 * 60 * 1000;
    const url = `${HISTORY_BASE}?trading_pair=${pairName}&startDate=${startDate}&endDate=${now}&interval=${interval}`;
    try {
      const r = await fetch(url, { headers: { 'x-api-key': SUPRA_API_KEY } });
      if (!r.ok) throw new Error(`Supra API error ${r.status}`);
      const data = await r.json();
      if (!data || !Object.keys(data).length) throw new Error('Empty response');
      cache.set(cacheKey, { timestamp: Date.now(), data });
      console.log(`♻️ [History] refreshed ${cacheKey}`);
    } catch (e) {
      console.warn(`❌ [History] refresh failed ${cacheKey}: ${e.message}`);
    }
  };

  if (cached && now - cached.timestamp < oneMinute) {
    console.log(`✅ [History] cache hit ${cacheKey}`);
    return res.json(cached.data);
  }

  if (cached) {
    console.log(`⚠️ [History] serve stale ${cacheKey} & refresh`);
    res.json(cached.data);
    refreshCache();
    return;
  }

  console.log(`🚀 [History] first fetch ${cacheKey}`);
  const startDate = now - 90 * 24 * 60 * 60 * 1000;
  const url = `${HISTORY_BASE}?trading_pair=${pairName}&startDate=${startDate}&endDate=${now}&interval=${interval}`;

  try {
    const r = await fetch(url, { headers: { 'x-api-key': SUPRA_API_KEY } });
    if (!r.ok) throw new Error(`Supra API error ${r.status}`);
    const data = await r.json();
    cache.set(cacheKey, { timestamp: Date.now(), data });
    res.json(data);
  } catch (e) {
    console.error(`❌ [History] initial fetch failed ${cacheKey}:`, e.message);
    res.status(500).json({ error: 'Failed to fetch data from Supra' });
  }
});

module.exports = router;

