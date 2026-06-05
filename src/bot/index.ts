// ─────────────────────────────────────────────────────────────────────────────
// Bot entry point: registers all commands and middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { Bot } from 'grammy';
import { config } from '../config';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
// Removed old handleStart import
import { handleAdd } from './commands/add';
import { handleList } from './commands/list';
import { handleDelete } from './commands/delete';
import { handlePortfolio } from './commands/portfolio';
import { handleAlert } from './commands/alert';
import { handlePredict } from './commands/predict';
import { handleHistory } from './commands/history';
import { handleNews } from './commands/news';
import { handleAlertNews } from './commands/alertnews';
import { handleProfile } from './commands/profile';
import { handleInfo } from './commands/info';
import { handleHelp } from './commands/help';
import { handleKurs } from './commands/kurs';
import { handleDelAlert } from './commands/delalert';
import { handleListAlerts } from './commands/listalerts';
import { handleCredits } from './commands/credits';
import { handleFlush } from './commands/flush';
import { handleApp } from './commands/app';
import { handleAdmin, handleBroadcast } from './commands/admin';
import { handlePaperStatus, handlePaperBuy, handlePaperSell, handlePaperQuickBuy } from './commands/paper';
import { handleSolana } from './commands/solana';
import { handleSentiment } from './commands/sentiment';
import { handleToday } from './commands/today';
import { handleSmartMoney } from './commands/smartmoney';
import { handleAlertRsi } from './commands/alertrsi';
import { handleCheck } from './commands/check';
import { handleWatch, handleWatchlist } from './commands/watchlist';
import { handleMenu, handleMenuCallbacks } from './commands/menu';
import { handleScheduler, handleSchedulerCallback } from './commands/scheduler';
import { activityLogger } from './middleware/activityLogger';
import { log } from '../utils/logger';

