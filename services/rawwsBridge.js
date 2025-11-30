// services/wsBridge.js (CommonJS)
const { WebSocketServer, WebSocket } = require('ws');
const fetch = require('node-fetch');

// === CONFIG en dur ===
const SUPRA_API_KEY = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2'; // <-- mets TA clé
const REST_BASE = 'https://prod-kline-rest.supra.com';
const WS_URL = 'wss://prod-kline-ws.supra.com';

const RESOLUTION = 1;
const CHUNK_SIZE = 30;
const REFRESH_MS = 2 * 60 * 1000; // re-évalue horaires toutes les 2 min
const MIN_GAP_MS = 250;

// 🟢 LISTE DES PAIRES MISE À JOUR (Paires listées, sans les paires de devises demandées)
const PAIRS = [
    // US Stocks & ETFs (6000-6111)
    'tsla_usd','msft_usd','nvda_usd','goog_usd','aapl_usd','amzn_usd','meta_usd','nflx_usd','pypl_usd','intc_usd',
    'coin_usd','gme_usd','amd_usd','dis_usd','brk.a_usd','baba_usd','xom_usd','tmo_usd','unh_usd','lly_usd',
    'hd_usd','ttd_usd','crm_usd','qcom_usd','pfe_usd','abnb_usd','shop_usd','jd_usd','cvx_usd','jpm_usd',
    'mu_usd','snap_usd','uber_usd','zm_usd','nike_usd','jnj_usd','pg_usd','cost_usd','orcle_usd','mstr/usd',
    'spy_usd','v_usd','ma_usd','wmt_usd','bac_usd','abbv_usd','wfc_usd','csco_usd','mrk_usd','ko_usd',
    'now_usd','acn_usd','abt_usd','ge_usd','lin_usd','isrg_usd','ibm_usd','pep_usd','mcd_usd','gs_usd',
    'pm_usd','cat_usd','adbe_usd','axp_usd','ms_usd','txn_usd','intu_usd','trtx_usd','vz_usd','spgi_usd',
    'pltr_usd','dhr_usd','bkng_usd','c_usd','amat_usd','unp_usd','bsx_usd','nee_usd','low_usd','blk_usd',
    'amgn_usd','etn_usd','hon_usd','cmcsa_usd','pgr_usd','tjx_usd','syk_usd','bx_usd','anet_usd','de_usd',
    'cop_usd','ba_usd','adp_usd','bmy_usd','panw_usd','schw_usd','fi_usd','gild_usd','gev_usd','mdt_usd',
    'vrtx_usd','sbux_usd',
    // ETFs from previous step (dia_usd, qqqm_usd, iwm_usd)
    'spdia_usd','qqqm_usd','iwm_usd',
    // Forex (5000) - SANS USD_NGN, USD_ARS, USD_IDR, USD_BRL, USD_PKR, USD_UAH, USD_PHP, USD_VND
    'eur_usd','usd_jpy','gbp_usd','eur_gbp','usd_krw','usd_hkd','usd_inr','usd_cny','usd_sgd','usd_thb',
    'aud_usd','usd_cad','usd_chf','nzd_usd','usd_rub',
    'usd_try','eur_aud','gbp_jpy','chf_jpy','eur_chf','aud_jpy','gbp_cad',
    'nzd_jpy',
    // Commodities (5500)
    'xau_usd','xag_usd','wti_usd','xpd_usd','xpt_usd','xg_usd' 
];

// 🟢 ALIASES MIS À JOUR (Correction des typos courantes + le format MSTR)
const ALIASES = { 
    'orcle_usd': 'orcl_usd', 
    'nike_usd': 'nke_usd', 
    'spdia_usd': 'dia_usd',
    'mstr/usd': 'mstr_usd', // Simplification de MSTR/USD en MSTR_USD pour la cohérence
    'spy_usd': 'spy_usd'     // Laisse SPY_USD tel quel
};
const normalize = (t) => ALIASES[t] || t;

