// ─────────────────────────────────────────────────────────────────────────────
// pumpFunWorker: Detects tokens that recently graduated from pump.fun to Raydium.
// Uses DexScreener Public API (free, no key).
// Graduation = token berhasil raise 85 SOL di pump.fun dan migrasi ke Raydium.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { Queue, Worker } from 'bullmq';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';
import { config } from '../config';
import { Bot } from 'grammy';
import { RugCheckService } from '../services/RugCheckService';

const QUEUE_NAME = 'pumpfun-graduation';
const INTERVAL_MS = 10 * 60 * 1000; // Every 10 minutes
const COOLDOWN_SECS = 3600 * 6;     // Don't re-alert same token for 6 hours

// Raydium AMM program ID on Solana — used to identify Raydium pools
const RAYDIUM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

interface GraduatedToken {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  marketCap: number;
  liquidity: number;
  volume5m: number;
  volume1h: number;
  change5m: number;
  change1h: number;
  pairCreatedAt: number; // unix ms
  dexUrl: string;
}

export function startPumpFunWorker(bot: Bot): void {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runGraduationScan(bot);
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    log.error('pumpFunWorker failed', { job: job?.id, error: err.message });
  });

  queue.add('scan', {}, {
    repeat: { every: INTERVAL_MS },
    removeOnComplete: 3,
    removeOnFail: 5,
  });

  log.info('🎓 PumpFun Graduation worker started');
}

async function runGraduationScan(bot: Bot): Promise<void> {
  log.info('PumpFun: scanning for newly graduated tokens...');

  try {
    // DexScreener: Search for very new Raydium pairs (created in last ~2 hours)
    // Filter: Solana, Raydium, high volume spike (typical of graduation pumps)
    const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', {
      timeout: 15000,
    });

    const boosts: any[] = res.data ?? [];
    if (boosts.length === 0) {
      // Fallback: search new Solana/Raydium pairs
      await scanNewRaydiumPairs(bot);
      return;
    }

    // Filter only Solana tokens from boosts
    const solanaBoosted = boosts.filter((b: any) => b.chainId === 'solana').slice(0, 20);
    const graduated: GraduatedToken[] = [];

    for (const boost of solanaBoosted) {
      const tokenAddress = boost.tokenAddress;
      if (!tokenAddress) continue;

      const cdKey = `pumpfun_grad:${tokenAddress}`;
      const alreadySent = await redis.get(cdKey);
      if (alreadySent) continue;

      try {
        const pairRes = await axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
          { timeout: 10000 }
        );
        const pairs: any[] = pairRes.data?.pairs ?? [];
        const raydiumPair = pairs.find((p: any) => p.chainId === 'solana' && p.dexId === 'raydium');
        if (!raydiumPair) continue;

        // Check if it's a very new pair (< 3 hours old)
        const ageMs = Date.now() - (raydiumPair.pairCreatedAt ?? 0);
        if (ageMs > 3 * 3600 * 1000) continue;

        const liq = parseFloat(raydiumPair.liquidity?.usd ?? '0');
        const vol1h = parseFloat(raydiumPair.volume?.h1 ?? '0');
        if (liq < 10_000 || vol1h < 5_000) continue;

        graduated.push({
          address: tokenAddress,
          name: raydiumPair.baseToken?.name ?? 'Unknown',
          symbol: raydiumPair.baseToken?.symbol ?? '???',
          priceUsd: parseFloat(raydiumPair.priceUsd ?? '0'),
          marketCap: parseFloat(raydiumPair.marketCap ?? '0'),
          liquidity: liq,
          volume5m: parseFloat(raydiumPair.volume?.m5 ?? '0'),
          volume1h: vol1h,
          change5m: parseFloat(raydiumPair.priceChange?.m5 ?? '0'),
          change1h: parseFloat(raydiumPair.priceChange?.h1 ?? '0'),
          pairCreatedAt: raydiumPair.pairCreatedAt ?? Date.now(),
          dexUrl: raydiumPair.url ?? `https://dexscreener.com/solana/${tokenAddress}`,
        });
      } catch {
        // Ignore individual token errors
      }
    }

    if (graduated.length === 0) {
      await scanNewRaydiumPairs(bot);
      return;
    }

    log.info(`PumpFun: found ${graduated.length} graduated token(s)`);
    await sendGraduationAlerts(bot, graduated);
  } catch (err) {
    log.warn('PumpFun: graduation scan failed', { error: (err as Error).message });
  }
}

