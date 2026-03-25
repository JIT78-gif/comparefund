import express from "express";
import cors from "cors";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
