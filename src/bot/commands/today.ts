// ─────────────────────────────────────────────────────────────────────────────
// /today command: Market overview with refresh button.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { PriceService } from '../../services/PriceService';

export async function handleToday(ctx: CommandContext<Context> | Context): Promise<void> {
  const loadingMsg = ctx.callbackQuery ? null : await ctx.reply('⏳ Mengumpulkan data pasar hari ini...');
  if (ctx.callbackQuery?.data === 'exec_today_refresh') {
    await ctx.answerCallbackQuery('🔄 Refreshing market data...');
  }

  try {
    const rate = PriceService.getLastUsdIdrRate();
    const movers = await PriceService.getTopMovers(); // Mengambil data gainer/loser

    let message = `🌅 <b>Market Overview - Today</b>\n`;
    message += `<i>Kurs: $1 = Rp${rate.toLocaleString()}</i>\n\n`;

    message += `🔥 <b>Top Gainers:</b>\n`;
    movers.gainers.slice(0, 5).forEach((m: any) => {
      message += `• <code>${m.symbol}</code>: <b>+${m.change.toFixed(2)}%</b> ($${m.price.toLocaleString()})\n`;
    });

    message += `\n🧊 <b>Top Losers:</b>\n`;
    movers.losers.slice(0, 5).forEach((m: any) => {
      message += `• <code>${m.symbol}</code>: <span class="negative">${m.change.toFixed(2)}%</span> ($${m.price.toLocaleString()})\n`;
    });

    message += `\n💡 <i>Tap simbol koin untuk copy ticker.</i>`;

    const keyboard = new InlineKeyboard()
      .text('🔄 Refresh Data', 'exec_today_refresh').row()
      .text('⬅️ Back to Menu', 'back_to_menu');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      if (loadingMsg) await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (e) {
    const errMsg = '❌ Gagal mengambil data pasar. Coba lagi nanti.';
    if (ctx.callbackQuery) await ctx.editMessageText(errMsg); else await ctx.reply(errMsg);
  }
}
