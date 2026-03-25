import { Router, Response } from "express";
import { requireAuth, type AuthRequest } from "../auth.js";

const router = Router();

/** POST /api/chat — proxies to N8N webhook (or Gemini AI) */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || "https://agentes-n8n.cb16s5.easypanel.host/webhook/cd3ad3fa-7d12-45aa-bbf2-356edf3d475b";

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

    return res.status(500).json({ error: "Chat service unavailable." });
  } catch (err: any) {
    console.error("chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
