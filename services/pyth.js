// services/pyth.js
const express = require('express');
const fetch = require('node-fetch'); // Assure-toi d'avoir node-fetch d'installé si tu es en CJS

const router = express.Router();

const PYTH_TV_HISTORY_URL = 'https://benchmarks.pyth.network/v1/shims/tradingview/history';

// GET /pyth/history?symbol=Crypto.BTC/USD&resolution=60&from=1672531200&to=1672617600
router.get('/pyth/history', async (req, res) => {
  const { symbol, resolution, from, to } = req.query;

  // Vérification des paramètres requis pour l'API TradingView de Pyth
  if (!symbol || !resolution || !from || !to) {
    return res.status(400).json({ 
      error: 'Missing parameters. Requires: symbol, resolution, from, to' 
    });
  }

  try {
    const url = `${PYTH_TV_HISTORY_URL}?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;
    
    const r = await fetch(url);
    if (!r.ok) {
      throw new Error(`Pyth API error ${r.status}`);
    }

    const data = await r.json();
    
    // Pyth retourne "s": "ok" ou "s": "no_data"
    res.json(data);
  } catch (error) {
    console.error(`❌ [Pyth] History fetch failed:`, error.message);
    res.status(500).json({ error: 'Failed to fetch graph data from Pyth' });
  }
});

module.exports = router;
