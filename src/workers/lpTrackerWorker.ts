// ─────────────────────────────────────────────────────────────────────────────
// lpTrackerWorker: Monitors LP (Liquidity Pool) burn/lock events for tokens
// that users are watching or that appear in the Solana screener.
// Data source: RugCheck.xyz public API (free, no key).
// Fires an alert when LP status changes from unlocked → burned/locked.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { db } from '../db';
import { RugCheckService } from '../services/RugCheckService';
import { log } from '../utils/logger';
import { config } from '../config';
import { Bot } from 'grammy';

const QUEUE_NAME = 'lp-tracker';
const INTERVAL_MS = 20 * 60 * 1000; // Every 20 minutes
const COOLDOWN_SECS = 3600 * 12;    // Don't re-alert same token for 12 hours

// Solana address pattern
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function startLpTrackerWorker(bot: Bot): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runLpTrackerScan(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('lpTrackerWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('scan', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info('🔒 LP Tracker worker started');
}

async function runLpTrackerScan(bot: Bot): Promise<void> {
  log.info('LP Tracker: scanning watchlists for LP events...');

  try {
    // Get all watchlist items that are Solana tokens (have a mint address)
    const watchlistItems = await db('watchlist')
      .where('asset_type', 'solana_token')
      .select('user_id', 'symbol');

    if (watchlistItems.length === 0) {
      log.info('LP Tracker: no Solana tokens in watchlists');
      return;
    }

    // Unique addresses only
    const uniqueAddresses = [...new Set(
      watchlistItems
        .map((w: any) => w.symbol)
        .filter((s: string) => SOLANA_RE.test(s))
    )];

    if (uniqueAddresses.length === 0) {
      log.info('LP Tracker: no Solana contract addresses found in watchlists');
      return;
    }

    let alertsSent = 0;

    for (const address of uniqueAddresses) {
      if (alertsSent >= 3) break; // Max 3 alerts per cycle

      const cdKey = `lp_alert:${address}`;
      const prevStatus = await redis.get(cdKey);

      try {
        const report = await RugCheckService.getReport(address);
        if (!report) continue;

        const currentStatus = report.lpBurned
          ? 'burned'
          : report.lpLocked
          ? 'locked'
          : 'unlocked';

        // Only alert if LP just became burned or locked (status changed to positive)
        if (
          (currentStatus === 'burned' || currentStatus === 'locked') &&
          prevStatus === 'unlocked'
        ) {
          const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const rugCheckUrl = `https://rugcheck.xyz/tokens/${address}`;
          const arkhamUrl = `https://platform.arkhamintelligence.com/explorer/address/${address}`;

          const statusEmoji = report.lpBurned ? '🔥' : '🔒';
          const statusText = report.lpBurned ? 'LP BURNED! 🔥' : 'LP LOCKED! 🔒';
          const statusDesc = report.lpBurned
            ? 'Liquidity Pool sudah di-BURN permanen. Ini adalah sinyal keamanan tertinggi — dev tidak bisa tarik LP!'
            : 'Liquidity Pool sudah di-LOCK. Ini membatasi kemampuan dev untuk rugpull dalam jangka waktu tertentu.';

          const message = [
            `${statusEmoji} <b>LP EVENT ALERT!</b> ${statusEmoji}`,
            ``,
            `<b>${escape(report.name)} (${escape(report.symbol)})</b>`,
            ``,
            `Status baru: <b>${statusText}</b>`,
            ``,
            statusDesc,
            ``,
            `🛡️ Risk Score: <b>${report.score}/1000</b>`,
            `✅ Mint Authority: ${report.mintAuthRevoked ? 'Revoked' : 'Still Active'}`,
            `👥 Top 10 Holders: <b>${report.topHoldersPct}%</b>`,
            ``,
            `🔑 <b>CA:</b> <code>${address}</code>`,
            `🔗 <a href="${rugCheckUrl}">RugCheck.xyz</a>  |  <a href="${arkhamUrl}">Arkham</a>`,
            ``,
            `<i>⚠ Tetap lakukan riset sendiri. DYOR!</i>`,
          ].join('\n');

          // Send to channel
          if (config.bot.channelId) {
            await bot.api.sendMessage(config.bot.channelId, message, {
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
            }).catch(() => {});
          }

          // Also DM the specific users who are watching this token
          const watchers = watchlistItems.filter((w: any) => w.symbol === address);
          for (const watcher of watchers) {
            try {
              await bot.api.sendMessage(String(watcher.user_id), message, {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
              });
            } catch { /* User may have blocked bot */ }
          }

          await redis.setex(cdKey, COOLDOWN_SECS, currentStatus);
          alertsSent++;
          log.info('LP event alert sent', { address, status: currentStatus, symbol: report.symbol });
        } else {
          // Just update the stored status
          await redis.setex(`lp_status:${address}`, COOLDOWN_SECS, currentStatus);
        }

        // Store current status for next comparison
        if (!prevStatus) {
          await redis.setex(cdKey, COOLDOWN_SECS, currentStatus);
        }

        await new Promise(r => setTimeout(r, 1500)); // Rate limit courtesy
      } catch (err) {
        log.warn('LP Tracker: failed to check token', {
          address,
          error: (err as Error).message,
        });
      }
    }

    log.info(`LP Tracker: cycle done. ${alertsSent} LP event(s) detected.`);
  } catch (err) {
    log.error('LP Tracker: scan failed', { error: (err as Error).message });
  }
}
