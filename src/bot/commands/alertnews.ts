import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { log } from '../../utils/logger';

// Usage: /alertnews <symbol>
// Usage: /alertnews stop <symbol>  → unsubscribe
export async function handleAlertNews(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const args = ctx.match?.trim().split(/\s+/) ?? [];

  if (args.length === 0 || !args[0]) {
    await ctx.reply(
      'Usage:\n' +
      '/alertnews &lt;symbol&gt; — subscribe to news alerts\n' +
      '/alertnews stop &lt;symbol&gt; — unsubscribe',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // /alertnews stop BTCUSDT
  if (args[0].toLowerCase() === 'stop' && args[1]) {
    const symbol = args[1].toUpperCase();
    await AlertService.removeNewsAlert(userId, symbol);
    await ctx.reply(`News alerts for <b>${symbol}</b> disabled.`, { parse_mode: 'HTML' });
    return;
  }

  const symbol = args[0].toUpperCase();
  await AlertService.createNewsAlert(userId, symbol);
  await ctx.reply(
    `🔔 <b>News alert activated for ${symbol}</b>\n\n` +
    `You will be notified when significant news is detected.\n` +
    `Anti-spam cooldown: 1 hour between alerts.\n\n` +
    `To unsubscribe: /alertnews stop ${symbol}`,
    { parse_mode: 'HTML' }
  );
  log.info('News alert created', { userId, symbol });
}
