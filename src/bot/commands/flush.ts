import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { cacheKeys, cacheDel } from '../../cache/redis';
import { log } from '../../utils/logger';
import { RiskProfile } from '../../types';

/**
 * /flush <symbol>
 * Force clears the cached signal for a specific symbol and the user's risk profile.
 */
export async function handleFlush(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const symbol = ctx.match?.trim().toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /flush <symbol>\nExample: /flush BTCUSDT');
    return;
  }

  try {
    // Get user's risk profile to know which cache key to delete
    const user = await db('users').where({ id: userId }).first();
    const riskProfile: RiskProfile = user?.risk_profile ?? 'moderate';

    const cacheKey = cacheKeys.signal(symbol, riskProfile);
    await cacheDel(cacheKey);

    await ctx.reply(`✅ Cache for <b>${symbol}</b> (Profile: ${riskProfile}) has been cleared.\nRun /predict to see the fresh analysis.`, {
      parse_mode: 'HTML'
    });

    log.info('User flushed signal cache', { userId, symbol, riskProfile });
  } catch (err) {
    log.error('Flush command failed', { error: (err as Error).message });
    await ctx.reply('Failed to clear cache. Please try again.');
  }
}
