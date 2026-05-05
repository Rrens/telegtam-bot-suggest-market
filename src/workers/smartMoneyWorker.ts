// ─────────────────────────────────────────────────────────────────────────────
// smartMoneyWorker: Periodically scans tracked smart money wallets on Solana.
// Runs every 30 minutes.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { SmartMoneyService } from '../services/SmartMoneyService';
import { sendNotification } from '../utils/notifier';
import { log } from '../utils/logger';
import { Bot } from 'grammy';

const QUEUE_NAME = 'smart-money';
const INTERVAL_MS = 30 * 60 * 1000; // Every 30 minutes

export function startSmartMoneyWorker(bot: Bot): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runSmartMoneyScan(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('smartMoneyWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('scan', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info(`Smart Money worker started (interval: ${INTERVAL_MS / 60000} min)`);
}

async function runSmartMoneyScan(bot: Bot): Promise<void> {
  log.info('SmartMoney: scanning tracked wallets...');

  try {
    const moves = await SmartMoneyService.scanWallets();

    if (moves.length === 0) {
      log.info('SmartMoney: no new moves this cycle');
      return;
    }

    let alertsSent = 0;

    for (const move of moves) {
      const message = SmartMoneyService.formatAlert(move);
      await sendNotification(bot, 'system', message, { pin: false });

      // Send CA separately
      const caMessage = `📋 <b>CA ${move.tokenSymbol.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}:</b>\n<code>${move.tokenAddress}</code>`;
      await sendNotification(bot, 'system', caMessage, { pin: false });

      await SmartMoneyService.setCooldown(move.walletAddress, move.tokenAddress);
      alertsSent++;

      log.info('Smart money alert sent', {
        wallet: move.walletLabel,
        token: move.tokenSymbol,
        change6h: move.change6h,
      });

      // Max 5 alerts per cycle
      if (alertsSent >= 5) break;

      await new Promise(r => setTimeout(r, 1500));
    }

    log.info(`SmartMoney: cycle done. ${alertsSent} alert(s) sent.`);
  } catch (err) {
    log.error('SmartMoney: scan failed', { error: (err as Error).message });
  }
}
