// ─────────────────────────────────────────────────────────────────────────────
// newsWorker: Implements a pipeline for Fetching, Processing, Alerting, Cleanup.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker, Job } from 'bullmq';
import { Bot } from 'grammy';
import { redis } from '../cache/redis';
import { NewsService } from '../services/NewsService';
import { db } from '../db';
import { log } from '../utils/logger';
import { config } from '../config';
import { scoreText } from '../utils/sentiment';
import { formatNewsBroadcast } from '../utils/formatter';
import { NewsItem } from '../types';

const FETCH_QUEUE = 'news-fetch';
const PROCESS_QUEUE = 'news-process';
const ALERT_QUEUE = 'news-alert';
const CLEANUP_QUEUE = 'news-cleanup';

export function startNewsWorker(bot: Bot): void {
  // ── 1. Fetcher Job ────────────────────────────────────────────────────────
  const fetchQueue = new Queue(FETCH_QUEUE, { connection: redis });
  const processQueue = new Queue(PROCESS_QUEUE, { connection: redis });

  new Worker(FETCH_QUEUE, async () => {
    const symbols = await getTrackedSymbols();
    for (const symbol of symbols) {
      try {
        const rawItems = await NewsService.fetchRawNews(symbol);
        if (rawItems.length > 0) {
          await processQueue.add('process', { symbol, items: rawItems });
        }
      } catch (err) {
        log.warn(`NewsFetcher failed for ${symbol}`, { error: (err as Error).message });
      }
    }
  }, { connection: redis, concurrency: 1 });

  fetchQueue.add('fetch', {}, { repeat: { every: config.intervals.newsPollMs }, removeOnComplete: 3 });

  // ── 2. Processor Job ──────────────────────────────────────────────────────
  const alertQueue = new Queue(ALERT_QUEUE, { connection: redis });

  new Worker(PROCESS_QUEUE, async (job: Job) => {
    const { symbol, items } = job.data as { symbol: string, items: Partial<NewsItem>[] };
    const processed: NewsItem[] = [];

    for (const item of items) {
      if (!item.title || !item.url) continue;

      const text = `${item.title} ${item.summary ?? ''}`;
      const { label, score } = scoreText(text);

      let impact = 'Neutral market impact expected.';
      if (score >= 0.5) impact = 'Strong bullish pressure likely.';
      if (score <= -0.5) impact = 'Strong bearish pressure likely.';
      
      const keywords = ['ETF', 'regulation', 'hack', 'partnership', 'earnings', 'fed', 'interest rate'];
      const foundKeywords = keywords.filter(k => text.toLowerCase().includes(k));
      if (foundKeywords.length > 0) {
        impact += ` Key drivers: ${foundKeywords.join(', ')}.`;
      }

      processed.push({
        title: item.title,
        url: item.url,
        source: item.source ?? 'Unknown',
        publishedAt: item.publishedAt ?? new Date(),
        summary: item.summary ?? 'No summary available.',
        sentiment: label,
        sentimentScore: score,
        impact,
      });
    }

    if (processed.length > 0) {
      await NewsService.persistToDb(symbol, processed);
      // Trigger alert check
      await alertQueue.add('alert', { symbol, items: processed });
    }
  }, { connection: redis, concurrency: 2 });

  // ── 3. Alert Job (Channel Broadcast) ──────────────────────────────────────
  new Worker(ALERT_QUEUE, async (job: Job) => {
    if (!config.bot.channelId) return; // Broadcasting disabled if no channel ID

    const { symbol, items } = job.data as { symbol: string, items: NewsItem[] };
    
    // Filter for high-impact news
    const highImpact = items.filter(item => 
      Math.abs(item.sentimentScore) >= 0.4 || 
      item.impact?.includes('Key drivers:')
    );

    for (const item of highImpact) {
      // Cooldown check per symbol to avoid spamming the channel
      const cdKey = `news_broadcast_cd:${symbol}`;
      const onCooldown = await redis.get(cdKey);
      if (onCooldown) continue;

      try {
        const msg = formatNewsBroadcast(symbol, item);
        await bot.api.sendMessage(config.bot.channelId, msg, { 
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true } 
        });
        
        // Set 1-hour cooldown for this symbol
        await redis.setex(cdKey, 3600, '1');
        log.info('News broadcasted to channel', { symbol, title: item.title });
      } catch (err) {
        log.warn('News broadcast failed', { error: (err as Error).message });
      }
    }
  }, { connection: redis, concurrency: 1 });

  // ── 4. Cleanup Job ────────────────────────────────────────────────────────
  const cleanupQueue = new Queue(CLEANUP_QUEUE, { connection: redis });
  new Worker(CLEANUP_QUEUE, async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await db('news_cache').where('published_at', '<', sevenDaysAgo).delete();
    log.debug('Old news cleaned up');
  }, { connection: redis });

  // Run cleanup once a day
  cleanupQueue.add('cleanup', {}, { repeat: { every: 86400000 }, removeOnComplete: 1 });

  log.info('Smart News Pipeline workers started');
}

async function getTrackedSymbols(): Promise<string[]> {
  const assetRows = await db('assets').distinct('symbol');
  const alertRows = await db('news_alerts').distinct('symbol').where({ active: true });
  return Array.from(new Set([
    ...assetRows.map((r: any) => r.symbol),
    ...alertRows.map((r: any) => r.symbol),
  ]));
}
