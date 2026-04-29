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

    // Group alerts by symbol to minimize API calls
    const bySymbol = new Map<string, DbAlert[]>();
    for (const alert of activeAlerts) {
      const alerts = bySymbol.get(alert.symbol) ?? [];
      alerts.push(alert);
      bySymbol.set(alert.symbol, alerts);
    }

    // Check each symbol
    for (const [symbol, alerts] of bySymbol) {
      try {
        const price = await PriceService.getPrice(symbol);
        await this.evaluateAlertsForSymbol(symbol, price.price, price.change24h, alerts);
      } catch (err) {
        log.warn('AlertService: price fetch failed for alert check', { symbol, error: (err as Error).message });
      }
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
        if (alert.condition === 'gte' && currentPrice >= target) {
          triggered = true;
          message = `🔔 <b>Price Alert Triggered</b>\n\n${symbol} reached ${formatPrice(currentPrice)} (target: ${formatPrice(target)})`;
        } else if (alert.condition === 'lte' && currentPrice <= target) {
          triggered = true;
          message = `🔔 <b>Price Alert Triggered</b>\n\n${symbol} dropped to ${formatPrice(currentPrice)} (target: ${formatPrice(target)})`;
        }
      } else if (alert.alert_type === 'pct_change') {
        const targetPct = parseFloat(alert.target_value.toString());
        if (alert.condition === 'gte' && change24h >= targetPct) {
          triggered = true;
          message = `🔔 <b>% Change Alert</b>\n\n${symbol} is up ${formatPct(change24h)} in 24h (threshold: ${formatPct(targetPct)})`;
        } else if (alert.condition === 'lte' && change24h <= targetPct) {
          triggered = true;
          message = `🔔 <b>% Change Alert</b>\n\n${symbol} is down ${formatPct(change24h)} in 24h (threshold: ${formatPct(targetPct)})`;
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
      await sendNotification(this.bot, alert.user_id, message);

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
