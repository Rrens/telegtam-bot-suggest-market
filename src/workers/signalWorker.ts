// ─────────────────────────────────────────────────────────────────────────────
// signalWorker: Periodically recalculates signals for tracked symbols.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis, cacheDel, cacheKeys } from '../cache/redis';
import { SignalEngine } from '../services/SignalEngine';
import { db } from '../db';
import { log } from '../utils/logger';
import { config } from '../config';

const QUEUE_NAME = 'signal-recalc';

export function startSignalWorker(): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await recalcSignalsForTrackedSymbols();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('signalWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('recalc', {}, {
    repeat: { every: config.intervals.signalRecalcMs },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info(`Signal worker started (interval: ${config.intervals.signalRecalcMs}ms)`);
}

async function recalcSignalsForTrackedSymbols(): Promise<void> {
  try {
    const rows = await db('assets').distinct('symbol');
    const symbols = rows.map((r: any) => r.symbol);

    for (const symbol of symbols) {
      try {
        // Bust cache to force recalculation
        await cacheDel(cacheKeys.signal(symbol));
        await SignalEngine.generate(symbol);
        await new Promise((r) => setTimeout(r, 1000)); // throttle
        log.debug('Signal recalculated', { symbol });
      } catch (err) {
        log.warn('Signal recalc failed', { symbol, error: (err as Error).message });
      }
    }
  } catch (err) {
    log.error('recalcSignalsForTrackedSymbols failed', { error: (err as Error).message });
  }
}