// 🟢 OBJET META MIS À JOUR (SANS les paires de devises demandées)
const META = {
    // 6000: US Equities & ETFs
    'tsla_usd':{id:6000,name:'TESLA INC'},
    'msft_usd':{id:6001,name:'MICROSOFT CORP'},
    'nvda_usd':{id:6002,name:'NVIDIA CORP'},
    'goog_usd':{id:6003,name:'ALPHABET INC.'},
    'aapl_usd':{id:6004,name:'APPLE INC.'},
    'amzn_usd':{id:6005,name:'AMAZON.COM, INC.'},
    'meta_usd':{id:6006,name:'META PLATFORMS INC.'},
    'nflx_usd':{id:6007,name:'NETFLIX, INC.'},
    'pypl_usd':{id:6008,name:'PAYPAL HOLDINGS, INC.'},
    'intc_usd':{id:6009,name:'INTEL CORPORATION'},
    'coin_usd':{id:6010,name:'COINBASE GLOBAL, INC.'},
    'gme_usd':{id:6011,name:'GAMESTOP CORP.'},
    'amd_usd':{id:6012,name:'ADVANCED MICRO DEVICES, INC.'},
    'dis_usd':{id:6013,name:'THE WALT DISNEY COMPANY'},
    'brk.a_usd':{id:6014,name:'BERKSHIRE HATHAWAY INC. (CLASS A)'},
    'baba_usd':{id:6015,name:'ALIBABA GROUP HOLDING LIMITED'},
    'xom_usd':{id:6016,name:'EXXON MOBIL CORPORATION'},
    'tmo_usd':{id:6017,name:'THERMO FISHER SCIENTIFIC INC.'},
    'unh_usd':{id:6018,name:'UNITEDHEALTH GROUP INCORPORATED'},
    'lly_usd':{id:6019,name:'ELI LILLY AND COMPANY'},
    'hd_usd':{id:6020,name:'THE HOME DEPOT, INC.'},
    'ttd_usd':{id:6021,name:'THE TRADE DESK, INC.'},
    'crm_usd':{id:6022,name:'SALESFORCE, INC.'},
    'qcom_usd':{id:6023,name:'QUALCOMM INCORPORATED'},
    'pfe_usd':{id:6024,name:'PFIZER INC.'},
    'abnb_usd':{id:6025,name:'AIRBNB, INC.'},
    'shop_usd':{id:6026,name:'SHOPIFY INC.'},
    'jd_usd':{id:6027,name:'JD.COM, INC.'},
    'cvx_usd':{id:6028,name:'CHEVRON CORPORATION'},
    'jpm_usd':{id:6029,name:'JPMORGAN CHASE & CO.'},
    'mu_usd':{id:6030,name:'MICRON TECHNOLOGY, INC.'},
    'snap_usd':{id:6031,name:'SNAP INC.'},
    'uber_usd':{id:6032,name:'UBER TECHNOLOGIES, INC.'},
    'zm_usd':{id:6033,name:'ZOOM VIDEO COMMUNICATIONS, INC.'},
    'nke_usd':{id:6034,name:'NIKE INC'}, // Aliasé à partir de nike_usd
    'jnj_usd':{id:6035,name:'JOHNSON & JOHNSON'},
    'pg_usd':{id:6036,name:'THE PROCTER & GAMBLE COMPANY'},
    'cost_usd':{id:6037,name:'COSTCO WHOLESALE CORPORATION'},
    'orcl_usd':{id:6038,name:'ORACLE CORPORATION'}, // Aliasé à partir de orcle_usd
    'mstr_usd':{id:6039,name:'MICROSTRATEGY INCORPORATED'}, // Aliasé à partir de mstr/usd
    'spy_usd':{id:6040,name:'SPDR S&P 500 ETF TRUST'},
    'v_usd':{id:6051,name:'VISA INC.'},
    'ma_usd':{id:6052,name:'MASTERCARD INCORPORATED'},
    'wmt_usd':{id:6053,name:'WALMART INC.'},
    'bac_usd':{id:6054,name:'BANK OF AMERICA CORPORATION'},
    'abbv_usd':{id:6055,name:'ABBVIE INC.'},
    'wfc_usd':{id:6056,name:'WELLS FARGO & COMPANY'},
    'csco_usd':{id:6057,name:'CISCO SYSTEMS, INC.'},
    'mrk_usd':{id:6058,name:'MERCK & CO., INC.'},
    'ko_usd':{id:6059,name:'COCA-COLA CO'},
    'now_usd':{id:6060,name:'SERVICENOW, INC.'},
    'acn_usd':{id:6061,name:'ACCENTURE PLC'},
    'abt_usd':{id:6062,name:'ABBOTT LABORATORIES'},
    'ge_usd':{id:6063,name:'GENERAL ELECTRIC COMPANY (GE AEROSPACE)'},
    'lin_usd':{id:6064,name:'LINDE PLC'},
    'isrg_usd':{id:6065,name:'INTUITIVE SURGICAL, INC.'},
    'ibm_usd':{id:6066,name:'INTERNATIONAL BUSINESS MACHINES CORP.'},
    'pep_usd':{id:6067,name:'PEPSICO, INC.'},
    'mcd_usd':{id:6068,name:"MCDONALD'S CORP"},
    'gs_usd':{id:6069,name:'THE GOLDMAN SACHS GROUP, INC.'},
    'pm_usd':{id:6070,name:'PHILIP MORRIS INTERNATIONAL INC.'},
    'cat_usd':{id:6071,name:'CATERPILLAR INC.'},
    'adbe_usd':{id:6072,name:'ADOBE INC.'},
    'axp_usd':{id:6073,name:'AMERICAN EXPRESS COMPANY'},
    'ms_usd':{id:6074,name:'MORGAN STANLEY'},
    'txn_usd':{id:6075,name:'TEXAS INSTRUMENTS INCORPORATED'},
    'intu_usd':{id:6076,name:'INTUIT INC.'},
    'trtx_usd':{id:6077,name:'TPG RE FINANCE TRUST, INC.'},
    'vz_usd':{id:6078,name:'VERIZON COMMUNICATIONS INC.'},
    'spgi_usd':{id:6079,name:'S&P GLOBAL INC.'},
    'pltr_usd':{id:6080,name:'PALANTIR TECHNOLOGIES INC.'},
    'dhr_usd':{id:6081,name:'DANAHER CORPORATION'},
    'bkng_usd':{id:6082,name:'BOOKING HOLDINGS INC.'},
    'c_usd':{id:6083,name:'CITIGROUP INC.'},
    'amat_usd':{id:6084,name:'APPLIED MATERIALS, INC.'},
    'unp_usd':{id:6085,name:'UNION PACIFIC CORPORATION'},
    'bsx_usd':{id:6086,name:'BOSTON SCIENTIFIC CORPORATION'},
    'nee_usd':{id:6087,name:'NEXTERA ENERGY, INC.'},
    'low_usd':{id:6088,name:'LOWE\'S COMPANIES, INC.'},
    'blk_usd':{id:6089,name:'BLACKROCK, INC.'},
    'amgn_usd':{id:6090,name:'AMGEN INC.'},
    'etn_usd':{id:6091,name:'EATON CORPORATION PLC'},
    'hon_usd':{id:6092,name:'HONEYWELL INTERNATIONAL INC.'},
    'cmcsa_usd':{id:6093,name:'COMCAST CORPORATION'},
    'pgr_usd':{id:6094,name:'THE PROGRESSIVE CORPORATION'},
    'tjx_usd':{id:6095,name:'THE TJX COMPANIES, INC.'},
    'syk_usd':{id:6096,name:'STRYKER CORPORATION'},
    'bx_usd':{id:6097,name:'BLACKSTONE INC.'},
    'anet_usd':{id:6098,name:'ARISTA NETWORKS, INC.'},
    'de_usd':{id:6099,name:'DEERE & COMPANY'},
    'cop_usd':{id:6100,name:'CONOCOPHILLIPS'},
    'ba_usd':{id:6101,name:'THE BOEING COMPANY'},
    'adp_usd':{id:6102,name:'AUTOMATIC DATA PROCESSING, INC.'},
    'bmy_usd':{id:6103,name:'BRISTOL-MYERS SQUIBB COMPANY'},
    'panw_usd':{id:6104,name:'PALO ALTO NETWORKS, INC.'},
    'schw_usd':{id:6105,name:'THE CHARLES SCHWAB CORPORATION'},
    'fi_usd':{id:6106,name:'FISERV, INC.'},
    'gild_usd':{id:6107,name:'GILEAD SCIENCES, INC.'},
    'gev_usd':{id:6108,name:'GE VERNOVA INC.'},
    'mdt_usd':{id:6109,name:'MEDTRONIC PLC'},
    'vrtx_usd':{id:6110,name:'VERTEX PHARMACEUTICALS INCORPORATED'},
    'sbux_usd':{id:6111,name:'STARBUCKS CORPORATION'},
    'dia_usd':{id:6113,name:'SPDR DOW JONES (DIA)'}, // Aliasé à partir de spdia_usd
    'qqqm_usd':{id:6114,name:'NASDAQ-100 ETF (QQQM)'},
    'iwm_usd':{id:6115,name:'ISHARES RUSSELL 2000 ETF (IWM)'},

    // 5000: Forex - SANS USD_NGN, USD_ARS, USD_IDR, USD_BRL, USD_PKR, USD_UAH, USD_PHP, USD_VND
    'eur_usd':{id:5000,name:'EURO/US DOLLAR'},
    'usd_jpy':{id:5001,name:'US DOLLAR/JAPANESE YEN'},
    'gbp_usd':{id:5002,name:'GREAT BRITAIN POUND/US DOLLAR'},
    'eur_gbp':{id:5003,name:'EURO/GREAT BRITAIN POUND'},
    'usd_krw':{id:5004,name:'US DOLLAR/SOUTH KOREAN WON'},
    'usd_hkd':{id:5005,name:'US DOLLAR/HONG KONG DOLLAR'},
    'usd_inr':{id:5006,name:'US DOLLAR/INDIAN RUPEE'},
    'usd_cny':{id:5007,name:'US DOLLAR/CHINESE YUAN'},
    'usd_sgd':{id:5008,name:'US DOLLAR/SINGAPORE DOLLAR'},
    'usd_thb':{id:5009,name:'US DOLLAR/THAI BAHT'},
    'aud_usd':{id:5010,name:'AUSTRALIAN DOLLAR/US DOLLAR'},
    'usd_cad':{id:5011,name:'US DOLLAR/CANADIAN DOLLAR'},
    'usd_chf':{id:5012,name:'US DOLLAR/SWISS FRANC'},
    'nzd_usd':{id:5013,name:'NEW ZEALAND DOLLAR/US DOLLAR'},
    // usd_vnd: {id:5014, name:'US DOLLAR/VIETNAMESE DONG'}, <-- Supprimé
    // usd_php: {id:5015, name:'US DOLLAR/PHILIPPINE PESO'}, <-- Supprimé
    // usd_uah: {id:5016, name:'US DOLLAR/UKRAINIAN HRYVNIA'}, <-- Supprimé
    // usd_pkr: {id:5017, name:'US DOLLAR/PAKISTANI RUPEE'}, <-- Supprimé
    // usd_brl: {id:5018, name:'US DOLLAR/BRAZILIAN REAL'}, <-- Supprimé
    'usd_rub':{id:5019,name:'US DOLLAR/RUSSIAN RUBLE'},
    // usd_idr: {id:5020, name:'US DOLLAR/INDONESIAN RUPIAH'}, <-- Supprimé
    'usd_try':{id:5021,name:'US DOLLAR/TURKISH LIRA'},
    // usd_ngn: {id:5022, name:'US DOLLAR/NIGERIAN NAIRA'}, <-- Supprimé
    // usd_ars: {id:5023, name:'US DOLLAR/ARGENTINE PESO'}, <-- Supprimé
    'eur_aud':{id:5024,name:'EURO/AUSTRALIAN DOLLAR'},
    'gbp_jpy':{id:5025,name:'GREAT BRITAIN POUND/JAPANESE YEN'},
    'chf_jpy':{id:5026,name:'SWISS FRANC/JAPANESE YEN'},
    'eur_chf':{id:5027,name:'EURO/SWISS FRANC'},
    'aud_jpy':{id:5028,name:'AUSTRALIAN DOLLAR/JAPANESE YEN'},
    'gbp_cad':{id:5029,name:'GREAT BRITAIN POUND/CANADIAN DOLLAR'},
    'nzd_jpy':{id:5030,name:'NEW ZEALAND DOLLAR/JAPANESE YEN'},
    
    // 5500: Commodities
    'xau_usd':{id:5500,name:'GOLD/US DOLLAR'},
    'xag_usd':{id:5501,name:'SILVER/US DOLLAR'},
    'wti_usd':{id:5503,name:'WEST TEXAS INTERMEDIATE CRUDE'},
    'xpd_usd':{id:5504,name:'PALLADIUM/US DOLLAR'},
    'xpt_usd':{id:5505,name:'PLATINUM/US DOLLAR'},
    'xg_usd':{id:5506,name:'COMMODITY UNKNOWN'}
};

