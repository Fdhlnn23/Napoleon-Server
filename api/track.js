const { sql } = require("@vercel/postgres");

// Kirim execute log ke Discord channel sebagai Bot (Component V2)
async function sendExecuteLog({ script, userid, username }) {
  const channelId = process.env.EXECUTE_LOG_CHANNEL_ID;
  const token = process.env.DISCORD_TOKEN;
  if (!channelId || !token || channelId.startsWith("ISI_")) return;

  const now = new Date();
  const timestamp = `<t:${Math.floor(now.getTime() / 1000)}:F>`;

  const components = [
    {
      type: 17,
      spoiler: false,
      components: [
        {
          type: 10,
          content: "## 🚀 Script Executed",
        },
        {
          type: 14,
          divider: true,
          spacing: 1,
        },
        {
          type: 10,
          content:
            `- **👤 Username:** ${username || "Unknown"}\n` +
            `- **🆔 UserID:** \`${userid || "N/A"}\`\n` +
            `- **📜 Script:** \`${script || "N/A"}\`\n` +
            `- **🕐 Time:** ${timestamp}`,
        },
      ],
    },
  ];

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bot ${token}`
      },
      body: JSON.stringify({
        components,
        flags: 1 << 15, // IS_COMPONENTS_V2
      }),
    });
    
    if (!res.ok) {
      console.error("Bot API Error:", await res.text());
    }
  } catch (e) {
    // Silent fail — tidak ganggu response ke Roblox
    console.error("Execute log network error:", e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Pastikan tabel stats ada
    await sql`
      CREATE TABLE IF NOT EXISTS stats (
        script_name VARCHAR(128) PRIMARY KEY,
        total_executes INT DEFAULT 0
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS user_stats (
        userid VARCHAR(64) PRIMARY KEY,
        username VARCHAR(128),
        total_executes INT DEFAULT 0,
        last_executed_at TIMESTAMP DEFAULT NOW()
      )
    `;

    const { script, userid, username } = req.query;
    
    if (script) {
      const scriptName = String(script).substring(0, 128);
      
      // Upsert query stat script
      await sql`
        INSERT INTO stats (script_name, total_executes)
        VALUES (${scriptName}, 1)
        ON CONFLICT (script_name)
        DO UPDATE SET total_executes = stats.total_executes + 1
      `;
    }

    if (userid) {
      const safeUserId = String(userid).substring(0, 64);
      const safeUsername = username ? String(username).substring(0, 128) : null;
      
      // Upsert query stat user
      await sql`
        INSERT INTO user_stats (userid, username, total_executes, last_executed_at)
        VALUES (${safeUserId}, ${safeUsername}, 1, NOW())
        ON CONFLICT (userid)
        DO UPDATE SET 
          total_executes = user_stats.total_executes + 1,
          username = COALESCE(${safeUsername}, user_stats.username),
          last_executed_at = NOW()
      `;
    }

    // Kirim execute log ke Discord webhook
    await sendExecuteLog({
      script: script || null,
      userid: userid || null,
      username: username || null,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};