async function scanNewRaydiumPairs(bot: Bot): Promise<void> {
  try {
    const res = await axios.get(
      'https://api.dexscreener.com/latest/dex/pairs/solana',
      { timeout: 15000 }
    );

    const pairs: any[] = res.data?.pairs ?? [];
    const graduated: GraduatedToken[] = [];

    for (const p of pairs) {
      if (p.dexId !== 'raydium') continue;

      const ageMs = Date.now() - (p.pairCreatedAt ?? 0);
      if (ageMs > 2 * 3600 * 1000) continue; // < 2 hours old

      const liq = parseFloat(p.liquidity?.usd ?? '0');
      const vol1h = parseFloat(p.volume?.h1 ?? '0');
      const change5m = parseFloat(p.priceChange?.m5 ?? '0');

      // Graduation signature: new pair + decent liquidity + high short-term volume
      if (liq < 15_000 || vol1h < 10_000 || change5m < 5) continue;

      const tokenAddress = p.baseToken?.address;
      if (!tokenAddress) continue;

      const cdKey = `pumpfun_grad:${tokenAddress}`;
      const alreadySent = await redis.get(cdKey);
      if (alreadySent) continue;

      graduated.push({
        address: tokenAddress,
        name: p.baseToken?.name ?? 'Unknown',
        symbol: p.baseToken?.symbol ?? '???',
        priceUsd: parseFloat(p.priceUsd ?? '0'),
        marketCap: parseFloat(p.marketCap ?? '0'),
        liquidity: liq,
        volume5m: parseFloat(p.volume?.m5 ?? '0'),
        volume1h: vol1h,
        change5m,
        change1h: parseFloat(p.priceChange?.h1 ?? '0'),
        pairCreatedAt: p.pairCreatedAt ?? Date.now(),
        dexUrl: p.url ?? `https://dexscreener.com/solana/${tokenAddress}`,
      });

      if (graduated.length >= 5) break;
    }

    if (graduated.length > 0) {
      log.info(`PumpFun fallback: found ${graduated.length} new Raydium pair(s)`);
      await sendGraduationAlerts(bot, graduated);
    } else {
      log.info('PumpFun: no new graduations this cycle');
    }
  } catch (err) {
    log.warn('PumpFun: fallback scan failed', { error: (err as Error).message });
  }
}

async function sendGraduationAlerts(bot: Bot, tokens: GraduatedToken[]): Promise<void> {
  for (const token of tokens.slice(0, 3)) {
    try {
      const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const formatUsd = (n: number) => {
        if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
        return `$${n.toFixed(2)}`;
      };

      const priceFmt = token.priceUsd < 0.001
        ? `$${token.priceUsd.toFixed(8)}`
        : `$${token.priceUsd.toFixed(6)}`;

      const ageMinutes = Math.floor((Date.now() - token.pairCreatedAt) / 60000);
      const change5mEmoji = token.change5m >= 0 ? '🟢' : '🔴';

      const rugCheckUrl = `https://rugcheck.xyz/tokens/${token.address}`;
      const birdeyeUrl = `https://birdeye.so/token/${token.address}?chain=solana`;
      const jupiterUrl = `https://jup.ag/tokens/${token.address}`;

      // Quick rug check
      let rugBadge = '⏳ Checking...';
      try {
        const report = await RugCheckService.getReport(token.address);
        if (report) {
          rugBadge = report.riskLevel === 'GOOD' ? '🟢 Low Risk' : report.riskLevel === 'WARN' ? '🟡 Medium Risk' : '🔴 HIGH RISK';
          if (report.lpBurned) rugBadge += ' | 🔥 LP Burned';
          else if (report.lpLocked) rugBadge += ' | 🔒 LP Locked';
        }
      } catch { rugBadge = '<i>N/A</i>'; }

      const message = [
        `🎓 <b>PUMP.FUN GRADUATION ALERT</b> 🎓`,
        ``,
        `Token baru lulus dari pump.fun dan listing di <b>Raydium</b>!`,
        ``,
        `<b>${escape(token.name)} (${escape(token.symbol)})</b>`,
        `⏱ Listed: <b>${ageMinutes} menit yang lalu</b>`,
        ``,
        `💲 Price: <b>${priceFmt}</b>`,
        `${change5mEmoji} Change 5m: <b>${token.change5m >= 0 ? '+' : ''}${token.change5m.toFixed(1)}%</b>`,
        `📊 Volume 1h: <b>${formatUsd(token.volume1h)}</b>`,
        `💧 Liquidity: <b>${formatUsd(token.liquidity)}</b>`,
        token.marketCap > 0 ? `💎 Market Cap: <b>${formatUsd(token.marketCap)}</b>` : '',
        ``,
        `🛡️ RugCheck: ${rugBadge}`,
        ``,
        `🔑 <b>CA:</b> <code>${token.address}</code>`,
        ``,
        `🔗 <a href="${token.dexUrl}">DexScreener</a>  |  <a href="${birdeyeUrl}">Birdeye</a>`,
        `⚡ <a href="${jupiterUrl}">Buy on Jupiter</a>  |  <a href="${rugCheckUrl}">RugCheck</a>`,
        ``,
        `⚠️ <i>Graduation bukan jaminan aman. Always DYOR dan set stop loss!</i>`,
      ].filter(Boolean).join('\n');

      if (config.bot.channelId) {
        await bot.api.sendMessage(config.bot.channelId, message, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        }).catch(() => {});
      }

      await redis.setex(`pumpfun_grad:${token.address}`, COOLDOWN_SECS, '1');
      log.info('PumpFun graduation alert sent', { symbol: token.symbol, address: token.address });

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      log.warn('PumpFun: failed to send alert', { error: (err as Error).message });
    }
  }
}
