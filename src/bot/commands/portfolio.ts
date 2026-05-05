// ─────────────────────────────────────────────────────────────────────────────
// /portfolio command: View asset holdings with refresh button.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';

export async function handlePortfolio(ctx: CommandContext<Context> | Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  if (ctx.callbackQuery?.data === 'exec_portfolio_refresh') {
    await ctx.answerCallbackQuery('🔄 Updating portfolio values...');
  }

  try {
    const assets = await db('assets').where({ user_id: userId.toString() });
    if (assets.length === 0) {
      const msg = '📁 Portfolio lo masih kosong. Gunakan <code>/add</code> buat nambahin aset.';
      if (ctx.callbackQuery) return (ctx as any).editMessageText(msg, { parse_mode: 'HTML' });
      return (ctx as any).reply(msg, { parse_mode: 'HTML' });
    }

    const rate = PriceService.getLastUsdIdrRate();
    let totalValueUsd = 0;
    let totalPnLUsd = 0;
    let assetLines = '';

    for (const a of assets) {
      const { price } = await PriceService.getPrice(a.symbol);
      const isIdr = a.symbol.endsWith('.JK') || a.symbol.endsWith('.ID');
      
      const usdPrice = isIdr ? price / rate : price;
      const usdAvgPrice = isIdr ? a.avg_price / rate : a.avg_price;
      
      const valUsd = a.amount * usdPrice;
      const costUsd = a.amount * usdAvgPrice;
      const pnlUsd = valUsd - costUsd;
      
      totalValueUsd += valUsd;
      totalPnLUsd += pnlUsd;

      const cur = isIdr ? 'Rp' : '$';
      assetLines += `\n<b>${a.symbol}</b>\n`;
      assetLines += `  Hold: ${a.amount} | Val: ${cur}${(a.amount * price).toLocaleString()}\n`;
      assetLines += `  PnL: ${pnlUsd >= 0 ? '🟢' : '🔴'} ${cur}${(a.amount * (price - a.avg_price)).toLocaleString()}\n`;
    }

    const message = [
      `📁 <b>Portfolio Summary</b>`,
      ``,
      `Total Value: <b>$${totalValueUsd.toLocaleString(undefined, {maximumFractionDigits:2})}</b>`,
      `Total PnL: <b>${totalPnLUsd >= 0 ? '+' : ''}$${totalPnLUsd.toLocaleString(undefined, {maximumFractionDigits:2})}</b>`,
      ``,
      `── <b>Assets</b> ──`,
      assetLines,
      ``,
      `<i>Pilih Mini App buat liat detail lebih pro.</i>`,
    ].join('\n');

    const keyboard = new InlineKeyboard()
      .text('🔄 Update Value', 'exec_portfolio_refresh').row()
      .text('🚀 Open Mini App', 'cmd_app').row()
      .text('⬅️ Back to Menu', 'back_to_menu');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (e) {
    const errMsg = '❌ Gagal memuat data portfolio.';
    if (ctx.callbackQuery) await ctx.editMessageText(errMsg); else await ctx.reply(errMsg);
  }
}
