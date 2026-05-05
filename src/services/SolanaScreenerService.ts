// ─────────────────────────────────────────────────────────────────────────────
// SolanaScreenerService: Finds trending Solana tokens with bullish momentum.
// Data source: DexScreener (free, no API key required).
// Criteria: High volume surge, liquidity > $50K, significant price pump,
//           not yet a "big name" (i.e., a hidden gem).
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';

export interface SolanaToken {
  name: string;
  symbol: string;
  address: string;          // Contract address
  priceUsd: number;
  change1h: number;         // % change in 1 hour
  change6h: number;         // % change in 6 hours
  change24h: number;        // % change in 24 hours
  volume24h: number;        // USD volume in last 24h
  liquidityUsd: number;     // Total liquidity in pool
  marketCap: number | null;
  dexUrl: string;           // Link to DexScreener page
  pairAge: number;          // Age of pair in hours
  rugCheckStatus?: string;  // 'Good' | 'Warning' | 'Danger' | 'Unknown'
}

// Screening criteria for "hidden gem" detection
const CRITERIA = {
  MIN_LIQUIDITY_USD:   50_000,    // At least $50K liquidity (avoid rug pulls)
  MAX_LIQUIDITY_USD:  5_000_000,  // Not already too big (hidden gem target)
  MIN_VOLUME_24H:     100_000,    // At least $100K daily volume (active trading)
  MIN_CHANGE_1H:          5,      // At least +5% in the last 1 hour
  MIN_CHANGE_6H:         15,      // At least +15% in the last 6 hours
  MAX_PAIR_AGE_HOURS:   168,      // Less than 7 days old (fresh token)
  ALERT_COOLDOWN_SECS: 14400,     // 4-hour cooldown per token to avoid spam
};

export class SolanaScreenerService {

  /**
   * Fetch and screen trending Solana tokens from DexScreener.
   * Returns tokens matching the "hidden gem" criteria.
   */
  static async screen(): Promise<SolanaToken[]> {
    try {
      // DexScreener: Get all recently active pairs on Solana
      const res = await axios.get(
        'https://api.dexscreener.com/latest/dex/tokens/SOL',
        { timeout: 15000 }
      );

      const pairs: any[] = res.data?.pairs ?? [];
      if (pairs.length === 0) return [];

      // Filter by Solana chain
      const solanaPairs = pairs.filter((p: any) => p.chainId === 'solana');

      const gems: SolanaToken[] = [];

      for (const p of solanaPairs) {
        try {
          const priceUsd = parseFloat(p.priceUsd ?? '0');
          const change1h = parseFloat(p.priceChange?.h1 ?? '0');
          const change6h = parseFloat(p.priceChange?.h6 ?? '0');
          const change24h = parseFloat(p.priceChange?.h24 ?? '0');
          const volume24h = parseFloat(p.volume?.h24 ?? '0');
          const liquidityUsd = parseFloat(p.liquidity?.usd ?? '0');
          const marketCap = p.marketCap ? parseFloat(p.marketCap) : null;

          // Calculate pair age in hours
          const pairCreatedAt = p.pairCreatedAt ? parseInt(p.pairCreatedAt, 10) : 0;
          const pairAgeHours = pairCreatedAt > 0
            ? (Date.now() - pairCreatedAt) / 3600000
            : 9999;

          // Apply screening criteria
          if (
            liquidityUsd < CRITERIA.MIN_LIQUIDITY_USD ||
            liquidityUsd > CRITERIA.MAX_LIQUIDITY_USD ||
            volume24h < CRITERIA.MIN_VOLUME_24H ||
            change1h < CRITERIA.MIN_CHANGE_1H ||
            change6h < CRITERIA.MIN_CHANGE_6H ||
            pairAgeHours > CRITERIA.MAX_PAIR_AGE_HOURS
          ) {
            continue;
          }

          const token: SolanaToken = {
            name: p.baseToken?.name ?? 'Unknown',
            symbol: p.baseToken?.symbol ?? '???',
            address: p.baseToken?.address ?? '',
            priceUsd,
            change1h,
            change6h,
            change24h,
            volume24h,
            liquidityUsd,
            marketCap,
            dexUrl: p.url ?? `https://dexscreener.com/solana/${p.baseToken?.address}`,
            pairAge: Math.floor(pairAgeHours),
          };

          gems.push(token);
        } catch {
          // Skip malformed token entries
          continue;
        }
      }

      // Sort by 6h change descending — biggest movers first
      gems.sort((a, b) => b.change6h - a.change6h);

      // Return top 5 candidates and enrich with RugCheck data
      const topGems = gems.slice(0, 5);
      
      for (const gem of topGems) {
        const rug = await this.checkRug(gem.address);
        gem.rugCheckStatus = rug.status;
      }
      
      return topGems;
    } catch (err) {
      log.warn('SolanaScreenerService: fetch failed', { error: (err as Error).message });
      return [];
    }
  }

