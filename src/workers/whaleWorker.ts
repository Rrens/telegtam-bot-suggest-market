// ─────────────────────────────────────────────────────────────────────────────
// whaleWorker (upgraded): Real Whale Alert API integration with simulation fallback.
// Uses https://api.whale-alert.io/v1/transactions (free tier: 1 req/min, >$500K)
// Set WHALE_ALERT_API_KEY in .env for real data; falls back to simulation if not set.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { Bot } from 'grammy';
import { redis } from '../cache/redis';
import { log } from '../utils/logger';
import { config } from '../config';

const INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const BTC_WHALE_THRESHOLD = 50;    // Alert if > 50 BTC (approx $3.5M+)

export function startWhaleWorker(bot: Bot) {
  log.info('🐋 WhaleTracker (Truly Free) Started');

  setInterval(async () => {
    try {
      // 1. Check Real BTC Whales (Public API via Blockchain.info)
      await checkBtcWhales(bot);
      
      // 2. Check High Volume Activity (Whale indicator via DexScreener)
      await checkVolumeWhales(bot);
    } catch (err) {
      log.error('WhaleWorker cycle failed', { error: (err as Error).message });
    }
  }, INTERVAL_MS);
}

/**
 * BTC Whale Tracker using public blockchain.info API (No Key)
 */
async function checkBtcWhales(bot: Bot): Promise<void> {
  try {
    const res = await axios.get('https://blockchain.info/unconfirmed-transactions?format=json', { timeout: 15000 });
    const txs = res.data?.txs ?? [];

    for (const tx of txs) {
      const totalSatoshis = tx.out.reduce((sum: number, out: any) => sum + (out.value || 0), 0);
      const btcAmount = totalSatoshis / 100_000_000;

      if (btcAmount >= BTC_WHALE_THRESHOLD) {
        const cdKey = `whale_btc:${tx.hash}`;
        const alreadySent = await redis.get(cdKey);
        if (alreadySent) continue;

        const message = [
          `🐋 <b>BTC WHALE MOVEMENT</b> 🐋`,
          ``,
          `Transaksi raksasa terdeteksi di Blockchain Bitcoin!`,
          ``,
          `💰 Amount: <b>${btcAmount.toFixed(2)} BTC</b>`,
          `💵 Value: <b>~$${(btcAmount * 95000).toLocaleString()}</b>`,
          ``,
          `🔍 <b>Arkham:</b> <a href="https://platform.arkhamintelligence.com/explorer/tx/${tx.hash}">View on Arkham</a>`,
          `🔗 <b>Explorer:</b> <a href="https://www.blockchain.com/btc/tx/${tx.hash}">Blockchain.com</a>`,
          ``,
          `⚠️ <i>Pergerakan besar di mempool sering mendahului volatilitas harga.</i>`,
        ].join('\n');

        await sendWhaleAlert(bot, message);
        await redis.setex(cdKey, 3600, '1'); // 1 hour cooldown
        break; // One alert per cycle
      }
    }
  } catch (err) {
    log.warn('BTC Whale check failed', { error: (err as Error).message });
  }
}

/**
 * High Volume Alert using DexScreener Public API (No Key)
 */
async function checkVolumeWhales(bot: Bot): Promise<void> {
  const symbols = ['SOL', 'ETH', 'BNB'];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];

  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${symbol}`, { timeout: 10000 });
    const pairs = res.data?.pairs ?? [];
    if (pairs.length === 0) return;

    const mainPair = pairs[0];
    const vol24h = parseFloat(mainPair.volume?.h24 ?? '0');
    
    if (vol24h > 100_000_000) { // $100M threshold
      const cdKey = `vol_whale:${symbol}`;
      const alreadySent = await redis.get(cdKey);
      if (alreadySent) return;

      const message = [
        `📊 <b>HIGH VOLUME ALERT (WHALE)</b>`,
        ``,
        `Aktivitas perdagangan raksasa terdeteksi pada <b>${symbol}</b>`,
        ``,
        `💰 Volume 24h: <b>$${(vol24h / 1_000_000).toFixed(2)}M</b>`,
        `📈 Price: <b>$${mainPair.priceUsd}</b>`,
        `📉 Change 24h: <b>${mainPair.priceChange?.h24}%</b>`,
        ``,
        `💡 Volume besar biasanya mengindikasikan akumulasi atau distribusi oleh institusi/whale.`,
      ].join('\n');

      await sendWhaleAlert(bot, message);
      await redis.setex(cdKey, 14400, '1'); // 4 hour cooldown
    }
  } catch (err) {
    log.warn('Volume Whale check failed', { error: (err as Error).message });
  }
}

async function sendWhaleAlert(bot: Bot, message: string): Promise<void> {
  if (config.bot.channelId) {
    await bot.api.sendMessage(config.bot.channelId, message, { 
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }).catch(() => {});
  }
}
