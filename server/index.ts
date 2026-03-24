import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import competitorRoutes from "./routes/competitors.js";
import statementsRoutes from "./routes/statements.js";
import compareRoutes from "./routes/compare.js";
import discoverRoutes from "./routes/discover.js";
import managerSearchRoutes from "./routes/manager-search.js";
import chatRoutes from "./routes/chat.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

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

app.listen(PORT, () => {
  console.log(`🚀 FIDC Intel API running on http://localhost:${PORT}`);
});
