import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function signToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): { sub: string; email: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
}

/** Middleware: requires valid JWT, sets req.userId and req.userEmail */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = verifyToken(authHeader.replace("Bearer ", ""));
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Middleware: requires admin role */
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const { rows } = await pool.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin'",
    [req.userId]
  );
  if (rows.length === 0) return res.status(403).json({ error: "Admin access required" });
  next();
}
