import { PriceService } from './PriceService';
import { log } from '../utils/logger';
import { formatPrice, formatPct } from '../utils/formatter';
import { sendNotification } from '../utils/notifier';
import { Bot } from 'grammy';
import { redis } from '../cache/redis';

export class MarketService {
  // Top assets to monitor
  private static readonly TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'LINKUSDT'];
  private static readonly TOP_STOCKS_INDO = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'ASII.JK', 'BMRI.JK', 'GOTO.JK', 'AMRT.JK', 'BBNI.JK'];
  
  private static readonly VOLATILITY_THRESHOLD = 4.5; // Alert if change > 4.5%

  /**
   * Scan top markets and send alerts to channel if significant movement is detected.
   */
  static async scanMarkets(bot: Bot): Promise<void> {
    log.info('MarketService: scanning top markets...');
    
    const allSymbols = [...this.TOP_CRYPTO, ...this.TOP_STOCKS_INDO];
    
    for (const symbol of allSymbols) {
      try {
        const data = await PriceService.getPrice(symbol);
        const change = data.change24h;
        
        // Cooldown check to avoid repeated alerts for the same move (4 hours)
        const cdKey = `market_alert_cd:${symbol}`;
        const lastChange = await redis.get(cdKey);
        
        // If we already alerted on a similar change (within 1%), skip
        if (lastChange && Math.abs(parseFloat(lastChange) - change) < 1.0) {
          continue;
        }

        if (Math.abs(change) >= this.VOLATILITY_THRESHOLD) {
          const direction = change > 0 ? '🚀 MOONING' : '📉 DUMPING';
          const emoji = change > 0 ? '🟢' : '🔴';
          
          const message = [
            `${direction} <b>Market Update: ${symbol}</b>`,
            `--------------------------------------`,
            `Price: <b>${formatPrice(data.price)}</b>`,
            `24h Change: <b>${emoji} ${formatPct(change)}</b>`,
            `--------------------------------------`,
            `<i>Top market monitoring alert</i>`
          ].join('\n');

          await sendNotification(bot, 'system', message, { pin: true });
          
          // Save this change to cooldown for 4 hours
          await redis.setex(cdKey, 14400, change.toString());
          log.info('Market alert broadcasted', { symbol, change });
        }
      } catch (err) {
        log.warn('MarketService: failed to scan symbol', { symbol, error: (err as Error).message });
      }
    }
  }
}
