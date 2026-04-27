import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { formatPrice } from '../../utils/formatter';
import { DbAlert } from '../../types';

// Usage: /alert <symbol> <gte|lte> <value> [pct]
// Examples:
//   /alert BTCUSDT gte 70000       → price target
//   /alert BTCUSDT lte -5 pct      → % change alert
export async function handleAlert(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const args = ctx.match?.trim().split(/\s+/) ?? [];

  if (args.length < 3) {
    await ctx.reply(
      '<b>Alert command usage:</b>\n\n' +
      'Price target: /alert &lt;symbol&gt; &lt;gte|lte&gt; &lt;price&gt;\n' +
      'Pct change:   /alert &lt;symbol&gt; &lt;gte|lte&gt; &lt;pct&gt; pct\n\n' +
      'Examples:\n' +
      '/alert BTCUSDT gte 70000 — alert when BTC ≥ $70,000\n' +
      '/alert BTCUSDT lte 55000 — alert when BTC ≤ $55,000\n' +
      '/alert ETHUSDT gte 10 pct — alert when ETH rises 10%\n' +
      '/alert ETHUSDT lte -10 pct — alert when ETH drops 10%',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const [rawSymbol, rawCondition, rawValue, flag] = args;
  const symbol = rawSymbol.toUpperCase();
  const condition = rawCondition.toLowerCase();
  const value = parseFloat(rawValue);
  const isPct = flag?.toLowerCase() === 'pct';

  if (condition !== 'gte' && condition !== 'lte') {
    await ctx.reply('Condition must be either <code>gte</code> (≥) or <code>lte</code> (≤).', { parse_mode: 'HTML' });
    return;
  }
  if (isNaN(value)) {
    await ctx.reply('Invalid value. Please provide a number.');
    return;
  }

  const alertType: DbAlert['alert_type'] = isPct ? 'pct_change' : 'price_target';
  const alert = await AlertService.createAlert(userId, symbol, alertType, condition as 'gte' | 'lte', value);

  const conditionStr = condition === 'gte' ? '≥' : '≤';
  const valueStr = isPct ? `${value}%` : formatPrice(value);

  await ctx.reply(
    `✅ <b>Alert set for ${symbol}</b>\n\n` +
    `Type: ${isPct ? '% Change' : 'Price Target'}\n` +
    `Condition: ${conditionStr} ${valueStr}\n\n` +
    `You will be notified when the condition is met.\n` +
    `<i>Alert ID: ${alert.id}</i>`,
    { parse_mode: 'HTML' }
  );
}
