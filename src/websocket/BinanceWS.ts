// ─────────────────────────────────────────────────────────────────────────────
// BinanceWS: Manages WebSocket connections to Binance stream API.
// Subscribes to trade streams for real-time price updates.
// Features auto-reconnect with exponential backoff.
// ─────────────────────────────────────────────────────────────────────────────

import WebSocket from 'ws';
import { config } from '../config';
import { cacheSet, cacheKeys, TTL } from '../cache/redis';
import { log } from '../utils/logger';
import { sleep } from '../utils/retry';
import { HttpsProxyAgent } from 'https-proxy-agent';

type PriceUpdateCallback = (symbol: string, price: number, volume: number) => void;

interface SubscribedStream {
  symbol: string;
  callbacks: PriceUpdateCallback[];
}

export class BinanceWS {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, PriceUpdateCallback[]>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private baseReconnectDelayMs = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private streamUrl = '';

  /**
   * Subscribe to real-time price updates for a symbol (e.g. "BTCUSDT").
   */
  subscribe(symbol: string, callback: PriceUpdateCallback): void {
    const upper = symbol.toUpperCase();
    const existing = this.subscriptions.get(upper) ?? [];
    this.subscriptions.set(upper, [...existing, callback]);
    log.info(`BinanceWS: subscribed to ${upper} (${this.subscriptions.size} total streams)`);
  }

  /**
   * Unsubscribe from a symbol.
   */
  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol.toUpperCase());
  }

  /**
   * Connect (or reconnect) to the Binance combined stream.
   */
  connect(): void {
    if (this.subscriptions.size === 0) {
      log.info('BinanceWS: no subscriptions, skipping connection');
      return;
    }

    const streams = Array.from(this.subscriptions.keys())
      .map((s) => `${s.toLowerCase()}@aggTrade`)
      .join('/');

    this.streamUrl = `${config.apis.binanceWsUrl}/stream?streams=${streams}`;
    this.openConnection();
  }

  private openConnection(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.terminate();
        }
      } catch (err) {
        // Ignore termination errors
      }
      this.ws = null;
    }

    log.info('BinanceWS: connecting...', { url: this.streamUrl, streams: this.subscriptions.size });
    
    const agent = config.apis.proxyUrl ? new HttpsProxyAgent(config.apis.proxyUrl) : undefined;
    this.ws = new WebSocket(this.streamUrl, { agent });

    this.ws.on('open', () => {
      log.info('BinanceWS: connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startPing();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      log.error('BinanceWS: error', { error: err.message });
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.stopPing();
      log.warn('BinanceWS: disconnected', { code, reason: reason.toString() });
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      const data = msg.data ?? msg;

      if (data.e !== 'aggTrade') return;

      const symbol: string = data.s; // e.g. BTCUSDT
      const price: number = parseFloat(data.p);
      const quantity: number = parseFloat(data.q);

      // Update Redis cache with live price
      cacheSet(cacheKeys.price(symbol), {
        symbol,
        price,
        change24h: 0, // aggTrade doesn't include 24h change
        volume24h: 0,
        timestamp: Date.now(),
      }, TTL.PRICE_CRYPTO).catch(() => {});

      // Fire registered callbacks
      const callbacks = this.subscriptions.get(symbol) ?? [];
      callbacks.forEach((cb) => {
        try { cb(symbol, price, quantity); } catch {}
      });
    } catch {
      // Ignore malformed messages
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('BinanceWS: max reconnect attempts reached, giving up');
      return;
    }

    const delay = Math.min(this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    log.info(`BinanceWS: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await sleep(delay);
    this.openConnection();
  }

  private reconnect(): void {
    if (this.subscriptions.size > 0) {
      this.connect();
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 20000); // Ping every 20s to keep connection alive
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Gracefully close the connection.
   */
  close(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    this.isConnected = false;
  }
}

// Singleton instance
export const binanceWS = new BinanceWS();
