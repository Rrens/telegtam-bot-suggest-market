import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { db } from '../../db';
import { log } from '../../utils/logger';

export async function handleAlertRsi(ctx: Context): Promise<void> {
  const text = [
    `📊 <b>Technical Alert Setup</b>`,
    `Pilih tipe alert yang ingin kamu pasang secara otomatis:`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('📉 RSI Alert (Overbought/Oversold)', 'arsi_rsi_start').row()
    .text('✨ MA Cross (Golden/Death Cross)', 'arsi_ma_start').row()
    .text('❌ Cancel Alert', 'arsi_cancel_start')
    .text('⬅️ Back', 'back_to_menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

/**
 * Handle callbacks for alertrsi flow
 */
export async function handleAlertRsiCallbacks(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const userId = String(ctx.from!.id);

  if (data === 'arsi_rsi_start') {
    await ctx.answerCallbackQuery();
    await ctx.reply('🔍 <b>RSI Alert Setup</b>\nKetik Simbol yang ingin dipantau:\nContoh: <code>BTCUSDT</code>', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    // The actual processing will happen in the message handler
    return;
  }

  if (data === 'arsi_ma_start') {
    await ctx.answerCallbackQuery();
    await ctx.reply('🔍 <b>MA Cross Setup</b>\nKetik Simbol yang ingin dipantau:\nContoh: <code>ETHUSDT</code>', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    return;
  }

  if (data === 'arsi_cancel_start') {
    await ctx.answerCallbackQuery();
    await ctx.reply('❌ <b>Cancel Technical Alert</b>\nKetik Simbol yang ingin dibatalkan alert-nya:\nContoh: <code>BTCUSDT</code>', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    return;
  }
}
