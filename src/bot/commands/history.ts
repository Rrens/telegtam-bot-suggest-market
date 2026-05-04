import { CommandContext, Context } from 'grammy';
import { SignalEngine } from '../../services/SignalEngine';
import { formatHistory } from '../../utils/formatter';

// Usage: /history <symbol>
export async function handleHistory(ctx: CommandContext<Context>): Promise<void> {
  let symbol = ctx.match?.trim().toUpperCase() ?? '';
  
  // Apply the same symbol formatting as /predict
  if (symbol.length === 4 && !symbol.includes('.') && !symbol.endsWith('USDT')) {
    symbol = `${symbol}.JK`;
  }

  if (!symbol) {
    await ctx.reply('Usage: /history &lt;symbol&gt;\nExample: /history BTCUSDT', { parse_mode: 'HTML' });
    return;
  }

  const loadingMsg = await ctx.reply(`Fetching signal history for <b>${symbol}</b>...`, { parse_mode: 'HTML' });

  try {
    const signals = await SignalEngine.getHistory(symbol, 10);
    const message = formatHistory(symbol, signals);
    await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, message, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `Failed to retrieve history for <b>${symbol}</b>.`,
      { parse_mode: 'HTML' }
    );
  }
}
