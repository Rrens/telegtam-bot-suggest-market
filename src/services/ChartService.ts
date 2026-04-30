// ─────────────────────────────────────────────────────────────────────────────
// ChartService: Generates price chart images using @napi-rs/canvas.
// Produces a clean dark-theme price chart with MA20/MA50 overlays and volume bars.
// ─────────────────────────────────────────────────────────────────────────────

import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { OHLCVCandle, IndicatorResult } from '../types';
import { SMA, RSI } from 'technicalindicators';
import { log } from '../utils/logger';
import { computeSuperTrendFull, calculateDEMAFull } from '../utils/indicators';

const WIDTH = 900;
const HEIGHT = 650; // Increased height to accommodate RSI
const PADDING = { top: 40, right: 20, bottom: 60, left: 80 };
const CHART_H = HEIGHT - PADDING.top - PADDING.bottom;
const CHART_W = WIDTH - PADDING.left - PADDING.right;

const RSI_H = 80; // height of RSI panel
const VOL_H = 60; // volume panel height
const PRICE_H = CHART_H - VOL_H - RSI_H - 40; // remaining space for price

export class ChartService {
  /**
   * Generate a price chart with MA20, MA50 overlays and volume bars.
   * Returns a PNG Buffer or null if generation fails.
   */
  static async generateChart(
    symbol: string,
    candles: OHLCVCandle[],
    indicators: IndicatorResult
  ): Promise<Buffer | null> {
    if (candles.length < 20) return null;

    try {
      const data = candles.slice(-80);
      const closes = data.map((c) => c.close);
      const volumes = data.map((c) => c.volume);
      const n = data.length;

      // Compute MAs (Switching to DEMA to match analysis)
      const dema20 = calculateDEMAFull(closes, 20);
      const dema50 = calculateDEMAFull(closes, 50);

      // Price range calculation (Safe against empty arrays)
      const allHighs = data.map((c) => c.high);
      const allLows = data.map((c) => c.low);
      
      const maValues = [
        ...(dema20.filter(v => v !== null) as number[]),
        ...(dema50.filter(v => v !== null) as number[])
      ];

      const priceMax = Math.max(...allHighs, ...maValues);
      const priceMin = Math.min(...allLows, ...maValues.length > 0 ? maValues : allLows);
      
      const priceRange = priceMax - priceMin;
      const pricePad = priceRange > 0 ? priceRange * 0.1 : 1;
      const yMax = priceMax + pricePad;
      const yMin = Math.max(0, priceMin - pricePad);

      // Compute RSI
      const rsiRaw = RSI.calculate({ values: closes, period: 14 });
      const rsi: (number | null)[] = [...new Array(n - rsiRaw.length).fill(null), ...rsiRaw];

      // Compute SuperTrend
      const stFull = computeSuperTrendFull(candles, 10, 3);
      // Slice the last N values of superTrend to match chart data
      const stSliced = stFull.slice(-n);
      const superTrendSeries = [...new Array(n - stSliced.length).fill(null), ...stSliced];

      // Volume range
      const volMax = Math.max(...volumes);

      const canvas = createCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext('2d');

      // ── Background ────────────────────────────────────────────────────────
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // ── Grid ──────────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      const yLines = 6;
      for (let i = 0; i <= yLines; i++) {
        const y = PADDING.top + (PRICE_H / yLines) * i;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(PADDING.left + CHART_W, y);
        ctx.stroke();
      }

      // ── Title ─────────────────────────────────────────────────────────────
      ctx.fillStyle = '#f9fafb';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${symbol} — Price Chart`, PADDING.left, 24);

      // ── Y-axis labels (price) ──────────────────────────────────────────────
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i <= yLines; i++) {
        const price = yMax - ((yMax - yMin) / yLines) * i;
        const y = PADDING.top + (PRICE_H / yLines) * i;
        ctx.fillText(this.formatPrice(price), PADDING.left - 6, y + 4);
      }
      ctx.textAlign = 'left';

      // ── Candlesticks ──────────────────────────────────────────────────────
      const candleW = Math.max(2, Math.floor((CHART_W / n) * 0.6));
      const gap = CHART_W / n;

      const toY = (price: number) =>
        PADDING.top + PRICE_H - ((price - yMin) / (yMax - yMin)) * PRICE_H;

      for (let i = 0; i < n; i++) {
        const c = data[i];
        const x = PADDING.left + i * gap + gap * 0.2;
        const bullish = c.close >= c.open;

        // Wick
        ctx.strokeStyle = bullish ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + candleW / 2, toY(c.high));
        ctx.lineTo(x + candleW / 2, toY(c.low));
        ctx.stroke();

        // Body
        ctx.fillStyle = bullish ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.85)';
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyBot - bodyTop);
        ctx.fillRect(x, bodyTop, candleW, bodyH);
      }

      // ── DEMA lines ──────────────────────────────────────────────────────────
      this.drawLine(ctx, dema20, gap, candleW, toY, '#facc15', 1.5);
      this.drawLine(ctx, dema50, gap, candleW, toY, '#60a5fa', 1.5);

      // ── SuperTrend line ───────────────────────────────────────────────────
      this.drawSuperTrend(ctx, superTrendSeries, gap, candleW, toY);

      // ── Legend ─────────────────────────────────────────────────────────────
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.fillRect(PADDING.left + 8, PADDING.top + 8, 16, 3);
      ctx.fillStyle = '#d1d5db';
      ctx.fillText('MA20', PADDING.left + 28, PADDING.top + 13);

      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(PADDING.left + 75, PADDING.top + 8, 16, 3);
      ctx.fillStyle = '#d1d5db';
      ctx.fillText('MA50', PADDING.left + 95, PADDING.top + 13);

      ctx.fillStyle = '#e879f9';
      ctx.fillRect(PADDING.left + 140, PADDING.top + 8, 16, 3);
      ctx.fillStyle = '#d1d5db';
      ctx.fillText('DEMA20', PADDING.left + 160, PADDING.top + 13);

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(PADDING.left + 215, PADDING.top + 8, 16, 3);
      ctx.fillStyle = '#d1d5db';
      ctx.fillText('SuperTrend', PADDING.left + 235, PADDING.top + 13);

      // ── Volume bars ────────────────────────────────────────────────────────
      const volBaseY = PADDING.top + PRICE_H + 10 + VOL_H;
      for (let i = 0; i < n; i++) {
        const c = data[i];
        const x = PADDING.left + i * gap + gap * 0.2;
        const barH = (c.volume / volMax) * VOL_H;
        ctx.fillStyle = c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
        ctx.fillRect(x, volBaseY - barH, candleW, barH);
      }

      // ── RSI Plot ───────────────────────────────────────────────────────────
      const rsiBaseY = HEIGHT - PADDING.bottom;
      const toY_Rsi = (val: number) => rsiBaseY - (val / 100) * RSI_H;

      // RSI Grid (30, 50, 70)
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.setLineDash([5, 5]);
      [30, 50, 70].forEach(level => {
        const y = toY_Rsi(level);
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(PADDING.left + CHART_W, y);
        ctx.stroke();
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px sans-serif';
        ctx.fillText(level.toString(), PADDING.left - 15, y + 3);
      });
      ctx.setLineDash([]);

      // RSI Overbought/Oversold shading
      ctx.fillStyle = 'rgba(129, 140, 248, 0.05)';
      ctx.fillRect(PADDING.left, toY_Rsi(70), CHART_W, toY_Rsi(30) - toY_Rsi(70));

      // RSI Line
      this.drawLine(ctx, rsi, gap, candleW, (v) => toY_Rsi(v), '#818cf8', 1.5);

      // RSI Title
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`RSI(14): ${indicators.rsi?.toFixed(1) ?? 'N/A'}`, PADDING.left + 5, rsiBaseY - RSI_H + 12);

      // ── X-axis labels (date) ───────────────────────────────────────────────
      ctx.fillStyle = '#6b7280';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      const labelStep = Math.max(1, Math.floor(n / 8));
      for (let i = 0; i < n; i += labelStep) {
        const date = new Date(data[i].time);
        const label = `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
        const x = PADDING.left + i * gap + gap / 2;
        ctx.fillText(label, x, HEIGHT - 10);
      }

      return canvas.toBuffer('image/png');
    } catch (err) {
      log.error('ChartService: chart generation failed', { symbol, error: (err as Error).message });
      return null;
    }
  }

  /** Draw SuperTrend line with color switching */
  private static drawSuperTrend(
    ctx: SKRSContext2D,
    series: ({ superTrend: number | null, superTrendDirection: 'up' | 'down' | null } | null)[],
    gap: number,
    candleW: number,
    toY: (v: number) => number
  ): void {
    ctx.lineWidth = 2;
    
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const curr = series[i];
      if (!prev || !curr || prev.superTrend === null || curr.superTrend === null) continue;

      ctx.strokeStyle = curr.superTrendDirection === 'up' ? '#22c55e' : '#ef4444';
      
      const x1 = PADDING.left + (i - 1) * gap + candleW / 2 + gap * 0.2;
      const x2 = PADDING.left + i * gap + candleW / 2 + gap * 0.2;
      
      ctx.beginPath();
      ctx.moveTo(x1, toY(prev.superTrend));
      ctx.lineTo(x2, toY(curr.superTrend));
      ctx.stroke();
    }
  }

  /** Draw a line series (with null gaps). */
  private static drawLine(
    ctx: SKRSContext2D,
    values: (number | null)[],
    gap: number,
    candleW: number,
    toY: (v: number) => number,
    color: string,
    width: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null) { started = false; continue; }
      const x = PADDING.left + i * gap + candleW / 2 + gap * 0.2;
      if (!started) { ctx.moveTo(x, toY(v)); started = true; }
      else ctx.lineTo(x, toY(v));
    }
    ctx.stroke();
  }

  /** Format price for axis labels. */
  private static formatPrice(price: number): string {
    if (price >= 10000) return `$${(price / 1000).toFixed(1)}k`;
    if (price >= 1000) return `$${price.toFixed(0)}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  }

  /**
   * Generate TradingView chart link as supplement.
   */
  static getTradingViewLink(symbol: string): string {
    const upper = symbol.toUpperCase();
    
    // Handle Indonesian Stocks (.JK)
    if (upper.endsWith('.JK')) {
      const stockSymbol = upper.replace('.JK', '');
      return `https://www.tradingview.com/chart/?symbol=IDX:${stockSymbol}`;
    }

    // Handle Crypto (Binance)
    const cryptoExchanges = ['USDT', 'BTC', 'ETH', 'BUSD', 'BNB'];
    const isExplicitCrypto = cryptoExchanges.some(ex => upper.endsWith(ex));
    
    // Common crypto coins without pair
    const commonCoins = ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'XRP', 'DOT', 'DOGE'];
    
    if (isExplicitCrypto) {
      return `https://www.tradingview.com/chart/?symbol=BINANCE:${upper}`;
    }
    
    if (commonCoins.includes(upper)) {
      return `https://www.tradingview.com/chart/?symbol=BINANCE:${upper}USDT`;
    }

    return `https://www.tradingview.com/chart/?symbol=${upper}`;
  }
}
