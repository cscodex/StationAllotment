const { Pool } = require('pg');
const fs = require('fs');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sql = fs.readFileSync('./migrate_districts.sql', 'utf8');
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

require('dotenv').config();
run();
