// ─────────────────────────────────────────────────────────────────────────────
// dailySummaryWorker: Sends a daily AI-powered market recap every evening.
// Fires at 21:00 WIB (14:00 UTC). Uses Gemini AI to summarize news + signals.
// ─────────────────────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { db } from '../db';
import { NewsService } from '../services/NewsService';
import { FearGreedService } from '../services/FearGreedService';
import { PriceService } from '../services/PriceService';
import { GeminiService } from '../services/GeminiService';
import { log } from '../utils/logger';
import { config } from '../config';
import { Bot } from 'grammy';

const QUEUE_NAME = 'daily-summary';
const COOLDOWN_KEY = 'daily_summary_last_sent';
const TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

export function startDailySummaryWorker(bot: Bot): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runDailySummary(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('dailySummaryWorker failed', { job: job?.id, error: err.message });
  });

  // Check every 30 minutes whether it's time to send the daily summary
  queue.add('check', {}, {
    repeat: { every: 30 * 60 * 1000 },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info('📰 Daily Summary worker started (fires at 21:00 WIB)');
}

async function runDailySummary(bot: Bot): Promise<void> {
  // Check if it's 21:00 WIB (14:00 UTC) — allow 30-min window
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Window: 14:00-14:30 UTC = 21:00-21:30 WIB
  if (!(utcHour === 14 && utcMinute < 30)) {
    return;
  }

  // Cooldown: only send once per day
  const lastSent = await redis.get(COOLDOWN_KEY);
  if (lastSent) {
    const lastDate = new Date(parseInt(lastSent)).toDateString();
    if (lastDate === now.toDateString()) return;
  }

  log.info('Daily Summary: generating...');
  await redis.set(COOLDOWN_KEY, String(Date.now()), 'EX', 86400);

  try {
    // 1. Fetch all data in parallel
    const [priceResults, fearGreed, usdIdr] = await Promise.all([
      Promise.allSettled(TOP_CRYPTO.map(s => PriceService.getPrice(s))),
      FearGreedService.getIndex(),
      PriceService.getUsdIdrRate(),
    ]);

    const prices = priceResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    // 2. Collect headlines from last 24h
    let allHeadlines: string[] = [];
    for (const symbol of TOP_CRYPTO) {
      try {
        const news = await NewsService.getNews(symbol, 5);
        const recentNews = news.filter(n => {
          const ageMs = Date.now() - n.publishedAt.getTime();
          return ageMs < 24 * 3600 * 1000;
        });
        allHeadlines.push(...recentNews.map(n => n.title));
      } catch { /* ignore */ }
    }

    // Deduplicate headlines
    allHeadlines = [...new Set(allHeadlines)].slice(0, 12);

    // 3. Build market snapshot text
    const sorted = [...prices].sort((a, b) => b.change24h - a.change24h);
    const topGainer = sorted[0];
    const topLoser  = sorted[sorted.length - 1];

    const fgText = fearGreed
      ? `${fearGreed.value}/100 (${fearGreed.classification})`
      : 'N/A';

    const idrFmt = usdIdr.toLocaleString('id-ID');

    const priceSnapshot = prices.map(p => {
      const sym = p.symbol.replace('USDT', '');
      return `${sym}: $${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(1)}%)`;
    }).join(', ');

    // 4. Ask Gemini AI to summarize
    let aiSummary = '';
    if (config.gemini.apiKey) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

        const prompt = `
Kamu adalah analis kripto profesional yang membuat ringkasan pasar harian untuk bot Telegram Indonesia.

Data pasar hari ini:
- Harga: ${priceSnapshot}
- Fear & Greed Index: ${fgText}
- USD/IDR: Rp${idrFmt}
- Top Gainer: ${topGainer?.symbol?.replace('USDT', '') ?? 'N/A'} (${topGainer?.change24h?.toFixed(1) ?? '?'}%)
- Top Loser: ${topLoser?.symbol?.replace('USDT', '') ?? 'N/A'} (${topLoser?.change24h?.toFixed(1) ?? '?'}%)

Berita utama hari ini:
${allHeadlines.slice(0, 8).map((h, i) => `${i + 1}. ${h}`).join('\n')}

Tugas:
1. Rangkum kondisi pasar hari ini dalam 2-3 kalimat bahasa Indonesia yang padat.
2. Sebutkan 3 poin berita paling penting dan dampaknya pada pasar.
3. Berikan outlook singkat untuk besok (bullish/bearish/sideways) dengan alasan singkat.

Format output (gunakan HTML tags Telegram):
📝 <b>Ringkasan:</b> [2-3 kalimat]

🔑 <b>Poin Penting:</b>
• [poin 1]
• [poin 2]  
• [poin 3]

🔮 <b>Outlook Besok:</b> [prediksi + alasan singkat]

Tetap singkat, padat, dan profesional. Maksimum 300 kata.`;

        const result = await model.generateContent(prompt);
        aiSummary = result.response.text().trim();
      } catch (err) {
        log.warn('Daily Summary: AI generation failed', { error: (err as Error).message });
        aiSummary = '<i>AI Summary tidak tersedia hari ini.</i>';
      }
    } else {
      // Fallback non-AI summary
      aiSummary = [
        `📝 <b>Ringkasan:</b> Pasar kripto hari ini menunjukkan pergerakan beragam.`,
        `Top gainer: <b>${topGainer?.symbol?.replace('USDT', '') ?? 'N/A'}</b> (+${topGainer?.change24h?.toFixed(1) ?? '?'}%)`,
        `Top loser: <b>${topLoser?.symbol?.replace('USDT', '') ?? 'N/A'}</b> (${topLoser?.change24h?.toFixed(1) ?? '?'}%)`,
        ``,
        `<i>Set GEMINI_API_KEY untuk analisis AI otomatis!</i>`,
      ].join('\n');
    }

    // 5. Build full message
    const changeRow = (p: any) => {
      const sym = p.symbol.replace('USDT', '');
      const e = p.change24h >= 0 ? '🟢' : '🔴';
      return `${e} <b>${sym}</b> $${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(1)}%)`;
    };

    const fgEmoji = !fearGreed ? '⚪' :
      fearGreed.value <= 20 ? '🔴' :
      fearGreed.value <= 40 ? '🟠' :
      fearGreed.value <= 60 ? '🟡' :
      fearGreed.value <= 80 ? '🟢' : '🔥';

    const dateStr = now.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const message = [
      `🌙 <b>Daily Market Recap</b>`,
      `<i>${dateStr}</i>`,
      ``,
      `─── Harga Penutupan ───`,
      ...prices.map(changeRow),
      ``,
      `─── Sentimen ───`,
      `${fgEmoji} Fear &amp; Greed: <b>${fgText}</b>`,
      `💱 USD/IDR: <b>Rp${idrFmt}</b>`,
      ``,
      `─── AI Analysis ───`,
      aiSummary,
      ``,
      `─────────────────────`,
      `<i>📊 /today untuk update real-time</i>`,
      `<i>🚀 /solana untuk gem scan malam ini</i>`,
    ].join('\n');

    if (config.bot.channelId) {
      await bot.api.sendMessage(config.bot.channelId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      log.info('Daily Summary sent to channel');
    } else {
      log.info('Daily Summary: no channelId configured, skipping send');
    }
  } catch (err) {
    log.error('Daily Summary: generation failed', { error: (err as Error).message });
  }
}
