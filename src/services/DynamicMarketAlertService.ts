// ─────────────────────────────────────────────────────────────────────────────
// DynamicMarketAlertService: Automatically monitors top assets and user 
// portfolio assets for significant price movements.
// ─────────────────────────────────────────────────────────────────────────────

import { Bot } from 'grammy';
import { db } from '../db';
import { redis } from '../cache/redis';
import { PriceService } from './PriceService';
import { log } from '../utils/logger';
import { sendNotification } from '../utils/notifier';
import { formatPrice, formatPct } from '../utils/formatter';

const TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const TOP_STOCKS = ['BBCA.JK', 'BBRI.JK', 'BBNI.JK', 'BMRI.JK', 'BUMI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK'];

export class DynamicMarketAlertService {
  private static bot: Bot | null = null;

  static setBot(bot: Bot): void {
    this.bot = bot;
  }

  /**
   * Main entry point for the background worker.
   */
  static async checkDynamicAlerts(): Promise<void> {
    if (!this.bot) return;

    try {
      // 1. Collect all unique symbols to monitor
      const userAssets = await db('assets').select('symbol').distinct();
      const userSymbols = userAssets.map(a => a.symbol.toUpperCase());
      
      const allSymbols = Array.from(new Set([...TOP_CRYPTO, ...TOP_STOCKS, ...userSymbols]));
      
      log.info(`DynamicAlerts: Checking ${allSymbols.length} unique symbols`);

      for (const symbol of allSymbols) {
        try {
          const priceData = await PriceService.getPrice(symbol);
          await this.evaluateSymbol(symbol, priceData.price, priceData.change24h);
        } catch (err) {
          log.warn(`DynamicAlerts: Failed to fetch price for ${symbol}`, { error: (err as Error).message });
        }
      }
    } catch (err) {
      log.error('DynamicAlerts: Execution failed', { error: (err as Error).message });
    }
  }

  /**
   * Evaluates if a symbol warrants an alert.
   */
  private static async evaluateSymbol(symbol: string, price: number, change24h: number): Promise<void> {
    const isTopAsset = TOP_CRYPTO.includes(symbol) || TOP_STOCKS.includes(symbol);
    const lastPriceKey = `dynamic_alert:last_price:${symbol}`;
    const lastPriceStr = await redis.get(lastPriceKey);
    const lastPrice = lastPriceStr ? parseFloat(lastPriceStr) : null;

    // 1. Initial run: save current price and return
    if (lastPrice === null) {
      await redis.set(lastPriceKey, price);
      return;
    }

    let alertTriggered = false;
    let reason = '';
    let emoji = '⚡';
    const isUp = price > lastPrice;

    // 2. Check for Percentage Threshold (5%)
    const pctDiff = Math.abs((price - lastPrice) / lastPrice) * 100;
    if (pctDiff >= 5) {
      alertTriggered = true;
      const direction = isUp ? 'NAIK' : 'TURUN';
      reason = `Pergerakan <b>${direction}</b> drastis <b>${pctDiff.toFixed(1)}%</b> sejak update terakhir!`;
      emoji = isUp ? '🚀' : '📉';
    }

    // 3. Check for Psychological Thresholds (Crossing big numbers)
    if (!alertTriggered) {
      const threshold = this.getPsychologicalThreshold(symbol, price);
      if (threshold > 0) {
        const lastStep = Math.floor(lastPrice / threshold);
        const currentStep = Math.floor(price / threshold);
        
        if (currentStep !== lastStep) {
          alertTriggered = true;
          const direction = currentStep > lastStep ? 'NAIK melampaui' : 'TURUN di bawah';
          const level = currentStep > lastStep ? currentStep * threshold : lastStep * threshold;
          reason = `Harga <b>${direction}</b> level psikologis <b>${formatPrice(level, symbol)}</b>`;
          emoji = currentStep > lastStep ? '🔥' : '⚠️';
        }
      }
    }

    if (alertTriggered) {
      await this.dispatchAlert(symbol, price, lastPrice, change24h, reason, emoji);
      // Update last price in redis to prevent double alerts
      await redis.set(lastPriceKey, price);
    }
  }

  /**
   * Returns the "rounding step" for a symbol.
   * e.g. BTC every $1000, ETH every $100, Stocks every Rp500.
   */
  private static getPsychologicalThreshold(symbol: string, price: number): number {
    if (symbol === 'BTCUSDT') return 1000;
    if (symbol === 'ETHUSDT') return 100;
    if (symbol.endsWith('.JK') || symbol.endsWith('.ID')) {
      if (price > 10000) return 1000;
      if (price > 1000) return 500;
      return 100;
    }
    return 0; // No threshold alert for others
  }

  /**
   * Sends the alert to appropriate recipients.
   */
  private static async dispatchAlert(symbol: string, price: number, lastPrice: number, change24h: number, reason: string, emoji: string): Promise<void> {
    if (!this.bot) return;

    const isTopAsset = TOP_CRYPTO.includes(symbol) || TOP_STOCKS.includes(symbol);
    const isUp = price > lastPrice;
    const trendIcon = isUp ? '🟢' : '🔴';
    const trendText = isUp ? 'BULLISH MOMENTUM' : 'BEARISH MOMENTUM';

    const message = [
      `${emoji} <b>MARKET MOMENTUM: ${symbol}</b> ${emoji}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `<b>Status:</b> ${trendIcon} ${trendText}`,
      `<b>Info:</b> ${reason}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `💰 Harga Saat Ini: <b>${formatPrice(price, symbol)}</b>`,
      `📊 Perubahan 24h: <b>${formatPct(change24h)}</b>`,
      ``,
      `<i>Sent by AI Market Monitor</i>`
    ].join('\n');

    // 1. Broadcast to channel if it's a Top Asset
    if (isTopAsset) {
      await sendNotification(this.bot, 'system', message, { pin: false });
    }

    // 2. Send to specific users who own this asset (Private DM)
    const owners = await db('assets').where({ symbol }).select('user_id').distinct();
    for (const owner of owners) {
      try {
        const portfolioMsg = [
          `🎯 <b>Portfolio Alert: ${symbol}</b>`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `${trendIcon} ${reason}`,
          `💰 Harga: <b>${formatPrice(price, symbol)}</b>`,
          `📉 Prev: ${formatPrice(lastPrice, symbol)}`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `<i>Check your portfolio for details.</i>`
        ].join('\n');
        
        await this.bot.api.sendMessage(owner.user_id, portfolioMsg, { parse_mode: 'HTML' });
      } catch (err) {
        // User might have blocked the bot
      }
    }
  }
}
