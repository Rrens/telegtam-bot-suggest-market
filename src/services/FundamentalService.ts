// ─────────────────────────────────────────────────────────────────────────────
// FundamentalService: Fetches and rates fundamental data for stocks and crypto.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { config } from '../config';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache/redis';
import { withRetry } from '../utils/retry';
import { log } from '../utils/logger';
import { FundamentalData, FundamentalRating, AssetType } from '../types';
import { PriceService } from './PriceService';

export class FundamentalService {
  /**
   * Get fundamental analysis for any symbol.
   */
  static async analyze(symbol: string): Promise<FundamentalData | null> {
    const type = PriceService.detectAssetType(symbol);
    const cacheKey = cacheKeys.fundamental(symbol);

    const cached = await cacheGet<FundamentalData>(cacheKey);
    if (cached) return cached;

    try {
      let data: FundamentalData;
      if (type === 'crypto') {
        data = await withRetry(() => this.analyzeCrypto(symbol));
      } else {
        data = await withRetry(() => this.analyzeStock(symbol));
      }

      await cacheSet(cacheKey, data, TTL.FUNDAMENTAL);
      return data;
    } catch (err) {
      log.warn('FundamentalService: analysis failed', { symbol, error: (err as Error).message });
      return null;
    }
  }

  /**
   * Crypto fundamentals via CoinGecko.
   */
  private static async analyzeCrypto(symbol: string): Promise<FundamentalData> {
    const coinId = PriceService.symbolToCoinGeckoId(symbol);

    const res = await axios.get(`${config.apis.coingeckoUrl}/coins/${coinId}`, {
      params: { localization: false, tickers: false, market_data: true, community_data: false, developer_data: false },
      timeout: 10000,
    });

    const coin = res.data;
    const marketData = coin.market_data;

    const marketCap: number = marketData?.market_cap?.usd ?? 0;
    const volume24h: number = marketData?.total_volume?.usd ?? 0;
    const supply: number = marketData?.total_supply ?? 0;
    const circulating: number = marketData?.circulating_supply ?? 0;
    const priceChange30d: number = marketData?.price_change_percentage_30d ?? 0;

    const details: string[] = [];
    const score = this.scoreCrypto(marketCap, volume24h, supply, circulating, priceChange30d, details);
    const rating = this.scoreToRating(score);

    return {
      symbol: symbol.toUpperCase(),
      rating,
      marketCap,
      supply,
      circulatingSupply: circulating,
      details,
    };
  }

  /**
   * Stock fundamentals via Yahoo Finance.
   */
  private static async analyzeStock(symbol: string): Promise<FundamentalData> {
    const res = await axios.get(`https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol.toUpperCase()}?modules=financialData,defaultKeyStatistics,summaryDetail`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const quoteSummary = res.data?.quoteSummary?.result?.[0];
    if (!quoteSummary) throw new Error(`Yahoo Finance QuoteSummary: No data for ${symbol}`);

    const financial = quoteSummary.financialData;
    const keyStats = quoteSummary.defaultKeyStatistics;
    const summary = quoteSummary.summaryDetail;

    const peRatio: number | null = summary?.trailingPE?.raw ?? null;
    const earnings: number | null = financial?.earningsGrowth?.raw ?? null;
    const revenue: number | null = financial?.revenueGrowth?.raw ?? null;
    const marketCap: number | null = summary?.marketCap?.raw ?? null;

    const details: string[] = [];
    const score = this.scoreStock(peRatio, earnings, revenue, marketCap, details);
    const rating = this.scoreToRating(score);

    return {
      symbol: symbol.toUpperCase(),
      rating,
      marketCap: marketCap ?? undefined,
      peRatio,
      earnings,
      revenueGrowth: revenue,
      details,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Scoring logic
  // ───────────────────────────────────────────────────────────────────────────

  private static scoreCrypto(
    marketCap: number,
    volume24h: number,
    supply: number,
    circulating: number,
    priceChange30d: number,
    details: string[]
  ): number {
    let score = 0;

    if (marketCap > 10e9) { score += 2; details.push('Market cap > $10B (Large cap)'); }
    else if (marketCap > 1e9) { score += 1; details.push('Market cap $1B–$10B (Mid cap)'); }
    else { score -= 1; details.push('Market cap < $1B (Small cap, higher risk)'); }

    const volToMarketCap = marketCap > 0 ? volume24h / marketCap : 0;
    if (volToMarketCap > 0.05) { score += 1; details.push('High trading liquidity'); }
    else if (volToMarketCap < 0.01) { score -= 1; details.push('Low trading volume / liquidity concern'); }

    if (supply > 0 && circulating > 0) {
      const supplyRatio = circulating / supply;
      if (supplyRatio > 0.8) { score += 1; details.push('High circulating supply ratio (low inflation risk)'); }
    }

    if (priceChange30d > 20) { score += 1; details.push('Strong 30d momentum (+20%)'); }
    else if (priceChange30d < -30) { score -= 1; details.push('Significant 30d decline (−30%)'); }

    return score;
  }

  private static scoreStock(
    peRatio: number | null,
    earnings: number | null,
    revenue: number | null,
    marketCap: number | null,
    details: string[]
  ): number {
    let score = 0;

    if (peRatio !== null) {
      if (peRatio > 0 && peRatio < 25) { score += 2; details.push(`P/E ratio: ${peRatio.toFixed(1)} (Reasonable valuation)`); }
      else if (peRatio >= 25 && peRatio < 50) { score += 0; details.push(`P/E ratio: ${peRatio.toFixed(1)} (Elevated)`); }
      else if (peRatio >= 50) { score -= 1; details.push(`P/E ratio: ${peRatio.toFixed(1)} (High growth priced in)`); }
    }

    if (earnings !== null) {
      if (earnings > 0.1) { score += 2; details.push(`Earnings growth: +${(earnings * 100).toFixed(1)}% YoY`); }
      else if (earnings > 0) { score += 1; details.push(`Earnings growth: +${(earnings * 100).toFixed(1)}%`); }
      else { score -= 1; details.push(`Earnings declining: ${(earnings * 100).toFixed(1)}%`); }
    }

    if (revenue !== null) {
      if (revenue > 0.1) { score += 1; details.push(`Revenue growth: +${(revenue * 100).toFixed(1)}%`); }
      else if (revenue < 0) { score -= 1; details.push(`Revenue declining: ${(revenue * 100).toFixed(1)}%`); }
    }

    if (marketCap !== null) {
      if (marketCap > 100e9) { details.push('Large cap stock (>$100B)'); score += 1; }
      else if (marketCap > 10e9) { details.push('Mid-large cap ($10B–$100B)'); }
    }

    return score;
  }

  private static scoreToRating(score: number): FundamentalRating {
    if (score >= 3) return 'strong';
    if (score >= 0) return 'neutral';
    return 'weak';
  }
}
