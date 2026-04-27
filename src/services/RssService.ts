// ─────────────────────────────────────────────────────────────────────────────
// RssService: Fetches and parses RSS feeds for Crypto and Stocks.
// ─────────────────────────────────────────────────────────────────────────────

import Parser from 'rss-parser';
import { log } from '../utils/logger';
import { NewsItem } from '../types';

export class RssService {
  private static parser = new Parser({
    customFields: {
      item: ['description', 'pubDate'],
    },
  });

  // Default feeds
  private static feeds = {
    crypto: [
      'https://cointelegraph.com/rss',
      'https://www.coindesk.com/arc/outboundfeeds/rss/'
    ],
    stock: [
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,AAPL,MSFT', // Yahoo Finance broad market
      'https://www.cnbc.com/id/10000664/device/rss/rss.html' // CNBC Finance
    ]
  };

  /**
   * Fetch news from a list of RSS feeds based on market type.
   */
  static async fetchNews(market: 'crypto' | 'stock'): Promise<Partial<NewsItem>[]> {
    const urls = this.feeds[market];
    const allItems: Partial<NewsItem>[] = [];

    for (const url of urls) {
      try {
        const feed = await this.parser.parseURL(url);
        
        for (const item of feed.items) {
          if (!item.title || !item.link) continue;

          allItems.push({
            title: item.title,
            url: item.link,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            summary: item.contentSnippet || item.description,
            source: new URL(url).hostname,
          });
        }
      } catch (err) {
        log.warn(`RssService: Failed to parse feed ${url}`, { error: (err as Error).message });
      }
    }

    return allItems;
  }
}
