import { CommandContext, Context } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';
import { formatPrice, formatPct, formatAmount } from '../../utils/formatter';
import { DbAsset } from '../../types';

export async function handleList(ctx: CommandContext<Context>): Promise<void> {
  const userId = String(ctx.from!.id);
  const assets: DbAsset[] = await db('assets').where({ user_id: userId }).orderBy('created_at', 'desc');

  if (assets.length === 0) {
    await ctx.reply(
      'You have no tracked assets yet.\n\nUse /add &lt;symbol&gt; &lt;amount&gt; &lt;avg_price&gt; to add one.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const lines: string[] = ['<b>Your Tracked Assets:</b>', ''];
  for (const asset of assets) {
    let priceStr = 'N/A';
    let pnlStr = '';
    try {
      const price = await PriceService.getPrice(asset.symbol);
      const amount = parseFloat(asset.amount.toString());
      const avgPrice = parseFloat(asset.avg_price.toString());
      const pnlPct = ((price.price - avgPrice) / avgPrice) * 100;
      const currency = asset.symbol.endsWith('.JK') ? 'IDR' : 'USD';
      
      const avgPriceStr = formatPrice(avgPrice, currency);
      const currentPriceStr = formatPrice(price.price, currency);
      const totalValue = amount * price.price;
      const totalValueStr = formatPrice(totalValue, currency);
      
      lines.push(`• <b>${asset.symbol}</b> — ${formatAmount(amount)} assets`);
      lines.push(`  Value: <b>${totalValueStr}</b> | PnL: ${formatPct(pnlPct)}`);
      lines.push(`  Avg: ${avgPriceStr} → Curr: ${currentPriceStr}`);
      lines.push('');
    } catch {
      lines.push(`• <b>${asset.symbol}</b> — ${asset.amount} (Price unavailable)`);
      lines.push('');
    }
  }

  lines.push('');
  lines.push(`Use /delete &lt;symbol&gt; to remove an asset.`);

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}
