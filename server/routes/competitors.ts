import { Router, Response } from "express";
import pool from "../db.js";
import { requireAuth, requireAdmin, type AuthRequest } from "../auth.js";

const router = Router();

function validateCnpj(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

/** POST /api/competitors — action-based (mirrors old competitor-admin edge function) */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { action } = req.body;

    // LIST — any authenticated user
    if (action === "list") {
      const { rows: comps } = await pool.query(
        "SELECT * FROM competitors ORDER BY name"
      );
      const { rows: cnpjs } = await pool.query("SELECT * FROM competitor_cnpjs");
      const result = comps.map((c) => ({
        ...c,
        competitor_cnpjs: cnpjs.filter((cn) => cn.competitor_id === c.id),
      }));
      return res.json(result);
    }

    // All other actions require admin
    const { rows: adminCheck } = await pool.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin'",
      [req.userId]
    );
    if (adminCheck.length === 0) return res.status(403).json({ error: "Admin required" });

    if (action === "add_competitor") {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Name required" });
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const { rows } = await pool.query(
        "INSERT INTO competitors (name, slug) VALUES ($1, $2) RETURNING *",
        [name.trim(), slug]
      );
      return res.json(rows[0]);
    }

    if (action === "update_competitor") {
      const { id, name, status } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (name) { sets.push(`name = $${idx++}`); vals.push(name.trim()); }
      if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
      if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE competitors SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
        vals
      );
      return res.json(rows[0]);
    }

    if (action === "delete_competitor") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      await pool.query("DELETE FROM competitors WHERE id = $1", [id]);
      return res.json({ ok: true });
    }

    if (action === "add_cnpj") {
      const { competitor_id, cnpj, fund_name, fund_type_override } = req.body;
      if (!competitor_id || !cnpj) return res.status(400).json({ error: "competitor_id and cnpj required" });
      const clean = validateCnpj(cnpj);
      if (!clean) return res.status(400).json({ error: "Invalid CNPJ (must be 14 digits)" });
      const { rows } = await pool.query(
        "INSERT INTO competitor_cnpjs (competitor_id, cnpj, fund_name, fund_type_override) VALUES ($1, $2, $3, $4) RETURNING *",
        [competitor_id, clean, fund_name || null, fund_type_override || null]
      );
      // Purge cache
      await pool.query("DELETE FROM statement_cache");
      return res.json(rows[0]);
    }

    if (action === "update_cnpj") {
      const { id, fund_name, fund_type_override, status } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (fund_name !== undefined) { sets.push(`fund_name = $${idx++}`); vals.push(fund_name || null); }
      if (fund_type_override !== undefined) { sets.push(`fund_type_override = $${idx++}`); vals.push(fund_type_override || null); }
      if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
      if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
      vals.push(id);
      const { rows } = await pool.query(
        `UPDATE competitor_cnpjs SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
        vals
      );
      if (status) await pool.query("DELETE FROM statement_cache");
      return res.json(rows[0]);
    }

    if (action === "delete_cnpj") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      await pool.query("DELETE FROM competitor_cnpjs WHERE id = $1", [id]);
      await pool.query("DELETE FROM statement_cache");
      return res.json({ ok: true });
    }

    if (action === "bulk_import_cnpjs") {
      const { competitor_id, csv_text } = req.body;
      if (!competitor_id || !csv_text) return res.status(400).json({ error: "competitor_id and csv_text required" });
      const lines = csv_text.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const results = { inserted: 0, errors: [] as string[] };
      for (const line of lines) {
        const [rawCnpj, fundName] = line.split(",").map((s: string) => s.trim());
        const clean = validateCnpj(rawCnpj);
        if (!clean) { results.errors.push(`Invalid CNPJ: ${rawCnpj}`); continue; }
        try {
          await pool.query(
            "INSERT INTO competitor_cnpjs (competitor_id, cnpj, fund_name) VALUES ($1, $2, $3)",
            [competitor_id, clean, fundName || null]
          );
          results.inserted++;
        } catch (e: any) {
          results.errors.push(`${rawCnpj}: ${e.message}`);
        }
      }
      if (results.inserted > 0) await pool.query("DELETE FROM statement_cache");
      return res.json(results);
    }

    // Authorized emails
    if (action === "list_authorized_emails") {
      const { rows } = await pool.query("SELECT * FROM authorized_emails ORDER BY created_at DESC");
      return res.json(rows);
    }
    if (action === "add_authorized_email") {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "email required" });
      const { rows } = await pool.query(
        "INSERT INTO authorized_emails (email) VALUES ($1) RETURNING *",
        [email.trim().toLowerCase()]
      );
      return res.json(rows[0]);
    }
    if (action === "update_authorized_email") {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: "id and status required" });
      const { rows } = await pool.query(
        "UPDATE authorized_emails SET status = $1 WHERE id = $2 RETURNING *",
        [status, id]
      );
      return res.json(rows[0]);
    }
    if (action === "delete_authorized_email") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id required" });
      await pool.query("DELETE FROM authorized_emails WHERE id = $1", [id]);
      return res.json({ ok: true });
    }

    // User management
    if (action === "list_users") {
      const { rows: profiles } = await pool.query("SELECT id, email, created_at FROM profiles ORDER BY created_at DESC");
      const { rows: roles } = await pool.query("SELECT user_id, role FROM user_roles");
      const roleMap: Record<string, string[]> = {};
      for (const r of roles) {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      }
      const users = profiles.map((p) => ({ ...p, roles: roleMap[p.id] || [] }));
      return res.json(users);
    }
    if (action === "set_user_role") {
      const { user_id, role, grant } = req.body;
      if (!user_id || !role) return res.status(400).json({ error: "user_id and role required" });
      if (grant) {
        await pool.query(
          "INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING",
          [user_id, role]
        );
      } else {
        await pool.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [user_id, role]);
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error("competitor-admin error:", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

export default router;
