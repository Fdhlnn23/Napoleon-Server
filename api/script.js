const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Pastikan tabel scripts ada
  await sql`
    CREATE TABLE IF NOT EXISTS scripts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      content TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // ── GET: ambil script (dipanggil dari Roblox) ──────────────────────────
  // URL: /api/script?key=KEY&hwid=HWID&id=SCRIPT_ID
  if (req.method === "GET") {
    const { key, hwid, id } = req.query;

    // Kalau tidak ada key → kembalikan list script (untuk admin dashboard)
    const authHeader = req.headers["authorization"] || "";
    const secret = authHeader.replace("Bearer ", "");
    if (!key && secret === process.env.API_SECRET) {
      const result = await sql`SELECT id, name, content, is_active, updated_at FROM scripts ORDER BY id DESC`;
      return res.status(200).json({ scripts: result.rows });
    }

    if (!key) return res.status(400).json({ error: "Key diperlukan." });

    // Validasi key dulu
    const keyResult = await sql`
      SELECT * FROM keys
      WHERE key_value = ${key}
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    `;

    if (keyResult.rows.length === 0) {
      // Return Lua error supaya script Roblox bisa handle
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(`error("❌ Key tidak valid atau sudah expired.")`);
    }

    const keyRow = keyResult.rows[0];

    // HWID check
    if (hwid) {
      if (!keyRow.hwid) {
        await sql`UPDATE keys SET hwid = ${hwid}, last_used_at = NOW() WHERE key_value = ${key}`;
      } else if (keyRow.hwid !== hwid) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(`error("❌ Key ini sudah terikat ke perangkat lain.")`);
      } else {
        await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
      }
    }

    // Ambil script
    const scriptId = id || 1;
    const scriptResult = await sql`
      SELECT * FROM scripts WHERE id = ${scriptId} AND is_active = TRUE
    `;

    if (scriptResult.rows.length === 0) {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(`error("❌ Script tidak ditemukan.")`);
    }

    // Return script langsung sebagai Lua
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(scriptResult.rows[0].content);
  }

  // ── POST: upload/update script (admin only) ────────────────────────────
  if (req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const secret = authHeader.replace("Bearer ", "");
    if (secret !== process.env.API_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, content, id } = req.body;
    if (!content) return res.status(400).json({ error: "Content script kosong." });

    if (id) {
      // Update script yang ada
      const result = await sql`
        UPDATE scripts SET name = ${name}, content = ${content}, updated_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return res.status(200).json({ success: true, script: result.rows[0] });
    } else {
      // Insert script baru
      const result = await sql`
        INSERT INTO scripts (name, content) VALUES (${name || "Script"}, ${content}) RETURNING *
      `;
      return res.status(201).json({ success: true, script: result.rows[0] });
    }
  }

  // ── DELETE: hapus script ───────────────────────────────────────────────
  if (req.method === "DELETE") {
    const authHeader = req.headers["authorization"] || "";
    const secret = authHeader.replace("Bearer ", "");
    if (secret !== process.env.API_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID script diperlukan." });

    await sql`DELETE FROM scripts WHERE id = ${id}`;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method tidak diizinkan." });
};
