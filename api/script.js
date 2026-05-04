const { sql } = require("@vercel/postgres");

// Generates Lua code that shows a warning UI instead of crashing with error()
function getErrorScript(msg) {
  // Escape any double quotes in the message for safe Lua string embedding
  const safeMag = msg.replace(/"/g, '\\"');
  return `
local function showWarningUI(message)
    local ScreenGui = Instance.new("ScreenGui")
    local Frame = Instance.new("Frame")
    local UICorner = Instance.new("UICorner")
    local Title = Instance.new("TextLabel")
    local Key = Instance.new("TextLabel")
    local Description = Instance.new("TextLabel")
    local ButtonClose = Instance.new("TextButton")
    local UICorner_2 = Instance.new("UICorner")
    local UITextSizeConstraint = Instance.new("UITextSizeConstraint")
    local Background = Instance.new("Frame")
    local UIStroke = Instance.new("UIStroke")

    ScreenGui.Parent = game.Players.LocalPlayer:WaitForChild("PlayerGui")
    ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    ScreenGui.SafeAreaCompatibility = Enum.SafeAreaCompatibility.None
    ScreenGui.ScreenInsets = Enum.ScreenInsets.None

    Background.Name = "Background"
    Background.Parent = ScreenGui
    Background.BackgroundColor3 = Color3.fromRGB(170, 0, 0)
    Background.BackgroundTransparency = 0.300
    Background.BorderColor3 = Color3.fromRGB(0, 0, 0)
    Background.BorderSizePixel = 0
    Background.Size = UDim2.new(1, 0, 1, 0)
    Background.ZIndex = 0

    Frame.Parent = ScreenGui
    Frame.BackgroundColor3 = Color3.fromRGB(12, 12, 14)
    Frame.BackgroundTransparency = 0.100
    Frame.BorderColor3 = Color3.fromRGB(0, 0, 0)
    Frame.BorderSizePixel = 0
    Frame.Position = UDim2.new(0.248725787, 0, 0.40242058, 0)
    Frame.Size = UDim2.new(0.502548397, 0, 0.146747351, 0)

    UICorner.CornerRadius = UDim.new(0.0500000007, 0)
    UICorner.Parent = Frame

    UIStroke.Parent = Frame
    UIStroke.Color = Color3.fromRGB(255, 255, 255)
    UIStroke.Thickness = 1

    Title.Name = "Title"
    Title.Parent = Frame
    Title.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    Title.BackgroundTransparency = 1.000
    Title.BorderColor3 = Color3.fromRGB(0, 0, 0)
    Title.BorderSizePixel = 0
    Title.Position = UDim2.new(0.198198214, 0, 0, 0)
    Title.Size = UDim2.new(0.6006006, 0, 0.289151847, 0)
    Title.Font = Enum.Font.GothamBold
    Title.Text = "Napoleon | Warning"
    Title.TextColor3 = Color3.fromRGB(255, 255, 255)
    Title.TextScaled = true
    Title.TextSize = 14.000
    Title.TextWrapped = true

    Key.Name = "Key"
    Key.Parent = Frame
    Key.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    Key.BackgroundTransparency = 1.000
    Key.BorderColor3 = Color3.fromRGB(0, 0, 0)
    Key.BorderSizePixel = 0
    Key.Position = UDim2.new(0.22862418, 0, 0.550000012, 0)
    Key.Size = UDim2.new(0.533663452, 0, 0.154971421, 0)
    Key.Font = Enum.Font.GothamBold
    Key.Text = "discord.gg/napoleonsc"
    Key.TextColor3 = Color3.fromRGB(106, 106, 124)
    Key.TextScaled = true
    Key.TextSize = 14.000
    Key.TextWrapped = true

    Description.Name = "Description"
    Description.Parent = Frame
    Description.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    Description.BackgroundTransparency = 1.000
    Description.BorderColor3 = Color3.fromRGB(0, 0, 0)
    Description.BorderSizePixel = 0
    Description.Position = UDim2.new(0.060851898, 0, 0.306907117, 0)
    Description.Size = UDim2.new(0.871821165, 0, 0.216986924, 0)
    Description.Font = Enum.Font.Gotham
    Description.Text = message
    Description.TextColor3 = Color3.fromRGB(255, 255, 255)
    Description.TextScaled = true
    Description.TextSize = 14.000
    Description.TextWrapped = true

    ButtonClose.Name = "ButtonClose"
    ButtonClose.Parent = Frame
    ButtonClose.BackgroundColor3 = Color3.fromRGB(170, 0, 0)
    ButtonClose.BorderColor3 = Color3.fromRGB(0, 0, 0)
    ButtonClose.BorderSizePixel = 0
    ButtonClose.Position = UDim2.new(0.385395527, 0, 0.747835159, 0)
    ButtonClose.Size = UDim2.new(0.229208946, 0, 0.206185549, 0)
    ButtonClose.Font = Enum.Font.GothamBold
    ButtonClose.Text = "Close"
    ButtonClose.TextColor3 = Color3.fromRGB(255, 255, 255)
    ButtonClose.TextScaled = true
    ButtonClose.TextSize = 14.000
    ButtonClose.TextWrapped = true

    UICorner_2.CornerRadius = UDim.new(1, 0)
    UICorner_2.Parent = ButtonClose

    UITextSizeConstraint.Parent = ButtonClose
    UITextSizeConstraint.MaxTextSize = 14

    ButtonClose.MouseButton1Click:Connect(function()
        ScreenGui:Destroy()
    end)
end

showWarningUI("${safeMag}")
`.trim();
}

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
  try {
    await sql`ALTER TABLE scripts ADD COLUMN IF NOT EXISTS place_ids TEXT DEFAULT ''`;
  } catch (e) {}

  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  const isAdmin = secret === process.env.API_SECRET;

  if (req.method === "GET") {
    const { key, hwid, place_id, univ_id, id } = req.query;

    // Admin list
    if (!key && isAdmin) {
      const result =
        await sql`SELECT id, name, content, place_ids, is_active, updated_at FROM scripts ORDER BY id DESC`;
      return res.status(200).json({ scripts: result.rows });
    }

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    if (!key) {
      const genericLoader = `local key = getgenv and getgenv().Key or _G.Key
if not key then return warn("Key not found! Set getgenv().Key first.") end
local hwid = tostring(game:GetService("Players").LocalPlayer.UserId)
local placeId = tostring(game.PlaceId)
local univId = tostring(game.GameId)
local url = "${baseUrl}/api/script?key=" .. key .. "&hwid=" .. hwid .. "&place_id=" .. placeId .. "&univ_id=" .. univId
local success, result = pcall(function() return game:HttpGet(url) end)
if success then
    local f, err = loadstring(result)
    if f then f() else warn(err) end
else
    warn("Gagal menghubungi server.")
end`;
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(genericLoader);
    }

    // Validasi key
    const keyResult = await sql`
      SELECT * FROM keys WHERE key_value = ${key} AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (keyResult.rows.length === 0) {
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(getErrorScript("Key is invalid or has expired."));
    }

    const keyRow = keyResult.rows[0];

    // HWID check
    if (hwid) {
      if (!keyRow.hwid) {
        await sql`UPDATE keys SET hwid = ${hwid}, last_used_at = NOW() WHERE key_value = ${key}`;
      } else if (keyRow.hwid !== hwid) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(getErrorScript("This key is already bound to another device. Reset HWID!"));
      } else {
        await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
      }
    }

    // Cari script by place_id atau univ_id
    if (place_id || univ_id) {
      const allScripts =
        await sql`SELECT * FROM scripts WHERE is_active = TRUE`;
      let matched = null;
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
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(getErrorScript("There is no script for this game."));
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(matched.content);
    }

    // Cari by id
    if (id) {
      const r =
        await sql`SELECT * FROM scripts WHERE id = ${id} AND is_active = TRUE`;
      if (r.rows.length === 0) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send(getErrorScript("Script not found."));
      }
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(r.rows[0].content);
    }

    const specificLoader = `local key = "${key}"
local hwid = tostring(game:GetService("Players").LocalPlayer.UserId)
local placeId = tostring(game.PlaceId)
local univId = tostring(game.GameId)
local url = "${baseUrl}/api/script?key=" .. key .. "&hwid=" .. hwid .. "&place_id=" .. placeId .. "&univ_id=" .. univId
local success, result = pcall(function() return game:HttpGet(url) end)
if success then
    local f, err = loadstring(result)
    if f then f() else warn(err) end
else
    warn("Failed to contact server.")
end`;

    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(specificLoader);
  }

  if (req.method === "POST") {
    if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
    const { name, content, place_ids, id } = req.body;
    if (!content)
      return res.status(400).json({ error: "The script content is empty." });
    const placeIdsClean = (place_ids || "").toString().trim();
    if (id) {
      const result =
        await sql`UPDATE scripts SET name=${name || "Script"}, content=${content}, place_ids=${placeIdsClean}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Script not found." });
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
    if (!id) return res.status(400).json({ error: "ID required." });
    await sql`DELETE FROM scripts WHERE id = ${id}`;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method is not permitted." });
};
