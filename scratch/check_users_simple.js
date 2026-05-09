
const knex = require('knex');
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'tradingbot_db'
  }
});

async function check() {
  try {
    const users = await db('users').select('id', 'username').orderBy('id', 'desc').limit(5);
    console.log('Users in DB:', JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.destroy();
  }
}

check();
