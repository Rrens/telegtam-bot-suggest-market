// ─────────────────────────────────────────────────────────────────────────────
// Pure technical analysis math functions
// Wrappers around the 'technicalindicators' library + custom implementations
// ─────────────────────────────────────────────────────────────────────────────

import {
  RSI,
  MACD,
  BollingerBands,
  SMA,
  EMA,
  ATR,
} from 'technicalindicators';
import { OHLCVCandle, IndicatorResult } from '../types';
import { log } from './logger';

/**
 * Compute all technical indicators from OHLCV candle data.
 */
export function computeIndicators(candles: OHLCVCandle[]): IndicatorResult {
  if (candles.length < 50) {
    return emptyIndicators();
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // RSI(14)
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

  // MACD(12,26,9)
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const lastMacd = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;

  // DEMA 50 / DEMA 200 (Manual calculation since library lacks them)
  const ma50 = calculateDEMA(closes, 50);
  const ma200 = calculateDEMA(closes, 200);

  const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const lastBb = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;

  // DEMA(20) Manual Calculation: DEMA = 2*EMA - EMA(EMA)
  let lastDema: number | null = null;
  try {
    const ema20 = EMA.calculate({ values: closes, period: 20 });
    if (ema20.length > 20) {
      const emaEma20 = EMA.calculate({ values: ema20, period: 20 });
      if (emaEma20.length > 0) {
        const lastEma = ema20[ema20.length - 1];
        const lastEmaEma = emaEma20[emaEma20.length - 1];
        lastDema = 2 * lastEma - lastEmaEma;
      }
    }
  } catch (e) {
    log.warn('Manual DEMA calculation failed', { error: (e as Error).message });
  }

  // Volume spike: current volume > 2x 20-period average volume
  const last20Vols = volumes.slice(-20);
  const avgVol = last20Vols.reduce((a, b) => a + b, 0) / last20Vols.length;
  const currentVol = volumes[volumes.length - 1];
  const volumeSpike = currentVol > avgVol * 2.0;

  // Support & Resistance via pivot points (last 20 candles)
  const { support, resistance } = computeSupportResistance(highs, lows, closes, 20);

  // SuperTrend (10, 3)
  const { superTrend, superTrendDirection } = computeSuperTrend(candles, 10, 3);

  // Breakout detection
  const currentPrice = closes[closes.length - 1];
  const { breakoutDetected, breakoutDirection } = detectBreakout(
    currentPrice,
    resistance,
    support,
    volumeSpike
  );

  return {
    rsi,
    macdLine: lastMacd?.MACD ?? null,
    macdSignal: lastMacd?.signal ?? null,
    macdHistogram: lastMacd?.histogram ?? null,
    ma50,
    ma200,
    bbUpper: lastBb?.upper ?? null,
    bbMiddle: lastBb?.middle ?? null,
    bbLower: lastBb?.lower ?? null,
    dema20: lastDema,
    superTrend,
    superTrendDirection,
    volumeSpike,
    supportLevel: support,
    resistanceLevel: resistance,
    breakoutDetected,
    breakoutDirection,
  };
}

/**
 * Calculate DEMA (Double Exponential Moving Average)
 * Formula: DEMA = 2*EMA - EMA(EMA)
 */
export function calculateDEMA(values: number[], period: number): number | null {
  if (values.length < period * 2) return null; // Need enough data for stable double EMA
  try {
    const emaValues = EMA.calculate({ values, period });
    if (emaValues.length < period) return null;
    
    const emaEmaValues = EMA.calculate({ values: emaValues, period });
    if (emaEmaValues.length === 0) return null;

    const lastEma = emaValues[emaValues.length - 1];
    const lastEmaEma = emaEmaValues[emaEmaValues.length - 1];

    return 2 * lastEma - lastEmaEma;
  } catch (e) {
    return null;
  }
}

/**
 * Calculate DEMA series for charting
 */
export function calculateDEMAFull(values: number[], period: number): (number | null)[] {
  if (values.length < period) return new Array(values.length).fill(null);
  try {
    const emaValues = EMA.calculate({ values, period });
    const emaEmaValues = EMA.calculate({ values: emaValues, period });
    
    const results: (number | null)[] = new Array(values.length).fill(null);
    const emaOffset = values.length - emaValues.length;
    const emaEmaOffset = emaValues.length - emaEmaValues.length;
    
    for (let i = 0; i < emaEmaValues.length; i++) {
      const emaIdx = i + emaEmaOffset;
      const valIdx = emaIdx + emaOffset;
      results[valIdx] = 2 * emaValues[emaIdx] - emaEmaValues[i];
    }
    
    return results;
  } catch (e) {
    return new Array(values.length).fill(null);
  }
}

/**
 * SuperTrend Indicator Calculation (Returns only the latest value)
 */
export function computeSuperTrend(candles: OHLCVCandle[], period: number, multiplier: number): { superTrend: number | null, superTrendDirection: 'up' | 'down' | null } {
  const series = computeSuperTrendFull(candles, period, multiplier);
  if (series.length === 0) return { superTrend: null, superTrendDirection: null };
  return series[series.length - 1];
}

/**
 * SuperTrend Indicator Calculation (Returns the full series for charting)
 */
export function computeSuperTrendFull(candles: OHLCVCandle[], period: number, multiplier: number): { superTrend: number | null, superTrendDirection: 'up' | 'down' | null }[] {
  if (candles.length <= period) return [];

  const atrValues = ATR.calculate({
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    period
  });

  const n = candles.length;
  const startIdx = n - atrValues.length;
  
  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let prevST = 0;
  const results: { superTrend: number | null, superTrendDirection: 'up' | 'down' | null }[] = [];

  // We need to iterate to get the final values correctly
  for (let i = 0; i < atrValues.length; i++) {
    const candleIdx = startIdx + i;
    const candle = candles[candleIdx];
    const prevCandle = candles[candleIdx - 1];
    const atr = atrValues[i];

    const basicUpper = (candle.high + candle.low) / 2 + multiplier * atr;
    const basicLower = (candle.high + candle.low) / 2 - multiplier * atr;

    const finalUpper = (basicUpper < prevFinalUpper || (prevCandle && prevCandle.close > prevFinalUpper)) ? basicUpper : prevFinalUpper;
    const finalLower = (basicLower > prevFinalLower || (prevCandle && prevCandle.close < prevFinalLower)) ? basicLower : prevFinalLower;

    let currentST = 0;
    if (prevST === prevFinalUpper) {
      currentST = candle.close > finalUpper ? finalLower : finalUpper;
    } else {
      currentST = candle.close < finalLower ? finalUpper : finalLower;
    }

    const direction = candle.close > currentST ? 'up' : 'down';
    
    results.push({
      superTrend: parseFloat(currentST.toFixed(8)),
      superTrendDirection: direction
    });

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevST = currentST;
  }

  return results;
}

/**
 * Detect support and resistance via pivot point method.
 * Uses the last N candles to find swing high / swing low.
 */
function computeSupportResistance(
  highs: number[],
  lows: number[],
  closes: number[],
  lookback: number
): { support: number | null; resistance: number | null } {
  const n = Math.min(lookback, highs.length);
  const recentHighs = highs.slice(-n);
  const recentLows = lows.slice(-n);

  const support = Math.min(...recentLows);
  const resistance = Math.max(...recentHighs);

  return { support, resistance };
}

/**
 * Breakout: price closes beyond resistance/support with volume confirmation.
 */
function detectBreakout(
  price: number,
  resistance: number | null,
  support: number | null,
  volumeSpike: boolean
): { breakoutDetected: boolean; breakoutDirection: 'up' | 'down' | null } {
  if (!resistance && !support) return { breakoutDetected: false, breakoutDirection: null };

  const threshold = 0.005; // 0.5% beyond level

  if (resistance && price > resistance * (1 + threshold) && volumeSpike) {
    return { breakoutDetected: true, breakoutDirection: 'up' };
  }
  if (support && price < support * (1 - threshold) && volumeSpike) {
    return { breakoutDetected: true, breakoutDirection: 'down' };
  }

  return { breakoutDetected: false, breakoutDirection: null };
}

function emptyIndicators(): IndicatorResult {
  return {
    rsi: null,
    macdLine: null,
    macdSignal: null,
    macdHistogram: null,
    ma50: null,
    ma200: null,
    bbUpper: null,
    bbMiddle: null,
    bbLower: null,
    dema20: null,
    superTrend: null,
    superTrendDirection: null,
    volumeSpike: false,
    supportLevel: null,
    resistanceLevel: null,
    breakoutDetected: false,
    breakoutDirection: null,
  };
}

/**
 * Aggregate 1-minute candles into higher timeframe candles.
 */
export function aggregateCandles(candles: OHLCVCandle[], periodMinutes: number): OHLCVCandle[] {
  const result: OHLCVCandle[] = [];
  const periodMs = periodMinutes * 60 * 1000;

  let i = 0;
  while (i < candles.length) {
    const bucket: OHLCVCandle[] = [];
    const startTime = Math.floor(candles[i].time / periodMs) * periodMs;

    while (i < candles.length && candles[i].time < startTime + periodMs) {
      bucket.push(candles[i]);
      i++;
    }

    if (bucket.length > 0) {
      result.push({
        time: startTime,
        open: bucket[0].open,
        high: Math.max(...bucket.map((c) => c.high)),
        low: Math.min(...bucket.map((c) => c.low)),
        close: bucket[bucket.length - 1].close,
        volume: bucket.reduce((sum, c) => sum + c.volume, 0),
      });
    }
  }

  return result;
}
