const { sql } = require("@vercel/postgres");
const { v4: uuidv4 } = require("uuid");

function checkSecret(req) {
  const authHeader = req.headers["authorization"] || "";
  return authHeader.replace("Bearer ", "") === process.env.API_SECRET;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!checkSecret(req)) return res.status(401).json({ error: "Unauthorized" });

  try { await sql`ALTER TABLE keys ADD COLUMN IF NOT EXISTS discord_id VARCHAR(64)`; } catch (e) {}

  if (req.method === "GET") {
    const result = await sql`SELECT * FROM keys ORDER BY created_at DESC`;
    return res.status(200).json({ keys: result.rows });
  }

  if (req.method === "POST") {
    const { expires_days, custom_key, discord_id } = req.body;
    const randomHex = uuidv4().replace(/-/g, "").toUpperCase();
    const generatedKey = `NPLN-${randomHex.substring(0,4)}-${randomHex.substring(4,8)}-${randomHex.substring(8,9)}`;
    const keyValue = custom_key || generatedKey;
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;
    const result = await sql`INSERT INTO keys (key_value, expires_at, discord_id) VALUES (${keyValue}, ${expiresAt}, ${discord_id || null}) RETURNING *`;
    return res.status(201).json({ success: true, key: result.rows[0] });
  }

  if (req.method === "PUT") {
    const { key_value, is_active, expires_days, reset_hwid, discord_id } = req.body;
    if (!key_value) return res.status(400).json({ error: "key_value wajib diisi." });
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;
    const result = await sql`
      UPDATE keys SET
        is_active  = COALESCE(${is_active ?? null}, is_active),
        expires_at = CASE WHEN ${expires_days != null} THEN ${expiresAt} ELSE expires_at END,
        hwid       = CASE WHEN ${reset_hwid === true} THEN NULL ELSE hwid END,
        discord_id = COALESCE(${discord_id ?? null}, discord_id)
      WHERE key_value = ${key_value} RETURNING *`;
    if (result.rows.length === 0) return res.status(404).json({ error: "Key tidak ditemukan." });
    return res.status(200).json({ success: true, key: result.rows[0] });
  }

  if (req.method === "DELETE") {
    const { key_value } = req.body;
    if (!key_value) return res.status(400).json({ error: "key_value wajib diisi." });
    const result = await sql`DELETE FROM keys WHERE key_value = ${key_value} RETURNING *`;
    if (result.rows.length === 0) return res.status(404).json({ error: "Key tidak ditemukan." });
    return res.status(200).json({ success: true, deleted: result.rows[0] });
  }

  return res.status(405).json({ error: "Method tidak diizinkan." });
};
