// ─────────────────────────────────────────────────────────────────────────────
// IndicatorService: Multi-timeframe technical analysis computation.
// Computes indicators across multiple timeframes and returns aggregated results.
// ─────────────────────────────────────────────────────────────────────────────

import { PriceService } from './PriceService';
import { computeIndicators, aggregateCandles } from '../utils/indicators';
import { log } from '../utils/logger';
import { OHLCVCandle, IndicatorResult, Timeframe } from '../types';

export interface MultiTimeframeAnalysis {
  '1h': IndicatorResult | null;
  '4h': IndicatorResult | null;
  '1d': IndicatorResult | null;
  candles1d: OHLCVCandle[];
}

export class IndicatorService {
  /**
   * Compute indicators across multiple timeframes for a given symbol.
   * Uses 1-minute candles as base and aggregates up.
   * For stocks (Yahoo), only 1d is available.
   */
  static async analyze(symbol: string): Promise<MultiTimeframeAnalysis> {
    const type = PriceService.detectAssetType(symbol);

    if (type === 'crypto') {
      return this.analyzeCrypto(symbol);
    } else {
      return this.analyzeNonCrypto(symbol);
    }
  }

  /**
   * Crypto: fetch 1h and 4h candles directly from Binance, plus 1d.
   */
  private static async analyzeCrypto(symbol: string): Promise<MultiTimeframeAnalysis> {
    const upper = symbol.toUpperCase();

    const [candles1h, candles4h, candles1d] = await Promise.allSettled([
      PriceService.getOHLCV(upper, '1h', 200),
      PriceService.getOHLCV(upper, '4h', 200),
      PriceService.getOHLCV(upper, '1d', 200),
    ]);

    const c1h = candles1h.status === 'fulfilled' ? candles1h.value : [];
    const c4h = candles4h.status === 'fulfilled' ? candles4h.value : [];
    const c1d = candles1d.status === 'fulfilled' ? candles1d.value : [];

    return {
      '1h': c1h.length >= 50 ? computeIndicators(c1h) : null,
      '4h': c4h.length >= 50 ? computeIndicators(c4h) : null,
      '1d': c1d.length >= 50 ? computeIndicators(c1d) : null,
      candles1d: c1d,
    };
  }

  /**
   * Stocks/Forex: only daily candles available from Yahoo Finance.
   */
  private static async analyzeNonCrypto(symbol: string): Promise<MultiTimeframeAnalysis> {
    try {
      const candles1d = await PriceService.getOHLCV(symbol, '1d', 250);
      return {
        '1h': null,
        '4h': null,
        '1d': candles1d.length >= 50 ? computeIndicators(candles1d) : null,
        candles1d,
      };
    } catch (err) {
      log.error('IndicatorService: failed to fetch candles', { symbol, error: (err as Error).message });
      return { '1h': null, '4h': null, '1d': null, candles1d: [] };
    }
  }

  /**
   * Get the primary (most reliable) indicator set.
   * Prefer 1d > 4h > 1h to avoid noise.
   */
  static getPrimaryIndicators(mtf: MultiTimeframeAnalysis): IndicatorResult | null {
    return mtf['1d'] ?? mtf['4h'] ?? mtf['1h'];
  }

  /**
   * Count how many timeframes agree on direction.
   */
  static countTimeframeAgreement(mtf: MultiTimeframeAnalysis): {
    bullishCount: number;
    bearishCount: number;
    total: number;
  } {
    const timeframes = [mtf['1d'], mtf['4h'], mtf['1h']].filter(Boolean) as IndicatorResult[];
    let bullish = 0;
    let bearish = 0;

    timeframes.forEach((ind) => {
      const score = this.quickDirectionScore(ind);
      if (score > 0) bullish++;
      else if (score < 0) bearish++;
    });

    return { bullishCount: bullish, bearishCount: bearish, total: timeframes.length };
  }

  private static quickDirectionScore(ind: IndicatorResult): number {
    let score = 0;
    if (ind.rsi !== null) {
      if (ind.rsi < 40) score++;
      else if (ind.rsi > 60) score--;
    }
    if (ind.macdLine !== null && ind.macdSignal !== null) {
      if (ind.macdLine > ind.macdSignal) score++;
      else score--;
    }
    if (ind.breakoutDetected) {
      if (ind.breakoutDirection === 'up') score += 2;
      else score -= 2;
    }
    return score;
  }
}
