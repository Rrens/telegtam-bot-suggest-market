// ─────────────────────────────────────────────────────────────────────────────
// marketAlertWorker: Periodically triggers the Dynamic Market Alert check.
// ─────────────────────────────────────────────────────────────────────────────

import { Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';
import { Bot } from 'grammy';
import { jobOrchestrator } from '../services/JobOrchestrator';
import { DynamicMarketAlertService } from '../services/DynamicMarketAlertService';
import { featureFlagService } from '../services/FeatureFlagService';

const QUEUE_NAME = 'market-alert';
const INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

export function startMarketAlertWorker(bot: Bot): void {
  DynamicMarketAlertService.setBot(bot);

  const queue = jobOrchestrator.register(QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!await featureFlagService.isEnabled('marketAlerts')) {
        log.debug('Skipping marketAlertWorker: feature disabled');
        return;
      }
      await DynamicMarketAlertService.checkDynamicAlerts();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('marketAlertWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('check', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info(`Market Alert worker started (interval: ${INTERVAL_MS / 60000} min)`);
}
