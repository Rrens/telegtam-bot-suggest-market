// Root knexfile for `knex migrate:latest` CLI
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'tradingbot',
    password: process.env.DB_PASSWORD || 'tradingbot_secret',
    database: process.env.DB_NAME || 'tradingbot_db',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};
