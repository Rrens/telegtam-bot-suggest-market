import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { AlertService } from '../../services/AlertService';
import { PriceService } from '../../services/PriceService';
import { formatPrice } from '../../utils/formatter';
import { DbAlert } from '../../types';

export async function handleAlert(ctx: Context): Promise<void> {
  // Check if we have arguments (only for text message command)
  const messageText = ctx.message?.text || '';
  const args = messageText.startsWith('/alert') ? messageText.split(/\s+/).slice(1) : [];

  if (args.length >= 3) {
    // Command flow: /alert <symbol> <UP/DOWN> <price>
    const symbol = args[0].toUpperCase();
    const direction = args[1].toUpperCase();
    const targetPrice = parseFloat(args[2]);

    let condition: 'gte' | 'lte' | null = null;
    if (direction === 'UP' || direction === 'GTE' || direction === '>=') {
      condition = 'gte';
    } else if (direction === 'DOWN' || direction === 'LTE' || direction === '<=') {
      condition = 'lte';
    }

    if (!symbol || !condition || isNaN(targetPrice) || targetPrice <= 0) {
      await ctx.reply('❌ Format salah. Gunakan: <code>/alert &lt;symbol&gt; UP/DOWN &lt;harga&gt;</code>\nContoh: <code>/alert BTCUSDT UP 70000</code>', { parse_mode: 'HTML' });
      return;
    }

    const userId = String(ctx.from!.id);
    const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });

    try {
      const priceData = await PriceService.getPrice(symbol);
      const alert = await AlertService.createAlert(userId, symbol, 'price_target', condition, targetPrice);

      const dirText = condition === 'gte' ? 'Melampaui (≥)' : 'Turun di Bawah (≤)';
      const colorIcon = condition === 'gte' ? '🟢' : '🔴';

      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        `✅ <b>Price Alert berhasil dibuat!</b>\n\n` +
        `🔔 Aset: <b>${symbol}</b>\n` +
        `🎯 Target: ${colorIcon} <b>${dirText}</b> ${formatPrice(targetPrice, symbol)}\n` +
        `💰 Harga sekarang: ${formatPrice(priceData.price, symbol)}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        `❌ Gagal membuat alert. Pastikan simbol <b>${symbol}</b> valid.`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

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
    const text = [
      `🔔 <b>Price Target Alert Setup</b>`,
      `Pilih tipe pergerakan harga target yang ingin kamu pasang:`,
    ].join('\n');
    const kb = new InlineKeyboard()
      .text('🟢 UP (Harga Naik/Melampaui)', 'al_price_up').row()
      .text('🔴 DOWN (Harga Turun/Di Bawah)', 'al_price_down').row()
      .text('⬅️ Back', 'cmd_alert');
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  if (data === 'al_price_up') {
    await ctx.answerCallbackQuery();
    await ctx.reply('🟢 <b>Price Target Alert (UP)</b>\nKetik Simbol dan Harga Target:\nContoh: <code>BTCUSDT 75000</code>', { 
      parse_mode: 'HTML',
      reply_markup: { force_reply: true }
    });
    return;
  }

  if (data === 'al_price_down') {
    await ctx.answerCallbackQuery();
    await ctx.reply('🔴 <b>Price Target Alert (DOWN)</b>\nKetik Simbol dan Harga Target:\nContoh: <code>BTCUSDT 60000</code>', { 
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
