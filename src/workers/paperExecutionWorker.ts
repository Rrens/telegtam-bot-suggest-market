import { Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { PaperExecutionService } from '../services/PaperExecutionService';
import { log } from '../utils/logger';
import { jobOrchestrator } from '../services/JobOrchestrator';
import { Bot } from 'grammy';

const QUEUE_NAME = 'paper-execution';
const INTERVAL_MS = 30000; // Check every 30 seconds

export function startPaperExecutionWorker(bot: Bot): void {
  const queue = jobOrchestrator.register(QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await PaperExecutionService.checkPositions(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('paperExecutionWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('check', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 10,
    removeOnFail: 20,
  });

  log.info(`Paper Execution worker started (interval: ${INTERVAL_MS / 1000}s)`);
}
