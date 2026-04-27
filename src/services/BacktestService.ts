// ─────────────────────────────────────────────────────────────────────────────
// BacktestService: Replays stored signals against historical prices.
// Evaluates signal outcomes and computes win rate, avg return, best/worst.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../db';
import { PriceService } from './PriceService';
import { log } from '../utils/logger';
import { BacktestResult, BacktestSignalEntry, DbSignal, SignalOutcome } from '../types';

// Hold period in days for evaluating signal outcomes
const HOLD_PERIOD_DAYS = 3;

export class BacktestService {
  /**
   * Run a backtest for a given symbol using stored signals.
   */
  static async backtest(symbol: string): Promise<BacktestResult> {
    const signals: DbSignal[] = await db('signals')
      .where('symbol', symbol.toUpperCase())
      .orderBy('created_at', 'desc')
      .limit(50);

    if (signals.length === 0) {
      return this.emptyResult(symbol);
    }

    // Fetch historical candles for price lookup
    let historicalPrices: Map<number, number> = new Map();
    try {
      const candles = await PriceService.getOHLCV(symbol, '1d', 200);
      candles.forEach((c) => historicalPrices.set(c.time, c.close));
    } catch {
      log.warn('BacktestService: could not fetch historical data', { symbol });
    }

    const entries: BacktestSignalEntry[] = [];

    for (const signal of signals) {
      const signalDate = new Date(signal.created_at);
      const exitDate = new Date(signalDate);
      exitDate.setDate(exitDate.getDate() + HOLD_PERIOD_DAYS);

      const entryPrice = signal.entry_price ? parseFloat(signal.entry_price.toString()) : null;
      let exitPrice: number | null = null;
      let outcome: SignalOutcome = 'pending';
      let returnPct: number | null = null;

      // Find exit price from historical data
      if (entryPrice && historicalPrices.size > 0) {
        const exitTimestamp = this.findClosestTimestamp(historicalPrices, exitDate.getTime());
        if (exitTimestamp !== null) {
          exitPrice = historicalPrices.get(exitTimestamp) ?? null;
        }

        if (exitPrice && entryPrice) {
          returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;

          const isLong = signal.trade_bias === 'long';
          const isShort = signal.trade_bias === 'short';
          const isWin =
            (isLong && returnPct > 0) ||
            (isShort && returnPct < 0);

          outcome = exitDate <= new Date() ? (isWin ? 'win' : 'loss') : 'pending';

          // For shorts, return is inverse
          if (isShort && returnPct !== null) {
            returnPct = -returnPct;
          }
        }
      }

      // Update DB with resolved outcome
      if (outcome !== 'pending') {
        await db('signal_history')
          .where({ signal_id: signal.id })
          .update({ outcome, exit_price: exitPrice, return_pct: returnPct, resolved_at: new Date() })
          .catch(() => {});
      }

      entries.push({
        date: signalDate,
        trend: signal.trend as any,
        confidence: parseFloat(signal.confidence.toString()),
        entryPrice,
        exitPrice,
        returnPct,
        outcome,
      });
    }

    // Compute stats
    const resolved = entries.filter((e) => e.outcome !== 'pending');
    const wins = entries.filter((e) => e.outcome === 'win');
    const losses = entries.filter((e) => e.outcome === 'loss');
    const pending = entries.filter((e) => e.outcome === 'pending');

    const winRate = resolved.length > 0 ? wins.length / resolved.length : 0;
    const returns = resolved.map((e) => e.returnPct ?? 0);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const bestReturn = returns.length > 0 ? Math.max(...returns) : 0;
    const worstReturn = returns.length > 0 ? Math.min(...returns) : 0;

    return {
      symbol: symbol.toUpperCase(),
      totalSignals: signals.length,
      winCount: wins.length,
      lossCount: losses.length,
      pendingCount: pending.length,
      winRate,
      avgReturn,
      bestReturn,
      worstReturn,
      signals: entries,
    };
  }

  /**
   * Find the closest timestamp in historical data map to a target date.
   */
  private static findClosestTimestamp(map: Map<number, number>, targetMs: number): number | null {
    let closest: number | null = null;
    let minDiff = Infinity;

    for (const ts of map.keys()) {
      const diff = Math.abs(ts - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = ts;
      }
    }

    return closest;
  }

  private static emptyResult(symbol: string): BacktestResult {
    return {
      symbol, totalSignals: 0, winCount: 0, lossCount: 0, pendingCount: 0,
      winRate: 0, avgReturn: 0, bestReturn: 0, worstReturn: 0, signals: [],
    };
  }
}
