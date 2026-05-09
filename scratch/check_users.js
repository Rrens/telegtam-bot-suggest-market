
const knex = require('knex');
const config = require('./src/config/index').config;

const db = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : false
  }
});

async function check() {
  try {
    const users = await db('users').select('id', 'username');
    console.log('Users in DB:', JSON.stringify(users, null, 2));
    
    const logs = await db('chat_log').select('user_id', 'username').distinct().limit(10);
    console.log('Recent Users in Logs:', JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.destroy();
  }
}

check();
