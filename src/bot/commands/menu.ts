// ─────────────────────────────────────────────────────────────────────────────
// /menu command: A clean, categorized inline dashboard for all bot features.
// ─────────────────────────────────────────────────────────────────────────────

import { CommandContext, Context, InlineKeyboard } from 'grammy';
import { handleHelp } from './help';
import { config } from '../../config';

export async function handleMenu(ctx: CommandContext<Context> | Context): Promise<void> {
  const isStart = !ctx.callbackQuery && (ctx as any).message?.text?.startsWith('/start');
  const me = await ctx.api.getMe();
  const botName = me.first_name;
  
  const text = isStart 
    ? [
        `👋 <b>Halo, ${(ctx as any).from?.first_name || 'Trader'}!</b>`,
        `Gue adalah <b>${botName}</b>, asisten intelijen pasar lo.`,
        ``,
        `Gue bisa bantu lo nyari koin micin Solana, nge-scan keamanan token (RugCheck), mantau whale, sampai ngasih sinyal teknikal pake AI.`,
        ``,
        `Silakan pilih kategori di bawah buat mulai eksplorasi:`,
      ].join('\n')
    : [
        `📱 <b>Main Dashboard</b>`,
        `Pilih kategori fitur yang mau lo akses:`,
      ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('🚀 Market Intel', 'cat_market')
    .text('🛡️ Security & Watch', 'cat_security').row()
    .text('📊 Alerts & Tools', 'cat_alerts')
    .text('📱 Open Mini App', 'cat_app').row()
    .text('❓ Help Center', 'cmd_help');

  // Hanya tampilkan tombol dashboard jika bukan localhost (Telegram policy)
  const dashboardUrl = `https://your-domain.com/dashboard?token=${config.app.dashboardSecret}`;
  // keyboard.url('🌐 Web Dashboard', dashboardUrl); 

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

export async function handleMenuCallbacks(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  let text = '';
  let keyboard = new InlineKeyboard();

  if (data === 'cat_market') {
    text = `🚀 <b>Market Intelligence</b>\n\nAnalisis sentimen dan deteksi pergerakan besar di pasar:`;
    keyboard
      .text('🌅 Market Today', 'cmd_today')
      .text('🎭 Sentiment', 'cmd_sentiment').row()
      .text('💎 Solana Gems', 'cmd_solana')
      .text('🐋 Smart Money', 'cmd_smartmoney').row()
      .text('⬅️ Back to Menu', 'back_to_menu');
  } 
  else if (data === 'cat_security') {
    text = `🛡️ <b>Security & Watchlist</b>\n\nJaga aset lo dari rugpull dan pantau koin incaran:`;
    keyboard
      .text('🛡️ RugCheck CA', 'cmd_check')
      .text('👁 View Watchlist', 'cmd_watchlist').row()
      .text('➕ Add Watchlist', 'cmd_watch_help')
      .text('⬅️ Back to Menu', 'back_to_menu');
  }
  else if (data === 'cat_alerts') {
    text = `📊 <b>Technical Alerts</b>\n\nSetel notifikasi otomatis berdasarkan indikator teknikal:`;
    keyboard
      .text('📉 Set RSI/MA Alert', 'cmd_alertrsi')
      .text('⬅️ Back to Menu', 'back_to_menu');
  }
  else if (data === 'cat_app') {
    text = `📱 <b>Telegram Mini App</b>\n\nBuka dashboard interaktif langsung di Telegram buat pengalaman pro:`;
    keyboard
      .text('🚀 Launch Mini App', 'cmd_app')
      .text('⬅️ Back to Menu', 'back_to_menu');
  }
  else if (data === 'back_to_menu') {
    return handleMenu(ctx);
  }

  // Handle Command Triggers from Callback
  if (data.startsWith('cmd_')) {
    const cmd = data.replace('cmd_', '');
    await ctx.answerCallbackQuery();
    
    // Memberikan instruksi cara pakai jika command butuh input
    if (cmd === 'help') {
      await handleHelp(ctx);
      return;
    }
    if (cmd === 'check') {
      await ctx.reply('🛡️ Ketik <code>/check &lt;alamat_kontrak&gt;</code> buat scan koin Solana.', { parse_mode: 'HTML' });
      return;
    }
    if (cmd === 'watch_help') {
      await ctx.reply('👁 Ketik <code>/watch &lt;symbol&gt;</code> buat nambahin ke watchlist.', { parse_mode: 'HTML' });
      return;
    }
    if (cmd === 'today') {
      await ctx.reply('/today');
      return;
    }
    
    await ctx.reply(`Gunakan command: <code>/${cmd}</code>`, { parse_mode: 'HTML' });
    return;
  }

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  await ctx.answerCallbackQuery();
}
