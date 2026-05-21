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