// 🔴 CRYPTO EST VIDE
const CRYPTO = []; 

// 🟢 FOREX MIS À JOUR (SANS les paires de devises demandées)
const FOREX = [
    'eur_usd','usd_jpy','gbp_usd','eur_gbp','usd_krw','usd_hkd','usd_inr','usd_cny','usd_sgd','usd_thb',
    'aud_usd','usd_cad','usd_chf','nzd_usd','usd_rub',
    'usd_try','eur_aud','gbp_jpy','chf_jpy','eur_chf','aud_jpy','gbp_cad',
    'nzd_jpy'
];

// 🟢 COMMODITIES MIS À JOUR
const COMMODITIES = ['xau_usd','xag_usd','wti_usd','xpd_usd','xpt_usd','xg_usd'];

// 🟢 US_EQ & US_ETF MIS À JOUR (Liste complète des actions et ETFs US sans crypto-ETFs)
const US_EQ = [
    'tsla_usd','msft_usd','nvda_usd','goog_usd','aapl_usd','amzn_usd','meta_usd','nflx_usd','pypl_usd','intc_usd',
    'coin_usd','gme_usd','amd_usd','dis_usd','brk.a_usd','baba_usd','xom_usd','tmo_usd','unh_usd','lly_usd',
    'hd_usd','ttd_usd','crm_usd','qcom_usd','pfe_usd','abnb_usd','shop_usd','jd_usd','cvx_usd','jpm_usd',
    'mu_usd','snap_usd','uber_usd','zm_usd','nke_usd','jnj_usd','pg_usd','cost_usd','orcl_usd','mstr_usd',
    'v_usd','ma_usd','wmt_usd','bac_usd','abbv_usd','wfc_usd','csco_usd','mrk_usd','ko_usd',
    'now_usd','acn_usd','abt_usd','ge_usd','lin_usd','isrg_usd','ibm_usd','pep_usd','mcd_usd','gs_usd',
    'pm_usd','cat_usd','adbe_usd','axp_usd','ms_usd','txn_usd','intu_usd','trtx_usd','vz_usd','spgi_usd',
    'pltr_usd','dhr_usd','bkng_usd','c_usd','amat_usd','unp_usd','bsx_usd','nee_usd','low_usd','blk_usd',
    'amgn_usd','etn_usd','hon_usd','cmcsa_usd','pgr_usd','tjx_usd','syk_usd','bx_usd','anet_usd','de_usd',
    'cop_usd','ba_usd','adp_usd','bmy_usd','panw_usd','schw_usd','fi_usd','gild_usd','gev_usd','mdt_usd',
    'vrtx_usd','sbux_usd'
];

