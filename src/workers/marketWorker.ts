import { Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { MarketService } from '../services/MarketService';
import { log } from '../utils/logger';
import { Bot } from 'grammy';
import { jobOrchestrator } from '../services/JobOrchestrator';

const QUEUE_NAME = 'market-watch';

export function startMarketWorker(bot: Bot): void {
  const queue = jobOrchestrator.register(QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await MarketService.scanMarkets(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('marketWorker failed', { job: job?.id, error: err.message });
  });

  // Run every 30 minutes
  queue.add('scan', {}, {
    repeat: { every: 30 * 60 * 1000 },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info('Market monitoring worker started via Orchestrator');
}
