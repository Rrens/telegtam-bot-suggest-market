import { db } from '../db';
import { log } from '../utils/logger';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
}

class FeatureFlagService {
  private cache: Map<string, boolean> = new Map();
  private lastUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  async init(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    try {
      const flags = await db('feature_flags').select('key', 'enabled');
      this.cache.clear();
      for (const flag of flags) {
        this.cache.set(flag.key, flag.enabled);
      }
      this.lastUpdate = Date.now();
      log.info('Feature flags cache refreshed', { count: flags.length });
    } catch (err) {
      log.error('Failed to refresh feature flags cache', { error: (err as Error).message });
    }
  }

  async isEnabled(key: string): Promise<boolean> {
    // If cache is old, refresh it (non-blocking)
    if (Date.now() - this.lastUpdate > this.CACHE_TTL) {
      this.refreshCache().catch(() => {});
    }

    // Return from cache if exists, otherwise default to true (to avoid breaking things)
    return this.cache.get(key) ?? true;
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    return db('feature_flags').select('*').orderBy('key', 'asc');
  }

  async updateFlag(key: string, enabled: boolean): Promise<void> {
    await db('feature_flags')
      .where({ key })
      .update({ 
        enabled, 
        updated_at: db.fn.now() 
      });
    
    // Update cache immediately
    this.cache.set(key, enabled);
    log.info('Feature flag updated', { key, enabled });
  }
}

export const featureFlagService = new FeatureFlagService();
