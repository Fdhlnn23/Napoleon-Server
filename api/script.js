const { sql } = require("@vercel/postgres");

function xorEncrypt(text, key) {
  let result = [];
  for (let i = 0; i < text.length; i++) {
    result.push(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result).toString("base64");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Loader-Version",
  );

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
  try {
    await sql`ALTER TABLE scripts ADD COLUMN IF NOT EXISTS place_ids TEXT DEFAULT ''`;
  } catch (e) {}

  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  const isAdmin = secret === process.env.API_SECRET;

  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  const baseUrl = `${protocol}://${host}`;

  if (req.method === "GET") {
    const { key, hwid, place_id, univ_id, id } = req.query;

    // Admin list
    if (!key && isAdmin) {
      const result =
        await sql`SELECT id, name, content, place_ids, is_active, updated_at FROM scripts ORDER BY id DESC`;
      return res.status(200).json({ scripts: result.rows });
    }

    const loaderTemplate = `
local key = {KEY_PLACEHOLDER}
if not key then return warn("❌ Key tidak ditemukan! Set getgenv().Key terlebih dahulu.") end
local baseUrl = "${baseUrl}"

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local hwid = tostring(Players.LocalPlayer.UserId)
local placeId = tostring(game.PlaceId)
local univId = tostring(game.GameId)

-- Anti-Hook Checks
if iscclosure and not iscclosure(loadstring) then
    game.Players.LocalPlayer:Kick("Security Tamper Detected (loadstring hook)")
    return
end

local token = HttpService:GenerateGUID(false)

local payloadData = {
    key = key,
    hwid = hwid,
    place_id = placeId,
    univ_id = univId,
    token = token
}

local headers = {
    ["Content-Type"] = "application/json",
    ["X-Loader-Version"] = "2.0"
}

local response
local success, err = pcall(function()
    if syn and syn.request then
        response = syn.request({Url = baseUrl .. "/api/script", Method = "POST", Headers = headers, Body = HttpService:JSONEncode(payloadData)}).Body
    elseif request then
        response = request({Url = baseUrl .. "/api/script", Method = "POST", Headers = headers, Body = HttpService:JSONEncode(payloadData)}).Body
    elseif http and http.request then
        response = http.request({Url = baseUrl .. "/api/script", Method = "POST", Headers = headers, Body = HttpService:JSONEncode(payloadData)}).Body
    else
        warn("No request function found.")
    end
end)

if not response then
    warn("Failed to contact secure server")
    return
end

if response:sub(1, 5) == "error" then
    local func = loadstring(response)
    if func then func() end
    return
end

-- Decrypt
local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function dec(data)
    data = string.gsub(data, '[^'..b..'=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r,f='',(b:find(x)-1)
        for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if (#x ~= 8) then return '' end
        local c=0
        for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end

local decoded = dec(response)
local res = ""
for i = 1, #decoded do
    local k = token:byte((i - 1) % #token + 1)
    local c = decoded:byte(i)
    res = res .. string.char(bit32.bxor(c, k))
end

local f, lerr = loadstring(res)
if f then 
    f() 
else 
    warn("Script Load Error:", lerr) 
end
    `.trim();

    if (!key) {
      res.setHeader("Content-Type", "text/plain");
      return res
        .status(200)
        .send(
          loaderTemplate.replace(
            "{KEY_PLACEHOLDER}",
            "getgenv and getgenv().Key or _G.Key",
          ),
        );
    }

    res.setHeader("Content-Type", "text/plain");
    return res
      .status(200)
      .send(loaderTemplate.replace("{KEY_PLACEHOLDER}", `"${key}"`));
  }

  if (req.method === "POST") {
    // ── Client Secure Loader Request ──
    if (req.headers["x-loader-version"]) {
      const { key, hwid, place_id, univ_id, token } = req.body;
      if (!key || !token)
        return res.status(400).send('error("Invalid secure request.")');

      const keyResult =
        await sql`SELECT * FROM keys WHERE key_value = ${key} AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`;
      if (keyResult.rows.length === 0)
        return res
          .status(200)
          .send('error("Key tidak valid atau sudah expired.")');

      const keyRow = keyResult.rows[0];

      if (hwid) {
        if (!keyRow.hwid) {
          await sql`UPDATE keys SET hwid = ${hwid}, last_used_at = NOW() WHERE key_value = ${key}`;
        } else if (keyRow.hwid !== hwid) {
          return res
            .status(200)
            .send('error("Key ini sudah terikat ke perangkat lain.")');
        } else {
          await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
        }
      }

      let matched = null;
      const allScripts =
        await sql`SELECT * FROM scripts WHERE is_active = TRUE`;
      for (const s of allScripts.rows) {
        if (!s.place_ids) continue;
        const ids = s.place_ids
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (
          (place_id && ids.includes(String(place_id))) ||
          (univ_id && ids.includes(String(univ_id)))
        ) {
          matched = s;
          break;
        }
      }

      if (!matched) {
        return res
          .status(200)
          .send('error("Tidak ada script untuk game ini.")');
      }

      const encrypted = xorEncrypt(matched.content, token);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(encrypted);
    }

    // ── Admin Create/Update Script Request ──
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const { name, content, place_ids, id } = req.body;
    if (!content)
      return res.status(400).json({ error: "Content script kosong." });
    const placeIdsClean = (place_ids || "").toString().trim();
    if (id) {
      const result =
        await sql`UPDATE scripts SET name=${name || "Script"}, content=${content}, place_ids=${placeIdsClean}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Script tidak ditemukan." });
      return res.status(200).json({ success: true, script: result.rows[0] });
    } else {
      const result =
        await sql`INSERT INTO scripts (name, content, place_ids) VALUES (${name || "Script"}, ${content}, ${placeIdsClean}) RETURNING *`;
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
