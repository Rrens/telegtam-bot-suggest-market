// ─────────────────────────────────────────────────────────────────────────────
// /watchlist command: View tracked tokens with refresh button.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { db } from '../../db';
import { PriceService } from '../../services/PriceService';

export async function handleWatch(ctx: CommandContext<Context>): Promise<void> {
  const symbol = (ctx as any).match?.[1]?.toUpperCase();
  if (!symbol) return ctx.reply('👁 Gunakan: <code>/watch &lt;symbol&gt;</code>', { parse_mode: 'HTML' });
  // Logic minimal untuk nambahin watchlist
  await db('watchlist').insert({ user_id: ctx.from!.id.toString(), symbol }).onConflict(['user_id', 'symbol']).ignore();
  await ctx.reply(`✅ <code>${symbol}</code> berhasil ditambah ke watchlist!`, { parse_mode: 'HTML' });
}

export async function handleWatchlist(ctx: CommandContext<Context> | Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  if (ctx.callbackQuery?.data === 'exec_watchlist_refresh') {
    await ctx.answerCallbackQuery('🔄 Updating watchlist prices...');
  }

  try {
    const items = await db('watchlist').where({ user_id: userId.toString() });
    if (items.length === 0) {
      const msg = '👁 Watchlist lo masih kosong. Gunakan <code>/watch &lt;symbol&gt;</code> buat nambahin.';
      if (ctx.callbackQuery) return (ctx as any).editMessageText(msg, { parse_mode: 'HTML' });
      return (ctx as any).reply(msg, { parse_mode: 'HTML' });
    }

    let message = `👁 <b>Your Watchlist</b>\n\n`;
    
    for (const item of items) {
      const { price, change24h } = await PriceService.getPrice(item.symbol);
      const isIdr = item.symbol.endsWith('.JK') || item.symbol.endsWith('.ID');
      const cur = isIdr ? 'Rp' : '$';
      
      message += `• <code>${item.symbol}</code>\n`;
      message += `  Price: ${cur}${price.toLocaleString()} (${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)\n`;
      if (item.entry_price) {
        message += `  Target: ${cur}${parseFloat(item.entry_price).toLocaleString()}\n`;
      }
      message += `\n`;
    }

    message += `💡 <i>Tap simbol untuk copy ticker.</i>`;

    const keyboard = new InlineKeyboard()
      .text('🔄 Refresh Harga', 'exec_watchlist_refresh').row()
      .text('⬅️ Back to Menu', 'back_to_menu');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (e) {
    const errMsg = '❌ Gagal memuat watchlist.';
    if (ctx.callbackQuery) await ctx.editMessageText(errMsg); else await ctx.reply(errMsg);
  }
}
