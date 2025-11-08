// index.mjs
import http from "http";
import express from "express";
import cors from "cors";

import proofRouter from "./services/proof.mjs";
import historyRouter from "./services/history.mjs";
import { attachPriceWSS, rebalanceScheduler } from "./services/wsBridge.mjs";

const PORT = 3000; // <-- port unique

const app = express();
app.use(cors());
app.use(express.json({ limit: "512kb" }));

// Monte les APIs REST
app.use(proofRouter);    // /proof
app.use(historyRouter);  // /history

// Healthcheck
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), v: "gateway-modular-1.0.0" });
});

// HTTP server commun (permet d'attacher le WSS sur le même port)
const server = http.createServer(app);

// Monte le WebSocket /ws/prices
attachPriceWSS(server);

// Lance le scheduler (rebalance horaires marchés + fetch REST de fond)
rebalanceScheduler(); // tourne tout seul ensuite

server.listen(PORT, () => {
  console.log(`🚀 REST+WSS en écoute sur http://127.0.0.1:${PORT}`);
  console.log(`   - GET /proof?pairs=0,1,2`);
  console.log(`   - GET /history?pair=1&interval=3600`);
  console.log(`   - WSS /ws/prices`);
});
