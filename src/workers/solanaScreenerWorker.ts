// ─────────────────────────────────────────────────────────────────────────────
// solanaScreenerWorker: Periodically scans for hidden gem meme coins on Solana.
// Runs every 15 minutes (more frequent than main screener since meme coins
// can pump and dump within minutes).
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { SolanaScreenerService } from '../services/SolanaScreenerService';
import { sendNotification } from '../utils/notifier';
import { log } from '../utils/logger';
import { Bot } from 'grammy';

import { jobOrchestrator } from '../services/JobOrchestrator';
import { GeminiService } from '../services/GeminiService';

const QUEUE_NAME = 'solana-screener';
const INTERVAL_MS = 15 * 60 * 1000; // Every 15 minutes

export function startSolanaScreenerWorker(bot: Bot): void {
  const queue = jobOrchestrator.register(QUEUE_NAME);

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runSolanaScreener(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('solanaScreenerWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('screen', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info(`Solana Screener worker started (interval: ${INTERVAL_MS / 60000} min)`);
}

async function runSolanaScreener(bot: Bot): Promise<void> {
  log.info('SolanaScreener: scanning for meme coin gems...');

  try {
    const gems = await SolanaScreenerService.screen();

    if (gems.length === 0) {
      log.info('SolanaScreener: no gems found this cycle');
      return;
    }

    let alertsSent = 0;

    for (const token of gems) {
      // Check cooldown — don't re-alert on the same token within 4 hours
      const onCooldown = await SolanaScreenerService.isOnCooldown(token.address);
      if (onCooldown) continue;

      const alert = SolanaScreenerService.formatAlert(token);
      let alertText = alert.text;
      
      // Add AI Analysis if enabled
      try {
        const aiAnalysis = await GeminiService.analyzeGem(token);
        if (aiAnalysis) {
          alertText += `\n\n${aiAnalysis}`;
        }
      } catch (err) {
        log.warn('AI Analysis failed for gem', { symbol: token.symbol });
      }

      await bot.api.sendMessage(config.bot.channelId || '', alertText, {
        parse_mode: 'HTML',
        reply_markup: alert.reply_markup,
        link_preview_options: { is_disabled: true }
      });

      // Send CA as a separate copyable message right after the alert
      const caMessage = `📋 <b>CA ${token.symbol}:</b>\n<code>${token.address}</code>`;
      await sendNotification(bot, 'system', caMessage, { pin: false });

      await SolanaScreenerService.setCooldown(token.address);
      alertsSent++;

      log.info('Solana gem alert sent', {
        name: token.name,
        symbol: token.symbol,
        change6h: token.change6h,
        liquidity: token.liquidityUsd,
      });

      // Max 3 alerts per cycle to avoid flooding
      if (alertsSent >= 3) break;

      // Small delay between messages
      await new Promise(r => setTimeout(r, 1500));
    }

    log.info(`SolanaScreener: cycle done. ${alertsSent} alert(s) sent.`);
  } catch (err) {
    log.error('SolanaScreener: run failed', { error: (err as Error).message });
  }
}
