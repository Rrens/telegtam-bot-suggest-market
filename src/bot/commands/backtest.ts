import { CommandContext, Context } from 'grammy';
import { BacktestService } from '../../services/BacktestService';
import { formatBacktest } from '../../utils/formatter';

// Usage: /backtest <symbol>
export async function handleBacktest(ctx: CommandContext<Context>): Promise<void> {
  const symbol = ctx.match?.trim().toUpperCase();

  if (!symbol) {
    await ctx.reply('Usage: /backtest &lt;symbol&gt;\nExample: /backtest BTCUSDT', { parse_mode: 'HTML' });
    return;
  }

  const loadingMsg = await ctx.reply(`Running backtest for <b>${symbol}</b>...`, { parse_mode: 'HTML' });

  try {
    const result = await BacktestService.backtest(symbol);
    const message = formatBacktest(result);
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `Backtest failed for <b>${symbol}</b>: ${(err as Error).message}`,
      { parse_mode: 'HTML' }
    );
  }
}