const US_ETF = [
    'spy_usd','dia_usd','qqqm_usd','iwm_usd'
];

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
// On passe à 10 secondes pour éviter les reconnexions inutiles
const SUPRA_INACTIVITY_LIMIT_MS = 10000;

// 🔻 Fallback REST pour flux “stale”
const STALE_WS_MAX_AGE_MS = 10000;      // si pas de WS depuis > 10s → considéré stale
const REST_STALE_REFRESH_INTERVAL_MS = 5000;    // REST max toutes les 5s par paire
let staleRestIntervalStarted = false;

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
    if (wd === 5) return hour < 23;        // vendredi jusqu’à 23h
    return false;
}

const isCryptoOpen = () => false; // Toujours faux car on n'a plus de crypto

function initCache(p) {
    if (!state[p]) {
        const m = META[p] || { id: null, name: 'UNKNOWN' };
        state[p] = {
            id: m.id ?? null,
            name: m.name || 'UNKNOWN',
            lastWsMs: 0,
            lastRestMs: 0
        };
    }
}

function upsertFromWS(item) {
    const p = normalize(item.tradingPair || '');
    if (!p) return;
    initCache(p);
    const s = state[p];

    const live = item.currentPrice ?? item.close;
    if (live != null) s.wsPriceStr = String(live);
    if (item.time != null) s.wsTime = String(item.time);
    if (item.timestamp) s.wsTimestamp = item.timestamp;

    s.lastWsMs = Date.now();
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

        initCache(p);
        const s = state[p];

        if (d.currentPrice != null) s.restPriceStr = String(d.currentPrice);
        if (d['24h_high'] != null)    s.h24 = String(d['24h_high']);
        if (d['24h_low']  != null)    s.l24 = String(d['24h_low']);
        if (d['24h_change'] != null) s.ch24 = String(d['24h_change']);
        if (d.timestamp) s.restTimestamp = d.timestamp;
        if (d.time != null) s.restTime = String(d.time);

        s.lastRestMs = Date.now();
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
        // On ne construit une snapshot que pour les paires qui existent encore dans META
        if (META[p]) {
            out[p] = buildPageForPair(p);
        }
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

    // Crypto
    for (const p of CRYPTO) (openCrypto ? openPairs : closedPairs).add(normalize(p));

    // Forex & Commodities
    for (const p of [...FOREX, ...COMMODITIES]) (openFx ? openPairs : closedPairs).add(normalize(p));
    
    // US Equities & ETFs
    for (const p of [...US_EQ, ...US_ETF]) (openEq ? openPairs : closedPairs).add(normalize(p));

    for (const raw of PAIRS) {
        const p = normalize(raw);
        // Ajout d'une vérification pour s'assurer que la paire est toujours dans la liste globale après filtrage
        if (META[p]) { 
             if (!openPairs.has(p) && !closedPairs.has(p)) closedPairs.add(p);
        }
    }

    return { open: [...openPairs], closed: [...closedPairs] };
}

