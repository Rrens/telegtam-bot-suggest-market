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
import { handlePaperStatus, handlePaperBuy, handlePaperSell } from './commands/paper';
import { handleSolana } from './commands/solana';
import { handleSentiment } from './commands/sentiment';
import { handleToday } from './commands/today';
import { handleSmartMoney } from './commands/smartmoney';
import { handleAlertRsi } from './commands/alertrsi';
import { handleCheck } from './commands/check';
import { handleWatch, handleWatchlist } from './commands/watchlist';
import { handleMenu, handleMenuCallbacks } from './commands/menu';
import { activityLogger } from './middleware/activityLogger';
import { log } from '../utils/logger';

export function createBot(): Bot {
  const bot = new Bot(config.bot.token);

  // ── Middleware ──────────────────────────────────────────────────────────────
  bot.use(activityLogger());
  bot.use(rateLimiter());

  // ── Commands ────────────────────────────────────────────────────────────────
  // Hanya simpan command utama, sisanya lewat /start (Dashboard)
  bot.command('start', handleMenu);
  bot.command('app', handleApp);
  bot.command('menu', handleMenu);
  bot.command('help', handleHelp);
  bot.command('check', handleCheck); // Tetap ada buat quick scan

  // Callback query handling for menu
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('cat_') || 
        data.startsWith('cmd_') || 
        data.startsWith('exec_') || 
        data === 'back_to_menu') {
      
      if (data.startsWith('exec_smartmoney')) return handleSmartMoney(ctx);
      if (data.startsWith('exec_solana')) return handleSolana(ctx);
      if (data.startsWith('exec_today')) return handleToday(ctx);
      if (data.startsWith('exec_sentiment')) return handleSentiment(ctx);
      
      return handleMenuCallbacks(ctx);
    }
  });
  // Allows commands like /info or /kurs to work when posted in a channel
  bot.on('channel_post:text', async (ctx, next) => {
    log.info(`Received post from channel: ${ctx.chat.title} (ID: ${ctx.chat.id})`);
    const text = ctx.channelPost.text;
    if (text.startsWith('/info')) return handleInfo(ctx as any);
    if (text.startsWith('/kurs')) return handleKurs(ctx as any);
    if (text.startsWith('/help')) return handleHelp(ctx as any);
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
  // We keep it minimal to encourage using the interactive dashboard
  bot.api.setMyCommands([
    { command: 'start', description: '🏁 Open Dashboard Terminal' },
    { command: 'app', description: '🚀 Launch Mini App' },
  ]).catch((err) => log.warn('Failed to set bot commands', { error: err.message }));

  return bot;
}
