import { Router, Response } from "express";
import pool from "../db.js";
import { requireAuth, type AuthRequest } from "../auth.js";

const router = Router();

/** POST /api/chat — proxies to N8N webhook (or Gemini AI) */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    const { messages, competitor_ids } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    // If N8N webhook is configured, use it
    if (n8nWebhookUrl) {
      const lastMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, competitor_ids: competitor_ids || [], last_message: lastMessage?.content || "" }),
      });
      if (!n8nResponse.ok) return res.status(502).json({ error: "n8n workflow error" });
      const n8nData = await n8nResponse.json();
      const reply = n8nData.reply || n8nData.output || n8nData.text || (typeof n8nData === "string" ? n8nData : JSON.stringify(n8nData));
      return res.json({ reply });
    }

    // Fallback: search regulations from DB and use Gemini
    const recentMessages = messages.slice(-3);
    const searchQuery = recentMessages.map((m: { content: string }) => m.content).join(" ").slice(0, 500);

    const { rows: searchResults } = await pool.query(
      `SELECT c.id as chunk_id, c.document_id, d.competitor_id, comp.name as competitor_name,
              d.title as document_title, c.content,
              ts_rank(c.search_vector, plainto_tsquery('portuguese', $1))::REAL as rank
       FROM regulation_chunks c
       JOIN regulation_documents d ON d.id = c.document_id
       JOIN competitors comp ON comp.id = d.competitor_id
       WHERE c.search_vector @@ plainto_tsquery('portuguese', $1)
       ${competitor_ids?.length ? "AND d.competitor_id = ANY($2)" : ""}
       ORDER BY rank DESC LIMIT 15`,
      competitor_ids?.length ? [searchQuery, competitor_ids] : [searchQuery]
    );

    let context = "";
    if (searchResults.length > 0) {
      context = searchResults.map((r: any, i: number) => `[${i + 1}] Fonte: ${r.competitor_name} — "${r.document_title}"\n${r.content}`).join("\n\n---\n\n");
    }

    const systemPrompt = `Você é um especialista em regulamentos de FIDCs. Responda com base nos trechos fornecidos. Use markdown. Cite fontes com [N].

${context ? `## Contexto\n\n${context}` : "Nenhum regulamento encontrado na base."}`;

    if (!geminiApiKey) {
      return res.json({ reply: "AI is not configured. Set GEMINI_API_KEY environment variable." });
    }

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Gemini error:", errText);
      return res.status(500).json({ error: "AI service error" });
    }

    const aiData = await aiResponse.json();
    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.";
    return res.json({ reply });
  } catch (err: any) {
    console.error("chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
