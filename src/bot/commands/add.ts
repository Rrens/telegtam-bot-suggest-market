import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';
import { log } from '../../utils/logger';
import { AssetType } from '../../types';
import { formatPrice, formatPct } from '../../utils/formatter';

// Usage: /add <symbol> <amount> <avg_price>
// Example: /add BTCUSDT 0.5 60000
// Example: /add ASII 10 5200 (Auto-converts to ASII.JK and handles lot if specified)
export async function handleAdd(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const args = ctx.match?.trim().split(/\s+/) ?? [];

  if (args.length < 2) {
    await ctx.reply(
      'Usage: <code>/add &lt;symbol&gt; &lt;amount&gt; &lt;avg_price&gt;</code>\n\n' +
      'Examples:\n' +
      '/add BTCUSDT 0.5 60000\n' +
      '/add ASII.JK 100 5200 (Amount in shares)\n' +
      '/add ASII 1 lot 5200 (1 lot = 100 shares)',
      { parse_mode: 'HTML' }
    );
    return;
  }

  let [rawSymbol, rawAmount, rawPrice] = args;
  
  // Smart symbol normalization for Indonesian stocks
  let symbol = rawSymbol.toUpperCase();
  if (symbol.length === 4 && !symbol.includes('.') && !symbol.endsWith('USDT')) {
    symbol = `${symbol}.JK`;
  }

  // Handle lot conversion
  let isLot = args.includes('lot');

  let parsedPrice: number | undefined;
  let startIndex = isLot ? args.indexOf('lot') + 1 : 2;
  for (let i = startIndex; i < args.length; i++) {
    // Remove letters, $, and commas. Example: "IDR", "Rp3000000", "3,000,000"
    const cleaned = args[i].replace(/[a-zA-Z$]/g, '').replace(/,/g, '');
    if (cleaned.length > 0) {
      const val = parseFloat(cleaned);
      if (!isNaN(val)) {
        parsedPrice = val;
        break;
      }
    }
  }

  let amount = parseFloat(rawAmount);
  if (isLot || symbol.endsWith('.JK')) {
    // In Indonesia, people often speak in lots. If they say 3 and it's a .JK stock, 
    // it's ambiguous. But the user explicitly said "3 lot".
    if (isLot) amount *= 100;
  }

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('Invalid amount. Please provide a positive number.');
    return;
  }

  const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });

  try {
    const priceData = await PriceService.getPrice(symbol);
    const assetType: AssetType = PriceService.detectAssetType(symbol);
    const isFiat = PriceService.isFiat(symbol);
    const currency = isFiat ? symbol : ((symbol.endsWith('.JK') || symbol === 'LM') ? 'IDR' : 'USD');

    // Use provided price or default to current market price
    const avgPrice = parsedPrice !== undefined ? parsedPrice : priceData.price;

    if (isNaN(avgPrice) || avgPrice <= 0) {
      await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, 'Invalid price. Please provide a positive number.', { parse_mode: 'HTML' });
      return;
    }

    await db('assets')
      .insert({ user_id: userId, symbol, asset_type: assetType, amount, avg_price: avgPrice })
      .onConflict(['user_id', 'symbol'])
      .merge({ amount, avg_price: avgPrice });

    const currentValue = amount * priceData.price;
    const cost = amount * avgPrice;
    const pnl = currentValue - cost;
    const pnlPct = ((pnl / cost) * 100).toFixed(2);
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `✅ <b>${symbol}</b> added to portfolio.\n\n` +
      `Amount: ${amount.toLocaleString()} shares ${isLot ? '(3 lots)' : ''}\n` +
      `Avg Buy Price: ${formatPrice(avgPrice, currency)}\n` +
      `Current Price: ${formatPrice(priceData.price, currency)}\n` +
      `Current Value: ${formatPrice(currentValue, currency)}\n` +
      `PnL: ${pnl >= 0 ? '+' : ''}${formatPrice(pnl, currency)} (${formatPct(parseFloat(pnlPct))})`,
      { parse_mode: 'HTML' }
    );

    log.info('Asset added', { userId, symbol, amount, avgPrice });
  } catch (err) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      `Could not validate symbol <b>${symbol}</b>. Please check the symbol and try again.`,
      { parse_mode: 'HTML' }
    );
    log.warn('Add asset failed', { userId, symbol, error: (err as Error).message });
  }
}
