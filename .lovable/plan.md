

## Plan: Connect RAG Chat to n8n Webhook via Edge Function Proxy

### Overview
Keep the existing RegulationChat frontend UI. Replace the `rag-chat` edge function call with a new `n8n-chat-proxy` edge function that forwards messages to your n8n webhook and returns the response formatted for the chat.

### 1. Store n8n Webhook URL as a Secret
Use the `add_secret` tool to store `N8N_WEBHOOK_URL` so the webhook URL stays server-side.

### 2. New Edge Function: `supabase/functions/n8n-chat-proxy/index.ts`
- Receives `{ messages, competitor_ids }` from the frontend (same shape as current)
- Authenticates the user via `getClaims()`
- Forwards the payload to the n8n webhook URL via `POST`
- Returns the n8n response as a JSON `{ reply: "..." }` to the frontend
- Handles errors gracefully

```
Frontend → n8n-chat-proxy (edge fn) → n8n webhook → n8n response → frontend
```

The edge function will send:
```json
{
  "messages": [...],
  "competitor_ids": [...],
  "last_message": "user's latest question"
}
```

And expect n8n to return:
```json
{ "reply": "markdown formatted answer..." }
```

### 3. Update `RegulationChat.tsx`
- Change the fetch URL from `rag-chat` to `n8n-chat-proxy`
- Remove SSE streaming logic — n8n webhooks return a single JSON response, not a stream
- Display the `reply` field directly (ReactMarkdown rendering already in place)
- Keep competitor filter chips, message history, and all existing UI

### 4. Config
- Add `[functions.n8n-chat-proxy]` with `verify_jwt = false` to `supabase/config.toml`

### Files to create/modify
| File | Change |
|---|---|
| `supabase/functions/n8n-chat-proxy/index.ts` | New edge function proxying to n8n webhook |
| `supabase/config.toml` | Add function config |
| `src/components/RegulationChat.tsx` | Point to new proxy, replace streaming with JSON response |

