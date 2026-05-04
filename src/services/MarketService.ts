import { PriceService } from './PriceService';
import { SignalEngine } from './SignalEngine';
import { log } from '../utils/logger';
import { formatPrice, formatPct } from '../utils/formatter';
import { sendNotification } from '../utils/notifier';
import { Bot } from 'grammy';
import { redis } from '../cache/redis';

export class MarketService {
  // Top assets to monitor for auto-signals
  private static readonly TOP_CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'NEARUSDT'];
  private static readonly TOP_STOCKS_INDO = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'ASII.JK', 'BMRI.JK', 'GOTO.JK'];
  
  /**
   * Scan top markets using SignalEngine and broadcast high-confidence setups.
   */
  static async scanMarkets(bot: Bot): Promise<void> {
    log.info('MarketService: running automated screener...');
    
    const allSymbols = [...this.TOP_CRYPTO, ...this.TOP_STOCKS_INDO];
    
    for (const symbol of allSymbols) {
      try {
        // Generate a fresh signal for moderate profile
        const signal = await SignalEngine.generate(symbol, 'moderate');
        
        // Target high-conviction setups only
        const isStrongSetup = (signal.trend === 'Strong Bullish' || signal.trend === 'Strong Bearish');
        const isHighConfidence = signal.confidence >= 70;

        if (isStrongSetup && isHighConfidence) {
          // Cooldown check (don't alert the same symbol's trend more than once every 6 hours)
          const cdKey = `screener_cd:${symbol}:${signal.trend}`;
          const recentlyAlerted = await redis.get(cdKey);
          
          if (recentlyAlerted) {
            continue; // Skip, already alerted this trend recently
          }

          const direction = signal.trend === 'Strong Bullish' ? '🚀 BUY ALERT' : '📉 SELL ALERT';
          const emoji = signal.trend === 'Strong Bullish' ? '🟢' : '🔴';
          
          const message = [
            `🚨 <b>AUTO-SCREENER VIP SIGNAL</b> 🚨`,
            ``,
            `${direction}: <b>${symbol}</b>`,
            `Trend: ${emoji} <b>${signal.trend}</b> (Conf: ${signal.confidence}%)`,
            `Price: ${formatPrice(signal.price)}`,
            ``,
            `<b>Technical Setup:</b>`,
            ...signal.reasoning.slice(0, 2).map(r => `• ${r}`),
            ``,
            `<i>💡 Ketik /predict ${symbol.replace('USDT', '').replace('.JK', '')} untuk analisis lengkap + AI.</i>`
          ].join('\n');

          // Send to 'system' channel/admin
          await sendNotification(bot, 'system', message, { pin: true });
          
          // Set 6-hour cooldown for this specific symbol+trend combination
          await redis.setex(cdKey, 21600, 'alerted');
          log.info('Screener alert broadcasted', { symbol, trend: signal.trend });
        }
        
        // Small delay to prevent API rate limits
        await new Promise(r => setTimeout(r, 2000));
        
      } catch (err) {
        log.warn('MarketService: failed to screen symbol', { symbol, error: (err as Error).message });
      }
    }
  }
}
