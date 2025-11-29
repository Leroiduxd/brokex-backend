const express = require('express');
const fetch = require('node-fetch'); // v2 (CJS)

const SUPRA_API_KEY = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2'; // <-- mets TA clé
const REST_BASE = 'https://prod-kline-rest.supra.com';
const HISTORY_BASE = `${REST_BASE}/history`;

const router = express.Router();

// Map assetId -> trading_pair (liste mise à jour avec les nouvelles paires)
const PAIR_MAP = {
    // Crypto (0-99)
    0: 'btc_usdt',
    1: 'eth_usdt',
    2: 'link_usdt',
    3: 'doge_usdt',
    5: 'avax_usdt',
    10: 'sol_usdt',
    14: 'xrp_usdt',
    15: 'trx_usdt',
    16: 'ada_usdt',
    90: 'sui_usdt',

    // Forex (5000 series)
    5000: 'eur_usd',
    5001: 'usd_jpy',
    5002: 'gbp_usd',
    5003: 'eur_gbp', // NEW
    5004: 'usd_krw', // NEW
    5005: 'usd_hkd', // NEW
    5006: 'usd_inr', // NEW
    5007: 'usd_cny', // NEW
    5008: 'usd_sgd', // NEW
    5009: 'usd_thb', // NEW
    5010: 'aud_usd',
    5011: 'usd_cad',
    5012: 'usd_chf',
    5013: 'nzd_usd',
    5014: 'usd_vnd', // NEW
    5015: 'usd_php', // NEW
    5016: 'usd_uah', // NEW
    5017: 'usd_pkr', // NEW
    5018: 'usd_brl', // NEW
    5019: 'usd_rub', // NEW
    5020: 'usd_idr', // NEW
    5021: 'usd_try', // NEW
    5022: 'usd_ngn', // NEW
    5023: 'usd_ars', // NEW
    5024: 'eur_aud', // NEW
    5025: 'gbp_jpy', // NEW
    5026: 'chf_jpy', // NEW
    5027: 'eur_chf', // NEW
    5028: 'aud_jpy', // NEW
    5029: 'gbp_cad', // NEW
    5030: 'nzd_jpy', // NEW

    // Commodities (5500 series)
    5500: 'xau_usd',
    5501: 'xag_usd',
    5503: 'wti_usd', // NEW
    5504: 'xpd_usd', // NEW
    5505: 'xpt_usd', // NEW
    5506: 'xg_usd', // NEW

    // US Equities & ETFs (6000 series)
    6000: 'tsla_usd',
    6001: 'msft_usd',
    6002: 'nvda_usd',
    6003: 'goog_usd',
    6004: 'aapl_usd',
    6005: 'amzn_usd',
    6006: 'meta_usd',
    6007: 'nflx_usd', // NEW
    6008: 'pypl_usd', // NEW
    6009: 'intc_usd',
    6010: 'coin_usd',
    6011: 'gme_usd',
    6012: 'amd_usd', // NEW
    6013: 'dis_usd', // NEW
    6014: 'brk.a_usd', // NEW
    6015: 'baba_usd', // NEW
    6016: 'xom_usd', // NEW
    6017: 'tmo_usd', // NEW
    6018: 'unh_usd', // NEW
    6019: 'lly_usd', // NEW
    6020: 'hd_usd', // NEW
    6021: 'ttd_usd', // NEW
    6022: 'crm_usd', // NEW
    6023: 'qcom_usd', // NEW
    6024: 'pfe_usd', // NEW
    6025: 'abnb_usd', // NEW
    6026: 'shop_usd', // NEW
    6027: 'jd_usd', // NEW
    6028: 'cvx_usd', // NEW
    6029: 'jpm_usd', // NEW
    6030: 'mu_usd', // NEW
    6031: 'snap_usd', // NEW
    6032: 'uber_usd', // NEW
    6033: 'zm_usd', // NEW
    6034: 'nike_usd', // Existed as nike_usd
    6035: 'jnj_usd', // NEW
    6036: 'pg_usd', // NEW
    6037: 'cost_usd', // NEW
    6038: 'orcl_usd', // NEW
    6039: 'mstr_usd', // NEW
    6040: 'spy_usd', // NEW
    6051: 'v_usd', // NEW
    6052: 'ma_usd', // NEW
    6053: 'wmt_usd', // NEW
    6054: 'bac_usd', // NEW
    6055: 'abbv_usd', // NEW
    6056: 'wfc_usd', // NEW
    6057: 'csco_usd', // NEW
    6058: 'mrk_usd', // NEW
    6059: 'ko_usd',
    6060: 'now_usd', // NEW
    6061: 'acn_usd', // NEW
    6062: 'abt_usd', // NEW
    6063: 'ge_usd', // NEW
    6064: 'lin_usd', // NEW
    6065: 'isrg_usd', // NEW
    6066: 'ibm_usd',
    6067: 'pep_usd', // NEW
    6068: 'mcd_usd',
    6069: 'gs_usd', // NEW
    6070: 'pm_usd', // NEW
    6071: 'cat_usd', // NEW
    6072: 'adbe_usd', // NEW
    6073: 'axp_usd', // NEW
    6074: 'ms_usd', // NEW
    6075: 'txn_usd', // NEW
    6076: 'intu_usd', // NEW
    6077: 'trtx_usd', // NEW
    6078: 'vz_usd', // NEW
    6079: 'spgi_usd', // NEW
    6080: 'pltr_usd', // NEW
    6081: 'dhr_usd', // NEW
    6082: 'bkng_usd', // NEW
    6083: 'c_usd', // NEW
    6084: 'amat_usd', // NEW
    6085: 'unp_usd', // NEW
    6086: 'bsx_usd', // NEW
    6087: 'nee_usd', // NEW
    6088: 'low_usd', // NEW
    6089: 'blk_usd', // NEW
    6090: 'amgn_usd', // NEW
    6091: 'etn_usd', // NEW
    6092: 'hon_usd', // NEW
    6093: 'cmcsa_usd', // NEW
    6094: 'pgr_usd', // NEW
    6095: 'tjx_usd', // NEW
    6096: 'syk_usd', // NEW
    6097: 'bx_usd', // NEW
    6098: 'anet_usd', // NEW
    6099: 'de_usd', // NEW
    6100: 'cop_usd', // NEW
    6101: 'ba_usd', // NEW
    6102: 'adp_usd', // NEW
    6103: 'bmy_usd', // NEW
    6104: 'panw_usd', // NEW
    6105: 'schw_usd', // NEW
    6106: 'fi_usd', // NEW
    6107: 'gild_usd', // NEW
    6108: 'gev_usd', // NEW
    6109: 'mdt_usd', // NEW
    6110: 'vrtx_usd', // NEW
    6111: 'sbux_usd', // NEW
    6113: 'spdia_usd', // Existed as spdia_usd
    6114: 'qqqm_usd',
    6115: 'iwm_usd',
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
        // Fetch data for the last 90 days
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

