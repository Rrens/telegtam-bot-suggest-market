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
} from 'technicalindicators';
import { OHLCVCandle, IndicatorResult } from '../types';

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

  // MA50 / MA200
  const ma50Values = SMA.calculate({ values: closes, period: 50 });
  const ma200Values = candles.length >= 200 ? SMA.calculate({ values: closes, period: 200 }) : [];

  const ma50 = ma50Values.length > 0 ? ma50Values[ma50Values.length - 1] : null;
  const ma200 = ma200Values.length > 0 ? ma200Values[ma200Values.length - 1] : null;

  // Bollinger Bands(20,2)
  const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const lastBb = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;

  // Volume spike: current volume > 2x 20-period average volume
  const last20Vols = volumes.slice(-20);
  const avgVol = last20Vols.reduce((a, b) => a + b, 0) / last20Vols.length;
  const currentVol = volumes[volumes.length - 1];
  const volumeSpike = currentVol > avgVol * 2.0;

  // Support & Resistance via pivot points (last 20 candles)
  const { support, resistance } = computeSupportResistance(highs, lows, closes, 20);

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
    volumeSpike,
    supportLevel: support,
    resistanceLevel: resistance,
    breakoutDetected,
    breakoutDirection,
  };
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
