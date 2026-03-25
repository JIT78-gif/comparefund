import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load server/.env before anything else
const __envDir = dirname(fileURLToPath(import.meta.url));
try {
  const envContent = readFileSync(resolve(__envDir, ".env"), "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env file, use system env */ }

import express from "express";
import cors from "cors";
import { readFile } from "node:fs/promises";
import path from "node:path";
import authRoutes from "./routes/auth.js";
import competitorRoutes from "./routes/competitors.js";
import statementsRoutes from "./routes/statements.js";
import compareRoutes from "./routes/compare.js";
import discoverRoutes from "./routes/discover.js";
import managerSearchRoutes from "./routes/manager-search.js";
import chatRoutes from "./routes/chat.js";
import pool from "./db.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");
const __dirname = __envDir;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/competitors", competitorRoutes);
app.use("/api/statements", statementsRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/manager-search", managerSearchRoutes);
app.use("/api/chat", chatRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

async function ensureSchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
}

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`🚀 FIDC Intel API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start API:", error);
    process.exit(1);
  }
}

start();
