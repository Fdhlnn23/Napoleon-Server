const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Wrapper yang meniru @vercel/postgres `sql` template literal
// Sehingga semua file API tidak perlu ganti syntax SQL sama sekali
async function sql(strings, ...values) {
  let query = "";
  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) query += `$${i + 1}`;
  });
  return pool.query(query, values);
}

// Support sql.query(string, params[]) untuk import.js
sql.query = (query, params) => pool.query(query, params);

module.exports = { sql };
