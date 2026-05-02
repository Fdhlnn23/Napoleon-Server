const { sql } = require("@vercel/postgres");

// KATA SANDI RAHASIA (Ganti dengan kata sandi yang rumit)
const SECRET_KEY = process.env.SURIKITI;

// Fungsi untuk Mengacak Teks menjadi Hex
function encryptXOR(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    // Geser bit huruf dengan kata sandi
    let xorVal = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    // Ubah ke format Hex (2 digit) agar aman dikirim lewat HTTP
    result += xorVal.toString(16).padStart(2, '0');
  }
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { key, hwid } = req.query;
  let responseObj = {}; // Wadah untuk JSON aslinya

  if (!key) {
    responseObj = { valid: false, message: "Key tidak diberikan." };
    return res.status(400).send(encryptXOR(JSON.stringify(responseObj), SECRET_KEY));
  }

  try {
    const result = await sql`
      SELECT * FROM keys
      WHERE key_value = ${key}
        AND is_active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
    `;

    if (result.rows.length === 0) {
      responseObj = { valid: false, message: "Key tidak valid atau sudah expired." };
      return res.status(200).send(encryptXOR(JSON.stringify(responseObj), SECRET_KEY));
    }

    const row = result.rows[0];

    if (hwid) {
      if (!row.hwid) {
        await sql`UPDATE keys SET hwid = ${hwid}, last_used_at = NOW() WHERE key_value = ${key}`;
      } else if (row.hwid !== hwid) {
        responseObj = { valid: false, message: "Key ini sudah terikat ke perangkat lain." };
        return res.status(200).send(encryptXOR(JSON.stringify(responseObj), SECRET_KEY));
      } else {
        await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
      }
    } else {
      await sql`UPDATE keys SET last_used_at = NOW() WHERE key_value = ${key}`;
    }

    // Jika sukses, siapkan payload aslinya
    responseObj = { 
        valid: true, 
        message: "Key valid!", 
        discord_id: row.discord_id, 
        expires_at: row.expires_at 
    };

    // Kirim dalam bentuk Teks Acak (Bukan JSON!)
    return res.status(200).send(encryptXOR(JSON.stringify(responseObj), SECRET_KEY));

  } catch (err) {
    responseObj = { valid: false, message: "Server error: " + err.message };
    return res.status(500).send(encryptXOR(JSON.stringify(responseObj), SECRET_KEY));
  }
};