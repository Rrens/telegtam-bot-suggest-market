// ─────────────────────────────────────────────────────────────────────────────
// Application entry point
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { connectDb, db } from './db';
import { createBot } from './bot';
import { startPriceWorker, subscribeTrackedAssetsToWS } from './workers/priceWorker';
import { startNewsWorker } from './workers/newsWorker';
import { startAlertWorker } from './workers/alertWorker';
import { startSignalWorker } from './workers/signalWorker';
import { startSolanaScreenerWorker } from './workers/solanaScreenerWorker';
import { startWhaleWorker } from './workers/whaleWorker';
import { startSmartMoneyWorker } from './workers/smartMoneyWorker';
import { startPumpFunWorker } from './workers/pumpFunWorker';
import { startLpTrackerWorker } from './workers/lpTrackerWorker';
import { startDailySummaryWorker } from './workers/dailySummaryWorker';
import { startPaperExecutionWorker } from './workers/paperExecutionWorker';
import { log } from './utils/logger';
import { redis } from './cache/redis';

import { PriceService } from './services/PriceService';
import { startMarketWorker } from './workers/marketWorker';
import { startWebServer } from './server/index';
import { startMarketAlertWorker } from './workers/marketAlertWorker';
import { featureFlagService } from './services/FeatureFlagService';

async function bootstrap(): Promise<void> {
  log.info('Starting Advanced Trading Assistant Bot...');

  // Initialize USD/IDR exchange rate
  await PriceService.getUsdIdrRate();

  // 1. Connect to database
  await connectDb();

  // 1.5 Initialize Dynamic Feature Flags
  await featureFlagService.init();

  // 2. Run pending migrations automatically
  await db.migrate.latest().then(() => {
    log.info('Database migrations applied');
  }).catch((err) => {
    log.error('Migration failed', { error: err.message });
    throw err;
  });

  // 3. Create and configure bot
  const bot = createBot();

  // 4. Start background workers
  startPriceWorker();
  
  if (await featureFlagService.isEnabled('news')) startNewsWorker(bot);
  if (await featureFlagService.isEnabled('alerts')) startAlertWorker(bot);
  if (await featureFlagService.isEnabled('signals')) startSignalWorker();
  if (await featureFlagService.isEnabled('marketScan')) startMarketWorker(bot);
  if (await featureFlagService.isEnabled('solanaScreener')) startSolanaScreenerWorker(bot); // 🚀 Solana meme coin gem screener
  if (await featureFlagService.isEnabled('whaleTracker')) startWhaleWorker(bot);           // 🐋 Whale movements tracker
  if (await featureFlagService.isEnabled('smartMoney')) startSmartMoneyWorker(bot);      // 🧠 Smart money wallet tracker
  if (await featureFlagService.isEnabled('pumpFun')) startPumpFunWorker(bot);         // 🎓 Pump.fun graduation alerts
  if (await featureFlagService.isEnabled('lpTracker')) startLpTrackerWorker(bot);       // 🔒 LP burn/lock tracker
  if (await featureFlagService.isEnabled('dailySummary')) startDailySummaryWorker(bot);    // 📰 Daily AI market recap at 21:00 WIB
  if (await featureFlagService.isEnabled('paperTrading')) startPaperExecutionWorker(bot);  // 🎮 TP/SL/Trailing Stop execution
  if (await featureFlagService.isEnabled('marketAlerts')) startMarketAlertWorker(bot);     // 🚨 Auto-momentum alerts (5% or big thresholds)

  // 4.5 Start Web Dashboard Server
  startWebServer();

  // 5. Subscribe tracked crypto assets to Binance WebSocket
  await subscribeTrackedAssetsToWS();

  // 6. Start bot (long polling)
  await bot.start({
    onStart: (botInfo) => {
      log.info(`Bot started: @${botInfo.username}`);
    },
  });

  // 7. Graceful shutdown
  process.once('SIGINT', () => gracefulShutdown(bot));
  process.once('SIGTERM', () => gracefulShutdown(bot));
}

async function gracefulShutdown(bot: ReturnType<typeof createBot>): Promise<void> {
  log.info('Shutting down...');
  await bot.stop();
  await db.destroy();
  await redis.quit();
  log.info('Shutdown complete');
  process.exit(0);
}

bootstrap().catch((err) => {
  log.error('Fatal error during startup', { error: err.message, stack: err.stack });
  process.exit(1);
});
