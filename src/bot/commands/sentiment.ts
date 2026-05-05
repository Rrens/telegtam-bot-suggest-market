// ─────────────────────────────────────────────────────────────────────────────
// /sentiment command: Fear & Greed Index with refresh button.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { FearGreedService } from '../../services/FearGreedService';

export async function handleSentiment(ctx: CommandContext<Context> | Context): Promise<void> {
  if (ctx.callbackQuery?.data === 'exec_sentiment_refresh') {
    await ctx.answerCallbackQuery('🔄 Updating sentiment data...');
  }

  try {
    const data = await FearGreedService.getIndex();
    if (!data) throw new Error('Data sentiment tidak tersedia');
    
    const emoji = 
      data.classification === 'Extreme Fear' ? '😨' :
      data.classification === 'Fear' ? '😨' :
      data.classification === 'Neutral' ? '😐' :
      data.classification === 'Greed' ? '🤑' : '🚀';

    const message = [
      `🎭 <b>Market Sentiment Analysis</b>`,
      ``,
      `Current Index: <b>${data.value}</b>`,
      `Classification: <b>${emoji} ${data.classification}</b>`,
      ``,
      `<i>Indeks ini mengukur emosi pasar kripto berdasarkan volatilitas, volume, dan media sosial.</i>`,
    ].join('\n');

    const keyboard = new InlineKeyboard()
      .text('🔄 Cek Lagi', 'exec_sentiment_refresh').row()
      .text('⬅️ Back to Menu', 'back_to_menu');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch (e) {
    const errMsg = '❌ Gagal mengambil data sentimen.';
    if (ctx.callbackQuery) await ctx.editMessageText(errMsg); else await ctx.reply(errMsg);
  }
}
