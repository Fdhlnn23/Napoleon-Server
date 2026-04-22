const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  const { secret } = req.query;
  if (secret !== process.env.API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS keys (
        id SERIAL PRIMARY KEY,
        key_value VARCHAR(64) UNIQUE NOT NULL,
        discord_id VARCHAR(64),
        hwid VARCHAR(256),
        is_active BOOLEAN DEFAULT TRUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `;
    try { await sql`ALTER TABLE keys DROP COLUMN IF EXISTS label`; } catch (e) {}

    return res.status(200).json({ success: true, message: "Database sudah siap!" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
