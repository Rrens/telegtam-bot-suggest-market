// ─────────────────────────────────────────────────────────────────────────────
// ScraperService: Handles HTTP & Headless Browser Scraping for news.
// Implements fallback logic, anti-blocking measures, and deduplication extraction.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import UserAgent from 'user-agents';
import { log } from '../utils/logger';
import { sleep } from '../utils/retry';
import { NewsItem } from '../types';

export class ScraperService {
  private static browser: Browser | null = null;
  private static browserPromise: Promise<Browser> | null = null;

  /**
   * Main entry point for scraping. Tries Axios+Cheerio first.
   * If it fails or returns no useful data, falls back to Playwright.
   */
  static async scrapeNews(url: string, selectorConfig: Record<string, string>): Promise<Partial<NewsItem>[]> {
    try {
      // 1. Try Fast HTTP Scraping
      const httpResults = await this.scrapeHttp(url, selectorConfig);
      if (httpResults.length > 0) {
        return httpResults;
      }
    } catch (err) {
      log.warn(`ScraperService: HTTP scraping failed for ${url}, falling back to Headless Browser.`, { error: (err as Error).message });
    }

    // 2. Fallback to Headless Browser
    try {
      return await this.scrapeHeadless(url, selectorConfig);
    } catch (err) {
      log.error(`ScraperService: Headless scraping failed for ${url}`, { error: (err as Error).message });
      return [];
    }
  }

  /**
   * Fast HTTP Scraping using Axios and Cheerio.
   */
  private static async scrapeHttp(url: string, selectors: Record<string, string>): Promise<Partial<NewsItem>[]> {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
    
    // Anti-blocking: Random delay 1-3 seconds
    await sleep(1000 + Math.random() * 2000);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    return this.extractData($, selectors, url);
  }

  /**
   * Headless Browser Scraping using Playwright.
   */
  private static async scrapeHeadless(url: string, selectors: Record<string, string>): Promise<Partial<NewsItem>[]> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: new UserAgent({ deviceCategory: 'desktop' }).toString(),
    });
    
    const page = await context.newPage();

    // Optimize: block images and fonts
    await page.route('**/*.{png,jpg,jpeg,gif,woff,woff2,ttf,svg}', route => route.abort());

    try {
      // Anti-blocking: Random delay 2-5 seconds
      await sleep(2000 + Math.random() * 3000);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const html = await page.content();
      const $ = cheerio.load(html);
      
      return this.extractData($, selectors, url);
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Extract data using Cheerio and provided CSS selectors.
   */
  private static extractData($: cheerio.CheerioAPI, selectors: Record<string, string>, baseUrl: string): Partial<NewsItem>[] {
    const items: Partial<NewsItem>[] = [];
    const containerSelector = selectors.container || 'article';

    $(containerSelector).each((_, el) => {
      const title = $(el).find(selectors.title).text().trim();
      const rawUrl = $(el).find(selectors.link).attr('href');
      const summary = $(el).find(selectors.summary).text().trim() || undefined;
      const rawDate = $(el).find(selectors.date).attr('datetime') || $(el).find(selectors.date).text().trim();

      if (!title || !rawUrl) return;

      // Resolve relative URLs
      const link = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).href;

      let publishedAt: Date;
      try {
        publishedAt = rawDate ? new Date(rawDate) : new Date();
      } catch {
        publishedAt = new Date();
      }

      items.push({
        title,
        url: link,
        publishedAt,
        summary,
        source: new URL(baseUrl).hostname,
      });
    });

    return items;
  }

  /**
   * Singleton browser instance.
   */
  private static async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.browserPromise) return this.browserPromise;

    this.browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).then(b => {
      this.browser = b;
      return b;
    });

    return this.browserPromise;
  }

  /**
   * Graceful shutdown for the browser.
   */
  static async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.browserPromise = null;
    }
  }
}
