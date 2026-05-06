import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { PriceService } from '../../services/PriceService';
import { formatPrice } from '../../utils/formatter';
import { DbAlert } from '../../types';

export async function handleAlert(ctx: Context): Promise<void> {
  const text = [
    `🔔 <b>Price Alert Setup</b>`,
    `Pilih tipe alert yang ingin kamu pasang:`,
  ].join('\n');

  const kb = new InlineKeyboard()
    .text('💰 Price Target (GTE/LTE)', 'al_price_start').row()
    .text('📈 % Change Alert (Daily Move)', 'al_pct_start').row()
    .text('⬅️ Back', 'back_to_menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  }
}

export async function handleAlertCallbacks(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'al_price_start') {
    await ctx.answerCallbackQuery();
    await ctx.reply('💰 <b>Price Target Alert</b>\nKetik Simbol dan Harga Target:\nContoh: <code>BTCUSDT 75000</code>', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    return;
  }

  if (data === 'al_pct_start') {
    await ctx.answerCallbackQuery();
    await ctx.reply('📈 <b>% Change Alert</b>\nKetik Simbol dan Persentase:\nContoh: <code>BTCUSDT 5</code> (untuk alert saat naik 5%)', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    return;
  }
}
