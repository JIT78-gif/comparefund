import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { signToken, requireAuth, type AuthRequest } from "../auth.js";

const router = Router();

/** POST /api/auth/register */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const normalized = email.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [normalized, hash]
    );

    if (rows.length === 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Create profile
    await pool.query(
      "INSERT INTO profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [rows[0].id, normalized]
    );

    const token = signToken(rows[0].id, normalized);
    res.json({ token, user: { id: rows[0].id, email: normalized } });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

/** POST /api/auth/login */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const normalized = email.trim().toLowerCase();
    const { rows } = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [normalized]);

    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(rows[0].id, rows[0].email);
    res.json({ token, user: { id: rows[0].id, email: rows[0].email } });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/** GET /api/auth/me */
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: roleRows } = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [req.userId]
    );
    res.json({
      id: req.userId,
      email: req.userEmail,
      roles: roleRows.map((r) => r.role),
    });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

export default router;