export function createBot(): Bot {
  const bot = new Bot(config.bot.token);

  // ── Middleware ──────────────────────────────────────────────────────────────
  bot.use(activityLogger());
  bot.use(rateLimiter());

  // ── Commands ────────────────────────────────────────────────────────────────
  bot.command('start', handleMenu);
  bot.command('app', handleApp);
  bot.command('menu', handleMenu);
  bot.command('help', handleHelp);
  bot.command('check', handleCheck);
  bot.command('scheduler', handleScheduler);
  bot.command('broadcast', handleBroadcast);
  bot.command('admin', handleAdmin);

  // Additional Slash Commands
  bot.command('add', handleAdd);
  bot.command('list', handleList);
  bot.command('delete', handleDelete);
  bot.command('portfolio', handlePortfolio);
  bot.command('portofolio', handlePortfolio); // Alias Indonesia
  bot.command('alert', handleAlert);
  bot.command('predict', handlePredict);
  bot.command('history', handleHistory);
  bot.command('news', handleNews);
  bot.command('alertnews', handleAlertNews);
  bot.command('profile', handleProfile);
  bot.command('info', handleInfo);
  bot.command('kurs', handleKurs);
  bot.command('delalert', handleDelAlert);
  bot.command('listalerts', handleListAlerts);
  bot.command('credits', handleCredits);
  bot.command('flush', handleFlush);
  bot.command('paper', handlePaperStatus);
  bot.command('paperbuy', handlePaperBuy);
  bot.command('papersell', handlePaperSell);
  bot.command('solana', handleSolana);
  bot.command('sentiment', handleSentiment);
  bot.command('today', handleToday);
  bot.command('smartmoney', handleSmartMoney);
  bot.command('alertrsi', handleAlertRsi);
  bot.command('watch', handleWatch);
  bot.command('watchlist', handleWatchlist);

  // Callback query handling for menu
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('cat_') || 
        data.startsWith('cmd_') || 
        data.startsWith('exec_') || 
        data.startsWith('arsi_') || 
        data.startsWith('al_') || 
        data.startsWith('p_') || 
        data === 'back_to_menu') {
      
      if (data.startsWith('exec_smartmoney')) return handleSmartMoney(ctx);
      if (data.startsWith('exec_solana')) return handleSolana(ctx);
      if (data.startsWith('exec_today')) return handleToday(ctx);
      if (data.startsWith('exec_sentiment')) return handleSentiment(ctx);
      if (data.startsWith('exec_watchlist')) return handleWatchlist(ctx);
      if (data.startsWith('exec_portfolio')) return handlePortfolio(ctx);
      if (data.startsWith('exec_check')) return handleCheck(ctx);
      
      return handleMenuCallbacks(ctx);
    }
    
    // Handle scheduler callbacks
    if (data === 'refresh_jobs' || data.startsWith('trigger_job:')) {
      return handleSchedulerCallback(ctx);
    }

    // Handle paper trading quick buy
    if (data.startsWith('pb_')) {
      return handlePaperQuickBuy(ctx);
    }
  });

  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text;

    // Handle replies to force_reply prompts
    if (ctx.message?.reply_to_message?.text) {
      const replyText = ctx.message.reply_to_message.text;
      const userId = String(ctx.from!.id);
      
      // 1. Price Target Alert (UP)
      if (replyText.includes('Price Target Alert (UP)')) {
        const args = text.trim().split(/\s+/);
        const symbol = args[0].toUpperCase();
        const targetPrice = parseFloat(args[1]);
        if (!symbol || isNaN(targetPrice) || targetPrice <= 0) {
          await ctx.reply('❌ Format salah. Ketik Simbol dan Harga Target.\nContoh: <code>BTCUSDT 75000</code>', { parse_mode: 'HTML' });
          return;
        }
        const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          const { AlertService } = await import('../services/AlertService.js');
          const { formatPrice } = await import('../utils/formatter.js');
          const priceData = await PriceService.getPrice(symbol);
          await AlertService.createAlert(userId, symbol, 'price_target', 'gte', targetPrice);
          await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ <b>Price Alert (UP) berhasil dibuat!</b>\n\n` +
            `🔔 Aset: <b>${symbol}</b>\n` +
            `🎯 Target: 🟢 <b>Melampaui (≥)</b> ${formatPrice(targetPrice, symbol)}\n` +
            `💰 Harga sekarang: ${formatPrice(priceData.price, symbol)}`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal membuat alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 2. Price Target Alert (DOWN)
      if (replyText.includes('Price Target Alert (DOWN)')) {
        const args = text.trim().split(/\s+/);
        const symbol = args[0].toUpperCase();
        const targetPrice = parseFloat(args[1]);
        if (!symbol || isNaN(targetPrice) || targetPrice <= 0) {
          await ctx.reply('❌ Format salah. Ketik Simbol dan Harga Target.\nContoh: <code>BTCUSDT 60000</code>', { parse_mode: 'HTML' });
          return;
        }
        const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          const { AlertService } = await import('../services/AlertService.js');
          const { formatPrice } = await import('../utils/formatter.js');
          const priceData = await PriceService.getPrice(symbol);
          await AlertService.createAlert(userId, symbol, 'price_target', 'lte', targetPrice);
          await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ <b>Price Alert (DOWN) berhasil dibuat!</b>\n\n` +
            `🔔 Aset: <b>${symbol}</b>\n` +
            `🎯 Target: 🔴 <b>Turun di Bawah (≤)</b> ${formatPrice(targetPrice, symbol)}\n` +
            `💰 Harga sekarang: ${formatPrice(priceData.price, symbol)}`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal membuat alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 3. Legacy Price Target Alert (fallback)
      if (replyText.includes('Price Target Alert')) {
        const args = text.trim().split(/\s+/);
        const symbol = args[0].toUpperCase();
        const targetPrice = parseFloat(args[1]);
        if (!symbol || isNaN(targetPrice) || targetPrice <= 0) {
          await ctx.reply('❌ Format salah. Ketik Simbol dan Harga Target.\nContoh: <code>BTCUSDT 75000</code>', { parse_mode: 'HTML' });
          return;
        }
        const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          const { AlertService } = await import('../services/AlertService.js');
          const { formatPrice } = await import('../utils/formatter.js');
          const priceData = await PriceService.getPrice(symbol);
          const condition = targetPrice >= priceData.price ? 'gte' : 'lte';
          await AlertService.createAlert(userId, symbol, 'price_target', condition, targetPrice);
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
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal membuat alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 4. % Change Alert
      if (replyText.includes('% Change Alert')) {
        const args = text.trim().split(/\s+/);
        const symbol = args[0].toUpperCase();
        const targetPct = parseFloat(args[1]);
        if (!symbol || isNaN(targetPct)) {
          await ctx.reply('❌ Format salah. Ketik Simbol dan Persentase.\nContoh: <code>BTCUSDT 5</code>', { parse_mode: 'HTML' });
          return;
        }
        const loadingMsg = await ctx.reply(`Validating <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          const { AlertService } = await import('../services/AlertService.js');
          const { formatPrice } = await import('../utils/formatter.js');
          const priceData = await PriceService.getPrice(symbol);
          const condition = targetPct >= 0 ? 'gte' : 'lte';
          await AlertService.createAlert(userId, symbol, 'pct_change', condition, targetPct);
          await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ <b>% Change Alert berhasil dibuat!</b>\n\n` +
            `🔔 Aset: <b>${symbol}</b>\n` +
            `🎯 Threshold: <b>${targetPct >= 0 ? '+' : ''}${targetPct}%</b> (alert saat perubahan 24j ${targetPct >= 0 ? '≥' : '≤'} ${targetPct}%)\n` +
            `💰 Harga sekarang: ${formatPrice(priceData.price, symbol)}`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal membuat alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 5. Paper Buy
      if (replyText.includes('Paper Buy')) {
        (ctx as any).match = text;
        const { handlePaperBuy } = await import('./commands/paper.js');
        await handlePaperBuy(ctx as any);
        return;
      }

      // 6. Paper Sell
      if (replyText.includes('Paper Sell')) {
        (ctx as any).match = text;
        const { handlePaperSell } = await import('./commands/paper.js');
        await handlePaperSell(ctx as any);
        return;
      }

      // 7. RSI Alert Setup
      if (replyText.includes('RSI Alert Setup')) {
        const symbol = text.trim().toUpperCase();
        if (!symbol) return;
        const loadingMsg = await ctx.reply(`Setting up RSI alerts for <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          await PriceService.getPrice(symbol);
          const { db } = await import('../db/index.js');
          await db('alerts').insert({
            user_id: userId,
            symbol,
            alert_type: 'price_target',
            condition: 'lte',
            target_value: 30,
            indicator: 'rsi',
            timeframe: '1d',
            active: true,
          });
          await db('alerts').insert({
            user_id: userId,
            symbol,
            alert_type: 'price_target',
            condition: 'gte',
            target_value: 70,
            indicator: 'rsi',
            timeframe: '1d',
            active: true,
          });
          await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ <b>RSI Alert berhasil dipasang!</b>\n\n` +
            `📊 Aset: <b>${symbol}</b>\n` +
            `🔔 Notifikasi akan dikirim saat Daily RSI ≤ 30 (Oversold) atau ≥ 70 (Overbought).`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal memasang RSI alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 8. MA Cross Setup
      if (replyText.includes('MA Cross Setup')) {
        const symbol = text.trim().toUpperCase();
        if (!symbol) return;
        const loadingMsg = await ctx.reply(`Setting up MA Cross alerts for <b>${symbol}</b>...`, { parse_mode: 'HTML' });
        try {
          const { PriceService } = await import('../services/PriceService.js');
          await PriceService.getPrice(symbol);
          const { db } = await import('../db/index.js');
          await db('alerts').insert({
            user_id: userId,
            symbol,
            alert_type: 'price_target',
            condition: 'gte',
            target_value: 0,
            indicator: 'ma_cross',
            timeframe: '1d',
            active: true,
          });
          await ctx.api.editMessageText(
            ctx.chat!.id,
            loadingMsg.message_id,
            `✅ <b>MA Cross Alert berhasil dipasang!</b>\n\n` +
            `📊 Aset: <b>${symbol}</b>\n` +
            `🔔 Notifikasi akan dikirim saat terjadi Golden Cross atau Death Cross (MA50 & MA200 Daily).`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          await ctx.api.editMessageText(ctx.chat!.id, loadingMsg.message_id, `❌ Gagal memasang MA Cross alert. Pastikan simbol <b>${symbol}</b> valid.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // 9. Cancel Technical Alert
      if (replyText.includes('Cancel Technical Alert')) {
        const symbol = text.trim().toUpperCase();
        if (!symbol) return;
        try {
          const { db } = await import('../db/index.js');
          const count = await db('alerts')
            .where({ user_id: userId, symbol, active: true })
            .whereNotNull('indicator')
            .update({ active: false });
          if (count > 0) {
            await ctx.reply(`✅ Berhasil menonaktifkan <b>${count}</b> technical alert untuk <b>${symbol}</b>.`, { parse_mode: 'HTML' });
          } else {
            await ctx.reply(`ℹ️ Tidak ditemukan technical alert aktif untuk <b>${symbol}</b>.`, { parse_mode: 'HTML' });
          }
        } catch (err) {
          await ctx.reply('❌ Gagal membatalkan alert.');
        }
        return;
      }
    }

    if (text === '🚀 Launch Mini App') return handleApp(ctx as any);
    if (text === '📜 Main Menu') return handleMenu(ctx);
    
    if (text.startsWith('/start')) return handleMenu(ctx);
    if (text.startsWith('/app')) return handleApp(ctx as any);
    if (text.startsWith('/menu')) return handleMenu(ctx);
    if (text.startsWith('/help')) return handleHelp(ctx as any);
    if (text.startsWith('/check')) return handleCheck(ctx as any);
    await next();
  });

  // ── Fallback ────────────────────────────────────────────────────────────────
  bot.on('message', async (ctx) => {
    await ctx.reply(
      'Unknown command. Type /start to see all available commands.',
      { parse_mode: 'HTML' }
    );
  });

  // ── Error handling ──────────────────────────────────────────────────────────
  bot.catch(errorHandler);

  // ── Bot commands menu (UI) ──────────────────────────────────────────────────
  // Register commands for the Telegram autocomplete menu UI
  bot.api.setMyCommands([
    { command: 'start', description: '🏁 Open Dashboard Terminal' },
    { command: 'menu', description: '📜 Main Menu' },
    { command: 'app', description: '🚀 Launch Mini App' },
    { command: 'portfolio', description: '📁 View Assets Portfolio' },
    { command: 'watchlist', description: '👁 View Watchlist' },
    { command: 'help', description: '❓ Help Center' },
  ]).catch((err) => log.warn('Failed to set bot commands', { error: err.message }));

  // ── Set Menu Button to Default (Commands List) ──────────────────────────────
  // This restores the "/" icon next to the input field so users can see the command list
  bot.api.setChatMenuButton({
    menu_button: { type: 'commands' }
  }).catch((err) => log.warn('Failed to set chat menu button', { error: err.message }));

  return bot;
}
