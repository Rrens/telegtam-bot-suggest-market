import Redis from 'ioredis';
import { config } from '../config';
import { log } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Redis client singleton
// ─────────────────────────────────────────────────────────────────────────────

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 500, 5000);
    log.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => log.info('Redis connected'));
redis.on('error', (err) => log.error('Redis error', { error: err.message }));
redis.on('reconnecting', () => log.warn('Redis reconnecting...'));

// ─────────────────────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a cached JSON value. Returns null on miss.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value with optional TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, serialized);
    } else {
      await redis.set(key, serialized);
    }
  } catch (err) {
    log.warn('Cache set failed', { key, error: (err as Error).message });
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache key generators
// ─────────────────────────────────────────────────────────────────────────────

export const cacheKeys = {
  price: (symbol: string) => `price:${symbol.toLowerCase()}`,
  ohlcv: (symbol: string, timeframe: string) => `ohlcv:${symbol.toLowerCase()}:${timeframe}`,
  fundamental: (symbol: string) => `fundamental:${symbol.toLowerCase()}`,
  news: (symbol: string) => `news:${symbol.toLowerCase()}`,
  signal: (symbol: string, riskProfile: string) => `signal:${symbol.toLowerCase()}:${riskProfile}`,
};

// TTL constants (seconds)
export const TTL = {
  PRICE_CRYPTO: 30,
  PRICE_STOCK: 60,
  OHLCV: 300,       // 5 minutes
  FUNDAMENTAL: 3600, // 1 hour
  NEWS: 300,         // 5 minutes
  SIGNAL: 180,       // 3 minutes
};
