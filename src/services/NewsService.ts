// ─────────────────────────────────────────────────────────────────────────────
// NewsService: Orchestrates the Smart News Data Strategy (RSS -> API -> Scraper).
// User commands MUST NOT fetch news directly, they read from DB.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { config } from '../config';
import { db } from '../db';
import { scoreText, hashContent } from '../utils/sentiment';
import { log } from '../utils/logger';
import { NewsItem, SentimentLabel } from '../types';
import { PriceService } from './PriceService';
import { RssService } from './RssService';
import { ScraperService } from './ScraperService';

export class NewsService {
  /**
   * User commands call this. Always reads from DB/Cache.
   */
  static async getNews(symbol: string, limit = 10): Promise<NewsItem[]> {
    return this.getCachedNews(symbol, limit);
  }

  /**
   * Fetch raw news via Smart Strategy fallback: RSS -> API -> Scraper.
   * Called ONLY by background workers.
   */
  static async fetchRawNews(symbol: string): Promise<Partial<NewsItem>[]> {
    const type = PriceService.detectAssetType(symbol);
    let items: Partial<NewsItem>[] = [];

    // 1. RSS Feeds (Preferred)
    const rssType = type === 'crypto' ? 'crypto' : 'stock';
    items = await RssService.fetchNews(rssType);
    if (items.length > 0) return items;

    // 2. API (CryptoPanic / NewsAPI)
    if (type === 'crypto' && config.apis.cryptoPanicKey) {
      items = await this.fetchCryptoPanicNews(symbol);
      if (items.length > 0) return items;
    } else if (config.apis.newsApiKey) {
      items = await this.fetchNewsApi(symbol);
      if (items.length > 0) return items;
    }

    // 3. Scraper (HTTP -> Playwright)
    // We construct a default URL to scrape based on symbol
    const scrapeUrl = type === 'crypto' 
      ? `https://cointelegraph.com/tags/${symbol.toLowerCase().replace('usdt', '')}` 
      : `https://finance.yahoo.com/quote/${symbol}/news`;

    const selectors = type === 'crypto'
      ? { container: '.post-card-inline', title: '.post-card-inline__title', link: 'a', summary: '.post-card-inline__text', date: 'time' }
      : { container: '#quoteNewsStream-0-Stream li', title: 'h3', link: 'a', summary: 'p', date: 'time' };

    items = await ScraperService.scrapeNews(scrapeUrl, selectors);
    return items;
  }

  private static async fetchCryptoPanicNews(symbol: string): Promise<Partial<NewsItem>[]> {
    const currency = symbol.toUpperCase().replace('USDT', '').replace('BTC', '').replace('ETH', '');
    try {
      const res = await axios.get(`${config.apis.cryptoPanicUrl}/posts/`, {
        params: { auth_token: config.apis.cryptoPanicKey, currencies: currency, filter: 'hot', public: true },
        timeout: 8000,
      });
      return (res.data?.results ?? []).slice(0, 20).map((post: any) => ({
        title: post.title,
        url: post.url,
        source: post.domain ?? 'CryptoPanic',
        publishedAt: new Date(post.published_at),
      }));
    } catch (err) {
      log.warn('CryptoPanic fetch failed', { error: (err as Error).message });
      return [];
    }
  }

  private static async fetchNewsApi(symbol: string): Promise<Partial<NewsItem>[]> {
    const query = symbol.toUpperCase().replace('USDT', '').replace('USD', '');
    try {
      const res = await axios.get(`${config.apis.newsApiUrl}/everything`, {
        params: { q: query, language: 'en', sortBy: 'publishedAt', pageSize: 20, apiKey: config.apis.newsApiKey },
        timeout: 8000,
      });
      return (res.data?.articles ?? []).slice(0, 20).map((article: any) => ({
        title: article.title ?? '',
        url: article.url ?? '',
        source: article.source?.name ?? 'NewsAPI',
        publishedAt: new Date(article.publishedAt),
        summary: article.description ?? '',
      }));
    } catch (err) {
      log.warn('NewsAPI fetch failed', { error: (err as Error).message });
      return [];
    }
  }

  /**
   * Persist news items to the DB (upsert by hash for dedup).
   */
  static async persistToDb(symbol: string, items: NewsItem[]): Promise<void> {
    if (items.length === 0) return;

    const rows = items.map((item) => ({
      symbol: symbol.toUpperCase(),
      source: item.source,
      title: item.title,
      url: item.url,
      summary: item.summary,
      impact: item.impact,
      sentiment: item.sentiment,
      sentiment_score: item.sentimentScore,
      published_at: item.publishedAt,
      hash: hashContent(item.title, item.url),
    }));

    await db('news_cache').insert(rows).onConflict('hash').ignore();
  }

  /**
   * Get aggregate sentiment label from recent news.
   */
  static async getAggregateSentiment(symbol: string): Promise<SentimentLabel> {
    const items = await this.getCachedNews(symbol, 10);
    if (items.length === 0) return 'neutral';

    const avgScore = items.reduce((sum, i) => sum + i.sentimentScore, 0) / items.length;
    if (avgScore > 0.1) return 'positive';
    if (avgScore < -0.1) return 'negative';
    return 'neutral';
  }

  /**
   * Get cached news from DB for a symbol.
   */
  static async getCachedNews(symbol: string, limit = 10): Promise<NewsItem[]> {
    const rows = await db('news_cache')
      .where('symbol', symbol.toUpperCase())
      .orderBy('published_at', 'desc')
      .limit(limit);

    return rows.map((r) => ({
      title: r.title,
      url: r.url,
      source: r.source,
      summary: r.summary,
      impact: r.impact,
      sentiment: r.sentiment as SentimentLabel,
      sentimentScore: parseFloat(r.sentiment_score),
      publishedAt: new Date(r.published_at),
    }));
  }
}
