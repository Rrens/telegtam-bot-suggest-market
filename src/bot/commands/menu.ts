// ─────────────────────────────────────────────────────────────────────────────
// /menu command: Interactive dashboard with direct execution logic.
// ─────────────────────────────────────────────────────────────────────────────

import { Context, InlineKeyboard, Keyboard } from 'grammy';
import { handleHelp } from './help';
import { handleToday } from './today';
import { handleSentiment } from './sentiment';
import { handleSolana } from './solana';
import { handleSmartMoney } from './smartmoney';
import { handleWatchlist } from './watchlist';
import { handleCheck } from './check';
import { handleAlert, handleAlertCallbacks } from './alert';
import { handleAlertRsi, handleAlertRsiCallbacks } from './alertrsi';
import { handlePaperStatus, handlePaperCallbacks } from './paper';
import { handleApp } from './app';
import { config } from '../../config';
import { db } from '../../db';
import { log } from '../../utils/logger';

export async function handleMenu(ctx: Context): Promise<void> {
  const isStart = !ctx.callbackQuery && ctx.message?.text?.startsWith('/start');
  
  if (isStart && ctx.from) {
    try {
      await db('users')
        .insert({
          id: ctx.from.id.toString(),
          username: ctx.from.username ?? null,
          risk_profile: 'moderate',
          preferred_timeframe: 'swing',
        })
        .onConflict('id')
        .merge({ username: ctx.from.username ?? null });

      log.info('User registered/updated via /start', { userId: ctx.from.id, username: ctx.from.username });
    } catch (err) {
      log.error('Failed to upsert user on /start', { error: (err as Error).message });
    }
  }

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

  // Persistent Reply Keyboard (Tampil di atas input field)
  // Sekarang pake .webApp biar pas di-klik langsung buka aplikasi
  const tmaUrl = config.app.appUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/tma`;

  const persistentKb = new Keyboard()
    .webApp('🚀 Launch Mini App', tmaUrl)
    .text('📜 Main Menu')
    .resized()
    .persistent();

  const inlineKb = new InlineKeyboard()
    .text('🚀 Market Intel', 'cat_market')
    .text('🛡️ Security & Watch', 'cat_security').row()
    .text('📊 Alerts & Tools', 'cat_alerts')
    .text('📱 Launch Mini App', 'cmd_app').row()
    .text('❓ Help Center', 'cmd_help');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: inlineKb });
  } else {
    // We can't send both reply_markup types in one message via the standard helper,
    // so we send the persistent keyboard with the main menu message.
    await ctx.reply(text, { 
      parse_mode: 'HTML', 
      reply_markup: persistentKb
    });
    // Then send the inline options as a second message or just keep it simple.
    await ctx.reply('Pilih kategori:', {
      reply_markup: inlineKb,
      parse_mode: 'HTML'
    });
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
      .text('🔔 Price Alert Setup', 'cmd_alert')
      .text('📊 RSI/MA Alert Setup', 'cmd_alertrsi').row()
      .text('🎮 Paper Trading', 'cmd_paper_status').row()
      .text('⬅️ Back', 'back_to_menu');
    await ctx.editMessageText(`📊 <b>Technical Alerts & Tools</b>`, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  // 2. Direct Executions (NO Command Needed)
  if (data === 'cmd_today') { await ctx.answerCallbackQuery(); await handleToday(ctx as any); return; }
  if (data === 'cmd_sentiment') { await ctx.answerCallbackQuery(); await handleSentiment(ctx as any); return; }
  if (data === 'cmd_solana') { await ctx.answerCallbackQuery(); await handleSolana(ctx as any); return; }
  if (data === 'cmd_smartmoney') { await ctx.answerCallbackQuery(); await handleSmartMoney(ctx as any); return; }
  if (data === 'cmd_watchlist') { await ctx.answerCallbackQuery(); await handleWatchlist(ctx as any); return; }
  if (data === 'cmd_alert') { await ctx.answerCallbackQuery(); await handleAlert(ctx as any); return; }
  if (data === 'cmd_alertrsi') { await ctx.answerCallbackQuery(); await handleAlertRsi(ctx as any); return; }
  if (data === 'cmd_paper_status') { await ctx.answerCallbackQuery(); await handlePaperStatus(ctx as any); return; }
  if (data === 'cmd_app') { await ctx.answerCallbackQuery(); await handleApp(ctx as any); return; }
  if (data === 'cmd_help') { await ctx.answerCallbackQuery(); await handleHelp(ctx as any); return; }
  
  // Specific Prompts
  if (data.startsWith('arsi_')) { await handleAlertRsiCallbacks(ctx); return; }
  if (data.startsWith('al_')) { await handleAlertCallbacks(ctx); return; }
  if (data.startsWith('p_')) { await handlePaperCallbacks(ctx); return; }

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
