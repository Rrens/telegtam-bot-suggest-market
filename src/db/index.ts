import knex from 'knex';
import type { Knex } from 'knex';
import { config } from '../config';
import { log } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Knex connection pool configuration
// ─────────────────────────────────────────────────────────────────────────────

export const db: Knex = knex({
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.app.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 600000,
  },
  acquireConnectionTimeout: 30000,
});

/**
 * Verify database connectivity on startup.
 */
export async function connectDb(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    log.info('Database connected successfully');
  } catch (err) {
    log.error('Database connection failed', { error: (err as Error).message });
    throw err;
  }
}

/**
 * Knex configuration for CLI migrations (knexfile).
 */
export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432'),
    user: process.env.DB_USER ?? 'tradingbot',
    password: process.env.DB_PASSWORD ?? 'tradingbot_secret',
    database: process.env.DB_NAME ?? 'tradingbot_db',
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
};

export default knexConfig;
