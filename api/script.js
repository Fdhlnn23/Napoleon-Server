const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  await sql`
    CREATE TABLE IF NOT EXISTS scripts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      content TEXT NOT NULL,
      place_ids TEXT DEFAULT '',
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  try { await sql`ALTER TABLE scripts ADD COLUMN IF NOT EXISTS place_ids TEXT DEFAULT ''`; } catch (e) {}

  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  const isAdmin = secret === process.env.API_SECRET;

  if (req.method === "GET") {
    const { key, hwid, place_id, univ_id, id } = req.query;

    // Admin list
    if (!key && isAdmin) {
      const result = await sql`SELECT id, name, content, place_ids, is_active, updated_at FROM scripts ORDER BY id DESC`;
      return res.status(200).json({ scripts: result.rows });
    }

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

      const genericLoader = `
local key = getgenv and getgenv().Key or _G.Key
if not key then
    game:GetService("Players").LocalPlayer:Kick("❌ Key tidak ditemukan! Set getgenv().Key terlebih dahulu.")
    return
end
local hwid = tostring(game:GetService("Players").LocalPlayer.UserId)
local placeId = tostring(game.PlaceId)
local univId = tostring(game.GameId)
local url = "${baseUrl}/api/script?key=" .. key .. "&hwid=" .. hwid .. "&place_id=" .. placeId .. "&univ_id=" .. univId
local success, result = pcall(function() return game:HttpGet(url) end)
if success then
    local f, err = loadstring(result)
    if f then f() else game:GetService("Players").LocalPlayer:Kick("❌ Error Loadstring: " .. tostring(err)) end
else
    game:GetService("Players").LocalPlayer:Kick("❌ Gagal menghubungi server.")
end
      `.trim();
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(genericLoader);
    }

    // Validasi key
    const keyResult = await sql`
      SELECT * FROM keys WHERE key_value = ${key} AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (keyResult.rows.length === 0) {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send('game:GetService("Players").LocalPlayer:Kick("❌ Key tidak valid atau sudah expired.")');
    }

    const keyRow = keyResult.rows[0];

    // HWID check
    if (hwid) {
      if (!keyRow.hwid) {
        await sql`UPDATE keys SET hwid = ${hwid}, last_used_at = NOW() WHERE key_value = ${key}`;
      } else if (keyRow.hwid !== hwid) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send('game:GetService("Players").LocalPlayer:Kick("❌ Key ini sudah terikat ke perangkat lain.")');
      } else {
        await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
      }
    }

    // Cari script by place_id atau univ_id
    if (place_id || univ_id) {
      const allScripts = await sql`SELECT * FROM scripts WHERE is_active = TRUE`;
      let matched = null;
      for (const s of allScripts.rows) {
        if (!s.place_ids) continue;
        const ids = s.place_ids.split(",").map(x => x.trim()).filter(Boolean);
        if ((place_id && ids.includes(String(place_id))) || (univ_id && ids.includes(String(univ_id)))) { 
          matched = s; 
          break; 
        }
      }
      if (!matched) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send('game:GetService("Players").LocalPlayer:Kick("❌ Tidak ada script untuk game ini.")');
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(matched.content);
    }

    // Cari by id
    if (id) {
      const r = await sql`SELECT * FROM scripts WHERE id = ${id} AND is_active = TRUE`;
      if (r.rows.length === 0) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send('game:GetService("Players").LocalPlayer:Kick("❌ Script tidak ditemukan.")');
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(r.rows[0].content);
    }

    const specificLoader = `
local key = "${key}"
local hwid = tostring(game:GetService("Players").LocalPlayer.UserId)
local placeId = tostring(game.PlaceId)
local univId = tostring(game.GameId)
local url = "${baseUrl}/api/script?key=" .. key .. "&hwid=" .. hwid .. "&place_id=" .. placeId .. "&univ_id=" .. univId
local success, result = pcall(function() return game:HttpGet(url) end)
if success then
    local f, err = loadstring(result)
    if f then f() else game:GetService("Players").LocalPlayer:Kick("❌ Error Loadstring: " .. tostring(err)) end
else
    game:GetService("Players").LocalPlayer:Kick("❌ Gagal menghubungi server.")
end
    `.trim();

    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(specificLoader);
  }

  if (req.method === "POST") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const { name, content, place_ids, id } = req.body;
    if (!content) return res.status(400).json({ error: "Content script kosong." });
    const placeIdsClean = (place_ids || "").toString().trim();
    if (id) {
      const result = await sql`UPDATE scripts SET name=${name||"Script"}, content=${content}, place_ids=${placeIdsClean}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      if (result.rows.length === 0) return res.status(404).json({ error: "Script tidak ditemukan." });
      return res.status(200).json({ success: true, script: result.rows[0] });
    } else {
      const result = await sql`INSERT INTO scripts (name, content, place_ids) VALUES (${name||"Script"}, ${content}, ${placeIdsClean}) RETURNING *`;
      return res.status(201).json({ success: true, script: result.rows[0] });
    }
  }

  if (req.method === "DELETE") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID diperlukan." });
    await sql`DELETE FROM scripts WHERE id = ${id}`;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method tidak diizinkan." });
};
