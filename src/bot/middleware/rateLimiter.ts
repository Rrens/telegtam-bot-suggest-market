// ─────────────────────────────────────────────────────────────────────────────
// Bot middleware: Rate limiter — prevents command spam per user.
// ─────────────────────────────────────────────────────────────────────────────

import { Context, MiddlewareFn } from 'grammy';
import { redis } from '../../cache/redis';
import { log } from '../../utils/logger';

import { config } from '../../config';

const RATE_LIMIT_WINDOW_MS = 3000; // 3 seconds between commands per user
const RATE_LIMIT_KEY = (userId: number) => `ratelimit:${userId}`;

export function rateLimiter(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    // Skip rate limit for Admin
    if (config.bot.adminId && userId.toString() === config.bot.adminId) {
      return next();
    }

    const key = RATE_LIMIT_KEY(userId);
    const exists = await redis.get(key);

    if (exists) {
      await ctx.reply('Please wait a moment before sending another command.').catch(() => {});
      log.debug('Rate limit hit', { userId });
      return;
    }

    await redis.setex(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000), '1');
    return next();
  };
}
