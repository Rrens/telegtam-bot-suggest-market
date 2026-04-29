import { CommandContext, Context } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { PriceService } from '../../services/PriceService';
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

  let [rawSymbol, rawCondition, rawValue, flag] = args;
  
  // Smart symbol normalization
  let symbol = rawSymbol.toUpperCase();
  if (symbol.length === 4 && !symbol.includes('.') && !symbol.endsWith('USDT')) {
    symbol = `${symbol}.JK`;
  }

  let condition = rawCondition.toLowerCase();
  let value = parseFloat(rawValue);
  let isPct = flag?.toLowerCase() === 'pct';

  // Fallback: If user provides 2 args like "/alert WBSA 1331", infer the condition
  if (args.length === 2) {
    const symbolOnly = args[0].toUpperCase();
    const finalSymbol = (symbolOnly.length === 4 && !symbolOnly.includes('.') && !symbolOnly.endsWith('USDT')) ? `${symbolOnly}.JK` : symbolOnly;
    const valOnly = parseFloat(args[1]);

    if (!isNaN(valOnly)) {
      try {
        const priceData = await PriceService.getPrice(finalSymbol);
        const autoCondition = valOnly >= priceData.price ? 'gte' : 'lte';
        
        const alert = await AlertService.createAlert(userId, finalSymbol, 'price_target', autoCondition, valOnly);
        await ctx.reply(
          `✅ <b>Alert set automatically for ${finalSymbol}</b>\n\n` +
          `Condition: ${autoCondition === 'gte' ? '≥' : '≤'} ${formatPrice(valOnly, finalSymbol.endsWith('.JK') ? 'IDR' : 'USD')}\n` +
          `<i>(Detected current price: ${formatPrice(priceData.price, finalSymbol.endsWith('.JK') ? 'IDR' : 'USD')})</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      } catch (err) {
        // Fallback to error message if price fetch fails
      }
    }
  }

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
  const currency = symbol.endsWith('.JK') ? 'IDR' : 'USD';
  const valueStr = isPct ? `${value}%` : formatPrice(value, currency);

  await ctx.reply(
    `✅ <b>Alert set for ${symbol}</b>\n\n` +
    `Type: ${isPct ? '% Change' : 'Price Target'}\n` +
    `Condition: ${conditionStr} ${valueStr}\n\n` +
    `You will be notified when the condition is met.\n` +
    `<i>Alert ID: ${alert.id}</i>`,
    { parse_mode: 'HTML' }
  );
}
