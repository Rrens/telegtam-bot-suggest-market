// ─────────────────────────────────────────────────────────────────────────────
// /menu command: Interactive dashboard with direct execution logic.
// ─────────────────────────────────────────────────────────────────────────────

import { Context, InlineKeyboard } from 'grammy';
import { handleHelp } from './help';
import { handleToday } from './today';
import { handleSentiment } from './sentiment';
import { handleSolana } from './solana';
import { handleSmartMoney } from './smartmoney';
import { handleWatchlist } from './watchlist';
import { handleAlertRsi } from './alertrsi';
import { handleApp } from './app';
import { handleCheck } from './check';

export async function handleMenu(ctx: Context): Promise<void> {
  const isStart = !ctx.callbackQuery && ctx.message?.text?.startsWith('/start');
  const me = await ctx.api.getMe();
  const botName = me.first_name;
  
  const text = isStart 
    ? [
        `👋 <b>Halo, ${ctx.from?.first_name || 'Trader'}!</b>`,
        `Gue adalah <b>${botName}</b>, terminal intelijen pasar lo.`,
        ``,
        `Klik kategori di bawah buat akses fitur secara instan:`,
      ].join('\n')
    : `📱 <b>Main Dashboard</b>\nPilih fitur yang mau lo eksekusi:`;

  const keyboard = new InlineKeyboard()
    .text('🚀 Market Intel', 'cat_market')
    .text('🛡️ Security & Watch', 'cat_security').row()
    .text('📊 Alerts & Tools', 'cat_alerts')
    .text('📱 Launch Mini App', 'cmd_app').row()
    .text('❓ Help Center', 'cmd_help');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

export async function handleMenuCallbacks(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // 1. Categories
  if (data === 'cat_market') {
    const kb = new InlineKeyboard()
      .text('🌅 Market Today', 'cmd_today')
      .text('🎭 Sentiment', 'cmd_sentiment').row()
      .text('💎 Solana Gems', 'cmd_solana')
      .text('🐋 Smart Money', 'cmd_smartmoney').row()
      .text('⬅️ Back', 'back_to_menu');
    await ctx.editMessageText(`🚀 <b>Market Intelligence</b>\nKlik fitur untuk eksekusi langsung:`, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }
  
  if (data === 'cat_security') {
    const kb = new InlineKeyboard()
      .text('🛡️ RugCheck CA', 'cmd_check_prompt')
      .text('👁 My Watchlist', 'cmd_watchlist').row()
      .text('⬅️ Back', 'back_to_menu');
    await ctx.editMessageText(`🛡️ <b>Security & Watchlist</b>`, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  if (data === 'cat_alerts') {
    const kb = new InlineKeyboard()
      .text('📊 RSI/MA Alert Setup', 'cmd_alertrsi')
      .text('⬅️ Back', 'back_to_menu');
    await ctx.editMessageText(`📊 <b>Technical Alerts</b>`, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  // 2. Direct Executions (NO Command Needed)
  if (data === 'cmd_today') { await ctx.answerCallbackQuery(); await handleToday(ctx as any); return; }
  if (data === 'cmd_sentiment') { await ctx.answerCallbackQuery(); await handleSentiment(ctx as any); return; }
  if (data === 'cmd_solana') { await ctx.answerCallbackQuery(); await handleSolana(ctx as any); return; }
  if (data === 'cmd_smartmoney') { await ctx.answerCallbackQuery(); await handleSmartMoney(ctx as any); return; }
  if (data === 'cmd_watchlist') { await ctx.answerCallbackQuery(); await handleWatchlist(ctx as any); return; }
  if (data === 'cmd_alertrsi') { await ctx.answerCallbackQuery(); await handleAlertRsi(ctx as any); return; }
  if (data === 'cmd_app') { await ctx.answerCallbackQuery(); await handleApp(ctx as any); return; }
  if (data === 'cmd_help') { await ctx.answerCallbackQuery(); await handleHelp(ctx as any); return; }
  
  // Specific Prompts
  if (data === 'cmd_check_prompt') {
    await ctx.answerCallbackQuery();
    await ctx.reply('🛡️ Silakan kirim alamat kontrak (CA) Solana yang mau di-scan:\nContoh: <code>/check [CA]</code>', { parse_mode: 'HTML' });
    return;
  }

  if (data === 'back_to_menu') {
    await ctx.answerCallbackQuery();
    await handleMenu(ctx);
    return;
  }
}