  /**
   * Check token safety via RugCheck API
   */
  static async checkRug(address: string): Promise<{ score: number, status: string }> {
    try {
      const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`, { timeout: 5000 });
      const score = res.data?.score || 0;
      let status = 'Unknown';
      if (score < 1000) status = 'Good ✅';
      else if (score < 5000) status = 'Warning ⚠️';
      else status = 'Danger ❌';
      
      return { score, status };
    } catch (err) {
      log.warn('RugCheck API failed', { address, error: (err as Error).message });
      return { score: 0, status: 'Unknown ❓' };
    }
  }

  /**
   * Check if this token was already alerted recently (cooldown check).
   */
  static async isOnCooldown(address: string): Promise<boolean> {
    const key = `sol_gem_cd:${address}`;
    const exists = await redis.get(key);
    return !!exists;
  }

  /**
   * Mark a token as alerted and set cooldown.
   */
  static async setCooldown(address: string): Promise<void> {
    const key = `sol_gem_cd:${address}`;
    await redis.setex(key, CRITERIA.ALERT_COOLDOWN_SECS, 'alerted');
  }

  /**
   * Alias for screen() for better naming in gems feature.
   */
  static async getGraduatedTokens(): Promise<SolanaToken[]> {
    return this.screen();
  }

  /**
   * Fetch recent whale movements (simulation/mock for now based on dex activity).
   */
  static async getWhaleMovements(): Promise<any[]> {
    const gems = await this.screen();
    return gems.map(g => ({
      symbol: g.symbol,
      type: Math.random() > 0.5 ? 'buy' : 'sell',
      usdAmount: Math.floor(Math.random() * 50000) + 10000,
      wallet: g.address
    }));
  }

  /**
   * Format token data for Telegram message.
   */
  static formatAlert(token: SolanaToken): string {
    const formatUsd = (n: number) => {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(2)}`;
    };

    const priceFmt = token.priceUsd < 0.001
      ? `$${token.priceUsd.toFixed(8)}`
      : token.priceUsd < 1
      ? `$${token.priceUsd.toFixed(5)}`
      : `$${token.priceUsd.toFixed(4)}`;

    const urgencyEmoji = token.change6h >= 50 ? '🔥🔥🔥' : token.change6h >= 30 ? '🔥🔥' : '🔥';
    const birdeyeUrl = `https://birdeye.so/token/${token.address}?chain=solana`;
    const jupiterUrl = `https://jup.ag/tokens/${token.address}`;

    const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const name = escape(token.name);
    const symbol = escape(token.symbol);
    const rugStatus = escape(token.rugCheckStatus || 'Unknown ❓');

    return [
      `${urgencyEmoji} <b>SOLANA GEM ALERT</b> ${urgencyEmoji}`,
      ``,
      `<b>${name} (${symbol})</b>`,
      ``,
      `📈 Price: <b>${priceFmt}</b>`,
      `⏱ +${token.change1h.toFixed(1)}% (1h) | +${token.change6h.toFixed(1)}% (6h) | +${token.change24h.toFixed(1)}% (24h)`,
      ``,
      `💧 Liquidity: <b>${formatUsd(token.liquidityUsd)}</b>`,
      `📊 Volume 24h: <b>${formatUsd(token.volume24h)}</b>`,
      token.marketCap ? `💎 Market Cap: <b>${formatUsd(token.marketCap)}</b>` : '',
      `🕒 Token Age: <b>${token.pairAge}h</b>`,
      `🛡️ RugCheck: <b>${rugStatus}</b>`,
      ``,
      `🔑 <b>Contract Address:</b>`,
      `<code>${token.address}</code>`,
      ``,
      `🔗 <a href="${token.dexUrl}">DexScreener</a>  |  <a href="${birdeyeUrl}">Birdeye</a>  |  <a href="${jupiterUrl}">Buy on Jupiter</a>`,
      ``,
      `<i>⚠ Meme coin = high risk! DYOR. Tidak ada jaminan profit.</i>`
    ].filter(Boolean).join('\n');
  }
}
