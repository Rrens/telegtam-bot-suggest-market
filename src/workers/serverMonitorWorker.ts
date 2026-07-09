// ─────────────────────────────────────────────────────────────────────────────
// serverMonitorWorker: Periodically schedules system resource monitoring checks.
// ─────────────────────────────────────────────────────────────────────────────

import { Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';
import { Bot } from 'grammy';
import { config } from '../config';
import { jobOrchestrator } from '../services/JobOrchestrator';
import { ServerMonitorService } from '../services/ServerMonitorService';
import { featureFlagService } from '../services/FeatureFlagService';

const QUEUE_NAME = 'server-monitor';

export function startServerMonitorWorker(bot: Bot): void {
  ServerMonitorService.setBot(bot);

  const queue = jobOrchestrator.register(QUEUE_NAME);
  const intervalMs = config.serverMonitor.intervalMs || 60000;

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      if (!await featureFlagService.isEnabled('serverMonitor')) {
        log.debug('Skipping serverMonitorWorker: feature disabled');
        return;
      }
      await ServerMonitorService.checkResources();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('serverMonitorWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('check', {}, {
    repeat: { every: intervalMs },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info(`Server Monitor worker started (interval: ${intervalMs / 1000}s)`);
}
