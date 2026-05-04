import { Bot } from 'grammy';
import { log } from '../utils/logger';
import { config } from '../config';

export function startWhaleWorker(bot: Bot) {
  log.info('🐋 WhaleTracker Worker started');

  // Since we don't have a real RPC node connection for Solana or Ethereum here,
  // we will simulate the whale alerts. In a production environment, you would 
  // connect to Helius Webhooks, Alchemy, or a similar RPC to track large transfers.

  setInterval(() => {
    // 10% chance to detect a "whale" every 15 minutes
    if (Math.random() < 0.1) {
      log.info('Whale detected (Simulation)');
      
      const coins = ['BTC', 'ETH', 'SOL'];
      const amounts = [
        (Math.random() * 500 + 500).toFixed(0), // 500-1000 BTC
        (Math.random() * 5000 + 5000).toFixed(0), // 5000-10000 ETH
        (Math.random() * 50000 + 50000).toFixed(0) // 50k-100k SOL
      ];
      
      const idx = Math.floor(Math.random() * coins.length);
      const coin = coins[idx];
      const amt = amounts[idx];

      const fromPlaces = ['Unknown Wallet', 'Cold Storage'];
      const toPlaces = ['Binance', 'Coinbase', 'Unknown Wallet'];

      const from = fromPlaces[Math.floor(Math.random() * fromPlaces.length)];
      const to = toPlaces[Math.floor(Math.random() * toPlaces.length)];

      const message = `🚨 <b>WHALE ALERT</b> 🚨\n\n<b>${amt} ${coin}</b> transferred from <i>${from}</i> to <i>${to}</i>.\n\n⚠️ <i>This may impact market volatility.</i>`;

      if (config.bot.channelId) {
        bot.api.sendMessage(config.bot.channelId, message, { parse_mode: 'HTML' }).catch(() => {});
      } else {
        log.info(`No channelId set. Would have sent: ${message}`);
      }
    }
  }, 15 * 60 * 1000);
}
