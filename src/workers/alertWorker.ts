// ─────────────────────────────────────────────────────────────────────────────
// alertWorker: Periodically checks all active alerts against current prices.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { AlertService } from '../services/AlertService';
import { NewsService } from '../services/NewsService';
import { log } from '../utils/logger';
import { config } from '../config';
import { Bot } from 'grammy';
import { formatNews } from '../utils/formatter';
import { sendNotification } from '../utils/notifier';
import { jobOrchestrator } from '../services/JobOrchestrator';

const ALERT_QUEUE = 'alert-check';
const NEWS_ALERT_QUEUE = 'news-alert-check';

export function startAlertWorker(bot: Bot): void {
  AlertService.setBot(bot);

  // Price alert queue
  const alertQueue = jobOrchestrator.register(ALERT_QUEUE);
  const alertWorker = new Worker(
    ALERT_QUEUE,
    async () => {
      await AlertService.checkAllAlerts();
    },
    { connection: redis, concurrency: 1 }
  );

  alertWorker.on('failed', (job, err) => {
    log.error('alertWorker failed', { job: job?.id, error: err.message });
  });

  alertQueue.add('check', {}, {
    repeat: { every: config.intervals.alertCheckMs },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  // News alert queue
  const newsAlertQueue = jobOrchestrator.register(NEWS_ALERT_QUEUE);
  const newsAlertWorker = new Worker(
    NEWS_ALERT_QUEUE,
    async () => {
      await checkNewsAlerts(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  newsAlertWorker.on('failed', (job, err) => {
    log.error('newsAlertWorker failed', { job: job?.id, error: err.message });
  });

  newsAlertQueue.add('check', {}, {
    repeat: { every: config.intervals.newsPollMs },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info('Alert workers started');
}

/**
 * Check news alerts and dispatch notifications with cooldown enforcement.
 */
async function checkNewsAlerts(bot: Bot): Promise<void> {
  const subscriptions = await AlertService.getActiveNewsAlerts();
  const cooldownMs = config.intervals.newsAlertCooldownMs;

  for (const sub of subscriptions) {
    // Enforce cooldown
    if (sub.lastAlerted) {
      const elapsed = Date.now() - sub.lastAlerted.getTime();
      if (elapsed < cooldownMs) continue;
    }

    try {
      const news = await NewsService.getNews(sub.symbol, 5);
      if (news.length === 0) continue;

      // Only alert on strong sentiment
      const avgSentiment = news.reduce((s, n) => s + n.sentimentScore, 0) / news.length;
      if (Math.abs(avgSentiment) < 0.2) continue;

      const message = `🔔 <b>News Alert: ${sub.symbol}</b>\n\n` + formatNews(sub.symbol, news);
      await sendNotification(bot, sub.userId, message);
      await AlertService.updateNewsAlertTimestamp(sub.userId, sub.symbol);

      log.info('News alert sent', { userId: sub.userId, symbol: sub.symbol });
    } catch (err) {
      log.warn('News alert dispatch failed', { error: (err as Error).message, userId: sub.userId });
    }
  }
}
