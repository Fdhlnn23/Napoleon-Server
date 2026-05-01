const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check
  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  if (secret !== process.env.API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan." });
  }

  const { keys } = req.body;
  if (!keys || !Array.isArray(keys)) {
    return res.status(400).json({ error: "Body harus berisi array 'keys'." });
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];

  for (const k of keys) {
    try {
      await sql`
        INSERT INTO keys (key_value, label, hwid, is_active, expires_at, created_at, last_used_at, discord_id)
        VALUES (
          ${k.key_value},
          ${k.label || null},
          ${k.hwid || null},
          ${k.is_active ?? true},
          ${k.expires_at || null},
          ${k.created_at || new Date()},
          ${k.last_used_at || null},
          ${k.discord_id || null}
        )
        ON CONFLICT (key_value) DO NOTHING
      `;
      imported++;
    } catch (err) {
      skipped++;
      errors.push({ key: k.key_value, error: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    total: keys.length,
    imported,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
};
