// ─────────────────────────────────────────────────────────────────────────────
// SignalEngine: Core trading signal generation.
// Combines technical, fundamental, and sentiment analysis into a weighted score.
// Generates stop-loss, take-profit, and invalidation conditions.
// ─────────────────────────────────────────────────────────────────────────────

import { PriceService } from './PriceService';
import { IndicatorService } from './IndicatorService';
import { FundamentalService } from './FundamentalService';
import { NewsService } from './NewsService';
import { db } from '../db';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache/redis';
import { log } from '../utils/logger';
import {
  SignalResult, TrendLabel, TradeBias, FundamentalRating, SentimentLabel,
  IndicatorResult, RiskProfile, DbSignal,
} from '../types';

export class SignalEngine {
  /**
   * Generate a full trading signal for a symbol.
   * @param symbol  e.g. "BTCUSDT", "AAPL"
   * @param riskProfile  User's risk profile (affects position size advice)
   */
  static async generate(symbol: string, riskProfile: RiskProfile = 'moderate'): Promise<SignalResult> {
    const cacheKey = cacheKeys.signal(symbol, riskProfile);
    const cached = await cacheGet<SignalResult>(cacheKey);
    if (cached) return cached;

    // 1. Fetch all data in parallel
    const [priceData, mtfAnalysis, fundamentalData, newsItems] = await Promise.all([
      PriceService.getPrice(symbol),
      IndicatorService.analyze(symbol),
      FundamentalService.analyze(symbol),
      NewsService.getNews(symbol, 8),
    ]);

    // 2. Get primary indicators (1d preferred)
    const primaryIndicators = IndicatorService.getPrimaryIndicators(mtfAnalysis);

    if (!primaryIndicators) {
      log.warn('SignalEngine: insufficient indicator data', { symbol });
      return this.buildMinimalSignal(symbol, priceData.price);
    }

    // 3. Multi-timeframe agreement
    const { bullishCount, bearishCount, total: tfTotal } = IndicatorService.countTimeframeAgreement(mtfAnalysis);

    // 4. Weighted scoring
    const { score, reasoning } = this.computeWeightedScore(
      primaryIndicators,
      priceData.price,
      fundamentalData?.rating ?? null,
      newsItems,
      bullishCount,
      bearishCount,
      tfTotal
    );

    // 5. Derive signal components
    const { trend, tradeBias, confidence } = this.deriveSignalComponents(score);

    // 6. Risk management
    const { stopLoss, takeProfit, takeProfits, riskRewardRatio, positionSizeAdvice } = this.computeRiskManagement(
      priceData.price,
      primaryIndicators,
      tradeBias,
      riskProfile
    );

    // 7. Invalidation conditions
    const invalidationConditions = this.buildInvalidationConditions(
      priceData.price,
      primaryIndicators,
      tradeBias
    );

    // 8. News sentiment
    const newsSentiment = newsItems.length > 0
      ? this.aggregateNewsSentiment(newsItems)
      : null;

    const signal: SignalResult = {
      symbol: symbol.toUpperCase(),
      price: priceData.price,
      trend,
      confidence,
      signalScore: score,
      tradeBias,
      indicators: primaryIndicators,
      fundamentalRating: fundamentalData?.rating ?? null,
      newsSentiment,
      newsItems,
      reasoning,
      invalidationConditions,
      stopLoss,
      takeProfit,
      takeProfits,
      riskRewardRatio,
      positionSizeAdvice,
      timeframe: '1d',
      timestamp: Date.now(),
    };

    // 9. Persist signal to DB
    await this.persistSignal(signal);

    // 10. Cache signal
    await cacheSet(cacheKey, signal, TTL.SIGNAL);

    return signal;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Weighted scoring
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Compute a weighted integer signal score (-10 to +10).
   * Each indicator contributes based on its reliability weight.
   */
  private static computeWeightedScore(
    ind: IndicatorResult,
    currentPrice: number,
    fundamentalRating: FundamentalRating | null,
    newsItems: { sentiment: SentimentLabel; sentimentScore: number }[],
    bullishTfCount: number,
    bearishTfCount: number,
    tfTotal: number
  ): { score: number; reasoning: string[] } {
    let score = 0;
    const reasoning: string[] = [];

    // ── RSI (weight: 2) ──────────────────────────────────────────────────────
    if (ind.rsi !== null) {
      if (ind.rsi < 30) {
        score += 2;
        reasoning.push('RSI oversold (<30) — high reversal potential');
      } else if (ind.rsi < 45) {
        score += 1;
        reasoning.push('RSI in recovery zone — potential dip buying opportunity');
      } else if (ind.rsi > 70) {
        score -= 2;
        reasoning.push('RSI overbought (>70) — high pullback/correction risk');
      } else if (ind.rsi > 50 && currentPrice > (ind.ma50 ?? 0)) {
        score += 1;
        reasoning.push('RSI > 50 with price above DEMA50 — strong bullish momentum');
      }
    }

    // ── MACD (weight: 2) ─────────────────────────────────────────────────────
    if (ind.macdLine !== null && ind.macdSignal !== null) {
      if (ind.macdLine > ind.macdSignal && ind.macdHistogram !== null && ind.macdHistogram > 0) {
        score += 2;
        reasoning.push('MACD bullish crossover confirmed with positive histogram');
      } else if (ind.macdLine > ind.macdSignal) {
        score += 1;
        reasoning.push('MACD signal line bullish crossover');
      } else if (ind.macdLine < ind.macdSignal && ind.macdHistogram !== null && ind.macdHistogram < 0) {
        score -= 2;
        reasoning.push('MACD bearish crossover confirmed with negative histogram');
      } else {
        score -= 1;
        reasoning.push('MACD signal line bearish crossover');
      }
    }

    // ── Price vs DEMA50 (weight: 3) ───────────────────────────────────────────
    // Most important short-term trend indicator
    if (ind.ma50 !== null) {
      if (currentPrice > ind.ma50) {
        score += 3;
        reasoning.push(`Price above DEMA50 ($${ind.ma50.toFixed(0)}) — bullish structure confirmed`);
      } else {
        score -= 3;
        reasoning.push(`Price below DEMA50 ($${ind.ma50.toFixed(0)}) — bearish structure confirmed`);
      }
    }

    // ── Price vs DEMA200 (weight: 1) ──────────────────────────────────────────
    // Long-term structure context
    if (ind.ma200 !== null) {
      if (currentPrice > ind.ma200) {
        score += 1;
        reasoning.push(`Price above DEMA200 ($${ind.ma200.toFixed(0)}) — long-term bullish`);
      } else {
        // Softer penalty: price below DEMA200 is bearish but can still trend up
        score -= 1;
        reasoning.push(`Price below DEMA200 ($${ind.ma200.toFixed(0)}) — long-term bearish context`);

        // Golden/Death cross as additional context (not double-penalty)
        if (ind.ma50 !== null) {
          if (ind.ma50 > ind.ma200) {
            score += 1;
            reasoning.push('Golden cross: DEMA50 > DEMA200 — recovery momentum building');
          } else {
            // Only -1 instead of -2: death cross matters less when price > DEMA50
            const softPenalty = currentPrice > ind.ma50 ? -0 : -1;
            score += softPenalty;
            if (softPenalty < 0) reasoning.push('Death cross: DEMA50 < DEMA200 — long-term structure still weak');
          }
        }
      }
    }

    // ── DEMA(20) vs Price (weight: 1) ────────────────────────────────────────
    // Fast momentum: is price above or below the DEMA?
    if (ind.dema20 !== null) {
      if (currentPrice > ind.dema20) {
        score += 1;
        reasoning.push(`Price above DEMA(20) ($${ind.dema20.toFixed(0)}) — fast momentum bullish`);
      } else {
        score -= 1;
        reasoning.push(`Price below DEMA(20) ($${ind.dema20.toFixed(0)}) — fast momentum bearish`);
      }
    }

    // ── SuperTrend (weight: 2) ───────────────────────────────────────────────
    if (ind.superTrendDirection === 'up') {
      score += 2;
      reasoning.push('SuperTrend: Bullish (Buy signal confirmed)');
    } else if (ind.superTrendDirection === 'down') {
      score -= 2;
      reasoning.push('SuperTrend: Bearish (Sell signal confirmed)');
    }

    // ── Bollinger Bands (weight: 1) ──────────────────────────────────────────
    if (ind.bbLower !== null && ind.bbUpper !== null && ind.bbMiddle !== null) {
      // We'll compare relative to middle as proxy
      const bbWidth = ind.bbUpper - ind.bbLower;
      const bbRange = bbWidth / ind.bbMiddle;
      if (bbRange < 0.05) {
        reasoning.push('Bollinger Bands squeezing — high volatility breakout imminent');
        // Neutral direction — don't score yet
      }
    }

    // ── Breakout (weight: 3) ─────────────────────────────────────────────────
    if (ind.breakoutDetected) {
      if (ind.breakoutDirection === 'up') {
        score += 3;
        reasoning.push('Volume-confirmed upside breakout above resistance — strong bullish signal');
      } else {
        score -= 3;
        reasoning.push('Volume-confirmed downside breakout below support — strong bearish signal');
      }
    }

    // ── Volume spike (weight: 1) ─────────────────────────────────────────────
    if (ind.volumeSpike) {
      reasoning.push('Significant volume spike detected (2x average) — confirms price move');
      // Volume alone is directionally neutral; amplifies existing score
      score = score > 0 ? score + 1 : score - 1;
    }

    // ── Multi-timeframe confluence (weight: 2) ───────────────────────────────
    if (tfTotal >= 2) {
      if (bullishTfCount >= 2) {
        score += 2;
        reasoning.push(`Multi-timeframe confluence: ${bullishTfCount}/${tfTotal} timeframes bullish`);
      } else if (bearishTfCount >= 2) {
        score -= 2;
        reasoning.push(`Multi-timeframe confluence: ${bearishTfCount}/${tfTotal} timeframes bearish`);
      }
    }

    // ── Fundamentals (weight: 1) ─────────────────────────────────────────────
    if (fundamentalRating === 'strong') {
      score += 1;
      reasoning.push('Strong fundamental backing');
    } else if (fundamentalRating === 'weak') {
      score -= 1;
      reasoning.push('Weak fundamentals — adds downside risk');
    }

    // ── News sentiment (weight: 1) ───────────────────────────────────────────
    if (newsItems.length > 0) {
      const avgSentiment = newsItems.reduce((sum, i) => sum + i.sentimentScore, 0) / newsItems.length;
      if (avgSentiment > 0.2) {
        score += 1;
        reasoning.push('Positive news sentiment supporting bullish thesis');
      } else if (avgSentiment < -0.2) {
        score -= 1;
        reasoning.push('Negative news flow adding bearish pressure');
      }
    }

    // Clamp score to [-10, +10]
    score = Math.max(-10, Math.min(10, score));

    return { score, reasoning };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Signal derivation
  // ───────────────────────────────────────────────────────────────────────────

  private static deriveSignalComponents(score: number): {
    trend: TrendLabel;
    tradeBias: TradeBias;
    confidence: number;
  } {
    let trend: TrendLabel;
    let tradeBias: TradeBias;

    if (score >= 6) { trend = 'Strong Bullish'; tradeBias = 'long'; }
    else if (score >= 3) { trend = 'Bullish'; tradeBias = 'long'; }
    else if (score >= -2) { trend = 'Neutral'; tradeBias = 'wait'; }
    else if (score >= -5) { trend = 'Bearish'; tradeBias = 'short'; }
    else { trend = 'Strong Bearish'; tradeBias = 'short'; }

    // Confidence based on score magnitude and low volatility filter
    const absScore = Math.abs(score);
    const rawConfidence = (absScore / 10) * 100;

    // Require minimum score of 3 to have meaningful confidence
    const confidence = absScore < 3 ? Math.min(rawConfidence, 45) : rawConfidence;

    return { trend, tradeBias, confidence: Math.round(confidence) };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Risk management
  // ───────────────────────────────────────────────────────────────────────────

  private static computeRiskManagement(
    price: number,
    ind: IndicatorResult,
    bias: TradeBias,
    riskProfile: RiskProfile
  ): { stopLoss: number | null; takeProfit: number | null; takeProfits: number[]; riskRewardRatio: number | null; positionSizeAdvice: string } {
    if (bias === 'wait') {
      return { stopLoss: null, takeProfit: null, takeProfits: [], riskRewardRatio: null, positionSizeAdvice: 'No trade — wait for clearer signal' };
    }

    // Risk % per trade based on profile
    const riskPct = { conservative: 0.01, moderate: 0.02, aggressive: 0.03 }[riskProfile];
    
    let stopLoss: number;
    let takeProfits: number[] = [];

    if (bias === 'long') {
      // Stop loss: below support or 2% below current price
      const supportStop = ind.supportLevel ? ind.supportLevel * 0.995 : price * (1 - riskPct * 2);
      stopLoss = Math.min(supportStop, price * (1 - riskPct * 2));

      const riskAmount = price - stopLoss;
      // Multi-layer TP
      takeProfits = [
        price + riskAmount * 1.5, // TP1
        price + riskAmount * 3.0, // TP2
        price + riskAmount * 5.0  // TP3
      ];
    } else {
      // Short: stop above resistance or 2% above current price
      const resistanceStop = ind.resistanceLevel ? ind.resistanceLevel * 1.005 : price * (1 + riskPct * 2);
      stopLoss = Math.max(resistanceStop, price * (1 + riskPct * 2));

      const riskAmount = stopLoss - price;
      // Multi-layer TP
      takeProfits = [
        price - riskAmount * 1.5, // TP1
        price - riskAmount * 3.0, // TP2
        price - riskAmount * 5.0  // TP3
      ];
    }

    const risk = Math.abs(price - stopLoss);
    const primaryTp = takeProfits[1]; // Use TP2 as primary for ratio calculation
    const reward = Math.abs(primaryTp - price);
    const riskRewardRatio = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : null;

    const positionPct = { conservative: '1–2%', moderate: '2–5%', aggressive: '5–10%' }[riskProfile];
    const positionSizeAdvice = `${positionPct} of portfolio (${riskProfile} profile)`;

    return {
      stopLoss: parseFloat(stopLoss.toFixed(8)),
      takeProfit: parseFloat(primaryTp.toFixed(8)),
      takeProfits: takeProfits.map(tp => parseFloat(tp.toFixed(8))),
      riskRewardRatio,
      positionSizeAdvice,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Invalidation conditions
  // ───────────────────────────────────────────────────────────────────────────

  private static buildInvalidationConditions(
    price: number,
    ind: IndicatorResult,
    bias: TradeBias
  ): string[] {
    const conditions: string[] = [];

    if (bias === 'long') {
      if (ind.ma50 !== null) conditions.push(`Price closes below DEMA50 (${ind.ma50.toFixed(2)})`);
      if (ind.supportLevel !== null) conditions.push(`Price breaks below support (${ind.supportLevel.toFixed(2)})`);
      conditions.push('Volume decreases significantly on next up move (low conviction)');
      if (ind.rsi !== null) conditions.push(`RSI crosses above 75 without new price high (divergence)`);
    } else if (bias === 'short') {
      if (ind.ma50 !== null) conditions.push(`Price closes above DEMA50 (${ind.ma50.toFixed(2)})`);
      if (ind.resistanceLevel !== null) conditions.push(`Price breaks above resistance (${ind.resistanceLevel.toFixed(2)})`);
      conditions.push('Volume surges on an up move (short squeeze risk)');
      if (ind.rsi !== null) conditions.push(`RSI drops below 25 without new price low (divergence)`);
    }

    return conditions;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  private static aggregateNewsSentiment(items: { sentiment: SentimentLabel; sentimentScore: number }[]): SentimentLabel {
    const avg = items.reduce((sum, i) => sum + i.sentimentScore, 0) / items.length;
    if (avg > 0.1) return 'positive';
    if (avg < -0.1) return 'negative';
    return 'neutral';
  }

  private static buildMinimalSignal(symbol: string, price: number): SignalResult {
    return {
      symbol, price, trend: 'Neutral', confidence: 0, signalScore: 0, tradeBias: 'wait',
      indicators: {
        rsi: null, macdLine: null, macdSignal: null, macdHistogram: null,
        ma50: null, ma200: null, bbUpper: null, bbMiddle: null, bbLower: null,
        dema20: null, superTrend: null, superTrendDirection: null,
        volumeSpike: false, supportLevel: null, resistanceLevel: null,
        breakoutDetected: false, breakoutDirection: null,
      },
      fundamentalRating: null, newsSentiment: null, newsItems: [],
      reasoning: ['Insufficient data for analysis. Try again shortly.'],
      invalidationConditions: [],
      stopLoss: null, takeProfit: null, takeProfits: [], riskRewardRatio: null,
      positionSizeAdvice: 'No trade recommended — insufficient data',
      timeframe: '1d', timestamp: Date.now(),
    };
  }

  /**
   * Persist generated signal to the signals table.
   */
  private static async persistSignal(signal: SignalResult): Promise<number | null> {
    try {
      const [row] = await db('signals').insert({
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        trend: signal.trend,
        confidence: signal.confidence,
        signal_score: signal.signalScore,
        trade_bias: signal.tradeBias,
        rsi: signal.indicators.rsi,
        macd_line: signal.indicators.macdLine,
        macd_signal: signal.indicators.macdSignal,
        ma50: signal.indicators.ma50,
        ma200: signal.indicators.ma200,
        volume_spike: signal.indicators.volumeSpike,
        fundamental_rating: signal.fundamentalRating,
        news_sentiment: signal.newsSentiment,
        invalidation_conditions: JSON.stringify(signal.invalidationConditions),
        reasoning: signal.reasoning.join('\n'),
        stop_loss: signal.stopLoss,
        take_profit: signal.takeProfit,
        entry_price: signal.price,
        risk_reward_ratio: signal.riskRewardRatio,
      }).returning('id');

      log.info('Signal persisted to DB', { id: row?.id, symbol: signal.symbol });
      return row?.id ?? null;
    } catch (err) {
      log.error('Failed to persist signal', { error: (err as Error).message });
      return null;
    }
  }

  /**
   * Retrieve signal history for a symbol (most recent first).
   */
  static async getHistory(symbol: string, limit = 10): Promise<DbSignal[]> {
    return db('signals')
      .where('symbol', symbol.toUpperCase())
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
}