/**
 * Connexion au WebSocket Supra avec watchdog d’inactivité.
 * Si > 10s sans message, on ferme et on rouvre avec les mêmes paires.
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

        // Watchdog d'inactivité : si > 10s sans message, on reconnecte
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
        }, 1000); // check chaque seconde
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
 * Fallback REST plus agressif pour les paires “stale” côté WS.
 * – vérifie toutes les 1s
 * – si pas de WS depuis > 10s et pas de REST depuis > 5s → refait un REST.
 */
function startStaleRestRefresher() {
    if (staleRestIntervalStarted) return;
    staleRestIntervalStarted = true;

    setInterval(() => {
        (async () => {
            const now = Date.now();
            const candidates = [];

            for (const p of currentWSSet) {
                const s = state[p];
                if (!s) continue;
                const lastWs = s.lastWsMs || 0;
                const lastRest = s.lastRestMs || 0;

                const wsAge = now - lastWs;
                const restAge = now - lastRest;

                if (wsAge > STALE_WS_MAX_AGE_MS && restAge > REST_STALE_REFRESH_INTERVAL_MS) {
                    candidates.push(p);
                }
            }

            if (candidates.length) {
                console.log(`[REST-Stale] Refreshing ${candidates.length} stale pairs via REST`);
            }

            for (const p of candidates) {
                await fetchLatestREST(p);
                await sleep(MIN_GAP_MS);
            }
        })().catch((e) => {
            console.error('[REST-Stale] loop error:', e?.message);
        });
    }, 1000); // check toutes les 1s
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
    startStaleRestRefresher();
}

module.exports = {
    attachPriceWSS,
    handlePriceUpgrade,
    rebalanceScheduler
};
