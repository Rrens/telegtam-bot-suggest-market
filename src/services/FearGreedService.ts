import axios from 'axios';
import { cacheGet, cacheSet, TTL } from '../cache/redis';
import { log } from '../utils/logger';

export interface FearGreedData {
  value: number; // 0-100
  classification: string; // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
  timestamp: number;
}

export class FearGreedService {
  private static CACHE_KEY = 'global:fear_greed';

  static async getIndex(): Promise<FearGreedData | null> {
    const cached = await cacheGet<FearGreedData>(this.CACHE_KEY);
    if (cached) return cached;

    try {
      // Free public API from alternative.me
      const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 10000 });
      if (res.data && res.data.data && res.data.data.length > 0) {
        const item = res.data.data[0];
        const data: FearGreedData = {
          value: parseInt(item.value, 10),
          classification: item.value_classification,
          timestamp: parseInt(item.timestamp, 10) * 1000,
        };

        // Cache for 6 hours (this index updates once a day)
        await cacheSet(this.CACHE_KEY, data, 60 * 60 * 6);
        return data;
      }
    } catch (err) {
      log.warn('Failed to fetch Fear & Greed index', { error: (err as Error).message });
    }

    return null;
  }
}
