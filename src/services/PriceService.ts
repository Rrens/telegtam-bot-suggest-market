// ─────────────────────────────────────────────────────────────────────────────
// PriceService: Fetches current prices and OHLCV candle data.
// Sources: Binance (crypto), Yahoo Finance (stocks/forex), CoinGecko (fallback).
// All results are cached in Redis to respect rate limits.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { config } from '../config';
import { cacheGet, cacheSet, cacheKeys, TTL } from '../cache/redis';
import { withRetry } from '../utils/retry';
import { log } from '../utils/logger';
import { PriceData, OHLCVCandle, AssetType } from '../types';
import { HttpsProxyAgent } from 'https-proxy-agent';

const axiosInstance = axios.create({
  httpsAgent: config.apis.proxyUrl ? new HttpsProxyAgent(config.apis.proxyUrl) : undefined,
  proxy: false, // disable axios built-in proxy as we use agent
});

export class PriceService {
  /**
   * Detect asset type from symbol string.
   * Symbols ending in USDT/BTC/ETH → crypto
   * Symbols like EURUSD, GBPUSD → forex
   * Otherwise → stock
   */
  static detectAssetType(symbol: string): AssetType {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('.JK')) return 'stock';
    if (
      upper.endsWith('USDT') ||
      upper.endsWith('BTC') ||
      upper.endsWith('ETH') ||
      upper.endsWith('BUSD') ||
      upper.endsWith('USDC')
    ) return 'crypto';
    if (upper.length === 6 && /^[A-Z]{6}$/.test(upper)) return 'forex';
    return 'stock';
  }

  /**
   * Get current price data. Returns cached data if fresh.
   */
  static async getPrice(symbol: string): Promise<PriceData> {
    const type = this.detectAssetType(symbol);
    const cacheKey = cacheKeys.price(symbol);
    const ttl = type === 'crypto' ? TTL.PRICE_CRYPTO : TTL.PRICE_STOCK;

    const cached = await cacheGet<PriceData>(cacheKey);
    if (cached) return cached;

    let data: PriceData;
    if (type === 'crypto' && config.apis.binanceEnabled) {
      const binanceSymbol = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
      try {
        data = await withRetry(() => this.fetchCryptoPriceBinance(binanceSymbol));
        // Keep original symbol for consistency if requested
        data.symbol = symbol.toUpperCase();
      } catch (err) {
        log.warn(`Binance fetch failed for ${binanceSymbol}, trying Yahoo fallback`, { error: (err as Error).message });
        const yahooSymbol = symbol.toUpperCase().includes('-') ? symbol.toUpperCase() : `${symbol.toUpperCase().replace('USDT', '')}-USD`;
        data = await withRetry(() => this.fetchYahooPrice(yahooSymbol));
        data.symbol = symbol.toUpperCase();
      }
    } else {
      data = await withRetry(() => this.fetchYahooPrice(symbol));
    }

    await cacheSet(cacheKey, data, ttl);
    return data;
  }

  /**
   * Fetch crypto price from Binance REST API.
   * Binance symbol example: BTCUSDT
   */
  private static async fetchCryptoPriceBinance(symbol: string): Promise<PriceData> {
    const upper = symbol.toUpperCase();

    try {
      const [tickerRes, statsRes] = await Promise.all([
        axiosInstance.get(`${config.apis.binanceRestUrl}/ticker/price`, { params: { symbol: upper }, timeout: 30000 }),
        axiosInstance.get(`${config.apis.binanceRestUrl}/ticker/24hr`, { params: { symbol: upper }, timeout: 30000 }),
      ]);

      const price = parseFloat(tickerRes.data.price);
      const stats = statsRes.data;

      return {
        symbol: upper,
        price,
        change24h: parseFloat(stats.priceChangePercent),
        volume24h: parseFloat(stats.quoteVolume),
        high24h: parseFloat(stats.highPrice),
        low24h: parseFloat(stats.lowPrice),
        timestamp: Date.now(),
      };
    } catch (err) {
      log.warn('Binance price fetch failed, falling back to CoinGecko', { symbol, error: (err as Error).message });
      return this.fetchCoinGeckoPrice(symbol);
    }
  }

  /**
   * Fetch crypto price from CoinGecko (fallback).
   */
  private static async fetchCoinGeckoPrice(symbol: string): Promise<PriceData> {
    // Convert BTCUSDT → bitcoin, ETHUSDT → ethereum, etc.
    const coinId = this.symbolToCoinGeckoId(symbol);
    const res = await axiosInstance.get(`${config.apis.coingeckoUrl}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        ids: coinId,
        order: 'market_cap_desc',
        per_page: 1,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h',
      },
      timeout: 30000,
    });

    if (!res.data || res.data.length === 0) {
      throw new Error(`CoinGecko: no data for ${symbol}`);
    }

    const coin = res.data[0];
    return {
      symbol: symbol.toUpperCase(),
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h ?? 0,
      volume24h: coin.total_volume ?? 0,
      marketCap: coin.market_cap,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      timestamp: Date.now(),
    };
  }

  /**
   * Fetch stock/forex price from Yahoo Finance.
   */
  private static async fetchYahooPrice(symbol: string): Promise<PriceData> {
    const res = await axiosInstance.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?interval=1m&range=1d`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const meta = res.data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error(`Yahoo Finance: No data for ${symbol}`);

    return {
      symbol: symbol.toUpperCase(),
      price: meta.regularMarketPrice ?? 0,
      change24h: 0, // Chart meta doesn't always have 24h change directly
      volume24h: meta.regularMarketVolume ?? 0,
      high24h: meta.regularMarketDayHigh,
      low24h: meta.regularMarketDayLow,
      marketCap: 0, 
      timestamp: Date.now(),
    };
  }

  private static cachedUsdIdrRate = 16000;
  private static lastRateFetch = 0;

  /**
   * Get real-time USD/IDR exchange rate.
   */
  static async getUsdIdrRate(): Promise<number> {
    const now = Date.now();
    // Cache for 1 hour
    if (this.lastRateFetch > 0 && now - this.lastRateFetch < 3600000) {
      return this.cachedUsdIdrRate;
    }

    try {
      const data = await this.fetchYahooPrice('USDIDR=X');
      if (data.price > 10000) {
        this.cachedUsdIdrRate = data.price;
        this.lastRateFetch = now;
        log.info(`Updated USD/IDR rate: ${this.cachedUsdIdrRate}`);
      }
    } catch (err) {
      log.warn('Failed to fetch real-time USD/IDR rate, using fallback', { error: (err as Error).message });
    }
    return this.cachedUsdIdrRate;
  }

  /**
   * Synchronous getter for the last known rate.
   */
  static getLastUsdIdrRate(): number {
    return this.cachedUsdIdrRate;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OHLCV Candle Data
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Fetch OHLCV candles for TA calculations.
   * @param symbol  e.g. BTCUSDT or AAPL
   * @param interval  Binance interval string: '1m', '5m', '15m', '1h', '4h', '1d'
   * @param limit  Number of candles (default 200)
   */
  static async getOHLCV(symbol: string, interval = '1d', limit = 200): Promise<OHLCVCandle[]> {
    const type = this.detectAssetType(symbol);
    const cacheKey = cacheKeys.ohlcv(symbol, interval);

    const cached = await cacheGet<OHLCVCandle[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    let candles: OHLCVCandle[];
    if (type === 'crypto' && config.apis.binanceEnabled) {
      candles = await withRetry(() => this.fetchBinanceKlines(symbol.toUpperCase(), interval, limit));
    } else {
      candles = await withRetry(() => this.fetchYahooOHLCV(symbol, limit, interval));
    }

    await cacheSet(cacheKey, candles, TTL.OHLCV);
    return candles;
  }

  /**
   * Binance klines (candlestick) data.
   */
  private static async fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<OHLCVCandle[]> {
    const res = await axiosInstance.get(`${config.apis.binanceRestUrl}/klines`, {
      params: { symbol, interval, limit },
      timeout: 30000,
    });

    return (res.data as any[]).map((k: any) => ({
      time: k[0],           // open time ms
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * Yahoo Finance historical OHLCV (stocks/forex/crypto).
   */
  private static async fetchYahooOHLCV(symbol: string, limit: number, interval = '1d'): Promise<OHLCVCandle[]> {
    let yahooSymbol = symbol.toUpperCase();
    
    // Convert crypto BTCUSDT -> BTC-USD for Yahoo
    if (this.detectAssetType(symbol) === 'crypto') {
      yahooSymbol = yahooSymbol.replace('USDT', '-USD');
      if (!yahooSymbol.includes('-')) yahooSymbol += '-USD';
    }

    // Map Binance intervals to Yahoo intervals
    // Yahoo intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
    let yInterval = interval;
    if (interval === '1h') yInterval = '1h';
    if (interval === '4h') yInterval = '1h'; // Yahoo doesn't have 4h, use 1h as best effort
    if (interval === '1d') yInterval = '1d';

    const range = yInterval === '1d' ? '1y' : '7d';

    const res = await axiosInstance.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo Finance Chart: No data for ${yahooSymbol}`);

    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    if (!timestamps || !quotes) return [];

    return timestamps
      .map((t: number, i: number) => ({
        time: t * 1000,
        open: quotes.open[i] ?? 0,
        high: quotes.high[i] ?? 0,
        low: quotes.low[i] ?? 0,
        close: quotes.close[i] ?? 0,
        volume: quotes.volume[i] ?? 0,
      }))
      .filter((c: any) => c.close > 0)
      .slice(-limit);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Map common Binance symbols to CoinGecko IDs.
   */
  static symbolToCoinGeckoId(symbol: string): string {
    let base = symbol.toUpperCase();
    
    // Only strip the suffix if it's a pair (e.g., BTCUSDT -> BTC)
    const suffixes = ['USDT', 'BUSD', 'USDC', 'TUSD', 'UST'];
    for (const suffix of suffixes) {
      if (base.endsWith(suffix) && base.length > suffix.length) {
        base = base.substring(0, base.length - suffix.length);
        break;
      }
    }

    const mapping: Record<string, string> = {
      BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
      SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
      AVAX: 'avalanche-2', DOT: 'polkadot', MATIC: 'matic-network',
      LINK: 'chainlink', UNI: 'uniswap', LTC: 'litecoin',
      DOGE: 'dogecoin', SHIB: 'shiba-inu', TRX: 'tron',
      ATOM: 'cosmos', NEAR: 'near', APT: 'aptos',
      OP: 'optimism', ARB: 'arbitrum',
    };
    return mapping[base] ?? base.toLowerCase();
  }

  /**
   * Normalize symbol for Binance (ensure USDT suffix for crypto).
   */
  static normalizeCryptoSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('USDT') || upper.endsWith('BTC') || upper.endsWith('ETH')) return upper;
    return `${upper}USDT`;
  }
}
