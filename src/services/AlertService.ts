// ─────────────────────────────────────────────────────────────────────────────
// AlertService: Manages price alerts and triggers Telegram notifications.
// ─────────────────────────────────────────────────────────────────────────────

import { Bot } from 'grammy';
import { db } from '../db';
import { PriceService } from './PriceService';
import { log } from '../utils/logger';
import { DbAlert, DbAsset, PortfolioSummary, PortfolioAsset } from '../types';
import { formatPrice, formatPct } from '../utils/formatter';
import { sendNotification } from '../utils/notifier';
import { computeIndicators } from '../utils/indicators';
import { redis } from '../cache/redis';

export class AlertService {
  private static bot: Bot | null = null;

  static setBot(bot: Bot): void {
    this.bot = bot;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Alert CRUD
  // ───────────────────────────────────────────────────────────────────────────

  static async createAlert(
    userId: string,
    symbol: string,
    alertType: DbAlert['alert_type'],
    condition: DbAlert['condition'],
    targetValue: number
  ): Promise<DbAlert> {
    const [alert] = await db('alerts')
      .insert({
        user_id: userId,
        symbol: symbol.toUpperCase(),
        alert_type: alertType,
        condition,
        target_value: targetValue,
        active: true,
      })
      .returning('*');
    return alert;
  }

  static async listAlerts(userId: string): Promise<DbAlert[]> {
    return db('alerts').where({ user_id: userId, active: true }).orderBy('created_at', 'desc');
  }

  static async deactivateAlert(alertId: number, userId: string): Promise<boolean> {
    const count = await db('alerts').where({ id: alertId, user_id: userId }).update({ active: false });
    return count > 0;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Alert checking (called by background worker)
  // ───────────────────────────────────────────────────────────────────────────

  static async checkAllAlerts(): Promise<void> {
    if (!this.bot) return;

    const activeAlerts = await db('alerts').where({ active: true });
    if (activeAlerts.length === 0) return;

    // Separate price alerts from technical indicator alerts
    const priceAlerts = activeAlerts.filter((a: any) => !a.indicator);
    const techAlerts  = activeAlerts.filter((a: any) => !!a.indicator);

    // Group price alerts by symbol to minimize API calls
    const bySymbol = new Map<string, DbAlert[]>();
    for (const alert of priceAlerts) {
      const alerts = bySymbol.get(alert.symbol) ?? [];
      alerts.push(alert);
      bySymbol.set(alert.symbol, alerts);
    }

    // Check each price symbol
    for (const [symbol, alerts] of bySymbol) {
      try {
        const price = await PriceService.getPrice(symbol);
        await this.evaluateAlertsForSymbol(symbol, price.price, price.change24h, alerts);
      } catch (err) {
        log.warn('AlertService: price fetch failed for alert check', { symbol, error: (err as Error).message });
      }
    }

    // Check technical indicator alerts
    if (techAlerts.length > 0) {
      await this.checkTechnicalAlerts(techAlerts);
    }
  }

  /**
   * Evaluate technical indicator alerts (RSI, MA Cross).
   */
  private static async checkTechnicalAlerts(alerts: any[]): Promise<void> {
    // Group by symbol to share OHLCV fetch
    const bySymbol = new Map<string, any[]>();
    for (const alert of alerts) {
      const list = bySymbol.get(alert.symbol) ?? [];
      list.push(alert);
      bySymbol.set(alert.symbol, list);
    }

    for (const [symbol, symbolAlerts] of bySymbol) {
      try {
        const candles = await PriceService.getOHLCV(symbol, '1d', 250);
        if (candles.length < 50) continue;

        const ind = computeIndicators(candles);

        for (const alert of symbolAlerts) {
          // Cooldown: don't re-fire the same technical alert within 6 hours
          const cooldownKey = `tech_alert_cd:${alert.id}`;
          const onCooldown = await redis.get(cooldownKey);
          if (onCooldown) continue;

          let triggered = false;
          let message = '';

          if (alert.indicator === 'rsi' && ind.rsi !== null) {
            const target = parseFloat(alert.target_value);
            if (alert.condition === 'lte' && ind.rsi <= target) {
              triggered = true;
              message = [
                `📊 <b>RSI Alert Triggered!</b>`,
                ``,
                `<b>${symbol}</b>`,
                `RSI saat ini: <b>${ind.rsi.toFixed(1)}</b> ≤ ${target}`,
                `🟢 <b>Zona OVERSOLD</b> — Potensi reversal ke atas!`,
                ``,
                `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
              ].join('\n');
            } else if (alert.condition === 'gte' && ind.rsi >= target) {
              triggered = true;
              message = [
                `📊 <b>RSI Alert Triggered!</b>`,
                ``,
                `<b>${symbol}</b>`,
                `RSI saat ini: <b>${ind.rsi.toFixed(1)}</b> ≥ ${target}`,
                `🔴 <b>Zona OVERBOUGHT</b> — Pertimbangkan take profit!`,
                ``,
                `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
              ].join('\n');
            }
          }

          if (alert.indicator === 'ma_cross' && ind.ma50 !== null && ind.ma200 !== null) {
            // Detect cross by comparing previous candle indicators
            if (candles.length >= 51) {
              const prevCandles = candles.slice(0, -1);
              const prevInd = computeIndicators(prevCandles);
              if (prevInd.ma50 !== null && prevInd.ma200 !== null) {
                const wasBelow = prevInd.ma50 < prevInd.ma200;
                const nowAbove = ind.ma50 > ind.ma200;
                const wasAbove = prevInd.ma50 > prevInd.ma200;
                const nowBelow = ind.ma50 < ind.ma200;

                if (wasBelow && nowAbove) {
                  triggered = true;
                  message = [
                    `✨ <b>GOLDEN CROSS DETECTED!</b> ✨`,
                    ``,
                    `<b>${symbol}</b>`,
                    `MA50 telah melintasi MA200 ke atas.`,
                    ``,
                    `📈 Ini adalah sinyal <b>bullish jangka panjang</b> yang kuat!`,
                    `MA50: <b>${ind.ma50.toFixed(2)}</b>`,
                    `MA200: <b>${ind.ma200.toFixed(2)}</b>`,
                    ``,
                    `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
                  ].join('\n');
                } else if (wasAbove && nowBelow) {
                  triggered = true;
                  message = [
                    `💀 <b>DEATH CROSS DETECTED!</b> 💀`,
                    ``,
                    `<b>${symbol}</b>`,
                    `MA50 telah melintasi MA200 ke bawah.`,
                    ``,
                    `📉 Ini adalah sinyal <b>bearish jangka panjang</b> yang kuat!`,
                    `MA50: <b>${ind.ma50.toFixed(2)}</b>`,
                    `MA200: <b>${ind.ma200.toFixed(2)}</b>`,
                    ``,
                    `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
                  ].join('\n');
                }
              }
            }
          }

          if (triggered && message) {
            await this.fireTechnicalAlert(alert, message);
          }
        }
      } catch (err) {
        log.warn('AlertService: technical alert check failed', { symbol, error: (err as Error).message });
      }
    }
  }

  private static async fireTechnicalAlert(alert: any, message: string): Promise<void> {
    if (!this.bot) return;
    try {
      await sendNotification(this.bot, alert.user_id, message, { pin: false });

      // Set 6-hour cooldown (alert stays active for repeated future signals)
      await redis.setex(`tech_alert_cd:${alert.id}`, 21600, '1');

      log.info('Technical alert fired', { alertId: alert.id, indicator: alert.indicator });
    } catch (err) {
      log.error('Failed to send technical alert', { error: (err as Error).message });
    }
  }

  private static async evaluateAlertsForSymbol(
    symbol: string,
    currentPrice: number,
    change24h: number,
    alerts: DbAlert[]
  ): Promise<void> {
    for (const alert of alerts) {
      let triggered = false;
      let message = '';

      if (alert.alert_type === 'price_target') {
        const target = parseFloat(alert.target_value.toString());
        const isUp = currentPrice >= target;
        const trendIcon = isUp ? '🟢' : '🔴';
        const event = isUp ? 'MELAMPAUI' : 'TURUN DI BAWAH';
        
        if ((alert.condition === 'gte' && currentPrice >= target) || (alert.condition === 'lte' && currentPrice <= target)) {
          triggered = true;
          message = [
            `🔔 <b>PRICE ALERT TRIGGERED</b> 🔔`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `<b>Asset:</b> ${symbol}`,
            `<b>Event:</b> Harga <b>${event}</b> target!`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `💰 Harga Sekarang: <b>${formatPrice(currentPrice)}</b>`,
            `🎯 Harga Target: <b>${formatPrice(target)}</b>`,
            ``,
            `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
          ].join('\n');
        }
      } else if (alert.alert_type === 'pct_change') {
        const targetPct = parseFloat(alert.target_value.toString());
        const isUp = change24h >= 0;
        const trendIcon = isUp ? '🚀' : '📉';
        const direction = isUp ? 'NAIK' : 'TURUN';
        
        if ((alert.condition === 'gte' && change24h >= targetPct) || (alert.condition === 'lte' && change24h <= targetPct)) {
          triggered = true;
          message = [
            `🔔 <b>% CHANGE ALERT</b> 🔔`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `<b>Asset:</b> ${symbol}`,
            `<b>Event:</b> Pergerakan <b>${direction}</b> signifikan!`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `💰 Harga Sekarang: <b>${formatPrice(currentPrice)}</b>`,
            `📊 Perubahan 24j: <b>${formatPct(change24h)}</b>`,
            `🎯 Threshold: ${formatPct(targetPct)}`,
            ``,
            `<i>Ketik /predict ${symbol} untuk analisis lengkap.</i>`,
          ].join('\n');
        }
      }

      if (triggered) {
        await this.fireAlert(alert, message);
      }
    }
  }

  private static async fireAlert(alert: DbAlert, message: string): Promise<void> {
    if (!this.bot) return;

    try {
      await sendNotification(this.bot, alert.user_id, message, { pin: true });

      // Deactivate alert after triggering (one-shot)
      await db('alerts').where({ id: alert.id }).update({
        active: false,
        triggered_at: new Date(),
      });

      log.info('Alert fired', { alertId: alert.id, userId: alert.user_id, symbol: alert.symbol });
    } catch (err) {
      log.error('Failed to send alert notification', { error: (err as Error).message });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // News alert management
  // ───────────────────────────────────────────────────────────────────────────

  static async createNewsAlert(userId: string, symbol: string): Promise<void> {
    await db('news_alerts')
      .insert({ user_id: userId, symbol: symbol.toUpperCase(), active: true })
      .onConflict(['user_id', 'symbol'])
      .merge({ active: true });
  }

  static async removeNewsAlert(userId: string, symbol: string): Promise<void> {
    await db('news_alerts').where({ user_id: userId, symbol: symbol.toUpperCase() }).update({ active: false });
  }

  static async getActiveNewsAlerts(): Promise<{ userId: string; symbol: string; lastAlerted: Date | null }[]> {
    const rows = await db('news_alerts').where({ active: true });
    return rows.map((r: any) => ({
      userId: String(r.user_id),
      symbol: r.symbol,
      lastAlerted: r.last_alerted ? new Date(r.last_alerted) : null,
    }));
  }

  static async updateNewsAlertTimestamp(userId: string, symbol: string): Promise<void> {
    await db('news_alerts').where({ user_id: userId, symbol }).update({ last_alerted: new Date() });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Portfolio summary (used by /portfolio command)
  // ───────────────────────────────────────────────────────────────────────────

  static async buildPortfolio(userId: string): Promise<PortfolioSummary> {
    const assets: DbAsset[] = await db('assets').where({ user_id: userId });

    if (assets.length === 0) {
      return { totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPct: 0, assets: [] };
    }

    const portfolioAssets: PortfolioAsset[] = [];
    let totalValue = 0;
    let totalCost = 0;

    for (const asset of assets) {
      let currentPrice = 0;
      try {
        const priceData = await PriceService.getPrice(asset.symbol);
        currentPrice = priceData.price;
      } catch {
        log.warn('Portfolio: price fetch failed', { symbol: asset.symbol });
      }

      const amount = parseFloat(asset.amount.toString());
      const avgPrice = parseFloat(asset.avg_price.toString());
      const value = amount * currentPrice;
      const cost = amount * avgPrice;
      const pnl = value - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

      // Currency handling: Convert everything to USD for totals
      const currency = asset.symbol.toUpperCase().endsWith('.JK') ? 'IDR' : 'USD';
      if (currency === 'IDR') {
        const rate = PriceService.getLastUsdIdrRate();
        totalValue += value / rate;
        totalCost += cost / rate;
      } else {
        totalValue += value;
        totalCost += cost;
      }

      portfolioAssets.push({ 
        symbol: asset.symbol, 
        amount, 
        avgPrice, 
        currentPrice, 
        value, 
        pnl, 
        pnlPct,
        currency 
      } as any); // Using any to avoid type error until types are updated
    }

    const totalPnL = totalValue - totalCost;
    const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPnL, totalPnLPct, assets: portfolioAssets };
  }
}
