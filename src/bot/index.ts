// ─────────────────────────────────────────────────────────────────────────────
// Bot entry point: registers all commands and middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { Bot } from 'grammy';
import { config } from '../config';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { handleStart } from './commands/start';
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
  bot.command('start', handleStart);
  bot.command('add', handleAdd);
  bot.command('list', handleList);
  bot.command('listalerts', handleListAlerts);
  bot.command('delete', handleDelete);
  bot.command('portfolio', handlePortfolio);
  bot.command('alert', handleAlert);
  bot.command('delalert', handleDelAlert);
  bot.command('predict', handlePredict);
  bot.command('history', handleHistory);
  bot.command('news', handleNews);
  bot.command('alertnews', handleAlertNews);
  bot.command('profile', handleProfile);
  bot.command('info', handleInfo);
  bot.command('kurs', handleKurs);
  bot.command('help', handleHelp);
  bot.command('app', handleApp);
  bot.command('flush', handleFlush);
  bot.command('credits', handleCredits);
  bot.command('admin', handleAdmin);
  bot.command('broadcast', handleBroadcast);
  bot.command('paper', handlePaperStatus);
  bot.command('paperbuy', handlePaperBuy);
  bot.command('papersell', handlePaperSell);
  bot.command('solana', handleSolana);
  bot.command('sentiment', handleSentiment);
  bot.command('today', handleToday);
  bot.command('smartmoney', handleSmartMoney);
  bot.command('alertrsi', handleAlertRsi);
  bot.command('check', handleCheck);
  bot.command('watch', handleWatch);
  bot.command('watchlist', handleWatchlist);
  bot.command('menu', handleMenu);
  bot.command('start', handleMenu);

  // Callback query handling for menu
  bot.on('callback_query:data', async (ctx) => {
    if (ctx.callbackQuery.data.startsWith('cat_') || 
        ctx.callbackQuery.data.startsWith('cmd_') || 
        ctx.callbackQuery.data === 'back_to_menu') {
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

  // ── Bot commands menu ───────────────────────────────────────────────────────
  bot.api.setMyCommands([
    { command: 'start', description: '🏁 Start & Main Menu' },
    { command: 'menu', description: '📱 All Features Dashboard' },
    { command: 'app', description: '🚀 Launch Mini App' },
    { command: 'check', description: '🛡️ Scan Solana CA' },
    { command: 'help', description: '❓ Get support' },
  ]).catch((err) => log.warn('Failed to set bot commands', { error: err.message }));

  return bot;
}
