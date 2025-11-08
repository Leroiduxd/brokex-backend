// services/proof.mjs
import express from "express";

const DORA_RPC  = "https://rpc-testnet-dora-2.supra.com";
const DORA_CHAIN = "evm";

// Charge ESM dynamiquement (Node 20 supporte TLA)
let PullServiceClient;
{
  // IMPORTANT: préciser l'extension .js et le bon chemin relatif :
  const mod = await import("../pullServiceClient.mjs");
  PullServiceClient = mod.default || mod.PullServiceClient || mod;
}

const router = express.Router();
const client = new PullServiceClient(DORA_RPC);
const cache = new Map(); // key = "0,1,2" ; value = { proof, timestamp }

async function fetchProof(pairIndexes) {
  const key = [...pairIndexes].sort((a, b) => a - b).join(",");
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.timestamp < 1000) {
    console.log(`🔄 [ProofCache] hit pairs=[${key}] age=${now - cached.timestamp}ms`);
    return cached.proof;
  }

  console.log(`🌐 [ProofFetch] pairs=[${key}]`);
  const data = await client.getProof({ pair_indexes: pairIndexes, chain_type: DORA_CHAIN });
  const proofBytes = data.proof_bytes;
  const proof = String(proofBytes).startsWith("0x") ? proofBytes : "0x" + proofBytes;

  cache.set(key, { proof, timestamp: now });
  return proof;
}

router.get("/proof", async (req, res) => {
  const query = req.query.pairs;
  if (!query) return res.status(400).json({ error: "Missing ?pairs=0,1,2" });

  const pairIndexes = String(query)
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (!pairIndexes.length) return res.status(400).json({ error: "No valid pair indexes" });

  try {
    const proof = await fetchProof(pairIndexes);
    res.json({ proof });
  } catch (e) {
    console.error("[Proof] error:", e?.response?.data || e.message);
    res.status(503).json({ error: "Failed to fetch proof" });
  }
});

export default router;
