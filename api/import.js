const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const authHeader = req.headers["authorization"] || "";
  if (authHeader.replace("Bearer ", "") !== process.env.API_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

  const { keys } = req.body;
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: "Body harus berisi array 'keys'." });
  }

  try {
    // Bulk insert dengan VALUES yang digabung jadi 1 query
    const values = keys.map((k, i) => {
      const base = i * 8;
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8})`;
    }).join(", ");

    const params = keys.flatMap(k => [
      k.key_value,
      k.label || null,
      k.hwid || null,
      k.is_active ?? true,
      k.expires_at || null,
      k.created_at || new Date(),
      k.last_used_at || null,
      k.discord_id || null,
    ]);

    const query = `
      INSERT INTO keys (key_value, label, hwid, is_active, expires_at, created_at, last_used_at, discord_id)
      VALUES ${values}
      ON CONFLICT (key_value) DO NOTHING
    `;

    const result = await sql.query(query, params);
    const imported = result.rowCount || 0;

    return res.status(200).json({
      success: true,
      total: keys.length,
      imported,
      skipped: keys.length - imported,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
