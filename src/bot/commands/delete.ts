import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';

export async function handleDelete(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const symbol = ctx.match?.trim().toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /delete &lt;symbol&gt;\nExample: /delete BTCUSDT', { parse_mode: 'HTML' });
    return;
  }

  const deleted = await db('assets').where({ user_id: userId, symbol }).delete();

  if (deleted === 0) {
    await ctx.reply(`Asset <b>${symbol}</b> not found in your portfolio.`, { parse_mode: 'HTML' });
    return;
  }

  await ctx.reply(`✅ <b>${symbol}</b> removed from your portfolio.`, { parse_mode: 'HTML' });
  log.info('Asset deleted', { userId, symbol });
}
