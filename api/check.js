import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  // Allow dari Roblox
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  const { key, hwid } = req.method === "POST" ? req.body : req.query;

  if (!key) {
    return res.status(400).json({ valid: false, message: "Key tidak diberikan." });
  }

  try {
    const result = await sql`
      SELECT * FROM keys
      WHERE key_value = ${key}
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    `;

    if (result.rows.length === 0) {
      return res.status(200).json({ valid: false, message: "Key tidak valid atau sudah expired." });
    }

    const row = result.rows[0];

    // HWID Lock: kalau key belum pernah dipakai, bind ke HWID ini
    if (hwid) {
      if (!row.hwid) {
        // Bind HWID pertama kali
        await sql`
          UPDATE keys SET hwid = ${hwid}, last_used_at = NOW()
          WHERE key_value = ${key}
        `;
      } else if (row.hwid !== hwid) {
        return res.status(200).json({
          valid: false,
          message: "Key ini sudah terikat ke perangkat lain.",
        });
      } else {
        // HWID cocok, update last used
        await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
      }
    } else {
      await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
    }

    return res.status(200).json({
      valid: true,
      message: "Key valid!",
      label: row.label,
      expires_at: row.expires_at,
    });
  } catch (err) {
    return res.status(500).json({ valid: false, message: "Server error: " + err.message });
  }
}