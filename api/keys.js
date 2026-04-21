import { sql } from "@vercel/postgres";
import { v4 as uuidv4 } from "uuid";

function checkSecret(req) {
  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  return secret === process.env.API_SECRET;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!checkSecret(req)) {
    return res.status(401).json({ error: "Unauthorized - secret salah." });
  }

  // ── GET: list semua key ──────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const result = await sql`SELECT * FROM keys ORDER BY created_at DESC`;
      return res.status(200).json({ keys: result.rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: tambah key baru ────────────────────────────────────────────────
  if (req.method === "POST") {
    const { label, expires_days, custom_key } = req.body;
    const keyValue = custom_key || uuidv4().replace(/-/g, "").substring(0, 32).toUpperCase();
    const expiresAt = expires_days
      ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
      : null;

    try {
      const result = await sql`
        INSERT INTO keys (key_value, label, expires_at)
        VALUES (${keyValue}, ${label || null}, ${expiresAt})
        RETURNING *
      `;
      return res.status(201).json({ success: true, key: result.rows[0] });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // ── PUT: edit key (aktif/nonaktif, label, reset HWID, dll) ───────────────
  if (req.method === "PUT") {
    const { key_value, is_active, label, expires_days, reset_hwid } = req.body;
    if (!key_value) return res.status(400).json({ error: "key_value wajib diisi." });

    try {
      let expiresAt = undefined;
      if (expires_days !== undefined) {
        expiresAt = expires_days
          ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
          : null;
      }

      const result = await sql`
        UPDATE keys SET
          is_active   = COALESCE(${is_active ?? null}, is_active),
          label       = COALESCE(${label ?? null}, label),
          expires_at  = CASE WHEN ${expiresAt !== undefined} THEN ${expiresAt ?? null} ELSE expires_at END,
          hwid        = CASE WHEN ${reset_hwid === true} THEN NULL ELSE hwid END
        WHERE key_value = ${key_value}
        RETURNING *
      `;
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Key tidak ditemukan." });
      return res.status(200).json({ success: true, key: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE: hapus key ────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { key_value } = req.body;
    if (!key_value) return res.status(400).json({ error: "key_value wajib diisi." });

    try {
      const result = await sql`DELETE FROM keys WHERE key_value = ${key_value} RETURNING *`;
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Key tidak ditemukan." });
      return res.status(200).json({ success: true, deleted: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method tidak diizinkan." });
}