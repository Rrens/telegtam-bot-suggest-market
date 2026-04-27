// ─────────────────────────────────────────────────────────────────────────────
// priceWorker: Polls prices as a fallback when WebSocket is unavailable.
// Also maintains the list of crypto symbols to subscribe to via WebSocket.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { PriceService } from '../services/PriceService';
import { binanceWS } from '../websocket/BinanceWS';
import { db } from '../db';
import { log } from '../utils/logger';
import { config } from '../config';

const QUEUE_NAME = 'price-poll';

export function startPriceWorker(): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      // If WebSocket is connected, no need to poll crypto prices
      if (!binanceWS.connected) {
        await pollCryptoPrices();
      }
      await pollStockPrices();
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('priceWorker failed', { job: job?.id, error: err.message });
  });

  // Schedule recurring job
  queue.add('poll', {}, {
    repeat: { every: config.intervals.pricePollMs },
    removeOnComplete: 5,
    removeOnFail: 10,
  });

  log.info(`Price worker started (interval: ${config.intervals.pricePollMs}ms)`);
}

async function pollCryptoPrices(): Promise<void> {
  try {
    const symbols = await getTrackedCryptoSymbols();
    await Promise.allSettled(symbols.map((s) => PriceService.getPrice(s)));
    log.debug('Price poll (crypto fallback) complete', { count: symbols.length });
  } catch (err) {
    log.error('pollCryptoPrices failed', { error: (err as Error).message });
  }
}

async function pollStockPrices(): Promise<void> {
  try {
    const symbols = await getTrackedStockSymbols();
    await Promise.allSettled(symbols.map((s) => PriceService.getPrice(s)));
    log.debug('Price poll (stocks) complete', { count: symbols.length });
  } catch (err) {
    log.error('pollStockPrices failed', { error: (err as Error).message });
  }
}

async function getTrackedCryptoSymbols(): Promise<string[]> {
  const rows = await db('assets').distinct('symbol').where('asset_type', 'crypto');
  return rows.map((r: any) => r.symbol);
}

async function getTrackedStockSymbols(): Promise<string[]> {
  const rows = await db('assets').distinct('symbol').whereIn('asset_type', ['stock', 'forex']);
  return rows.map((r: any) => r.symbol);
}

/**
 * Subscribe all tracked crypto assets to Binance WebSocket.
 */
export async function subscribeTrackedAssetsToWS(): Promise<void> {
  const symbols = await getTrackedCryptoSymbols();
  symbols.forEach((s) => {
    binanceWS.subscribe(s, (symbol, price) => {
      log.debug('WS price update', { symbol, price });
    });
  });
  if (symbols.length > 0) binanceWS.connect();
}
