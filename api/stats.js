const { sql } = require("@vercel/postgres");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  
  if (req.method === "OPTIONS") return res.status(200).end();

  const authHeader = req.headers["authorization"] || "";
  const secret = authHeader.replace("Bearer ", "");
  if (secret !== process.env.API_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
  }

  const { username, userid } = req.query;

  try {
    if (userid || username) {
      // Mengambil stat user tertentu
      let result;
      if (userid) {
        result = await sql`SELECT * FROM user_stats WHERE userid = ${userid}`;
      } else {
        result = await sql`SELECT * FROM user_stats WHERE username ILIKE ${username}`;
      }
      return res.status(200).json({ userStats: result.rows });
    } else {
      // Mengambil keseluruhan klasemen (Top 10)
      const scripts = await sql`SELECT * FROM stats ORDER BY total_executes DESC LIMIT 10`;
      const users = await sql`SELECT * FROM user_stats ORDER BY total_executes DESC LIMIT 10`;
      return res.status(200).json({ scripts: scripts.rows, users: users.rows });
    }
  } catch (err) {
    // Kalau salah satu tabel belom ada (tapi biasanya udah)
    if (err.message.includes('relation "user_stats" does not exist')) {
        return res.status(200).json({ scripts: [], users: [], userStats: [] });
    }
    return res.status(500).json({ error: err.message });
  }
};
